import type { Size } from './export/plan.ts'
import type { LowerThirdStyle, OverlayAnimation, OverlayItem, VfxOverlayType } from './types.ts'

export interface VfxPresetInfo {
  id: VfxOverlayType
  name: string
  icon: string
  description: string
}

export const VFX_OVERLAY_PRESETS: readonly VfxPresetInfo[] = [
  {
    id: 'letterbox',
    name: 'Cinematic Bars',
    icon: '🎬',
    description: '2.35:1 widescreen top & bottom black letterbox bars',
  },
  {
    id: 'vignette',
    name: 'Vignette',
    icon: '🌑',
    description: 'Soft feathered dark focus around the frame edges',
  },
  {
    id: 'film-grain',
    name: 'Film Grain',
    icon: '🎞️',
    description: 'Classic 35mm analogue celluloid grain texture',
  },
  {
    id: 'light-leak',
    name: 'Light Leak',
    icon: '✨',
    description: 'Warm organic golden sun flare and ambient glow',
  },
  {
    id: 'glitch',
    name: 'Glitch / VHS',
    icon: '⚡',
    description: 'Analog video tape distortion and chromatic scan lines',
  },
  {
    id: 'scanlines',
    name: 'CRT Scanlines',
    icon: '📺',
    description: 'Retro arcade / TV monitor horizontal phosphor scanlines',
  },
  {
    id: 'bokeh',
    name: 'Bokeh Dust',
    icon: '🫧',
    description: 'Dreamy floating out-of-focus optical light circles',
  },
]

export interface LowerThirdPresetInfo {
  id: LowerThirdStyle
  name: string
  icon: string
  description: string
}

export const LOWER_THIRD_PRESETS: readonly LowerThirdPresetInfo[] = [
  {
    id: 'broadcast',
    name: 'Broadcast Bar',
    icon: '📺',
    description: 'Modern television lower third with accent pill and bold title',
  },
  {
    id: 'minimal',
    name: 'Minimal Tag',
    icon: '🏷️',
    description: 'Clean frosted glass tag with sleek typography',
  },
  {
    id: 'social',
    name: 'Social Handle',
    icon: '💬',
    description: 'Creator tag with avatar icon and @handle label',
  },
  {
    id: 'breaking-news',
    name: 'Breaking News',
    icon: '🔴',
    description: 'High-impact red alert ribbon and headline banner',
  },
]

export function createDefaultOverlay(
  category: OverlayItem['category'],
  start: number,
  duration = 4,
  clipId?: string,
): OverlayItem {
  const id = crypto.randomUUID()
  const base = { id, category, start, duration, opacity: 1, blendMode: 'normal' as const }

  switch (category) {
    case 'media':
      return {
        ...base,
        clipId,
        x: 80,
        y: 20,
        width: 28,
        borderRadius: 8,
        borderColor: '#ffffff',
        borderWidth: 2,
      }
    case 'vfx':
      return {
        ...base,
        vfxType: 'letterbox',
        intensity: 0.85,
      }
    case 'lower-third':
      return {
        ...base,
        lowerThirdStyle: 'broadcast',
        title: 'Speaker Name',
        subtitle: 'Host / Content Creator',
        accentColor: '#3b82f6',
        x: 10,
        y: 84,
      }
    case 'color':
      return {
        ...base,
        color: '#f97316',
        colorSecondary: '#a855f7',
        gradientAngle: 135,
        opacity: 0.25,
        blendMode: 'overlay',
      }
  }
}

function pathRoundedRect(
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
) {
  const ctx = context as unknown as { roundRect?: (x: number, y: number, w: number, h: number, r: number) => void }
  if (typeof ctx.roundRect === 'function' && radius > 0) {
    ctx.roundRect.call(context, x, y, width, height, radius)
  } else {
    context.rect(x, y, width, height)
  }
}

/**
 * Draws all active overlays onto a canvas context (used for export and offscreen rendering).
 */
/**
 * Anything a picture-in-picture overlay can be drawn from. A still is backed by
 * an ImageBitmap; a video PiP is backed by whichever frame the renderer decoded
 * for this instant. Hiding the difference here is what lets video PiP export at
 * all — the export used to hand over a bitmap map built only from still images,
 * so a video PiP silently drew nothing.
 */
