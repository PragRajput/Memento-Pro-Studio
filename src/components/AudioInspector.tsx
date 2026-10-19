import { clamp } from '../timeline.ts'
import type { AudioTimelineItem } from '../types.ts'

interface AudioInspectorProps {
  item: AudioTimelineItem
  clipName: string
  trackCount: number
  onVolumeChange: (id: string, volume: number) => void
  onMoveToTrack: (id: string, trackIndex: number) => void
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

export function AudioInspector({
  item,
  clipName,
  trackCount,
  onVolumeChange,
  onMoveToTrack,
  onDelete,
  onClose,
}: AudioInspectorProps) {
  const currentVolume = clamp(item.volume, 0, 1)
  const currentTrack = item.trackIndex ?? 0
  const volPercent = Math.round(currentVolume * 100)

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
              onChange={(event) => onVolumeChange(item.id, Number(event.target.value))}
              aria-label="Volume slider"
            />
            <div className="segmented-control mini">
              {VOLUME_PRESETS.map(({ label, val }) => (
                <button
                  key={label}
                  type="button"
                  className={Math.abs(currentVolume - val) < 0.02 ? 'active' : ''}
                  onClick={() => onVolumeChange(item.id, val)}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      <div className="inspector-footer">
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
