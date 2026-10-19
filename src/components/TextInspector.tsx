import type { TextOverlay, TextPosition, TextSize } from '../types.ts'

interface TextInspectorProps {
  item: TextOverlay
  onChange: (updated: TextOverlay) => void
  onDelete: (id: string) => void
  onClose: () => void
}

const COLOR_SWATCHES = ['#ffffff', '#ffd700', '#ff4d4d', '#00e5ff', '#a78bfa', '#000000']

export function TextInspector({ item, onChange, onDelete, onClose }: TextInspectorProps) {
  const setPosition = (position: TextPosition) => onChange({ ...item, position })
  const setSize = (size: TextSize) => onChange({ ...item, size })
  const setColor = (color: string) => onChange({ ...item, color })

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
        <span className="field-label">Position</span>
        <div className="segmented-control">
          {(['top', 'center', 'bottom'] as const).map((pos) => (
            <button
              key={pos}
              type="button"
              className={item.position === pos ? 'active' : ''}
              onClick={() => setPosition(pos)}
            >
              {pos === 'top' ? 'Top' : pos === 'center' ? 'Center' : 'Bottom'}
            </button>
          ))}
        </div>
      </div>

      <div className="inspector-field">
        <span className="field-label">Size</span>
        <div className="segmented-control">
          {(['small', 'medium', 'large'] as const).map((sz) => (
            <button
              key={sz}
              type="button"
              className={item.size === sz ? 'active' : ''}
              onClick={() => setSize(sz)}
            >
              {sz === 'small' ? 'S' : sz === 'medium' ? 'M' : 'L'}
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

