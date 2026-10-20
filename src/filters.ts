import type { FilterType, TimelineItem } from './types.ts'

/**
 * Colour grading.
 *
 * Every look is a chain of SVG filter primitives rather than a CSS `filter`
 * string. CSS filter functions cannot mix colour channels, so the only way to
 * tint with them is `hue-rotate`, which rotates *every* hue at once — that is
 * what used to turn faces blue under Nordic Frost and green under Cyberpunk.
 * `feColorMatrix` mixes channels properly and `feComponentTransfer` gives real
 * per-channel tone curves, which is what split-toning (teal shadows, warm
 * highlights) actually requires.
 *
 * The same `url(#id)` string is handed to the live preview (`element.style.filter`)
 * and to the export (`ctx.filter`), so the two cannot drift apart.
 *
 * Caveat worth knowing: an SVG filter reference resolves against the document, so
 * it is silently ignored on an OffscreenCanvas. The export draws on a document
 * canvas, which is why this works; moving export rendering into a worker would
 * need a different approach.
 */

export interface FilterPreset {
  id: FilterType
  name: string
  description: string
}

/** A 4x5 colour matrix in feColorMatrix row-major order. */
type ColourMatrix = readonly number[]

const IDENTITY: ColourMatrix = [
  1, 0, 0, 0, 0,
  0, 1, 0, 0, 0,
  0, 0, 1, 0, 0,
  0, 0, 0, 1, 0,
]

/** Per-channel tone curve sample points, each 0..1, interpolated by feComponentTransfer. */
interface ToneCurve {
  r: readonly number[]
  g: readonly number[]
  b: readonly number[]
}

interface LookDefinition {
  /** Channel mixing applied first. */
  matrix?: ColourMatrix
  /** Saturation multiplier applied after the matrix (1 = untouched). */
  saturate?: number
  /** Per-channel curves, which is where split-toning lives. */
  curve?: ToneCurve
}

/**
 * The looks. Each is tuned to keep skin plausible: a mid-brown face
 * (#C68642) must stay recognisably a face at full intensity.
 */
