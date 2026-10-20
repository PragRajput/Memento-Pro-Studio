import type { TextOverlay } from './types.ts'

/**
 * One source of truth for how a title looks.
 *
 * Titles used to be styled twice — as CSS in the preview and as canvas drawing
 * calls in the export — and the two had drifted: the preview used raw CSS pixels
 * while the export scaled by `height / 720`, so a title rendered about 1.5x larger
 * on screen than it did in the exported file, and the drift changed with the
 * window size. Stroke, shadow, padding, corner radius and even the default sizes
 * disagreed as well.
 *
 * Everything is now resolved here, once, into plain pixels for a given frame
 * height. The canvas renderer and the CSS adapter both consume the result, so
 * they cannot disagree.
 *
 * Sizes are stored against a 720-high reference frame, which is what the export
 * already used — so exported files keep rendering exactly as before and it is the
 * preview that was corrected.
 */
const REFERENCE_HEIGHT = 720

/** The one fallback table. There used to be three, and they disagreed. */
const SIZE_FALLBACK: Record<string, number> = { small: 32, medium: 48, large: 64 }

export interface ResolvedTextStyle {
  lines: string[]
  fontPx: number
  lineHeightPx: number
  fontCss: string
  fontFamily: string
  fontWeight: number
  italic: boolean
  letterSpacingPx: number
  color: string
  opacity: number
  strokePx: number
  strokeColor: string
  strokeAlpha: number
  shadowColor: string
  shadowBlurPx: number
  shadowOffsetXPx: number
  shadowOffsetYPx: number
  bgColor: string | null
  bgPadXPx: number
  bgPadYPx: number
  bgRadiusPx: number
  bgOpacity: number
  /** Block centre, in frame pixels. */
  centreXPx: number
  centreYPx: number
  blockWidthPx: number
  blockHeightPx: number
  textAlign: 'left' | 'center' | 'right'
  anchorX: 'left' | 'center' | 'right'
  anchorY: 'top' | 'middle' | 'bottom'
}

const DEFAULT_Y: Record<string, number> = { top: 15, center: 50, bottom: 85 }

/** A shared, document-free canvas used purely to measure text. */
let measureCanvas: HTMLCanvasElement | OffscreenCanvas | null = null
const measurer = (): CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D | null => {
  if (typeof document === 'undefined') return null
  if (measureCanvas === null) measureCanvas = document.createElement('canvas')
  return (measureCanvas as HTMLCanvasElement).getContext('2d')
}

/** Break text to fit `maxWidthPx`, honouring explicit newlines. */
const wrapLines = (
  text: string,
  context: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D | null,
  maxWidthPx: number,
): string[] => {
  const paragraphs = text.split('\n')
  if (context === null || !Number.isFinite(maxWidthPx) || maxWidthPx <= 0) return paragraphs

  const out: string[] = []
  for (const paragraph of paragraphs) {
    const words = paragraph.split(/\s+/).filter((w) => w.length > 0)
    if (words.length === 0) {
      out.push('')
      continue
    }
    let line = words[0]
    for (let i = 1; i < words.length; i++) {
      const candidate = `${line} ${words[i]}`
      if (context.measureText(candidate).width <= maxWidthPx) line = candidate
      else {
        out.push(line)
        line = words[i]
      }
    }
    out.push(line)
  }
  return out
}

export interface FrameSize {
  width: number
  height: number
}

/**
 * Resolve a title into concrete pixels for a frame of this size. Pass the real
 * output size when exporting, and the on-screen stage size when previewing.
 */