export interface OverlayFrame {
  width: number
  height: number
  draw: (
    context: CanvasRenderingContext2D,
    dx: number,
    dy: number,
    dWidth: number,
    dHeight: number,
  ) => void
}

/**
 * Frames for the overlays being drawn, looked up by overlay id first (a video
 * PiP decodes per overlay, since the same clip may appear more than once) and
 * falling back to clip id for stills, which are shared.
 */
export interface OverlayFrameSource {
  byOverlayId?: ReadonlyMap<string, OverlayFrame>
  byClipId?: ReadonlyMap<string, OverlayFrame>
}

/** Wrap a still image so it satisfies the same contract as a decoded video frame. */
export function overlayFrameFromBitmap(bitmap: ImageBitmap): OverlayFrame {
  return {
    width: bitmap.width,
    height: bitmap.height,
    draw: (context, dx, dy, dWidth, dHeight) => context.drawImage(bitmap, dx, dy, dWidth, dHeight),
  }
}

function resolveOverlayFrame(
  item: OverlayItem,
  frames?: OverlayFrameSource,
): OverlayFrame | undefined {
  if (frames === undefined) return undefined
  return (
    frames.byOverlayId?.get(item.id) ??
    (item.clipId === undefined ? undefined : frames.byClipId?.get(item.clipId))
  )
}

/**
 * Default stacking when nothing sets `overlayZ`: washes tint the picture, VFX
 * sit in the atmosphere above them, picture-in-picture is a window on top of
 * both, and titling stays frontmost.
 */
const CATEGORY_RANK: Record<OverlayItem['category'], number> = {
  color: 0,
  vfx: 1,
  media: 2,
  'lower-third': 3,
}

/**
 * Paint order for an overlay stack, back to front. Both renderers sort through
 * here so the preview and the exported file agree; they used to disagree, the
 * preview stacking by category and the export painting in array order.
 */
/** Default length of an overlay's entrance or exit, in seconds. */
const DEFAULT_OVERLAY_ANIM_DURATION = 0.4

/** Where an overlay's entrance or exit has got to, as plain numbers both renderers can apply. */
export interface OverlayAnimationState {
  /** Multiplier on the overlay's own opacity. */
  opacity: number
  /** Offset as a fraction of frame width / height. */
  offsetX: number
  offsetY: number
  scale: number
  /** Horizontal reveal, 0 to 1; 1 is fully shown. Measured across the frame. */
  reveal: number
}

const NEUTRAL_ANIMATION: OverlayAnimationState = {
  opacity: 1,
  offsetX: 0,
  offsetY: 0,
  scale: 1,
  reveal: 1,
}

/** `amount` is 1 when fully on screen and 0 at the far end of the animation. */
function animationShape(kind: OverlayAnimation, amount: number): OverlayAnimationState {
  const a = Math.max(0, Math.min(1, amount))
  switch (kind) {
    case 'fade':
      return { ...NEUTRAL_ANIMATION, opacity: a }
    case 'slide-left':
      // Travels leftwards, so it comes in from the right.
      return { ...NEUTRAL_ANIMATION, opacity: a, offsetX: (1 - a) * 0.25 }
    case 'slide-up':
      return { ...NEUTRAL_ANIMATION, opacity: a, offsetY: (1 - a) * 0.25 }
    case 'scale-pop':
      return { ...NEUTRAL_ANIMATION, opacity: a, scale: 0.82 + 0.18 * a }
    case 'wipe-right':
      return { ...NEUTRAL_ANIMATION, reveal: a }
    case 'none':
    default:
      return NEUTRAL_ANIMATION
  }
}

/** Smoothstep, so entrances settle rather than arriving at constant speed. */
function smoothstep(t: number): number {
  const u = Math.max(0, Math.min(1, t))
  return u * u * (3 - 2 * u)
}

/**
 * The entrance or exit an overlay is part-way through at `time`. Both renderers
 * read this so an overlay animates identically on screen and in the file.
 *
 * An animation is clamped to half the overlay's length, so a short overlay
 * cannot have its entrance and exit overlap.
 */
