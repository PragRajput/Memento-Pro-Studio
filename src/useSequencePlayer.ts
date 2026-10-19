import { useCallback, useEffect, useRef, useState } from 'react'
import type { RefObject } from 'react'
import { clamp, itemLength, itemStarts, locate, timelineDuration } from './timeline.ts'
import { locateTransition } from './transitionTimeline.ts'
import type { MediaClip, TimelineItem, Transition, TransitionType } from './types.ts'

/** How close to an item's out point playback moves on to the next item. */
const END_TOLERANCE = 0.02

/**
 * Plays timeline items back to back through video elements and tracks the
 * playhead. Smoothly composites transitions (crossfade, dip to black, wipe)
 * between adjacent clips during playback and paused scrubbing.
 */
export function useSequencePlayer(
  videoRef: RefObject<HTMLVideoElement | null>,
  secondaryVideoRef: RefObject<HTMLVideoElement | null>,
  items: readonly TimelineItem[],
  clips: ReadonlyMap<string, MediaClip>,
  transitions: readonly Transition[] = [],
  totalDuration?: number,
) {
  const [requestedTime, setTime] = useState(0)
  const [playing, setPlaying] = useState(false)
  const frameRef = useRef(0)
  const latestItems = useRef(items)
  const duration = Math.max(timelineDuration(items), totalDuration ?? 0)
  // Edits can shorten the timeline; keep the playhead within it.
  const time = Math.min(requestedTime, duration)

  const pause = useCallback(() => {
    cancelAnimationFrame(frameRef.current)
    videoRef.current?.pause()
    if (secondaryVideoRef.current !== null) {
      secondaryVideoRef.current.pause()
      secondaryVideoRef.current.style.display = 'none'
    }
    if (videoRef.current !== null) {
      videoRef.current.style.opacity = '1'
      videoRef.current.style.clipPath = 'none'
    }
    setPlaying(false)
  }, [videoRef, secondaryVideoRef])

  useEffect(() => {
    latestItems.current = items
  }, [items])

  useEffect(() => () => cancelAnimationFrame(frameRef.current), [])

  // While paused, show the frame under the playhead, rendering transition if in transition window.
  useEffect(() => {
    const video = videoRef.current
    const secVideo = secondaryVideoRef.current
    if (playing || video === null) return

    const activeTransition = locateTransition(items, transitions, time)
    if (activeTransition !== null && secVideo !== null) {
      const { itemA, itemB, progress, sourceTimeA, sourceTimeB, transition } = activeTransition
      const clipA = clips.get(itemA.clipId)
      const clipB = clips.get(itemB.clipId)
      if (clipA !== undefined && clipB !== undefined) {
        showSource(video, clipA.url)
        video.muted = itemA.muted
        video.currentTime = sourceTimeA

        showSource(secVideo, clipB.url)
        secVideo.muted = true
        secVideo.currentTime = sourceTimeB
        secVideo.style.display = 'block'

        applyTransitionStyle(video, secVideo, transition.type, progress)
        return
      }
    }

    if (secVideo !== null) {
      secVideo.style.display = 'none'
    }
    video.style.opacity = '1'
    video.style.clipPath = 'none'

    const position = locate(items, time)
    const item = position === null ? undefined : items[position.index]
    const clip = item === undefined ? undefined : clips.get(item.clipId)
    if (position === null || item === undefined || clip === undefined) {
      if (items.length > 0 && time >= timelineDuration(items)) {
        // Playhead is past the video timeline (e.g. over trailing audio or text).
        // Hold the last frame of the final video clip.
        const lastItem = items[items.length - 1]
        const lastClip = clips.get(lastItem.clipId)
        if (lastClip !== undefined) {
          showSource(video, lastClip.url)
          video.muted = lastItem.muted
          video.currentTime = Math.max(lastItem.inPoint, lastItem.outPoint - END_TOLERANCE)
          return
        }
      }
      video.removeAttribute('src')
      video.load()
      return
    }
    showSource(video, clip.url)
    video.muted = item.muted
    // Stay just inside the item so the end of the timeline shows its last frame.
    video.currentTime = item.inPoint + Math.min(position.offset, itemLength(item) - END_TOLERANCE)
  }, [videoRef, secondaryVideoRef, items, clips, transitions, time, playing])

  const play = useCallback(() => {
    if (duration <= 0) return
    const startTime = time >= duration - END_TOLERANCE ? 0 : time
    const vDuration = timelineDuration(items)

    if (items.length === 0 || startTime >= vDuration - END_TOLERANCE) {
      // Audio-only playback or trailing audio after all video clips have finished.
      if (videoRef.current !== null && items.length > 0) {
        const lastItem = items[items.length - 1]
        const lastClip = clips.get(lastItem.clipId)
        if (lastClip !== undefined) {
          showSource(videoRef.current, lastClip.url)
          videoRef.current.muted = lastItem.muted
          videoRef.current.currentTime = Math.max(lastItem.inPoint, lastItem.outPoint - END_TOLERANCE)
          videoRef.current.pause()
        }
      }
      let lastTimestamp = performance.now()
      setTime(startTime)
      setPlaying(true)
      const tickTrailing = (now: number) => {
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
        frameRef.current = requestAnimationFrame(tickTrailing)
      }
      frameRef.current = requestAnimationFrame(tickTrailing)
      return
    }

    const video = videoRef.current
    if (video === null) return
    const starts = itemStarts(items)
    const position = locate(items, startTime)
    if (position === null) return
    let index = position.index

    const enter = (itemIndex: number, offset: number): boolean => {
      const item = items[itemIndex]
      const clip = clips.get(item.clipId)
      if (clip === undefined) return false
      showSource(video, clip.url)
      video.muted = item.muted
      video.currentTime = item.inPoint + offset
      video.play().catch(ignoreInterruptedPlay)
      return true
    }

    let trailingTimestamp = 0
    const tick = (now: number) => {
      // Editing the timeline during playback stops it.
      if (latestItems.current !== items) {
        pause()
        return
      }

      if (index >= items.length) {
        // Video finished, but trailing audio or text is continuing
        if (trailingTimestamp === 0) trailingTimestamp = now
        const delta = (now - trailingTimestamp) / 1000
        trailingTimestamp = now
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
      if (video.currentTime >= item.outPoint - END_TOLERANCE || video.ended) {
        index += 1
        if (index >= items.length) {
          video.pause()
          if (duration <= vDuration + END_TOLERANCE) {
            pause()
            setTime(duration)
            return
          }
          // Continue with trailing audio
          trailingTimestamp = now
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
      const currentTime = starts[index] + clamp(video.currentTime - current.inPoint, 0, itemLength(current))
      setTime(currentTime)

      const activeTransition = locateTransition(items, transitions, currentTime)
      const secVideo = secondaryVideoRef.current
      if (activeTransition !== null && secVideo !== null) {
        const { itemA, itemB, progress, sourceTimeB, transition } = activeTransition
        const clipA = clips.get(itemA.clipId)
        const clipB = clips.get(itemB.clipId)
        if (clipA !== undefined && clipB !== undefined) {
          showSource(secVideo, clipB.url)
          secVideo.muted = true
          secVideo.style.display = 'block'
          if (Math.abs(secVideo.currentTime - sourceTimeB) > 0.3) {
            secVideo.currentTime = sourceTimeB
          }
          if (secVideo.paused) {
            secVideo.play().catch(ignoreInterruptedPlay)
          }

          applyTransitionStyle(video, secVideo, transition.type, progress)
        }
      } else {
        if (secVideo !== null && secVideo.style.display !== 'none') {
          secVideo.pause()
          secVideo.style.display = 'none'
        }
        video.style.opacity = '1'
        video.style.clipPath = 'none'
      }

      frameRef.current = requestAnimationFrame(tick)
    }

    if (!enter(index, position.offset)) return
    setTime(startTime)
    setPlaying(true)
    frameRef.current = requestAnimationFrame(tick)
  }, [videoRef, secondaryVideoRef, items, clips, transitions, time, duration, pause])

  const seek = useCallback(
    (target: number) => {
      pause()
      setTime(clamp(target, 0, duration))
    },
    [pause, duration],
  )

  return { time, duration, playing, play, pause, seek }
}

function applyTransitionStyle(
  primary: HTMLVideoElement,
  secondary: HTMLVideoElement,
  type: TransitionType,
  progress: number,
) {
  if (type === 'crossfade') {
    primary.style.opacity = '1'
    secondary.style.opacity = `${progress}`
    secondary.style.clipPath = 'none'
  } else if (type === 'fade-black') {
    if (progress < 0.5) {
      primary.style.opacity = `${1 - progress * 2}`
      secondary.style.opacity = '0'
    } else {
      primary.style.opacity = '0'
      secondary.style.opacity = `${(progress - 0.5) * 2}`
    }
    secondary.style.clipPath = 'none'
  } else if (type === 'wipe-left') {
    primary.style.opacity = '1'
    secondary.style.opacity = '1'
    secondary.style.clipPath = `inset(0 calc(${100 - progress * 100}%) 0 0)`
  }
}

function showSource(video: HTMLVideoElement, url: string) {
  if (video.src !== url) video.src = url
}

/** Switching sources interrupts a pending play() call; that is expected here. */
function ignoreInterruptedPlay(error: unknown) {
  if (!(error instanceof DOMException && error.name === 'AbortError')) console.error(error)
}
