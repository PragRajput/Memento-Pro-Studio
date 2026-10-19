import type { RefObject } from 'react'
import type { MediaSelection } from './MediaBin.tsx'
import { AudioInspector } from './AudioInspector.tsx'
import { ClipInspector } from './ClipInspector.tsx'
import { TextInspector } from './TextInspector.tsx'
import { TransitionInspector } from './TransitionInspector.tsx'
import type { AspectRatio, AudioClip, AudioTimelineItem, MediaClip, TextOverlay, TimelineItem, Transition } from '../types.ts'

interface PreviewProps {
  selection: MediaSelection
  videoClips: ReadonlyMap<string, MediaClip>
  audioClips: ReadonlyMap<string, AudioClip>
  timelineEmpty: boolean
  hasVideo: boolean
  aspectRatio?: AspectRatio
  timelineVideoRef: RefObject<HTMLVideoElement | null>
  secondaryVideoRef?: RefObject<HTMLVideoElement | null>
  timelineImageRef?: RefObject<HTMLImageElement | null>
  secondaryImageRef?: RefObject<HTMLImageElement | null>
  timelineAudioRef: RefObject<HTMLAudioElement | null>
  textItems: TextOverlay[]
  selectedTextId: string | null
  time: number
  onSelectText: (id: string | null) => void
  onUpdateText: (updated: TextOverlay) => void
  onDeleteText: (id: string) => void
  selectedTimelineItem?: TimelineItem | null
  onUpdateTimelineItem?: (updated: TimelineItem) => void
  onDeleteTimelineItem?: (id: string) => void
  onCloseTimelineInspector?: () => void
  selectedAudioItem?: AudioTimelineItem | null
  selectedAudioClipName?: string
  audioTrackCount?: number
  onUpdateAudioItem?: (updated: AudioTimelineItem) => void
  onAudioVolumeChange?: (id: string, volume: number) => void
  onAudioFadeChange?: (id: string, fadeIn: number, fadeOut: number) => void
  onMoveAudioToTrack?: (id: string, trackIndex: number) => void
  onDeleteAudioItem?: (id: string) => void
  onCloseAudioInspector?: () => void
  selectedTransition?: Transition | null
  selectedTransitionItemA?: TimelineItem | null
  selectedTransitionItemB?: TimelineItem | null
  selectedTransitionMaxDuration?: number
  onUpdateTransition?: (updated: Transition) => void
  onDeleteTransition?: (id: string) => void
  onCloseTransitionInspector?: () => void
}

