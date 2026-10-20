import {
  LOWER_THIRD_PRESETS,
  VFX_OVERLAY_PRESETS,
} from '../overlayDraw.ts'
import { resetOverlayItem } from '../resetSettings.ts'
import type {
  BlendMode,
  MediaClip,
  OverlayAnimation,
  OverlayCategory,
  OverlayItem,
  OverlayLetterboxRatio,
  OverlayPipShape,
  OverlayWashShape,
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

const ANIMATION_KINDS: { id: OverlayAnimation; label: string }[] = [
  { id: 'none', label: 'Cut (None)' },
  { id: 'fade', label: 'Dissolve (Fade)' },
  { id: 'slide-left', label: 'Slide Left' },
  { id: 'slide-up', label: 'Slide Up' },
  { id: 'scale-pop', label: 'Pop (Scale)' },
  { id: 'wipe-right', label: 'Wipe' },
]

const LETTERBOX_RATIOS: { id: OverlayLetterboxRatio; label: string }[] = [
  { id: '2.39', label: '2.39:1 (Anamorphic Scope)' },
  { id: '2.35', label: '2.35:1 (Widescreen Classic)' },
  { id: '2.00', label: '2.00:1 (Univisium / Modern Streaming)' },
  { id: '1.85', label: '1.85:1 (Flat Academy)' },
  { id: '4:3', label: '4:3 (Vintage Television)' },
]

const WASH_SHAPES: { id: OverlayWashShape; label: string }[] = [
  { id: 'flat', label: 'Solid Flat Wash' },
  { id: 'linear', label: 'Linear Gradient' },
  { id: 'radial', label: 'Radial Spotlight' },
  { id: 'scrim-bottom', label: 'Bottom Scrim' },
  { id: 'scrim-top', label: 'Top Scrim' },
]

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
              ? 'PIP'
              : currentCategory === 'vfx'
                ? 'FX'
                : currentCategory === 'lower-third'
                  ? 'L3'
                  : 'COL'}
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
              Media / PiP
            </button>
            <button
              type="button"
              className={currentCategory === 'vfx' ? 'active' : ''}
              onClick={() => handleCategoryChange('vfx')}
            >
              Visual FX
            </button>
            <button
              type="button"
              className={currentCategory === 'lower-third' ? 'active' : ''}
              onClick={() => handleCategoryChange('lower-third')}
            >
              Lower Third
            </button>
            <button
              type="button"
              className={currentCategory === 'color' ? 'active' : ''}
              onClick={() => handleCategoryChange('color')}
            >
              Color Tint
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
              <span className="group-label">Mask Shape</span>
              <div className="segmented-control">
                {(['rect', 'rounded', 'circle'] as const).map((shape: OverlayPipShape) => (
                  <button
                    key={shape}
                    type="button"
                    className={(item.pipShape ?? 'rounded') === shape ? 'active' : ''}
                    onClick={() => onChange({ ...item, pipShape: shape })}
                  >
                    {shape === 'rect' ? 'Square' : shape === 'rounded' ? 'Rounded' : 'Circle'}
                  </button>
                ))}
              </div>
            </div>

            {(item.pipShape ?? 'rounded') === 'rounded' && (
              <div className="inspector-group">
                <div className="group-header-row">
                  <span className="group-label">Rounded Corners</span>
                  <span className="group-value-badge">{item.borderRadius ?? 8}px</span>
                </div>
                <input
                  type="range"
                  className="inspector-slider"
                  min={0}
                  max={32}
                  step={2}
                  value={item.borderRadius ?? 8}
                  onChange={(e) => onChange({ ...item, borderRadius: Number(e.target.value) })}
                />
              </div>
            )}

            <div className="inspector-group">
              <div className="group-header-row">
                <span className="group-label">Rotation & Mirror</span>
                <span className="group-value-badge">{item.pipRotation ?? 0}°</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <input
                  type="range"
                  className="inspector-slider"
                  min={-180}
                  max={180}
                  step={5}
                  value={item.pipRotation ?? 0}
                  onChange={(e) => onChange({ ...item, pipRotation: parseInt(e.target.value, 10) })}
                />
                <button
                  type="button"
                  className={`preset-pos-btn${item.pipFlipH ? ' active' : ''}`}
                  style={{ whiteSpace: 'nowrap', padding: '4px 8px', fontSize: '11px' }}
                  onClick={() => onChange({ ...item, pipFlipH: !item.pipFlipH })}
                >
                  ⇄ Mirror
                </button>
              </div>
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

            <div className="inspector-group">
              <div className="group-header-row">
                <span className="group-label">Drop Shadow</span>
                <button
                  type="button"
                  className="section-reset-link"
                  onClick={() => onChange({ ...item, pipShadow: !item.pipShadow })}
                >
                  {item.pipShadow ? 'Disable' : 'Enable'}
                </button>
              </div>
              {item.pipShadow && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '6px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span className="control-sublabel" style={{ width: '48px' }}>Blur</span>
                    <input
                      type="range"
                      className="inspector-slider"
                      min={0}
                      max={40}
                      step={2}
                      value={item.pipShadowBlur ?? 16}
                      onChange={(e) => onChange({ ...item, pipShadowBlur: parseInt(e.target.value, 10) })}
                    />
                    <span className="control-subvalue">{item.pipShadowBlur ?? 16}px</span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span className="control-sublabel" style={{ width: '48px' }}>Offset Y</span>
                    <input
                      type="range"
                      className="inspector-slider"
                      min={0}
                      max={30}
                      step={1}
                      value={item.pipShadowY ?? 8}
                      onChange={(e) => onChange({ ...item, pipShadowY: parseInt(e.target.value, 10) })}
                    />
                    <span className="control-subvalue">{item.pipShadowY ?? 8}px</span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span className="control-sublabel" style={{ width: '48px' }}>Opacity</span>
                    <input
                      type="range"
                      className="inspector-slider"
                      min={0}
                      max={1}
                      step={0.05}
                      value={item.pipShadowOpacity ?? 0.55}
                      onChange={(e) => onChange({ ...item, pipShadowOpacity: parseFloat(e.target.value) })}
                    />
                    <span className="control-subvalue">{Math.round((item.pipShadowOpacity ?? 0.55) * 100)}%</span>
                  </div>
                </div>
              )}
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

            {item.vfxType === 'letterbox' && (
              <div className="inspector-group">
                <label className="group-label" htmlFor="vfx-letterbox-ratio">Letterbox Target Ratio</label>
                <select
                  id="vfx-letterbox-ratio"
                  className="inspector-select"
                  value={item.vfxLetterboxRatio ?? '2.35'}
                  onChange={(e) => onChange({ ...item, vfxLetterboxRatio: e.target.value as OverlayLetterboxRatio })}
                >
                  {LETTERBOX_RATIOS.map((r) => (
                    <option key={r.id} value={r.id}>{r.label}</option>
                  ))}
                </select>
              </div>
            )}

            {item.vfxType === 'vignette' && (
              <>
                <div className="inspector-group">
                  <div className="group-header-row">
                    <span className="group-label">Vignette Feather (Clear Radius)</span>
                    <span className="group-value-badge">{Math.round((item.vfxVignetteFeather ?? 0.45) * 100)}%</span>
                  </div>
                  <input
                    type="range"
                    className="inspector-slider"
                    min={0.1}
                    max={0.9}
                    step={0.05}
                    value={item.vfxVignetteFeather ?? 0.45}
                    onChange={(e) => onChange({ ...item, vfxVignetteFeather: parseFloat(e.target.value) })}
                  />
                </div>
                <div className="inspector-group">
                  <span className="group-label">Vignette Color</span>
                  <input
                    type="color"
                    className="native-color-picker"
                    value={item.vfxVignetteColor ?? '#000000'}
                    onChange={(e) => onChange({ ...item, vfxVignetteColor: e.target.value })}
                  />
                </div>
              </>
            )}

            {item.vfxType === 'bokeh' && (
              <div className="inspector-group">
                <div className="group-header-row">
                  <span className="group-label">Bokeh Discs Count</span>
                  <span className="group-value-badge">{item.vfxBokehCount ?? 14}</span>
                </div>
                <input
                  type="range"
                  className="inspector-slider"
                  min={4}
                  max={48}
                  step={2}
                  value={item.vfxBokehCount ?? 14}
                  onChange={(e) => onChange({ ...item, vfxBokehCount: parseInt(e.target.value, 10) })}
                />
              </div>
            )}
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

            <div className="inspector-group">
              <div className="group-header-row">
                <span className="group-label">Scale Multiplier</span>
                <span className="group-value-badge">{(item.lowerThirdScale ?? 1).toFixed(1)}x</span>
              </div>
              <input
                type="range"
                className="inspector-slider"
                min={0.6}
                max={1.8}
                step={0.1}
                value={item.lowerThirdScale ?? 1}
                onChange={(e) => onChange({ ...item, lowerThirdScale: parseFloat(e.target.value) })}
              />
            </div>
          </>
        )}

        {/* --- 4. COLOR TINT / WASH CONTROLS --- */}
        {currentCategory === 'color' && (
          <>
            <div className="inspector-group">
              <label className="group-label" htmlFor="color-wash-shape">Wash Distribution</label>
              <select
                id="color-wash-shape"
                className="inspector-select"
                value={item.colorWashShape ?? (item.colorSecondary ? 'linear' : 'flat')}
                onChange={(e) => onChange({ ...item, colorWashShape: e.target.value as OverlayWashShape })}
              >
                {WASH_SHAPES.map((s) => (
                  <option key={s.id} value={s.id}>{s.label}</option>
                ))}
              </select>
            </div>

            {((item.colorWashShape ?? '').startsWith('scrim')) && (
              <div className="inspector-group">
                <div className="group-header-row">
                  <span className="group-label">Scrim Height Fraction</span>
                  <span className="group-value-badge">{Math.round((item.colorWashScrimSize ?? 0.5) * 100)}%</span>
                </div>
                <input
                  type="range"
                  className="inspector-slider"
                  min={0.1}
                  max={1.0}
                  step={0.05}
                  value={item.colorWashScrimSize ?? 0.5}
                  onChange={(e) => onChange({ ...item, colorWashScrimSize: parseFloat(e.target.value) })}
                />
              </div>
            )}

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

            {(item.colorWashShape === 'linear' || item.colorWashShape === 'radial' || item.colorSecondary) && (
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
                    {item.colorSecondary ? 'Clear Second Color' : '+ Add Gradient'}
                  </button>
                </div>
              </div>
            )}
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
            {BLEND_MODES.map((bm) => (
              <option key={bm.id} value={bm.id}>{bm.label}</option>
            ))}
          </select>
        </div>

        {/* --- ENTRANCE / EXIT MOTION ANIMATION --- */}
        <div className="inspector-group">
          <span className="group-label">Motion Animation</span>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
            <div>
              <label style={{ fontSize: '11px', color: 'var(--text-muted)' }} htmlFor="overlay-anim-in">Entrance</label>
              <select
                id="overlay-anim-in"
                className="inspector-select"
                value={item.overlayAnimIn ?? 'none'}
                onChange={(e) => onChange({ ...item, overlayAnimIn: e.target.value as OverlayAnimation })}
              >
                {ANIMATION_KINDS.map((ak) => (
                  <option key={ak.id} value={ak.id}>{ak.label}</option>
                ))}
              </select>
            </div>
            <div>
              <label style={{ fontSize: '11px', color: 'var(--text-muted)' }} htmlFor="overlay-anim-out">Exit</label>
              <select
                id="overlay-anim-out"
                className="inspector-select"
                value={item.overlayAnimOut ?? 'none'}
                onChange={(e) => onChange({ ...item, overlayAnimOut: e.target.value as OverlayAnimation })}
              >
                {ANIMATION_KINDS.map((ak) => (
                  <option key={ak.id} value={ak.id}>{ak.label}</option>
                ))}
              </select>
            </div>
          </div>
        </div>
      </div>

      <div className="inspector-footer">
        <button
          type="button"
          className="inspector-reset-btn"
          onClick={() => onChange(resetOverlayItem(item))}
          title="Back to this overlay type’s defaults"
        >
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="1 4 1 10 7 10" />
            <path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10" />
          </svg>
          Reset Overlay
        </button>
        <button
          type="button"
          className="inspector-delete-btn"
          onClick={() => onDelete(item.id)}
          title="Delete this overlay"
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
