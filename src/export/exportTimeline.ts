import {
  ALL_FORMATS,
  AudioBufferSink,
  AudioBufferSource,
  BlobSource,
  BufferTarget,
  CanvasSource,
  Input,
  Mp4OutputFormat,
  Output,
  Quality,
  VideoSampleSink,
  getFirstEncodableAudioCodec,
  getFirstEncodableVideoCodec,
} from 'mediabunny'
import type { AudioCodec, InputAudioTrack, InputVideoTrack, VideoCodec, VideoSample } from 'mediabunny'
import { applyAudioEffectNodes } from '../audioEffects.ts'
import { getCssFilter, VIGNETTE, vignetteAlpha } from '../filters.ts'
import { drawOverlays, overlayFrameFromBitmap, pipSourceTime } from '../overlayDraw.ts'
import type { OverlayFrame } from '../overlayDraw.ts'
import { drawTextOverlays } from '../textDraw.ts'
import { loadTitleFonts } from '../textStyle.ts'
import { keyframeTimes } from '../keyframes.ts'
import { clamp, itemLength, locate, timelineDuration, itemStarts } from '../timeline.ts'
import { applyTransformToContext, blendModeToComposite, evaluateTransform, evaluateVolume } from '../transform.ts'
import type { EvaluatedTransform } from '../transform.ts'
import { edgeFadeAt, getEffectiveTransitionDuration, locateTransition, transitionAudioGains, transitionLayerAlpha, transitionVeilAt, wipeDirection, wipeEdge } from '../transitionTimeline.ts'
import type { WipeDirection } from '../transitionTimeline.ts'
import { activeLayersAt, layerSourceTime, videoLayerEnd, videoLayersDuration } from '../videoLayers.ts'
import type { AspectRatio, AudioClip, AudioEffectType, AudioTimelineItem, EdgeFades, Keyframe, MediaClip, OverlayItem, TextOverlay, TimelineItem, Transition, VideoLayerItem } from '../types.ts'
import { outputSizeForAspectRatio, planFrames } from './plan.ts'
import type { Size } from './plan.ts'


export const EXPORT_FPS = 30
const SAMPLE_RATE = 48_000
const CHANNELS = 2
/**
 * Silent samples Chrome's AAC encoder (AudioToolbox on macOS) puts before the audio.
 * Starting the audio track this much before zero makes the MP4 edit list skip them,
 * so sound stays in sync with the picture.
 */
const AAC_PRIMING_SAMPLES = 2112
/** Requested frame times land a hair past a frame's start so float error never picks the previous frame. */
const FRAME_EPSILON = 1e-6
/** Breakpoints this close together collapse into one, so rounding never yields a zero-length span. */
const BREAKPOINT_EPSILON = 1e-6

const VIDEO_CODEC_NAMES: Record<string, string> = { avc: 'H.264', hevc: 'HEVC', vp9: 'VP9', av1: 'AV1' }
const AUDIO_CODEC_NAMES: Record<string, string> = { aac: 'AAC', opus: 'Opus' }

export interface ExportResult {
  blob: Blob
  width: number
  height: number
  /** Seconds. */
  duration: number
  /** Human-readable codecs, e.g. "H.264 + AAC". */
  codecs: string
  /** Things the user should know about this file. */
  notes: string[]
}

export interface ExportOptions {
  signal?: AbortSignal
  /** Called with a stage name and overall progress from 0 to 1. */
  onProgress?: (stage: string, fraction: number) => void
  /** Fades at each end of the whole timeline. */
  edgeFades?: EdgeFades
}

interface OpenVideoClip {
  clip: MediaClip
  input?: Input
  video?: InputVideoTrack
  /** Null when the clip has no audio this browser can decode; it then contributes silence. */
  audio: InputAudioTrack | null
  image?: ImageBitmap
}

export type RenderableVisual =
  | { kind: 'video'; sample: VideoSample }
  | { kind: 'image'; bitmap: ImageBitmap; width: number; height: number }

interface OpenAudioClip {
  clip: AudioClip
  input: Input
  /** Null when this browser cannot decode the file's audio; it then contributes silence. */
  audio: InputAudioTrack | null
}