export function overlayAnimationAt(item: OverlayItem, time: number): OverlayAnimationState {
  const local = time - item.start
  if (item.duration <= 0) return NEUTRAL_ANIMATION
  const half = item.duration / 2

  const inKind = item.overlayAnimIn ?? 'none'
  if (inKind !== 'none') {
    const inDuration = Math.min(item.overlayAnimInDuration ?? DEFAULT_OVERLAY_ANIM_DURATION, half)
    if (inDuration > 0 && local < inDuration) {
      return animationShape(inKind, smoothstep(local / inDuration))
    }
  }

  const outKind = item.overlayAnimOut ?? 'none'
  if (outKind !== 'none') {
    const outDuration = Math.min(item.overlayAnimOutDuration ?? DEFAULT_OVERLAY_ANIM_DURATION, half)
    const remaining = item.duration - local
    if (outDuration > 0 && remaining < outDuration) {
      return animationShape(outKind, smoothstep(remaining / outDuration))
    }
  }

  return NEUTRAL_ANIMATION
}

export function isNeutralOverlayAnimation(state: OverlayAnimationState): boolean {
  return (
    state.opacity === 1 &&
    state.offsetX === 0 &&
    state.offsetY === 0 &&
    state.scale === 1 &&
    state.reveal === 1
  )
}

/**
 * The point an overlay's entrance scales and slides about: its own anchor where
 * it has one, otherwise the frame centre for full-frame washes and effects.
 */
export function overlayAnchor(item: OverlayItem, size: Size): { x: number; y: number } {
  if (item.category === 'media' || item.category === 'lower-third') {
    return { x: ((item.x ?? 50) / 100) * size.width, y: ((item.y ?? 50) / 100) * size.height }
  }
  return { x: size.width / 2, y: size.height / 2 }
}

/** Noise texels along one edge of a grain tile. */
const GRAIN_TILE_TEXELS = 128
/** How often the grain pattern is reshuffled, in tiles per second. */
const GRAIN_FPS = 12
/** Distinct grain tiles cycled through, so the texture moves without regenerating. */
const GRAIN_VARIANTS = 6

export interface GrainMetrics {
  /** Output pixels per noise texel. */
  texelPx: number
  /** Alpha the grain layer is composited at. */
  alpha: number
  /** Whether the grain carries colour noise rather than luma-only. */
  colored: boolean
}

/**
 * Grain sizing for a frame. `vfxGrainSize` is expressed in output pixels per
 * texel at 1080p — 0.8 is fine-grained stock, 1.4 classic 35mm, 3.0 Super-8 —
 * so it is scaled by the real frame height to look the same at any resolution.
 */
export function grainMetrics(item: OverlayItem, size: Size): GrainMetrics {
  const intensity = Math.max(0, Math.min(1, item.intensity ?? 1))
  const nominal = item.vfxGrainSize ?? 1.4
  const scale = size.height > 0 ? size.height / 1080 : 1
  return {
    texelPx: Math.max(0.5, nominal * scale),
    alpha: 0.38 * intensity,
    colored: item.vfxGrainColor ?? false,
  }
}

/** Deterministic value noise, so a given tile renders identically every time. */
function grainValue(seed: number, index: number): number {
  const x = Math.sin(seed * 374_761_393 + index * 668_265_263) * 43_758.545_3
  return x - Math.floor(x)
}

const grainTiles = new Map<string, HTMLCanvasElement>()

/**
 * A tiling noise texture. Mid-grey is the neutral point under the `overlay`
 * blend, so texels scatter either side of it and the picture is modulated
 * rather than veiled.
 */
