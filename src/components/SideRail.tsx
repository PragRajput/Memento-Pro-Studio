/** Which library the left panel is showing. */
export type SidePanelId = 'media' | 'effects' | 'transitions'

interface RailEntry {
  id: SidePanelId
  label: string
  /** Short mark shown in the rail; the full label is the tooltip and the panel heading. */
  mark: string
  hint: string
}

const RAIL: readonly RailEntry[] = [
  { id: 'media', label: 'Media', mark: 'M', hint: 'Imported video, photos and audio' },
  { id: 'effects', label: 'Effects', mark: 'FX', hint: 'Colour looks and audio effects' },
  { id: 'transitions', label: 'Transitions', mark: 'TR', hint: 'Blends between two clips' },
]

export function SideRail({
  active,
  onSelect,
}: {
  active: SidePanelId
  onSelect: (id: SidePanelId) => void
}) {
  return (
    <nav className="side-rail" aria-label="Panels">
      {RAIL.map((entry) => (
        <button
          key={entry.id}
          type="button"
          className={`side-rail-btn${active === entry.id ? ' active' : ''}`}
          onClick={() => onSelect(entry.id)}
          title={`${entry.label} — ${entry.hint}`}
          aria-pressed={active === entry.id}
        >
          <span className="side-rail-mark" aria-hidden="true">
            {entry.mark}
          </span>
          <span className="side-rail-label">{entry.label}</span>
        </button>
      ))}
    </nav>
  )
}
