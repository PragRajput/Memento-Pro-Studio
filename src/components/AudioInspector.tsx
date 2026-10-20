import { AUDIO_EFFECT_PRESETS } from '../audioEffects.ts'
import { resetAudioItem } from '../resetSettings.ts'
import { clamp } from '../timeline.ts'
import type { AudioEffectType, AudioTimelineItem } from '../types.ts'

interface AudioInspectorProps {
  item: AudioTimelineItem
  clipName: string
  trackCount: number
  onChange?: (updated: AudioTimelineItem) => void
  onVolumeChange: (id: string, volume: number) => void
  onMoveToTrack: (id: string, trackIndex: number) => void
  onFadeChange?: (id: string, fadeIn: number, fadeOut: number) => void
  onEffectChange?: (id: string, effect: AudioEffectType, intensity?: number) => void
  onSpeedChange?: (id: string, speed: number) => void
  onDelete: (id: string) => void
  onClose: () => void
}

const VOLUME_PRESETS = [
  { label: 'Mute', val: 0 },
  { label: '25%', val: 0.25 },
  { label: '50%', val: 0.5 },
  { label: '75%', val: 0.75 },
  { label: '100%', val: 1 },
]

const SPEED_PRESETS = [0.5, 0.75, 1, 1.25, 1.5, 2]

