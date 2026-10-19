import { useEffect, useRef, useState } from 'react'
import type { DragEvent, PointerEvent, RefObject } from 'react'
import { AudioLane } from './AudioLane.tsx'
import { TextLane } from './TextLane.tsx'
import { AUDIO_DRAG_TYPE, CLIP_DRAG_TYPE } from '../dnd.ts'
import { formatDuration, formatTimecode } from '../format.ts'
import {
  clamp,
  insertionIndex,
  itemLength,
  itemStarts,
  reorderMarkerTime,
  reorderTarget,
} from '../timeline.ts'
import {
  findTransitionBetween,
  getEffectiveTransitionDuration,
} from '../transitionTimeline.ts'
import type {
  AudioClip,
  AudioTimelineItem,
  MediaClip,
  TextOverlay,
  TimelineItem,
  Transition,
  TransitionType,
} from '../types.ts'

/** Ruler label spacing candidates, in seconds; the first that leaves room for a label wins. */
const TICK_STEPS = [1, 2, 5, 10, 15, 30, 60, 120, 300, 600]
const MIN_TICK_SPACING = 70
/** Seconds of empty track shown after the last item. */
const TRAILING_SPACE = 5
/** Pointer travel, in pixels, before a press on an item becomes a drag. */
const DRAG_THRESHOLD = 4

interface TimelineProps {
  items: TimelineItem[]
  clips: ReadonlyMap<string, MediaClip>
  selectedItemId: string | null
  time: number
  duration: number
  playing: boolean
  canSplit: boolean
  pixelsPerSecond: number
  onZoom: (pixelsPerSecond: number) => void
  onSeek: (time: number) => void
  onTogglePlay: () => void
  onSplit: () => void
  onDelete: () => void
  onSelectItem: (id: string | null) => void
  onAddClip: (clipId: string, index: number) => void
  onMoveItem: (from: number, to: number) => void
  onTrimItem: (id: string, edge: 'in' | 'out', sourceTime: number) => void
  onToggleMute: (id: string) => void
  transitions?: Transition[]
  selectedTransitionId?: string | null
  onSelectTransition?: (id: string | null) => void
  onAddTransition?: (fromItemId: string, toItemId: string, type?: TransitionType) => void
  audioItems: AudioTimelineItem[]
  audioClips: ReadonlyMap<string, AudioClip>
  selectedAudioItemId: string | null
  audioTrackCount?: number
  onSelectAudioItem: (id: string | null) => void
  onAddAudioClip: (clipId: string, desiredStart?: number, trackIndex?: number) => void
  onMoveAudioItem: (id: string, start: number) => void
  onTrimAudioItem: (id: string, edge: 'in' | 'out', sourceTime: number) => void
  onAudioVolumeChange: (id: string, volume: number) => void
  onAddAudioTrack?: () => void
  onRemoveAudioTrack?: (trackIndex: number) => void
  textItems: TextOverlay[]
  selectedTextId: string | null
  onSelectTextItem: (id: string | null) => void
  onAddText: () => void
  onMoveTextItem: (id: string, start: number) => void
  onTrimTextItem: (id: string, edge: 'in' | 'out', time: number) => void
}

interface Reorder {
  id: string
  dx: number
  to: number
}