export function grainTile(item: OverlayItem, step: number): HTMLCanvasElement | null {
  if (typeof document === 'undefined') return null
  const colored = item.vfxGrainColor ?? false
  const variant = ((step % GRAIN_VARIANTS) + GRAIN_VARIANTS) % GRAIN_VARIANTS
  const key = `${colored ? 'c' : 'm'}-${variant}`
  const cached = grainTiles.get(key)
  if (cached !== undefined) return cached

  const canvas = document.createElement('canvas')
  canvas.width = GRAIN_TILE_TEXELS
  canvas.height = GRAIN_TILE_TEXELS
  const context = canvas.getContext('2d')
  if (context === null) return null

  const image = context.createImageData(GRAIN_TILE_TEXELS, GRAIN_TILE_TEXELS)
  const spread = 110
  for (let i = 0; i < GRAIN_TILE_TEXELS * GRAIN_TILE_TEXELS; i++) {
    const base = 128 + (grainValue(variant + 1, i) - 0.5) * spread
    const offset = i * 4
    image.data[offset] = base
    image.data[offset + 1] = colored ? 128 + (grainValue(variant + 31, i) - 0.5) * spread : base
    image.data[offset + 2] = colored ? 128 + (grainValue(variant + 67, i) - 0.5) * spread : base
    image.data[offset + 3] = 255
  }
  context.putImageData(image, 0, 0)
  grainTiles.set(key, canvas)
  return canvas
}

/**
 * Tile height as a fraction of frame height. `texelPx` scales with the frame,
 * so this ratio is the same at any resolution — which lets the preview size the
 * texture in percentages and match the export without measuring anything.
 */
export function grainTileHeightFraction(item: OverlayItem): number {
  return ((item.vfxGrainSize ?? 1.4) * GRAIN_TILE_TEXELS) / 1080
}

/** The grain texture as a data URL, for the preview's CSS background. */
export function grainTileUrl(item: OverlayItem, step: number): string | null {
  const tile = grainTile(item, step)
  return tile === null ? null : tile.toDataURL('image/png')
}

/**
 * Source time a picture-in-picture overlay shows at a timeline time. Shared so
 * the preview and the exporter scrub the same frame of the PiP source.
 */
export function pipSourceTime(item: OverlayItem, time: number): number {
  const offset = Math.max(0, time - item.start)
  return Math.max(0, (item.pipInPoint ?? 0) + offset * (item.pipSpeed ?? 1))
}

export function sortOverlaysForPaint<T extends OverlayItem>(items: readonly T[]): T[] {
  return items
    .map((item, index) => ({ item, index }))
    .sort((a, b) => {
      const za = a.item.overlayZ ?? CATEGORY_RANK[a.item.category]
      const zb = b.item.overlayZ ?? CATEGORY_RANK[b.item.category]
      if (za !== zb) return za - zb
      return a.index - b.index
    })
    .map((entry) => entry.item)
}

export function activeOverlaysAt<T extends OverlayItem>(items: readonly T[], time: number): T[] {
  return sortOverlaysForPaint(
    items.filter((item) => time >= item.start && time < item.start + item.duration),
  )
}

export function drawOverlays(
  context: CanvasRenderingContext2D,
  items: readonly OverlayItem[],
  time: number,
  size: Size,
  frames?: OverlayFrameSource,
) {
  const active = activeOverlaysAt(items, time)
  if (active.length === 0) return

  for (const item of active) {
    context.save()

    const animation = overlayAnimationAt(item, time)
    const opacity = Math.max(0, Math.min(1, item.opacity ?? 1)) * animation.opacity
    if (opacity <= 0.001) {
      context.restore()
      continue
    }
    context.globalAlpha = opacity

    // Blend mode mapping for canvas
    if (item.blendMode && item.blendMode !== 'normal') {
      context.globalCompositeOperation = item.blendMode as GlobalCompositeOperation
    }

    if (!isNeutralOverlayAnimation(animation)) {
      // The wipe is measured across the frame rather than the overlay's own box,
      // which is what the preview's clip-path does too — the two agree, which
      // matters more here than clipping each category to its own bounds.
      if (animation.reveal < 1) {
        context.beginPath()
        context.rect(0, 0, size.width * animation.reveal, size.height)
        context.clip()
      }
      if (animation.offsetX !== 0 || animation.offsetY !== 0 || animation.scale !== 1) {
        const anchor = overlayAnchor(item, size)
        context.translate(
          anchor.x + animation.offsetX * size.width,
          anchor.y + animation.offsetY * size.height,
        )
        context.scale(animation.scale, animation.scale)
        context.translate(-anchor.x, -anchor.y)
      }
    }

    switch (item.category) {
      case 'media':
        drawMediaOverlay(context, item, size, frames)
        break
      case 'vfx':
        drawVfxOverlay(context, item, size, time)
        break
      case 'lower-third':
        drawLowerThirdOverlay(context, item, size)
        break
      case 'color':
        drawColorWashOverlay(context, item, size)
        break
    }

    context.restore()
  }
}

