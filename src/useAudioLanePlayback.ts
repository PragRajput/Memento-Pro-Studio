import { useEffect, useRef } from 'react'
import type { RefObject } from 'react'
import { clamp, itemLength } from './timeline.ts'
import type { AudioClip, AudioTimelineItem } from './types.ts'

interface PlayerEntry {
  audio: HTMLAudioElement
  clipId: string
  isPlaying: boolean
}

/**
 * Plays multiple independent parallel audio items simultaneously over the timeline,
 * matching each item's individual volume, in-point, and placement without stuttering.
 */
export function useAudioLanePlayback(
  _audioRef: RefObject<HTMLAudioElement | null>,
  items: readonly AudioTimelineItem[],
  clips: ReadonlyMap<string, AudioClip>,
  time: number,
  playing: boolean,
) {
  const poolRef = useRef<Map<string, PlayerEntry>>(new Map())

  useEffect(() => {
    const pool = poolRef.current
    const activeItems = items.filter((item) => {
      const len = itemLength(item)
      return time >= item.start && time < item.start + len
    })
    const activeIds = new Set(activeItems.map((i) => i.id))

    // 1. Process all currently active audio items
    for (const item of activeItems) {
      const clip = clips.get(item.clipId)
      if (!clip) continue

      let entry = pool.get(item.id)
      const expectedTime = item.inPoint + Math.max(0, time - item.start)

      if (!entry) {
        const audio = new Audio()
        audio.preload = 'auto'
        audio.src = clip.url
        audio.volume = clamp(item.volume, 0, 1)

        const seekWhenReady = () => {
          try {
            audio.currentTime = expectedTime
          } catch {
            // will retry
          }
        }

        if (audio.readyState >= 1) {
          seekWhenReady()
        } else {
          audio.addEventListener('loadedmetadata', seekWhenReady, { once: true })
        }

        entry = {
          audio,
          clipId: item.clipId,
          isPlaying: false,
        }
        pool.set(item.id, entry)
      }

      const { audio } = entry

      // Update source if clip changed
      if (entry.clipId !== item.clipId || audio.src !== clip.url) {
        audio.src = clip.url
        entry.clipId = item.clipId
        entry.isPlaying = false
      }

      // Always update live volume for this item
      audio.volume = clamp(item.volume, 0, 1)

      if (playing) {
        if (!entry.isPlaying || audio.paused) {
          // Playback just started or item was just entered: sync position and start
          try {
            audio.currentTime = expectedTime
          } catch {
            // will catch up
          }
          audio.play().catch(ignoreInterruptedPlay)
          entry.isPlaying = true
        } else if (Math.abs(audio.currentTime - expectedTime) > 0.3) {
          // Already playing: resync if drift is noticeable (> 0.3s) without causing audio jitter
          try {
            audio.currentTime = expectedTime
          } catch {
            // ignore
          }
        }
      } else {
        // Paused: ensure element is paused and update frame position for scrubbing
        if (entry.isPlaying) {
          audio.pause()
          entry.isPlaying = false
        }
        if (audio.readyState >= 1 && Math.abs(audio.currentTime - expectedTime) > 0.05) {
          try {
            audio.currentTime = expectedTime
          } catch {
            // ignore
          }
        }
      }
    }

    // 2. Pause and clean up any audio items that are no longer active
    for (const [id, entry] of pool.entries()) {
      if (!activeIds.has(id)) {
        if (entry.isPlaying) {
          entry.audio.pause()
          entry.isPlaying = false
        }
        // If the item was deleted from the timeline completely, dispose the element
        if (!items.some((i) => i.id === id)) {
          entry.audio.src = ''
          pool.delete(id)
        }
      }
    }
  }, [items, clips, time, playing])

  // Cleanup on unmount
  useEffect(() => {
    const pool = poolRef.current
    return () => {
      for (const entry of pool.values()) {
        entry.audio.pause()
        entry.audio.src = ''
      }
      pool.clear()
    }
  }, [])
}

/** Switching sources interrupts a pending play() call; that is expected here. */
function ignoreInterruptedPlay(error: unknown) {
  if (!(error instanceof DOMException && error.name === 'AbortError')) console.error(error)
}
