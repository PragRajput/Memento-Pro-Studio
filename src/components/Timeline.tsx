import { useEffect, useRef, useState } from 'react'
import type { DragEvent, PointerEvent, RefObject } from 'react'
import { AudioLane } from './AudioLane.tsx'
import { Popover } from './Popover.tsx'
import { GradeControls } from './GradeControls.tsx'
import { Slider } from './Slider.tsx'
import { OverlayLane } from './OverlayLane.tsx'
import { VideoLayerLane } from './VideoLayerLane.tsx'
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
  EdgeFades,
  MasterGrade,
  MediaClip,
  OverlayItem,
  OverlayCategory,
  TextOverlay,
  TimelineItem,
  Transition,
  TransitionEasing,
  TransitionType,
  VideoLayerItem,
} from '../types.ts'

/** Ruler label spacing candidates, in seconds; the first that leaves room for a label wins. */
/**
 * Everything the toolbar can add, behind one menu. These were seven separate
 * buttons competing for the same row; grouping them keeps the common actions
 * (split, delete) prominent and the rest one click away.
 */
const ADD_ACTIONS: readonly {
  id: 'title' | 'layer' | 'audio' | OverlayCategory
  mark: string
  label: string
  hint: string
  /** Needs something on the timeline to attach to; empty tracks do not. */
  needsMedia: boolean
}[] = [
  { id: 'title', mark: 'T', label: 'Title', hint: 'Text over the picture', needsMedia: true },
  { id: 'media', mark: 'PIP', label: 'Picture-in-Picture', hint: 'Logo, watermark, or video', needsMedia: true },
  { id: 'vfx', mark: 'FX', label: 'Cinematic Atmosphere', hint: 'Letterbox, vignette, grain, light leak', needsMedia: true },
  { id: 'lower-third', mark: 'L3', label: 'Lower Third', hint: 'Speaker name, title, breaking ribbon', needsMedia: true },
  { id: 'color', mark: 'COL', label: 'Colour Wash', hint: 'Warm sunset, neon blend tint', needsMedia: true },
  { id: 'layer', mark: 'V+', label: 'Video Layer', hint: 'Another track above V1', needsMedia: false },
  { id: 'audio', mark: 'A+', label: 'Audio Track', hint: 'Another parallel audio lane', needsMedia: false },
]

