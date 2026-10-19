import type { Size } from './export/plan.ts'
import type { TextOverlay } from './types.ts'

/** Draw all active text overlays onto an export canvas for the given time. */
export function drawTextOverlays(
  context: CanvasRenderingContext2D,
  items: readonly TextOverlay[],
  time: number,
  size: Size,
) {
  const active = items.filter((item) => time >= item.start && time < item.start + item.duration)
  if (active.length === 0) return

  context.save()
  for (const item of active) {
    if (!item.text.trim()) continue

    // Scale font size relative to video height (720p reference baseline)
    const scale = size.height / 720
    const rawSize = item.fontSize ?? (item.size === 'small' ? 32 : item.size === 'large' ? 64 : 48)
    const fontSize = Math.max(14, Math.round(rawSize * Math.max(0.3, scale)))
    const lineHeight = fontSize * 1.25

    const family = item.fontFamily ? `"${item.fontFamily}", sans-serif` : 'sans-serif'
    context.font = `bold ${fontSize}px ${family}`
    context.textAlign = item.textAlign ?? 'center'
    context.textBaseline = 'middle'

    const lines = item.text.split('\n')
    const totalTextHeight = lines.length * lineHeight

    // Determine target center coordinates (percentage of video size or preset fallback)
    const posX = item.x ?? 50
    const posY = item.y ?? (item.position === 'top' ? 15 : item.position === 'center' ? 50 : 85)
    const centerX = (posX / 100) * size.width
    const centerY = (posY / 100) * size.height

    // Calculate vertical start so (centerX, centerY) is the midpoint of all lines
    const startY = centerY - totalTextHeight / 2 + lineHeight / 2

    // Optional background pill/box
    if (item.backgroundColor && item.backgroundColor !== 'transparent') {
      const maxLineWidth = Math.max(...lines.map((l) => context.measureText(l).width))
      const padX = fontSize * 0.45
      const padY = fontSize * 0.25
      const boxWidth = maxLineWidth + padX * 2
      const boxHeight = totalTextHeight + padY * 2
      const boxX = centerX - boxWidth / 2
      const boxY = centerY - totalTextHeight / 2 - padY
      const radius = Math.min(12, fontSize * 0.25)

      context.save()
      context.fillStyle = item.backgroundColor
      context.beginPath()
      context.roundRect(boxX, boxY, boxWidth, boxHeight, radius)
      context.fill()
      context.restore()
    }

    // Draw outline / shadow for contrast against any video background
    context.lineJoin = 'round'
    context.lineWidth = Math.max(3, Math.round(fontSize * 0.12))
    context.strokeStyle = 'rgba(0, 0, 0, 0.85)'
    context.shadowColor = 'rgba(0, 0, 0, 0.7)'
    context.shadowBlur = Math.round(fontSize * 0.15)
    context.fillStyle = item.color

    for (let i = 0; i < lines.length; i++) {
      const lineY = startY + i * lineHeight
      context.strokeText(lines[i], centerX, lineY)
      context.fillText(lines[i], centerX, lineY)
    }
  }
  context.restore()
}

