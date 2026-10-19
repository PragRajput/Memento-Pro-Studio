import { useCallback, useEffect, useRef, useState } from 'react'
import type { RefObject } from 'react'
import { clamp, itemLength, itemStarts, locate, timelineDuration } from './timeline.ts'
import { locateTransition } from './transitionTimeline.ts'
import type { MediaClip, TimelineItem, Transition, TransitionType } from './types.ts'

/** How close to an item's out point playback moves on to the next item. */
const END_TOLERANCE = 0.02

function hideElement(el: HTMLElement | null) {
  if (el) el.style.display = 'none'
}

function resetElementStyles(el: HTMLElement | null) {
  if (!el) return
  el.style.opacity = '1'
  el.style.clipPath = 'none'
  el.style.transform = 'none'
  el.style.filter = 'none'
}

/**
 * Plays timeline items (both video and still photos) back to back through video
 * and image elements and tracks the playhead. Smoothly composites 13 modern transitions
 * (crossfade, flash white, wipes, slides, zoom in/out, iris, blur dissolve)
 * between adjacent clips during playback and scrubbing.
 */
export function useSequencePlayer(
  videoRef: RefObject<HTMLVideoElement | null>,
  secondaryVideoRef: RefObject<HTMLVideoElement | null>,
  items: readonly TimelineItem[],
  clips: ReadonlyMap<string, MediaClip>,
  transitions: readonly Transition[] = [],
  totalDuration?: number,
  imageRef?: RefObject<HTMLImageElement | null>,
  secondaryImageRef?: RefObject<HTMLImageElement | null>,
) {
  const [requestedTime, setTime] = useState(0)
  const [playing, setPlaying] = useState(false)
  const frameRef = useRef(0)
  const latestItems = useRef(items)
  const duration = Math.max(timelineDuration(items), totalDuration ?? 0)
  const time = Math.min(requestedTime, duration)

  const pause = useCallback(() => {
    cancelAnimationFrame(frameRef.current)
    videoRef.current?.pause()
    if (secondaryVideoRef.current !== null) {
      secondaryVideoRef.current.pause()
    }
    hideElement(secondaryVideoRef.current)
    hideElement(secondaryImageRef?.current ?? null)
    resetElementStyles(videoRef.current)
    resetElementStyles(imageRef?.current ?? null)
    setPlaying(false)
  }, [videoRef, secondaryVideoRef, imageRef, secondaryImageRef])

  useEffect(() => {
    latestItems.current = items
  }, [items])

  useEffect(() => () => cancelAnimationFrame(frameRef.current), [])

  const renderStageAt = useCallback(
    (t: number, isPlaying: boolean) => {
      const video = videoRef.current
      const secVideo = secondaryVideoRef.current
      const image = imageRef?.current ?? null
      const secImage = secondaryImageRef?.current ?? null
      if (video === null && image === null) return

      const activeTransition = locateTransition(items, transitions, t)
      if (activeTransition !== null) {
        const { itemA, itemB, progress, sourceTimeA, sourceTimeB, transition, indexB } = activeTransition
        const starts = itemStarts(items)
        const cutTime = starts[indexB]
        const clipA = clips.get(itemA.clipId)
        const clipB = clips.get(itemB.clipId)

        if (clipA !== undefined && clipB !== undefined) {
          // In transition:
          // Clip A is on primary element: plays up to cutTime, then holds its last frame.
          // Clip B is on secondary element: waits at inPoint until cutTime, then plays from cutTime onward.
          const isAActive = isPlaying && t < cutTime
          const isBActive = isPlaying && t >= cutTime

          const elA = renderPrimaryClip(clipA, itemA.muted, sourceTimeA, video, image, isAActive)
          const elB = renderSecondaryClip(clipB, itemB.muted, sourceTimeB, secVideo, secImage, isPlaying, isBActive)

          if (elA && elB) {
            applyTransitionStyle(elA, elB, transition.type, progress)
          }
          return
        }
      }

      const position = locate(items, t)
      const item = position === null ? undefined : items[position.index]
      const clip = item === undefined ? undefined : clips.get(item.clipId)

      if (position === null || item === undefined || clip === undefined) {
        hideElement(secVideo)
        hideElement(secImage)
        if (secVideo && !secVideo.paused) {
          secVideo.pause()
        }
        if (items.length > 0 && t >= timelineDuration(items)) {
          const lastItem = items[items.length - 1]
          const lastClip = clips.get(lastItem.clipId)
          if (lastClip !== undefined) {
            const el = renderPrimaryClip(
              lastClip,
              lastItem.muted,
              Math.max(lastItem.inPoint, lastItem.outPoint - END_TOLERANCE),
              video,
              image,
              false,
            )
            resetElementStyles(el)
            return
          }
        }
        renderPrimaryClip(undefined, false, 0, video, image, false)
        return
      }

      const targetSourceTime = item.inPoint + Math.min(position.offset, itemLength(item) - END_TOLERANCE)
      const el = renderPrimaryClip(clip, item.muted, targetSourceTime, video, image, isPlaying)
      resetElementStyles(el)

      // Graceful hand-off from secondary layer to primary layer:
      // While primary is preparing/loading the new clip, keep secondary visible on top (z-index: 2)
      // to eliminate any momentary black blink. Once primary is ready to paint, hide secondary.
      if (isPlaying) {
        const primaryReady =
          clip.mediaType === 'image'
            ? image && image.complete
            : video && video.src === clip.url && video.readyState >= 2 && !video.seeking

        if (primaryReady) {
          hideElement(secVideo)
          hideElement(secImage)
          if (secVideo && !secVideo.paused) {
            secVideo.pause()
          }
        } else {
          // Keep secondary active and unclipped on top while primary readies its first frame
          resetElementStyles(secVideo)
          resetElementStyles(secImage)
        }
      } else {
        hideElement(secVideo)
        hideElement(secImage)
        if (secVideo && !secVideo.paused) {
          secVideo.pause()
        }
      }
    },
    [videoRef, secondaryVideoRef, imageRef, secondaryImageRef, items, clips, transitions],
  )

  // While paused, render the frame/photo under the playhead whenever time or items change.
  useEffect(() => {
    if (playing) return
    renderStageAt(time, false)
  }, [renderStageAt, time, playing])

  const play = useCallback(() => {
    if (duration <= 0) return
    const startTime = time >= duration - END_TOLERANCE ? 0 : time

    let currentTimelineTime = startTime
    let lastTickTimestamp = performance.now()
    setTime(startTime)
    setPlaying(true)

    const tick = (now: number) => {
      if (latestItems.current !== items) {
        pause()
        return
      }

      const delta = (now - lastTickTimestamp) / 1000
      lastTickTimestamp = now

      currentTimelineTime += delta

      if (currentTimelineTime >= duration) {
        pause()
        setTime(duration)
        return
      }

      setTime(currentTimelineTime)
      renderStageAt(currentTimelineTime, true)
      frameRef.current = requestAnimationFrame(tick)
    }

    renderStageAt(startTime, true)
    frameRef.current = requestAnimationFrame(tick)
  }, [items, renderStageAt, time, duration, pause])

  const seek = useCallback(
    (target: number) => {
      pause()
      const clamped = clamp(target, 0, duration)
      setTime(clamped)
      renderStageAt(clamped, false)
    },
    [pause, duration, renderStageAt],
  )

  return { time, duration, playing, play, pause, seek }
}

