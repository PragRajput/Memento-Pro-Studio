import { AUDIO_EFFECT_PRESETS } from '../audioEffects.ts'
import { AUDIO_EFFECT_DRAG_TYPE, FILTER_DRAG_TYPE } from '../dnd.ts'
import { FILTER_PRESETS } from '../filters.ts'
import type { AudioEffectType, FilterType } from '../types.ts'

interface EffectsPanelProps {
  /** Applied on click; null when nothing that takes a look is selected. */
  selectedClipFilter: FilterType | null
  selectedAudioEffect: AudioEffectType | null
  onApplyFilter: (filter: FilterType) => void
  onApplyAudioEffect: (effect: AudioEffectType) => void
}

/**
 * A browsable library of looks and audio effects. Drag one onto a clip in the
 * timeline, or click to apply it to the current selection — the inspectors can
 * only be reached once something is already selected, which made these hard to
 * find at all.
 */
export function EffectsPanel({
  selectedClipFilter,
  selectedAudioEffect,
  onApplyFilter,
  onApplyAudioEffect,
}: EffectsPanelProps) {
  return (
    <section className="panel side-panel" aria-label="Effects">
      <header className="panel-header">
        <h2 className="panel-title">Effects</h2>
      </header>

      <div className="side-panel-body">
        <div className="library-group">
          <div className="library-group-head">
            <span className="library-group-title">Colour Looks</span>
            <span className="library-group-count">{FILTER_PRESETS.length}</span>
          </div>
          <p className="library-hint">Drag onto a clip, or click to apply to the selected clip.</p>
          <div className="library-grid">
            {FILTER_PRESETS.map((preset) => (
              <button
                key={preset.id}
                type="button"
                draggable
                className={`library-card${selectedClipFilter === preset.id ? ' active' : ''}`}
                title={preset.description}
                onDragStart={(event) => {
                  event.dataTransfer.setData(FILTER_DRAG_TYPE, preset.id)
                  event.dataTransfer.effectAllowed = 'copy'
                }}
                onClick={() => onApplyFilter(preset.id)}
              >
                <span className="library-card-name">{preset.name}</span>
                <span className="library-card-desc">{preset.description}</span>
              </button>
            ))}
          </div>
        </div>

        <div className="library-group">
          <div className="library-group-head">
            <span className="library-group-title">Audio Effects</span>
            <span className="library-group-count">{AUDIO_EFFECT_PRESETS.length}</span>
          </div>
          <p className="library-hint">Drag onto an audio clip, or click to apply to the selection.</p>
          <div className="library-grid">
            {AUDIO_EFFECT_PRESETS.map((preset) => (
              <button
                key={preset.id}
                type="button"
                draggable
                className={`library-card${selectedAudioEffect === preset.id ? ' active' : ''}`}
                title={preset.description}
                onDragStart={(event) => {
                  event.dataTransfer.setData(AUDIO_EFFECT_DRAG_TYPE, preset.id)
                  event.dataTransfer.effectAllowed = 'copy'
                }}
                onClick={() => onApplyAudioEffect(preset.id)}
              >
                <span className="library-card-name">{preset.name}</span>
                <span className="library-card-desc">{preset.description}</span>
              </button>
            ))}
          </div>
        </div>
      </div>
    </section>
  )
}
