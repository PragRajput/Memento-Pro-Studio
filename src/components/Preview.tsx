import type { RefObject } from 'react'
import type { MediaSelection } from './MediaBin.tsx'
import { TextInspector } from './TextInspector.tsx'
import type { AudioClip, MediaClip, TextOverlay } from '../types.ts'

interface PreviewProps {
  selection: MediaSelection
  videoClips: ReadonlyMap<string, MediaClip>
  audioClips: ReadonlyMap<string, AudioClip>
  timelineEmpty: boolean
  hasVideo: boolean
  timelineVideoRef: RefObject<HTMLVideoElement | null>
  timelineAudioRef: RefObject<HTMLAudioElement | null>
  textItems: TextOverlay[]
  selectedTextId: string | null
  time: number
  onSelectText: (id: string | null) => void
  onUpdateText: (updated: TextOverlay) => void
  onDeleteText: (id: string) => void
}

export function Preview({
  selection,
  videoClips,
  audioClips,
  timelineEmpty,
  hasVideo,
  timelineVideoRef,
  timelineAudioRef,
  textItems,
  selectedTextId,
  time,
  onSelectText,
  onUpdateText,
  onDeleteText,
}: PreviewProps) {
  const videoClip = selection?.kind === 'video' ? videoClips.get(selection.id) : undefined
  const audioClip = selection?.kind === 'audio' ? audioClips.get(selection.id) : undefined
  const showingTimeline = videoClip === undefined && audioClip === undefined
  const selectedText = textItems.find((item) => item.id === selectedTextId)

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
    <section className="panel preview" aria-label="Preview">
      <p className="preview-label">
        {videoClip ? `Clip: ${videoClip.name}` : audioClip ? `Clip: ${audioClip.name}` : 'Timeline'}
      </p>
      {videoClip && <video key={videoClip.id} src={videoClip.url} controls />}
      {audioClip && (
        <div className="audio-preview">
          <span className="clip-icon" aria-hidden="true">
            ♪
          </span>
          <audio key={audioClip.id} src={audioClip.url} controls />
        </div>
      )}

      {/* Timeline preview stage */}
      <div className="preview-stage" hidden={!showingTimeline || timelineEmpty}>
        {hasVideo ? (
          <video ref={timelineVideoRef} />
        ) : (
          <div className="audio-timeline-banner">
            <span className="clip-icon" aria-hidden="true">
              ♪
            </span>
            <p>Audio playback active</p>
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
                  backgroundColor: title.backgroundColor && title.backgroundColor !== 'transparent' ? title.backgroundColor : undefined,
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

      <audio ref={timelineAudioRef} hidden />
      {showingTimeline && timelineEmpty && (
        <p className="empty">Add clips to the timeline, or select a clip to preview it.</p>
      )}

      {selectedText && (
        <TextInspector
          item={selectedText}
          onChange={onUpdateText}
          onDelete={onDeleteText}
          onClose={() => onSelectText(null)}
        />
      )}
    </section>
  )
}
