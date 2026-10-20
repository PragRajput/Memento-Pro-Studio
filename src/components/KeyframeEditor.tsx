import {
  ANIMATABLE_PROPERTIES,
  EASING_LABELS,
  PROPERTY_DEFAULTS,
  evaluateTrack,
} from '../keyframes.ts'
import type { PropertyMeta } from '../keyframes.ts'
import type { AnimatableProperty, EasingType, Keyframe, KeyframeTracks } from '../types.ts'

const EASINGS: readonly EasingType[] = ['linear', 'ease-in', 'ease-out', 'ease-in-out', 'hold']

export interface KeyframeEditorProps {
  tracks: KeyframeTracks | undefined
  /** Static values, used wherever a property has no keyframes. */
  statics: Partial<Record<AnimatableProperty, number | undefined>>
  /** Playhead position in seconds from the start of the item being edited. */
  localTime: number
  /** Length of the item, so keyframe markers can be placed proportionally. */
  itemLength: number
  /** Which properties this item can animate. */
  properties?: readonly AnimatableProperty[]
  onSetStatic: (property: AnimatableProperty, value: number) => void
  onAddKeyframe: (property: AnimatableProperty, value: number) => void
  onRemoveKeyframe: (property: AnimatableProperty, keyframeId: string) => void
  onChangeEasing: (property: AnimatableProperty, keyframeId: string, easing: EasingType) => void
  onClearTrack: (property: AnimatableProperty) => void
  onSeekTo: (localTime: number) => void
}

function formatValue(meta: PropertyMeta, value: number): string {
  const shown = value * meta.display
  const decimals = meta.display === 100 ? 0 : Math.abs(shown) < 10 ? 1 : 0
  return `${shown.toFixed(decimals)}${meta.unit}`
}

/** Value a property shows right now: the animated one if keyed, else the static one. */
function currentValue(
  meta: PropertyMeta,
  tracks: KeyframeTracks | undefined,
  statics: KeyframeEditorProps['statics'],
  localTime: number,
): number {
  const fallback = statics[meta.id] ?? PROPERTY_DEFAULTS[meta.id]
  return evaluateTrack(tracks?.[meta.id], localTime, fallback)
}

/**
 * Per-property animation controls: a value slider that writes either the static
 * value or a keyframe, plus a lane of keyframe markers for the selected item.
 */
export function KeyframeEditor({
  tracks,
  statics,
  localTime,
  itemLength,
  properties,
  onSetStatic,
  onAddKeyframe,
  onRemoveKeyframe,
  onChangeEasing,
  onClearTrack,
  onSeekTo,
}: KeyframeEditorProps) {
  const shown = ANIMATABLE_PROPERTIES.filter(
    (meta) => properties === undefined || properties.includes(meta.id),
  )
  const safeLength = itemLength > 0 ? itemLength : 1

  return (
    <div className="keyframe-editor">
      <div className="keyframe-editor-head">
        <span className="keyframe-editor-title">Animation</span>
        <span className="keyframe-editor-time">{localTime.toFixed(2)}s</span>
      </div>

      {shown.map((meta) => {
        const frames = tracks?.[meta.id] ?? []
        const animated = frames.length > 0
        const value = currentValue(meta, tracks, statics, localTime)
        const atPlayhead = frames.find((frame) => Math.abs(frame.time - localTime) < 0.05)

        return (
          <div key={meta.id} className={`keyframe-row${animated ? ' is-animated' : ''}`}>
            <div className="keyframe-row-head">
              <button
                type="button"
                className={`keyframe-toggle${atPlayhead ? ' is-keyed' : ''}`}
                title={
                  atPlayhead
                    ? `Remove the ${meta.name} keyframe at the playhead`
                    : `Add a ${meta.name} keyframe at the playhead`
                }
                aria-label={
                  atPlayhead ? `Remove ${meta.name} keyframe` : `Add ${meta.name} keyframe`
                }
                onClick={() =>
                  atPlayhead
                    ? onRemoveKeyframe(meta.id, atPlayhead.id)
                    : onAddKeyframe(meta.id, value)
                }
              >
                ◆
              </button>
              <label className="keyframe-name" htmlFor={`kf-${meta.id}`}>
                {meta.name}
              </label>
              <span className="keyframe-value">{formatValue(meta, value)}</span>
              {animated && (
                <button
                  type="button"
                  className="keyframe-clear"
                  title={`Remove every ${meta.name} keyframe`}
                  onClick={() => onClearTrack(meta.id)}
                >
                  reset
                </button>
              )}
            </div>

            <input
              id={`kf-${meta.id}`}
              type="range"
              min={meta.min}
              max={meta.max}
              step={meta.step}
              value={value}
              onChange={(event) => {
                const next = Number(event.target.value)
                // Once a property is animated, dragging writes a keyframe at the
                // playhead instead of a static value, as editors conventionally do.
                if (animated) onAddKeyframe(meta.id, next)
                else onSetStatic(meta.id, next)
              }}
            />

            {animated && (
              <div className="keyframe-lane">
                <div className="keyframe-lane-track">
                  {frames.map((frame) => (
                    <KeyframeMarker
                      key={frame.id}
                      frame={frame}
                      property={meta.id}
                      leftPercent={(frame.time / safeLength) * 100}
                      onSeekTo={onSeekTo}
                      onRemove={onRemoveKeyframe}
                      onChangeEasing={onChangeEasing}
                    />
                  ))}
                  <div
                    className="keyframe-lane-playhead"
                    style={{ left: `${Math.min(100, Math.max(0, (localTime / safeLength) * 100))}%` }}
                  />
                </div>
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}

function KeyframeMarker({
  frame,
  property,
  leftPercent,
  onSeekTo,
  onRemove,
  onChangeEasing,
}: {
  frame: Keyframe
  property: AnimatableProperty
  leftPercent: number
  onSeekTo: (localTime: number) => void
  onRemove: (property: AnimatableProperty, keyframeId: string) => void
  onChangeEasing: (property: AnimatableProperty, keyframeId: string, easing: EasingType) => void
}) {
  return (
    <span
      className="keyframe-marker"
      style={{ left: `${Math.min(100, Math.max(0, leftPercent))}%` }}
      title={`${frame.time.toFixed(2)}s · ${EASING_LABELS[frame.easing]} — click to jump, double-click to delete`}
    >
      <button
        type="button"
        className="keyframe-marker-dot"
        aria-label={`Keyframe at ${frame.time.toFixed(2)} seconds`}
        onClick={() => onSeekTo(frame.time)}
        onDoubleClick={() => onRemove(property, frame.id)}
      />
      <select
        className="keyframe-marker-easing"
        value={frame.easing}
        aria-label="Easing"
        onChange={(event) => onChangeEasing(property, frame.id, event.target.value as EasingType)}
      >
        {EASINGS.map((easing) => (
          <option key={easing} value={easing}>
            {EASING_LABELS[easing]}
          </option>
        ))}
      </select>
    </span>
  )
}
