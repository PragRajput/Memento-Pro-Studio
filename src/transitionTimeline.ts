import { clamp, itemLength, itemStarts } from './timeline.ts'
import type { TimelineItem, Transition, TransitionEasing, TransitionType } from './types.ts'

/** Default transition duration in seconds. */
export const DEFAULT_TRANSITION_DURATION = 0.8

/**
 * The curve each type runs on unless the transition overrides it. A linear ramp
 * reads as mechanical on a dissolve and makes a zoom look like it is being
 * dragged; these are the curves each effect is normally cut with.
 */
const DEFAULT_EASING: Partial<Record<TransitionType, TransitionEasing>> = {
  crossfade: 'smoothstep',
  'fade-black': 'ease-in-out',
  'fade-white': 'ease-in-out',
  'blur-dissolve': 'smoothstep',
  'wipe-left': 'ease-in-out',
  'wipe-right': 'ease-in-out',
  'wipe-up': 'ease-in-out',
  'wipe-down': 'ease-in-out',
  'slide-left': 'ease-out',
  'slide-right': 'ease-out',
  'zoom-in': 'ease-out',
  'zoom-out': 'ease-out',
  'iris-circle': 'ease-in-out',
}

/** Shape a 0..1 ramp. Shared by transitions and the timeline edge fades. */
export function applyTransitionEasing(easing: TransitionEasing | undefined, t: number): number {
  const u = clamp(t, 0, 1)
  switch (easing) {
    case 'ease-in':
      return u * u
    case 'ease-out':
      return 1 - (1 - u) ** 2
    case 'ease-in-out':
      return u < 0.5 ? 2 * u * u : 1 - (-2 * u + 2) ** 2 / 2
    case 'smoothstep':
      return u * u * (3 - 2 * u)
    case 'ease-out-back': {
      // Overshoots slightly before settling, which gives a slide its snap.
      const c1 = 1.70158
      const c3 = c1 + 1
      return 1 + c3 * (u - 1) ** 3 + c1 * (u - 1) ** 2
    }
    case 'linear':
    default:
      return u
  }
}

/** The curve a transition runs on: its own, or the default for its type. */
export function transitionEasingFor(transition: Transition): TransitionEasing {
  return transition.transitionEasing ?? DEFAULT_EASING[transition.type] ?? 'linear'
}

/**
 * Gain for each clip's own sound across a transition, so the audio blends with
 * the picture instead of hard-cutting under it.
 *
 * Equal power is the default because a linear crossfade sums to roughly -3dB at
 * the midpoint and is heard as a dip; cos/sin keeps perceived loudness constant.
 */
export function transitionAudioGains(
  transition: Transition,
  progress: number,
): { a: number; b: number } {
  const p = clamp(progress, 0, 1)
  switch (transition.transitionAudioFade) {
    case 'none':
      return p < 0.5 ? { a: 1, b: 0 } : { a: 0, b: 1 }
    case 'linear':
      return { a: 1 - p, b: p }
    case 'dip':
      // All the way out, then all the way in: a deliberate beat of near-silence.
      return { a: Math.max(0, 1 - p * 2), b: Math.max(0, p * 2 - 1) }
    case 'equal-power':
    default:
      return { a: Math.cos((p * Math.PI) / 2), b: Math.sin((p * Math.PI) / 2) }
  }
}

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
  /** Raw 0..1 position through the window, before easing. */
  progress: number
  /** `progress` shaped by the transition's curve; this is what effects should use. */
  easedProgress: number
  sourceTimeA: number
  sourceTimeB: number
  /**
   * Seconds of handle the clips were short of. Above zero means one of them ran
   * out of source material and is holding a frame for that long.
   */
  handleShortfall: number
}

/**
 * Determine whether a timeline `time` falls inside an active transition window between
 * two adjacent video clips.
 */
export function locateTransition(
  items: readonly TimelineItem[],
  transitions: readonly Transition[],
  time: number,
  /** Source lengths by clip id, so a transition can read into each clip's handles. */
  clips?: ReadonlyMap<string, { duration: number }>,
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

      // Both clips keep rolling through the whole window. Clip A runs past its
      // out point and clip B starts before its in point, each consuming the
      // unused source either side of the trim — its handles. Clamping to the
      // trim points instead, as this once did, froze A for the second half of
      // every transition and B for the first.
      const speedA = itemA.speed ?? 1
      const speedB = itemB.speed ?? 1
      const limitA = clips?.get(itemA.clipId)?.duration
      const limitB = clips?.get(itemB.clipId)?.duration
      const wantedA = itemA.inPoint + offsetInA * speedA
      const wantedB = itemB.inPoint + offsetInB * speedB
      const sourceTimeA = clamp(wantedA, 0, limitA !== undefined && Number.isFinite(limitA) ? limitA : wantedA)
      const sourceTimeB = clamp(wantedB, 0, limitB !== undefined && Number.isFinite(limitB) ? limitB : wantedB)

      // How long a clip is stuck on one frame because its source ran out.
      const shortfall = Math.max(
        (wantedA - sourceTimeA) / speedA,
        (sourceTimeB - wantedB) / speedB,
        0,
      )

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
        easedProgress: applyTransitionEasing(transitionEasingFor(transition), progress),
        sourceTimeA,
        sourceTimeB,
        handleShortfall: shortfall,
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

