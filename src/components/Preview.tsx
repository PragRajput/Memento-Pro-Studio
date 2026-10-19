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
          {visibleTexts.map((title) => (
            <div
              key={title.id}
              className={`title-overlay ${title.position} ${title.size}${title.id === selectedTextId ? ' selected' : ''}`}
              style={{ color: title.color }}
              onClick={(event) => {
                event.stopPropagation()
                onSelectText(title.id)
              }}
            >
              {title.text}
            </div>
          ))}
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
