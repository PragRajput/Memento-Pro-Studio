import { useEffect, useMemo, useRef, useState } from 'react'
import {
  audioItemEnd,
  clampAudioStart,
  createAudioItem,
  findAudioPlacement,
  nextAudioStart,
  splitAudioAt,
  trimAudioItem,
} from './audioTimeline.ts'
import { ExportDialog } from './components/ExportDialog.tsx'
import type { MediaSelection } from './components/MediaBin.tsx'
import { MediaBin } from './components/MediaBin.tsx'
import { Preview } from './components/Preview.tsx'
import { Timeline } from './components/Timeline.tsx'
import { outputSize } from './export/plan.ts'
import { useExporter } from './export/useExporter.ts'
import { loadMedia } from './media.ts'
import {
  createTextOverlay,
  moveTextOverlay,
  splitTextAt as splitTextAtTime,
  trimTextOverlay,
} from './textTimeline.ts'
import { createItem, insertItem, itemLength, moveItem, splitAt, timelineDuration, trimItem } from './timeline.ts'
import type { AudioClip, AudioTimelineItem, MediaClip, TextOverlay, TimelineItem } from './types.ts'
import { useAudioLanePlayback } from './useAudioLanePlayback.ts'
import { useSequencePlayer } from './useSequencePlayer.ts'
import './App.css'

