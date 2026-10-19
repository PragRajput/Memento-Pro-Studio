import { clamp } from '../timeline.ts'
import type { Transition, TransitionType } from '../types.ts'

interface TransitionInspectorProps {
  transition: Transition
  clipAName: string
  clipBName: string
  maxDuration: number
  onChange: (updated: Transition) => void
  onDelete: (id: string) => void
  onClose: () => void
}

const TRANSITION_TYPES: { type: TransitionType; label: string; icon: string }[] = [
  { type: 'crossfade', label: 'Crossfade', icon: '⧉' },
  { type: 'fade-black', label: 'Dip to Black', icon: '◐' },
  { type: 'wipe-left', label: 'Wipe Left', icon: '◨' },
]

const DURATION_PRESETS = [0.5, 0.8, 1.0, 1.5, 2.0]

export function TransitionInspector({
  transition,
  clipAName,
  clipBName,
  maxDuration,
  onChange,
  onDelete,
  onClose,
}: TransitionInspectorProps) {
  const currentDuration = clamp(transition.duration, 0.2, maxDuration)

  return (
    <div className="inspector-panel transition-inspector" role="region" aria-label="Transition inspector">
      <div className="inspector-header">
        <div className="inspector-title-group">
          <span className="inspector-icon transition-icon-badge" aria-hidden="true">⧉</span>
          <div className="header-text-block">
            <h3>Transition Effect</h3>
            <span className="sub-clip-name" title={`${clipAName} ➔ ${clipBName}`}>
              {clipAName} ➔ {clipBName}
            </span>
          </div>
        </div>
        <button
          type="button"
          className="inspector-close-btn"
          onClick={onClose}
          aria-label="Close transition inspector"
          title="Close inspector"
        >
          ×
        </button>
      </div>

      <div className="inspector-body">
        {/* Transition Style */}
        <div className="inspector-group">
          <span className="group-label">Transition Style</span>
          <div className="transition-type-grid">
            {TRANSITION_TYPES.map(({ type, label, icon }) => (
              <button
                key={type}
                type="button"
                className={`type-card${transition.type === type ? ' active' : ''}`}
                onClick={() => onChange({ ...transition, type })}
                title={label}
              >
                <span className="type-icon">{icon}</span>
                <span className="type-label">{label}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Transition Duration */}
        <div className="inspector-group">
          <div className="group-header-row">
            <span className="group-label">Duration</span>
            <span className="group-value-badge">{currentDuration.toFixed(1)}s</span>
          </div>
          <div className="slider-with-presets">
            <input
              type="range"
              className="inspector-slider"
              min={0.2}
              max={maxDuration}
              step={0.05}
              value={currentDuration}
              onChange={(event) =>
                onChange({ ...transition, duration: clamp(Number(event.target.value), 0.2, maxDuration) })
              }
              aria-label="Transition duration"
            />
            <div className="segmented-control mini">
              {DURATION_PRESETS.map((val) => {
                if (val > maxDuration + 0.01) return null
                return (
                  <button
                    key={val}
                    type="button"
                    className={Math.abs(currentDuration - val) < 0.05 ? 'active' : ''}
                    onClick={() => onChange({ ...transition, duration: val })}
                  >
                    {val}s
                  </button>
                )
              })}
            </div>
          </div>
        </div>
      </div>

      <div className="inspector-footer">
        <button
          type="button"
          className="inspector-delete-btn"
          onClick={() => onDelete(transition.id)}
          title="Remove transition from cut"
        >
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="3 6 5 6 21 6" />
            <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
          </svg>
          Remove Transition
        </button>
      </div>
    </div>
  )
}
