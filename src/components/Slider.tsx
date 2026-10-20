import { useCallback } from 'react'
import type { FC, KeyboardEvent, MouseEvent } from 'react'
import { computeSliderFill } from '../sliderFill.ts'

export interface SliderProps {
  value: number
  min?: number
  max?: number
  step?: number
  defaultValue?: number
  /** If true, fills outward from 0 (center) to current value, with a center detent pip. */
  bipolar?: boolean
  accentColor?: string
  disabled?: boolean
  className?: string
  ariaLabel?: string
  title?: string
  onChange: (value: number) => void
  onDoubleClick?: () => void
}

/**
 * Precision studio slider with dynamic progressive fill, center zero detent
 * for bipolar grading controls, and double-click to snap to default.
 */
export const Slider: FC<SliderProps> = ({
  value,
  min = 0,
  max = 100,
  step = 1,
  defaultValue,
  bipolar,
  accentColor,
  disabled = false,
  className = '',
  ariaLabel,
  title,
  onChange,
  onDoubleClick,
}) => {
  const isBipolar = bipolar ?? (min < 0 && max > 0)
  const defaultVal = defaultValue !== undefined ? defaultValue : isBipolar ? 0 : min
  const { fillStart, fillEnd } = computeSliderFill(value, min, max, isBipolar)

  const handleReset = useCallback(
    (e: MouseEvent) => {
      e.preventDefault()
      if (disabled) return
      onChange(defaultVal)
      onDoubleClick?.()
    },
    [defaultVal, disabled, onChange, onDoubleClick],
  )

  const handleKeyDown = useCallback(
    (e: KeyboardEvent<HTMLInputElement>) => {
      if (disabled) return
      const multiplier = e.shiftKey ? 5 : 1
      const delta = (step || 1) * multiplier

      if (e.key === 'ArrowRight' || e.key === 'ArrowUp') {
        e.preventDefault()
        onChange(Math.min(max, value + delta))
      } else if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') {
        e.preventDefault()
        onChange(Math.max(min, value - delta))
      } else if (e.key === 'Home') {
        e.preventDefault()
        onChange(min)
      } else if (e.key === 'End') {
        e.preventDefault()
        onChange(max)
      } else if (e.key === 'Backspace' || e.key === 'Delete' || e.key === 'Escape') {
        e.preventDefault()
        onChange(defaultVal)
      }
    },
    [defaultVal, disabled, max, min, onChange, step, value],
  )

  return (
    <div
      className={`premium-slider-wrap${isBipolar ? ' bipolar' : ''}${disabled ? ' disabled' : ''}`}
      onDoubleClick={handleReset}
      title={title || 'Double-click to reset'}
    >
      {isBipolar && <span className="slider-center-notch" aria-hidden="true" />}
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        disabled={disabled}
        aria-label={ariaLabel}
        className={`inspector-slider ${className}`.trim()}
        style={
          {
            '--fill-start': fillStart,
            '--fill-end': fillEnd,
            ...(accentColor ? { '--fill-color': accentColor } : {}),
          } as React.CSSProperties
        }
        onChange={(e) => onChange(Number(e.target.value))}
        onKeyDown={handleKeyDown}
      />
    </div>
  )
}