/** Render the timeline to an MP4 file in memory, entirely in this browser. */
export async function exportTimeline(
  items: readonly TimelineItem[],
  clips: ReadonlyMap<string, MediaClip>,
  audioItems: readonly AudioTimelineItem[],
  audioClips: ReadonlyMap<string, AudioClip>,
  textItems: readonly TextOverlay[] = [],
  transitions: readonly Transition[] = [],
  aspectRatio: AspectRatio = '16:9',
  overlayItems: readonly OverlayItem[] = [],
  videoLayers: readonly VideoLayerItem[] = [],
  { signal, onProgress, edgeFades }: ExportOptions = {},
): Promise<ExportResult> {
  if (items.length === 0) throw new Error('Add clips to the timeline before exporting.')
  const firstClip = clips.get(items[0].clipId)
  if (firstClip === undefined) throw new Error('A timeline clip is missing from the Media panel.')

  const videoDuration = timelineDuration(items)
  const layerDuration = videoLayersDuration(videoLayers)
  const audioDuration =
    audioItems.length > 0 ? Math.max(...audioItems.map((item) => item.start + itemLength(item))) : 0
  const textDuration =
    textItems.length > 0 ? Math.max(...textItems.map((item) => item.start + item.duration)) : 0
  const overlayDuration =
    overlayItems.length > 0 ? Math.max(...overlayItems.map((item) => item.start + item.duration)) : 0
  const totalExportDuration = Math.max(videoDuration, audioDuration, textDuration, overlayDuration, layerDuration)

  const plan = planFrames(items, EXPORT_FPS, totalExportDuration)
  const size = outputSizeForAspectRatio(aspectRatio, firstClip)
  const notes: string[] = []
  const report = progressReporter(onProgress)
  const opened = new Map<string, OpenVideoClip>()
  const openedAudio = new Map<string, OpenAudioClip>()
  let output: Output<Mp4OutputFormat, BufferTarget> | null = null

  const disposeAll = () => {
    for (const open of opened.values()) {
      open.input?.dispose()
      open.image?.close()
    }
    for (const { input } of openedAudio.values()) input.dispose()
  }
  const onAbort = () => {
    void output?.cancel()
    disposeAll()
  }
  signal?.addEventListener('abort', onAbort, { once: true })

  try {
    signal?.throwIfAborted()
    report('Preparing', 0)
    const mediaOverlayClipIds = overlayItems
      .filter((o) => o.category === 'media' && o.clipId)
      .map((o) => o.clipId!)
    const allVideoClipIds = new Set([
      ...items.map((item) => item.clipId),
      ...mediaOverlayClipIds,
      ...videoLayers.map((layer) => layer.clipId),
    ])
    for (const clipId of allVideoClipIds) {
      const clip = clips.get(clipId)
      if (clip === undefined) throw new Error('A timeline clip is missing from the Media panel.')
      opened.set(clipId, await openVideoClip(clip, notes))
      signal?.throwIfAborted()
    }
    for (const clipId of new Set(audioItems.map((item) => item.clipId))) {
      const clip = audioClips.get(clipId)
      if (clip === undefined) throw new Error('A timeline audio clip is missing from the Media panel.')
      openedAudio.set(clipId, await openAudioClip(clip, notes))
      signal?.throwIfAborted()
    }

    const quality = new Quality('high')
    const videoCodec = await getFirstEncodableVideoCodec(['avc', 'hevc', 'vp9', 'av1'], {
      ...size,
      quality,
      frameRate: EXPORT_FPS,
    })
    if (videoCodec === null) throw new Error('This browser cannot encode MP4 video.')
    const needsAudio =
      items.some((item) => {
        if (item.muted) return false
        const open = opened.get(item.clipId)
        return open !== undefined && open.audio !== null
      }) ||
      videoLayers.some((layer) => {
        if (layer.muted) return false
        const open = opened.get(layer.clipId)
        return open !== undefined && open.audio !== null
      }) ||
      audioItems.some((item) => openedAudio.get(item.clipId)!.audio !== null)
    const audioCodec = needsAudio
      ? await getFirstEncodableAudioCodec(['aac', 'opus'], {
          numberOfChannels: CHANNELS,
          sampleRate: SAMPLE_RATE,
          quality,
        })
      : null
    if (needsAudio && audioCodec === null) notes.push('This browser cannot encode audio, so the video is silent.')
    if (audioCodec === 'opus') notes.push('Audio is Opus because AAC is unavailable; some players (like QuickTime) cannot play it.')

    output = new Output({ format: new Mp4OutputFormat(), target: new BufferTarget() })
    const canvas = document.createElement('canvas')
    canvas.width = size.width
    canvas.height = size.height
    const context = canvas.getContext('2d', { alpha: false })
    if (context === null) throw new Error('Could not create a drawing surface for the export.')

    const videoSource = new CanvasSource(canvas, { codec: videoCodec, quality })
    output.addVideoTrack(videoSource, { frameRate: EXPORT_FPS })
    const audioSource =
      audioCodec === null
        ? null
        : new AudioBufferSource(
            { codec: audioCodec, quality },
            { startTimestamp: audioCodec === 'aac' ? -AAC_PRIMING_SAMPLES / SAMPLE_RATE : 0 },
          )
    if (audioSource !== null) output.addAudioTrack(audioSource)
    await output.start()

    if (audioSource !== null) {
      await mixTimelineAudio(items, opened, audioItems, openedAudio, videoLayers, transitions, clips, plan.duration, audioSource, signal, (fraction) =>
        report('Mixing audio', 0.1 * fraction),
      )
      audioSource.close()
    }
    // Explicitly fetch the faces these titles use. `document.fonts.ready` alone
    // resolves with nothing loaded, which silently exported the fallback font.
    await loadTitleFonts(textItems)

    // Stills are shared by clip id; videos decode per overlay, below.
    const overlayStills = new Map<string, OverlayFrame>()
    for (const [clipId, open] of opened.entries()) {
      if (open.image) {
        overlayStills.set(clipId, overlayFrameFromBitmap(open.image))
      }
    }
    const overlayIterators = openOverlayIterators(overlayItems, opened, plan.frameCount)

    /** Draw the overlay stack for one frame, decoding any video PiP it needs. */
    const paintOverlays = async (time: number) => {
      const { frames, samples } = await nextOverlayFrames(overlayItems, time, overlayIterators)
      try {
        drawOverlays(context, overlayItems, time, size, {
          byOverlayId: frames,
          byClipId: overlayStills,
        })
      } finally {
        for (const sample of samples) sample.close()
      }
    }

    const layerIterators = openLayerIterators(videoLayers, opened, plan.frameCount)

    let framesDone = 0
    if (transitions.length === 0) {
      for (const group of plan.items) {
        const open = opened.get(items[group.itemIndex].clipId)!
        let frame = group.firstFrame
        const item = items[group.itemIndex]
        if (open.image) {
          const bitmap = open.image
          for (let i = 0; i < group.sourceTimes.length; i++) {
            context.fillStyle = '#000'
            context.fillRect(0, 0, size.width, size.height)
            drawVisual(
              context,
              { kind: 'image', bitmap, width: open.clip.width ?? bitmap.width, height: open.clip.height ?? bitmap.height },
              size,
              item,
              evaluateTransform(item, (frame - group.firstFrame) / EXPORT_FPS),
            )
            await drawVideoLayers(context, size, videoLayers, frame / EXPORT_FPS, opened, layerIterators)
            await paintOverlays(frame / EXPORT_FPS)
            drawTextOverlays(context, textItems, frame / EXPORT_FPS, size)
            signal?.throwIfAborted()
            await videoSource.add(frame / EXPORT_FPS, 1 / EXPORT_FPS)
            frame += 1
            framesDone += 1
            report('Rendering video', 0.1 + 0.88 * (framesDone / plan.frameCount))
          }
        } else if (open.video) {
          const timestamps = group.sourceTimes.map((time) => time + FRAME_EPSILON)
          for await (const sample of new VideoSampleSink(open.video).samplesAtTimestamps(timestamps)) {
            context.fillStyle = '#000'
            context.fillRect(0, 0, size.width, size.height)
            if (sample !== null) {
              try {
                drawVisual(
                  context,
                  { kind: 'video', sample },
                  size,
                  item,
                  evaluateTransform(item, (frame - group.firstFrame) / EXPORT_FPS),
                )
              } finally {
                sample.close()
              }
            }
            await drawVideoLayers(context, size, videoLayers, frame / EXPORT_FPS, opened, layerIterators)
            await paintOverlays(frame / EXPORT_FPS)
            drawTextOverlays(context, textItems, frame / EXPORT_FPS, size)
            signal?.throwIfAborted()
            await videoSource.add(frame / EXPORT_FPS, 1 / EXPORT_FPS)
            frame += 1
            framesDone += 1
            report('Rendering video', 0.1 + 0.88 * (framesDone / plan.frameCount))
          }
        }
      }
      while (framesDone < plan.frameCount) {
        context.fillStyle = '#000'
        context.fillRect(0, 0, size.width, size.height)
        const frameTime = framesDone / EXPORT_FPS
        await drawVideoLayers(context, size, videoLayers, frameTime, opened, layerIterators)
        await paintOverlays(frameTime)
        drawTextOverlays(context, textItems, frameTime, size)
        const edgeFadeEmpty = edgeFadeAt(edgeFades, frameTime, totalExportDuration)
        if (edgeFadeEmpty !== null) {
          context.save()
          context.fillStyle = edgeFadeEmpty.color
          context.globalAlpha = edgeFadeEmpty.opacity
          context.fillRect(0, 0, size.width, size.height)
          context.restore()
        }
        signal?.throwIfAborted()
        await videoSource.add(frameTime, 1 / EXPORT_FPS)
        framesDone += 1
        report('Rendering video', 0.1 + 0.88 * (framesDone / plan.frameCount))
      }
    } else {
      // Transition-aware rendering: collect monotonic timestamps needed from each video clip
      const clipTimestamps = new Map<string, number[]>()
      for (const item of items) {
        const open = opened.get(item.clipId)
        if (open?.video && !clipTimestamps.has(item.clipId)) {
          clipTimestamps.set(item.clipId, [])
        }
      }

      for (let frame = 0; frame < plan.frameCount; frame++) {
        const t = frame / EXPORT_FPS
        const active = locateTransition(items, transitions, t, clips)
        if (active !== null) {
          const listA = clipTimestamps.get(active.itemA.clipId)
          if (listA) listA.push(active.sourceTimeA + FRAME_EPSILON)
          const listB = clipTimestamps.get(active.itemB.clipId)
          if (listB) listB.push(active.sourceTimeB + FRAME_EPSILON)
        } else {
          const pos = locate(items, t)
          if (pos !== null) {
            const item = items[pos.index]
            const list = clipTimestamps.get(item.clipId)
            if (list) list.push(item.inPoint + pos.offset * (item.speed ?? 1) + FRAME_EPSILON)
          }
        }
      }

      const iterators = new Map<string, AsyncIterator<VideoSample | null>>()
      for (const [clipId, times] of clipTimestamps.entries()) {
        const open = opened.get(clipId)
        if (open?.video && times.length > 0) {
          const sink = new VideoSampleSink(open.video)
          iterators.set(clipId, sink.samplesAtTimestamps(times)[Symbol.asyncIterator]())
        }
      }

      for (let frame = 0; frame < plan.frameCount; frame++) {
        context.fillStyle = '#000'
        context.fillRect(0, 0, size.width, size.height)

        const t = frame / EXPORT_FPS
        const active = locateTransition(items, transitions, t, clips)

        if (active !== null) {
          const visualA = await getVisualForClip(active.itemA.clipId, iterators, opened)
          const visualB = await getVisualForClip(active.itemB.clipId, iterators, opened)
          try {
            drawTransitionFrame(
              context,
              size,
              visualA,
              visualB,
              active.transition,
              active.easedProgress,
              active.itemA,
              active.itemB,
              evaluateTransform(active.itemA, active.sourceTimeA - active.itemA.inPoint),
              evaluateTransform(active.itemB, active.sourceTimeB - active.itemB.inPoint),
            )
          } finally {
            closeVisual(visualA)
            closeVisual(visualB)
          }
        } else {
          const pos = locate(items, t)
          if (pos !== null) {
            const item = items[pos.index]
            const visual = await getVisualForClip(item.clipId, iterators, opened)
            try {
              drawVisual(context, visual, size, item, evaluateTransform(item, pos.offset))
            } finally {
              closeVisual(visual)
            }
          }
        }

        await drawVideoLayers(context, size, videoLayers, t, opened, layerIterators)
        await paintOverlays(t)
        drawTextOverlays(context, textItems, t, size)
        const edgeFadeFrame = edgeFadeAt(edgeFades, t, totalExportDuration)
        if (edgeFadeFrame !== null) {
          context.save()
          context.fillStyle = edgeFadeFrame.color
          context.globalAlpha = edgeFadeFrame.opacity
          context.fillRect(0, 0, size.width, size.height)
          context.restore()
        }
        signal?.throwIfAborted()
        await videoSource.add(t, 1 / EXPORT_FPS)
        framesDone += 1
        report('Rendering video', 0.1 + 0.88 * (framesDone / plan.frameCount))
      }
    }
    videoSource.close()

    report('Finishing', 0.98)
    await output.finalize()
    const buffer = output.target.buffer
    if (buffer === null) throw new Error('The export produced no data.')
    report('Finishing', 1)

    return {
      blob: new Blob([buffer], { type: 'video/mp4' }),
      ...size,
      duration: plan.duration,
      codecs: [videoCodecName(videoCodec), audioCodec && audioCodecName(audioCodec)].filter(Boolean).join(' + '),
      notes,
    }
  } catch (error) {
    if (output !== null && output.state !== 'finalized' && output.state !== 'canceled') await output.cancel()
    throw signal?.aborted ? signal.reason : error
  } finally {
    signal?.removeEventListener('abort', onAbort)
    disposeAll()
  }
}

