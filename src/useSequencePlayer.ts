import { useCallback, useEffect, useRef, useState } from 'react'
import type { RefObject } from 'react'
import { getClipTransform, getCssFilter } from './filters.ts'
import { clamp, locate, timelineDuration } from './timeline.ts'
import { evaluateTransform, transformToCss } from './transform.ts'
import type { EvaluatedTransform } from './transform.ts'
import { locateTransition, transitionAudioGains } from './transitionTimeline.ts'
import type { MediaClip, TimelineItem, Transition, TransitionType } from './types.ts'

/** How close to an item's out point playback moves on to the next item. */
const END_TOLERANCE = 0.02

function hideElement(el: HTMLElement | null) {
  if (el) el.style.display = 'none'
}

/**
 * The animated transform goes outside the clip's own orientation, matching the
 * export renderer, so a keyed rotation spins the upright picture.
 */
function combinedTransform(item: TimelineItem | null | undefined, animated: EvaluatedTransform): string {
  const orientation = getClipTransform(item)
  const motion = transformToCss(animated)
  if (!motion) return orientation
  return orientation === 'none' ? motion : `${motion} ${orientation}`
}

function resetElementStyles(el: HTMLElement | null, item?: TimelineItem | null, localTime = 0) {
  if (!el) return
  const animated = evaluateTransform(item, localTime)
  el.style.opacity = `${clamp(animated.opacity, 0, 1)}`
  el.style.clipPath = 'none'
  el.style.transform = combinedTransform(item, animated)
  el.style.filter = getCssFilter(item?.filter, item?.filterIntensity, item)
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

      const activeTransition = locateTransition(items, transitions, t, clips)
      if (activeTransition !== null) {
        const { itemA, itemB, progress, easedProgress, sourceTimeA, sourceTimeB, transition } = activeTransition
        const clipA = clips.get(itemA.clipId)
        const clipB = clips.get(itemB.clipId)

        if (clipA !== undefined && clipB !== undefined) {
          // In transition:
          // Clip A is on primary element: plays up to cutTime, then holds its last frame.
          // Clip B is on secondary element: waits at inPoint until cutTime, then plays from cutTime onward.
          // Both clips play right through the window, each running into the
          // unused source either side of the cut. Gating them on the cut time,
          // as this once did, froze whichever clip was not 'current'.
          const elA = renderPrimaryClip(clipA, itemA, sourceTimeA, video, image, isPlaying)
          const elB = renderSecondaryClip(clipB, itemB, sourceTimeB, secVideo, secImage, isPlaying, isPlaying)

          // Blend the two clips' own sound instead of hard-cutting at the join.
          const gains = transitionAudioGains(transition, progress)
          if (video !== null) video.volume = itemA.muted ? 0 : gains.a
          if (secVideo !== null) secVideo.volume = itemB.muted ? 0 : gains.b

          if (elA && elB) {
            applyTransitionStyle(
              elA,
              elB,
              transition.type,
              easedProgress,
              itemA,
              itemB,
              evaluateTransform(itemA, sourceTimeA - itemA.inPoint),
              evaluateTransform(itemB, sourceTimeB - itemB.inPoint),
            )
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
        const videoEnd = timelineDuration(items)
        const hasExtendedMedia = (totalDuration ?? 0) > videoEnd + END_TOLERANCE

        // If the song/timeline extends past the video clips, turn to a black screen once the video is over!
        if (hasExtendedMedia && t >= videoEnd) {
          renderPrimaryClip(undefined, undefined, 0, video, image, false)
          return
        }

        if (!hasExtendedMedia && items.length > 0 && t >= videoEnd - END_TOLERANCE) {
          const lastItem = items[items.length - 1]
          const lastClip = clips.get(lastItem.clipId)
          if (lastClip !== undefined) {
            const el = renderPrimaryClip(
              lastClip,
              lastItem,
              Math.max(lastItem.inPoint, lastItem.outPoint - END_TOLERANCE),
              video,
              image,
              false,
            )
            resetElementStyles(el, lastItem, (lastItem.outPoint - lastItem.inPoint) / (lastItem.speed ?? 1))
            return
          }
        }
        renderPrimaryClip(undefined, undefined, 0, video, image, false)
        return
      }

      const targetSourceTime = item.inPoint + Math.min(position.offset * (item.speed ?? 1), item.outPoint - item.inPoint - END_TOLERANCE)
      const el = renderPrimaryClip(clip, item, targetSourceTime, video, image, isPlaying)
      resetElementStyles(el, item, position.offset)

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
    [videoRef, secondaryVideoRef, imageRef, secondaryImageRef, items, clips, transitions, totalDuration],
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
  item: TimelineItem | undefined,
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
      image.style.objectFit = item?.fitMode ?? 'contain'
      return image
    }
    return null
  } else {
    if (image) image.style.display = 'none'
    if (video) {
      video.style.display = 'block'
      video.muted = item?.muted ?? false
      video.playbackRate = item?.speed ?? 1
      video.style.objectFit = item?.fitMode ?? 'contain'
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
  item: TimelineItem | undefined,
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
      secImage.style.objectFit = item?.fitMode ?? 'contain'
      return secImage
    }
    return null
  } else {
    if (secImage) secImage.style.display = 'none'
    if (secVideo) {
      secVideo.style.display = 'block'
      secVideo.muted = item?.muted ?? false
      secVideo.playbackRate = item?.speed ?? 1
      secVideo.style.objectFit = item?.fitMode ?? 'contain'
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
  itemA?: TimelineItem | null,
  itemB?: TimelineItem | null,
  transformA: EvaluatedTransform = evaluateTransform(itemA, 0),
  transformB: EvaluatedTransform = evaluateTransform(itemB, 0),
) {
  const p = clamp(progress, 0, 1)

  const baseTransA = combinedTransform(itemA, transformA)
  const baseTransB = combinedTransform(itemB, transformB)
  const baseFiltA = getCssFilter(itemA?.filter, itemA?.filterIntensity, itemA)
  const baseFiltB = getCssFilter(itemB?.filter, itemB?.filterIntensity, itemB)

  const combineTrans = (base: string, extra: string) => {
    if (!base || base === 'none') return extra
    if (!extra || extra === 'none') return base
    return `${base} ${extra}`
  }

  const combineFilt = (base: string, extra: string) => {
    if (!base || base === 'none') return extra
    if (!extra || extra === 'none') return base
    return `${base} ${extra}`
  }

  // Reset transforms and filters
  primary.style.transform = baseTransA
  secondary.style.transform = baseTransB
  primary.style.filter = baseFiltA
  secondary.style.filter = baseFiltB
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
      primary.style.filter = combineFilt(baseFiltA, `brightness(${1 + p * 4})`)
      secondary.style.opacity = '0'
    } else {
      primary.style.opacity = '0'
      secondary.style.opacity = '1'
      secondary.style.filter = combineFilt(baseFiltB, `brightness(${1 + (1 - p) * 4})`)
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
    primary.style.transform = combineTrans(baseTransA, `translateX(-${p * 100}%)`)
    secondary.style.transform = combineTrans(baseTransB, `translateX(${(1 - p) * 100}%)`)
  } else if (type === 'slide-right') {
    primary.style.opacity = '1'
    secondary.style.opacity = '1'
    primary.style.transform = combineTrans(baseTransA, `translateX(${p * 100}%)`)
    secondary.style.transform = combineTrans(baseTransB, `translateX(-${(1 - p) * 100}%)`)
  } else if (type === 'zoom-in') {
    primary.style.transform = combineTrans(baseTransA, `scale(${1 + p * 0.35})`)
    primary.style.opacity = `${1 - p * 0.4}`
    secondary.style.transform = combineTrans(baseTransB, `scale(${1 + (1 - p) * 0.15})`)
    secondary.style.opacity = `${p}`
  } else if (type === 'zoom-out') {
    primary.style.transform = combineTrans(baseTransA, `scale(${1 - p * 0.15})`)
    primary.style.opacity = `${1 - p}`
    secondary.style.transform = combineTrans(baseTransB, `scale(${1.35 - p * 0.35})`)
    secondary.style.opacity = `${p}`
  } else if (type === 'iris-circle') {
    primary.style.opacity = '1'
    secondary.style.opacity = '1'
    secondary.style.clipPath = `circle(${p * 75}% at 50% 50%)`
  } else if (type === 'blur-dissolve') {
    primary.style.filter = combineFilt(baseFiltA, `blur(${p * 16}px)`)
    primary.style.opacity = `${1 - p}`
    secondary.style.filter = combineFilt(baseFiltB, `blur(${(1 - p) * 16}px)`)
    secondary.style.opacity = `${p}`
  }

  // Fold each clip's own animated opacity into whatever the transition just set.
  primary.style.opacity = `${clamp(Number(primary.style.opacity || '1') * transformA.opacity, 0, 1)}`
  secondary.style.opacity = `${clamp(Number(secondary.style.opacity || '1') * transformB.opacity, 0, 1)}`
}

function ignoreInterruptedPlay(error: unknown) {
  if (!(error instanceof DOMException && error.name === 'AbortError')) console.error(error)
}
