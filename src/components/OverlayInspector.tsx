import {
  LOWER_THIRD_PRESETS,
  VFX_OVERLAY_PRESETS,
} from '../overlayDraw.ts'
import type {
  BlendMode,
  MediaClip,
  OverlayCategory,
  OverlayItem,
} from '../types.ts'

interface OverlayInspectorProps {
  item: OverlayItem
  mediaClips: ReadonlyMap<string, MediaClip>
  onChange: (updated: OverlayItem) => void
  onDelete: (id: string) => void
  onClose: () => void
}

const BLEND_MODES: { id: BlendMode; label: string }[] = [
  { id: 'normal', label: 'Normal' },
  { id: 'screen', label: 'Screen (Light)' },
  { id: 'multiply', label: 'Multiply (Dark)' },
  { id: 'overlay', label: 'Overlay (Contrast)' },
  { id: 'soft-light', label: 'Soft Light' },
]

const ACCENT_COLORS = ['#3b82f6', '#ef4444', '#10b981', '#f59e0b', '#8b5cf6', '#ec4899', '#ffffff']

export function OverlayInspector({
  item,
  mediaClips,
  onChange,
  onDelete,
  onClose,
}: OverlayInspectorProps) {
  const currentCategory = item.category
  const opacity = Math.round((item.opacity ?? 1) * 100)
  const availableClips = Array.from(mediaClips.values())

  const handleCategoryChange = (category: OverlayCategory) => {
    if (category === item.category) return
    const updated: OverlayItem = {
      ...item,
      category,
      clipId: category === 'media' ? (item.clipId ?? availableClips[0]?.id) : item.clipId,
      vfxType: category === 'vfx' ? (item.vfxType ?? 'letterbox') : item.vfxType,
      lowerThirdStyle: category === 'lower-third' ? (item.lowerThirdStyle ?? 'broadcast') : item.lowerThirdStyle,
    }
    onChange(updated)
  }

  const setPositionPreset = (x: number, y: number) => {
    onChange({ ...item, x, y })
  }

  return (
    <div className="inspector-panel overlay-inspector" role="region" aria-label="Overlay inspector">
      <div className="inspector-header">
        <div className="inspector-title-group">
          <span className="inspector-icon overlay-icon-badge" aria-hidden="true">
            {currentCategory === 'media'
              ? '🖼️'
              : currentCategory === 'vfx'
                ? '✨'
                : currentCategory === 'lower-third'
                  ? '📺'
                  : '🎨'}
          </span>
          <div className="header-text-block">
            <h3>Overlay Properties</h3>
            <span className="sub-clip-name">
              {currentCategory === 'media'
                ? (mediaClips.get(item.clipId ?? '')?.name ?? 'Picture-in-Picture')
                : currentCategory === 'vfx'
                  ? (VFX_OVERLAY_PRESETS.find((p) => p.id === item.vfxType)?.name ?? 'Visual FX')
                  : currentCategory === 'lower-third'
                    ? (item.title || 'Lower Third')
                    : 'Color Wash'}
            </span>
          </div>
        </div>
        <button
          type="button"
          className="inspector-close-btn"
          onClick={onClose}
          aria-label="Close overlay inspector"
          title="Close inspector"
        >
          ×
        </button>
      </div>

      <div className="inspector-body">
        {/* Overlay Category Tabs */}
        <div className="inspector-group">
          <span className="group-label">Overlay Type</span>
          <div className="segmented-control wrap-control">
            <button
              type="button"
              className={currentCategory === 'media' ? 'active' : ''}
              onClick={() => handleCategoryChange('media')}
            >
              🖼️ Media / PiP
            </button>
            <button
              type="button"
              className={currentCategory === 'vfx' ? 'active' : ''}
              onClick={() => handleCategoryChange('vfx')}
            >
              ✨ Visual FX
            </button>
            <button
              type="button"
              className={currentCategory === 'lower-third' ? 'active' : ''}
              onClick={() => handleCategoryChange('lower-third')}
            >
              📺 Lower Third
            </button>
            <button
              type="button"
              className={currentCategory === 'color' ? 'active' : ''}
              onClick={() => handleCategoryChange('color')}
            >
              🎨 Color Tint
            </button>
          </div>
        </div>

        {/* --- 1. MEDIA OVERLAY CONTROLS --- */}
        {currentCategory === 'media' && (
          <>
            <div className="inspector-group">
              <label className="group-label" htmlFor="overlay-clip-select">Source Media Clip</label>
              <select
                id="overlay-clip-select"
                className="inspector-select"
                value={item.clipId ?? ''}
                onChange={(e) => onChange({ ...item, clipId: e.target.value })}
              >
                {availableClips.length === 0 && <option value="">No media clips imported</option>}
                {availableClips.map((clip) => (
                  <option key={clip.id} value={clip.id}>
                    {clip.name} ({clip.mediaType === 'image' ? 'Image' : 'Video'})
                  </option>
                ))}
              </select>
            </div>

            <div className="inspector-group">
              <div className="group-header-row">
                <span className="group-label">Quick Corner Presets</span>
              </div>
              <div className="position-preset-grid">
                <button
                  type="button"
                  className="preset-pos-btn"
                  title="Top-Left"
                  onClick={() => setPositionPreset(18, 20)}
                >
                  ↖ Top Left
                </button>
                <button
                  type="button"
                  className="preset-pos-btn"
                  title="Top-Right (Watermark)"
                  onClick={() => setPositionPreset(82, 20)}
                >
                  ↗ Top Right
                </button>
                <button
                  type="button"
                  className="preset-pos-btn"
                  title="Center"
                  onClick={() => setPositionPreset(50, 50)}
                >
                  ⦿ Center
                </button>
                <button
                  type="button"
                  className="preset-pos-btn"
                  title="Bottom-Left"
                  onClick={() => setPositionPreset(18, 80)}
                >
                  ↙ Bottom Left
                </button>
                <button
                  type="button"
                  className="preset-pos-btn"
                  title="Bottom-Right"
                  onClick={() => setPositionPreset(82, 80)}
                >
                  ↘ Bottom Right
                </button>
              </div>
            </div>

            <div className="inspector-group">
              <div className="group-header-row">
                <span className="group-label">Size / Width</span>
                <span className="group-value-badge">{item.width ?? 30}%</span>
              </div>
              <input
                type="range"
                className="inspector-slider"
                min={10}
                max={90}
                step={1}
                value={item.width ?? 30}
                onChange={(e) => onChange({ ...item, width: Number(e.target.value) })}
              />
            </div>

            <div className="inspector-group">
              <div className="group-header-row">
                <span className="group-label">Fine Position (X / Y)</span>
                <span className="group-value-badge">{item.x ?? 50}% × {item.y ?? 50}%</span>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span style={{ fontSize: '10px', color: 'var(--text-muted)', width: '14px' }}>X</span>
                  <input
                    type="range"
                    className="inspector-slider"
                    min={5}
                    max={95}
                    step={1}
                    value={item.x ?? 50}
                    onChange={(e) => onChange({ ...item, x: Number(e.target.value) })}
                  />
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span style={{ fontSize: '10px', color: 'var(--text-muted)', width: '14px' }}>Y</span>
                  <input
                    type="range"
                    className="inspector-slider"
                    min={5}
                    max={95}
                    step={1}
                    value={item.y ?? 50}
                    onChange={(e) => onChange({ ...item, y: Number(e.target.value) })}
                  />
                </div>
              </div>
            </div>

            <div className="inspector-group">
              <div className="group-header-row">
                <span className="group-label">Rounded Corners</span>
                <span className="group-value-badge">{item.borderRadius ?? 0}px</span>
              </div>
              <input
                type="range"
                className="inspector-slider"
                min={0}
                max={32}
                step={2}
                value={item.borderRadius ?? 0}
                onChange={(e) => onChange({ ...item, borderRadius: Number(e.target.value) })}
              />
            </div>

            <div className="inspector-group">
              <div className="group-header-row">
                <span className="group-label">Border Stroke</span>
                <span className="group-value-badge">{item.borderWidth ?? 0}px</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
                <input
                  type="color"
                  className="native-color-picker"
                  value={item.borderColor ?? '#ffffff'}
                  onChange={(e) => onChange({ ...item, borderColor: e.target.value })}
                  title="Border Color"
                />
                <input
                  type="range"
                  className="inspector-slider"
                  min={0}
                  max={8}
                  step={1}
                  value={item.borderWidth ?? 0}
                  onChange={(e) => onChange({ ...item, borderWidth: Number(e.target.value) })}
                />
              </div>
            </div>
          </>
        )}

        {/* --- 2. VISUAL FX CONTROLS --- */}
        {currentCategory === 'vfx' && (
          <>
            <div className="inspector-group">
              <div className="group-header-row">
                <span className="group-label">Atmosphere Preset</span>
                <span className="group-value-badge">
                  {VFX_OVERLAY_PRESETS.find((p) => p.id === item.vfxType)?.name ?? 'Cinematic'}
                </span>
              </div>
              <div className="overlay-preset-grid">
                {VFX_OVERLAY_PRESETS.map((p) => {
                  const isActive = (item.vfxType ?? 'letterbox') === p.id
                  return (
                    <button
                      key={p.id}
                      type="button"
                      className={`overlay-card-btn${isActive ? ' active' : ''}`}
                      onClick={() => onChange({ ...item, vfxType: p.id })}
                      title={p.description}
                    >
                      <span className="overlay-card-icon">{p.icon}</span>
                      <span className="overlay-card-name">{p.name}</span>
                    </button>
                  )
                })}
              </div>
            </div>

            <div className="inspector-group">
              <div className="group-header-row">
                <span className="group-label">Effect Intensity</span>
                <span className="group-value-badge">{Math.round((item.intensity ?? 1) * 100)}%</span>
              </div>
              <input
                type="range"
                className="inspector-slider"
                min={0.1}
                max={1}
                step={0.05}
                value={item.intensity ?? 1}
                onChange={(e) => onChange({ ...item, intensity: parseFloat(e.target.value) })}
              />
            </div>
          </>
        )}

        {/* --- 3. LOWER THIRD CONTROLS --- */}
        {currentCategory === 'lower-third' && (
          <>
            <div className="inspector-group">
              <div className="group-header-row">
                <span className="group-label">Template Style</span>
              </div>
              <div className="overlay-preset-grid mini">
                {LOWER_THIRD_PRESETS.map((p) => {
                  const isActive = (item.lowerThirdStyle ?? 'broadcast') === p.id
                  return (
                    <button
                      key={p.id}
                      type="button"
                      className={`overlay-card-btn${isActive ? ' active' : ''}`}
                      onClick={() => onChange({ ...item, lowerThirdStyle: p.id })}
                      title={p.description}
                    >
                      <span className="overlay-card-icon">{p.icon}</span>
                      <span className="overlay-card-name">{p.name}</span>
                    </button>
                  )
                })}
              </div>
            </div>

            <div className="inspector-group">
              <label className="group-label" htmlFor="lower-third-title">Headline / Speaker Name</label>
              <input
                id="lower-third-title"
                type="text"
                className="inspector-input"
                value={item.title ?? ''}
                placeholder="Speaker Name"
                onChange={(e) => onChange({ ...item, title: e.target.value })}
              />
            </div>

            <div className="inspector-group">
              <label className="group-label" htmlFor="lower-third-sub">Subtitle / Role</label>
              <input
                id="lower-third-sub"
                type="text"
                className="inspector-input"
                value={item.subtitle ?? ''}
                placeholder="Title / Organization"
                onChange={(e) => onChange({ ...item, subtitle: e.target.value })}
              />
            </div>

            <div className="inspector-group">
              <span className="group-label">Accent Color</span>
              <div className="color-control-row">
                <input
                  type="color"
                  className="native-color-picker"
                  value={item.accentColor ?? '#3b82f6'}
                  onChange={(e) => onChange({ ...item, accentColor: e.target.value })}
                  title="Accent Color"
                />
                <div className="swatch-list">
                  {ACCENT_COLORS.map((swatch) => (
                    <button
                      key={swatch}
                      type="button"
                      className={`swatch-btn${item.accentColor === swatch ? ' active' : ''}`}
                      style={{ backgroundColor: swatch }}
                      onClick={() => onChange({ ...item, accentColor: swatch })}
                      aria-label={swatch}
                    />
                  ))}
                </div>
              </div>
            </div>
          </>
        )}

        {/* --- 4. COLOR TINT CONTROLS --- */}
        {currentCategory === 'color' && (
          <>
            <div className="inspector-group">
              <span className="group-label">Primary Color</span>
              <div className="color-control-row">
                <input
                  type="color"
                  className="native-color-picker"
                  value={item.color ?? '#f97316'}
                  onChange={(e) => onChange({ ...item, color: e.target.value })}
                />
                <div className="swatch-list">
                  {['#f97316', '#ef4444', '#a855f7', '#3b82f6', '#10b981', '#fbbf24'].map((swatch) => (
                    <button
                      key={swatch}
                      type="button"
                      className={`swatch-btn${item.color === swatch ? ' active' : ''}`}
                      style={{ backgroundColor: swatch }}
                      onClick={() => onChange({ ...item, color: swatch })}
                      aria-label={swatch}
                    />
                  ))}
                </div>
              </div>
            </div>

            <div className="inspector-group">
              <span className="group-label">Secondary Color (Gradient)</span>
              <div className="color-control-row">
                <input
                  type="color"
                  className="native-color-picker"
                  value={item.colorSecondary ?? '#a855f7'}
                  onChange={(e) => onChange({ ...item, colorSecondary: e.target.value })}
                />
                <button
                  type="button"
                  className="preset-pos-btn"
                  style={{ fontSize: '11px', padding: '4px 8px' }}
                  onClick={() => onChange({ ...item, colorSecondary: item.colorSecondary ? undefined : '#a855f7' })}
                >
                  {item.colorSecondary ? 'Remove Gradient' : '+ Add Gradient'}
                </button>
              </div>
            </div>
          </>
        )}

        {/* --- COMMON CONTROLS: OPACITY & BLEND MODE --- */}
        <div className="inspector-group">
          <div className="group-header-row">
            <span className="group-label">Overall Opacity</span>
            <span className="group-value-badge">{opacity}%</span>
          </div>
          <input
            type="range"
            className="inspector-slider"
            min={0}
            max={1}
            step={0.02}
            value={item.opacity ?? 1}
            onChange={(e) => onChange({ ...item, opacity: parseFloat(e.target.value) })}
            aria-label="Opacity slider"
          />
        </div>

        <div className="inspector-group">
          <label className="group-label" htmlFor="overlay-blend-select">Blend Mode</label>
          <select
            id="overlay-blend-select"
            className="inspector-select"
            value={item.blendMode ?? 'normal'}
            onChange={(e) => onChange({ ...item, blendMode: e.target.value as BlendMode })}
          >
            {BLEND_MODES.map((mode) => (
              <option key={mode.id} value={mode.id}>
                {mode.label}
              </option>
            ))}
          </select>
        </div>

        {/* --- DURATION SECTION --- */}
        <div className="inspector-group">
          <div className="group-header-row">
            <span className="group-label">Duration</span>
            <span className="group-value-badge">{item.duration.toFixed(1)}s</span>
          </div>
          <input
            type="range"
            className="inspector-slider"
            min={0.5}
            max={20}
            step={0.5}
            value={item.duration}
            onChange={(e) => onChange({ ...item, duration: parseFloat(e.target.value) })}
          />
        </div>
      </div>

      <div className="inspector-footer">
        <button
          type="button"
          className="inspector-delete-btn"
          onClick={() => onDelete(item.id)}
          title="Delete overlay"
        >
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="3 6 5 6 21 6" />
            <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
          </svg>
          Delete Overlay
        </button>
      </div>
    </div>
  )
}