async function openVideoClip(clip: MediaClip, notes: string[]): Promise<OpenVideoClip> {
  if (clip.mediaType === 'image') {
    const image = await createImageBitmap(clip.file)
    return { clip, audio: null, image }
  }
  const input = new Input({ source: new BlobSource(clip.file), formats: ALL_FORMATS })
  try {
    const video = await input.getPrimaryVideoTrack()
    if (video === null) throw new Error(`${clip.name} has no video track.`)
    if (!(await video.canDecode())) {
      const codec = (await video.getCodecParameterString()) ?? 'unknown codec'
      throw new Error(`This browser cannot decode ${clip.name} (${codec}).`)
    }
    let audio = await input.getPrimaryAudioTrack()
    if (audio !== null && !(await audio.canDecode())) {
      notes.push(`The sound in ${clip.name} cannot be decoded here, so that part is silent.`)
      audio = null
    }
    return { clip, input, video, audio }
  } catch (error) {
    input.dispose()
    throw error
  }
}

async function openAudioClip(clip: AudioClip, notes: string[]): Promise<OpenAudioClip> {
  const input = new Input({ source: new BlobSource(clip.file), formats: ALL_FORMATS })
  try {
    let audio = await input.getPrimaryAudioTrack()
    if (audio !== null && !(await audio.canDecode())) {
      notes.push(`${clip.name} cannot be decoded here, so it is silent.`)
      audio = null
    }
    if (audio === null) notes.push(`${clip.name} has no audio track, so it is silent.`)
    return { clip, input, audio }
  } catch (error) {
    input.dispose()
    throw error
  }
}