export function Preview({
  selection,
  videoClips,
  audioClips,
  timelineEmpty,
  hasVideo,
  aspectRatio = '16:9',
  timelineVideoRef,
  secondaryVideoRef,
  timelineImageRef,
  secondaryImageRef,
  timelineAudioRef,
  textItems,
  selectedTextId,
  time,
  onSelectText,
  onUpdateText,
  onDeleteText,
  selectedTimelineItem,
  onUpdateTimelineItem,
  onDeleteTimelineItem,
  onCloseTimelineInspector,
  selectedAudioItem,
  selectedAudioClipName,
  audioTrackCount = 2,
  onUpdateAudioItem,
  onAudioVolumeChange,
  onAudioFadeChange,
  onMoveAudioToTrack,
  onDeleteAudioItem,
  onCloseAudioInspector,
  selectedTransition,
  selectedTransitionItemA,
  selectedTransitionItemB,
  selectedTransitionMaxDuration = 3,
  onUpdateTransition,
  onDeleteTransition,
  onCloseTransitionInspector,
}: PreviewProps) {
  const videoClip = selection?.kind === 'video' ? videoClips.get(selection.id) : undefined
  const audioClip = selection?.kind === 'audio' ? audioClips.get(selection.id) : undefined
  const showingTimeline = videoClip === undefined && audioClip === undefined
  const selectedText = textItems.find((item) => item.id === selectedTextId)

  const hasInspector = Boolean(
    selectedText ||
    (selectedTimelineItem && onUpdateTimelineItem && onDeleteTimelineItem && onCloseTimelineInspector) ||
    (selectedAudioItem && onAudioVolumeChange && onMoveAudioToTrack && onDeleteAudioItem && onCloseAudioInspector) ||
    (selectedTransition && onUpdateTransition && onDeleteTransition && onCloseTransitionInspector)
  )

  // Show active overlays at current playhead time, plus the currently selected overlay for live editing
  const visibleTexts = textItems.filter(
    (item) => (time >= item.start && time < item.start + item.duration) || item.id === selectedTextId,
  )

  const beginTitleDrag = (event: React.PointerEvent<HTMLDivElement>, title: TextOverlay) => {
    if (event.button !== 0) return
    event.stopPropagation()
    onSelectText(title.id)
    const element = event.currentTarget
    const stage = element.closest('.preview-stage') as HTMLElement | null
    if (!stage) return
    element.setPointerCapture(event.pointerId)
    const rect = stage.getBoundingClientRect()
    const startX = event.clientX
    const startY = event.clientY
    const startPosX = title.x ?? 50
    const startPosY = title.y ?? (title.position === 'top' ? 15 : title.position === 'center' ? 50 : 85)
    let moved = false

    const onMove = (move: PointerEvent) => {
      const dx = move.clientX - startX
      const dy = move.clientY - startY
      if (!moved && Math.hypot(dx, dy) < 3) return
      moved = true
      const nextX = Math.round(Math.min(95, Math.max(5, startPosX + (dx / rect.width) * 100)))
      const nextY = Math.round(Math.min(95, Math.max(5, startPosY + (dy / rect.height) * 100)))
      onUpdateText({ ...title, x: nextX, y: nextY })
    }

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
    <section className={`panel preview${hasInspector ? ' has-inspector' : ''}`} aria-label="Preview Monitor">
      <div className="preview-viewport">
        {/* Top Monitor Bar */}
        <div className="preview-monitor-header">
          <div className="monitor-badge">
            <span className="live-dot" />
            <span className="monitor-label">
              {videoClip ? `Source: ${videoClip.name}` : audioClip ? `Audio: ${audioClip.name}` : 'Program Monitor'}
            </span>
          </div>
          {videoClip && (
            <span className="monitor-meta">
              {videoClip.width}×{videoClip.height}
            </span>
          )}
        </div>

        {/* Canvas Stage */}
        <div className="preview-canvas-wrapper">
          {videoClip && (
            videoClip.mediaType === 'image' ? (
              <img key={videoClip.id} src={videoClip.url} alt={videoClip.name} className="preview-source-video preview-source-image" />
            ) : (
              <video key={videoClip.id} src={videoClip.url} controls className="preview-source-video" />
            )
          )}

          {audioClip && (
            <div className="audio-preview">
              <div className="audio-viz-ring static">
                <span className="clip-icon-large" aria-hidden="true">♪</span>
              </div>
              <p className="audio-preview-name">{audioClip.name}</p>
              <audio key={audioClip.id} src={audioClip.url} controls />
            </div>
          )}

          {/* Timeline preview stage */}
          <div
            className="preview-stage"
            hidden={!showingTimeline || timelineEmpty}
            style={{ aspectRatio: (aspectRatio ?? '16:9').replace(':', ' / ') }}
          >
            {hasVideo ? (
              <>
                <video ref={timelineVideoRef} className="preview-video primary" />
                <video
                  ref={secondaryVideoRef}
                  className="preview-video secondary"
                  style={{ display: 'none' }}
                />
                <img
                  ref={timelineImageRef}
                  className="preview-image primary"
                  style={{ display: 'none' }}
                  alt=""
                />
                <img
                  ref={secondaryImageRef}
                  className="preview-image secondary"
                  style={{ display: 'none' }}
                  alt=""
                />
              </>
            ) : (
              <div className="audio-timeline-banner">
                <div className="audio-viz-ring">
                  <div className="audio-viz-bars">
                    <span className="viz-bar" />
                    <span className="viz-bar" />
                    <span className="viz-bar" />
                    <span className="viz-bar" />
                    <span className="viz-bar" />
                  </div>
                  <span className="audio-viz-icon" aria-hidden="true">♪</span>
                </div>
                <p className="audio-viz-label">Audio Playback</p>
                <p className="audio-viz-sub">No video track — playing audio timeline</p>
              </div>
            )}

            <div className="preview-overlay">
              {visibleTexts.map((title) => {
                const posX = title.x ?? 50
                const posY = title.y ?? (title.position === 'top' ? 15 : title.position === 'center' ? 50 : 85)
                const fontSize = title.fontSize ?? (title.size === 'small' ? 28 : title.size === 'large' ? 68 : 44)
                const fontFamily = title.fontFamily ? `"${title.fontFamily}", sans-serif` : 'Inter, sans-serif'
                const isSelected = title.id === selectedTextId

                return (
                  <div
                    key={title.id}
                    className={`title-overlay${isSelected ? ' selected' : ''}`}
                    style={{
                      left: `${posX}%`,
                      top: `${posY}%`,
                      fontSize: `${fontSize}px`,
                      fontFamily,
                      color: title.color,
                      backgroundColor:
                        title.backgroundColor && title.backgroundColor !== 'transparent'
                          ? title.backgroundColor
                          : undefined,
                    }}
                    title="Click and drag to position anywhere on screen"
                    onPointerDown={(event) => beginTitleDrag(event, title)}
                    onClick={(event) => {
                      event.stopPropagation()
                      onSelectText(title.id)
                    }}
                  >
                    {title.text}
                  </div>
                )
              })}
            </div>
          </div>

          {showingTimeline && timelineEmpty && (
            <div className="preview-empty-state">
              <div className="empty-icon-group">
                <span className="empty-icon">🎬</span>
              </div>
              <p className="empty-title">Timeline is Empty</p>
              <p className="empty-desc">
                Import videos or audio into the Media Pool, then add them to the timeline to begin editing.
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Docked Inspector Sidebar (Does not obscure video canvas!) */}
      {hasInspector && (
        <aside className="preview-inspector-dock">
          {selectedTimelineItem && onUpdateTimelineItem && onDeleteTimelineItem && onCloseTimelineInspector && (
            <ClipInspector
              item={selectedTimelineItem}
              clip={videoClips.get(selectedTimelineItem.clipId)}
              onChange={onUpdateTimelineItem}
              onDelete={onDeleteTimelineItem}
              onClose={onCloseTimelineInspector}
            />
          )}

          {selectedText && (
            <TextInspector
              item={selectedText}
              onChange={onUpdateText}
              onDelete={onDeleteText}
              onClose={() => onSelectText(null)}
            />
          )}

          {selectedAudioItem && onAudioVolumeChange && onMoveAudioToTrack && onDeleteAudioItem && onCloseAudioInspector && (
            <AudioInspector
              item={selectedAudioItem}
              clipName={selectedAudioClipName ?? 'Audio clip'}
              trackCount={audioTrackCount}
              onChange={onUpdateAudioItem}
              onVolumeChange={onAudioVolumeChange}
              onFadeChange={onAudioFadeChange}
              onMoveToTrack={onMoveAudioToTrack}
              onDelete={onDeleteAudioItem}
              onClose={onCloseAudioInspector}
            />
          )}

          {selectedTransition && onUpdateTransition && onDeleteTransition && onCloseTransitionInspector && (
            <TransitionInspector
              transition={selectedTransition}
              clipAName={videoClips.get(selectedTransitionItemA?.clipId ?? '')?.name ?? 'Clip A'}
              clipBName={videoClips.get(selectedTransitionItemB?.clipId ?? '')?.name ?? 'Clip B'}
              maxDuration={selectedTransitionMaxDuration}
              onChange={onUpdateTransition}
              onDelete={onDeleteTransition}
              onClose={onCloseTransitionInspector}
            />
          )}
        </aside>
      )}

      <audio ref={timelineAudioRef} hidden />
    </section>
  )
}