export function Timeline({
  items,
  clips,
  selectedItemId,
  time,
  duration,
  playing,
  canSplit,
  pixelsPerSecond: pps,
  onZoom,
  onSeek,
  onTogglePlay,
  onSplit,
  onDelete,
  onSelectItem,
  onAddClip,
  onMoveItem,
  onTrimItem,
  onToggleMute,
  transitions = [],
  selectedTransitionId = null,
  onSelectTransition,
  onAddTransition,
  audioItems,
  audioClips,
  selectedAudioItemId,
  audioTrackCount = 2,
  onSelectAudioItem,
  onAddAudioClip,
  onMoveAudioItem,
  onTrimAudioItem,
  onAudioVolumeChange,
  onAddAudioTrack,
  onRemoveAudioTrack,
  textItems,
  selectedTextId,
  onSelectTextItem,
  onAddText,
  onMoveTextItem,
  onTrimTextItem,
}: TimelineProps) {
  const scrollRef = useRef<HTMLDivElement>(null)
  const trackRef = useRef<HTMLDivElement>(null)
  const viewportWidth = useElementWidth(scrollRef)
  const [dropIndex, setDropIndex] = useState<number | null>(null)
  const [reorder, setReorder] = useState<Reorder | null>(null)
  const [isAddTrackDragOver, setIsAddTrackDragOver] = useState(false)

  const maxTrackInItems = audioItems.reduce((max, item) => Math.max(max, item.trackIndex ?? 0), 0)
  const trackCount = Math.max(audioTrackCount, maxTrackInItems + 1, 1)

  const starts = itemStarts(items)
  const contentWidth = Math.max(viewportWidth, (duration + TRAILING_SPACE) * pps)
  const playheadX = time * pps

  // Keep the playhead in view during playback.
  useEffect(() => {
    const scroller = scrollRef.current
    if (!playing || scroller === null) return
    if (playheadX > scroller.scrollLeft + scroller.clientWidth - 40 || playheadX < scroller.scrollLeft) {
      scroller.scrollLeft = Math.max(0, playheadX - 40)
    }
  }, [playing, playheadX])

  const trackTime = (clientX: number) =>
    (clientX - (trackRef.current?.getBoundingClientRect().left ?? 0)) / pps

  const seekFromPointer = (event: PointerEvent<HTMLDivElement>) => {
    const left = event.currentTarget.getBoundingClientRect().left
    onSeek(clamp((event.clientX - left) / pps, 0, duration))
  }

  const handleDragOver = (event: DragEvent<HTMLDivElement>) => {
    if (event.dataTransfer.types.includes(CLIP_DRAG_TYPE)) {
      event.preventDefault()
      event.stopPropagation()
      event.dataTransfer.dropEffect = 'copy'
      setDropIndex(insertionIndex(items, trackTime(event.clientX)))
      return
    }
    if (event.dataTransfer.types.includes(AUDIO_DRAG_TYPE)) {
      event.preventDefault()
      event.stopPropagation()
      event.dataTransfer.dropEffect = 'copy'
      return
    }
  }

  const handleDrop = (event: DragEvent<HTMLDivElement>) => {
    event.stopPropagation()
    if (event.dataTransfer.types.includes(AUDIO_DRAG_TYPE)) {
      const clipId = event.dataTransfer.getData(AUDIO_DRAG_TYPE)
      if (clipId) {
        event.preventDefault()
        const rawTime = Math.max(0, trackTime(event.clientX))
        const snappedTime = rawTime < 1.5 ? 0 : rawTime
        onAddAudioClip(clipId, snappedTime)
      }
      return
    }
    const clipId = event.dataTransfer.getData(CLIP_DRAG_TYPE)
    setDropIndex(null)
    if (!clipId) return
    event.preventDefault()
    onAddClip(clipId, insertionIndex(items, trackTime(event.clientX)))
  }


  /** Press on an item: a click selects it, a drag moves it to another position. */
  const beginItemDrag = (event: PointerEvent<HTMLDivElement>, index: number) => {
    if (event.button !== 0) return
    const element = event.currentTarget
    element.setPointerCapture(event.pointerId)
    const startX = event.clientX
    let moved = false
    let target = index

    const onMove = (move: globalThis.PointerEvent) => {
      const dx = move.clientX - startX
      if (!moved && Math.abs(dx) < DRAG_THRESHOLD) return
      moved = true
      target = reorderTarget(items, index, trackTime(move.clientX))
      setReorder({ id: items[index].id, dx, to: target })
    }
    const finish = (commit: boolean) => {
      element.removeEventListener('pointermove', onMove)
      element.removeEventListener('pointerup', onUp)
      element.removeEventListener('pointercancel', onCancel)
      setReorder(null)
      if (!commit) return
      if (!moved) onSelectItem(items[index].id)
      else if (target !== index) onMoveItem(index, target)
    }
    const onUp = () => finish(true)
    const onCancel = () => finish(false)
    element.addEventListener('pointermove', onMove)
    element.addEventListener('pointerup', onUp)
    element.addEventListener('pointercancel', onCancel)
  }

  /** Drag an item's edge to change where it starts or ends in its source. */
  const beginTrim = (event: PointerEvent<HTMLDivElement>, item: TimelineItem, edge: 'in' | 'out') => {
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

  const markerTime =
    reorder !== null
      ? reorderMarkerTime(items, items.findIndex((item) => item.id === reorder.id), reorder.to)
      : dropIndex !== null
        ? (starts[dropIndex] ?? duration)
        : null

  return (
    <section className="panel timeline" aria-label="Timeline">
      <header className="panel-header timeline-toolbar">
        <div className="timeline-title-area">
          <h2>Timeline</h2>
        </div>

        {/* Transport Controls */}
        <div className="transport-controls">
          <button
            type="button"
            className="transport-btn jump-btn"
            onClick={() => onSeek(0)}
            disabled={duration <= 0}
            title="Jump to Start (Home)"
          >
            ⏮
          </button>
          <button
            type="button"
            className={`transport-btn play-btn${playing ? ' is-playing' : ''}`}
            onClick={onTogglePlay}
            disabled={duration <= 0}
            title={`${playing ? 'Pause' : 'Play'} (Space)`}
          >
            <span className="play-icon">{playing ? '❚❚' : '▶'}</span>
            <span className="play-text">{playing ? 'Pause' : 'Play'}</span>
          </button>
          <div className="timecode-display" aria-label="Playhead time">
            <span className="tc-current">{formatTimecode(time)}</span>
            <span className="tc-divider">/</span>
            <span className="tc-total">{formatTimecode(duration)}</span>
          </div>
        </div>

        {/* Editing Tools */}
        <div className="timeline-action-tools">
          <button
            type="button"
            className="tool-btn split-btn"
            onClick={onSplit}
            disabled={!canSplit}
            title="Split selected or active clip at playhead (S)"
          >
            <span className="tool-icon">✂</span>
            <span>Split</span>
            <kbd className="key-shortcut">S</kbd>
          </button>
          <button
            type="button"
            className="tool-btn add-title-btn"
            onClick={onAddText}
            disabled={duration <= 0}
            title="Add a text title overlay at the playhead"
          >
            <span className="tool-icon">T</span>
            <span>+ Title</span>
          </button>
          <button
            type="button"
            className="tool-btn add-audio-track-btn"
            onClick={() => onAddAudioTrack?.()}
            title="Add another parallel audio track"
          >
            <span className="tool-icon">♪</span>
            <span>+ Audio Track</span>
          </button>
          <button
            type="button"
            className="tool-btn delete-tool-btn"
            onClick={onDelete}
            disabled={
              selectedItemId === null &&
              selectedAudioItemId === null &&
              selectedTextId === null &&
              selectedTransitionId === null
            }
            title="Delete selected item (Del / Backspace)"
          >
            <span className="tool-icon">🗑</span>
            <span>Delete</span>
            <kbd className="key-shortcut">Del</kbd>
          </button>
        </div>

        {/* Zoom Slider */}
        <div className="zoom-controls">
          <span className="zoom-icon" title="Zoom out">−</span>
          <input
            type="range"
            className="zoom-slider"
            min={10}
            max={200}
            value={pps}
            onChange={(event) => onZoom(Number(event.target.value))}
            title={`Zoom level: ${pps} px/sec`}
          />
          <span className="zoom-icon" title="Zoom in">+</span>
        </div>
      </header>

      <div className="timeline-scroll" ref={scrollRef}>
        <div
          className="timeline-content"
          style={{ width: contentWidth }}
          onDragOver={handleDragOver}
          onDrop={handleDrop}
        >
          <Ruler
            width={contentWidth}
            pixelsPerSecond={pps}
            onPointerDown={(event) => {
              event.currentTarget.setPointerCapture(event.pointerId)
              seekFromPointer(event)
            }}
            onPointerMove={(event) => {
              if (event.currentTarget.hasPointerCapture(event.pointerId)) seekFromPointer(event)
            }}
          />
          <TextLane
            items={textItems}
            selectedItemId={selectedTextId}
            pixelsPerSecond={pps}
            maxEnd={duration}
            onSelectItem={onSelectTextItem}
            onMoveItem={onMoveTextItem}
            onTrimItem={onTrimTextItem}
          />
          <div
            className="track video-track"
            ref={trackRef}
            aria-label="Video Track 1"
            onPointerDown={(event) => {
              if (event.target === event.currentTarget) {
                onSelectItem(null)
                onSelectTransition?.(null)
              }
            }}
            onDragOver={handleDragOver}
            onDragLeave={(event) => {
              if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setDropIndex(null)
            }}
            onDrop={handleDrop}
          >
            <div className="track-badge video-badge" title="Video Track 1">
              <span>V1</span>
            </div>
            {items.length === 0 && (
              <p className="empty track-hint">Drag clips here from Media, or click + on a clip.</p>
            )}
            {items.map((item, index) => {
              const clip = clips.get(item.clipId)
              const dragging = reorder?.id === item.id
              return (
                <div
                  key={item.id}
                  className={`timeline-item${item.id === selectedItemId ? ' selected' : ''}${dragging ? ' dragging' : ''}`}
                  style={{
                    left: starts[index] * pps,
                    width: itemLength(item) * pps,
                    backgroundImage: clip ? `url(${clip.thumbnail})` : undefined,
                    transform: dragging ? `translateX(${reorder.dx}px)` : undefined,
                  }}
                  title={`${clip?.name ?? 'Missing clip'} · ${formatDuration(itemLength(item))}`}
                  onPointerDown={(event) => beginItemDrag(event, index)}
                >
                  <span className="item-label">{clip?.name}</span>
                  <button
                    type="button"
                    className={`mute-toggle${item.muted ? ' muted' : ''}`}
                    aria-label={item.muted ? `Unmute ${clip?.name ?? 'clip'}` : `Mute ${clip?.name ?? 'clip'}`}
                    aria-pressed={item.muted}
                    onPointerDown={(event) => event.stopPropagation()}
                    onClick={() => onToggleMute(item.id)}
                  >
                    {item.muted ? '🔇' : '🔊'}
                  </button>
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
            {items.slice(0, -1).map((itemA, index) => {
              const itemB = items[index + 1]
              const cutTime = starts[index + 1]
              const cutX = cutTime * pps
              const transition = findTransitionBetween(transitions, itemA.id, itemB.id)
              const isSelected = transition !== undefined && selectedTransitionId === transition.id

              if (transition) {
                const effDuration = getEffectiveTransitionDuration(transition, itemA, itemB)
                const width = Math.max(34, effDuration * pps)
                const left = cutX - width / 2
                return (
                  <div
                    key={transition.id}
                    className={`transition-chip${isSelected ? ' selected' : ''}`}
                    style={{ left, width }}
                    title={`${transition.type} (${effDuration.toFixed(1)}s) - click to configure`}
                    onClick={(e) => {
                      e.stopPropagation()
                      onSelectItem(null)
                      onSelectAudioItem(null)
                      onSelectTextItem(null)
                      onSelectTransition?.(transition.id)
                    }}
                    onPointerDown={(e) => e.stopPropagation()}
                  >
                    <span className="transition-icon">⧉</span>
                    <span className="transition-name">
                      {transition.type === 'crossfade' ? 'Dissolve' : transition.type === 'fade-black' ? 'Dip' : 'Wipe'}
                    </span>
                  </div>
                )
              }

              return (
                <button
                  key={`cut-${itemA.id}-${itemB.id}`}
                  type="button"
                  className="add-transition-cut-btn"
                  style={{ left: cutX }}
                  title="Add transition between clips"
                  onClick={(e) => {
                    e.stopPropagation()
                    onAddTransition?.(itemA.id, itemB.id)
                  }}
                  onPointerDown={(e) => e.stopPropagation()}
                >
                  ⧉
                </button>
              )
            })}
            {markerTime !== null && <div className="drop-marker" style={{ left: markerTime * pps }} />}
          </div>
          {Array.from({ length: trackCount }, (_, tIndex) => (
            <AudioLane
              key={tIndex}
              items={audioItems}
              clips={audioClips}
              selectedItemId={selectedAudioItemId}
              pixelsPerSecond={pps}
              maxEnd={duration}
              trackIndex={tIndex}
              trackLabel={`A${tIndex + 1}`}
              canRemoveTrack={trackCount > 1}
              onRemoveTrack={onRemoveAudioTrack}
              onSelectItem={onSelectAudioItem}
              onAddClip={(clipId, start) => onAddAudioClip(clipId, start, tIndex)}
              onMoveItem={onMoveAudioItem}
              onTrimItem={onTrimAudioItem}
              onVolumeChange={onAudioVolumeChange}
            />
          ))}
          <div
            className={`add-track-lane${isAddTrackDragOver ? ' drag-over' : ''}`}
            onDragOver={(e) => {
              if (e.dataTransfer.types.includes(AUDIO_DRAG_TYPE)) {
                e.preventDefault()
                e.stopPropagation()
                e.dataTransfer.dropEffect = 'copy'
                setIsAddTrackDragOver(true)
              }
            }}
            onDragLeave={() => setIsAddTrackDragOver(false)}
            onDrop={(e) => {
              setIsAddTrackDragOver(false)
              if (e.dataTransfer.types.includes(AUDIO_DRAG_TYPE)) {
                e.preventDefault()
                e.stopPropagation()
                const clipId = e.dataTransfer.getData(AUDIO_DRAG_TYPE)
                if (clipId) {
                  const rawTime = Math.max(0, trackTime(e.clientX))
                  const snappedTime = rawTime < 1.5 ? 0 : rawTime
                  onAddAudioClip(clipId, snappedTime, trackCount)
                }
              }
            }}
            onClick={() => onAddAudioTrack?.()}
            title="Click or drop audio here to add a new audio track"
          >
            <span>+ Drop audio here or click to add track</span>
          </div>
          <div className="playhead" style={{ left: playheadX }}>
            <div className="playhead-head" />
          </div>
        </div>
      </div>
    </section>
  )
}

interface RulerProps {
  width: number
  pixelsPerSecond: number
  onPointerDown: (event: PointerEvent<HTMLDivElement>) => void
  onPointerMove: (event: PointerEvent<HTMLDivElement>) => void
}

function Ruler({ width, pixelsPerSecond, onPointerDown, onPointerMove }: RulerProps) {
  const step =
    TICK_STEPS.find((candidate) => candidate * pixelsPerSecond >= MIN_TICK_SPACING) ?? TICK_STEPS.at(-1)!
  const count = Math.floor(width / (step * pixelsPerSecond)) + 1
  return (
    <div className="ruler" onPointerDown={onPointerDown} onPointerMove={onPointerMove}>
      {Array.from({ length: count }, (_, index) => index * step).map((seconds) => (
        <span key={seconds} className="tick" style={{ left: seconds * pixelsPerSecond }}>
          {formatDuration(seconds)}
        </span>
      ))}
    </div>
  )
}

/** Current width of an element, updated when it resizes. */
function useElementWidth(ref: RefObject<HTMLElement | null>): number {
  const [width, setWidth] = useState(0)
  useEffect(() => {
    const element = ref.current
    if (element === null) return
    const observer = new ResizeObserver(([entry]) => setWidth(entry.contentRect.width))
    observer.observe(element)
    return () => observer.disconnect()
  }, [ref])
  return width
}