const LOOKS: Partial<Record<FilterType, LookDefinition>> = {
  // Teal shadows, warm highlights — real split-toning via per-channel curves,
  // which a hue rotation can never produce.
  cinematic: {
    saturate: 1.12,
    curve: {
      r: [0.00, 0.26, 0.54, 0.80, 1.00],
      g: [0.01, 0.25, 0.50, 0.76, 0.97],
      b: [0.07, 0.30, 0.50, 0.71, 0.91],
    },
  },
  // Classic noir weighting: an orange camera filter darkens skies and keeps skin
  // bright, the opposite of a flat Rec.709 desaturation.
  noir: {
    matrix: [
      0.50, 0.35, 0.15, 0, 0,
      0.50, 0.35, 0.15, 0, 0,
      0.50, 0.35, 0.15, 0, 0,
      0, 0, 0, 1, 0,
    ],
    curve: {
      r: [0.00, 0.20, 0.48, 0.79, 1.00],
      g: [0.00, 0.20, 0.48, 0.79, 1.00],
      b: [0.00, 0.20, 0.48, 0.79, 1.00],
    },
  },
  // Faded print: warm, lifted blacks, soft highlights.
  vintage: {
    saturate: 0.82,
    matrix: [
      1.06, 0.08, 0.00, 0, 0,
      0.02, 1.00, 0.02, 0, 0,
      0.00, 0.05, 0.88, 0, 0,
      0, 0, 0, 1, 0,
    ],
    curve: {
      r: [0.08, 0.32, 0.55, 0.78, 0.96],
      g: [0.07, 0.30, 0.52, 0.75, 0.94],
      b: [0.10, 0.30, 0.49, 0.70, 0.88],
    },
  },
  // Golden hour: warmth from a channel mix, not a fixed sepia brown.
  warm: {
    saturate: 1.12,
    matrix: [
      1.10, 0.04, 0.00, 0, 0,
      0.02, 1.02, 0.00, 0, 0,
      0.00, 0.00, 0.90, 0, 0,
      0, 0, 0, 1, 0,
    ],
    curve: {
      r: [0.00, 0.28, 0.55, 0.81, 1.00],
      g: [0.00, 0.26, 0.51, 0.77, 0.98],
      b: [0.00, 0.23, 0.47, 0.72, 0.95],
    },
  },
  // Nordic frost: a genuine cooling (red down, blue up), so faces stay faces.
  cool: {
    saturate: 0.94,
    matrix: [
      0.90, 0.02, 0.02, 0, 0,
      0.00, 1.00, 0.04, 0, 0,
      0.02, 0.04, 1.14, 0, 0,
      0, 0, 0, 1, 0,
    ],
    curve: {
      r: [0.00, 0.24, 0.48, 0.74, 0.96],
      g: [0.01, 0.26, 0.51, 0.77, 0.99],
      b: [0.05, 0.31, 0.56, 0.80, 1.00],
    },
  },
  // Neon: magenta highlights against cyan shadows, with the green channel pulled
  // down rather than rotated, so skin reads tanned instead of alien.
  cyberpunk: {
    saturate: 1.18,
    matrix: [
      1.03, 0.00, 0.05, 0, 0,
      0.00, 0.97, 0.02, 0, 0,
      0.05, 0.00, 1.09, 0, 0,
      0, 0, 0, 1, 0,
    ],
    curve: {
      r: [0.02, 0.26, 0.51, 0.76, 0.96],
      g: [0.00, 0.23, 0.47, 0.72, 0.93],
      b: [0.07, 0.31, 0.55, 0.78, 0.97],
    },
  },
  // Lush but not clipped: the old version drove saturate to 1.7 and crushed
  // both ends of the range.
  vivid: {
    saturate: 1.45,
    curve: {
      r: [0.00, 0.25, 0.51, 0.78, 0.99],
      g: [0.00, 0.25, 0.51, 0.78, 0.99],
      b: [0.00, 0.25, 0.51, 0.78, 0.99],
    },
  },
  sepia: {
    saturate: 0,
    matrix: [
      0.393, 0.769, 0.189, 0, 0,
      0.349, 0.686, 0.168, 0, 0,
      0.272, 0.534, 0.131, 0, 0,
      0, 0, 0, 1, 0,
    ],
    curve: {
      r: [0.04, 0.30, 0.55, 0.79, 0.98],
      g: [0.03, 0.27, 0.51, 0.75, 0.95],
      b: [0.02, 0.22, 0.44, 0.67, 0.88],
    },
  },
  // Silver retention: strong contrast, low chroma, highlights held off the clip.
  bleach: {
    saturate: 0.55,
    curve: {
      r: [0.00, 0.17, 0.47, 0.80, 0.98],
      g: [0.00, 0.17, 0.47, 0.80, 0.98],
      b: [0.00, 0.18, 0.48, 0.80, 0.98],
    },
  },
  // Matte: lifted blacks and held-down highlights, the modern "film" look.
  faded: {
    saturate: 0.88,
    curve: {
      r: [0.14, 0.33, 0.52, 0.71, 0.89],
      g: [0.14, 0.33, 0.52, 0.71, 0.89],
      b: [0.16, 0.34, 0.52, 0.70, 0.87],
    },
  },
  // One-click neutral improvement: a gentle S-curve and a little life, nothing
  // that would need undoing on ordinary footage.
  auto: {
    saturate: 1.1,
    curve: {
      r: [0.00, 0.23, 0.50, 0.78, 1.00],
      g: [0.00, 0.23, 0.50, 0.78, 1.00],
      b: [0.00, 0.23, 0.50, 0.78, 1.00],
    },
  },
  // Desaturated and cool-shadowed, highlights kept soft.
  moody: {
    saturate: 0.7,
    matrix: [
      0.95, 0.02, 0.03, 0, 0,
      0.00, 0.97, 0.03, 0, 0,
      0.03, 0.03, 1.06, 0, 0,
      0, 0, 0, 1, 0,
    ],
    curve: {
      r: [0.04, 0.24, 0.45, 0.67, 0.88],
      g: [0.04, 0.24, 0.45, 0.67, 0.88],
      b: [0.07, 0.27, 0.48, 0.69, 0.90],
    },
  },
}

