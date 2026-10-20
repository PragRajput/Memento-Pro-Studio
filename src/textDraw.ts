import type { Size } from './export/plan.ts'
import { blockLeft, blockTop, resolveTextStyle, textIsVisible } from './textStyle.ts'
import type { ResolvedTextStyle } from './textStyle.ts'
import type { TextOverlay } from './types.ts'

/**
 * Draw the active titles onto an export frame.
 *
 * Every measurement comes from `resolveTextStyle`, which the live preview uses
 * too, so what is arranged on screen is what lands in the file.
 */
export function drawTextOverlays(
  context: CanvasRenderingContext2D,
  items: readonly TextOverlay[],
  time: number,
  size: Size,
) {
  const active = items.filter((item) => textIsVisible(item, time))
  if (active.length === 0) return

  for (const item of active) {
    if (!item.text.trim()) continue
    drawTitle(context, resolveTextStyle(item, size))
  }
}

const horizontalAnchor = (style: ResolvedTextStyle, lineWidth: number): number => {
  const left = blockLeft(style)
  if (style.textAlign === 'left') return left
  if (style.textAlign === 'right') return left + style.blockWidthPx - lineWidth
  return left + (style.blockWidthPx - lineWidth) / 2
}

function drawTitle(context: CanvasRenderingContext2D, style: ResolvedTextStyle) {
  context.save()
  context.globalAlpha = style.opacity
  context.font = style.fontCss
  context.textAlign = 'left'
  context.textBaseline = 'alphabetic'
  try {
    context.letterSpacing = `${style.letterSpacingPx}px`
  } catch {
    // Tracking is unsupported on this engine; glyphs simply sit at default spacing.
  }

  const left = blockLeft(style)
  const top = blockTop(style)

  if (style.bgColor !== null) {
    context.save()
    context.globalAlpha = style.opacity * style.bgOpacity
    context.fillStyle = style.bgColor
    context.beginPath()
    context.roundRect(
      left - style.bgPadXPx,
      top - style.bgPadYPx,
      style.blockWidthPx + style.bgPadXPx * 2,
      style.blockHeightPx + style.bgPadYPx * 2,
      style.bgRadiusPx,
    )
    context.fill()
    context.restore()
  }

  style.lines.forEach((line, index) => {
    if (line.length === 0) return
    const width = context.measureText(line).width
    const x = horizontalAnchor(style, width)
    // `top` is the cap of the first line, so step by line height and drop to the
    // baseline within each line box.
    const y = top + index * style.lineHeightPx + style.fontPx * 0.8

    if (style.strokePx > 0) {
      context.save()
      // The shadow is cast once, from the outline, rather than from both the
      // outline and the fill — compositing it twice used to muddy the edge.
      context.shadowColor = style.shadowColor
      context.shadowBlur = style.shadowBlurPx
      context.shadowOffsetX = style.shadowOffsetXPx
      context.shadowOffsetY = style.shadowOffsetYPx
      context.globalAlpha = style.opacity * style.strokeAlpha
      context.lineJoin = 'round'
      context.miterLimit = 2
      context.lineWidth = style.strokePx * 2
      context.strokeStyle = style.strokeColor
      context.strokeText(line, x, y)
      context.restore()
    } else if (style.shadowBlurPx > 0) {
      context.save()
      context.shadowColor = style.shadowColor
      context.shadowBlur = style.shadowBlurPx
      context.shadowOffsetX = style.shadowOffsetXPx
      context.shadowOffsetY = style.shadowOffsetYPx
      context.fillStyle = style.color
      context.fillText(line, x, y)
      context.restore()
    }

    context.fillStyle = style.color
    context.fillText(line, x, y)
  })

  context.restore()
}
