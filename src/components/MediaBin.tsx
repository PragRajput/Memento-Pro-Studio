import { useRef, useState } from 'react'
import type { DragEvent } from 'react'
import { AUDIO_DRAG_TYPE, CLIP_DRAG_TYPE } from '../dnd.ts'
import { formatDuration } from '../format.ts'
import type { AudioClip, MediaClip } from '../types.ts'

/** What the Preview panel is currently showing from this list, if anything. */
export type MediaSelection = { kind: 'video'; id: string } | { kind: 'audio'; id: string } | null

interface MediaBinProps {
  clips: MediaClip[]
  audioClips: AudioClip[]
  selection: MediaSelection
  importing: number
  errors: string[]
  onImport: (files: File[]) => void
  onSelectVideo: (id: string) => void
  onSelectAudio: (id: string) => void
  onRemoveVideo: (id: string) => void
  onRemoveAudio: (id: string) => void
  onAddVideoToTimeline: (id: string) => void
  onAddAudioToTimeline: (id: string) => void
}

export function MediaBin({
  clips,
  audioClips,
  selection,
  importing,
  errors,
  onImport,
  onSelectVideo,
  onSelectAudio,
  onRemoveVideo,
  onRemoveAudio,
  onAddVideoToTimeline,
  onAddAudioToTimeline,
}: MediaBinProps) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [dragging, setDragging] = useState(false)

  const handleDragOver = (event: DragEvent) => {
    // Only files from the computer import here; clips dragged to a track pass through.
    if (!event.dataTransfer.types.includes('Files')) return
    event.preventDefault()
    setDragging(true)
  }

  const handleDragLeave = (event: DragEvent) => {
    // Ignore leave events fired while moving between the panel's own children.
    if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setDragging(false)
  }

  const handleDrop = (event: DragEvent) => {
    event.preventDefault()
    setDragging(false)
    onImport(Array.from(event.dataTransfer.files))
  }

  return (
    <section
      className={`panel media-bin${dragging ? ' dragging' : ''}`}
      aria-label="Media"
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      <header className="panel-header">
        <h2>Media</h2>
        <button type="button" onClick={() => inputRef.current?.click()}>
          Import
        </button>
        <input
          ref={inputRef}
          type="file"
          accept="video/*,audio/*"
          multiple
          hidden
          onChange={(event) => {
            onImport(Array.from(event.target.files ?? []))
            // Allow importing the same file again.
            event.target.value = ''
          }}
        />
      </header>

      {importing > 0 && <p className="status">Importing {importing} file(s)…</p>}
      {errors.map((error, index) => (
        <p key={index} className="error">
          {error}
        </p>
      ))}

      {clips.length === 0 && audioClips.length === 0 && importing === 0 ? (
        <p className="empty">Drop video or audio files here, or click Import.</p>
      ) : (
        <ul className="clip-list">
          {clips.map((clip) => {
            const placeable = Number.isFinite(clip.duration)
            const selected = selection?.kind === 'video' && selection.id === clip.id
            return (
              <li
                key={clip.id}
                className={selected ? 'selected' : undefined}
                draggable={placeable}
                onDragStart={(event) => {
                  event.dataTransfer.setData(CLIP_DRAG_TYPE, clip.id)
                  event.dataTransfer.effectAllowed = 'copy'
                }}
              >
                <button type="button" className="clip" onClick={() => onSelectVideo(clip.id)}>
                  <img src={clip.thumbnail} alt="" />
                  <span className="clip-name" title={clip.name}>
                    {clip.name}
                  </span>
                  <span className="clip-meta">
                    {formatDuration(clip.duration)} · {clip.width}×{clip.height}
                  </span>
                </button>
                <button
                  type="button"
                  className="remove"
                  aria-label={`Remove ${clip.name}`}
                  onClick={() => onRemoveVideo(clip.id)}
                >
                  ×
                </button>
                <button
                  type="button"
                  className="add"
                  aria-label={`Add ${clip.name} to the video track`}
                  title={placeable ? 'Add to the video track' : 'Clip length unknown'}
                  disabled={!placeable}
                  onClick={() => onAddVideoToTimeline(clip.id)}
                >
                  +
                </button>
              </li>
            )
          })}
          {audioClips.map((clip) => {
            const hasDuration = Number.isFinite(clip.duration) && clip.duration > 0
            const selected = selection?.kind === 'audio' && selection.id === clip.id
            return (
              <li
                key={clip.id}
                className={selected ? 'selected' : undefined}
                draggable
                onDragStart={(event) => {
                  event.dataTransfer.setData(AUDIO_DRAG_TYPE, clip.id)
                  event.dataTransfer.effectAllowed = 'copy'
                }}
              >
                <button type="button" className="clip audio-clip" onClick={() => onSelectAudio(clip.id)}>
                  <span className="clip-icon" aria-hidden="true">
                    ♪
                  </span>
                  <span className="clip-name" title={clip.name}>
                    {clip.name}
                  </span>
                  <span className="clip-meta">{hasDuration ? formatDuration(clip.duration) : 'Audio'}</span>
                </button>
                <button
                  type="button"
                  className="remove"
                  aria-label={`Remove ${clip.name}`}
                  onClick={() => onRemoveAudio(clip.id)}
                >
                  ×
                </button>
                <button
                  type="button"
                  className="add"
                  aria-label={`Add ${clip.name} to the audio track`}
                  title="Add to the audio track"
                  onClick={() => onAddAudioToTimeline(clip.id)}
                >
                  +
                </button>
              </li>
            )
          })}

        </ul>
      )}
    </section>
  )
}