/**
 * Mix the video track's own sound with all independent parallel audio tracks.
 * Any number of sources can overlap in time, each with its own volume control.
 */
async function mixTimelineAudio(
  items: readonly TimelineItem[],
  opened: ReadonlyMap<string, OpenVideoClip>,
  audioItems: readonly AudioTimelineItem[],
  openedAudio: ReadonlyMap<string, OpenAudioClip>,
  videoLayers: readonly VideoLayerItem[],
  transitions: readonly Transition[],
  clips: ReadonlyMap<string, MediaClip>,
  duration: number,
  audioSource: AudioBufferSource,
  signal: AbortSignal | undefined,
  onFraction: (fraction: number) => void,
) {
  const totalFrames = Math.round(duration * SAMPLE_RATE)
  const breakpoints = collectBreakpoints(items, audioItems, videoLayers, transitions, duration)
  let written = 0

  for (let index = 1; index < breakpoints.length; index++) {
    signal?.throwIfAborted()
    const spanStart = written / SAMPLE_RATE
    const isLast = index === breakpoints.length - 1
    const end = isLast ? totalFrames : Math.min(totalFrames, Math.round(breakpoints[index] * SAMPLE_RATE))
    const frames = end - written
    if (frames <= 0) continue

    const resolveTime = spanStart + BREAKPOINT_EPSILON
    const contributions: AudioContribution[] = []

    // Inside a transition both clips are audible, blended on the same curve as
    // the picture; outside one, the single clip under the playhead plays flat.
    const activeTransition = locateTransition(items, transitions, resolveTime, clips)
    if (activeTransition !== null) {
      const gains = transitionAudioGains(activeTransition.transition, activeTransition.progress)
      for (const [item, sourceTime, gain] of [
        [activeTransition.itemA, activeTransition.sourceTimeA, gains.a],
        [activeTransition.itemB, activeTransition.sourceTimeB, gains.b],
      ] as const) {
        const open = opened.get(item.clipId)
        if (item.muted || open === undefined || open.audio === null || gain <= 0) continue
        contributions.push({ track: open.audio, sourceStart: sourceTime, gain: clamp(gain, 0, 1) })
      }
    } else {
      const videoPosition = locate(items, resolveTime)
      const videoItem = videoPosition === null ? null : items[videoPosition.index]
      const videoOpen = videoItem === null ? null : opened.get(videoItem.clipId)!
      if (videoItem !== null && !videoItem.muted && videoOpen !== null && videoOpen.audio !== null) {
        contributions.push({
          track: videoOpen.audio,
          sourceStart: videoItem.inPoint + videoPosition!.offset * (videoItem.speed ?? 1),
          gain: 1,
        })
      }
    }

    // Collect all active parallel audio tracks at this point in time
    const activeAudioItems = audioItems.filter((item) => {
      const len = itemLength(item)
      return resolveTime >= item.start && resolveTime < item.start + len
    })
    for (const audioItem of activeAudioItems) {
      const audioOpen = openedAudio.get(audioItem.clipId)
      if (audioOpen !== undefined && audioOpen.audio !== null) {
        const speed = audioItem.speed ?? 1
        // Calculate fade in and fade out volume multipliers
        const offset = Math.max(0, resolveTime - audioItem.start)
        const len = itemLength(audioItem)
        let fadeMultiplier = 1
        if (audioItem.fadeIn && audioItem.fadeIn > 0 && offset < audioItem.fadeIn) {
          fadeMultiplier = Math.min(fadeMultiplier, Math.max(0, offset / audioItem.fadeIn))
        }
        if (audioItem.fadeOut && audioItem.fadeOut > 0) {
          const remaining = len - offset
          if (remaining < audioItem.fadeOut) {
            fadeMultiplier = Math.min(fadeMultiplier, Math.max(0, remaining / audioItem.fadeOut))
          }
        }
        contributions.push({
          track: audioOpen.audio,
          sourceStart: audioItem.inPoint + (spanStart - audioItem.start) * speed,
          gain: clamp(evaluateVolume(audioItem.keyframes, audioItem.volume, offset) * fadeMultiplier, 0, 1),
          effect: audioItem.effect,
          effectIntensity: audioItem.effectIntensity,
          speed,
        })
      }
    }

    // Video layers above the base track contribute their own sound when unmuted.
    for (const layer of videoLayers) {
      if (layer.muted) continue
      if (resolveTime < layer.start || resolveTime >= videoLayerEnd(layer)) continue
      const layerOpen = opened.get(layer.clipId)
      if (layerOpen === undefined || layerOpen.audio === null) continue
      const speed = layer.speed ?? 1
      contributions.push({
        track: layerOpen.audio,
        sourceStart: layer.inPoint + (spanStart - layer.start) * speed,
        gain: clamp(evaluateVolume(layer.keyframes, layer.volume ?? 1, resolveTime - layer.start), 0, 1),
        speed,
      })
    }

    const buffer = await renderSpan(contributions, frames, signal)
    await audioSource.add(buffer)
    written = end
    onFraction(written / totalFrames)
  }
}

