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
  const setPreset = (preset: typeof POSITION_PRESETS[number]) =>
    onChange({ ...item, x: preset.x, y: preset.y, position: preset.position })

  return (
    <div className="text-inspector" role="region" aria-label="Title inspector">
      <div className="inspector-field text-input-field">
        <label htmlFor="title-text-input">Text</label>
        <input
          id="title-text-input"
          type="text"
          value={item.text}
          placeholder="Title text…"
          onChange={(event) => onChange({ ...item, text: event.target.value })}
          autoFocus
        />
      </div>

      <div className="inspector-field">
        <label htmlFor="title-font-select">Font Style</label>
        <select
          id="title-font-select"
          className="font-select"
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

      <div className="inspector-field">
        <div className="field-header">
          <span className="field-label">Size</span>
          <span className="field-value">{currentFontSize}px</span>
        </div>
        <div className="size-slider-row">
          <input
            type="range"
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

      <div className="inspector-field">
        <div className="field-header">
          <span className="field-label">Position Presets</span>
          <span className="drag-hint">💡 Or drag on video</span>
        </div>
        <div className="segmented-control wrap">
          {POSITION_PRESETS.map((p) => {
            const active = (item.x === p.x && item.y === p.y) || (!item.x && item.position === p.position && p.x === 50)
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

      <div className="inspector-field">
        <span className="field-label">Background</span>
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

      <div className="inspector-field color-field">
        <span className="field-label">Color</span>
        <div className="color-picker-group">
          <input
            type="color"
            aria-label="Custom color"
            value={item.color}
            onChange={(event) => setColor(event.target.value)}
          />
          <div className="color-swatches">
            {COLOR_SWATCHES.map((swatch) => (
              <button
                key={swatch}
                type="button"
                className={`swatch${item.color.toLowerCase() === swatch ? ' active' : ''}`}
                style={{ backgroundColor: swatch }}
                aria-label={swatch}
                onClick={() => setColor(swatch)}
              />
            ))}
          </div>
        </div>
      </div>

      <div className="inspector-actions">
        <button
          type="button"
          className="delete-button"
          onClick={() => onDelete(item.id)}
          title="Delete title"
        >
          Delete
        </button>
        <button
          type="button"
          className="close-button"
          onClick={onClose}
          aria-label="Close title inspector"
        >
          ×
        </button>
      </div>
    </div>
  )
}

