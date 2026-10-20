import type { AnimatableProperty, EasingType, Keyframe, KeyframeTracks } from './types.ts'

/** Neutral value for each animatable property when nothing has been keyed or set. */
export const PROPERTY_DEFAULTS: Record<AnimatableProperty, number> = {
  posX: 0,
  posY: 0,
  scale: 1,
  rotate: 0,
  opacity: 1,
  volume: 1,
}

export interface PropertyMeta {
  id: AnimatableProperty
  name: string
  unit: string
  min: number
  max: number
  step: number
  /** Multiplier applied to the stored value to get the number shown in the UI. */
  display: number
}

export const ANIMATABLE_PROPERTIES: readonly PropertyMeta[] = [
  { id: 'posX', name: 'Position X', unit: '%', min: -100, max: 100, step: 0.5, display: 1 },
  { id: 'posY', name: 'Position Y', unit: '%', min: -100, max: 100, step: 0.5, display: 1 },
  { id: 'scale', name: 'Scale', unit: '%', min: 0.05, max: 5, step: 0.01, display: 100 },
  { id: 'rotate', name: 'Rotation', unit: '°', min: -1800, max: 1800, step: 1, display: 1 },
  { id: 'opacity', name: 'Opacity', unit: '%', min: 0, max: 1, step: 0.01, display: 100 },
  { id: 'volume', name: 'Volume', unit: '%', min: 0, max: 1, step: 0.01, display: 100 },
]

export const EASING_LABELS: Record<EasingType, string> = {
  linear: 'Linear',
  'ease-in': 'Ease In',
  'ease-out': 'Ease Out',
  'ease-in-out': 'Ease In Out',
  hold: 'Hold',
}

/** Shape the interpolation between a keyframe and the one after it. */
export function applyEasing(easing: EasingType, t: number): number {
  const u = t < 0 ? 0 : t > 1 ? 1 : t
  switch (easing) {
    case 'ease-in':
      return u * u * u
    case 'ease-out':
      return 1 - (1 - u) ** 3
    case 'ease-in-out':
      return u < 0.5 ? 4 * u * u * u : 1 - (-2 * u + 2) ** 3 / 2
    case 'hold':
      return 0
    case 'linear':
    default:
      return u
  }
}

/** Keyframes in ascending time order; the stored order is never trusted. */
export function sortKeyframes(frames: readonly Keyframe[]): Keyframe[] {
  return [...frames].sort((a, b) => a.time - b.time)
}

/**
 * Value of one property at `localTime` (seconds from the start of the item that
 * owns these keyframes). Outside the keyed range the nearest keyframe holds.
 */
export function evaluateTrack(
  frames: readonly Keyframe[] | undefined,
  localTime: number,
  fallback: number,
): number {
  if (frames === undefined || frames.length === 0) return fallback
  const sorted = sortKeyframes(frames)
  if (sorted.length === 1) return sorted[0].value

  const first = sorted[0]
  if (localTime <= first.time) return first.value
  const last = sorted[sorted.length - 1]
  if (localTime >= last.time) return last.value

  for (let i = 0; i < sorted.length - 1; i++) {
    const a = sorted[i]
    const b = sorted[i + 1]
    if (localTime < a.time || localTime > b.time) continue
    if (a.easing === 'hold') return a.value
    const span = b.time - a.time
    if (span <= 0) return b.value
    const eased = applyEasing(a.easing, (localTime - a.time) / span)
    return a.value + (b.value - a.value) * eased
  }
  return last.value
}

/** Every animatable property resolved at `localTime`, keyframes overriding statics. */
export function evaluateTracks(
  tracks: KeyframeTracks | undefined,
  statics: Partial<Record<AnimatableProperty, number | undefined>>,
  localTime: number,
): Record<AnimatableProperty, number> {
  const out = {} as Record<AnimatableProperty, number>
  for (const { id } of ANIMATABLE_PROPERTIES) {
    const fallback = statics[id] ?? PROPERTY_DEFAULTS[id]
    out[id] = evaluateTrack(tracks?.[id], localTime, fallback)
  }
  return out
}