export const FILTER_PRESETS: readonly FilterPreset[] = [
  { id: 'none', name: 'Normal', description: 'Original footage colours' },
  { id: 'auto', name: 'Auto Fix', description: 'Gentle one-click contrast and life' },
  { id: 'cinematic', name: 'Cinematic', description: 'Teal shadows, warm highlights' },
  { id: 'noir', name: 'Noir B&W', description: 'Orange-filtered monochrome, dark skies' },
  { id: 'vintage', name: 'Vintage 70s', description: 'Warm faded print with lifted blacks' },
  { id: 'warm', name: 'Golden Hour', description: 'Sunlit warmth that keeps skin natural' },
  { id: 'cool', name: 'Nordic Frost', description: 'Cool daylight without turning faces blue' },
  { id: 'moody', name: 'Moody', description: 'Desaturated with cool shadows' },
  { id: 'faded', name: 'Faded Matte', description: 'Lifted blacks, soft highlights' },
  { id: 'cyberpunk', name: 'Cyberpunk', description: 'Neon magenta and cyan' },
  { id: 'vivid', name: 'Vivid Pop', description: 'Lush colour without clipping' },
  { id: 'sepia', name: 'Sepia Antique', description: 'Parchment and early photography' },
  { id: 'bleach', name: 'Bleach Bypass', description: 'Gritty silver retention' },
]

const clamp01 = (value: number) => Math.min(1, Math.max(0, value))
const lerp = (from: number, to: number, t: number) => from + (to - from) * t

/** Blend a look's matrix toward identity so intensity 0 is exactly the original image. */
const lerpMatrix = (matrix: ColourMatrix, t: number): number[] =>
  matrix.map((value, index) => lerp(IDENTITY[index], value, t))

/** Blend a curve toward the straight line y = x for the same reason. */
const lerpCurve = (values: readonly number[], t: number): number[] =>
  values.map((value, index) => lerp(index / (values.length - 1), value, t))

/** -100..100 user controls, resolved into the numbers the filter chain needs. */
interface Grade {
  exposure: number
  contrast: number
  saturation: number
  temperature: number
  tint: number
  highlights: number
  shadows: number
  fade: number
  vignette: number
  grain: number
  sharpen: number
}

export const readGrade = (item: TimelineItem | null | undefined): Grade => ({
  exposure: item?.filterExposure ?? 0,
  contrast: item?.filterContrast ?? 0,
  saturation: item?.filterSaturation ?? 0,
  temperature: item?.filterTemperature ?? 0,
  tint: item?.filterTint ?? 0,
  highlights: item?.filterHighlights ?? 0,
  shadows: item?.filterShadows ?? 0,
  fade: item?.filterFade ?? 0,
  vignette: item?.filterVignette ?? 0,
  grain: item?.filterGrain ?? 0,
  sharpen: item?.filterSharpen ?? 0,
})

const isNeutralGrade = (grade: Grade) => Object.values(grade).every((value) => value === 0)

/**
 * Build the five-point tone curve for the manual shadow/highlight/fade/contrast
 * controls. Working on sample points rather than a slope keeps the ends from
 * clipping: the black and white points move instead of the signal running past them.
 */
const manualCurve = (grade: Grade): number[] => {
  const black = clamp01((grade.shadows > 0 ? grade.shadows * 0.26 : 0) / 100 + (grade.fade * 0.16) / 100)
  const white = clamp01(1 - (grade.highlights < 0 ? -grade.highlights * 0.22 : 0) / 100 - (grade.fade * 0.06) / 100)
  const shadowPull = (grade.shadows < 0 ? grade.shadows * 0.18 : 0) / 100
  const highlightPush = (grade.highlights > 0 ? grade.highlights * 0.18 : 0) / 100
  const s = (grade.contrast * 0.6) / 100

  return [0, 0.25, 0.5, 0.75, 1].map((x) => {
    const base = black + (white - black) * x
    // A symmetric S around the midpoint for contrast, strongest at the quarter tones.
    const sCurve = s * Math.sin(Math.PI * 2 * (x - 0.5)) * -0.25
    const ends = shadowPull * (1 - x) * (1 - x) + highlightPush * x * x
    return clamp01(base + sCurve + ends)
  })
}