export const resolveTextStyle = (item: TextOverlay, frame: FrameSize): ResolvedTextStyle => {
  const scale = frame.height / REFERENCE_HEIGHT
  const rawSize = item.fontSize ?? SIZE_FALLBACK[item.size] ?? SIZE_FALLBACK.medium
  const fontPx = Math.max(8, rawSize * scale)

  const weight = item.textWeight ?? 700
  const italic = item.textItalic ?? false
  const family = item.fontFamily ? `"${item.fontFamily}", sans-serif` : 'Inter, sans-serif'
  const fontCss = `${italic ? 'italic ' : ''}${weight} ${fontPx}px ${family}`

  const context = measurer()
  if (context !== null) {
    context.font = fontCss
    // letterSpacing is supported on canvas in Chromium; harmless where it is not.
    const spacing = (item.textLetterSpacing ?? 0) * fontPx
    try {
      ;(context as CanvasRenderingContext2D).letterSpacing = `${spacing}px`
    } catch {
      // Older engines ignore tracking; wrapping is then a shade generous.
    }
  }

  const text = item.textUppercase ? item.text.toUpperCase() : item.text
  const maxWidthPx = ((item.textMaxWidth ?? 80) / 100) * frame.width
  const lines = wrapLines(text, context, maxWidthPx)

  const lineHeightPx = fontPx * (item.textLineHeight ?? 1.25)
  const widest = context === null
    ? 0
    : lines.reduce((max, line) => Math.max(max, context.measureText(line).width), 0)

  // The block is the ink box: (n - 1) gaps plus one line of actual glyph height,
  // not n full line boxes — the old code added a whole extra leading, which made
  // the background pill 2.3x taller than the text it sat behind.
  const blockHeightPx = lineHeightPx * (lines.length - 1) + fontPx

  return {
    lines,
    fontPx,
    lineHeightPx,
    fontCss,
    fontFamily: family,
    fontWeight: weight,
    italic,
    letterSpacingPx: (item.textLetterSpacing ?? 0) * fontPx,
    color: item.color,
    opacity: item.textOpacity ?? 1,
    strokePx: (item.textStrokeWidth ?? 0.06) * fontPx,
    strokeColor: item.textStrokeColor ?? '#000000',
    strokeAlpha: item.textStrokeOpacity ?? 0.85,
    shadowColor: item.textShadowColor ?? 'rgba(0, 0, 0, 0.55)',
    shadowBlurPx: (item.textShadowBlur ?? 0.08) * fontPx,
    shadowOffsetXPx: (item.textShadowOffsetX ?? 0) * fontPx,
    shadowOffsetYPx: (item.textShadowOffsetY ?? 0.03) * fontPx,
    bgColor:
      item.backgroundColor && item.backgroundColor !== 'transparent' ? item.backgroundColor : null,
    bgPadXPx: (item.textBgPaddingX ?? 0.45) * fontPx,
    bgPadYPx: (item.textBgPaddingY ?? 0.22) * fontPx,
    bgRadiusPx: (item.textBgRadius ?? 0.16) * fontPx,
    bgOpacity: item.textBgOpacity ?? 1,
    centreXPx: ((item.x ?? 50) / 100) * frame.width,
    centreYPx: ((item.y ?? DEFAULT_Y[item.position] ?? 85) / 100) * frame.height,
    blockWidthPx: widest,
    blockHeightPx,
    textAlign: item.textAlign ?? 'center',
    anchorX: item.textAnchorX ?? 'center',
    anchorY: item.textAnchorY ?? 'middle',
  }
}

/** Left edge of the text block, given its anchor. */
export const blockLeft = (style: ResolvedTextStyle): number =>
  style.anchorX === 'left'
    ? style.centreXPx
    : style.anchorX === 'right'
      ? style.centreXPx - style.blockWidthPx
      : style.centreXPx - style.blockWidthPx / 2

/** Top edge of the text block, given its anchor. */
export const blockTop = (style: ResolvedTextStyle): number =>
  style.anchorY === 'top'
    ? style.centreYPx
    : style.anchorY === 'bottom'
      ? style.centreYPx - style.blockHeightPx
      : style.centreYPx - style.blockHeightPx / 2

/** Visibility window, including any entrance/exit animation. */
export const textIsVisible = (item: TextOverlay, time: number): boolean =>
  time >= item.start && time < item.start + item.duration

/**
 * Make sure the families these titles use are really downloaded.
 *
 * `document.fonts.ready` resolves as soon as no load is *pending*, which with a
 * stylesheet-declared webfont that nothing has rendered yet means immediately —
 * with zero faces actually loaded. The export then measured and drew in the
 * fallback sans-serif, and could even swap mid-render once the real face arrived.
 * Asking for each face explicitly makes the wait mean what it looks like it means.
 */
export const loadTitleFonts = async (items: readonly TextOverlay[]): Promise<void> => {
  if (typeof document === 'undefined' || !('fonts' in document)) return
  const faces = new Set<string>()
  for (const item of items) {
    if (!item.text.trim()) continue
    const family = item.fontFamily ?? 'Inter'
    const weight = item.textWeight ?? 700
    const style = item.textItalic ? 'italic ' : ''
    // The size is irrelevant to which file is fetched, but the shorthand needs one.
    faces.add(`${style}${weight} 48px "${family}"`)
  }
  await Promise.all(
    [...faces].map((face) =>
      document.fonts.load(face).catch(() => {
        // A family that will not load is not worth failing an export over; the
        // fallback face is then used consistently for measuring and drawing.
      }),
    ),
  )
}