function renderPrimaryClip(
  clip: MediaClip | undefined,
  muted: boolean,
  targetSourceTime: number,
  video: HTMLVideoElement | null,
  image: HTMLImageElement | null,
  isPlaying: boolean,
): HTMLElement | null {
  if (!clip) {
    if (video) {
      video.removeAttribute('src')
      video.load()
      video.style.display = 'none'
    }
    if (image) {
      image.removeAttribute('src')
      image.style.display = 'none'
    }
    return null
  }

  const safeTime = Number.isFinite(targetSourceTime) ? Math.max(0, targetSourceTime) : 0

  if (clip.mediaType === 'image') {
    if (video) {
      video.pause()
      video.style.display = 'none'
    }
    if (image) {
      if (image.src !== clip.url) image.src = clip.url
      image.style.display = 'block'
      return image
    }
    return null
  } else {
    if (image) image.style.display = 'none'
    if (video) {
      video.style.display = 'block'
      video.muted = muted
      if (video.src !== clip.url) {
        video.src = clip.url
        if (safeTime > 0) {
          const onMeta = () => {
            try {
              video.currentTime = safeTime
            } catch {
              // ignore
            }
          }
          if (video.readyState >= 1) {
            onMeta()
          } else {
            video.addEventListener('loadedmetadata', onMeta, { once: true })
          }
        } else {
          video.currentTime = 0
        }
        if (isPlaying) {
          video.play().catch(ignoreInterruptedPlay)
        }
      } else {
        if (isPlaying) {
          if (video.paused) {
            video.play().catch(ignoreInterruptedPlay)
          }
          if (Math.abs(video.currentTime - safeTime) > 0.25) {
            video.currentTime = safeTime
          }
        } else {
          if (!video.paused) {
            video.pause()
          }
          if (Math.abs(video.currentTime - safeTime) > 0.04) {
            video.currentTime = safeTime
          }
        }
      }
      return video
    }
    return null
  }
}

