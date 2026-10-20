import { evaluateTracks } from './keyframes.ts'
import type { AnimatableProperty, KeyframeTracks, Transformable } from './types.ts'

/** A transform resolved at one instant, ready for either renderer. */
export interface EvaluatedTransform {
  /** Horizontal offset from centre, as a percentage of frame width. */
  posX: number
  /** Vertical offset from centre, as a percentage of frame height. */
  posY: number
  scale: number
  /** Free rotation in degrees, clockwise. */
  rotate: number
  opacity: number
}

export const IDENTITY_TRANSFORM: EvaluatedTransform = {
  posX: 0,
  posY: 0,
  scale: 1,
  rotate: 0,
  opacity: 1,
}

/**
 * Resolve an item's transform at `localTime` (seconds from the item's own start).
 * Keyframed properties animate; the rest hold their static value.
 */
export function evaluateTransform(item: Transformable | null | undefined, localTime: number): EvaluatedTransform {
  if (!item) return IDENTITY_TRANSFORM
  const values = evaluateTracks(
    item.keyframes,
    { posX: item.posX, posY: item.posY, scale: item.scale, rotate: item.rotate, opacity: item.opacity },
    localTime,
  )
  return {
    posX: values.posX,
    posY: values.posY,
    scale: values.scale,
    rotate: values.rotate,
    opacity: values.opacity,
  }
}

export function isIdentityTransform(t: EvaluatedTransform): boolean {
  return t.posX === 0 && t.posY === 0 && t.scale === 1 && t.rotate === 0 && t.opacity === 1
}

/**
 * CSS transform for the preview. Percentages resolve against the element's own
 * box, which fills the stage, so they match the canvas renderer's frame
 * percentages. Order matches `applyTransformToContext`.
 */
export function transformToCss(t: EvaluatedTransform): string {
  const parts: string[] = []
  if (t.posX !== 0 || t.posY !== 0) parts.push(`translate(${t.posX}%, ${t.posY}%)`)
  if (t.rotate !== 0) parts.push(`rotate(${t.rotate}deg)`)
  if (t.scale !== 1) parts.push(`scale(${t.scale})`)
  return parts.join(' ')
}

/**
 * Same transform on a canvas, about the frame centre. Call inside save()/restore();
 * opacity is left to the caller so it can combine with a transition's own alpha.
 */
export function applyTransformToContext(
  context: CanvasRenderingContext2D,
  t: EvaluatedTransform,
  width: number,
  height: number,
) {
  if (isIdentityTransform({ ...t, opacity: 1 })) return
  const cx = width / 2
  const cy = height / 2
  context.translate(cx + (t.posX / 100) * width, cy + (t.posY / 100) * height)
  if (t.rotate !== 0) context.rotate((t.rotate * Math.PI) / 180)
  if (t.scale !== 1) context.scale(t.scale, t.scale)
  context.translate(-cx, -cy)
}

/** Canvas composite operation for a blend mode. */
export function blendModeToComposite(mode: string | undefined): GlobalCompositeOperation {
  switch (mode) {
    case 'screen':
      return 'screen'
    case 'multiply':
      return 'multiply'
    case 'overlay':
      return 'overlay'
    case 'soft-light':
      return 'soft-light'
    default:
      return 'source-over'
  }
}

/** Volume at `localTime`, honouring any volume keyframes on the item. */
export function evaluateVolume(
  keyframes: KeyframeTracks | undefined,
  staticVolume: number,
  localTime: number,
): number {
  const values = evaluateTracks(keyframes, { volume: staticVolume }, localTime)
  return Math.max(0, Math.min(1, values.volume))
}

/** Properties an item currently animates, for badges in the inspector. */
export function animatedProperties(tracks: KeyframeTracks | undefined): AnimatableProperty[] {
  if (!tracks) return []
  return (Object.keys(tracks) as AnimatableProperty[]).filter((key) => (tracks[key]?.length ?? 0) > 0)
}
