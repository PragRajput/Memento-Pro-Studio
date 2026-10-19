import { useEffect, useRef } from 'react'
import type { RefObject } from 'react'
import { clamp, itemLength } from './timeline.ts'
import type { AudioClip, AudioTimelineItem } from './types.ts'

/** How far an audio element may drift from where it should be before reseeking it. */
const RESYNC_TOLERANCE = 0.15

/**
 * Plays multiple independent parallel audio items simultaneously over the timeline,
 * matching each item's individual volume, in-point, and placement.
 */
export function useAudioLanePlayback(
  _audioRef: RefObject<HTMLAudioElement | null>,
  items: readonly AudioTimelineItem[],
  clips: ReadonlyMap<string, AudioClip>,
  time: number,
  playing: boolean,
) {
  const elementsRef = useRef<Map<string, HTMLAudioElement>>(new Map())
  const itemMap = useRef<Map<string, AudioTimelineItem>>(new Map())

  useEffect(() => {
    itemMap.current = new Map(items.map((i) => [i.id, i]))
  }, [items])

  useEffect(() => {
    const activeItems = items.filter((item) => {
      const length = itemLength(item)
      return time >= item.start && time < item.start + length
    })
    const activeIds = new Set(activeItems.map((item) => item.id))

    // Manage and update all active audio instances
    for (const item of activeItems) {
      const clip = clips.get(item.clipId)
      if (!clip) continue

      let audio = elementsRef.current.get(item.id)
      const isNew = !audio
      if (!audio) {
        audio = new Audio()
        audio.preload = 'auto'
        elementsRef.current.set(item.id, audio)
      }

      if (audio.src !== clip.url) {
        audio.src = clip.url
      }

      const expected = item.inPoint + (time - item.start)
      try {
        if (isNew || Math.abs(audio.currentTime - expected) > RESYNC_TOLERANCE) {
          audio.currentTime = Math.max(0, expected)
        }
      } catch {
        // Media still initializing; will sync on next frame
      }

      audio.volume = clamp(item.volume, 0, 1)

      if (playing) {
        audio.play().catch(ignoreInterruptedPlay)
      } else {
        audio.pause()
      }
    }

    // Pause inactive audio elements and clean up removed items
    for (const [id, audio] of elementsRef.current.entries()) {
      if (!activeIds.has(id)) {
        audio.pause()
        if (!itemMap.current.has(id)) {
          audio.src = ''
          elementsRef.current.delete(id)
        }
      }
    }
  }, [items, clips, time, playing])

  // Stop all playback when component unmounts
  useEffect(() => {
    const elements = elementsRef.current
    return () => {
      for (const audio of elements.values()) {
        audio.pause()
        audio.src = ''
      }
      elements.clear()
    }
  }, [])
}

/** Switching sources interrupts a pending play() call; that is expected here. */
function ignoreInterruptedPlay(error: unknown) {
  if (!(error instanceof DOMException && error.name === 'AbortError')) console.error(error)
}
