import { useEffect, useRef, useState } from 'react'
import type { DragEvent, PointerEvent, RefObject } from 'react'
import { AudioLane } from './AudioLane.tsx'
import { OverlayLane } from './OverlayLane.tsx'
import { VideoLayerLane } from './VideoLayerLane.tsx'
import { TextLane } from './TextLane.tsx'
import { AUDIO_DRAG_TYPE, CLIP_DRAG_TYPE, FILTER_DRAG_TYPE } from '../dnd.ts'
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
  MediaClip,
  OverlayItem,
  TextOverlay,
  TimelineItem,
  Transition,
  TransitionEasing,
  TransitionType,
  VideoLayerItem,
  FilterType,
  AudioEffectType,
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
  onApplyFilterToItem?: (itemId: string, filter: FilterType) => void
  onApplyAudioEffectToItem?: (itemId: string, effect: AudioEffectType) => void
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
  onApplyFilterToItem,
  onApplyAudioEffectToItem,
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
}: TimelineProps) {
  const scrollRef = useRef<HTMLDivElement>(null)
  const trackRef = useRef<HTMLDivElement>(null)
  const viewportWidth = useElementWidth(scrollRef)
  const [dropIndex, setDropIndex] = useState<number | null>(null)
  const [reorder, setReorder] = useState<Reorder | null>(null)
  const [filterDropId, setFilterDropId] = useState<string | null>(null)
  const [isAddTrackDragOver, setIsAddTrackDragOver] = useState(false)
  const [showOverlayMenu, setShowOverlayMenu] = useState(false)
  const [showEdgeFadesMenu, setShowEdgeFadesMenu] = useState(false)

  const maxTrackInItems = audioItems.reduce((max, item) => Math.max(max, item.trackIndex ?? 0), 0)
  const trackCount = Math.max(audioTrackCount, maxTrackInItems + 1, 1)

  const starts = itemStarts(items)
  const contentWidth = Math.max(viewportWidth, (duration + TRAILING_SPACE) * pps)
  const playheadX = time * pps

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
    if (isProgrammaticScroll.current) return
    const scroller = scrollRef.current
    if (!scroller) return

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
            onClick={() => {
              userScrolledAway.current = false
              onSeek(0)
            }}
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
          <div className="overlay-dropdown-wrap">
            <button
              type="button"
              className="tool-btn add-overlay-btn"
              onClick={() => setShowOverlayMenu((prev) => !prev)}
              disabled={duration <= 0}
              title="Add a rich overlay (Picture-in-Picture, Visual FX, Lower Third, or Color Tint)"
            >
              <span className="tool-icon">⧉</span>
              <span>+ Overlay ▾</span>
            </button>
            {showOverlayMenu && (
              <div className="overlay-menu-dropdown">
                <button
                  type="button"
                  onClick={() => {
                    setShowOverlayMenu(false)
                    onAddOverlay?.('media')
                  }}
                >
                  <span className="overlay-menu-icon">PIP</span>
                  <div className="overlay-menu-text">
                    <strong>Picture-in-Picture</strong>
                    <small>Logo, watermark, or video</small>
                  </div>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setShowOverlayMenu(false)
                    onAddOverlay?.('vfx')
                  }}
                >
                  <span className="overlay-menu-icon">FX</span>
                  <div className="overlay-menu-text">
                    <strong>Cinematic Atmosphere FX</strong>
                    <small>Letterbox, vignette, grain, light leak</small>
                  </div>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setShowOverlayMenu(false)
                    onAddOverlay?.('lower-third')
                  }}
                >
                  <span className="overlay-menu-icon">L3</span>
                  <div className="overlay-menu-text">
                    <strong>Broadcast Lower Third</strong>
                    <small>Speaker name, title, breaking ribbon</small>
                  </div>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setShowOverlayMenu(false)
                    onAddOverlay?.('color')
                  }}
                >
                  <span className="overlay-menu-icon">COL</span>
                  <div className="overlay-menu-text">
                    <strong>Color Gradient Wash</strong>
                    <small>Warm sunset, neon blend tint</small>
                  </div>
                </button>
              </div>
            )}
          </div>

          {/* Edge Fades Tool & Popover */}
          <div className="overlay-dropdown-wrap">
            <button
              type="button"
              className={`tool-btn edge-fades-btn${(edgeFades?.in?.duration || edgeFades?.out?.duration) ? ' active' : ''}`}
              onClick={() => setShowEdgeFadesMenu((prev) => !prev)}
              disabled={duration <= 0}
              title="Configure Fade-in-from-black and Fade-out-to-black at timeline edges"
            >
              <span className="tool-icon">◐</span>
              <span>Edge Fades</span>
            </button>
            {showEdgeFadesMenu && (
              <div className="overlay-menu-dropdown edge-fades-dropdown" style={{ width: '280px', padding: '12px' }}>
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
                        <input
                          type="range"
                          className="inspector-slider"
                          min={0.2}
                          max={3.0}
                          step={0.1}
                          value={edgeFades.in.duration}
                          onChange={(e) => {
                            const durationVal = parseFloat(e.target.value)
                            onUpdateEdgeFades?.({
                              ...edgeFades,
                              in: { ...edgeFades.in!, duration: durationVal },
                            })
                          }}
                        />
                        <span style={{ fontSize: '11px', width: '32px' }}>{edgeFades.in.duration.toFixed(1)}s</span>
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
                        <input
                          type="range"
                          className="inspector-slider"
                          min={0.2}
                          max={3.0}
                          step={0.1}
                          value={edgeFades.out.duration}
                          onChange={(e) => {
                            const durationVal = parseFloat(e.target.value)
                            onUpdateEdgeFades?.({
                              ...edgeFades,
                              out: { ...edgeFades.out!, duration: durationVal },
                            })
                          }}
                        />
                        <span style={{ fontSize: '11px', width: '32px' }}>{edgeFades.out.duration.toFixed(1)}s</span>
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
            )}
          </div>
          <button
            type="button"
            className="tool-btn add-video-layer-btn"
            onClick={() => onAddVideoLayer?.()}
            title="Add another video layer above V1"
          >
            <span className="tool-icon">▣</span>
            <span>+ Video Layer</span>
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
                  onRemoveLane={trackIndex > 0 ? onRemoveVideoLayer : undefined}
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
                  className={`timeline-item${item.id === selectedItemId ? ' selected' : ''}${dragging ? ' dragging' : ''}${filterDropId === item.id ? ' effect-drop' : ''}`}
                  style={{
                    left: starts[index] * pps,
                    width: itemLength(item) * pps,
                    backgroundImage: clip ? `url(${clip.thumbnail})` : undefined,
                    transform: dragging ? `translateX(${reorder.dx}px)` : undefined,
                  }}
                  title={`${clip?.name ?? 'Missing clip'} · ${formatDuration(itemLength(item))}`}
                  onPointerDown={(event) => beginItemDrag(event, index)}
                  onDragOver={(event) => {
                    if (!event.dataTransfer.types.includes(FILTER_DRAG_TYPE)) return
                    event.preventDefault()
                    event.stopPropagation()
                    event.dataTransfer.dropEffect = 'copy'
                    setFilterDropId(item.id)
                  }}
                  onDragLeave={() => setFilterDropId(null)}
                  onDrop={(event) => {
                    setFilterDropId(null)
                    if (!event.dataTransfer.types.includes(FILTER_DRAG_TYPE)) return
                    event.preventDefault()
                    event.stopPropagation()
                    const filter = event.dataTransfer.getData(FILTER_DRAG_TYPE)
                    if (filter) onApplyFilterToItem?.(item.id, filter as FilterType)
                  }}
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
              onApplyEffect={onApplyAudioEffectToItem}
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