/** Times closer together than this count as the same cut. */
const EDIT_POINT_EPSILON = 1e-3

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
  onAddAudioTrack?: () => void
  onRemoveAudioTrack?: (trackIndex: number) => void
  textItems: TextOverlay[]
  selectedTextId: string | null
  onSelectTextItem: (id: string | null) => void
  onAddText: () => void
  onMoveTextItem: (id: string, start: number) => void
  onTrimTextItem: (id: string, edge: 'in' | 'out', time: number) => void
  videoLayers?: VideoLayerItem[]
  videoLayerCount?: number
  selectedLayerItemId?: string | null
  onSelectLayerItem?: (id: string | null) => void
  onAddClipToLayer?: (clipId: string, trackIndex: number, start: number) => void
  onMoveLayerItem?: (id: string, start: number, trackIndex?: number) => void
  onTrimLayerItem?: (id: string, edge: 'in' | 'out', sourceTime: number) => void
  onAddVideoLayer?: () => void
  onRemoveVideoLayer?: (trackIndex: number) => void
  overlayItems?: OverlayItem[]
  selectedOverlayId?: string | null
  onSelectOverlayItem?: (id: string | null) => void
  onAddOverlay?: (category?: OverlayItem['category']) => void
  onMoveOverlayItem?: (id: string, start: number) => void
  onTrimOverlayItem?: (id: string, edge: 'in' | 'out', time: number) => void
  onAddMediaOverlay?: (clipId: string, start: number) => void
  edgeFades?: EdgeFades
  onUpdateEdgeFades?: (updated: EdgeFades) => void
  masterGrade?: MasterGrade
  onUpdateMasterGrade?: (updated: MasterGrade) => void
  canUndo?: boolean
  canRedo?: boolean
  onUndo?: () => void
  onRedo?: () => void
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
  onAddAudioTrack,
  onRemoveAudioTrack,
  textItems,
  selectedTextId,
  onSelectTextItem,
  onAddText,
  onMoveTextItem,
  onTrimTextItem,
  videoLayers = [],
  videoLayerCount = 1,
  selectedLayerItemId = null,
  onSelectLayerItem,
  onAddClipToLayer,
  onMoveLayerItem,
  onTrimLayerItem,
  onAddVideoLayer,
  onRemoveVideoLayer,
  overlayItems = [],
  selectedOverlayId = null,
  onSelectOverlayItem,
  onAddOverlay,
  onMoveOverlayItem,
  onTrimOverlayItem,
  onAddMediaOverlay,
  edgeFades,
  onUpdateEdgeFades,
  masterGrade = {},
  onUpdateMasterGrade,
  canUndo = false,
  canRedo = false,
  onUndo,
  onRedo,
}: TimelineProps) {
  const scrollRef = useRef<HTMLDivElement>(null)
  const trackRef = useRef<HTMLDivElement>(null)
  const viewportWidth = useElementWidth(scrollRef)
  const [dropIndex, setDropIndex] = useState<number | null>(null)
  const [reorder, setReorder] = useState<Reorder | null>(null)
  const [showAddMenu, setShowAddMenu] = useState(false)
  const [showEdgeFadesMenu, setShowEdgeFadesMenu] = useState(false)
  const addMenuAnchor = useRef<HTMLButtonElement>(null)
  const edgeFadesAnchor = useRef<HTMLButtonElement>(null)
  const masterGradeAnchor = useRef<HTMLButtonElement>(null)
  const [showMasterGrade, setShowMasterGrade] = useState(false)

  const maxTrackInItems = audioItems.reduce((max, item) => Math.max(max, item.trackIndex ?? 0), 0)
  const trackCount = Math.max(audioTrackCount, maxTrackInItems + 1, 1)

  const starts = itemStarts(items)
  const contentWidth = Math.max(viewportWidth, (duration + TRAILING_SPACE) * pps)
  /** Reserved column for track badges; must match --track-gutter in the stylesheet. */
  const TRACK_GUTTER = 54
  /** Playhead position in scroll coordinates, i.e. including the badge gutter. */
  const playheadX = TRACK_GUTTER + time * pps

  const isProgrammaticScroll = useRef(false)
  const userScrolledAway = useRef(false)
  const scrollTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Keep playhead in view during playback unless user has scrolled away.
  useEffect(() => {
    const scroller = scrollRef.current
    if (!playing || scroller === null) return

    // If user has intentionally scrolled away from the playhead, do not force follow
    if (userScrolledAway.current) return

    const visibleStart = scroller.scrollLeft
    const visibleEnd = scroller.scrollLeft + scroller.clientWidth

    // If playhead crosses past the visible right boundary (with 50px margin) or falls behind visible left
    if (playheadX > visibleEnd - 50 || playheadX < visibleStart) {
      isProgrammaticScroll.current = true
      scroller.scrollLeft = Math.max(0, playheadX - 50)
      if (scrollTimeoutRef.current !== null) clearTimeout(scrollTimeoutRef.current)
      scrollTimeoutRef.current = setTimeout(() => {
        isProgrammaticScroll.current = false
      }, 60)
    }
  }, [playing, playheadX])

  // Detect user horizontal scrolling to suspend or resume auto-following.
  const handleScroll = () => {
    const scroller = scrollRef.current
    if (!scroller) return

    // Track badges live in a gutter inside the scrolling content, so counter
    // translate them to keep the column pinned while the lanes scroll under it.
    scroller.style.setProperty('--timeline-scroll-x', `${scroller.scrollLeft}px`)

    if (isProgrammaticScroll.current) return

    const visibleStart = scroller.scrollLeft
    const visibleEnd = scroller.scrollLeft + scroller.clientWidth

    // Check if playhead (pointer) is currently visible inside the screen window (with 10px buffer)
    const inView = playheadX >= visibleStart - 10 && playheadX <= visibleEnd + 10

    if (!inView) {
      // User scrolled playhead out of view -> do not force follow!
      userScrolledAway.current = true
    } else {
      // User scrolled back such that playhead is visible again -> resume follow!
      userScrolledAway.current = false
    }
  }

  // If playback restarts while playhead is visible, ensure auto-follow is active
  useEffect(() => {
    if (playing) {
      const scroller = scrollRef.current
      if (scroller) {
        const inView =
          playheadX >= scroller.scrollLeft - 10 &&
          playheadX <= scroller.scrollLeft + scroller.clientWidth + 10
        if (inView) {
          userScrolledAway.current = false
        }
      }
    }
  }, [playing, playheadX])

  // Clean up timeout on unmount
  useEffect(() => {
    return () => {
      if (scrollTimeoutRef.current !== null) clearTimeout(scrollTimeoutRef.current)
    }
  }, [])

  const trackTime = (clientX: number) =>
    (clientX - (trackRef.current?.getBoundingClientRect().left ?? 0)) / pps

  const seekFromPointer = (event: PointerEvent<HTMLDivElement>) => {
    userScrolledAway.current = false
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
    // A timeline-second of drag is `speed` source-seconds, since sped-up/slowed-down
    // source time passes faster/slower than the timeline time the pixels measure.
    const speed = item.speed ?? 1
    onSelectItem(item.id)

    const onMove = (move: globalThis.PointerEvent) =>
      onTrimItem(item.id, edge, startValue + ((move.clientX - startX) / pps) * speed)
    const finish = () => {
      element.removeEventListener('pointermove', onMove)
      element.removeEventListener('pointerup', finish)
      element.removeEventListener('pointercancel', finish)
    }
    element.addEventListener('pointermove', onMove)
    element.addEventListener('pointerup', finish)
    element.addEventListener('pointercancel', finish)
  }

  // Every cut the playhead can land on: the head, each clip boundary, the tail.
  const editPoints = [...new Set([0, ...starts, duration])].sort((a, b) => a - b)
  const previousEditPoint =
    [...editPoints].reverse().find((point) => point < time - EDIT_POINT_EPSILON) ?? 0
  const nextEditPoint =
    editPoints.find((point) => point > time + EDIT_POINT_EPSILON) ?? duration

  const markerTime =
    reorder !== null
      ? reorderMarkerTime(items, items.findIndex((item) => item.id === reorder.id), reorder.to)
      : dropIndex !== null
        ? (starts[dropIndex] ?? duration)
        : null

  return (
    <section className="panel timeline" aria-label="Timeline">
      <header className="panel-header timeline-toolbar">
        {/* Transport Controls */}
        <div className="transport-controls">
          <div className="timecode-display" aria-label="Playhead time">
            <span className="tc-current">{formatTimecode(time)}</span>
            <span className="tc-divider">/</span>
            <span className="tc-total">{formatTimecode(duration)}</span>
          </div>
          <button
            type="button"
            className={`transport-btn play-btn${playing ? ' is-playing' : ''}`}
            onClick={onTogglePlay}
            disabled={duration <= 0}
            title={`${playing ? 'Pause' : 'Play'} (Space)`}
            aria-label={playing ? 'Pause' : 'Play'}
          >
            <span className="play-icon">{playing ? '❚❚' : '▶'}</span>
          </button>
          <button
            type="button"
            className="transport-btn step-btn"
            onClick={() => {
              userScrolledAway.current = false
              onSeek(previousEditPoint)
            }}
            disabled={duration <= 0 || previousEditPoint >= time - EDIT_POINT_EPSILON}
            title="Back to the previous cut"
            aria-label="Previous cut"
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
              <path d="M18 5v14l-10-7z" />
              <rect x="5" y="5" width="2" height="14" rx="1" />
            </svg>
          </button>
          <button
            type="button"
            className="transport-btn step-btn"
            onClick={() => {
              userScrolledAway.current = false
              onSeek(nextEditPoint)
            }}
            disabled={duration <= 0 || nextEditPoint <= time + EDIT_POINT_EPSILON}
            title="Forward to the next cut"
            aria-label="Next cut"
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
              <path d="M6 5v14l10-7z" />
              <rect x="17" y="5" width="2" height="14" rx="1" />
            </svg>
          </button>
        </div>

        {/* Undo / Redo — editing actions, so they sit with the edit tools */}
        <div className="timeline-history-group">
          <button
            type="button"
            className="tool-btn history-btn icon-only"
            onClick={() => onUndo?.()}
            disabled={!canUndo}
            title="Undo (Cmd+Z / Ctrl+Z)"
            aria-label="Undo"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M3 7v6h6" />
              <path d="M21 17a9 9 0 0 0-9-9 9 9 0 0 0-6 2.3L3 13" />
            </svg>
          </button>
          <button
            type="button"
            className="tool-btn history-btn icon-only"
            onClick={() => onRedo?.()}
            disabled={!canRedo}
            title="Redo (Cmd+Shift+Z / Ctrl+Y)"
            aria-label="Redo"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 7v6h-6" />
              <path d="M3 17a9 9 0 0 1 9-9 9 9 0 0 1 6 2.3L21 13" />
            </svg>
          </button>
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
          <div className="overlay-dropdown-wrap">
            <button
              type="button"
              ref={addMenuAnchor}
              className="tool-btn add-menu-btn"
              onClick={() => setShowAddMenu((prev) => !prev)}
              aria-haspopup="menu"
              aria-expanded={showAddMenu}
              title="Add a title, overlay, video layer or audio track"
            >
              <span className="tool-icon">+</span>
              <span>Add</span>
              <span className="tool-caret" aria-hidden="true">▾</span>
            </button>
            <Popover
              anchorRef={addMenuAnchor}
              open={showAddMenu}
              onClose={() => setShowAddMenu(false)}
              width={272}
            >
              <div className="overlay-menu-dropdown is-portalled" role="menu">
                {ADD_ACTIONS.map((action) => (
                  <button
                    key={action.id}
                    type="button"
                    role="menuitem"
                    disabled={action.needsMedia && duration <= 0}
                    title={
                      action.needsMedia && duration <= 0
                        ? 'Add a clip to the timeline first'
                        : action.hint
                    }
                    onClick={() => {
                      setShowAddMenu(false)
                      if (action.id === 'title') onAddText()
                      else if (action.id === 'layer') onAddVideoLayer?.()
                      else if (action.id === 'audio') onAddAudioTrack?.()
                      else onAddOverlay?.(action.id)
                    }}
                  >
                    <span className="overlay-menu-icon">{action.mark}</span>
                    <div className="overlay-menu-text">
                      <strong>{action.label}</strong>
                      <small>{action.hint}</small>
                    </div>
                  </button>
                ))}
              </div>
            </Popover>
          </div>

          {/* Edge Fades Tool & Popover */}
          <div className="overlay-dropdown-wrap">
            <button
              type="button"
              className={`tool-btn edge-fades-btn${(edgeFades?.in?.duration || edgeFades?.out?.duration) ? ' active' : ''}`}
              ref={edgeFadesAnchor}
              onClick={() => setShowEdgeFadesMenu((prev) => !prev)}
              disabled={duration <= 0}
              title="Configure Fade-in-from-black and Fade-out-to-black at timeline edges"
            >
              <span className="tool-icon">◐</span>
              <span>Edge Fades</span>
            </button>
            <Popover
              anchorRef={edgeFadesAnchor}
              open={showEdgeFadesMenu}
              onClose={() => setShowEdgeFadesMenu(false)}
              width={280}
            >
              <div className="overlay-menu-dropdown edge-fades-dropdown is-portalled" style={{ padding: '12px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                  <strong style={{ fontSize: '13px' }}>Timeline Edge Fades</strong>
                  <button
                    type="button"
                    style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: '14px' }}
                    onClick={() => setShowEdgeFadesMenu(false)}
                  >
                    ×
                  </button>
                </div>

                {/* Fade In */}
                <div style={{ marginBottom: '12px', borderBottom: '1px solid var(--border-subtle)', paddingBottom: '8px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                    <span style={{ fontSize: '12px', fontWeight: 600 }}>Fade In (Start)</span>
                    <label style={{ fontSize: '11px', display: 'flex', alignItems: 'center', gap: '4px', cursor: 'pointer' }}>
                      <input
                        type="checkbox"
                        checked={Boolean(edgeFades?.in && edgeFades.in.duration > 0)}
                        onChange={(e) => {
                          const active = e.target.checked
                          onUpdateEdgeFades?.({
                            ...edgeFades,
                            in: active
                              ? { edge: 'in', duration: 1.0, color: '#000000', easing: 'ease-in-out' }
                              : undefined,
                          })
                        }}
                      />
                      Enable
                    </label>
                  </div>
                  {edgeFades?.in && edgeFades.in.duration > 0 && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <span style={{ fontSize: '11px', width: '50px', color: 'var(--text-muted)' }}>Duration</span>
                        <Slider
                          min={0.2}
                          max={3.0}
                          step={0.1}
                          value={edgeFades.in.duration}
                          defaultValue={1.0}
                          onChange={(durationVal) => {
                            onUpdateEdgeFades?.({
                              ...edgeFades,
                              in: { ...edgeFades.in!, duration: durationVal },
                            })
                          }}
                          ariaLabel="Fade in duration"
                        />
                        <span
                          className="control-subvalue"
                          style={{ width: '38px', textAlign: 'center' }}
                          onDoubleClick={() => {
                            onUpdateEdgeFades?.({
                              ...edgeFades,
                              in: { ...edgeFades.in!, duration: 1.0 },
                            })
                          }}
                          title="Double-click to reset"
                        >
                          {edgeFades.in.duration.toFixed(1)}s
                        </span>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <span style={{ fontSize: '11px', width: '50px', color: 'var(--text-muted)' }}>Color</span>
                        <input
                          type="color"
                          className="native-color-picker"
                          value={edgeFades.in.color || '#000000'}
                          onChange={(e) => {
                            const color = e.target.value
                            onUpdateEdgeFades?.({
                              ...edgeFades,
                              in: { ...edgeFades.in!, color },
                            })
                          }}
                        />
                        <select
                          className="inspector-select"
                          style={{ flex: 1, padding: '2px 4px', fontSize: '11px' }}
                          value={edgeFades.in.easing || 'ease-in-out'}
                          onChange={(e) => {
                            const easing = e.target.value as TransitionEasing
                            onUpdateEdgeFades?.({
                              ...edgeFades,
                              in: { ...edgeFades.in!, easing },
                            })
                          }}
                        >
                          <option value="ease-in-out">Ease In-Out</option>
                          <option value="linear">Linear</option>
                          <option value="ease-in">Ease In</option>
                          <option value="ease-out">Ease Out</option>
                          <option value="smoothstep">Smoothstep</option>
                        </select>
                      </div>
                    </div>
                  )}
                </div>

                {/* Fade Out */}
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                    <span style={{ fontSize: '12px', fontWeight: 600 }}>Fade Out (End)</span>
                    <label style={{ fontSize: '11px', display: 'flex', alignItems: 'center', gap: '4px', cursor: 'pointer' }}>
                      <input
                        type="checkbox"
                        checked={Boolean(edgeFades?.out && edgeFades.out.duration > 0)}
                        onChange={(e) => {
                          const active = e.target.checked
                          onUpdateEdgeFades?.({
                            ...edgeFades,
                            out: active
                              ? { edge: 'out', duration: 1.0, color: '#000000', easing: 'ease-in-out' }
                              : undefined,
                          })
                        }}
                      />
                      Enable
                    </label>
                  </div>
                  {edgeFades?.out && edgeFades.out.duration > 0 && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <span style={{ fontSize: '11px', width: '50px', color: 'var(--text-muted)' }}>Duration</span>
                        <Slider
                          min={0.2}
                          max={3.0}
                          step={0.1}
                          value={edgeFades.out.duration}
                          defaultValue={1.0}
                          onChange={(durationVal) => {
                            onUpdateEdgeFades?.({
                              ...edgeFades,
                              out: { ...edgeFades.out!, duration: durationVal },
                            })
                          }}
                          ariaLabel="Fade out duration"
                        />
                        <span
                          className="control-subvalue"
                          style={{ width: '38px', textAlign: 'center' }}
                          onDoubleClick={() => {
                            onUpdateEdgeFades?.({
                              ...edgeFades,
                              out: { ...edgeFades.out!, duration: 1.0 },
                            })
                          }}
                          title="Double-click to reset"
                        >
                          {edgeFades.out.duration.toFixed(1)}s
                        </span>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <span style={{ fontSize: '11px', width: '50px', color: 'var(--text-muted)' }}>Color</span>
                        <input
                          type="color"
                          className="native-color-picker"
                          value={edgeFades.out.color || '#000000'}
                          onChange={(e) => {
                            const color = e.target.value
                            onUpdateEdgeFades?.({
                              ...edgeFades,
                              out: { ...edgeFades.out!, color },
                            })
                          }}
                        />
                        <select
                          className="inspector-select"
                          style={{ flex: 1, padding: '2px 4px', fontSize: '11px' }}
                          value={edgeFades.out.easing || 'ease-in-out'}
                          onChange={(e) => {
                            const easing = e.target.value as TransitionEasing
                            onUpdateEdgeFades?.({
                              ...edgeFades,
                              out: { ...edgeFades.out!, easing },
                            })
                          }}
                        >
                          <option value="ease-in-out">Ease In-Out</option>
                          <option value="linear">Linear</option>
                          <option value="ease-in">Ease In</option>
                          <option value="ease-out">Ease Out</option>
                          <option value="smoothstep">Smoothstep</option>
                        </select>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </Popover>
          </div>
          <div className="overlay-dropdown-wrap">
            <button
              ref={masterGradeAnchor}
              type="button"
              className="tool-btn master-grade-btn"
              onClick={() => setShowMasterGrade((prev) => !prev)}
              title="Grade the whole timeline at once, on top of any per-clip looks"
            >
              <span className="tool-icon">◑</span>
              <span>Colour</span>
            </button>
            <Popover
              anchorRef={masterGradeAnchor}
              open={showMasterGrade}
              onClose={() => setShowMasterGrade(false)}
              width={300}
            >
              <div className="overlay-menu-dropdown is-portalled master-grade-panel">
                <div className="master-grade-head">
                  <strong>Whole Timeline</strong>
                  <button
                    type="button"
                    className="inspector-close-btn"
                    onClick={() => setShowMasterGrade(false)}
                    aria-label="Close"
                  >
                    ×
                  </button>
                </div>
                <p className="library-hint">
                  Applies to every clip, on top of each clip&rsquo;s own look. Titles and overlays
                  stay ungraded.
                </p>
                <GradeControls
                  grade={masterGrade}
                  onChange={(next) => onUpdateMasterGrade?.(next)}
                />
              </div>
            </Popover>
          </div>

          <button
            type="button"
            className="tool-btn delete-tool-btn"
            onClick={onDelete}
            disabled={
              selectedItemId === null &&
              selectedAudioItemId === null &&
              selectedTextId === null &&
              selectedTransitionId === null &&
              selectedOverlayId === null
            }
            title="Delete selected item (Del / Backspace)"
          >
            <span className="tool-icon"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6" /><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" /></svg></span>
            <span>Delete</span>
            <kbd className="key-shortcut">Del</kbd>
          </button>
        </div>

        {/* Zoom Slider */}
        <div className="zoom-controls">
          <button
            type="button"
            className="zoom-icon-btn"
            title="Zoom out"
            onClick={() => onZoom(Math.max(10, pps - 15))}
          >
            −
          </button>
          <div style={{ width: '100px' }}>
            <Slider
              min={10}
              max={200}
              step={5}
              value={pps}
              defaultValue={50}
              className="zoom-slider"
              onChange={onZoom}
              title={`Zoom: ${pps} px/s (Double-click to reset)`}
              ariaLabel="Timeline zoom level"
            />
          </div>
          <button
            type="button"
            className="zoom-icon-btn"
            title="Zoom in"
            onClick={() => onZoom(Math.min(200, pps + 15))}
          >
            +
          </button>
        </div>
      </header>

      <div className="timeline-scroll" ref={scrollRef} onScroll={handleScroll}>
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
              userScrolledAway.current = false
              seekFromPointer(event)
            }}
            onPointerMove={(event) => {
              if (event.currentTarget.hasPointerCapture(event.pointerId)) seekFromPointer(event)
            }}
          />
          {onSelectLayerItem &&
            onAddClipToLayer &&
            onMoveLayerItem &&
            onTrimLayerItem &&
            // Highest layer first, so the stack reads top-down like the picture.
            Array.from({ length: videoLayerCount }, (_, index) => videoLayerCount - 1 - index).map(
              (trackIndex) => (
                <VideoLayerLane
                  key={trackIndex}
                  trackIndex={trackIndex}
                  items={videoLayers}
                  clips={clips}
                  selectedItemId={selectedLayerItemId}
                  pixelsPerSecond={pps}
                  onSelectItem={onSelectLayerItem}
                  onMoveItem={onMoveLayerItem}
                  onTrimItem={onTrimLayerItem}
                  onAddClip={onAddClipToLayer}
                  onRemoveLane={onRemoveVideoLayer}
                />
              ),
            )}
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
                  <span className="item-label">
                    
                    {clip?.name}
                  </span>
                  <button
                    type="button"
                    className={`mute-toggle${item.muted ? ' muted' : ''}`}
                    aria-label={item.muted ? `Unmute ${clip?.name ?? 'clip'}` : `Mute ${clip?.name ?? 'clip'}`}
                    aria-pressed={item.muted}
                    onPointerDown={(event) => event.stopPropagation()}
                    onClick={() => onToggleMute(item.id)}
                  >
                    {item.muted ? (<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" /><line x1="23" y1="9" x2="17" y2="15" /><line x1="17" y1="9" x2="23" y2="15" /></svg>) : (<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" /><path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07" /></svg>)}
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
            />
          ))}
          <TextLane
            items={textItems}
            selectedItemId={selectedTextId}
            pixelsPerSecond={pps}
            maxEnd={duration}
            onSelectItem={onSelectTextItem}
            onMoveItem={onMoveTextItem}
            onTrimItem={onTrimTextItem}
          />
          {overlayItems && onSelectOverlayItem && onMoveOverlayItem && onTrimOverlayItem && (
            <OverlayLane
              items={overlayItems}
              mediaClips={clips}
              selectedItemId={selectedOverlayId}
              pixelsPerSecond={pps}
              maxEnd={duration}
              onSelectItem={onSelectOverlayItem}
              onMoveItem={onMoveOverlayItem}
              onTrimItem={onTrimOverlayItem}
              onAddMediaOverlay={onAddMediaOverlay}
            />
          )}
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