/** Every point audio actually changes: video-item boundaries, audio-item boundaries, fades, and the ends. */
function collectBreakpoints(
  items: readonly TimelineItem[],
  audioItems: readonly AudioTimelineItem[],
  videoLayers: readonly VideoLayerItem[],
  transitions: readonly Transition[],
  duration: number,
): number[] {
  const points = new Set<number>([0, duration])
  let time = 0
  for (const item of items) {
    points.add(time)
    time += (item.outPoint - item.inPoint) / (item.speed ?? 1)
  }
  for (const item of audioItems) {
    const len = itemLength(item)
    points.add(clampToRange(item.start, 0, duration))
    if (item.fadeIn && item.fadeIn > 0) {
      for (let s = 0.1; s < item.fadeIn; s += 0.1) {
        points.add(clampToRange(item.start + s, 0, duration))
      }
      points.add(clampToRange(item.start + item.fadeIn, 0, duration))
    }
    if (item.fadeOut && item.fadeOut > 0) {
      for (let s = 0.1; s < item.fadeOut; s += 0.1) {
        points.add(clampToRange(item.start + len - s, 0, duration))
      }
      points.add(clampToRange(item.start + len - item.fadeOut, 0, duration))
    }
    points.add(clampToRange(item.start + len, 0, duration))
    for (const time of automationPoints(item.keyframes?.volume)) {
      points.add(clampToRange(item.start + time, 0, duration))
    }
  }
  for (const layer of videoLayers) {
    if (layer.muted) continue
    points.add(clampToRange(layer.start, 0, duration))
    points.add(clampToRange(videoLayerEnd(layer), 0, duration))
    for (const time of automationPoints(layer.keyframes?.volume)) {
      points.add(clampToRange(layer.start + time, 0, duration))
    }
  }
  // An audio crossfade changes continuously across a transition, so the window
  // needs points along it, not just at its edges, or the blend renders as a step.
  const starts = itemStarts(items)
  for (let i = 0; i < items.length - 1; i++) {
    const transition = transitions.find(
      (candidate) => candidate.fromItemId === items[i].id && candidate.toItemId === items[i + 1].id,
    )
    if (transition === undefined) continue
    const half = getEffectiveTransitionDuration(transition, items[i], items[i + 1]) / 2
    for (let offset = -half; offset <= half + 1e-9; offset += AUTOMATION_STEP) {
      points.add(clampToRange(starts[i + 1] + offset, 0, duration))
    }
    points.add(clampToRange(starts[i + 1] + half, 0, duration))
  }

  const sorted = [...points].sort((a, b) => a - b)
  return sorted.filter((value, index) => index === 0 || value - sorted[index - 1] > BREAKPOINT_EPSILON)
}

function clampToRange(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max)
}

/** How finely a keyframed volume ramp is sampled, in seconds. */
const AUTOMATION_STEP = 0.1

/**
 * Times a volume track must be re-evaluated at. Gain is constant within a mixing
 * span, so a ramp needs points along it, not just at its keyframes, or it steps.
 */
function automationPoints(frames: readonly Keyframe[] | undefined): number[] {
  const times = keyframeTimes(frames ? { volume: [...frames] } : undefined)
  if (times.length < 2) return times
  const points = new Set(times)
  for (let time = times[0]; time < times[times.length - 1]; time += AUTOMATION_STEP) {
    points.add(Math.round(time * 1000) / 1000)
  }
  return [...points].sort((a, b) => a - b)
}

interface AudioContribution {
  track: InputAudioTrack
  sourceStart: number
  /** 0 to 1. */
  gain: number
  effect?: AudioEffectType
  effectIntensity?: number
  speed?: number
}

/** Render a span of audio from zero, one, or multiple overlapping sources. */
async function renderSpan(
  contributions: readonly AudioContribution[],
  frames: number,
  signal: AbortSignal | undefined,
): Promise<AudioBuffer> {
  if (contributions.length === 0) {
    return new AudioBuffer({ length: frames, numberOfChannels: CHANNELS, sampleRate: SAMPLE_RATE })
  }
  const rendered = await Promise.all(
    contributions.map((c) =>
      renderItemAudio(c.track, c.sourceStart, frames, c.gain, signal, c.effect, c.effectIntensity, c.speed),
    ),
  )
  return mixMultipleBuffers(rendered)
}

/** Decode `frames / SAMPLE_RATE` seconds of a track from `start`, as 48 kHz stereo, scaled by `gain` and effects. */
async function renderItemAudio(
  track: InputAudioTrack,
  start: number,
  frames: number,
  gain: number,
  signal: AbortSignal | undefined,
  effect?: AudioEffectType,
  effectIntensity?: number,
  speed: number = 1,
): Promise<AudioBuffer> {
  const sourceRate = await track.getSampleRate()
  const channelCount = await track.getNumberOfChannels()
  const safeSpeed = speed > 0 ? speed : 1
  const span = (frames / SAMPLE_RATE) * safeSpeed
  const sourceFrames = Math.max(1, Math.ceil(span * sourceRate))
  const channels = Array.from({ length: channelCount }, () => new Float32Array(sourceFrames))

  for await (const { buffer, timestamp } of new AudioBufferSink(track).buffers(start, start + span)) {
    signal?.throwIfAborted()
    // Chunks are not trimmed: the first can begin before `start`, the last can run past the end.
    const destination = Math.round((timestamp - start) * sourceRate)
    const from = Math.max(0, -destination)
    const to = Math.min(buffer.length, sourceFrames - destination)
    if (to <= from) continue
    for (const [channel, data] of channels.entries()) {
      const sourceChannel = Math.min(channel, buffer.numberOfChannels - 1)
      data.set(buffer.getChannelData(sourceChannel).subarray(from, to), destination + from)
    }
  }

  const segment = new AudioBuffer({ length: sourceFrames, numberOfChannels: channelCount, sampleRate: sourceRate })
  for (const [channel, data] of channels.entries()) segment.copyToChannel(data, channel)
  // Resample to 48 kHz, apply playback speed, and mix to stereo, applying gain & effects.
  const mixer = new OfflineAudioContext({ numberOfChannels: CHANNELS, length: frames, sampleRate: SAMPLE_RATE })
  const node = new AudioBufferSourceNode(mixer, { buffer: segment, playbackRate: safeSpeed })
  const gainNode = new GainNode(mixer, { gain })
  node.connect(gainNode)
  if (effect && effect !== 'none' && (effectIntensity ?? 1) > 0) {
    applyAudioEffectNodes(mixer, gainNode, mixer.destination, effect, effectIntensity ?? 1)
  } else {
    gainNode.connect(mixer.destination)
  }
  node.start(0)
  return mixer.startRendering()
}

