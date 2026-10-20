import { useRef } from 'react'
import type { PointerEvent } from 'react'

interface SplitterProps {
  /** 'vertical' drags left/right and resizes a column; 'horizontal' drags up/down. */
  orientation: 'vertical' | 'horizontal'
  /** Current size in pixels of the panel this splitter sizes. */
  size: number
  min: number
  max: number
  /**
   * Which way the panel grows relative to pointer movement. The side panel grows
   * as the pointer moves right (1); the timeline grows as it moves up (-1).
   */
  direction: 1 | -1
  label: string
  onResize: (size: number) => void
  /** Snap back to the layout's default, on double click. */
  onReset?: () => void
}

const KEYBOARD_STEP = 16

/**
 * A draggable divider between two panels. Sits on the boundary with a hit area
 * wider than the line itself, so it is easy to grab without a thick border.
 */
export function Splitter({
  orientation,
  size,
  min,
  max,
  direction,
  label,
  onResize,
  onReset,
}: SplitterProps) {
  const startRef = useRef({ pointer: 0, size: 0 })

  const clampSize = (value: number) => Math.min(max, Math.max(min, value))

  const handlePointerDown = (event: PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return
    event.preventDefault()
    const element = event.currentTarget
    element.setPointerCapture(event.pointerId)
    startRef.current = {
      pointer: orientation === 'vertical' ? event.clientX : event.clientY,
      size,
    }

    const onMove = (move: globalThis.PointerEvent) => {
      const position = orientation === 'vertical' ? move.clientX : move.clientY
      const delta = (position - startRef.current.pointer) * direction
      onResize(clampSize(startRef.current.size + delta))
    }

    const finish = () => {
      element.removeEventListener('pointermove', onMove)
      element.removeEventListener('pointerup', finish)
      element.removeEventListener('pointercancel', finish)
    }

    element.addEventListener('pointermove', onMove)
    element.addEventListener('pointerup', finish)
    element.addEventListener('pointercancel', finish)
  }

  return (
    <div
      className={`splitter splitter-${orientation}`}
      role="separator"
      aria-label={label}
      aria-orientation={orientation === 'vertical' ? 'vertical' : 'horizontal'}
      aria-valuenow={Math.round(size)}
      aria-valuemin={min}
      aria-valuemax={max}
      tabIndex={0}
      title={`${label} — drag to resize, double-click to reset`}
      onPointerDown={handlePointerDown}
      onDoubleClick={() => onReset?.()}
      onKeyDown={(event) => {
        const decrease = orientation === 'vertical' ? 'ArrowLeft' : 'ArrowUp'
        const increase = orientation === 'vertical' ? 'ArrowRight' : 'ArrowDown'
        if (event.key !== decrease && event.key !== increase) return
        event.preventDefault()
        const step = (event.key === increase ? KEYBOARD_STEP : -KEYBOARD_STEP) * direction
        onResize(clampSize(size + step))
      }}
    >
      <span className="splitter-grip" aria-hidden="true" />
    </div>
  )
}
