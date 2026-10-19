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

  // While paused, show the frame/photo under the playhead, rendering transition if in window.
  useEffect(() => {
    const video = videoRef.current
    const secVideo = secondaryVideoRef.current
    const image = imageRef?.current ?? null
    const secImage = secondaryImageRef?.current ?? null
    if (playing || (video === null && image === null)) return

    const activeTransition = locateTransition(items, transitions, time)
    if (activeTransition !== null) {
      const { itemA, itemB, progress, sourceTimeA, sourceTimeB, transition } = activeTransition
      const clipA = clips.get(itemA.clipId)
      const clipB = clips.get(itemB.clipId)
      if (clipA !== undefined && clipB !== undefined) {
        const elA = showClipOnElement(clipA, itemA.muted, sourceTimeA, video, image)
        const elB = showClipOnElement(clipB, true, sourceTimeB, secVideo, secImage)
        if (elA && elB) {
          applyTransitionStyle(elA, elB, transition.type, progress)
        }
        return
      }
    }

    hideElement(secVideo)
    hideElement(secImage)
    resetElementStyles(video)
    resetElementStyles(image)

    const position = locate(items, time)
    const item = position === null ? undefined : items[position.index]
    const clip = item === undefined ? undefined : clips.get(item.clipId)
    if (position === null || item === undefined || clip === undefined) {
      if (items.length > 0 && time >= timelineDuration(items)) {
        const lastItem = items[items.length - 1]
        const lastClip = clips.get(lastItem.clipId)
        if (lastClip !== undefined) {
          showClipOnElement(
            lastClip,
            lastItem.muted,
            Math.max(lastItem.inPoint, lastItem.outPoint - END_TOLERANCE),
            video,
            image,
          )
          return
        }
      }
      showClipOnElement(undefined, false, 0, video, image)
      return
    }

    showClipOnElement(
      clip,
      item.muted,
      item.inPoint + Math.min(position.offset, itemLength(item) - END_TOLERANCE),
      video,
      image,
    )
  }, [videoRef, secondaryVideoRef, imageRef, secondaryImageRef, items, clips, transitions, time, playing])

  const play = useCallback(() => {
    if (duration <= 0) return
    const video = videoRef.current
    const secVideo = secondaryVideoRef.current
    const image = imageRef?.current ?? null
    const secImage = secondaryImageRef?.current ?? null
    const startTime = time >= duration - END_TOLERANCE ? 0 : time
    const vDuration = timelineDuration(items)

    if (items.length === 0) {
      // Audio-only timeline playback
      let lastTimestamp = performance.now()
      setTime(startTime)
      setPlaying(true)
      const tickTrailingOnly = (now: number) => {
        const delta = (now - lastTimestamp) / 1000
        lastTimestamp = now
        setTime((prev) => {
          const next = prev + delta
          if (next >= duration) {
            pause()
            return duration
          }
          return next
        })
        frameRef.current = requestAnimationFrame(tickTrailingOnly)
      }
      frameRef.current = requestAnimationFrame(tickTrailingOnly)
      return
    }

    const starts = itemStarts(items)
    const position = locate(items, startTime)
    if (position === null) return
    let index = position.index

    let currentItemTime = 0
    const enter = (itemIndex: number, offset: number): boolean => {
      const item = items[itemIndex]
      const clip = clips.get(item.clipId)
      if (clip === undefined) return false
      currentItemTime = item.inPoint + offset
      const el = showClipOnElement(clip, item.muted, currentItemTime, video, image)
      if (clip.mediaType !== 'image' && video) {
        video.currentTime = currentItemTime
        video.play().catch(ignoreInterruptedPlay)
      }
      resetElementStyles(el)
      return true
    }

    let lastTickTimestamp = performance.now()
    const tick = (now: number) => {
      if (latestItems.current !== items) {
        pause()
        return
      }

      const delta = (now - lastTickTimestamp) / 1000
      lastTickTimestamp = now

      if (index >= items.length) {
        setTime((prev) => {
          const next = prev + delta
          if (next >= duration) {
            pause()
            return duration
          }
          return next
        })
        frameRef.current = requestAnimationFrame(tick)
        return
      }

      const item = items[index]
      const clip = clips.get(item.clipId)
      if (clip === undefined) {
        pause()
        return
      }

      if (clip.mediaType === 'image') {
        currentItemTime += delta
      } else if (video) {
        currentItemTime = video.currentTime
      }

      const itemFinished =
        currentItemTime >= item.outPoint - END_TOLERANCE ||
        (clip.mediaType !== 'image' && video && video.ended)

      if (itemFinished) {
        index += 1
        if (index >= items.length) {
          video?.pause()
          if (duration <= vDuration + END_TOLERANCE) {
            pause()
            setTime(duration)
            return
          }
          frameRef.current = requestAnimationFrame(tick)
          return
        }
        if (!enter(index, 0)) {
          pause()
          setTime(duration)
          return
        }
      }

      const current = items[index]
      const currentProgressInItem = clamp(currentItemTime - current.inPoint, 0, itemLength(current))
      const currentTime = starts[index] + currentProgressInItem
      setTime(currentTime)

      const activeTransition = locateTransition(items, transitions, currentTime)
      if (activeTransition !== null) {
        const { itemA, itemB, progress, sourceTimeB, transition } = activeTransition
        const clipA = clips.get(itemA.clipId)
        const clipB = clips.get(itemB.clipId)
        if (clipA !== undefined && clipB !== undefined) {
          const elA = showClipOnElement(clipA, itemA.muted, currentItemTime, video, image)
          const elB = showClipOnElement(clipB, true, sourceTimeB, secVideo, secImage)
          if (clipB.mediaType !== 'image' && secVideo) {
            if (Math.abs(secVideo.currentTime - sourceTimeB) > 0.3) {
              secVideo.currentTime = sourceTimeB
            }
            if (secVideo.paused) {
              secVideo.play().catch(ignoreInterruptedPlay)
            }
          }
          if (elA && elB) {
            applyTransitionStyle(elA, elB, transition.type, progress)
          }
        }
      } else {
        if (secVideo && secVideo.style.display !== 'none') {
          secVideo.pause()
          secVideo.style.display = 'none'
        }
        if (secImage && secImage.style.display !== 'none') {
          secImage.style.display = 'none'
        }
        resetElementStyles(video)
        resetElementStyles(image)
      }

      frameRef.current = requestAnimationFrame(tick)
    }

    if (!enter(index, position.offset)) return
    setTime(startTime)
    setPlaying(true)
    lastTickTimestamp = performance.now()
    frameRef.current = requestAnimationFrame(tick)
  }, [videoRef, secondaryVideoRef, imageRef, secondaryImageRef, items, clips, transitions, time, duration, pause])

  const seek = useCallback(
    (target: number) => {
      pause()
      setTime(clamp(target, 0, duration))
    },
    [pause, duration],
  )

  return { time, duration, playing, play, pause, seek }
}

function showClipOnElement(
  clip: MediaClip | undefined,
  muted: boolean,
  currentTime: number,
  video: HTMLVideoElement | null,
  image: HTMLImageElement | null,
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

  if (clip.mediaType === 'image') {
    if (video) {
      video.style.display = 'none'
      video.pause()
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
      if (video.src !== clip.url) video.src = clip.url
      video.muted = muted
      video.style.display = 'block'
      if (Math.abs(video.currentTime - currentTime) > 0.04) {
        video.currentTime = currentTime
      }
      return video
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
