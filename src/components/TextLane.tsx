import { useRef, useState } from 'react'
import type { PointerEvent } from 'react'
import { clamp } from '../timeline.ts'
import { formatDuration } from '../format.ts'
import type { TextOverlay } from '../types.ts'

/** Pointer travel, in pixels, before a press on an item becomes a drag. */
const DRAG_THRESHOLD = 4

interface TextLaneProps {
  items: TextOverlay[]
  selectedItemId: string | null
  pixelsPerSecond: number
  maxEnd: number
  onSelectItem: (id: string | null) => void
  onMoveItem: (id: string, start: number) => void
  onTrimItem: (id: string, edge: 'in' | 'out', time: number) => void
}

export function TextLane({
  items,
  selectedItemId,
  pixelsPerSecond: pps,
  maxEnd,
  onSelectItem,
  onMoveItem,
  onTrimItem,
}: TextLaneProps) {
  const trackRef = useRef<HTMLDivElement>(null)
  const [dragGhost, setDragGhost] = useState<{ id: string; start: number } | null>(null)

  const beginItemMove = (event: PointerEvent<HTMLDivElement>, item: TextOverlay) => {
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
      const rawDesired = item.start + dx / pps
      const desired = rawDesired < 1.0 ? 0 : rawDesired
      liveStart = clamp(desired, 0, Math.max(0, maxEnd - item.duration))
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

  const beginTrim = (event: PointerEvent<HTMLDivElement>, item: TextOverlay, edge: 'in' | 'out') => {
    event.stopPropagation()
    if (event.button !== 0) return
    const element = event.currentTarget
    element.setPointerCapture(event.pointerId)
    const startX = event.clientX
    const startValue = edge === 'in' ? item.start : item.start + item.duration
    onSelectItem(item.id)

    const onMove = (move: globalThis.PointerEvent) =>
      onTrimItem(item.id, edge, startValue + (move.clientX - startX) / pps)
    const finish = () => {
      element.removeEventListener('pointermove', onMove)
      element.removeEventListener('pointerup', finish)
      element.removeEventListener('pointercancel', finish)
    }
    element.addEventListener('pointermove', onMove)
    element.addEventListener('pointerup', finish)
    element.addEventListener('pointercancel', finish)
  }

  return (
    <div
      className="track text-track"
      ref={trackRef}
      aria-label="Text titles"
      onPointerDown={(event) => {
        if (event.target === event.currentTarget) onSelectItem(null)
      }}
    >
      {items.length === 0 && (
        <p className="empty track-hint">Click &ldquo;+ Title&rdquo; to add a text overlay.</p>
      )}
      {items.map((item) => {
        const ghost = dragGhost?.id === item.id ? dragGhost.start : null
        const left = (ghost ?? item.start) * pps
        return (
          <div
            key={item.id}
            className={`timeline-item text-item${item.id === selectedItemId ? ' selected' : ''}${ghost !== null ? ' dragging' : ''}`}
            style={{ left, width: item.duration * pps }}
            title={`${item.text} · ${formatDuration(item.duration)}`}
            onPointerDown={(event) => beginItemMove(event, item)}
          >
            <span className="item-label">
              <span className="text-badge" aria-hidden="true">T</span>
              {item.text || 'Untitled'}
            </span>
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
    </div>
  )
}

