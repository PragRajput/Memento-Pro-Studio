import { FILTER_PRESETS, hasManualGrade } from '../filters.ts'
import { resetTimelineItem } from '../resetSettings.ts'
import { clearTrack } from '../keyframes.ts'
import { itemLength } from '../timeline.ts'
import { KeyframeEditor } from './KeyframeEditor.tsx'
import type { AnimatableProperty, EasingType, MediaClip, TimelineItem } from '../types.ts'

/** A base-track clip animates its picture; its sound level lives on the audio lanes. */
const CLIP_PROPERTIES: readonly AnimatableProperty[] = ['posX', 'posY', 'scale', 'rotate', 'opacity']

interface ClipInspectorProps {
  item: TimelineItem
  clip: MediaClip | undefined
  onChange: (updated: TimelineItem) => void
  onDelete: (id: string) => void
  onClose: () => void
  /** Seconds from this clip's start to the playhead. */
  localTime?: number
  onAddKeyframe?: (property: AnimatableProperty, value: number) => void
  onRemoveKeyframe?: (property: AnimatableProperty, keyframeId: string) => void
  onChangeEasing?: (property: AnimatableProperty, keyframeId: string, easing: EasingType) => void
  onSeekToLocalTime?: (localTime: number) => void
}

const SPEED_PRESETS = [0.25, 0.5, 0.75, 1, 1.25, 1.5, 2, 4]

