import { ALL_FORMATS, BlobSource, Input } from 'mediabunny'
import type { AudioClip, MediaClip } from './types.ts'

const THUMBNAIL_WIDTH = 160

const DEFAULT_IMAGE_DURATION = 4.0 // 4 seconds default duration on timeline

/**
 * Read an imported file and classify it.
 * Supports Video, Audio, and Photos (JPEG, PNG, WebP, GIF, SVG, etc.).
 */
export async function loadMedia(
  file: File,
): Promise<{ kind: 'video'; clip: MediaClip } | { kind: 'audio'; clip: AudioClip }> {
  if (file.type.startsWith('audio/')) return { kind: 'audio', clip: await loadAudioClip(file) }
  if (file.type.startsWith('image/') || isImageFilename(file.name)) {
    return { kind: 'video', clip: await loadImageClip(file) }
  }
  try {
    const clip = await loadClip(file)
    clip.mediaType = 'video'
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

function isImageFilename(name: string): boolean {
  return /\.(jpe?g|png|webp|gif|svg|avif|bmp|tiff?)$/i.test(name)
}

/** Read a still photo or graphic file's metadata without uploading it anywhere. */
export async function loadImageClip(file: File): Promise<MediaClip> {
  const url = URL.createObjectURL(file)
  try {
    const img = new Image()
    img.src = url
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve()
      img.onerror = () => reject(new Error('This image format could not be decoded.'))
    })

    const width = img.naturalWidth || 1920
    const height = img.naturalHeight || 1080

    // Capture small thumbnail
    const canvas = document.createElement('canvas')
    const aspect = width > 0 ? height / width : 9 / 16
    canvas.width = THUMBNAIL_WIDTH
    canvas.height = Math.max(1, Math.round(THUMBNAIL_WIDTH * aspect))
    const ctx = canvas.getContext('2d')
    ctx?.drawImage(img, 0, 0, canvas.width, canvas.height)
    const thumbnail = canvas.toDataURL('image/jpeg', 0.8)

    return {
      id: crypto.randomUUID(),
      name: file.name,
      file,
      url,
      duration: DEFAULT_IMAGE_DURATION,
      width,
      height,
      thumbnail,
      mediaType: 'image',
    }
  } catch (error) {
    URL.revokeObjectURL(url)
    throw error
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

    // 4. Extract real amplitude/pitch peaks for waveform visualization
    let peaks: number[] | undefined
    try {
      peaks = await extractAudioPeaks(file, 400)
    } catch {
      peaks = generateFallbackPeaks(400, file.name)
    }

    return { id: crypto.randomUUID(), name: file.name, file, url, duration, peaks }
  } catch (error) {
    URL.revokeObjectURL(url)
    throw error
  }
}

/**
 * Extract normalized audio peaks from an audio file using Web Audio API.
 * Returns an array of normalized values [0.06 .. 1.0] representing amplitude/dynamics across the clip.
 * Gracefully falls back to deterministic pseudo-peaks if decode is unavailable or fails.
 */
export async function extractAudioPeaks(file: File, samplesCount = 400): Promise<number[]> {
  if (typeof window === 'undefined') {
    return generateFallbackPeaks(samplesCount, file.name)
  }
  const AudioCtx =
    window.AudioContext ??
    (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
  if (!AudioCtx) {
    return generateFallbackPeaks(samplesCount, file.name)
  }

  try {
    const ctx = new AudioCtx()
    try {
      const arrayBuffer = await file.arrayBuffer()
      // Copy arrayBuffer in case decodeAudioData detaches the underlying ArrayBuffer
      const bufferCopy = arrayBuffer.slice(0)
      const audioBuffer = await ctx.decodeAudioData(bufferCopy)
      const channelCount = audioBuffer.numberOfChannels
      if (channelCount === 0 || audioBuffer.length === 0) {
        return generateFallbackPeaks(samplesCount, file.name)
      }

      // Mix stereo / surround channels down to mono for balanced amplitude envelope
      const channels: Float32Array[] = []
      for (let c = 0; c < Math.min(2, channelCount); c++) {
        channels.push(audioBuffer.getChannelData(c))
      }

      const totalFrames = audioBuffer.length
      const step = Math.max(1, Math.floor(totalFrames / samplesCount))
      const peaks: number[] = new Array(samplesCount)
      let maxPeak = 0.0001

      for (let i = 0; i < samplesCount; i++) {
        const start = i * step
        const end = Math.min(start + step, totalFrames)
        let sumSquare = 0
        let localMax = 0

        for (let j = start; j < end; j++) {
          let sample = 0
          for (let c = 0; c < channels.length; c++) {
            sample += channels[c][j]
          }
          sample /= channels.length
          const abs = Math.abs(sample)
          if (abs > localMax) localMax = abs
          sumSquare += abs * abs
        }

        const count = Math.max(1, end - start)
        const rms = Math.sqrt(sumSquare / count)
        // Combine peak and RMS for a natural musical waveform
        const combined = 0.65 * localMax + 0.35 * (rms * 1.8)
        peaks[i] = combined
        if (combined > maxPeak) maxPeak = combined
      }

      // Normalize to range [0.06, 1.0]
      for (let i = 0; i < samplesCount; i++) {
        const normalized = peaks[i] / maxPeak
        peaks[i] = Math.min(1, Math.max(0.06, Number(normalized.toFixed(3))))
      }
      return peaks
    } finally {
      try {
        await ctx.close()
      } catch {
        // ignore close error
      }
    }
  } catch (err) {
    console.warn('AudioContext decoding failed, falling back to simulated peaks:', err)
    return generateFallbackPeaks(samplesCount, file.name)
  }
}

/**
 * Deterministic fallback peak generator for environments without Web Audio API (e.g. tests)
 * or corrupted audio streams. Produces realistic dynamic musical profiles.
 */
export function generateFallbackPeaks(samplesCount = 400, seedStr = 'audio'): number[] {
  let hash = 0
  for (let i = 0; i < seedStr.length; i++) {
    hash = (hash << 5) - hash + seedStr.charCodeAt(i)
    hash |= 0
  }
  const peaks: number[] = new Array(samplesCount)
  for (let i = 0; i < samplesCount; i++) {
    const t = i / samplesCount
    const macroEnvelope = Math.sin(t * Math.PI) * 0.4 + 0.3 + 0.2 * Math.sin(t * 14)
    const beat = Math.abs(Math.sin(t * 70)) * 0.25
    const noise = Math.abs(Math.sin((hash + i) * 9973)) * 0.2
    peaks[i] = Math.min(1, Math.max(0.06, Number((macroEnvelope + beat + noise).toFixed(3))))
  }
  return peaks
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
