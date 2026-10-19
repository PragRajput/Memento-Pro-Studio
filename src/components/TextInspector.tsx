import type { TextOverlay } from '../types.ts'

interface TextInspectorProps {
  item: TextOverlay
  onChange: (updated: TextOverlay) => void
  onDelete: (id: string) => void
  onClose: () => void
}

const STYLISH_FONTS = [
  { id: 'Inter', name: 'Inter (Clean / Modern)', family: 'Inter, sans-serif' },
  { id: 'Anton', name: 'Anton (Impact Bold)', family: 'Anton, sans-serif' },
  { id: 'Bebas Neue', name: 'Bebas Neue (Cinematic)', family: '"Bebas Neue", sans-serif' },
  { id: 'Montserrat', name: 'Montserrat (Ultra Bold)', family: 'Montserrat, sans-serif' },
  { id: 'Playfair Display', name: 'Playfair Display (Luxury Serif)', family: '"Playfair Display", serif' },
  { id: 'Pacifico', name: 'Pacifico (Retro Fun)', family: 'Pacifico, cursive' },
  { id: 'Caveat', name: 'Caveat (Casual Script)', family: 'Caveat, cursive' },
  { id: 'Dancing Script', name: 'Dancing Script (Cursive Flow)', family: '"Dancing Script", cursive' },
  { id: 'Oswald', name: 'Oswald (Punchy Tall)', family: 'Oswald, sans-serif' },
  { id: 'Space Mono', name: 'Space Mono (Retro Code)', family: '"Space Mono", monospace' },
  { id: 'Impact', name: 'Impact (Meme Classic)', family: 'Impact, sans-serif' },
  { id: 'Georgia', name: 'Georgia (Editorial Serif)', family: 'Georgia, serif' },
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
            {STYLISH_FONTS.map((font) => (
              <option key={font.id} value={font.id} style={{ fontFamily: font.family }}>
                {font.name}
              </option>
            ))}
          </select>
        </div>

        {/* Font Size */}
        <div className="inspector-group">
          <div className="group-header-row">
            <span className="group-label">Size</span>
            <span className="group-value-badge">{currentFontSize}px</span>
          </div>
          <div className="slider-with-presets">
            <input
              type="range"
              className="inspector-slider"
              min={18}
              max={120}
              step={1}
              value={currentFontSize}
              onChange={(event) => setFontSize(Number(event.target.value))}
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
            <span className="drag-hint">💡 Drag on preview canvas</span>
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
      </div>

      <div className="inspector-footer">
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
