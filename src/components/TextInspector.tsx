import type { TextAnimationType, TextOverlay } from '../types.ts'
import { resetTextOverlay } from '../resetSettings.ts'
import { Slider } from './Slider.tsx'
import { TITLE_PRESETS } from '../textStyle.ts'

interface TextInspectorProps {
  item: TextOverlay
  onChange: (updated: TextOverlay) => void
  onDelete: (id: string) => void
  onClose: () => void
}

interface FontOption {
  id: string
  name: string
  family: string
  category: 'Cinematic & Bold' | 'Modern & Aesthetic' | 'Luxury & Editorial' | 'Cursive & Script' | 'Cyber & Retro Tech' | 'Street & Marker'
}

const STYLISH_FONTS: FontOption[] = [
  // Cinematic & Bold
  { id: 'Anton', name: 'Anton — Punchy Impact', family: 'Anton, sans-serif', category: 'Cinematic & Bold' },
  { id: 'Bebas Neue', name: 'Bebas Neue — Cinema Clean', family: '"Bebas Neue", sans-serif', category: 'Cinematic & Bold' },
  { id: 'Russo One', name: 'Russo One — Heavy Bold', family: '"Russo One", sans-serif', category: 'Cinematic & Bold' },
  { id: 'Bangers', name: 'Bangers — Pop Art Comic', family: 'Bangers, cursive', category: 'Cinematic & Bold' },
  { id: 'Black Han Sans', name: 'Black Han — Mega Block', family: '"Black Han Sans", sans-serif', category: 'Cinematic & Bold' },
  { id: 'Impact', name: 'Impact — Classic Meme', family: 'Impact, sans-serif', category: 'Cinematic & Bold' },

  // Modern & Aesthetic
  { id: 'Syne', name: 'Syne — Avant-Garde', family: 'Syne, sans-serif', category: 'Modern & Aesthetic' },
  { id: 'Outfit', name: 'Outfit — Sleek Minimalist', family: 'Outfit, sans-serif', category: 'Modern & Aesthetic' },
  { id: 'Poppins', name: 'Poppins — Geometric Sans', family: 'Poppins, sans-serif', category: 'Modern & Aesthetic' },
  { id: 'Plus Jakarta Sans', name: 'Plus Jakarta — Contemporary', family: '"Plus Jakarta Sans", sans-serif', category: 'Modern & Aesthetic' },
  { id: 'Montserrat', name: 'Montserrat — Premium Modern', family: 'Montserrat, sans-serif', category: 'Modern & Aesthetic' },
  { id: 'Inter', name: 'Inter — Clean Studio', family: 'Inter, sans-serif', category: 'Modern & Aesthetic' },
  { id: 'Oswald', name: 'Oswald — Tall Editorial', family: 'Oswald, sans-serif', category: 'Modern & Aesthetic' },

  // Luxury & Editorial
  { id: 'Playfair Display', name: 'Playfair — Vogue Luxury', family: '"Playfair Display", serif', category: 'Luxury & Editorial' },
  { id: 'Cinzel', name: 'Cinzel — Roman Cinematic', family: 'Cinzel, serif', category: 'Luxury & Editorial' },
  { id: 'Abril Fatface', name: 'Abril Fatface — Fashion Title', family: '"Abril Fatface", serif', category: 'Luxury & Editorial' },
  { id: 'Cormorant Garamond', name: 'Cormorant — Royal Classic', family: '"Cormorant Garamond", serif', category: 'Luxury & Editorial' },
  { id: 'Prata', name: 'Prata — Teardrop Luxury', family: 'Prata, serif', category: 'Luxury & Editorial' },
  { id: 'Georgia', name: 'Georgia — Editorial Serif', family: 'Georgia, serif', category: 'Luxury & Editorial' },

  // Cursive & Script
  { id: 'Pacifico', name: 'Pacifico — Retro Fun Script', family: 'Pacifico, cursive', category: 'Cursive & Script' },
  { id: 'Great Vibes', name: 'Great Vibes — Elegant Calligraphy', family: '"Great Vibes", cursive', category: 'Cursive & Script' },
  { id: 'Dancing Script', name: 'Dancing Script — Fluid Flow', family: '"Dancing Script", cursive', category: 'Cursive & Script' },
  { id: 'Caveat', name: 'Caveat — Casual Signature', family: 'Caveat, cursive', category: 'Cursive & Script' },
  { id: 'Lobster', name: 'Lobster — Bold Vintage', family: 'Lobster, cursive', category: 'Cursive & Script' },
  { id: 'Satisfy', name: 'Satisfy — Smooth Brush', family: 'Satisfy, cursive', category: 'Cursive & Script' },

  // Cyber & Retro Tech
  { id: 'Orbitron', name: 'Orbitron — Sci-Fi Cyber', family: 'Orbitron, sans-serif', category: 'Cyber & Retro Tech' },
  { id: 'Righteous', name: 'Righteous — Chrome Retro', family: 'Righteous, cursive', category: 'Cyber & Retro Tech' },
  { id: 'Space Mono', name: 'Space Mono — Terminal Code', family: '"Space Mono", monospace', category: 'Cyber & Retro Tech' },
  { id: 'Press Start 2P', name: 'Press Start — 8-Bit Pixel', family: '"Press Start 2P", monospace', category: 'Cyber & Retro Tech' },
  { id: 'Bungee', name: 'Bungee — Urban Arcade', family: 'Bungee, cursive', category: 'Cyber & Retro Tech' },

  // Street & Marker
  { id: 'Permanent Marker', name: 'Permanent Marker — Graffiti Tag', family: '"Permanent Marker", cursive', category: 'Street & Marker' },
  { id: 'Shrikhand', name: 'Shrikhand — Painted Poster', family: 'Shrikhand, cursive', category: 'Street & Marker' },
]

