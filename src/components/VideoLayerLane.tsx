import { useRef, useState } from 'react'
import type { DragEvent, PointerEvent } from 'react'
import { CLIP_DRAG_TYPE } from '../dnd.ts'
import { formatDuration } from '../format.ts'
import { keyframeTimes } from '../keyframes.ts'
import { itemLength } from '../timeline.ts'
import { videoLayerName } from '../videoLayers.ts'
import type { MediaClip, VideoLayerItem } from '../types.ts'

const DRAG_THRESHOLD = 4

interface VideoLayerLaneProps {
  trackIndex: number
  items: VideoLayerItem[]
  clips: ReadonlyMap<string, MediaClip>
  selectedItemId: string | null
  pixelsPerSecond: number
  onSelectItem: (id: string | null) => void
  onMoveItem: (id: string, start: number, trackIndex?: number) => void
  onTrimItem: (id: string, edge: 'in' | 'out', sourceTime: number) => void
  onAddClip: (clipId: string, trackIndex: number, start: number) => void
  onRemoveLane?: (trackIndex: number) => void
}

/** One video layer above the base track: freely positioned clips that composite over V1. */
export function VideoLayerLane({
  trackIndex,
  items,
  clips,
  selectedItemId,
  pixelsPerSecond: pps,
  onSelectItem,
  onMoveItem,
  onTrimItem,
  onAddClip,
  onRemoveLane,
}: VideoLayerLaneProps) {
  const trackRef = useRef<HTMLDivElement>(null)
  const [dragGhost, setDragGhost] = useState<{ id: string; start: number } | null>(null)
  const [dropMarker, setDropMarker] = useState<number | null>(null)

  const laneItems = items.filter((item) => item.trackIndex === trackIndex)
  const name = videoLayerName(trackIndex)

  const trackTime = (clientX: number) =>
    Math.max(0, (clientX - (trackRef.current?.getBoundingClientRect().left ?? 0)) / pps)

  const handleDragOver = (event: DragEvent<HTMLDivElement>) => {
    if (!event.dataTransfer.types.includes(CLIP_DRAG_TYPE)) return
    event.preventDefault()
    event.stopPropagation()
    event.dataTransfer.dropEffect = 'copy'
    const time = trackTime(event.clientX)
    setDropMarker(time < 1 ? 0 : time)
  }

  const handleDrop = (event: DragEvent<HTMLDivElement>) => {
    setDropMarker(null)
    if (!event.dataTransfer.types.includes(CLIP_DRAG_TYPE)) return
    event.preventDefault()
    event.stopPropagation()
    const clipId = event.dataTransfer.getData(CLIP_DRAG_TYPE)
    if (!clipId) return
    const time = trackTime(event.clientX)
    onAddClip(clipId, trackIndex, time < 1 ? 0 : time)
  }

  const beginItemMove = (event: PointerEvent<HTMLDivElement>, item: VideoLayerItem) => {
    if (event.button !== 0) return
    const element = event.currentTarget
    element.setPointerCapture(event.pointerId)
    const startX = event.clientX
    let moved = false
    let liveStart = item.start

    const onMove = (move: globalThis.PointerEvent) => {
      const dx = move.clientX - startX
      if (!moved && Math.abs(dx) < DRAG_THRESHOLD) return
      moved = true
      const desired = item.start + dx / pps
      liveStart = Math.max(0, desired < 1 ? 0 : desired)
      setDragGhost({ id: item.id, start: liveStart })
    }

    const finish = (commit: boolean) => {
      element.removeEventListener('pointermove', onMove)
      element.removeEventListener('pointerup', onUp)
      element.removeEventListener('pointercancel', onCancel)
      setDragGhost(null)
      if (!commit) return
      if (!moved) onSelectItem(item.id)
      else if (liveStart !== item.start) onMoveItem(item.id, liveStart)
    }

    const onUp = () => finish(true)
    const onCancel = () => finish(false)
    element.addEventListener('pointermove', onMove)
    element.addEventListener('pointerup', onUp)
    element.addEventListener('pointercancel', onCancel)
  }

  const beginTrim = (
    event: PointerEvent<HTMLDivElement>,
    item: VideoLayerItem,
    edge: 'in' | 'out',
  ) => {
    if (event.button !== 0) return
    event.stopPropagation()
    const handle = event.currentTarget
    handle.setPointerCapture(event.pointerId)
    const speed = item.speed ?? 1

    const onMove = (move: globalThis.PointerEvent) => {
      // Both edges are expressed as a point in the source, which is where the
      // dragged edge now sits on the timeline mapped back through the speed.
      onTrimItem(item.id, edge, item.inPoint + (trackTime(move.clientX) - item.start) * speed)
    }

    const finish = () => {
      handle.removeEventListener('pointermove', onMove)
      handle.removeEventListener('pointerup', finish)
      handle.removeEventListener('pointercancel', finish)
    }

    handle.addEventListener('pointermove', onMove)
    handle.addEventListener('pointerup', finish)
    handle.addEventListener('pointercancel', finish)
  }

  return (
    <div
      className="track video-layer-track"
      ref={trackRef}
      aria-label={`Video Layer ${name}`}
      onPointerDown={(event) => {
        if (event.target === event.currentTarget) onSelectItem(null)
      }}
      onDragOver={handleDragOver}
      onDragLeave={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setDropMarker(null)
      }}
      onDrop={handleDrop}
    >
      <div className="track-badge video-layer-badge" title={`Video Layer ${name}`}>
        <span>{name}</span>
        {onRemoveLane && laneItems.length === 0 && (
          <button
            type="button"
            className="track-badge-remove"
            title={`Remove layer ${name}`}
            aria-label={`Remove layer ${name}`}
            onClick={() => onRemoveLane(trackIndex)}
          >
            ×
          </button>
        )}
      </div>

      {laneItems.length === 0 && (
        <p className="empty track-hint">Drop a clip here to composite it over V1.</p>
      )}

      {laneItems.map((item) => {
        const clip = clips.get(item.clipId)
        const ghost = dragGhost?.id === item.id ? dragGhost.start : null
        const length = itemLength(item)
        const left = (ghost ?? item.start) * pps
        const width = length * pps
        const marks = keyframeTimes(item.keyframes)

        return (
          <div
            key={item.id}
            className={`timeline-item video-layer-item${item.id === selectedItemId ? ' selected' : ''}${ghost !== null ? ' dragging' : ''}`}
            style={{ left, width }}
            title={`${clip?.name ?? 'Clip'} · ${formatDuration(length)}${marks.length > 0 ? ` · ${marks.length} keyframes` : ''}`}
            onPointerDown={(event) => beginItemMove(event, item)}
          >
            {clip?.thumbnail && (
              <img className="item-thumb" src={clip.thumbnail} alt="" draggable={false} />
            )}
            <span className="item-label">{clip?.name ?? 'Clip'}</span>

            {marks.length > 0 && (
              <div className="item-keyframes" aria-hidden="true">
                {marks.map((time) => (
                  <span
                    key={time}
                    className="item-keyframe-dot"
                    style={{ left: `${Math.min(100, (time / (length || 1)) * 100)}%` }}
                  />
                ))}
              </div>
            )}

            <div
              className="trim-handle in"
              aria-label="Trim start"
              onPointerDown={(event) => beginTrim(event, item, 'in')}
            />
            <div
              className="trim-handle out"
              aria-label="Trim end"
              onPointerDown={(event) => beginTrim(event, item, 'out')}
            />
          </div>
        )
      })}

      {dropMarker !== null && <div className="drop-marker" style={{ left: dropMarker * pps }} />}
    </div>
  )
}