function drawMediaOverlay(
  context: CanvasRenderingContext2D,
  item: OverlayItem,
  size: Size,
  frames?: OverlayFrameSource,
) {
  const frame = resolveOverlayFrame(item, frames)
  if (frame === undefined) return

  const widthPct = (item.width ?? 30) / 100
  const dw = size.width * widthPct
  const aspect = frame.height > 0 ? frame.width / frame.height : 16 / 9
  const dh = dw / aspect

  const cx = ((item.x ?? 50) / 100) * size.width
  const cy = ((item.y ?? 50) / 100) * size.height
  const dx = cx - dw / 2
  const dy = cy - dh / 2

  const radius = Math.min(item.borderRadius ?? 0, Math.min(dw, dh) / 2)

  context.save()
  if (radius > 0) {
    context.beginPath()
    pathRoundedRect(context, dx, dy, dw, dh, radius)
    context.clip()
  }

  frame.draw(context, dx, dy, dw, dh)
  context.restore()

  // Border stroke
  if (item.borderWidth && item.borderWidth > 0 && item.borderColor) {
    context.save()
    context.lineWidth = item.borderWidth * (size.height / 720)
    context.strokeStyle = item.borderColor
    context.beginPath()
    pathRoundedRect(context, dx, dy, dw, dh, radius)
    context.stroke()
    context.restore()
  }
}

function drawVfxOverlay(
  context: CanvasRenderingContext2D,
  item: OverlayItem,
  size: Size,
  time: number,
) {
  const intensity = Math.max(0, Math.min(1, item.intensity ?? 1))
  const type = item.vfxType ?? 'letterbox'

  switch (type) {
    case 'letterbox': {
      // Top and bottom 2.35:1 aspect widescreen black bars
      const barHeight = Math.round(size.height * 0.125 * intensity)
      context.fillStyle = '#000000'
      context.fillRect(0, 0, size.width, barHeight)
      context.fillRect(0, size.height - barHeight, size.width, barHeight)
      break
    }
    case 'vignette': {
      const cx = size.width / 2
      const cy = size.height / 2
      const radius = Math.hypot(cx, cy)
      const grad = context.createRadialGradient(cx, cy, radius * 0.45, cx, cy, radius)
      grad.addColorStop(0, 'rgba(0, 0, 0, 0)')
      grad.addColorStop(1, `rgba(0, 0, 0, ${(0.85 * intensity).toFixed(3)})`)
      context.fillStyle = grad
      context.fillRect(0, 0, size.width, size.height)
      break
    }
    case 'film-grain': {
      // Real grain covers the whole frame. Scattering a few hundred dots, as
      // this once did, reached about 0.03% of a 1080p frame while the preview's
      // CSS dot pattern covered roughly a third of it.
      const metrics = grainMetrics(item, size)
      const tile = grainTile(item, Math.floor(time * GRAIN_FPS))
      if (tile === null) break
      const pattern = context.createPattern(tile, 'repeat')
      if (pattern === null) break
      context.save()
      context.globalAlpha = metrics.alpha
      context.globalCompositeOperation = 'overlay'
      // Scale the pattern so one noise texel is `texelPx` output pixels.
      context.scale(metrics.texelPx, metrics.texelPx)
      context.fillStyle = pattern
      context.fillRect(0, 0, size.width / metrics.texelPx, size.height / metrics.texelPx)
      context.restore()
      break
    }
    case 'light-leak': {
      const cx = size.width * 0.15
      const cy = size.height * 0.15
      const r = Math.max(size.width, size.height) * 0.65
      const grad = context.createRadialGradient(cx, cy, 0, cx, cy, r)
      grad.addColorStop(0, `rgba(255, 170, 70, ${(0.45 * intensity).toFixed(3)})`)
      grad.addColorStop(0.4, `rgba(255, 90, 150, ${(0.25 * intensity).toFixed(3)})`)
      grad.addColorStop(1, 'rgba(0, 0, 0, 0)')
      context.globalCompositeOperation = 'screen'
      context.fillStyle = grad
      context.fillRect(0, 0, size.width, size.height)
      break
    }
    case 'glitch': {
      // Subtle RGB shift scanline blocks
      const step = Math.floor(time * 12)
      context.fillStyle = `rgba(0, 240, 255, ${(0.15 * intensity).toFixed(3)})`
      const y1 = ((Math.sin(step * 43) + 1) * 0.5) * size.height
      context.fillRect(0, y1, size.width, Math.max(4, size.height * 0.03))
      context.fillStyle = `rgba(255, 0, 90, ${(0.15 * intensity).toFixed(3)})`
      const y2 = ((Math.cos(step * 71) + 1) * 0.5) * size.height
      context.fillRect(0, y2, size.width, Math.max(4, size.height * 0.025))
      break
    }
    case 'scanlines': {
      context.fillStyle = `rgba(0, 0, 0, ${(0.35 * intensity).toFixed(3)})`
      const lineHeight = Math.max(2, Math.round(size.height / 240))
      for (let y = 0; y < size.height; y += lineHeight * 2) {
        context.fillRect(0, y, size.width, lineHeight)
      }
      break
    }
    case 'bokeh': {
      const orbs = 14
      context.globalCompositeOperation = 'screen'
      for (let i = 0; i < orbs; i++) {
        const ox = ((Math.sin(i * 89 + time * 0.3) + 1) * 0.5) * size.width
        const oy = ((Math.cos(i * 47 + time * 0.2) + 1) * 0.5) * size.height
        const rad = ((Math.sin(i * 17) + 1) * 0.5 * 30 + 15) * (size.height / 720)
        const grad = context.createRadialGradient(ox, oy, 0, ox, oy, rad)
        grad.addColorStop(0, `rgba(255, 235, 180, ${(0.3 * intensity).toFixed(3)})`)
        grad.addColorStop(1, 'rgba(255, 235, 180, 0)')
        context.fillStyle = grad
        context.beginPath()
        context.arc(ox, oy, rad, 0, Math.PI * 2)
        context.fill()
      }
      break
    }
  }
}