function renderSecondaryClip(
  clip: MediaClip | undefined,
  muted: boolean,
  targetSourceTime: number,
  secVideo: HTMLVideoElement | null,
  secImage: HTMLImageElement | null,
  isPlaying: boolean,
  shouldPlay: boolean,
): HTMLElement | null {
  if (!clip) {
    if (secVideo) {
      secVideo.pause()
      secVideo.style.display = 'none'
    }
    if (secImage) {
      secImage.style.display = 'none'
    }
    return null
  }

  const safeTime = Number.isFinite(targetSourceTime) ? Math.max(0, targetSourceTime) : 0

  if (clip.mediaType === 'image') {
    if (secVideo) {
      secVideo.pause()
      secVideo.style.display = 'none'
    }
    if (secImage) {
      if (secImage.src !== clip.url) secImage.src = clip.url
      secImage.style.display = 'block'
      return secImage
    }
    return null
  } else {
    if (secImage) secImage.style.display = 'none'
    if (secVideo) {
      secVideo.style.display = 'block'
      secVideo.muted = muted
      if (secVideo.src !== clip.url) {
        secVideo.src = clip.url
        secVideo.currentTime = safeTime
        if (isPlaying && shouldPlay) {
          secVideo.play().catch(ignoreInterruptedPlay)
        }
      } else {
        if (isPlaying && shouldPlay) {
          if (secVideo.paused) {
            secVideo.play().catch(ignoreInterruptedPlay)
          }
          if (Math.abs(secVideo.currentTime - safeTime) > 0.25) {
            secVideo.currentTime = safeTime
          }
        } else {
          if (!secVideo.paused) {
            secVideo.pause()
          }
          if (Math.abs(secVideo.currentTime - safeTime) > 0.04) {
            secVideo.currentTime = safeTime
          }
        }
      }
      return secVideo
    }
    return null
  }
}

export function applyTransitionStyle(
  primary: HTMLElement,
  secondary: HTMLElement,
  type: TransitionType,
  progress: number,
) {
  const p = clamp(progress, 0, 1)

  // Reset transforms and filters
  primary.style.transform = 'none'
  secondary.style.transform = 'none'
  primary.style.filter = 'none'
  secondary.style.filter = 'none'
  primary.style.clipPath = 'none'
  secondary.style.clipPath = 'none'

  if (type === 'crossfade') {
    primary.style.opacity = '1'
    secondary.style.opacity = `${p}`
  } else if (type === 'fade-black') {
    if (p < 0.5) {
      primary.style.opacity = `${1 - p * 2}`
      secondary.style.opacity = '0'
    } else {
      primary.style.opacity = '0'
      secondary.style.opacity = `${(p - 0.5) * 2}`
    }
  } else if (type === 'fade-white') {
    if (p < 0.5) {
      primary.style.opacity = '1'
      primary.style.filter = `brightness(${1 + p * 4})`
      secondary.style.opacity = '0'
    } else {
      primary.style.opacity = '0'
      secondary.style.opacity = '1'
      secondary.style.filter = `brightness(${1 + (1 - p) * 4})`
    }
  } else if (type === 'wipe-left') {
    primary.style.opacity = '1'
    secondary.style.opacity = '1'
    secondary.style.clipPath = `inset(0 calc(${(1 - p) * 100}%) 0 0)`
  } else if (type === 'wipe-right') {
    primary.style.opacity = '1'
    secondary.style.opacity = '1'
    secondary.style.clipPath = `inset(0 0 0 calc(${(1 - p) * 100}%))`
  } else if (type === 'wipe-up') {
    primary.style.opacity = '1'
    secondary.style.opacity = '1'
    secondary.style.clipPath = `inset(0 0 calc(${(1 - p) * 100}%) 0)`
  } else if (type === 'wipe-down') {
    primary.style.opacity = '1'
    secondary.style.opacity = '1'
    secondary.style.clipPath = `inset(calc(${(1 - p) * 100}%) 0 0 0)`
  } else if (type === 'slide-left') {
    primary.style.opacity = '1'
    secondary.style.opacity = '1'
    primary.style.transform = `translateX(-${p * 100}%)`
    secondary.style.transform = `translateX(${(1 - p) * 100}%)`
  } else if (type === 'slide-right') {
    primary.style.opacity = '1'
    secondary.style.opacity = '1'
    primary.style.transform = `translateX(${p * 100}%)`
    secondary.style.transform = `translateX(-${(1 - p) * 100}%)`
  } else if (type === 'zoom-in') {
    primary.style.transform = `scale(${1 + p * 0.35})`
    primary.style.opacity = `${1 - p * 0.4}`
    secondary.style.transform = `scale(${1 + (1 - p) * 0.15})`
    secondary.style.opacity = `${p}`
  } else if (type === 'zoom-out') {
    primary.style.transform = `scale(${1 - p * 0.15})`
    primary.style.opacity = `${1 - p}`
    secondary.style.transform = `scale(${1.35 - p * 0.35})`
    secondary.style.opacity = `${p}`
  } else if (type === 'iris-circle') {
    primary.style.opacity = '1'
    secondary.style.opacity = '1'
    secondary.style.clipPath = `circle(${p * 75}% at 50% 50%)`
  } else if (type === 'blur-dissolve') {
    primary.style.filter = `blur(${p * 16}px)`
    primary.style.opacity = `${1 - p}`
    secondary.style.filter = `blur(${(1 - p) * 16}px)`
    secondary.style.opacity = `${p}`
  }
}

function ignoreInterruptedPlay(error: unknown) {
  if (!(error instanceof DOMException && error.name === 'AbortError')) console.error(error)
}
