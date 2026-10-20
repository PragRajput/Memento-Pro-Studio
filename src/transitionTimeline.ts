import { clamp, itemLength, itemStarts } from './timeline.ts'
import type { EdgeFades, TimelineItem, Transition, TransitionEasing, TransitionType } from './types.ts'


/** Every transition type with its display name, shared by the inspector and the library panel. */
export const TRANSITION_TYPES: readonly { type: TransitionType; label: string; description: string }[] = [
  { type: 'crossfade', label: 'Crossfade', description: 'Dissolve one clip into the next' },
  { type: 'fade-black', label: 'Dip to Black', description: 'Fade down to black, then up' },
  { type: 'fade-white', label: 'Flash White', description: 'Bloom through white' },
  { type: 'blur-dissolve', label: 'Blur Dissolve', description: 'Defocus across the cut' },
  { type: 'wipe-left', label: 'Wipe Left', description: 'Reveal from the right edge' },
  { type: 'wipe-right', label: 'Wipe Right', description: 'Reveal from the left edge' },
  { type: 'wipe-up', label: 'Wipe Up', description: 'Reveal from the bottom' },
  { type: 'wipe-down', label: 'Wipe Down', description: 'Reveal from the top' },
  { type: 'slide-left', label: 'Push Left', description: 'Push the old clip off to the left' },
  { type: 'slide-right', label: 'Push Right', description: 'Push the old clip off to the right' },
  { type: 'zoom-in', label: 'Zoom In', description: 'Punch in as the next clip arrives' },
  { type: 'zoom-out', label: 'Zoom Out', description: 'Pull back into the next clip' },
  { type: 'iris-circle', label: 'Circle Iris', description: 'Open a circle on the next clip' },
]

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

export interface ActiveEdgeFade {
  edge: 'in' | 'out'
  color: string
  opacity: number
}

/** Fade state at `time` for timeline start/end fades. */
export function edgeFadeAt(
  edgeFades: EdgeFades | undefined,
  time: number,
  totalDuration: number,
): ActiveEdgeFade | null {
  if (!edgeFades || totalDuration <= 0) return null

  // In-fade
  if (edgeFades.in && edgeFades.in.duration > 0 && time < edgeFades.in.duration) {
    const rawProgress = clamp(time / edgeFades.in.duration, 0, 1)
    const eased = applyTransitionEasing(edgeFades.in.easing, rawProgress)
    const opacity = clamp(1 - eased, 0, 1)
    if (opacity > 0.001) {
      return { edge: 'in', color: edgeFades.in.color || '#000000', opacity }
    }
  }

  // Out-fade
  if (edgeFades.out && edgeFades.out.duration > 0) {
    const startOut = totalDuration - edgeFades.out.duration
    if (time > startOut) {
      const rawProgress = clamp((time - startOut) / edgeFades.out.duration, 0, 1)
      const eased = applyTransitionEasing(edgeFades.out.easing, rawProgress)
      const opacity = clamp(eased, 0, 1)
      if (opacity > 0.001) {
        return { edge: 'out', color: edgeFades.out.color || '#000000', opacity }
      }
    }
  }

  return null
}

/**
 * Opacity of each clip's picture at `progress` through a transition.
 *
 * Types that reveal by geometry — wipes, slides, the iris — leave both clips
 * fully opaque and let the incoming clip's clip-path cover the outgoing one.
 * Types that reveal by fading must take the outgoing clip all the way to zero:
 * leaving it part-visible only looks right while the incoming clip happens to
 * fill the frame, and breaks the moment the two clips are framed differently.
 */
export function transitionLayerAlpha(
  type: TransitionType,
  progress: number,
): { a: number; b: number } {
  const p = clamp(progress, 0, 1)
  switch (type) {
    case 'zoom-in':
    case 'zoom-out':
    case 'blur-dissolve':
      return { a: 1 - p, b: p }
    case 'fade-black':
      return p < 0.5 ? { a: 1 - p * 2, b: 0 } : { a: 0, b: (p - 0.5) * 2 }
    case 'fade-white':
      return p < 0.5 ? { a: 1, b: 0 } : { a: 0, b: 1 }
    case 'crossfade':
      // The outgoing clip is held at full and the incoming one fades over it,
      // which avoids the dip a symmetric dissolve shows against black.
      return { a: 1, b: p }
    default:
      return { a: 1, b: 1 }
  }
}

/**
 * The full-frame wash a dip or flash paints, and how opaque it is at `progress`.
 * Null for types that do not use one.
 *
 * Both renderers read this. The export used to paint a veil only for the white
 * flash while the preview faked it with a brightness boost, so a custom veil
 * colour showed in the file but never on screen.
 */
export function transitionVeilAt(
  transition: Transition,
  progress: number,
): { color: string; alpha: number } | null {
  if (transition.type !== 'fade-black' && transition.type !== 'fade-white') return null
  const p = clamp(progress, 0, 1)
  const strength = transition.transitionStrength ?? 1
  const color =
    transition.transitionVeilColor || (transition.type === 'fade-white' ? '#ffffff' : '#000000')
  // Peaks at the midpoint, which is where the cut itself sits.
  return { color, alpha: clamp((1 - Math.abs(p * 2 - 1)) * strength, 0, 1) }
}

/** The four wipe directions, and whether a type is one of them. */
export type WipeDirection = 'left' | 'right' | 'up' | 'down'

export function wipeDirection(type: TransitionType): WipeDirection | null {
  switch (type) {
    case 'wipe-left':
      return 'left'
    case 'wipe-right':
      return 'right'
    case 'wipe-up':
      return 'up'
    case 'wipe-down':
      return 'down'
    default:
      return null
  }
}

/**
 * Where a wipe's feathered edge begins and ends, as fractions of the frame
 * along the wipe axis. `softness` is 0..1; the edge spans twice that times 20%
 * of the frame, centred on the wipe position, matching the preview's mask.
 */
export function wipeEdge(progress: number, softness: number): { solid: number; clear: number } {
  const p = clamp(progress, 0, 1)
  const feather = clamp(softness, 0, 1) * 0.2
  return { solid: clamp(p - feather, 0, 1), clear: clamp(p + feather, 0, 1) }
}

/** Types that retire the outgoing clip by fading it rather than covering it. */
export function fadesOutgoingClip(type: TransitionType): boolean {
  return (
    type === 'zoom-in' ||
    type === 'zoom-out' ||
    type === 'blur-dissolve' ||
    type === 'fade-black' ||
    type === 'fade-white'
  )
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
    const align = transition.transitionAlign ?? 'center'
    const windowStart = align === 'start' ? cutTime : align === 'end' ? cutTime - d : cutTime - d / 2
    const windowEnd = align === 'start' ? cutTime + d : align === 'end' ? cutTime : cutTime + d / 2

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

