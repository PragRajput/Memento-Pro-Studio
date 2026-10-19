import { useEffect, useMemo, useRef, useState } from 'react'
import type { DragEvent, PointerEvent } from 'react'
import { AUDIO_EFFECT_PRESETS } from '../audioEffects.ts'
import { clampAudioStart } from '../audioTimeline.ts'
import { AUDIO_DRAG_TYPE } from '../dnd.ts'
import { formatDuration } from '../format.ts'
import { extractAudioPeaks, generateFallbackPeaks } from '../media.ts'
import { itemLength } from '../timeline.ts'
import type { AudioClip, AudioTimelineItem } from '../types.ts'

/** Pointer travel, in pixels, before a press on an item becomes a drag. */
const DRAG_THRESHOLD = 4

interface AudioWaveformProps {
  clip?: AudioClip
  item: AudioTimelineItem
  pixelsPerSecond: number
}

const AUDIO_LANE_HEIGHT = 54
const AUDIO_LANE_CENTER_Y = AUDIO_LANE_HEIGHT / 2

function AudioWaveform({ clip, item, pixelsPerSecond: pps }: AudioWaveformProps) {
  const width = Math.max(2, itemLength(item) * pps)

  // Live analysis state for immediate backfill if clip hasn't been analyzed yet
  const [liveData, setLiveData] = useState<{ peaks: number[]; pitches: number[] } | null>(null)

  useEffect(() => {
    if (clip?.peaks && clip.peaks.length > 0 && clip.pitches && clip.pitches.length > 0) {
      return
    }
    if (!clip?.file) return
    let cancelled = false
    void extractAudioPeaks(clip.file, 600)
      .then((data) => {
        if (!cancelled) setLiveData(data)
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [clip?.file, clip?.peaks, clip?.pitches])

  const pathD = useMemo(() => {
    const peaks = (clip?.peaks && clip.peaks.length > 0) ? clip.peaks : liveData?.peaks
    const pitches = (clip?.pitches && clip.pitches.length > 0) ? clip.pitches : liveData?.pitches
    const hasData = Boolean(peaks && peaks.length > 0)
    const fallback = hasData ? null : generateFallbackPeaks(300, clip?.name ?? 'audio')
    const finalPeaks = hasData ? peaks! : fallback!.peaks
    const finalPitches = pitches && pitches.length > 0 ? pitches : (fallback?.pitches ?? finalPeaks)

    const barStep = 3 // 3px per bar
    const barCount = Math.floor(width / barStep)
    if (barCount <= 0) return ''

    const clipDuration = clip?.duration && clip.duration > 0 ? clip.duration : (item.outPoint || 1)
    // Scale max amplitude subtly with item volume (keep minimum baseline so the waveform remains visible)
    const volScale = Math.max(0.25, Math.min(1, item.volume))
    const maxAmplitude = 21 * volScale

    let d = ''
    for (let i = 0; i < barCount; i++) {
      const x = i * barStep + 1.5
      const sourceTime = item.inPoint + x / pps
      const clipRatio = Math.max(0, Math.min(1, sourceTime / clipDuration))
      const idx = Math.min(finalPeaks.length - 1, Math.max(0, Math.floor(clipRatio * finalPeaks.length)))
      const peakVal = finalPeaks[idx] ?? 0.1
      const pitchVal = finalPitches[idx] ?? 0.5

      // Pitch shapes the upper contour while bass/power anchors the lower contour
      const topHalf = Math.max(1.5, (0.45 * peakVal + 0.55 * peakVal * pitchVal * 1.5) * maxAmplitude)
      const bottomHalf = Math.max(1.5, (0.65 * peakVal + 0.35 * peakVal * (1 - pitchVal * 0.6)) * maxAmplitude)

      const y1 = (AUDIO_LANE_CENTER_Y - topHalf).toFixed(1)
      const y2 = (AUDIO_LANE_CENTER_Y + bottomHalf).toFixed(1)
      d += `M${x.toFixed(1)} ${y1}V${y2} `
    }
    return d
  }, [liveData, clip, item.inPoint, item.outPoint, item.volume, width, pps])

  const gradId = `audio-grad-${item.id}`

  return (
    <svg
      className="audio-waveform-svg"
      viewBox={`0 0 ${width} ${AUDIO_LANE_HEIGHT}`}
      preserveAspectRatio="none"
      aria-hidden="true"
    >
      <defs>
        <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#38bdf8" />
          <stop offset="30%" stopColor="#34d399" />
          <stop offset="50%" stopColor="#10b981" />
          <stop offset="70%" stopColor="#34d399" />
          <stop offset="100%" stopColor="#059669" />
        </linearGradient>
      </defs>
      <line
        x1={0}
        y1={AUDIO_LANE_CENTER_Y}
        x2={width}
        y2={AUDIO_LANE_CENTER_Y}
        className="audio-waveform-centerline"
      />
      <path d={pathD} className="audio-waveform-path" stroke={`url(#${gradId})`} />
    </svg>
  )
}

interface AudioLaneProps {
  items: AudioTimelineItem[]
  clips: ReadonlyMap<string, AudioClip>
  selectedItemId: string | null
  pixelsPerSecond: number
  /** Audio may not extend past the video track's own length. */
  maxEnd: number
  trackIndex?: number
  trackLabel?: string
  canRemoveTrack?: boolean
  onRemoveTrack?: (trackIndex: number) => void
  onSelectItem: (id: string | null) => void
  onAddClip: (clipId: string, desiredStart: number, trackIndex: number) => void
  onMoveItem: (id: string, start: number) => void
  onTrimItem: (id: string, edge: 'in' | 'out', sourceTime: number) => void
  onVolumeChange: (id: string, volume: number) => void
}

export function AudioLane({
  items,
  clips,
  selectedItemId,
  pixelsPerSecond: pps,
  maxEnd,
  trackIndex = 0,
  trackLabel,
  canRemoveTrack,
  onRemoveTrack,
  onSelectItem,
  onAddClip,
  onMoveItem,
  onTrimItem,
  onVolumeChange,
}: AudioLaneProps) {
  const trackRef = useRef<HTMLDivElement>(null)
  const [dropMarker, setDropMarker] = useState<number | null>(null)
  const [dragGhost, setDragGhost] = useState<{ id: string; start: number } | null>(null)

  const laneItems = items.filter((item) => (item.trackIndex ?? 0) === trackIndex)

  const trackTime = (clientX: number) =>
    (clientX - (trackRef.current?.getBoundingClientRect().left ?? 0)) / pps

  const handleDragOver = (event: DragEvent<HTMLDivElement>) => {
    if (!event.dataTransfer.types.includes(AUDIO_DRAG_TYPE)) return
    event.preventDefault()
    event.stopPropagation()
    event.dataTransfer.dropEffect = 'copy'
    const rawTime = Math.max(0, trackTime(event.clientX))
    const snappedTime = rawTime < 1.5 ? 0 : rawTime
    setDropMarker(snappedTime)
  }

  const handleDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault()
    event.stopPropagation()
    const clipId = event.dataTransfer.getData(AUDIO_DRAG_TYPE)
    setDropMarker(null)
    if (!clipId) return
    const rawTime = Math.max(0, trackTime(event.clientX))
    const snappedTime = rawTime < 1.5 ? 0 : rawTime
    onAddClip(clipId, snappedTime, trackIndex)
  }

  /** Press on an item: a click selects it, a drag repositions it (collision-clamped live). */
  const beginItemMove = (event: PointerEvent<HTMLDivElement>, item: AudioTimelineItem) => {
    if (event.button !== 0) return
    const element = event.currentTarget
    element.setPointerCapture(event.pointerId)
    const startX = event.clientX
    const length = itemLength(item)
    let moved = false
    let liveStart = item.start

    const onMove = (move: globalThis.PointerEvent) => {
      const dx = move.clientX - startX
      if (!moved && Math.abs(dx) < DRAG_THRESHOLD) return
      moved = true
      const rawDesired = item.start + dx / pps
      const desired = rawDesired < 1.5 ? 0 : rawDesired
      liveStart = clampAudioStart(items, item.id, desired, length, maxEnd, trackIndex) ?? item.start
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

  const beginTrim = (event: PointerEvent<HTMLDivElement>, item: AudioTimelineItem, edge: 'in' | 'out') => {
    event.stopPropagation()
    if (event.button !== 0) return
    const element = event.currentTarget
    element.setPointerCapture(event.pointerId)
    const startX = event.clientX
    const startValue = edge === 'in' ? item.inPoint : item.outPoint
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

  const label = trackLabel ?? `A${trackIndex + 1}`

  return (
    <div
      className="track audio-track"
      ref={trackRef}
      aria-label={`Audio Track ${trackIndex + 1}`}
      onPointerDown={(event) => {
        if (event.target === event.currentTarget) onSelectItem(null)
      }}
      onDragOver={handleDragOver}
      onDragLeave={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setDropMarker(null)
      }}
      onDrop={handleDrop}
    >
      <div className="track-badge audio-badge" title={`Audio Track ${trackIndex + 1}`}>
        <span>{label}</span>
        {canRemoveTrack && onRemoveTrack && laneItems.length === 0 && (
          <button
            type="button"
            className="remove-track-btn"
            title={`Remove ${label}`}
            onClick={(e) => {
              e.stopPropagation()
              onRemoveTrack(trackIndex)
            }}
          >
            ×
          </button>
        )}
      </div>
      {laneItems.length === 0 && (
        <p className="empty track-hint">Drag audio here for {label} (parallel playback supported).</p>
      )}
      {laneItems.map((item) => {
        const clip = clips.get(item.clipId)
        const ghost = dragGhost?.id === item.id ? dragGhost.start : null
        const left = (ghost ?? item.start) * pps
        const volPercent = Math.round(item.volume * 100)
        return (
          <div
            key={item.id}
            className={`timeline-item audio-item${item.id === selectedItemId ? ' selected' : ''}${ghost !== null ? ' dragging' : ''}`}
            style={{ left, width: itemLength(item) * pps }}
            title={`${clip?.name ?? 'Missing clip'} · Vol: ${volPercent}% · ${formatDuration(itemLength(item))}`}
            onPointerDown={(event) => beginItemMove(event, item)}
          >
            <AudioWaveform clip={clip} item={item} pixelsPerSecond={pps} />
            <span className="item-label">
              <span className="audio-badge-mini" aria-hidden="true">♪</span>
              {clip?.name}
              {item.effect && item.effect !== 'none' && (
                <span className="audio-effect-badge-mini" title={`Audio Effect: ${item.effect}`}>
                  {AUDIO_EFFECT_PRESETS.find((p) => p.id === item.effect)?.icon ?? '🎛️'}
                </span>
              )}
              {item.speed && item.speed !== 1 && (
                <span className="audio-speed-badge-mini" title={`Playback Speed: ${item.speed}x`}>
                  {item.speed}x
                </span>
              )}
            </span>
            <div className="audio-item-controls" onPointerDown={(event) => event.stopPropagation()}>
              <button
                type="button"
                className="volume-toggle-btn"
                title={item.volume === 0 ? 'Click to unmute' : 'Click to mute'}
                onClick={() => onVolumeChange(item.id, item.volume === 0 ? 1 : 0)}
              >
                {item.volume === 0 ? '🔇' : '🔊'} {volPercent}%
              </button>
              <input
                type="range"
                className="volume-slider"
                aria-label="Volume"
                min={0}
                max={1}
                step={0.01}
                value={item.volume}
                onChange={(event) => onVolumeChange(item.id, Number(event.target.value))}
              />
            </div>
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
