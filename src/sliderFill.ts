/**
 * Calculates start and end fill percentages for studio progressive track rendering.
 */
export function computeSliderFill(
  value: number,
  min = 0,
  max = 100,
  bipolar = false,
): { fillStart: string; fillEnd: string; pct: number } {
  const clamped = Math.max(min, Math.min(max, Number.isFinite(value) ? value : min))
  const isBipolar = bipolar || (min < 0 && max > 0)

  if (isBipolar) {
    const range = max - min || 1
    const centerPct = ((0 - min) / range) * 100
    const valPct = ((clamped - min) / range) * 100

    if (clamped >= 0) {
      return {
        fillStart: `${centerPct.toFixed(2)}%`,
        fillEnd: `${valPct.toFixed(2)}%`,
        pct: valPct,
      }
    }
    return {
      fillStart: `${valPct.toFixed(2)}%`,
      fillEnd: `${centerPct.toFixed(2)}%`,
      pct: valPct,
    }
  }

  const range = max - min || 1
  const pct = Math.max(0, Math.min(100, ((clamped - min) / range) * 100))
  return {
    fillStart: '0%',
    fillEnd: `${pct.toFixed(2)}%`,
    pct,
  }
}