export function hasKeyframes(tracks: KeyframeTracks | undefined): boolean {
  if (!tracks) return false
  return ANIMATABLE_PROPERTIES.some(({ id }) => (tracks[id]?.length ?? 0) > 0)
}

export function isPropertyAnimated(
  tracks: KeyframeTracks | undefined,
  property: AnimatableProperty,
): boolean {
  return (tracks?.[property]?.length ?? 0) > 0
}

/** Every keyframe time across all properties, deduplicated — used to draw timeline markers. */
export function keyframeTimes(tracks: KeyframeTracks | undefined): number[] {
  if (!tracks) return []
  const times = new Set<number>()
  for (const { id } of ANIMATABLE_PROPERTIES) {
    for (const frame of tracks[id] ?? []) times.add(Math.round(frame.time * 1000) / 1000)
  }
  return [...times].sort((a, b) => a - b)
}

/** Two keyframes closer together than this are treated as the same point in time. */
const TIME_EPSILON = 1e-3

/**
 * Add a keyframe, or move the existing one at that time to the new value. Returns
 * tracks with the property's keyframes sorted.
 */
export function setKeyframe(
  tracks: KeyframeTracks | undefined,
  property: AnimatableProperty,
  time: number,
  value: number,
  easing: EasingType = 'ease-in-out',
): KeyframeTracks {
  const existing = tracks?.[property] ?? []
  const at = existing.findIndex((frame) => Math.abs(frame.time - time) < TIME_EPSILON)
  const next =
    at >= 0
      ? existing.map((frame, index) => (index === at ? { ...frame, value } : frame))
      : [...existing, { id: crypto.randomUUID(), time: Math.max(0, time), value, easing }]
  return { ...tracks, [property]: sortKeyframes(next) }
}

export function removeKeyframe(
  tracks: KeyframeTracks | undefined,
  property: AnimatableProperty,
  keyframeId: string,
): KeyframeTracks {
  const existing = tracks?.[property] ?? []
  const next = existing.filter((frame) => frame.id !== keyframeId)
  const out = { ...tracks }
  if (next.length === 0) {
    delete out[property]
  } else {
    out[property] = next
  }
  return out
}

export function updateKeyframe(
  tracks: KeyframeTracks | undefined,
  property: AnimatableProperty,
  keyframeId: string,
  changes: Partial<Omit<Keyframe, 'id'>>,
): KeyframeTracks {
  const existing = tracks?.[property] ?? []
  const next = existing.map((frame) =>
    frame.id === keyframeId
      ? { ...frame, ...changes, time: Math.max(0, changes.time ?? frame.time) }
      : frame,
  )
  return { ...tracks, [property]: sortKeyframes(next) }
}

/** Drop every keyframe on one property, leaving its static value in charge again. */
export function clearTrack(
  tracks: KeyframeTracks | undefined,
  property: AnimatableProperty,
): KeyframeTracks {
  const out = { ...tracks }
  delete out[property]
  return out
}

/**
 * Shift and drop keyframes so they still line up with the media after a trim or
 * split. `offset` is how far the item's start moved forward through its own
 * source, in timeline seconds; `length` is the piece's new length.
 */
export function sliceTracks(
  tracks: KeyframeTracks | undefined,
  offset: number,
  length: number,
): KeyframeTracks | undefined {
  if (!tracks) return undefined
  const out: KeyframeTracks = {}
  for (const { id } of ANIMATABLE_PROPERTIES) {
    const frames = tracks[id]
    if (!frames || frames.length === 0) continue
    const shifted = sortKeyframes(frames)
      .map((frame) => ({ ...frame, time: frame.time - offset }))
      .filter((frame) => frame.time >= -TIME_EPSILON && frame.time <= length + TIME_EPSILON)
      .map((frame) => ({ ...frame, time: Math.max(0, Math.min(length, frame.time)) }))
    if (shifted.length > 0) out[id] = shifted
  }
  return hasKeyframes(out) ? out : undefined
}