const SVG_NS = 'http://www.w3.org/2000/svg'
const DEFS_HOST_ID = 'mve-filter-defs'
const defined = new Set<string>()

const defsHost = (): SVGDefsElement | null => {
  if (typeof document === 'undefined') return null
  let svg = document.getElementById(DEFS_HOST_ID) as SVGSVGElement | null
  if (svg === null) {
    svg = document.createElementNS(SVG_NS, 'svg') as SVGSVGElement
    svg.id = DEFS_HOST_ID
    svg.setAttribute('width', '0')
    svg.setAttribute('height', '0')
    svg.setAttribute('aria-hidden', 'true')
    svg.style.position = 'absolute'
    svg.style.pointerEvents = 'none'
    svg.appendChild(document.createElementNS(SVG_NS, 'defs'))
    document.body.appendChild(svg)
  }
  return svg.querySelector('defs')
}

/** Short stable id for a chain, so identical grades reuse one filter element. */
const hashKey = (key: string): string => {
  let hash = 0
  for (let i = 0; i < key.length; i++) hash = (Math.imul(31, hash) + key.charCodeAt(i)) | 0
  return `mve-f-${(hash >>> 0).toString(36)}`
}

/**
 * Create (once) an SVG filter for this exact grade and return the `url(#id)`
 * both renderers can use, or 'none' when the grade is a no-op.
 */
