import { useEffect, useRef } from 'react'
import type { RefObject } from 'react'
import { applyAudioEffectNodes } from './audioEffects.ts'
import { clamp, itemLength } from './timeline.ts'
import type { AudioClip, AudioTimelineItem } from './types.ts'

interface PlayerEntry {
  audio: HTMLAudioElement
  clipId: string
  isPlaying: boolean
  sourceNode?: MediaElementAudioSourceNode
  gainNode?: GainNode
  effectNodes?: AudioNode[]
  currentEffect?: string
  currentIntensity?: number
}

let sharedCtx: AudioContext | null = null

function getSharedAudioContext(): AudioContext | null {
  if (typeof window === 'undefined') return null
  const AudioCtx =
    window.AudioContext ??
    (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
  if (!AudioCtx) return null
  if (!sharedCtx || sharedCtx.state === 'closed') {
    try {
      sharedCtx = new AudioCtx()
    } catch {
      // ignore
    }
  }
  return sharedCtx
}

/**
 * Plays multiple independent parallel audio items simultaneously over the timeline,
 * matching each item's individual volume, in-point, placement, speed, and real-time audio effects.
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
    const ctx = getSharedAudioContext()

    if (playing && ctx && ctx.state === 'suspended') {
      void ctx.resume()
    }

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

        // Try connecting Web Audio API nodes for real-time DSP effects
        if (ctx) {
          try {
            const sourceNode = ctx.createMediaElementSource(audio)
            const gainNode = ctx.createGain()
            const effectNodes = applyAudioEffectNodes(
              ctx,
              sourceNode,
              gainNode,
              item.effect,
              item.effectIntensity ?? 1,
            )
            gainNode.connect(ctx.destination)

            entry.sourceNode = sourceNode
            entry.gainNode = gainNode
            entry.effectNodes = effectNodes
            entry.currentEffect = item.effect ?? 'none'
            entry.currentIntensity = item.effectIntensity ?? 1
          } catch {
            // fallback to direct HTMLAudioElement volume
          }
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

      // Playback speed
      const targetSpeed = clamp(item.speed ?? 1, 0.25, 4)
      if (Math.abs(audio.playbackRate - targetSpeed) > 0.01) {
        audio.playbackRate = targetSpeed
      }

      // Calculate fade in and fade out volume multipliers
      const offset = Math.max(0, time - item.start)
      const len = itemLength(item)
      let fadeMultiplier = 1
      if (item.fadeIn && item.fadeIn > 0 && offset < item.fadeIn) {
        fadeMultiplier = Math.min(fadeMultiplier, Math.max(0, offset / item.fadeIn))
      }
      if (item.fadeOut && item.fadeOut > 0) {
        const remaining = len - offset
        if (remaining < item.fadeOut) {
          fadeMultiplier = Math.min(fadeMultiplier, Math.max(0, remaining / item.fadeOut))
        }
      }

      const finalGain = clamp(item.volume * fadeMultiplier, 0, 1)

      // Update Web Audio DSP effect nodes if effect or intensity changed
      if (entry.sourceNode && entry.gainNode && ctx) {
        const eff = item.effect ?? 'none'
        const intensity = item.effectIntensity ?? 1
        if (entry.currentEffect !== eff || entry.currentIntensity !== intensity) {
          try {
            entry.sourceNode.disconnect()
            if (entry.effectNodes) {
              for (const node of entry.effectNodes) node.disconnect()
            }
            entry.effectNodes = applyAudioEffectNodes(
              ctx,
              entry.sourceNode,
              entry.gainNode,
              eff,
              intensity,
            )
            entry.currentEffect = eff
            entry.currentIntensity = intensity
          } catch {
            // ignore
          }
        }
        entry.gainNode.gain.value = finalGain
      } else {
        audio.volume = finalGain
      }

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
          if (entry.sourceNode) {
            try { entry.sourceNode.disconnect() } catch { /* ignore */ }
          }
          if (entry.gainNode) {
            try { entry.gainNode.disconnect() } catch { /* ignore */ }
          }
          if (entry.effectNodes) {
            for (const n of entry.effectNodes) {
              try { n.disconnect() } catch { /* ignore */ }
            }
          }
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
        if (entry.sourceNode) {
          try { entry.sourceNode.disconnect() } catch { /* ignore */ }
        }
        if (entry.gainNode) {
          try { entry.gainNode.disconnect() } catch { /* ignore */ }
        }
        if (entry.effectNodes) {
          for (const n of entry.effectNodes) {
            try { n.disconnect() } catch { /* ignore */ }
          }
        }
      }
      pool.clear()
    }
  }, [])
}

/** Switching sources interrupts a pending play() call; that is expected here. */
function ignoreInterruptedPlay(error: unknown) {
  if (!(error instanceof DOMException && error.name === 'AbortError')) console.error(error)
}