/** Sum multiple equal-length buffers and clamp to the valid [-1, 1] sample range. */
function mixMultipleBuffers(buffers: readonly AudioBuffer[]): AudioBuffer {
  if (buffers.length === 0) {
    return new AudioBuffer({ length: 1, numberOfChannels: CHANNELS, sampleRate: SAMPLE_RATE })
  }
  if (buffers.length === 1) return buffers[0]
  const length = buffers[0].length
  const mixed = new AudioBuffer({ length, numberOfChannels: CHANNELS, sampleRate: SAMPLE_RATE })
  for (let channel = 0; channel < CHANNELS; channel++) {
    const out = new Float32Array(length)
    for (const buf of buffers) {
      const data = buf.getChannelData(Math.min(channel, buf.numberOfChannels - 1))
      for (let i = 0; i < length; i++) {
        out[i] += data[i]
      }
    }
    for (let i = 0; i < length; i++) {
      out[i] = clampToRange(out[i], -1, 1)
    }
    mixed.copyToChannel(out, channel)
  }
  return mixed
}

/** Forward progress at most every half percent, plus every stage change. */
function progressReporter(onProgress: ExportOptions['onProgress']) {
  let lastStage = ''
  let lastFraction = -1
  return (stage: string, fraction: number) => {
    if (stage === lastStage && fraction - lastFraction < 0.005 && fraction < 1) return
    lastStage = stage
    lastFraction = fraction
    onProgress?.(stage, fraction)
  }
}

function videoCodecName(codec: VideoCodec): string {
  return VIDEO_CODEC_NAMES[codec] ?? codec
}

function audioCodecName(codec: AudioCodec): string {
  return AUDIO_CODEC_NAMES[codec] ?? codec
}

function drawImageWithFit(
  context: CanvasRenderingContext2D,
  image: ImageBitmap,
  targetSize: Size,
  fitMode: 'contain' | 'cover' = 'contain',
) {
  const { width: tw, height: th } = targetSize
  const { width: sw, height: sh } = image
  if (sw === 0 || sh === 0) return
  const scale = fitMode === 'cover' ? Math.max(tw / sw, th / sh) : Math.min(tw / sw, th / sh)
  const dw = sw * scale
  const dh = sh * scale
  const dx = (tw - dw) / 2
  const dy = (th - dh) / 2
  context.drawImage(image, dx, dy, dw, dh)
}

function drawVisual(
  context: CanvasRenderingContext2D,
  visual: RenderableVisual | null,
  size: Size,
  item?: (TimelineItem | VideoLayerItem) | null,
  transform?: EvaluatedTransform,
) {
  if (!visual) return
  context.save()

  // Animated transform sits outside the clip's own orientation, so a keyed
  // rotation spins the already-upright picture rather than the raw footage.
  if (transform) {
    context.globalAlpha *= clamp(transform.opacity, 0, 1)
    applyTransformToContext(context, transform, size.width, size.height)
  }

  // Apply CSS filter if available
  const filter = getCssFilter(item?.filter, item?.filterIntensity, item)
  if (filter && filter !== 'none' && 'filter' in context) {
    const existing = context.filter && context.filter !== 'none' ? context.filter : ''
    context.filter = existing ? `${existing} ${filter}` : filter
  }

  // Apply Rotation and Flip around canvas center
  const rotation = item?.rotation ?? 0
  const flipH = item?.flipH ?? false
  const flipV = item?.flipV ?? false
  if (rotation !== 0 || flipH || flipV) {
    const cx = size.width / 2
    const cy = size.height / 2
    context.translate(cx, cy)
    if (rotation !== 0) {
      context.rotate((rotation * Math.PI) / 180)
    }
    if (flipH || flipV) {
      context.scale(flipH ? -1 : 1, flipV ? -1 : 1)
    }
    context.translate(-cx, -cy)
  }

  const fitMode = item?.fitMode ?? 'contain'
  if (visual.kind === 'video') {
    visual.sample.drawWithFit(context, { fit: fitMode })
  } else {
    drawImageWithFit(context, visual.bitmap, size, fitMode)
  }

  if (item && 'filterVignette' in item && typeof item.filterVignette === 'number' && item.filterVignette > 0) {
    const cx = size.width / 2
    const cy = size.height / 2
    const radius = Math.hypot(cx, cy)
    const grad = context.createRadialGradient(cx, cy, radius * VIGNETTE.clearStop, cx, cy, radius)
    grad.addColorStop(0, 'rgba(0, 0, 0, 0)')
    grad.addColorStop(1, `rgba(0, 0, 0, ${vignetteAlpha(item.filterVignette).toFixed(3)})`)
    context.fillStyle = grad
    context.fillRect(0, 0, size.width, size.height)
  }

  context.restore()
}

function closeVisual(visual: RenderableVisual | null) {
  if (visual?.kind === 'video') {
    visual.sample.close()
  }
}

async function getVisualForClip(
  clipId: string,
  iterators: Map<string, AsyncIterator<VideoSample | null>>,
  opened: ReadonlyMap<string, OpenVideoClip>,
): Promise<RenderableVisual | null> {
  const open = opened.get(clipId)
  if (!open) return null
  if (open.image) {
    return {
      kind: 'image',
      bitmap: open.image,
      width: open.clip.width ?? open.image.width,
      height: open.clip.height ?? open.image.height,
    }
  }
  const iter = iterators.get(clipId)
  if (!iter) return null
  const sample = (await iter.next()).value ?? null
  if (sample === null) return null
  return { kind: 'video', sample }
}

/**
 * One decoding iterator per layer item, keyed by item id rather than clip id:
 * the same clip may sit on several layers at once, and each needs its own
 * monotonically advancing read through the source.
 */
function openLayerIterators(
  videoLayers: readonly VideoLayerItem[],
  opened: ReadonlyMap<string, OpenVideoClip>,
  frameCount: number,
): Map<string, AsyncIterator<VideoSample | null>> {
  const iterators = new Map<string, AsyncIterator<VideoSample | null>>()
  for (const layer of videoLayers) {
    const open = opened.get(layer.clipId)
    if (open?.video === null || open?.video === undefined) continue
    const times: number[] = []
    const end = videoLayerEnd(layer)
    for (let frame = 0; frame < frameCount; frame++) {
      const time = frame / EXPORT_FPS
      if (time < layer.start || time >= end) continue
      times.push(layerSourceTime(layer, time) + FRAME_EPSILON)
    }
    if (times.length === 0) continue
    iterators.set(
      layer.id,
      new VideoSampleSink(open.video).samplesAtTimestamps(times)[Symbol.asyncIterator](),
    )
  }
  return iterators
}

