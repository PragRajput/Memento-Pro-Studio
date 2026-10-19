import { ALL_FORMATS, BlobSource, Input } from 'mediabunny'
import type { AudioClip, MediaClip } from './types.ts'

const THUMBNAIL_WIDTH = 160

/**
 * Read an imported file and classify it. A container's extension or declared MIME
 * type (such as `.webm`) can hold either video or audio, so this decides by what
 * actually decodes: a file that plays with no video frames (reported as 0x0) is
 * treated as audio, regardless of what the browser guessed from its name.
 */
export async function loadMedia(
  file: File,
): Promise<{ kind: 'video'; clip: MediaClip } | { kind: 'audio'; clip: AudioClip }> {
  if (file.type.startsWith('audio/')) return { kind: 'audio', clip: await loadAudioClip(file) }
  try {
    const clip = await loadClip(file)
    if (clip.width > 0 && clip.height > 0) return { kind: 'video', clip }
    // Decoded, but carried no picture: an audio file the browser guessed was video.
    URL.revokeObjectURL(clip.url)
    return { kind: 'audio', clip: await loadAudioClip(file) }
  } catch (videoError) {
    try {
      return { kind: 'audio', clip: await loadAudioClip(file) }
    } catch {
      throw videoError
    }
  }
}

/** Read a video file's metadata and an early frame without uploading it anywhere. */
export async function loadClip(file: File): Promise<MediaClip> {
  const url = URL.createObjectURL(file)
  try {
    let displayWidth = 0
    let displayHeight = 0
    let demuxerDuration = NaN

    // Check demuxer for exact display dimensions (respects container rotation tags like iPhone portrait 90°)
    try {
      const input = new Input({ source: new BlobSource(file), formats: ALL_FORMATS })
      const videoTrack = await input.getPrimaryVideoTrack()
      if (videoTrack) {
        displayWidth = await videoTrack.getDisplayWidth()
        displayHeight = await videoTrack.getDisplayHeight()
      }
      const dur = await input.computeDuration()
      if (Number.isFinite(dur) && dur > 0) demuxerDuration = dur
      input.dispose()
    } catch {
      // demuxer fallback
    }

    const video = document.createElement('video')
    video.preload = 'metadata'
    video.muted = true
    video.playsInline = true
    video.src = url
    await waitFor(video, 'loadedmetadata')
    const duration =
      Number.isFinite(demuxerDuration) && demuxerDuration > 0
        ? demuxerDuration
        : await resolveDuration(video)

    const finalWidth = displayWidth > 0 ? displayWidth : video.videoWidth
    const finalHeight = displayHeight > 0 ? displayHeight : video.videoHeight

    // The very first frame is often black, so sample slightly later.
    video.currentTime = Math.min(1, Number.isFinite(duration) ? duration / 2 : 0)
    await waitFor(video, 'seeked')

    return {
      id: crypto.randomUUID(),
      name: file.name,
      file,
      url,
      duration,
      width: finalWidth,
      height: finalHeight,
      thumbnail: captureFrame(video, finalWidth, finalHeight),
    }
  } catch (error) {
    URL.revokeObjectURL(url)
    throw error
  }
}

/** Read an audio file's length without uploading it anywhere. */
export async function loadAudioClip(file: File): Promise<AudioClip> {
  const url = URL.createObjectURL(file)
  try {
    let duration = NaN

    // 1. Try mediabunny demuxer: computes exact duration without browser seeking quirks
    try {
      const input = new Input({ source: new BlobSource(file), formats: ALL_FORMATS })
      const computed = await input.computeDuration()
      input.dispose()
      if (Number.isFinite(computed) && computed > 0) duration = computed
    } catch {
      // mediabunny fallback
    }

    // 2. Try HTMLAudioElement
    if (!Number.isFinite(duration) || duration <= 0) {
      try {
        const audio = document.createElement('audio')
        audio.preload = 'metadata'
        audio.src = url
        await waitFor(audio, 'loadedmetadata')
        const audioElemDuration = await resolveDuration(audio)
        if (Number.isFinite(audioElemDuration) && audioElemDuration > 0) duration = audioElemDuration
      } catch {
        // audio element fallback
      }
    }

    // 3. Fallback to Web Audio API decodeAudioData
    if (!Number.isFinite(duration) || duration <= 0) {
      try {
        const AudioCtx = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
        const ctx = new AudioCtx()
        const buffer = await ctx.decodeAudioData(await file.arrayBuffer())
        duration = buffer.duration
        await ctx.close()
      } catch {
        // ignore
      }
    }

    return { id: crypto.randomUUID(), name: file.name, file, url, duration }
  } catch (error) {
    URL.revokeObjectURL(url)
    throw error
  }
}

/** Some recordings (such as browser-made WebM files) omit their length; seeking far
 * past the end makes the browser scan the file and compute it. */
async function resolveDuration(media: HTMLMediaElement): Promise<number> {
  if (Number.isFinite(media.duration) && media.duration > 0) return media.duration
  try {
    media.currentTime = Number.MAX_SAFE_INTEGER
    await Promise.race([
      waitFor(media, 'seeked'),
      new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 800)),
    ])
  } catch {
    // continue
  }
  return media.duration
}


function waitFor(media: HTMLMediaElement, event: 'loadedmetadata' | 'seeked'): Promise<void> {
  return new Promise((resolve, reject) => {
    const onEvent = () => {
      cleanup()
      resolve()
    }
    const onError = () => {
      cleanup()
      reject(new Error('This browser cannot play this file format.'))
    }
    const cleanup = () => {
      media.removeEventListener(event, onEvent)
      media.removeEventListener('error', onError)
    }
    media.addEventListener(event, onEvent)
    media.addEventListener('error', onError)
  })
}

function captureFrame(video: HTMLVideoElement, width?: number, height?: number): string {
  const canvas = document.createElement('canvas')
  const aspect =
    width && height && width > 0
      ? height / width
      : video.videoWidth > 0
        ? video.videoHeight / video.videoWidth
        : 9 / 16
  canvas.width = THUMBNAIL_WIDTH
  canvas.height = Math.max(1, Math.round(THUMBNAIL_WIDTH * aspect))
  canvas.getContext('2d')?.drawImage(video, 0, 0, canvas.width, canvas.height)
  return canvas.toDataURL('image/jpeg', 0.7)
}
