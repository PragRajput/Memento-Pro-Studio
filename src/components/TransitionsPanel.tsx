import { TRANSITION_DRAG_TYPE } from '../dnd.ts'
import { TRANSITION_TYPES } from '../transitionTimeline.ts'
import type { TransitionType } from '../types.ts'

interface TransitionsPanelProps {
  /** Type of the transition currently selected, so the library can show it as active. */
  selectedType: TransitionType | null
  /** Whether there is a cut the click action could apply to. */
  canApply: boolean
  onApply: (type: TransitionType) => void
}

/**
 * A browsable library of blends. Drag one onto a cut in the timeline, or click
 * to retype the selected transition.
 */
export function TransitionsPanel({ selectedType, canApply, onApply }: TransitionsPanelProps) {
  return (
    <section className="panel side-panel" aria-label="Transitions">
      <header className="panel-header">
        <h2 className="panel-title">Transitions</h2>
      </header>

      <div className="side-panel-body">
        <div className="library-group">
          <p className="library-hint">
            {canApply
              ? 'Drag onto a cut, or click to change the selected transition.'
              : 'Drag one onto the join between two clips in the timeline.'}
          </p>
          <div className="library-grid">
            {TRANSITION_TYPES.map((entry) => (
              <button
                key={entry.type}
                type="button"
                draggable
                className={`library-card${selectedType === entry.type ? ' active' : ''}`}
                title={entry.description}
                onDragStart={(event) => {
                  event.dataTransfer.setData(TRANSITION_DRAG_TYPE, entry.type)
                  event.dataTransfer.effectAllowed = 'copy'
                }}
                onClick={() => onApply(entry.type)}
              >
                <span className="library-card-name">{entry.label}</span>
                <span className="library-card-desc">{entry.description}</span>
              </button>
            ))}
          </div>
        </div>
      </div>
    </section>
  )
}