export function ClipInspector({
  item,
  clip,
  onChange,
  onDelete,
  onClose,
  localTime = 0,
  onAddKeyframe,
  onRemoveKeyframe,
  onChangeEasing,
  onSeekToLocalTime,
}: ClipInspectorProps) {
  const currentSpeed = item.speed ?? 1
  const currentFilter = item.filter ?? 'none'
  const filterIntensity = item.filterIntensity ?? 1
  const rotation = item.rotation ?? 0
  const flipH = item.flipH ?? false
  const flipV = item.flipV ?? false
  const fitMode = item.fitMode ?? 'contain'
  const isPhoto = clip?.mediaType === 'image'

  return (
    <div className="inspector-panel clip-inspector-panel">
      <div className="inspector-header">
        <div className="inspector-title-row">
          <span className="inspector-type-badge">{isPhoto ? 'PHOTO CLIP' : 'VIDEO CLIP'}</span>
          <button
            type="button"
            className="inspector-close-btn"
            onClick={onClose}
            title="Close inspector"
            aria-label="Close"
          >
            ×
          </button>
        </div>
        <h3 className="inspector-title" title={clip?.name ?? 'Timeline Clip'}>
          {clip?.name ?? 'Timeline Clip'}
        </h3>
      </div>

      <div className="inspector-scroll-body">
        {onAddKeyframe && onRemoveKeyframe && onChangeEasing && onSeekToLocalTime && (
          <section className="inspector-section">
            <KeyframeEditor
              tracks={item.keyframes}
              statics={{
                posX: item.posX,
                posY: item.posY,
                scale: item.scale,
                rotate: item.rotate,
                opacity: item.opacity,
              }}
              localTime={localTime}
              itemLength={itemLength(item)}
              properties={CLIP_PROPERTIES}
              onSetStatic={(property, value) => onChange({ ...item, [property]: value })}
              onAddKeyframe={onAddKeyframe}
              onRemoveKeyframe={onRemoveKeyframe}
              onChangeEasing={onChangeEasing}
              onClearTrack={(property) =>
                onChange({ ...item, keyframes: clearTrack(item.keyframes, property) })
              }
              onSeekTo={onSeekToLocalTime}
            />
          </section>
        )}

        {/* Playback Speed */}
        <section className="inspector-section">
          <div className="section-header-row">
            <span className="inspector-section-label">Playback Speed</span>
            <span className="section-value-pill">{currentSpeed}x</span>
          </div>
          <div className="speed-pills-row">
            {SPEED_PRESETS.map((s) => (
              <button
                key={s}
                type="button"
                className={`speed-pill-btn${currentSpeed === s ? ' active' : ''}`}
                onClick={() => onChange({ ...item, speed: s })}
              >
                {s === 1 ? '1x' : `${s}x`}
              </button>
            ))}
          </div>
        </section>

        {/* Color Filters & Grading */}
        <section className="inspector-section">
          <div className="section-header-row">
            <span className="inspector-section-label">Color Filter & LUT</span>
            <span className="section-value-pill">
              {FILTER_PRESETS.find((f) => f.id === currentFilter)?.name ?? 'Normal'}
            </span>
          </div>

          <div className="filter-presets-grid">
            {FILTER_PRESETS.map((preset) => {
              const isSelected = currentFilter === preset.id
              return (
                <button
                  key={preset.id}
                  type="button"
                  className={`filter-preset-card${isSelected ? ' active' : ''}`}
                  onClick={() => onChange({ ...item, filter: preset.id })}
                  title={preset.description}
                >
                  <span className="filter-card-name">{preset.name}</span>
                </button>
              )
            })}
          </div>

          {currentFilter !== 'none' && (
            <div className="intensity-slider-wrap">
              <div className="intensity-label-row">
                <span className="control-sublabel">Intensity</span>
                <span className="control-subvalue">{Math.round(filterIntensity * 100)}%</span>
              </div>
              <input
                type="range"
                min="0"
                max="1"
                step="0.05"
                value={filterIntensity}
                onChange={(e) => onChange({ ...item, filterIntensity: parseFloat(e.target.value) })}
                className="inspector-slider"
              />
            </div>
          )}
        </section>

        {/* Manual Colour Grading */}
        <section className="inspector-section">
          <div className="section-header-row">
            <span className="inspector-section-label">Manual Colour Grading</span>
            {hasManualGrade(item) && (
              <button
                type="button"
                className="section-reset-link"
                onClick={() =>
                  onChange({
                    ...item,
                    filterExposure: undefined,
                    filterContrast: undefined,
                    filterSaturation: undefined,
                    filterTemperature: undefined,
                    filterTint: undefined,
                    filterHighlights: undefined,
                    filterShadows: undefined,
                    filterFade: undefined,
                    filterVignette: undefined,
                    filterGrain: undefined,
                    filterSharpen: undefined,
                  })
                }
              >
                Reset
              </button>
            )}
          </div>

          <div className="manual-grade-controls">
            {[
              { key: 'filterExposure', label: 'Exposure', min: -100, max: 100, step: 1, val: item.filterExposure ?? 0 },
              { key: 'filterContrast', label: 'Contrast', min: -100, max: 100, step: 1, val: item.filterContrast ?? 0 },
              { key: 'filterSaturation', label: 'Saturation', min: -100, max: 100, step: 1, val: item.filterSaturation ?? 0 },
              { key: 'filterTemperature', label: 'Temperature (K)', min: -100, max: 100, step: 1, val: item.filterTemperature ?? 0 },
              { key: 'filterTint', label: 'Tint (G/M)', min: -100, max: 100, step: 1, val: item.filterTint ?? 0 },
              { key: 'filterHighlights', label: 'Highlights', min: -100, max: 100, step: 1, val: item.filterHighlights ?? 0 },
              { key: 'filterShadows', label: 'Shadows', min: -100, max: 100, step: 1, val: item.filterShadows ?? 0 },
              { key: 'filterFade', label: 'Black Fade', min: 0, max: 100, step: 1, val: item.filterFade ?? 0 },
              { key: 'filterVignette', label: 'Vignette', min: 0, max: 100, step: 1, val: item.filterVignette ?? 0 },
              { key: 'filterGrain', label: 'Film Grain', min: 0, max: 100, step: 1, val: item.filterGrain ?? 0 },
              { key: 'filterSharpen', label: 'Sharpen', min: 0, max: 100, step: 1, val: item.filterSharpen ?? 0 },
            ].map(({ key, label, min, max, step, val }) => (
              <div key={key} className="grade-slider-row">
                <div className="grade-label-line">
                  <span className="control-sublabel">{label}</span>
                  <span className="control-subvalue">{val > 0 && min < 0 ? `+${val}` : val}</span>
                </div>
                <input
                  type="range"
                  min={min}
                  max={max}
                  step={step}
                  value={val}
                  onChange={(e) => onChange({ ...item, [key]: Number(e.target.value) })}
                  className="inspector-slider"
                />
              </div>
            ))}
          </div>
        </section>

        {/* Transform: Rotate, Flip, Fit Mode */}
        <section className="inspector-section">
          <span className="inspector-section-label">Transform & Framing</span>

          <div className="transform-actions-grid">
            <button
              type="button"
              className="transform-action-btn"
              onClick={() => onChange({ ...item, rotation: ((rotation + 90) % 360) as 0 | 90 | 180 | 270 })}
              title="Rotate 90 degrees clockwise"
            >
              <span className="transform-btn-icon">↻</span>
              <span>Rotate 90°</span>
              {rotation > 0 && <span className="transform-badge">{rotation}°</span>}
            </button>

            <button
              type="button"
              className={`transform-action-btn${flipH ? ' active' : ''}`}
              onClick={() => onChange({ ...item, flipH: !flipH })}
              title="Mirror horizontally (selfie flip)"
            >
              <span className="transform-btn-icon">⇄</span>
              <span>Flip H</span>
            </button>

            <button
              type="button"
              className={`transform-action-btn${flipV ? ' active' : ''}`}
              onClick={() => onChange({ ...item, flipV: !flipV })}
              title="Flip vertically"
            >
              <span className="transform-btn-icon">⇅</span>
              <span>Flip V</span>
            </button>
          </div>

          <div className="fit-mode-toggle-group">
            <span className="control-sublabel">Framing</span>
            <div className="fit-toggle-row">
              <button
                type="button"
                className={`fit-toggle-btn${fitMode === 'contain' ? ' active' : ''}`}
                onClick={() => onChange({ ...item, fitMode: 'contain' })}
                title="Fit full clip on screen with letterboxing"
              >
                Fit (Contain)
              </button>
              <button
                type="button"
                className={`fit-toggle-btn${fitMode === 'cover' ? ' active' : ''}`}
                onClick={() => onChange({ ...item, fitMode: 'cover' })}
                title="Fill entire canvas without black bars"
              >
                Fill (Cover)
              </button>
            </div>
          </div>
        </section>

        {/* Audio (for video clips) */}
        {!isPhoto && (
          <section className="inspector-section">
            <span className="inspector-section-label">Audio</span>
            <div className="mute-toggle-row">
              <label className="mute-checkbox-label">
                <input
                  type="checkbox"
                  checked={item.muted}
                  onChange={(e) => onChange({ ...item, muted: e.target.checked })}
                />
                <span>Mute clip audio</span>
              </label>
            </div>
          </section>
        )}
      </div>

      <div className="inspector-footer">
        <button
          type="button"
          className="inspector-reset-btn"
          onClick={() => onChange(resetTimelineItem(item))}
          title="Clear grading, transform, speed and framing"
        >
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="1 4 1 10 7 10" />
            <path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10" />
          </svg>
          Reset Clip
        </button>
        <button
          type="button"
          className="btn-danger-outline delete-clip-btn"
          onClick={() => onDelete(item.id)}
          title="Delete this clip from timeline"
        >
          Delete Clip
        </button>
      </div>
    </div>
  )
}