const COLOR_SWATCHES = ['#ffffff', '#ffd700', '#ff4d4d', '#00e5ff', '#a78bfa', '#000000']

const BACKGROUND_OPTIONS = [
  { id: 'transparent', label: 'None' },
  { id: 'rgba(0, 0, 0, 0.75)', label: 'Dark' },
  { id: 'rgba(255, 255, 255, 0.85)', label: 'Light' },
  { id: 'rgba(147, 51, 234, 0.85)', label: 'Purple' },
]

const POSITION_PRESETS = [
  { label: 'Top', x: 50, y: 15, position: 'top' as const },
  { label: 'Center', x: 50, y: 50, position: 'center' as const },
  { label: 'Bottom', x: 50, y: 85, position: 'bottom' as const },
  { label: 'Top Left', x: 25, y: 15, position: 'top' as const },
  { label: 'Bottom Left', x: 25, y: 85, position: 'bottom' as const },
]

export function TextInspector({ item, onChange, onDelete, onClose }: TextInspectorProps) {
  const currentFont = item.fontFamily ?? 'Inter'
  const currentFontSize = item.fontSize ?? (item.size === 'small' ? 32 : item.size === 'large' ? 72 : 48)
  const currentBg = item.backgroundColor ?? 'transparent'

  const setFont = (fontFamily: string) => onChange({ ...item, fontFamily })
  const setFontSize = (fontSize: number) => {
    const size = fontSize <= 36 ? 'small' : fontSize >= 68 ? 'large' : 'medium'
    onChange({ ...item, fontSize, size })
  }
  const setColor = (color: string) => onChange({ ...item, color })
  const setBackground = (backgroundColor: string) => onChange({ ...item, backgroundColor })
  const setPreset = (preset: (typeof POSITION_PRESETS)[number]) =>
    onChange({ ...item, x: preset.x, y: preset.y, position: preset.position })

  return (
    <div className="inspector-panel text-inspector" role="region" aria-label="Title inspector">
      <div className="inspector-header">
        <div className="inspector-title-group">
          <span className="inspector-icon" aria-hidden="true">T</span>
          <h3>Title Overlay</h3>
        </div>
        <button
          type="button"
          className="inspector-close-btn"
          onClick={onClose}
          aria-label="Close inspector"
          title="Close inspector"
        >
          ×
        </button>
      </div>

      <div className="inspector-body">
        {/* Title Style Presets */}
        <div className="inspector-group">
          <span className="group-label">Title Style Presets</span>
          <div className="transition-type-grid">
            {TITLE_PRESETS.map((preset) => {
              const isActive = item.textPreset === preset.id
              return (
                <button
                  key={preset.id}
                  type="button"
                  className={`type-card${isActive ? ' active' : ''}`}
                  onClick={() => onChange({ ...item, ...preset.styles, textPreset: preset.id })}
                  title={preset.description}
                >
                  <span className="type-label">{preset.name}</span>
                </button>
              )
            })}
          </div>
        </div>

        {/* Text Input */}
        <div className="inspector-group">
          <label className="group-label" htmlFor="title-text-input">Text Content</label>
          <input
            id="title-text-input"
            type="text"
            className="inspector-input text-content-input"
            value={item.text}
            placeholder="Type overlay text…"
            onChange={(event) => onChange({ ...item, text: event.target.value })}
            autoFocus
          />
        </div>

        {/* Font Style */}
        <div className="inspector-group">
          <label className="group-label" htmlFor="title-font-select">Typography</label>
          <select
            id="title-font-select"
            className="inspector-select"
            value={currentFont}
            onChange={(event) => setFont(event.target.value)}
          >
            {(
              [
                'Cinematic & Bold',
                'Modern & Aesthetic',
                'Luxury & Editorial',
                'Cursive & Script',
                'Cyber & Retro Tech',
                'Street & Marker',
              ] as const
            ).map((cat) => (
              <optgroup key={cat} label={cat}>
                {STYLISH_FONTS.filter((f) => f.category === cat).map((font) => (
                  <option key={font.id} value={font.id} style={{ fontFamily: font.family }}>
                    {font.name}
                  </option>
                ))}
              </optgroup>
            ))}
          </select>
        </div>

        {/* Font Size */}
        <div className="inspector-group">
          <div className="group-header-row">
            <span className="group-label">Size</span>
            <span
              className="group-value-badge"
              style={{ cursor: 'pointer' }}
              onDoubleClick={() => setFontSize(48)}
              title="Double-click to reset"
            >
              {currentFontSize}px
            </span>
          </div>
          <div className="slider-with-presets">
            <Slider
              min={18}
              max={120}
              step={1}
              value={currentFontSize}
              defaultValue={48}
              onChange={setFontSize}
              ariaLabel="Font size slider"
            />
            <div className="segmented-control mini">
              {[
                { label: 'S', val: 32 },
                { label: 'M', val: 48 },
                { label: 'L', val: 72 },
                { label: 'XL', val: 96 },
              ].map(({ label, val }) => (
                <button
                  key={label}
                  type="button"
                  className={currentFontSize === val ? 'active' : ''}
                  onClick={() => setFontSize(val)}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Position Presets */}
        <div className="inspector-group">
          <div className="group-header-row">
            <span className="group-label">Position Presets</span>
            <span className="drag-hint">Drag on preview canvas</span>
          </div>
          <div className="segmented-control wrap-control">
            {POSITION_PRESETS.map((p) => {
              const active =
                (item.x === p.x && item.y === p.y) ||
                (!item.x && item.position === p.position && p.x === 50)
              return (
                <button
                  key={p.label}
                  type="button"
                  className={active ? 'active' : ''}
                  onClick={() => setPreset(p)}
                >
                  {p.label}
                </button>
              )
            })}
          </div>
        </div>

        {/* Background */}
        <div className="inspector-group">
          <span className="group-label">Background Banner</span>
          <div className="segmented-control">
            {BACKGROUND_OPTIONS.map((bg) => (
              <button
                key={bg.id}
                type="button"
                className={currentBg === bg.id ? 'active' : ''}
                onClick={() => setBackground(bg.id)}
              >
                {bg.label}
              </button>
            ))}
          </div>
        </div>

        {/* Color Palette */}
        <div className="inspector-group">
          <span className="group-label">Text Color</span>
          <div className="color-control-row">
            <input
              type="color"
              aria-label="Custom color picker"
              className="native-color-picker"
              value={item.color}
              onChange={(event) => setColor(event.target.value)}
            />
            <div className="swatch-list">
              {COLOR_SWATCHES.map((swatch) => (
                <button
                  key={swatch}
                  type="button"
                  className={`swatch-btn${item.color.toLowerCase() === swatch ? ' active' : ''}`}
                  style={{ backgroundColor: swatch }}
                  aria-label={swatch}
                  onClick={() => setColor(swatch)}
                />
              ))}
            </div>
          </div>
        </div>

        {/* Animation */}
        <div className="inspector-group">
          <span className="group-label">Motion Animation</span>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', marginBottom: '8px' }}>
            <div>
              <label style={{ fontSize: '11px', color: 'var(--text-muted)' }} htmlFor="text-anim-in">Entrance</label>
              <select
                id="text-anim-in"
                className="inspector-select"
                value={item.textAnimIn ?? 'none'}
                onChange={(e) => onChange({ ...item, textAnimIn: e.target.value as TextAnimationType })}
              >
                <option value="none">None</option>
                <option value="fade">Fade</option>
                <option value="slide-up">Slide Up</option>
                <option value="pop">Pop / Scale</option>
                <option value="typewriter">Typewriter</option>
              </select>
            </div>
            <div>
              <label style={{ fontSize: '11px', color: 'var(--text-muted)' }} htmlFor="text-anim-out">Exit</label>
              <select
                id="text-anim-out"
                className="inspector-select"
                value={item.textAnimOut ?? 'none'}
                onChange={(e) => onChange({ ...item, textAnimOut: e.target.value as TextAnimationType })}
              >
                <option value="none">None</option>
                <option value="fade">Fade</option>
                <option value="slide-up">Slide Up</option>
                <option value="pop">Pop / Scale</option>
              </select>
            </div>
          </div>
        </div>

        {/* Outline & Glow */}
        <div className="inspector-group">
          <span className="group-label">Outline & Glow</span>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span className="control-sublabel" style={{ width: '60px' }}>Stroke</span>
              <input
                type="color"
                className="native-color-picker"
                value={item.textStrokeColor ?? '#000000'}
                onChange={(e) => onChange({ ...item, textStrokeColor: e.target.value })}
              />
              <Slider
                min={0}
                max={0.25}
                step={0.01}
                value={item.textStrokeWidth ?? 0}
                defaultValue={0}
                onChange={(val) => onChange({ ...item, textStrokeWidth: val })}
                ariaLabel="Text stroke width"
              />
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span className="control-sublabel" style={{ width: '60px' }}>Glow</span>
              <input
                type="color"
                className="native-color-picker"
                value={item.textGlowColor ?? '#38bdf8'}
                onChange={(e) => onChange({ ...item, textGlowColor: e.target.value })}
              />
              <Slider
                min={0}
                max={0.6}
                step={0.02}
                value={item.textGlowBlur ?? 0}
                defaultValue={0}
                onChange={(val) => onChange({ ...item, textGlowBlur: val })}
                ariaLabel="Text glow blur"
              />
            </div>
          </div>
        </div>

        {/* Tracking & Rotation */}
        <div className="inspector-group">
          <span className="group-label">Tracking & Tilt</span>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span className="control-sublabel" style={{ width: '60px' }}>Tracking</span>
              <Slider
                min={-0.05}
                max={0.3}
                step={0.01}
                value={item.textLetterSpacing ?? 0}
                bipolar={true}
                defaultValue={0}
                onChange={(val) => onChange({ ...item, textLetterSpacing: val })}
                ariaLabel="Text letter spacing"
              />
              <span
                className={`control-subvalue${(item.textLetterSpacing ?? 0) !== 0 ? ' active' : ''}`}
                style={{ width: '42px', textAlign: 'center' }}
                onDoubleClick={() => onChange({ ...item, textLetterSpacing: 0 })}
                title="Double-click to reset"
              >
                {Math.round((item.textLetterSpacing ?? 0) * 100)}%
              </span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span className="control-sublabel" style={{ width: '60px' }}>Rotation</span>
              <Slider
                min={-45}
                max={45}
                step={1}
                value={item.textRotation ?? 0}
                bipolar={true}
                defaultValue={0}
                onChange={(val) => onChange({ ...item, textRotation: Math.round(val) })}
                ariaLabel="Text rotation angle"
              />
              <span
                className={`control-subvalue${(item.textRotation ?? 0) !== 0 ? ' active' : ''}`}
                style={{ width: '42px', textAlign: 'center' }}
                onDoubleClick={() => onChange({ ...item, textRotation: 0 })}
                title="Double-click to reset"
              >
                {item.textRotation ?? 0}°
              </span>
            </div>
          </div>
        </div>
      </div>

      <div className="inspector-footer">
        <button
          type="button"
          className="inspector-reset-btn"
          onClick={() => onChange(resetTextOverlay(item))}
          title="Keep the words, clear every style choice"
        >
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="1 4 1 10 7 10" />
            <path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10" />
          </svg>
          Reset Style
        </button>
        <button
          type="button"
          className="inspector-delete-btn"
          onClick={() => onDelete(item.id)}
          title="Delete this title overlay"
        >
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="3 6 5 6 21 6" />
            <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
          </svg>
          Delete Title
        </button>
      </div>
    </div>
  )
}
