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
import type { AudioCodec, InputAudioTrack, InputVideoTrack, VideoCodec } from 'mediabunny'
import { locateAudioItem } from '../audioTimeline.ts'
import { drawTextOverlays } from '../textDraw.ts'
import { locate } from '../timeline.ts'
import type { AudioClip, AudioTimelineItem, MediaClip, TextOverlay, TimelineItem } from '../types.ts'
import { outputSize, planFrames } from './plan.ts'


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
}

interface OpenVideoClip {
  clip: MediaClip
  input: Input
  video: InputVideoTrack
  /** Null when the clip has no audio this browser can decode; it then contributes silence. */
  audio: InputAudioTrack | null
}

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
  { signal, onProgress }: ExportOptions = {},
): Promise<ExportResult> {
  if (items.length === 0) throw new Error('Add clips to the timeline before exporting.')
  const firstClip = clips.get(items[0].clipId)
  if (firstClip === undefined) throw new Error('A timeline clip is missing from the Media panel.')

  const plan = planFrames(items, EXPORT_FPS)
  const size = outputSize(firstClip)
  const notes: string[] = []
  const report = progressReporter(onProgress)
  const opened = new Map<string, OpenVideoClip>()
  const openedAudio = new Map<string, OpenAudioClip>()
  let output: Output<Mp4OutputFormat, BufferTarget> | null = null

  const disposeAll = () => {
    for (const { input } of opened.values()) input.dispose()
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
    for (const clipId of new Set(items.map((item) => item.clipId))) {
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
      items.some((item) => !item.muted && opened.get(item.clipId)!.audio !== null) ||
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
      await mixTimelineAudio(items, opened, audioItems, openedAudio, plan.duration, audioSource, signal, (fraction) =>
        report('Mixing audio', 0.1 * fraction),
      )
      audioSource.close()
    if ('fonts' in document) {
      await (document as unknown as { fonts: { ready: Promise<void> } }).fonts.ready
    }

    let framesDone = 0
    for (const group of plan.items) {
      const open = opened.get(items[group.itemIndex].clipId)!
      const timestamps = group.sourceTimes.map((time) => time + FRAME_EPSILON)
      let frame = group.firstFrame
      for await (const sample of new VideoSampleSink(open.video).samplesAtTimestamps(timestamps)) {
        context.fillStyle = '#000'
        context.fillRect(0, 0, size.width, size.height)
        if (sample !== null) {
          try {
            sample.drawWithFit(context, { fit: 'contain' })
          } finally {
            sample.close()
          }
        }
        drawTextOverlays(context, textItems, frame / EXPORT_FPS, size)
        signal?.throwIfAborted()
        await videoSource.add(frame / EXPORT_FPS, 1 / EXPORT_FPS)
        frame += 1
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
  duration: number,
  audioSource: AudioBufferSource,
  signal: AbortSignal | undefined,
  onFraction: (fraction: number) => void,
) {
  const totalFrames = Math.round(duration * SAMPLE_RATE)
  const breakpoints = collectBreakpoints(items, audioItems, duration)
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

    const videoPosition = locate(items, resolveTime)
    const videoItem = videoPosition === null ? null : items[videoPosition.index]
    const videoOpen = videoItem === null ? null : opened.get(videoItem.clipId)!
    if (videoItem !== null && !videoItem.muted && videoOpen !== null && videoOpen.audio !== null) {
      contributions.push({
        track: videoOpen.audio,
        sourceStart: videoItem.inPoint + videoPosition!.offset,
        gain: 1,
      })
    }

    // Collect all active parallel audio tracks at this point in time
    const activeAudioItems = audioItems.filter(
      (item) => resolveTime >= item.start && resolveTime < item.start + (item.outPoint - item.inPoint),
    )
    for (const audioItem of activeAudioItems) {
      const audioOpen = openedAudio.get(audioItem.clipId)
      if (audioOpen !== undefined && audioOpen.audio !== null) {
        contributions.push({
          track: audioOpen.audio,
          sourceStart: audioItem.inPoint + (spanStart - audioItem.start),
          gain: audioItem.volume,
        })
      }
    }

    const buffer = await renderSpan(contributions, frames, signal)
    await audioSource.add(buffer)
    written = end
    onFraction(written / totalFrames)
  }
}

/** Every point audio actually changes: video-item boundaries, audio-item boundaries, and the ends. */
function collectBreakpoints(
  items: readonly TimelineItem[],
  audioItems: readonly AudioTimelineItem[],
  duration: number,
): number[] {
  const points = new Set<number>([0, duration])
  let time = 0
  for (const item of items) {
    points.add(time)
    time += item.outPoint - item.inPoint
  }
  for (const item of audioItems) {
    points.add(clampToRange(item.start, 0, duration))
    points.add(clampToRange(item.start + (item.outPoint - item.inPoint), 0, duration))
  }
  const sorted = [...points].sort((a, b) => a - b)
  return sorted.filter((value, index) => index === 0 || value - sorted[index - 1] > BREAKPOINT_EPSILON)
}

function clampToRange(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max)
}

interface AudioContribution {
  track: InputAudioTrack
  sourceStart: number
  /** 0 to 1. */
  gain: number
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
    contributions.map((c) => renderItemAudio(c.track, c.sourceStart, frames, c.gain, signal)),
  )
  return mixMultipleBuffers(rendered)
}

/** Decode `frames / SAMPLE_RATE` seconds of a track from `start`, as 48 kHz stereo, scaled by `gain`. */
async function renderItemAudio(
  track: InputAudioTrack,
  start: number,
  frames: number,
  gain: number,
  signal: AbortSignal | undefined,
): Promise<AudioBuffer> {
  const sourceRate = await track.getSampleRate()
  const channelCount = await track.getNumberOfChannels()
  const span = frames / SAMPLE_RATE
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
  // Resample to 48 kHz and mix to stereo (mono plays on both sides), applying gain.
  const mixer = new OfflineAudioContext({ numberOfChannels: CHANNELS, length: frames, sampleRate: SAMPLE_RATE })
  const node = new AudioBufferSourceNode(mixer, { buffer: segment })
  const gainNode = new GainNode(mixer, { gain })
  node.connect(gainNode).connect(mixer.destination)
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
