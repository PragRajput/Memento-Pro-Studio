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

type MediaFilter = 'all' | 'video' | 'photo' | 'audio'

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
  const [filter, setFilter] = useState<MediaFilter>('all')

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

  const totalClips = clips.length + audioClips.length
  const videoClipsOnly = clips.filter((c) => c.mediaType !== 'image')
  const photoClipsOnly = clips.filter((c) => c.mediaType === 'image')
  const showAudio = filter === 'all' || filter === 'audio'

  return (
    <section
      className={`panel media-bin${dragging ? ' dragging' : ''}`}
      aria-label="Media Bin"
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      <header className="panel-header media-bin-header">
        <div className="panel-title-group">
          <h2>Media Pool</h2>
          <span className="media-count-badge">{totalClips}</span>
        </div>
        <button
          type="button"
          className="import-btn"
          onClick={() => inputRef.current?.click()}
          title="Import video, photo, or audio files from your computer"
        >
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <line x1="12" y1="5" x2="12" y2="19" />
            <line x1="5" y1="12" x2="19" y2="12" />
          </svg>
          Import
        </button>
        <input
          ref={inputRef}
          type="file"
          accept="video/*,audio/*,image/*"
          multiple
          hidden
          onChange={(event) => {
            onImport(Array.from(event.target.files ?? []))
            // Allow importing the same file again.
            event.target.value = ''
          }}
        />
      </header>

      {/* Filter Tabs */}
      {totalClips > 0 && (
        <div className="media-filter-bar">
          <button
            type="button"
            className={`filter-tab${filter === 'all' ? ' active' : ''}`}
            onClick={() => setFilter('all')}
          >
            All <span className="tab-count">{totalClips}</span>
          </button>
          <button
            type="button"
            className={`filter-tab${filter === 'video' ? ' active' : ''}`}
            onClick={() => setFilter('video')}
          >
            Video <span className="tab-count">{videoClipsOnly.length}</span>
          </button>
          <button
            type="button"
            className={`filter-tab${filter === 'photo' ? ' active' : ''}`}
            onClick={() => setFilter('photo')}
          >
            Photos <span className="tab-count">{photoClipsOnly.length}</span>
          </button>
          <button
            type="button"
            className={`filter-tab${filter === 'audio' ? ' active' : ''}`}
            onClick={() => setFilter('audio')}
          >
            Audio <span className="tab-count">{audioClips.length}</span>
          </button>
        </div>
      )}

      {importing > 0 && (
        <div className="import-status-bar">
          <span className="spinner" />
          <span>Importing {importing} file(s)…</span>
        </div>
      )}

      {errors.map((error, index) => (
        <div key={index} className="error-notice">
          <span className="error-icon">⚠</span>
          <span>{error}</span>
        </div>
      ))}

      {totalClips === 0 && importing === 0 ? (
        <div className="media-empty-dropzone" onClick={() => inputRef.current?.click()}>
          <div className="dropzone-icon-box">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
              <polyline points="17 8 12 3 7 8" />
              <line x1="12" y1="3" x2="12" y2="15" />
            </svg>
          </div>
          <p className="dropzone-title">Drop media here</p>
          <p className="dropzone-subtitle">or click to browse your files</p>
          <div className="dropzone-tags">
            <span>MP4 / MOV</span>
            <span>PNG / JPG</span>
            <span>WebM</span>
            <span>MP3 / WAV</span>
          </div>
        </div>
      ) : (
        <ul className="clip-list">
          {clips
            .filter(
              (c) =>
                filter === 'all' ||
                (filter === 'video' && c.mediaType !== 'image') ||
                (filter === 'photo' && c.mediaType === 'image'),
            )
            .map((clip) => {
              const placeable = Number.isFinite(clip.duration)
              const selected = selection?.kind === 'video' && selection.id === clip.id
              const isImage = clip.mediaType === 'image'
              return (
                <li
                  key={clip.id}
                  className={`clip-item${selected ? ' selected' : ''}`}
                  draggable={placeable}
                  onDragStart={(event) => {
                    event.dataTransfer.setData(CLIP_DRAG_TYPE, clip.id)
                    event.dataTransfer.effectAllowed = 'copy'
                  }}
                >
                  <button
                    type="button"
                    className="clip-card"
                    onClick={() => onSelectVideo(clip.id)}
                    title={`Click to preview: ${clip.name}`}
                  >
                    <div className="thumb-wrapper">
                      <img src={clip.thumbnail} alt="" />
                      <span className="thumb-duration">{isImage ? 'PHOTO' : formatDuration(clip.duration)}</span>
                      <span className={`media-type-tag ${isImage ? 'photo-tag' : 'video-tag'}`}>
                        {isImage ? 'PHOTO' : 'VIDEO'}
                      </span>
                    </div>
                    <div className="clip-info">
                      <span className="clip-name" title={clip.name}>
                        {clip.name}
                      </span>
                      <span className="clip-meta">
                        {clip.width}×{clip.height}
                      </span>
                    </div>
                  </button>

                  <div className="clip-actions">
                    <button
                      type="button"
                      className="clip-btn add-btn"
                      aria-label={`Add ${clip.name} to timeline`}
                      title={placeable ? 'Add to Timeline (+)' : 'Duration unknown'}
                      disabled={!placeable}
                      onClick={() => onAddVideoToTimeline(clip.id)}
                    >
                      +
                    </button>
                    <button
                      type="button"
                      className="clip-btn remove-btn"
                      aria-label={`Remove ${clip.name}`}
                      title="Remove from pool"
                      onClick={() => onRemoveVideo(clip.id)}
                    >
                      ×
                    </button>
                  </div>
                </li>
              )
            })}

          {showAudio &&
            audioClips.map((clip) => {
              const hasDuration = Number.isFinite(clip.duration) && clip.duration > 0
              const selected = selection?.kind === 'audio' && selection.id === clip.id
              return (
                <li
                  key={clip.id}
                  className={`clip-item${selected ? ' selected' : ''}`}
                  draggable
                  onDragStart={(event) => {
                    event.dataTransfer.setData(AUDIO_DRAG_TYPE, clip.id)
                    event.dataTransfer.effectAllowed = 'copy'
                  }}
                >
                  <button
                    type="button"
                    className="clip-card"
                    onClick={() => onSelectAudio(clip.id)}
                    title={`Click to preview: ${clip.name}`}
                  >
                    <div className="thumb-wrapper audio-thumb">
                      <span className="audio-wave-icon" aria-hidden="true">♪</span>
                      <span className="thumb-duration">
                        {hasDuration ? formatDuration(clip.duration) : '--:--'}
                      </span>
                      <span className="media-type-tag audio-tag">AUDIO</span>
                    </div>
                    <div className="clip-info">
                      <span className="clip-name" title={clip.name}>
                        {clip.name}
                      </span>
                      <span className="clip-meta">Audio Track</span>
                    </div>
                  </button>

                  <div className="clip-actions">
                    <button
                      type="button"
                      className="clip-btn add-btn"
                      aria-label={`Add ${clip.name} to timeline`}
                      title="Add to Audio Track (+)"
                      onClick={() => onAddAudioToTimeline(clip.id)}
                    >
                      +
                    </button>
                    <button
                      type="button"
                      className="clip-btn remove-btn"
                      aria-label={`Remove ${clip.name}`}
                      title="Remove from pool"
                      onClick={() => onRemoveAudio(clip.id)}
                    >
                      ×
                    </button>
                  </div>
                </li>
              )
            })}
        </ul>
      )}
    </section>
  )
}