/**
 * One decoding iterator per picture-in-picture overlay backed by a video, keyed
 * by overlay id because the same clip can be used by several overlays at once.
 */
function openOverlayIterators(
  overlayItems: readonly OverlayItem[],
  opened: ReadonlyMap<string, OpenVideoClip>,
  frameCount: number,
): Map<string, AsyncIterator<VideoSample | null>> {
  const iterators = new Map<string, AsyncIterator<VideoSample | null>>()
  for (const item of overlayItems) {
    if (item.category !== 'media' || item.clipId === undefined) continue
    const open = opened.get(item.clipId)
    // Stills are shared through the bitmap map; only videos need decoding here.
    if (open?.video === null || open?.video === undefined || open.image) continue
    const times: number[] = []
    const end = item.start + item.duration
    for (let frame = 0; frame < frameCount; frame++) {
      const time = frame / EXPORT_FPS
      if (time < item.start || time >= end) continue
      times.push(pipSourceTime(item, time) + FRAME_EPSILON)
    }
    if (times.length === 0) continue
    iterators.set(
      item.id,
      new VideoSampleSink(open.video).samplesAtTimestamps(times)[Symbol.asyncIterator](),
    )
  }
  return iterators
}

/**
 * Decode this frame's picture for every active video PiP. Returned samples must
 * be closed by the caller once the overlay has been drawn.
 */
async function nextOverlayFrames(
  overlayItems: readonly OverlayItem[],
  time: number,
  iterators: Map<string, AsyncIterator<VideoSample | null>>,
): Promise<{ frames: Map<string, OverlayFrame>; samples: VideoSample[] }> {
  const frames = new Map<string, OverlayFrame>()
  const samples: VideoSample[] = []
  for (const item of overlayItems) {
    const iterator = iterators.get(item.id)
    if (iterator === undefined) continue
    if (time < item.start || time >= item.start + item.duration) continue
    // Advance in lockstep with the timestamps planned for this overlay.
    const sample = (await iterator.next()).value ?? null
    if (sample === null) continue
    samples.push(sample)
    frames.set(item.id, {
      width: sample.displayWidth,
      height: sample.displayHeight,
      draw: (context, dx, dy, dWidth, dHeight) => sample.draw(context, dx, dy, dWidth, dHeight),
    })
  }
  return { frames, samples }
}

/** Composite every layer covering `time` over whatever the base track drew. */
async function drawVideoLayers(
  context: CanvasRenderingContext2D,
  size: Size,
  videoLayers: readonly VideoLayerItem[],
  time: number,
  opened: ReadonlyMap<string, OpenVideoClip>,
  iterators: Map<string, AsyncIterator<VideoSample | null>>,
) {
  for (const layer of activeLayersAt(videoLayers, time)) {
    const open = opened.get(layer.clipId)
    if (open === undefined) continue

    let visual: RenderableVisual | null = null
    if (open.image) {
      visual = {
        kind: 'image',
        bitmap: open.image,
        width: open.clip.width ?? open.image.width,
        height: open.clip.height ?? open.image.height,
      }
    } else {
      // Pull a frame even when the layer ends up invisible, so this iterator
      // stays in step with the frame loop that planned its timestamps.
      const iterator = iterators.get(layer.id)
      const sample = iterator === undefined ? null : ((await iterator.next()).value ?? null)
      if (sample !== null) visual = { kind: 'video', sample }
    }
    if (visual === null) continue

    try {
      const transform = evaluateTransform(layer, time - layer.start)
      if (transform.opacity > 0.001) {
        context.save()
        context.globalCompositeOperation = blendModeToComposite(layer.blendMode)
        drawVisual(context, visual, size, layer, transform)
        context.restore()
      }
    } finally {
      closeVisual(visual)
    }
  }
}


/**
 * Scratch surface for feathered wipes. A soft edge needs the incoming clip
 * masked by a gradient, which a canvas clip path cannot express, so the clip is
 * drawn here first and then alpha-masked.
 */
let wipeScratch: HTMLCanvasElement | null = null

function wipeScratchContext(size: Size): CanvasRenderingContext2D | null {
  if (wipeScratch === null) wipeScratch = document.createElement('canvas')
  if (wipeScratch.width !== size.width || wipeScratch.height !== size.height) {
    wipeScratch.width = size.width
    wipeScratch.height = size.height
  }
  const context = wipeScratch.getContext('2d')
  if (context === null) return null
  context.setTransform(1, 0, 0, 1, 0, 0)
  context.globalCompositeOperation = 'source-over'
  context.globalAlpha = 1
  context.clearRect(0, 0, size.width, size.height)
  return context
}

/** Draw the incoming clip revealed by a wipe, hard-edged or feathered. */
function drawWipe(
  context: CanvasRenderingContext2D,
  size: Size,
  visual: RenderableVisual | null,
  item: TimelineItem | null | undefined,
  transform: EvaluatedTransform | undefined,
  direction: WipeDirection,
  progress: number,
  softness: number,
) {
  if (visual === null) return
  const { solid, clear } = wipeEdge(progress, softness)

  if (softness <= 0 || solid >= clear) {
    const p = clamp(progress, 0, 1)
    context.save()
    context.beginPath()
    if (direction === 'left') context.rect(0, 0, size.width * p, size.height)
    else if (direction === 'right') context.rect(size.width * (1 - p), 0, size.width * p, size.height)
    else if (direction === 'up') context.rect(0, 0, size.width, size.height * p)
    else context.rect(0, size.height * (1 - p), size.width, size.height * p)
    context.clip()
    drawVisual(context, visual, size, item, transform)
    context.restore()
    return
  }

  const scratch = wipeScratchContext(size)
  if (scratch === null) return
  drawVisual(scratch, visual, size, item, transform)

  // Keep only what the gradient marks as opaque, feathering the leading edge.
  scratch.globalCompositeOperation = 'destination-in'
  const axes: Record<WipeDirection, [number, number, number, number]> = {
    left: [0, 0, size.width, 0],
    right: [size.width, 0, 0, 0],
    up: [0, size.height, 0, 0],
    down: [0, 0, 0, size.height],
  }
  const axis = axes[direction]
  const gradient = scratch.createLinearGradient(axis[0], axis[1], axis[2], axis[3])
  gradient.addColorStop(solid, 'rgba(0, 0, 0, 1)')
  gradient.addColorStop(clear, 'rgba(0, 0, 0, 0)')
  scratch.fillStyle = gradient
  scratch.fillRect(0, 0, size.width, size.height)

  if (wipeScratch !== null) context.drawImage(wipeScratch, 0, 0)
}