export const getCssFilter = (
  type?: FilterType,
  intensity = 1,
  item?: TimelineItem | null,
): string => {
  const grade = readGrade(item)
  const strength = clamp01(intensity)
  const look = type && type !== 'none' && strength > 0.001 ? LOOKS[type] : undefined
  if (look === undefined && isNeutralGrade(grade)) return 'none'

  const parts: string[] = []

  if (look?.matrix) {
    parts.push(`<feColorMatrix type="matrix" values="${lerpMatrix(look.matrix, strength).map((n) => n.toFixed(4)).join(' ')}"/>`)
  }
  if (look?.saturate !== undefined) {
    parts.push(`<feColorMatrix type="saturate" values="${lerp(1, look.saturate, strength).toFixed(4)}"/>`)
  }
  if (look?.curve) {
    const { r, g, b } = look.curve
    parts.push(
      '<feComponentTransfer>' +
        `<feFuncR type="table" tableValues="${lerpCurve(r, strength).map((n) => n.toFixed(4)).join(' ')}"/>` +
        `<feFuncG type="table" tableValues="${lerpCurve(g, strength).map((n) => n.toFixed(4)).join(' ')}"/>` +
        `<feFuncB type="table" tableValues="${lerpCurve(b, strength).map((n) => n.toFixed(4)).join(' ')}"/>` +
        '</feComponentTransfer>',
    )
  }

  if (!isNeutralGrade(grade)) {
    // Exposure is a straight gain; everything else rides the tone curve or the
    // channel mix below.
    if (grade.exposure !== 0) {
      const slope = 1 + (grade.exposure * 0.5) / 100
      parts.push(
        '<feComponentTransfer>' +
          `<feFuncR type="linear" slope="${slope.toFixed(4)}"/>` +
          `<feFuncG type="linear" slope="${slope.toFixed(4)}"/>` +
          `<feFuncB type="linear" slope="${slope.toFixed(4)}"/>` +
          '</feComponentTransfer>',
      )
    }
    if (grade.temperature !== 0 || grade.tint !== 0) {
      const warm = grade.temperature / 100
      const green = grade.tint / 100
      parts.push(
        `<feColorMatrix type="matrix" values="${[
          1 + 0.18 * warm, 0, 0, 0, 0,
          0, 1 - 0.1 * green, 0, 0, 0,
          0, 0, 1 - 0.22 * warm, 0, 0,
          0, 0, 0, 1, 0,
        ].map((n) => n.toFixed(4)).join(' ')}"/>`,
      )
    }
    if (grade.saturation !== 0) {
      parts.push(`<feColorMatrix type="saturate" values="${(1 + (grade.saturation * 0.8) / 100).toFixed(4)}"/>`)
    }
    if (grade.contrast !== 0 || grade.highlights !== 0 || grade.shadows !== 0 || grade.fade !== 0) {
      const table = manualCurve(grade).map((n) => n.toFixed(4)).join(' ')
      parts.push(
        '<feComponentTransfer>' +
          `<feFuncR type="table" tableValues="${table}"/>` +
          `<feFuncG type="table" tableValues="${table}"/>` +
          `<feFuncB type="table" tableValues="${table}"/>` +
          '</feComponentTransfer>',
      )
    }
    if (grade.sharpen > 0) {
      const k = (grade.sharpen / 100) * 0.75
      const c = 1 + 4 * k
      parts.push(
        `<feConvolveMatrix order="3" kernelMatrix="0 ${(-k).toFixed(4)} 0 ${(-k).toFixed(4)} ${c.toFixed(4)} ${(-k).toFixed(4)} 0 ${(-k).toFixed(4)} 0" preserveAlpha="true"/>`,
      )
    }
    if (grade.grain > 0) {
      const grainAlpha = ((grade.grain / 100) * 0.35).toFixed(4)
      parts.push(
        `<feTurbulence type="fractalNoise" baseFrequency="0.75" numOctaves="3" result="grainNoise"/>` +
          `<feColorMatrix type="matrix" in="grainNoise" result="grainMono" values="0 0 0 0 0.5  0 0 0 0 0.5  0 0 0 0 0.5  0 0 0 ${grainAlpha} 0"/>` +
          `<feBlend mode="overlay" in2="SourceGraphic" in="grainMono"/>`,
      )
    }
  }

  if (parts.length === 0) return 'none'

  const body = parts.join('')
  const id = hashKey(body)
  if (!defined.has(id)) {
    const defs = defsHost()
    if (defs === null) return 'none'
    if (defs.querySelector(`#${id}`) === null) {
      const filter = document.createElementNS(SVG_NS, 'filter')
      filter.id = id
      // sRGB keeps the maths in the same space the footage is already in;
      // the default linearRGB would quietly brighten every mid-tone.
      filter.setAttribute('color-interpolation-filters', 'sRGB')
      filter.innerHTML = body
      defs.appendChild(filter)
    }
    defined.add(id)
  }
  return `url(#${id})`
}

/**
 * Vignette geometry, shared so the preview and the exporter draw the same falloff.
 * `clearStop` is where the darkening begins, as a fraction of the distance from
 * the frame centre to its corner; `peakAlpha` is the opacity at the corner.
 */
export const VIGNETTE = { clearStop: 0.42, peakAlpha: 0.85 } as const

/** Opacity of the vignette wash at the frame edge for a 0..100 strength. */
export function vignetteAlpha(strength: number | undefined): number {
  return VIGNETTE.peakAlpha * Math.min(1, Math.max(0, (strength ?? 0) / 100))
}

/** True when this clip carries any manual grading beyond its preset. */
export const hasManualGrade = (item?: TimelineItem | null): boolean => !isNeutralGrade(readGrade(item))

/** Build CSS transform string for clip rotation and mirroring. */
export const getClipTransform = (item?: TimelineItem | null): string => {
  if (!item) return 'none'
  const parts: string[] = []
  if (item.rotation) parts.push(`rotate(${item.rotation}deg)`)
  if (item.flipH) parts.push('scaleX(-1)')
  if (item.flipV) parts.push('scaleY(-1)')
  return parts.length > 0 ? parts.join(' ') : 'none'
}
