import { FILTER_PRESETS, clearManualGrade, hasManualGrade } from '../filters.ts'
import type { FilterType, MasterGrade } from '../types.ts'
import { Slider } from './Slider.tsx'

/** Every manual grading control, in the order they are adjusted in practice. */
type NumericGradeKey = Exclude<keyof MasterGrade, 'filter' | 'filterIntensity'>

const GRADE_SLIDERS: readonly {
  key: NumericGradeKey
  label: string
  min: number
  max: number
}[] = [
  { key: 'filterExposure', label: 'Exposure', min: -100, max: 100 },
  { key: 'filterContrast', label: 'Contrast', min: -100, max: 100 },
  { key: 'filterSaturation', label: 'Saturation', min: -100, max: 100 },
  { key: 'filterTemperature', label: 'Temperature (K)', min: -100, max: 100 },
  { key: 'filterTint', label: 'Tint (G/M)', min: -100, max: 100 },
  { key: 'filterHighlights', label: 'Highlights', min: -100, max: 100 },
  { key: 'filterShadows', label: 'Shadows', min: -100, max: 100 },
  { key: 'filterFade', label: 'Black Fade', min: 0, max: 100 },
  { key: 'filterVignette', label: 'Vignette', min: 0, max: 100 },
  { key: 'filterGrain', label: 'Film Grain', min: 0, max: 100 },
  { key: 'filterSharpen', label: 'Sharpen', min: 0, max: 100 },
]

interface GradeControlsProps<T extends MasterGrade> {
  grade: T
  onChange: (next: T) => void
  /** Hide the preset grid when the caller shows its own. */
  showPresets?: boolean
}

/**
 * The colour controls, shared by the clip inspector and the whole-timeline
 * grade so the two cannot drift. `MasterGrade` is exactly the set of colour
 * fields a clip carries, which is what lets one component serve both.
 */
export function GradeControls<T extends MasterGrade>({
  grade,
  onChange,
  showPresets = true,
}: GradeControlsProps<T>) {
  const currentFilter = grade.filter ?? 'none'
  const intensity = grade.filterIntensity ?? 1

  return (
    <>
      {showPresets && (
        <section className="inspector-section">
          <div className="section-header-row">
            <span className="inspector-section-label">Colour Look</span>
            <span className="section-value-pill">
              {FILTER_PRESETS.find((preset) => preset.id === currentFilter)?.name ?? 'Normal'}
            </span>
          </div>

          <div className="filter-presets-grid">
            {FILTER_PRESETS.map((preset) => (
              <button
                key={preset.id}
                type="button"
                className={`filter-preset-card${currentFilter === preset.id ? ' active' : ''}`}
                onClick={() => onChange({ ...grade, filter: preset.id as FilterType })}
                title={preset.description}
              >
                <span className="filter-card-name">{preset.name}</span>
              </button>
            ))}
          </div>

          {currentFilter !== 'none' && (
            <div className="intensity-slider-wrap">
              <div className="intensity-label-row">
                <span className="control-sublabel">Intensity</span>
                <span
                  className={`control-subvalue${intensity !== 1 ? ' active' : ''}`}
                  onDoubleClick={() => onChange({ ...grade, filterIntensity: 1 })}
                  title="Double-click to reset"
                >
                  {Math.round(intensity * 100)}%
                </span>
              </div>
              <Slider
                min={0}
                max={1}
                step={0.05}
                value={intensity}
                defaultValue={1}
                onChange={(val) => onChange({ ...grade, filterIntensity: val })}
              />
            </div>
          )}
        </section>
      )}

      <section className="inspector-section">
        <div className="section-header-row">
          <span className="inspector-section-label">Manual Colour Grading</span>
          {hasManualGrade(grade) && (
            <button
              type="button"
              className="section-reset-link"
              onClick={() => onChange(clearManualGrade(grade))}
            >
              Reset
            </button>
          )}
        </div>

        <div className="manual-grade-controls">
          {GRADE_SLIDERS.map(({ key, label, min, max }) => {
            const value = grade[key] ?? 0
            const isBipolar = min < 0 && max > 0
            return (
              <div key={key} className="grade-slider-row">
                <div className="grade-label-line">
                  <span className="control-sublabel">{label}</span>
                  <span
                    className={`control-subvalue${value !== 0 ? ' active' : ''}`}
                    onDoubleClick={() => onChange({ ...grade, [key]: 0 })}
                    title="Double-click to reset to 0"
                  >
                    {value > 0 && min < 0 ? `+${value}` : value}
                  </span>
                </div>
                <Slider
                  min={min}
                  max={max}
                  step={1}
                  value={value}
                  bipolar={isBipolar}
                  defaultValue={0}
                  onChange={(val) => onChange({ ...grade, [key]: val })}
                />
              </div>
            )
          })}
        </div>
      </section>
    </>
  )
}