export function AudioInspector({
  item,
  clipName,
  trackCount,
  onChange,
  onVolumeChange,
  onMoveToTrack,
  onFadeChange,
  onEffectChange,
  onSpeedChange,
  onDelete,
  onClose,
}: AudioInspectorProps) {
  const currentVolume = clamp(item.volume, 0, 1)
  const currentTrack = item.trackIndex ?? 0
  const volPercent = Math.round(currentVolume * 100)
  const currentEffect = item.effect ?? 'none'
  const effectIntensity = item.effectIntensity ?? 1
  const currentSpeed = item.speed ?? 1

  const handleEffectSelect = (effectId: AudioEffectType) => {
    if (onEffectChange) onEffectChange(item.id, effectId, effectIntensity)
    if (onChange) onChange({ ...item, effect: effectId, effectIntensity })
  }

  const handleIntensityChange = (val: number) => {
    if (onEffectChange) onEffectChange(item.id, currentEffect, val)
    if (onChange) onChange({ ...item, effectIntensity: val })
  }

  const handleSpeedSelect = (s: number) => {
    if (onSpeedChange) onSpeedChange(item.id, s)
    if (onChange) onChange({ ...item, speed: s })
  }

  const handleVolumeChange = (vol: number) => {
    onVolumeChange(item.id, vol)
    if (onChange) onChange({ ...item, volume: vol })
  }

  const handleFadeInChange = (fadeIn: number) => {
    onFadeChange?.(item.id, fadeIn, item.fadeOut ?? 0)
    if (onChange) onChange({ ...item, fadeIn })
  }

  const handleFadeOutChange = (fadeOut: number) => {
    onFadeChange?.(item.id, item.fadeIn ?? 0, fadeOut)
    if (onChange) onChange({ ...item, fadeOut })
  }

  return (
    <div className="inspector-panel audio-inspector" role="region" aria-label="Audio inspector">
      <div className="inspector-header">
        <div className="inspector-title-group">
          <span className="inspector-icon audio-icon-badge" aria-hidden="true">♪</span>
          <div className="header-text-block">
            <h3>Audio Properties</h3>
            <span className="sub-clip-name" title={clipName}>{clipName}</span>
          </div>
        </div>
        <button
          type="button"
          className="inspector-close-btn"
          onClick={onClose}
          aria-label="Close audio inspector"
          title="Close inspector"
        >
          ×
        </button>
      </div>

      <div className="inspector-body">
        {/* Track Selection */}
        <div className="inspector-group">
          <label className="group-label" htmlFor="audio-track-select">Track Routing</label>
          <select
            id="audio-track-select"
            className="inspector-select"
            value={currentTrack}
            onChange={(event) => onMoveToTrack(item.id, Number(event.target.value))}
          >
            {Array.from({ length: Math.max(trackCount, currentTrack + 1) }, (_, index) => (
              <option key={index} value={index}>
                Track A{index + 1} (Audio {index + 1})
              </option>
            ))}
            <option value={Math.max(trackCount, currentTrack + 1)}>+ Create &amp; Move to New Track</option>
          </select>
        </div>

        {/* Audio Effects Presets */}
        <div className="inspector-group">
          <div className="group-header-row">
            <span className="group-label">Audio Effect</span>
            <span className="group-value-badge">
              {AUDIO_EFFECT_PRESETS.find((p) => p.id === currentEffect)?.name ?? 'Normal'}
            </span>
          </div>
          <div className="audio-effects-grid">
            {AUDIO_EFFECT_PRESETS.map((preset) => {
              const isSelected = currentEffect === preset.id
              return (
                <button
                  key={preset.id}
                  type="button"
                  className={`audio-effect-card${isSelected ? ' active' : ''}`}
                  onClick={() => handleEffectSelect(preset.id)}
                  title={preset.description}
                >
                  <span className="audio-effect-name">{preset.name}</span>
                </button>
              )
            })}
          </div>

          {currentEffect !== 'none' && (
            <div className="intensity-slider-wrap" style={{ marginTop: '10px' }}>
              <div className="group-header-row">
                <span className="group-label" style={{ fontSize: '11px' }}>Effect Intensity</span>
                <span className="group-value-badge">{Math.round(effectIntensity * 100)}%</span>
              </div>
              <input
                type="range"
                className="inspector-slider"
                min={0}
                max={1}
                step={0.05}
                value={effectIntensity}
                onChange={(e) => handleIntensityChange(parseFloat(e.target.value))}
                aria-label="Effect intensity slider"
              />
            </div>
          )}
        </div>

        {/* Playback Speed */}
        <div className="inspector-group">
          <div className="group-header-row">
            <span className="group-label">Playback Speed</span>
            <span className="group-value-badge">{currentSpeed}x</span>
          </div>
          <div className="speed-pills-row">
            {SPEED_PRESETS.map((s) => (
              <button
                key={s}
                type="button"
                className={`speed-pill-btn${currentSpeed === s ? ' active' : ''}`}
                onClick={() => handleSpeedSelect(s)}
              >
                {s === 1 ? '1x' : `${s}x`}
              </button>
            ))}
          </div>
        </div>

        {/* Volume Level */}
        <div className="inspector-group">
          <div className="group-header-row">
            <span className="group-label">Gain / Volume</span>
            <span className="group-value-badge">{volPercent}%</span>
          </div>
          <div className="slider-with-presets">
            <input
              type="range"
              className="inspector-slider"
              min={0}
              max={1}
              step={0.01}
              value={currentVolume}
              onChange={(event) => handleVolumeChange(Number(event.target.value))}
              aria-label="Volume slider"
            />
            <div className="segmented-control mini">
              {VOLUME_PRESETS.map(({ label, val }) => (
                <button
                  key={label}
                  type="button"
                  className={Math.abs(currentVolume - val) < 0.02 ? 'active' : ''}
                  onClick={() => handleVolumeChange(val)}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Fade In & Fade Out */}
        <div className="inspector-group">
          <div className="group-header-row">
            <span className="group-label">Fade In</span>
            <span className="group-value-badge">{(item.fadeIn ?? 0).toFixed(1)}s</span>
          </div>
          <input
            type="range"
            className="inspector-slider"
            min={0}
            max={5}
            step={0.1}
            value={item.fadeIn ?? 0}
            onChange={(e) => handleFadeInChange(parseFloat(e.target.value))}
          />
        </div>

        <div className="inspector-group">
          <div className="group-header-row">
            <span className="group-label">Fade Out</span>
            <span className="group-value-badge">{(item.fadeOut ?? 0).toFixed(1)}s</span>
          </div>
          <input
            type="range"
            className="inspector-slider"
            min={0}
            max={5}
            step={0.1}
            value={item.fadeOut ?? 0}
            onChange={(e) => handleFadeOutChange(parseFloat(e.target.value))}
          />
        </div>
      </div>

      <div className="inspector-footer">
        <button
          type="button"
          className="inspector-reset-btn"
          onClick={() => onChange?.(resetAudioItem(item))}
          title="Full volume, no fades, no effect"
        >
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="1 4 1 10 7 10" />
            <path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10" />
          </svg>
          Reset Audio
        </button>
        <button
          type="button"
          className="inspector-delete-btn"
          onClick={() => onDelete(item.id)}
          title="Delete audio clip from timeline"
        >
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="3 6 5 6 21 6" />
            <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
          </svg>
          Delete Clip
        </button>
      </div>
    </div>
  )
}