function App() {
  const [clips, setClips] = useState<MediaClip[]>([])
  const [audioClips, setAudioClips] = useState<AudioClip[]>([])
  const [selection, setSelection] = useState<MediaSelection>(null)
  const [importing, setImporting] = useState(0)
  const [errors, setErrors] = useState<string[]>([])
  const [items, setItems] = useState<TimelineItem[]>([])
  const [audioItems, setAudioItems] = useState<AudioTimelineItem[]>([])
  const [textItems, setTextItems] = useState<TextOverlay[]>([])
  const [selectedItemId, setSelectedItemId] = useState<string | null>(null)
  const [selectedAudioItemId, setSelectedAudioItemId] = useState<string | null>(null)
  const [selectedTextId, setSelectedTextId] = useState<string | null>(null)
  const [showingClip, setShowingClip] = useState(true)
  const [pixelsPerSecond, setPixelsPerSecond] = useState(60)
  const [exportOpen, setExportOpen] = useState(false)
  const timelineVideoRef = useRef<HTMLVideoElement>(null)
  const timelineAudioRef = useRef<HTMLAudioElement>(null)

  const clipsById = useMemo(() => new Map(clips.map((clip) => [clip.id, clip])), [clips])
  const audioClipsById = useMemo(() => new Map(audioClips.map((clip) => [clip.id, clip])), [audioClips])
  const audioDuration = audioItems.reduce((max, item) => Math.max(max, audioItemEnd(item)), 0)
  const textDuration = textItems.reduce((max, item) => Math.max(max, item.start + item.duration), 0)
  const totalDuration = Math.max(timelineDuration(items), audioDuration, textDuration)
  const player = useSequencePlayer(timelineVideoRef, items, clipsById, totalDuration)

  useAudioLanePlayback(timelineAudioRef, audioItems, audioClipsById, player.time, player.playing)
  const videoSplitResult = splitAt(items, player.time)
  const audioSplitResult = splitAudioAt(audioItems, player.time)
  const textSplitResult = splitTextAtTime(textItems, player.time)
  const exporter = useExporter(items, clipsById, audioItems, audioClipsById, textItems)
  // A selection stops being valid the moment its item disappears, however that
  // happened (deleted directly, or its clip removed); derive it instead of tracking
  // every removal path separately.
  const validSelectedItemId =
    selectedItemId !== null && items.some((item) => item.id === selectedItemId) ? selectedItemId : null
  const validSelectedAudioItemId =
    selectedAudioItemId !== null && audioItems.some((item) => item.id === selectedAudioItemId)
      ? selectedAudioItemId
      : null
  const validSelectedTextId =
    selectedTextId !== null && textItems.some((item) => item.id === selectedTextId) ? selectedTextId : null


  const importFiles = async (files: File[]) => {
    if (files.length === 0) return
    setImporting((count) => count + files.length)
    const results = await Promise.allSettled(files.map(loadMedia))
    setImporting((count) => count - files.length)

    const loadedVideo = results.flatMap((result) =>
      result.status === 'fulfilled' && result.value.kind === 'video' ? [result.value.clip] : [],
    )
    const loadedAudio = results.flatMap((result) =>
      result.status === 'fulfilled' && result.value.kind === 'audio' ? [result.value.clip] : [],
    )
    const failed = results.flatMap((result, index) =>
      result.status === 'rejected' ? [`${files[index].name}: ${errorMessage(result.reason)}`] : [],
    )
    if (loadedVideo.length > 0) setClips((current) => [...current, ...loadedVideo])
    if (loadedAudio.length > 0) setAudioClips((current) => [...current, ...loadedAudio])
    setErrors(failed)
    if (loadedVideo.length > 0) setSelection((current) => current ?? { kind: 'video', id: loadedVideo[0].id })
    else if (loadedAudio.length > 0) setSelection((current) => current ?? { kind: 'audio', id: loadedAudio[0].id })
  }

  const selectVideoClip = (id: string) => {
    player.pause()
    setSelection({ kind: 'video', id })
    setShowingClip(true)
  }

  const selectAudioClip = (id: string) => {
    player.pause()
    setSelection({ kind: 'audio', id })
    setShowingClip(true)
  }

  const removeClip = (id: string) => {
    const clip = clipsById.get(id)
    if (clip) URL.revokeObjectURL(clip.url)
    setClips((current) => current.filter((candidate) => candidate.id !== id))
    setItems((current) => current.filter((item) => item.clipId !== id))
    setSelection((current) => (current?.kind === 'video' && current.id === id ? null : current))
  }

  const removeAudioClip = (id: string) => {
    const clip = audioClipsById.get(id)
    if (clip) URL.revokeObjectURL(clip.url)
    setAudioClips((current) => current.filter((candidate) => candidate.id !== id))
    setAudioItems((current) => current.filter((item) => item.clipId !== id))
    setSelection((current) => (current?.kind === 'audio' && current.id === id ? null : current))
  }

  /** Any timeline action switches the preview from the selected clip to the timeline. */
  const showTimeline = () => setShowingClip(false)

  const addToTimeline = (clipId: string, explicitIndex?: number) => {
    const clip = clipsById.get(clipId)
    if (!clip || !Number.isFinite(clip.duration)) return
    const item = createItem(clipId, 0, clip.duration)
    setItems((current) => insertItem(current, item, explicitIndex ?? current.length))
    setSelectedItemId(item.id)
    setSelectedAudioItemId(null)
    setSelectedTextId(null)
    showTimeline()
  }

  const addAudioToTimeline = (clipId: string, desiredStart?: number) => {
    const clip = audioClipsById.get(clipId)
    if (!clip) return

    const clipDuration = Number.isFinite(clip.duration) && clip.duration > 0 ? clip.duration : 30
    let targetStart: number
    if (desiredStart !== undefined) {
      targetStart = desiredStart < 1.5 ? 0 : desiredStart
    } else {
      // From '+' button: if beginning of track is open, place at 0:00
      const startBlocked = audioItems.some((item) => item.start < 1.5)
      targetStart = startBlocked ? nextAudioStart(audioItems) : 0
    }

    const placement = findAudioPlacement(
      audioItems,
      targetStart,
      clipDuration,
    )

    if (placement === null) {
      setErrors(['Audio track is full. Trim or remove an audio item to make room.'])
      return
    }

    const item = createAudioItem(clipId, 0, placement.length, placement.start)
    setAudioItems((current) => [...current, item])
    setSelectedAudioItemId(item.id)
    setSelectedItemId(null)
    setSelectedTextId(null)
    setErrors([])
    showTimeline()
  }

  const addTextOverlay = () => {
    const effectiveDuration = totalDuration
    if (effectiveDuration <= 0) {
      setErrors(['Add a clip to the timeline before adding a title.'])
      return
    }
    const start = Math.min(player.time, Math.max(0, effectiveDuration - 1))
    const duration = Math.min(3, Math.max(0.5, effectiveDuration - start))
    const newTitle = createTextOverlay(start, duration)
    setTextItems((current) => [...current, newTitle])
    setSelectedTextId(newTitle.id)
    setSelectedItemId(null)
    setSelectedAudioItemId(null)
    setErrors([])
    showTimeline()
  }


  const trim = (id: string, edge: 'in' | 'out', sourceTime: number) => {
    setItems((current) => {
      const item = current.find((candidate) => candidate.id === id)
      const clip = item && clipsById.get(item.clipId)
      return clip ? trimItem(current, id, edge, sourceTime, clip.duration) : current
    })
    showTimeline()
  }

  const trimAudio = (id: string, edge: 'in' | 'out', sourceTime: number) => {
    setAudioItems((current) => {
      const item = current.find((candidate) => candidate.id === id)
      const clip = item && audioClipsById.get(item.clipId)
      return clip ? trimAudioItem(current, id, edge, sourceTime, clip.duration, player.duration) : current
    })
    showTimeline()
  }

  const trimText = (id: string, edge: 'in' | 'out', sourceTime: number) => {
    setTextItems((current) => trimTextOverlay(current, id, edge, sourceTime, player.duration))
    showTimeline()
  }

  const moveAudio = (id: string, start: number) => {
    setAudioItems((current) => {
      const item = current.find((candidate) => candidate.id === id)
      if (!item) return current
      const clamped = clampAudioStart(current, id, start, itemLength(item), player.duration)
      return clamped === null ? current : current.map((candidate) => (candidate.id === id ? { ...candidate, start: clamped } : candidate))
    })
    showTimeline()
  }

  const moveText = (id: string, start: number) => {
    setTextItems((current) => moveTextOverlay(current, id, start, player.duration))
    showTimeline()
  }

  const updateText = (updated: TextOverlay) => {
    setTextItems((current) => current.map((item) => (item.id === updated.id ? updated : item)))
  }

  const setAudioVolume = (id: string, volume: number) => {
    setAudioItems((current) => current.map((item) => (item.id === id ? { ...item, volume } : item)))
  }

  const toggleMuted = (id: string) => {
    setItems((current) => current.map((item) => (item.id === id ? { ...item, muted: !item.muted } : item)))
  }

  const split = () => {
    if (videoSplitResult !== null) {
      setItems(videoSplitResult.items)
      setSelectedItemId(videoSplitResult.rightId)
    }
    if (audioSplitResult !== null) {
      setAudioItems(audioSplitResult.items)
      setSelectedAudioItemId(audioSplitResult.rightId)
    }
    if (textSplitResult !== null) {
      setTextItems(textSplitResult.items)
      setSelectedTextId(textSplitResult.rightId)
    }
    showTimeline()
  }

  const deleteSelectedItem = () => {
    if (validSelectedItemId !== null) {
      setItems((current) => current.filter((item) => item.id !== validSelectedItemId))
      setSelectedItemId(null)
    } else if (validSelectedAudioItemId !== null) {
      setAudioItems((current) => current.filter((item) => item.id !== validSelectedAudioItemId))
      setSelectedAudioItemId(null)
    } else if (validSelectedTextId !== null) {
      setTextItems((current) => current.filter((item) => item.id !== validSelectedTextId))
      setSelectedTextId(null)
    } else {
      return
    }
    showTimeline()
  }

  const seek = (time: number) => {
    player.seek(time)
    showTimeline()
  }

  const togglePlay = () => {
    showTimeline()
    if (player.playing) player.pause()
    else player.play()
  }

  // Space plays/pauses, S splits, Delete/Backspace removes the selected timeline item.
  useEffect(() => {
    const handleKey = (event: KeyboardEvent) => {
      if (event.metaKey || event.ctrlKey || event.altKey) return
      if ((event.target as Element).closest('button, input, textarea, select, video, audio')) return
      if (exportOpen) return
      if (event.key === ' ') togglePlay()
      else if (event.key === 's' || event.key === 'S') split()
      else if (event.key === 'Delete' || event.key === 'Backspace') deleteSelectedItem()
      else return
      event.preventDefault()
    }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  })

  const firstClip = items.length > 0 ? clipsById.get(items[0].clipId) : undefined
  const exportSize = firstClip ? outputSize(firstClip) : null
  const exportLabel = exportSize ? `${exportSize.width}×${exportSize.height} · 30 fps` : ''

  return (
    <div className="app">
      <header className="app-header">
        <h1>Mini Video Editor</h1>
        <button
          type="button"
          className="export-button"
          disabled={items.length === 0}
          onClick={() => {
            exporter.reset()
            setExportOpen(true)
          }}
        >
          Export
        </button>
      </header>
      <MediaBin
        clips={clips}
        audioClips={audioClips}
        selection={showingClip ? selection : null}
        importing={importing}
        errors={errors}
        onImport={importFiles}
        onSelectVideo={selectVideoClip}
        onSelectAudio={selectAudioClip}
        onRemoveVideo={removeClip}
        onRemoveAudio={removeAudioClip}
        onAddVideoToTimeline={(clipId) => addToTimeline(clipId)}
        onAddAudioToTimeline={(clipId) => addAudioToTimeline(clipId)}
      />
      <Preview
        selection={showingClip ? selection : null}
        videoClips={clipsById}
        audioClips={audioClipsById}
        timelineEmpty={items.length === 0 && audioItems.length === 0 && textItems.length === 0}
        hasVideo={items.length > 0}
        timelineVideoRef={timelineVideoRef}
        timelineAudioRef={timelineAudioRef}
        textItems={textItems}
        selectedTextId={validSelectedTextId}
        time={player.time}
        onSelectText={(id) => {
          setSelectedTextId(id)
          if (id !== null) {
            setSelectedItemId(null)
            setSelectedAudioItemId(null)
          }
          showTimeline()
        }}
        onUpdateText={updateText}
        onDeleteText={(id) => {
          setTextItems((current) => current.filter((item) => item.id !== id))
          setSelectedTextId(null)
          showTimeline()
        }}
      />
      <Timeline
        items={items}
        clips={clipsById}
        selectedItemId={validSelectedItemId}
        time={player.time}
        duration={player.duration}
        playing={player.playing}
        canSplit={videoSplitResult !== null || audioSplitResult !== null || textSplitResult !== null}
        pixelsPerSecond={pixelsPerSecond}
        onZoom={setPixelsPerSecond}
        onSeek={seek}
        onTogglePlay={togglePlay}
        onSplit={split}
        onDelete={deleteSelectedItem}
        onSelectItem={(id) => {
          setSelectedItemId(id)
          setSelectedAudioItemId(null)
          setSelectedTextId(null)
          showTimeline()
        }}
        onAddClip={addToTimeline}
        onMoveItem={(from, to) => {
          setItems((current) => moveItem(current, from, to))
          showTimeline()
        }}
        onTrimItem={trim}
        onToggleMute={toggleMuted}
        audioItems={audioItems}
        audioClips={audioClipsById}
        selectedAudioItemId={validSelectedAudioItemId}
        onSelectAudioItem={(id) => {
          setSelectedAudioItemId(id)
          setSelectedItemId(null)
          setSelectedTextId(null)
          showTimeline()
        }}
        onAddAudioClip={addAudioToTimeline}
        onMoveAudioItem={moveAudio}
        onTrimAudioItem={trimAudio}
        onAudioVolumeChange={setAudioVolume}
        textItems={textItems}
        selectedTextId={validSelectedTextId}
        onSelectTextItem={(id) => {
          setSelectedTextId(id)
          if (id !== null) {
            setSelectedItemId(null)
            setSelectedAudioItemId(null)
          }
          showTimeline()
        }}
        onAddText={addTextOverlay}
        onMoveTextItem={moveText}
        onTrimTextItem={trimText}
      />
      {exportOpen && (
        <ExportDialog
          state={exporter.state}
          outputLabel={exportLabel}
          duration={timelineDuration(items)}
          onStart={exporter.start}
          onCancel={exporter.cancel}
          onClose={() => {
            if (exporter.state.status !== 'running') setExportOpen(false)
          }}
        />
      )}
    </div>
  )
}

function errorMessage(reason: unknown): string {
  return reason instanceof Error ? reason.message : String(reason)
}

export default App
