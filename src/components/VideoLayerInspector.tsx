import { FILTER_PRESETS } from '../filters.ts'
import { resetVideoLayerItem } from '../resetSettings.ts'
import { applyFade, clearTrack, readFade } from '../keyframes.ts'
import { Slider } from './Slider.tsx'
import { itemLength } from '../timeline.ts'
import { videoLayerName } from '../videoLayers.ts'
import { KeyframeEditor } from './KeyframeEditor.tsx'
import type { AnimatableProperty, BlendMode, EasingType, MediaClip, VideoLayerItem } from '../types.ts'

const BLEND_MODES: readonly { id: BlendMode; name: string }[] = [
  { id: 'normal', name: 'Normal' },
  { id: 'screen', name: 'Screen' },
  { id: 'multiply', name: 'Multiply' },
  { id: 'overlay', name: 'Overlay' },
  { id: 'soft-light', name: 'Soft Light' },
]

const LAYER_PROPERTIES: readonly AnimatableProperty[] = [
  'posX',
  'posY',
  'scale',
  'rotate',
  'opacity',
  'volume',
]

interface VideoLayerInspectorProps {
  item: VideoLayerItem
  clip: MediaClip | undefined
  /** Timeline playhead, in seconds. */
  time: number
  onChange: (updated: VideoLayerItem) => void
  onDelete: (id: string) => void
  onClose: () => void
  onAddKeyframe?: (property: AnimatableProperty, value: number) => void
  onRemoveKeyframe?: (property: AnimatableProperty, keyframeId: string) => void
  onChangeEasing?: (property: AnimatableProperty, keyframeId: string, easing: EasingType) => void
  onSeekToLocalTime?: (localTime: number) => void
}

