import { clamp } from '../timeline.ts'
import { resetTransition } from '../resetSettings.ts'
import { Slider } from './Slider.tsx'
import { TRANSITION_TYPES } from '../transitionTimeline.ts'
import type { Transition, TransitionEasing } from '../types.ts'

interface TransitionInspectorProps {
  transition: Transition
  clipAName: string
  clipBName: string
  maxDuration: number
  onChange: (updated: Transition) => void
  onDelete: (id: string) => void
  onClose: () => void
}

const DURATION_PRESETS = [0.5, 0.8, 1.0, 1.5, 2.0]

const EASING_OPTIONS: { id: TransitionEasing; label: string }[] = [
  { id: 'linear', label: 'Linear' },
  { id: 'ease-in', label: 'Ease In' },
  { id: 'ease-out', label: 'Ease Out' },
  { id: 'ease-in-out', label: 'Ease In-Out' },
  { id: 'smoothstep', label: 'Smoothstep' },
  { id: 'ease-out-back', label: 'Snap (Back)' },
]

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
  const isWipeOrIris = transition.type.startsWith('wipe') || transition.type === 'iris-circle'
  const isDipOrFlash = transition.type === 'fade-black' || transition.type === 'fade-white'
  const align = transition.transitionAlign ?? 'center'
  const audioFade = transition.transitionAudioFade ?? 'equal-power'
  const strength = Math.round((transition.transitionStrength ?? 1) * 100)
  const softness = Math.round((transition.transitionSoftness ?? 0) * 100)

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
            {TRANSITION_TYPES.map(({ type, label }) => (
              <button
                key={type}
                type="button"
                className={`type-card${transition.type === type ? ' active' : ''}`}
                onClick={() => onChange({ ...transition, type })}
                title={label}
              >
                <span className="type-label">{label}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Alignment */}
        <div className="inspector-group">
          <span className="group-label">Alignment on Cut</span>
          <div className="segmented-control">
            <button
              type="button"
              className={align === 'center' ? 'active' : ''}
              onClick={() => onChange({ ...transition, transitionAlign: 'center' })}
            >
              Center
            </button>
            <button
              type="button"
              className={align === 'start' ? 'active' : ''}
              onClick={() => onChange({ ...transition, transitionAlign: 'start' })}
            >
              Start at Cut
            </button>
            <button
              type="button"
              className={align === 'end' ? 'active' : ''}
              onClick={() => onChange({ ...transition, transitionAlign: 'end' })}
            >
              End at Cut
            </button>
          </div>
        </div>

        {/* Transition Duration */}
        <div className="inspector-group">
          <div className="group-header-row">
            <span className="group-label">Duration</span>
            <span
              className="group-value-badge"
              style={{ cursor: 'pointer' }}
              onDoubleClick={() => onChange({ ...transition, duration: clamp(0.8, 0.2, maxDuration) })}
              title="Double-click to reset"
            >
              {currentDuration.toFixed(1)}s
            </span>
          </div>
          <div className="slider-with-presets">
            <Slider
              min={0.2}
              max={maxDuration}
              step={0.05}
              value={currentDuration}
              defaultValue={clamp(0.8, 0.2, maxDuration)}
              onChange={(val) =>
                onChange({ ...transition, duration: clamp(val, 0.2, maxDuration) })
              }
              ariaLabel="Transition duration"
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

        {/* Easing Curve */}
        <div className="inspector-group">
          <label className="group-label" htmlFor="transition-easing-select">Easing Curve</label>
          <select
            id="transition-easing-select"
            className="inspector-select"
            value={transition.transitionEasing ?? 'linear'}
            onChange={(e) => onChange({ ...transition, transitionEasing: e.target.value as TransitionEasing })}
          >
            {EASING_OPTIONS.map((opt) => (
              <option key={opt.id} value={opt.id}>{opt.label}</option>
            ))}
          </select>
        </div>

        {/* Audio Crossfade */}
        <div className="inspector-group">
          <span className="group-label">Audio Fade</span>
          <div className="segmented-control">
            <button
              type="button"
              className={audioFade === 'equal-power' ? 'active' : ''}
              onClick={() => onChange({ ...transition, transitionAudioFade: 'equal-power' })}
            >
              Equal Power
            </button>
            <button
              type="button"
              className={audioFade === 'linear' ? 'active' : ''}
              onClick={() => onChange({ ...transition, transitionAudioFade: 'linear' })}
            >
              Linear
            </button>
            <button
              type="button"
              className={audioFade === 'dip' ? 'active' : ''}
              onClick={() => onChange({ ...transition, transitionAudioFade: 'dip' })}
            >
              Dip
            </button>
            <button
              type="button"
              className={audioFade === 'none' ? 'active' : ''}
              onClick={() => onChange({ ...transition, transitionAudioFade: 'none' })}
            >
              Cut
            </button>
          </div>
        </div>

        {/* Strength Slider */}
        <div className="inspector-group">
          <div className="group-header-row">
            <span className="group-label">Effect Strength</span>
            <span
              className="group-value-badge"
              style={{ cursor: 'pointer' }}
              onDoubleClick={() => onChange({ ...transition, transitionStrength: 1 })}
              title="Double-click to reset"
            >
              {strength}%
            </span>
          </div>
          <Slider
            min={0}
            max={1}
            step={0.05}
            value={transition.transitionStrength ?? 1}
            defaultValue={1}
            onChange={(val) => onChange({ ...transition, transitionStrength: val })}
            ariaLabel="Transition strength slider"
          />
        </div>

        {/* Softness (Feather) for Wipes & Iris */}
        {isWipeOrIris && (
          <div className="inspector-group">
            <div className="group-header-row">
              <span className="group-label">Edge Softness (Feather)</span>
              <span
                className="group-value-badge"
                style={{ cursor: 'pointer' }}
                onDoubleClick={() => onChange({ ...transition, transitionSoftness: 0 })}
                title="Double-click to reset"
              >
                {softness}%
              </span>
            </div>
            <Slider
              min={0}
              max={1}
              step={0.05}
              value={transition.transitionSoftness ?? 0}
              defaultValue={0}
              onChange={(val) => onChange({ ...transition, transitionSoftness: val })}
              ariaLabel="Edge softness slider"
            />
          </div>
        )}

        {/* Veil Color for Flash / Dip */}
        {isDipOrFlash && (
          <div className="inspector-group">
            <span className="group-label">Veil Wash Color</span>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <input
                type="color"
                className="native-color-picker"
                value={transition.transitionVeilColor || (transition.type === 'fade-white' ? '#ffffff' : '#000000')}
                onChange={(e) => onChange({ ...transition, transitionVeilColor: e.target.value })}
              />
              <span style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
                {transition.transitionVeilColor || (transition.type === 'fade-white' ? '#ffffff' : '#000000')}
              </span>
            </div>
          </div>
        )}
      </div>

      <div className="inspector-footer">
        <button
          type="button"
          className="inspector-reset-btn"
          onClick={() => onChange(resetTransition(transition))}
          title="Back to a plain crossfade at the default length"
        >
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="1 4 1 10 7 10" />
            <path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10" />
          </svg>
          Reset Transition
        </button>
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