function drawTransitionFrame(
  context: CanvasRenderingContext2D,
  size: Size,
  visualA: RenderableVisual | null,
  visualB: RenderableVisual | null,
  transition: Transition,
  progress: number,
  itemA?: TimelineItem | null,
  itemB?: TimelineItem | null,
  transformA?: EvaluatedTransform,
  transformB?: EvaluatedTransform,
) {
  const p = clamp(progress, 0, 1)
  const type = transition.type
  const strength = transition.transitionStrength ?? 1

  if (type === 'crossfade') {
    if (visualA !== null) {
      context.globalAlpha = 1.0
      drawVisual(context, visualA, size, itemA, transformA)
    }
    if (visualB !== null) {
      context.globalAlpha = p
      drawVisual(context, visualB, size, itemB, transformB)
      context.globalAlpha = 1.0
    }
  } else if (type === 'fade-black' || type === 'fade-white') {
    const alpha = transitionLayerAlpha(type, p)
    if (visualA !== null && alpha.a > 0.001) {
      context.globalAlpha = clamp(alpha.a, 0, 1)
      drawVisual(context, visualA, size, itemA, transformA)
      context.globalAlpha = 1.0
    }
    if (visualB !== null && alpha.b > 0.001) {
      context.globalAlpha = clamp(alpha.b, 0, 1)
      drawVisual(context, visualB, size, itemB, transformB)
      context.globalAlpha = 1.0
    }
    const veil = transitionVeilAt(transition, p)
    if (veil !== null && veil.alpha > 0.001) {
      context.fillStyle = veil.color
      context.globalAlpha = veil.alpha
      context.fillRect(0, 0, size.width, size.height)
      context.globalAlpha = 1.0
    }
  } else if (wipeDirection(type) !== null) {
    if (visualA !== null) {
      drawVisual(context, visualA, size, itemA, transformA)
    }
    drawWipe(
      context,
      size,
      visualB,
      itemB,
      transformB,
      wipeDirection(type)!,
      p,
      transition.transitionSoftness ?? 0,
    )
  } else if (type === 'slide-left') {
    if (visualA !== null) {
      context.save()
      context.translate(-size.width * p, 0)
      drawVisual(context, visualA, size, itemA, transformA)
      context.restore()
    }
    if (visualB !== null) {
      context.save()
      context.translate(size.width * (1 - p), 0)
      drawVisual(context, visualB, size, itemB, transformB)
      context.restore()
    }
  } else if (type === 'slide-right') {
    if (visualA !== null) {
      context.save()
      context.translate(size.width * p, 0)
      drawVisual(context, visualA, size, itemA, transformA)
      context.restore()
    }
    if (visualB !== null) {
      context.save()
      context.translate(-size.width * (1 - p), 0)
      drawVisual(context, visualB, size, itemB, transformB)
      context.restore()
    }
  } else if (type === 'zoom-in') {
    const cx = size.width / 2
    const cy = size.height / 2
    if (visualA !== null) {
      context.save()
      context.globalAlpha = clamp(transitionLayerAlpha('zoom-in', p).a, 0, 1)
      const scaleA = 1 + p * (0.35 * strength)
      context.translate(cx, cy)
      context.scale(scaleA, scaleA)
      context.translate(-cx, -cy)
      drawVisual(context, visualA, size, itemA, transformA)
      context.restore()
    }
    if (visualB !== null) {
      context.save()
      context.globalAlpha = clamp(transitionLayerAlpha('zoom-in', p).b, 0, 1)
      const scaleB = 1 + (1 - p) * (0.15 * strength)
      context.translate(cx, cy)
      context.scale(scaleB, scaleB)
      context.translate(-cx, -cy)
      drawVisual(context, visualB, size, itemB, transformB)
      context.restore()
    }
  } else if (type === 'zoom-out') {
    const cx = size.width / 2
    const cy = size.height / 2
    if (visualA !== null) {
      context.save()
      context.globalAlpha = clamp(transitionLayerAlpha('zoom-out', p).a, 0, 1)
      const scaleA = 1 - p * (0.15 * strength)
      context.translate(cx, cy)
      context.scale(scaleA, scaleA)
      context.translate(-cx, -cy)
      drawVisual(context, visualA, size, itemA, transformA)
      context.restore()
    }
    if (visualB !== null) {
      context.save()
      context.globalAlpha = clamp(transitionLayerAlpha('zoom-out', p).b, 0, 1)
      const scaleB = 1 + 0.35 * strength - p * (0.35 * strength)
      context.translate(cx, cy)
      context.scale(scaleB, scaleB)
      context.translate(-cx, -cy)
      drawVisual(context, visualB, size, itemB, transformB)
      context.restore()
    }
  } else if (type === 'iris-circle') {
    if (visualA !== null) {
      drawVisual(context, visualA, size, itemA, transformA)
    }
    if (visualB !== null) {
      const cx = size.width / 2
      const cy = size.height / 2
      const maxRadius = Math.hypot(size.width, size.height) * 0.75
      context.save()
      context.beginPath()
      context.arc(cx, cy, maxRadius * p, 0, Math.PI * 2)
      context.clip()
      drawVisual(context, visualB, size, itemB, transformB)
      context.restore()
    }
  } else if (type === 'blur-dissolve') {
    const maxBlur = 16 * strength
    if (visualA !== null) {
      context.save()
      context.globalAlpha = clamp(1 - p, 0, 1)
      if (p > 0.01 && 'filter' in context) {
        context.filter = `blur(${(p * maxBlur).toFixed(1)}px)`
      }
      drawVisual(context, visualA, size, itemA, transformA)
      context.restore()
    }
    if (visualB !== null) {
      context.save()
      context.globalAlpha = clamp(p, 0, 1)
      if (1 - p > 0.01 && 'filter' in context) {
        context.filter = `blur(${((1 - p) * maxBlur).toFixed(1)}px)`
      }
      drawVisual(context, visualB, size, itemB, transformB)
      context.restore()
    }
  }
}