export function VideoLayerInspector({
  item,
  clip,
  time,
  onChange,
  onDelete,
  onClose,
  onAddKeyframe,
  onRemoveKeyframe,
  onChangeEasing,
  onSeekToLocalTime,
}: VideoLayerInspectorProps) {
  const length = itemLength(item)
  const fadeLength = length
  const fade = readFade(item.keyframes, fadeLength)
  const maxFade = Math.max(0.1, fadeLength / 2)
  const setFade = (fadeIn: number, fadeOut: number) =>
    onChange({ ...item, keyframes: applyFade(item.keyframes, fadeLength, fadeIn, fadeOut) })
  const localTime = Math.max(0, Math.min(length, time - item.start))
  const blendMode = item.blendMode ?? 'normal'
  const fitMode = item.fitMode ?? 'contain'
  const currentFilter = item.filter ?? 'none'
  const rotation = item.rotation ?? 0

  return (
    <div className="inspector-panel clip-inspector-panel">
      <div className="inspector-header">
        <div className="inspector-title-row">
          <span className="inspector-type-badge">LAYER {videoLayerName(item.trackIndex)}</span>
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
        <h3 className="inspector-title" title={clip?.name ?? 'Video layer'}>
          {clip?.name ?? 'Video layer'}
        </h3>
      </div>

      <div className="inspector-scroll-body">
        {/* Fade up / down, written as opacity keyframes */}
        <section className="inspector-section">
          <div className="section-header-row">
            <span className="inspector-section-label">Fade</span>
            <span className="section-value-pill">
              {fade.fadeIn > 0 || fade.fadeOut > 0
                ? `${fade.fadeIn.toFixed(1)}s / ${fade.fadeOut.toFixed(1)}s`
                : 'None'}
            </span>
          </div>

          <div className="intensity-slider-wrap">
            <div className="intensity-label-row">
              <span className="control-sublabel">Fade in</span>
              <span
                className={`control-subvalue${fade.fadeIn > 0 ? ' active' : ''}`}
                onDoubleClick={() => setFade(0, fade.fadeOut)}
                title="Double-click to reset"
              >
                {fade.fadeIn.toFixed(1)}s
              </span>
            </div>
            <Slider
              min={0}
              max={maxFade}
              step={0.1}
              value={fade.fadeIn}
              defaultValue={0}
              onChange={(val) => setFade(val, fade.fadeOut)}
              ariaLabel="Fade in duration"
            />
          </div>

          <div className="intensity-slider-wrap">
            <div className="intensity-label-row">
              <span className="control-sublabel">Fade out</span>
              <span
                className={`control-subvalue${fade.fadeOut > 0 ? ' active' : ''}`}
                onDoubleClick={() => setFade(fade.fadeIn, 0)}
                title="Double-click to reset"
              >
                {fade.fadeOut.toFixed(1)}s
              </span>
            </div>
            <Slider
              min={0}
              max={maxFade}
              step={0.1}
              value={fade.fadeOut}
              defaultValue={0}
              onChange={(val) => setFade(fade.fadeIn, val)}
              ariaLabel="Fade out duration"
            />
          </div>
        </section>

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
                volume: item.volume,
              }}
              localTime={localTime}
              itemLength={length}
              properties={LAYER_PROPERTIES}
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

        <section className="inspector-section">
          <div className="section-header-row">
            <span className="inspector-section-label">Compositing</span>
            <span className="section-value-pill">
              {BLEND_MODES.find((mode) => mode.id === blendMode)?.name ?? 'Normal'}
            </span>
          </div>
          <select
            className="inspector-select"
            value={blendMode}
            aria-label="Blend mode"
            onChange={(event) => onChange({ ...item, blendMode: event.target.value as BlendMode })}
          >
            {BLEND_MODES.map((mode) => (
              <option key={mode.id} value={mode.id}>
                {mode.name}
              </option>
            ))}
          </select>

          <div className="fit-mode-toggle-group">
            <span className="control-sublabel">Framing</span>
            <div className="fit-toggle-row">
              <button
                type="button"
                className={`fit-toggle-btn${fitMode === 'contain' ? ' active' : ''}`}
                onClick={() => onChange({ ...item, fitMode: 'contain' })}
                title="Fit the whole clip inside the frame"
              >
                Fit (Contain)
              </button>
              <button
                type="button"
                className={`fit-toggle-btn${fitMode === 'cover' ? ' active' : ''}`}
                onClick={() => onChange({ ...item, fitMode: 'cover' })}
                title="Fill the frame, cropping the overflow"
              >
                Fill (Cover)
              </button>
            </div>
          </div>
        </section>

        <section className="inspector-section">
          <div className="section-header-row">
            <span className="inspector-section-label">Color Filter</span>
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
                onClick={() => onChange({ ...item, filter: preset.id })}
                title={preset.description}
              >
                <span className="filter-card-name">{preset.name}</span>
              </button>
            ))}
          </div>
        </section>

        <section className="inspector-section">
          <span className="inspector-section-label">Orientation</span>
          <div className="transform-actions-grid">
            <button
              type="button"
              className="transform-action-btn"
              onClick={() => onChange({ ...item, rotation: (rotation + 90) % 360 })}
              title="Rotate 90 degrees clockwise"
            >
              <span className="transform-btn-icon">↻</span>
              <span>Rotate 90°</span>
              {rotation > 0 && <span className="transform-badge">{rotation}°</span>}
            </button>
            <button
              type="button"
              className={`transform-action-btn${item.flipH ? ' active' : ''}`}
              onClick={() => onChange({ ...item, flipH: !item.flipH })}
              title="Mirror horizontally"
            >
              <span className="transform-btn-icon">⇄</span>
              <span>Flip H</span>
            </button>
            <button
              type="button"
              className={`transform-action-btn${item.flipV ? ' active' : ''}`}
              onClick={() => onChange({ ...item, flipV: !item.flipV })}
              title="Flip vertically"
            >
              <span className="transform-btn-icon">⇅</span>
              <span>Flip V</span>
            </button>
          </div>
        </section>

        <section className="inspector-section">
          <span className="inspector-section-label">Audio</span>
          <div className="mute-toggle-row">
            <label className="mute-checkbox-label">
              <input
                type="checkbox"
                checked={item.muted}
                onChange={(event) => onChange({ ...item, muted: event.target.checked })}
              />
              <span>Mute layer audio</span>
            </label>
          </div>
        </section>
      </div>

      <div className="inspector-footer">
        <button
          type="button"
          className="inspector-reset-btn"
          onClick={() => onChange(resetVideoLayerItem(item))}
          title="Clear compositing, filters and animation"
        >
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="1 4 1 10 7 10" />
            <path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10" />
          </svg>
          Reset Layer
        </button>
        <button
          type="button"
          className="btn-danger-outline delete-clip-btn"
          onClick={() => onDelete(item.id)}
          title="Remove this clip from the layer"
        >
          Delete Clip
        </button>
      </div>
    </div>
  )
}
