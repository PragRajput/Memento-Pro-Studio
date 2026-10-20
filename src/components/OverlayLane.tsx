import { useRef, useState } from 'react'
import type { DragEvent, PointerEvent } from 'react'
import { CLIP_DRAG_TYPE } from '../dnd.ts'
import { formatDuration } from '../format.ts'
import { VFX_OVERLAY_PRESETS } from '../overlayDraw.ts'
import { clamp } from '../timeline.ts'
import type { MediaClip, OverlayItem } from '../types.ts'

const DRAG_THRESHOLD = 4

interface OverlayLaneProps {
  items: OverlayItem[]
  mediaClips: ReadonlyMap<string, MediaClip>
  selectedItemId: string | null
  pixelsPerSecond: number
  maxEnd: number
  onSelectItem: (id: string | null) => void
  onMoveItem: (id: string, start: number) => void
  onTrimItem: (id: string, edge: 'in' | 'out', time: number) => void
  onAddMediaOverlay?: (clipId: string, start: number) => void
}

export function OverlayLane({
  items,
  mediaClips,
  selectedItemId,
  pixelsPerSecond: pps,
  maxEnd,
  onSelectItem,
  onMoveItem,
  onTrimItem,
  onAddMediaOverlay,
}: OverlayLaneProps) {
  const trackRef = useRef<HTMLDivElement>(null)
  const [dragGhost, setDragGhost] = useState<{ id: string; start: number } | null>(null)
  const [dropMarker, setDropMarker] = useState<number | null>(null)

  const trackTime = (clientX: number) =>
    (clientX - (trackRef.current?.getBoundingClientRect().left ?? 0)) / pps

  const handleDragOver = (event: DragEvent<HTMLDivElement>) => {
    if (!event.dataTransfer.types.includes(CLIP_DRAG_TYPE)) return
    event.preventDefault()
    event.stopPropagation()
    event.dataTransfer.dropEffect = 'copy'
    const rawTime = Math.max(0, trackTime(event.clientX))
    const snappedTime = rawTime < 1.0 ? 0 : rawTime
    setDropMarker(Math.min(snappedTime, maxEnd))
  }

  const handleDragLeave = (event: DragEvent<HTMLDivElement>) => {
    if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
      setDropMarker(null)
    }
  }

  const handleDrop = (event: DragEvent<HTMLDivElement>) => {
    setDropMarker(null)
    if (!event.dataTransfer.types.includes(CLIP_DRAG_TYPE)) return
    event.preventDefault()
    event.stopPropagation()
    const clipId = event.dataTransfer.getData(CLIP_DRAG_TYPE)
    if (clipId && onAddMediaOverlay) {
      const rawTime = Math.max(0, trackTime(event.clientX))
      const snappedTime = rawTime < 1.0 ? 0 : rawTime
      onAddMediaOverlay(clipId, Math.min(snappedTime, maxEnd))
    }
  }

  const beginItemMove = (event: PointerEvent<HTMLDivElement>, item: OverlayItem) => {
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

  const beginTrim = (event: PointerEvent<HTMLDivElement>, item: OverlayItem, edge: 'in' | 'out') => {
    if (event.button !== 0) return
    event.stopPropagation()
    const handle = event.currentTarget
    handle.setPointerCapture(event.pointerId)
    const initialStart = item.start
    const initialDuration = item.duration

    const onMove = (move: globalThis.PointerEvent) => {
      const trackX = move.clientX - (trackRef.current?.getBoundingClientRect().left ?? 0)
      const targetTime = Math.max(0, trackX / pps)
      if (edge === 'in') {
        const clampedStart = clamp(targetTime, 0, initialStart + initialDuration - 0.2)
        onTrimItem(item.id, 'in', clampedStart)
      } else {
        const clampedDuration = Math.max(0.2, targetTime - initialStart)
        onTrimItem(item.id, 'out', initialStart + clampedDuration)
      }
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
      className="track overlay-track"
      ref={trackRef}
      aria-label="Overlay Track"
      onPointerDown={(event) => {
        if (event.target === event.currentTarget) onSelectItem(null)
      }}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      <div className="track-badge overlay-badge" title="Overlay Track (PiP, VFX, Lower Thirds, Color Tint)">
        <span>OV</span>
      </div>
      {items.length === 0 && (
        <p className="empty track-hint">
          Drop media clips here for Picture-in-Picture, or click &ldquo;+ Overlay&rdquo; for VFX &amp; lower thirds.
        </p>
      )}
      {items.map((item) => {
        const ghost = dragGhost?.id === item.id ? dragGhost.start : null
        const left = (ghost ?? item.start) * pps
        const width = item.duration * pps

        let label = 'Overlay'
        let icon = 'FX'
        if (item.category === 'media') {
          const clip = mediaClips.get(item.clipId ?? '')
          label = `PiP: ${clip?.name ?? 'Media'}`
          icon = 'PIP'
        } else if (item.category === 'vfx') {
          const preset = VFX_OVERLAY_PRESETS.find((p) => p.id === item.vfxType)
          label = preset?.name ?? 'Visual FX'
          icon = 'FX'
        } else if (item.category === 'lower-third') {
          label = item.title || 'Lower Third'
          icon = 'L3'
        } else if (item.category === 'color') {
          label = 'Color Tint'
          icon = 'COL'
        }

        return (
          <div
            key={item.id}
            className={`timeline-item overlay-item${item.id === selectedItemId ? ' selected' : ''}${ghost !== null ? ' dragging' : ''}`}
            style={{ left, width }}
            title={`${label} · ${formatDuration(item.duration)}`}
            onPointerDown={(event) => beginItemMove(event, item)}
          >
            <span className="item-label">
              <span className="overlay-badge-mini" aria-hidden="true">{icon}</span>
              {label}
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
      {dropMarker !== null && <div className="drop-marker" style={{ left: dropMarker * pps }} />}
    </div>
  )
}

