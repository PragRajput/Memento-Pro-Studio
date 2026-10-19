import { clamp, itemLength, itemStarts } from './timeline.ts'
import type { TimelineItem, Transition, TransitionType } from './types.ts'

/** Default transition duration in seconds. */
export const DEFAULT_TRANSITION_DURATION = 0.8

/** Creates a new transition between two adjacent items. */
export function createTransition(
  fromItemId: string,
  toItemId: string,
  type: TransitionType = 'crossfade',
  duration = DEFAULT_TRANSITION_DURATION,
): Transition {
  return {
    id: crypto.randomUUID(),
    fromItemId,
    toItemId,
    type,
    duration: clamp(duration, 0.2, 3),
  }
}

/** Maximum duration a transition between itemA and itemB can span. */
export function maxTransitionDuration(itemA: TimelineItem, itemB: TimelineItem): number {
  return Math.max(0.2, Math.min(itemLength(itemA), itemLength(itemB), 3))
}

/** Effective duration of a transition, bounded by adjacent clip lengths. */
export function getEffectiveTransitionDuration(
  transition: Transition,
  itemA: TimelineItem,
  itemB: TimelineItem,
): number {
  return clamp(transition.duration, 0.2, maxTransitionDuration(itemA, itemB))
}

/** Find a transition matching a specific boundary between two items. */
export function findTransitionBetween(
  transitions: readonly Transition[],
  fromItemId: string,
  toItemId: string,
): Transition | undefined {
  return transitions.find((t) => t.fromItemId === fromItemId && t.toItemId === toItemId)
}

export interface ActiveTransition {
  transition: Transition
  indexA: number
  indexB: number
  itemA: TimelineItem
  itemB: TimelineItem
  windowStart: number
  windowEnd: number
  duration: number
  progress: number // 0 (start of transition) to 1 (end of transition)
  sourceTimeA: number
  sourceTimeB: number
}

/**
 * Determine whether a timeline `time` falls inside an active transition window between
 * two adjacent video clips.
 */
export function locateTransition(
  items: readonly TimelineItem[],
  transitions: readonly Transition[],
  time: number,
): ActiveTransition | null {
  if (items.length < 2 || transitions.length === 0) return null

  const starts = itemStarts(items)

  for (let i = 0; i < items.length - 1; i++) {
    const itemA = items[i]
    const itemB = items[i + 1]
    const transition = findTransitionBetween(transitions, itemA.id, itemB.id)
    if (!transition) continue

    const cutTime = starts[i + 1]
    const d = getEffectiveTransitionDuration(transition, itemA, itemB)
    const half = d / 2
    const windowStart = cutTime - half
    const windowEnd = cutTime + half

    if (time >= windowStart && time <= windowEnd) {
      const progress = clamp((time - windowStart) / d, 0, 1)
      const offsetInA = time - starts[i]
      const offsetInB = time - starts[i + 1]

      const sourceTimeA = clamp(itemA.inPoint + offsetInA, itemA.inPoint, itemA.outPoint)
      const sourceTimeB = clamp(itemB.inPoint + offsetInB, itemB.inPoint, itemB.outPoint)

      return {
        transition,
        indexA: i,
        indexB: i + 1,
        itemA,
        itemB,
        windowStart,
        windowEnd,
        duration: d,
        progress,
        sourceTimeA,
        sourceTimeB,
      }
    }
  }

  return null
}

/** Keep only transitions whose adjacent items still exist and are directly adjacent. */
export function cleanTransitions(
  items: readonly TimelineItem[],
  transitions: readonly Transition[],
): Transition[] {
  return transitions.filter((t) => {
    const indexA = items.findIndex((item) => item.id === t.fromItemId)
    if (indexA === -1 || indexA >= items.length - 1) return false
    return items[indexA + 1].id === t.toItemId
  })
}

