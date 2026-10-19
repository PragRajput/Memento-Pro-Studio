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
    let pitches: number[] | undefined
    try {
      const analysis = await extractAudioPeaks(file, 600)
      peaks = analysis.peaks
      pitches = analysis.pitches
    } catch {
      const fallback = generateFallbackPeaks(600, file.name)
      peaks = fallback.peaks
      pitches = fallback.pitches
    }

    return { id: crypto.randomUUID(), name: file.name, file, url, duration, peaks, pitches }
  } catch (error) {
    URL.revokeObjectURL(url)
    throw error
  }
}

export interface AudioAnalysis {
  peaks: number[]
  pitches: number[]
}

/**
 * Extract normalized audio amplitude peaks and pitch frequencies from an audio file.
 * Highly robust across Chrome, Safari, Firefox, and WebKit on macOS and iOS.
 */
export async function extractAudioPeaks(file: File, samplesCount = 600): Promise<AudioAnalysis> {
  if (typeof window === 'undefined') {
    return generateFallbackPeaks(samplesCount, file.name)
  }

  // Prefer OfflineAudioContext which bypasses autoplay policy restrictions & acquires no audio hardware
  const OfflineCtx =
    window.OfflineAudioContext ??
    (window as unknown as { webkitOfflineAudioContext: typeof OfflineAudioContext }).webkitOfflineAudioContext
  const AudioCtx =
    window.AudioContext ??
    (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext

  let ctx: BaseAudioContext | null = null
  try {
    if (OfflineCtx) {
      ctx = new OfflineCtx(1, 1, 44100)
    } else if (AudioCtx) {
      ctx = new AudioCtx()
    }
  } catch {
    // context instantiation fallback
  }

  if (!ctx) {
    return generateFallbackPeaks(samplesCount, file.name)
  }

  try {
    const arrayBuffer = await file.arrayBuffer()
    const bufferCopy = arrayBuffer.slice(0)

    // Robust Promise wrapper supporting callback-only Safari/WebKit and Promise-based modern browsers
    const audioBuffer = await new Promise<AudioBuffer>((resolve, reject) => {
      let settled = false
      const onDecoded = (buf: AudioBuffer) => {
        if (!settled) {
          settled = true
          resolve(buf)
        }
      }
      const onError = (err: unknown) => {
        if (!settled) {
          settled = true
          reject(err)
        }
      }

      try {
        const result = ctx!.decodeAudioData(bufferCopy, onDecoded, onError)
        if (result && typeof (result as Promise<AudioBuffer>).then === 'function') {
          (result as Promise<AudioBuffer>).then(onDecoded, onError)
        }
      } catch (err) {
        onError(err)
      }
    })

    const channelCount = audioBuffer.numberOfChannels
    const totalFrames = audioBuffer.length
    if (channelCount === 0 || totalFrames === 0) {
      return generateFallbackPeaks(samplesCount, file.name)
    }

    const channels: Float32Array[] = []
    for (let c = 0; c < Math.min(2, channelCount); c++) {
      channels.push(audioBuffer.getChannelData(c))
    }

    const step = Math.max(1, Math.floor(totalFrames / samplesCount))
    const peaks: number[] = new Array(samplesCount)
    const pitches: number[] = new Array(samplesCount)

    let maxPeak = 0.0001
    let maxPitch = 0.0001

    for (let i = 0; i < samplesCount; i++) {
      const start = i * step
      const end = Math.min(start + step, totalFrames)
      let sumSquare = 0
      let localMax = 0
      let zeroCrossings = 0
      let prevVal = 0

      for (let j = start; j < end; j++) {
        let sample = 0
        for (let c = 0; c < channels.length; c++) {
          sample += channels[c][j]
        }
        sample /= channels.length
        const abs = Math.abs(sample)
        if (abs > localMax) localMax = abs
        sumSquare += abs * abs

        if (j > start && (sample >= 0) !== (prevVal >= 0)) {
          zeroCrossings++
        }
        prevVal = sample
      }

      const count = Math.max(1, end - start)
      const rms = Math.sqrt(sumSquare / count)
      // Amplitude combines peak impact and RMS energy
      const combinedAmp = 0.65 * localMax + 0.35 * (rms * 1.8)
      // Zero-crossing rate estimates pitch / frequency brightness
      const zcr = zeroCrossings / count

      peaks[i] = combinedAmp
      pitches[i] = zcr
      if (combinedAmp > maxPeak) maxPeak = combinedAmp
      if (zcr > maxPitch) maxPitch = zcr
    }

    // Normalize amplitude [0.06 .. 1.0] and pitch [0.08 .. 1.0]
    for (let i = 0; i < samplesCount; i++) {
      peaks[i] = Math.min(1, Math.max(0.06, Number((peaks[i] / maxPeak).toFixed(3))))
      pitches[i] = Math.min(1, Math.max(0.08, Number((pitches[i] / maxPitch).toFixed(3))))
    }

    return { peaks, pitches }
  } catch (err) {
    console.warn('Audio decoding failed, using organic musical fallback:', err)
    return generateFallbackPeaks(samplesCount, file.name)
  } finally {
    if ('close' in ctx && typeof ctx.close === 'function') {
      try {
        await ctx.close()
      } catch {
        // ignore close error
      }
    }
  }
}

/**
 * Deterministic fallback generator for environments without Web Audio API (e.g. tests)
 * or corrupted audio streams. Produces rich, realistic dynamic song structures with
 * varied pitch contours and amplitude drops.
 */
export function generateFallbackPeaks(samplesCount = 600, seedStr = 'audio'): AudioAnalysis {
  let hash = 0
  for (let i = 0; i < seedStr.length; i++) {
    hash = (hash << 5) - hash + seedStr.charCodeAt(i)
    hash |= 0
  }
  const peaks: number[] = new Array(samplesCount)
  const pitches: number[] = new Array(samplesCount)

  for (let i = 0; i < samplesCount; i++) {
    const t = i / samplesCount
    // Dynamic song sections: Intro -> Verse -> Chorus -> Bridge -> Climax -> Outro
    const songSections =
      t < 0.15
        ? 0.3 + 0.2 * Math.sin(t * 30) // Intro build
        : t < 0.45
        ? 0.55 + 0.35 * Math.sin(t * 18) // Verse 1 / Chorus
        : t < 0.6
        ? 0.4 + 0.25 * Math.sin(t * 22) // Bridge / breakdown
        : t < 0.88
        ? 0.75 + 0.25 * Math.sin(t * 26) // High energy Climax / Chorus 2
        : 0.3 * (1 - (t - 0.88) / 0.12) // Outro fade

    // Musical pitch shifts (melodic vocal contours + bass drops)
    const pitchCurve =
      Math.abs(Math.sin(t * 15 + hash)) * 0.5 + Math.abs(Math.cos(t * 43)) * 0.35 + 0.15
    const beatPulse = Math.pow(Math.abs(Math.sin(t * 64 * Math.PI)), 4) * 0.4
    const flutter = Math.abs(Math.sin((hash + i) * 8273)) * 0.15

    const combinedAmp = Math.min(1, Math.max(0.06, songSections * 0.7 + beatPulse * 0.2 + flutter * 0.1))
    const combinedPitch = Math.min(1, Math.max(0.08, pitchCurve * 0.8 + flutter * 0.2))

    peaks[i] = Number(combinedAmp.toFixed(3))
    pitches[i] = Number(combinedPitch.toFixed(3))
  }
  return { peaks, pitches }
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