function drawLowerThirdOverlay(
  context: CanvasRenderingContext2D,
  item: OverlayItem,
  size: Size,
) {
  const scale = size.height / 720
  const titleText = item.title ?? 'Speaker Name'
  const subtitleText = item.subtitle ?? 'Title / Role'
  const accentColor = item.accentColor ?? '#3b82f6'
  const style = item.lowerThirdStyle ?? 'broadcast'

  const titleSize = Math.max(16, Math.round(24 * scale))
  const subSize = Math.max(12, Math.round(15 * scale))

  // Determine base coordinate
  const x = ((item.x ?? 8) / 100) * size.width
  const y = ((item.y ?? 82) / 100) * size.height

  context.save()

  if (style === 'breaking-news') {
    // Red breaking ribbon
    const barHeight = Math.round(52 * scale)
    const ribbonWidth = Math.min(size.width * 0.9, Math.max(340 * scale, size.width * 0.6))

    context.fillStyle = '#dc2626'
    context.fillRect(x, y, ribbonWidth, barHeight)

    // Alert pill
    context.fillStyle = '#991b1b'
    const tagWidth = Math.round(120 * scale)
    context.fillRect(x, y, tagWidth, barHeight)
    context.font = `bold ${subSize}px sans-serif`
    context.fillStyle = '#ffffff'
    context.textAlign = 'center'
    context.textBaseline = 'middle'
    context.fillText('BREAKING', x + tagWidth / 2, y + barHeight / 2)

    // Headline
    context.font = `bold ${titleSize}px sans-serif`
    context.fillStyle = '#ffffff'
    context.textAlign = 'left'
    context.fillText(titleText, x + tagWidth + 14 * scale, y + barHeight / 2)
  } else if (style === 'minimal') {
    // Frosted minimal tag
    context.font = `bold ${titleSize}px sans-serif`
    const tWidth = context.measureText(titleText).width
    context.font = `${subSize}px sans-serif`
    const sWidth = context.measureText(subtitleText).width
    const cardWidth = Math.max(tWidth, sWidth) + 32 * scale
    const cardHeight = titleSize + subSize + 22 * scale

    context.fillStyle = 'rgba(15, 23, 42, 0.75)'
    context.beginPath()
    pathRoundedRect(context, x, y, cardWidth, cardHeight, 10 * scale)
    context.fill()

    context.lineWidth = 1
    context.strokeStyle = 'rgba(255, 255, 255, 0.2)'
    context.stroke()

    context.fillStyle = '#ffffff'
    context.font = `bold ${titleSize}px sans-serif`
    context.textAlign = 'left'
    context.textBaseline = 'top'
    context.fillText(titleText, x + 16 * scale, y + 10 * scale)

    context.fillStyle = '#94a3b8'
    context.font = `${subSize}px sans-serif`
    context.fillText(subtitleText, x + 16 * scale, y + 14 * scale + titleSize)
  } else if (style === 'social') {
    // Creator social card
    const cardHeight = Math.round(44 * scale)
    context.font = `bold ${titleSize}px sans-serif`
    const cardWidth = context.measureText(titleText).width + 60 * scale

    context.fillStyle = 'rgba(0, 0, 0, 0.82)'
    context.beginPath()
    pathRoundedRect(context, x, y, cardWidth, cardHeight, 22 * scale)
    context.fill()

    // Accent icon dot
    context.fillStyle = accentColor
    context.beginPath()
    context.arc(x + 22 * scale, y + cardHeight / 2, 9 * scale, 0, Math.PI * 2)
    context.fill()

    context.fillStyle = '#ffffff'
    context.font = `bold ${titleSize}px sans-serif`
    context.textAlign = 'left'
    context.textBaseline = 'middle'
    context.fillText(titleText, x + 40 * scale, y + cardHeight / 2)
  } else {
    // Default 'broadcast' lower third
    context.font = `bold ${titleSize}px sans-serif`
    const tWidth = context.measureText(titleText).width
    context.font = `${subSize}px sans-serif`
    const sWidth = context.measureText(subtitleText).width
    const cardWidth = Math.max(tWidth, sWidth) + 36 * scale
    const cardHeight = titleSize + subSize + 24 * scale

    context.fillStyle = 'rgba(10, 15, 29, 0.88)'
    context.beginPath()
    pathRoundedRect(context, x, y, cardWidth, cardHeight, 6 * scale)
    context.fill()

    // Left accent vertical bar
    context.fillStyle = accentColor
    context.fillRect(x, y, 6 * scale, cardHeight)

    // Title text
    context.fillStyle = '#ffffff'
    context.font = `bold ${titleSize}px sans-serif`
    context.textAlign = 'left'
    context.textBaseline = 'top'
    context.fillText(titleText, x + 18 * scale, y + 10 * scale)

    // Subtitle text
    context.fillStyle = accentColor
    context.font = `600 ${subSize}px sans-serif`
    context.fillText(subtitleText, x + 18 * scale, y + 14 * scale + titleSize)
  }

  context.restore()
}

function drawColorWashOverlay(
  context: CanvasRenderingContext2D,
  item: OverlayItem,
  size: Size,
) {
  const c1 = item.color ?? '#3b82f6'
  const c2 = item.colorSecondary

  if (c2) {
    const angle = (item.gradientAngle ?? 135) * (Math.PI / 180)
    const cx = size.width / 2
    const cy = size.height / 2
    const len = Math.hypot(size.width, size.height) / 2
    const x0 = cx - Math.cos(angle) * len
    const y0 = cy - Math.sin(angle) * len
    const x1 = cx + Math.cos(angle) * len
    const y1 = cy + Math.sin(angle) * len

    const grad = context.createLinearGradient(x0, y0, x1, y1)
    grad.addColorStop(0, c1)
    grad.addColorStop(1, c2)
    context.fillStyle = grad
  } else {
    context.fillStyle = c1
  }

  context.fillRect(0, 0, size.width, size.height)
}
