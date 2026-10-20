import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  audioItemEnd,
  clampAudioStart,
  createAudioItem,
  findAudioPlacement,
  nextAudioStart,
  splitAudioAt,
  trimAudioItem,
} from './audioTimeline.ts'
import { ConfirmNewProjectModal } from './components/ConfirmNewProjectModal.tsx'
import { ExportDialog } from './components/ExportDialog.tsx'
import { KeyboardShortcutsModal } from './components/KeyboardShortcutsModal.tsx'
import type { MediaSelection } from './components/MediaBin.tsx'
import { MediaBin } from './components/MediaBin.tsx'
import { Preview } from './components/Preview.tsx'
import { Timeline } from './components/Timeline.tsx'
import { outputSizeForAspectRatio } from './export/plan.ts'
import { useExporter } from './export/useExporter.ts'
import { formatTimecode } from './format.ts'
import { extractAudioPeaks, loadMedia } from './media.ts'
import {
  clearProjectStorage,
  persistAudioAsset,
  persistProjectMeta,
  persistVideoAsset,
  removeAudioAsset,
  removeVideoAsset,
  restoreProject,
} from './projectStorage.ts'
import {
  createTextOverlay,
  moveTextOverlay,
  splitTextAt as splitTextAtTime,
  trimTextOverlay,
} from './textTimeline.ts'
import { createItem, insertItem, itemLength, itemStarts, moveItem, splitAt, timelineDuration, trimItem } from './timeline.ts'
import { createDefaultOverlay } from './overlayDraw.ts'
import {
  clampLayerStart,
  createVideoLayerItem,
  findLayerPlacement,
  removeVideoLayer,
  splitLayerAt,
  trimLayerItem,
  videoLayersDuration,
  MAX_VIDEO_LAYERS,
} from './videoLayers.ts'
import {
  cleanTransitions,
  createTransition,
  maxTransitionDuration,
} from './transitionTimeline.ts'
import type { AnimatableProperty, AspectRatio, AudioClip, AudioTimelineItem, Keyframe, MediaClip, OverlayItem, TextOverlay, TimelineItem, Transition, TransitionType, VideoLayerItem } from './types.ts'
import { removeKeyframe, setKeyframe, updateKeyframe } from './keyframes.ts'
import { useAudioLanePlayback } from './useAudioLanePlayback.ts'
import { useHistory } from './useHistory.ts'
import type { HistorySnapshot } from './useHistory.ts'
import { useSequencePlayer } from './useSequencePlayer.ts'
import './App.css'

function App() {
  const [clips, setClips] = useState<MediaClip[]>([])
  const [audioClips, setAudioClips] = useState<AudioClip[]>([])
  const [selection, setSelection] = useState<MediaSelection>(null)
  const [importing, setImporting] = useState(0)
  const [errors, setErrors] = useState<string[]>([])
  const [items, setItems] = useState<TimelineItem[]>([])
  const [transitions, setTransitions] = useState<Transition[]>([])
  const [audioItems, setAudioItems] = useState<AudioTimelineItem[]>([])
  const [audioTrackCount, setAudioTrackCount] = useState(2)
  const [textItems, setTextItems] = useState<TextOverlay[]>([])
  const [overlayItems, setOverlayItems] = useState<OverlayItem[]>([])
  const [videoLayers, setVideoLayers] = useState<VideoLayerItem[]>([])
  const [videoLayerCount, setVideoLayerCount] = useState(1)
  const [selectedLayerItemId, setSelectedLayerItemId] = useState<string | null>(null)
  const [aspectRatio, setAspectRatio] = useState<AspectRatio>('16:9')
  const [selectedItemId, setSelectedItemId] = useState<string | null>(null)
  const [selectedAudioItemId, setSelectedAudioItemId] = useState<string | null>(null)
  const [selectedTextId, setSelectedTextId] = useState<string | null>(null)
  const [selectedOverlayId, setSelectedOverlayId] = useState<string | null>(null)
  const [selectedTransitionId, setSelectedTransitionId] = useState<string | null>(null)
  const [showingClip, setShowingClip] = useState(true)
  const [pixelsPerSecond, setPixelsPerSecond] = useState(60)
  const [exportOpen, setExportOpen] = useState(false)
  const [shortcutsOpen, setShortcutsOpen] = useState(false)
  const [confirmNewOpen, setConfirmNewOpen] = useState(false)
  const [storageLoaded, setStorageLoaded] = useState(false)
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved'>('idle')
  const timelineVideoRef = useRef<HTMLVideoElement>(null)
  const timelineSecondaryVideoRef = useRef<HTMLVideoElement>(null)
  const timelineImageRef = useRef<HTMLImageElement>(null)
  const timelineSecondaryImageRef = useRef<HTMLImageElement>(null)
  const timelineAudioRef = useRef<HTMLAudioElement>(null)

  const clipsById = useMemo(() => new Map(clips.map((clip) => [clip.id, clip])), [clips])
  const audioClipsById = useMemo(() => new Map(audioClips.map((clip) => [clip.id, clip])), [audioClips])
  const maxTrackInItems = audioItems.reduce((max, item) => Math.max(max, item.trackIndex ?? 0), 0)
  const effectiveTrackCount = Math.max(audioTrackCount, maxTrackInItems + 1, 1)
  const audioDuration = audioItems.reduce((max, item) => Math.max(max, audioItemEnd(item)), 0)
  const textDuration = textItems.reduce((max, item) => Math.max(max, item.start + item.duration), 0)
  const overlayDuration = overlayItems.reduce((max, item) => Math.max(max, item.start + item.duration), 0)
  const layerDuration = videoLayersDuration(videoLayers)
  const totalDuration = Math.max(timelineDuration(items), audioDuration, textDuration, overlayDuration, layerDuration)

  const validTransitions = useMemo(() => cleanTransitions(items, transitions), [items, transitions])
  const validSelectedTransitionId =
    selectedTransitionId !== null && validTransitions.some((t) => t.id === selectedTransitionId)
      ? selectedTransitionId
      : null

  const currentSnapshot = useMemo<HistorySnapshot>(
    () => ({
      items,
      audioItems,
      textItems,
      overlayItems,
      videoLayers,
      transitions,
      aspectRatio,
    }),
    [items, audioItems, textItems, overlayItems, videoLayers, transitions, aspectRatio],
  )

  const applySnapshot = useCallback((snapshot: HistorySnapshot) => {
    setItems(snapshot.items)
    setAudioItems(snapshot.audioItems)
    setTextItems(snapshot.textItems)
    setOverlayItems(snapshot.overlayItems ?? [])
    setVideoLayers(snapshot.videoLayers ?? [])
    setTransitions(snapshot.transitions)
    setAspectRatio(snapshot.aspectRatio)
  }, [])

  const { canUndo, canRedo, undo, redo } = useHistory(currentSnapshot, applySnapshot, storageLoaded)

  const player = useSequencePlayer(
    timelineVideoRef,
    timelineSecondaryVideoRef,
    items,
    clipsById,
    validTransitions,
    totalDuration,
    timelineImageRef,
    timelineSecondaryImageRef,
  )

  useAudioLanePlayback(timelineAudioRef, audioItems, audioClipsById, player.time, player.playing)
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
  const validSelectedOverlayId =
    selectedOverlayId !== null && overlayItems.some((item) => item.id === selectedOverlayId)
      ? selectedOverlayId
      : null

  const validSelectedLayerItemId =
    selectedLayerItemId !== null && videoLayers.some((item) => item.id === selectedLayerItemId)
      ? selectedLayerItemId
      : null

  const selectedTransition = validTransitions.find((t) => t.id === validSelectedTransitionId) ?? null
  const selectedTransitionItemA = selectedTransition
    ? items.find((i) => i.id === selectedTransition.fromItemId) ?? null
    : null
  const selectedTransitionItemB = selectedTransition
    ? items.find((i) => i.id === selectedTransition.toItemId) ?? null
    : null
  const selectedTransitionMaxDuration =
    selectedTransitionItemA && selectedTransitionItemB
      ? maxTransitionDuration(selectedTransitionItemA, selectedTransitionItemB)
      : 3

  const videoSplitResult = splitAt(items, player.time)
  const audioSplitResult = splitAudioAt(audioItems, player.time, validSelectedAudioItemId)
  const textSplitResult = splitTextAtTime(textItems, player.time)
  const exporter = useExporter(
    items,
    clipsById,
    audioItems,
    audioClipsById,
    textItems,
    validTransitions,
    aspectRatio,
    overlayItems,
    videoLayers,
  )

  // 1. Rehydrate project from IndexedDB on initial mount
  useEffect(() => {
    let cancelled = false
    void restoreProject().then((restored) => {
      if (cancelled) return
      if (restored) {
        setItems(restored.items)
        setClips(restored.clips)
        setAudioItems(restored.audioItems)
        setAudioClips(restored.audioClips)
        setTextItems(restored.textItems)
        if (restored.overlayItems) {
          setOverlayItems(restored.overlayItems)
        }
        if (restored.videoLayers) {
          setVideoLayers(restored.videoLayers)
          setVideoLayerCount(
            Math.max(1, ...restored.videoLayers.map((layer) => layer.trackIndex + 1)),
          )
        }
        setTransitions(restored.transitions)
        setAudioTrackCount(restored.audioTrackCount)
        if (restored.aspectRatio) {
          setAspectRatio(restored.aspectRatio)
        }
        if (restored.items.length > 0 || restored.audioItems.length > 0) {
          setShowingClip(false)
        }
        setSaveStatus('saved')
      }
      setStorageLoaded(true)
    })
    return () => {
      cancelled = true
    }
  }, [])

  // Auto-analyze peaks and pitches for any audio clips missing them (e.g. from restored legacy projects)
  useEffect(() => {
    const unanalyzed = audioClips.filter((c) => !c.peaks || c.peaks.length === 0 || !c.pitches)
    if (unanalyzed.length === 0) return
    let cancelled = false
    void Promise.all(
      unanalyzed.map(async (clip) => {
        try {
          const analysis = await extractAudioPeaks(clip.file, 600)
          return { id: clip.id, ...analysis }
        } catch {
          return null
        }
      }),
    ).then((results) => {
      if (cancelled) return
      const updates = new Map(
        results
          .filter((r): r is { id: string; peaks: number[]; pitches: number[] } => r !== null)
          .map((r) => [r.id, r]),
      )
      if (updates.size > 0) {
        setAudioClips((current) =>
          current.map((c) => (updates.has(c.id) ? { ...c, ...updates.get(c.id)! } : c)),
        )
        for (const clip of audioClips) {
          const update = updates.get(clip.id)
          if (update) void persistAudioAsset({ ...clip, ...update })
        }
      }
    })
    return () => {
      cancelled = true
    }
  }, [audioClips])

  // 2. Debounced auto-save active project whenever edits occur
  useEffect(() => {
    if (!storageLoaded) return
    const timer = setTimeout(async () => {
      setSaveStatus('saving')
      await persistProjectMeta(
        items,
        clips,
        audioItems,
        audioClips,
        textItems,
        validTransitions,
        effectiveTrackCount,
        aspectRatio,
        overlayItems,
        videoLayers,
      )
      setSaveStatus('saved')
    }, 800)
    return () => clearTimeout(timer)
  }, [
    storageLoaded,
    items,
    clips,
    audioItems,
    audioClips,
    textItems,
    overlayItems,
    videoLayers,
    validTransitions,
    effectiveTrackCount,
    aspectRatio,
  ])

  // 3. Clear current project and reset to clean state
  const startNewProject = async () => {
    player.pause()
    for (const c of clips) URL.revokeObjectURL(c.url)
    for (const ac of audioClips) URL.revokeObjectURL(ac.url)
    await clearProjectStorage()
    setClips([])
    setAudioClips([])
    setItems([])
    setAudioItems([])
    setTextItems([])
    setOverlayItems([])
    setVideoLayers([])
    setVideoLayerCount(1)
    setSelectedLayerItemId(null)
    setTransitions([])
    setAudioTrackCount(2)
    setAspectRatio('16:9')
    setSelection(null)
    setSelectedItemId(null)
    setSelectedAudioItemId(null)
    setSelectedOverlayId(null)
    setSelectedTextId(null)
    setSelectedTransitionId(null)
    setShowingClip(true)
    setConfirmNewOpen(false)
    setSaveStatus('idle')
    player.seek(0)
  }

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
    if (loadedVideo.length > 0) {
      setClips((current) => [...current, ...loadedVideo])
      for (const clip of loadedVideo) void persistVideoAsset(clip)
    }
    if (loadedAudio.length > 0) {
      setAudioClips((current) => [...current, ...loadedAudio])
      for (const clip of loadedAudio) void persistAudioAsset(clip)
    }
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
    void removeVideoAsset(id)
  }

  const removeAudioClip = (id: string) => {
    const clip = audioClipsById.get(id)
    if (clip) URL.revokeObjectURL(clip.url)
    setAudioClips((current) => current.filter((candidate) => candidate.id !== id))
    setAudioItems((current) => current.filter((item) => item.clipId !== id))
    setSelection((current) => (current?.kind === 'audio' && current.id === id ? null : current))
    void removeAudioAsset(id)
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

  const addAudioToTimeline = (clipId: string, desiredStart?: number, explicitTrackIndex?: number) => {
    const clip = audioClipsById.get(clipId)
    if (!clip) return

    const clipDuration = Number.isFinite(clip.duration) && clip.duration > 0 ? clip.duration : 30

    let chosenTrack = explicitTrackIndex ?? 0
    if (explicitTrackIndex === undefined) {
      // Find the first track where 0:00 (or playhead) is free
      const freeTrack = Array.from({ length: effectiveTrackCount }, (_, idx) => idx).find((idx) => {
        return !audioItems.some((item) => (item.trackIndex ?? 0) === idx && item.start < 1.5)
      })
      if (freeTrack !== undefined) {
        chosenTrack = freeTrack
      } else {
        const trackWithRoom = Array.from({ length: effectiveTrackCount }, (_, idx) => idx).find((idx) => {
          return findAudioPlacement(audioItems, 0, clipDuration, idx, player.duration) !== null
        })
        if (trackWithRoom !== undefined) {
          chosenTrack = trackWithRoom
        } else {
          chosenTrack = effectiveTrackCount
        }
      }
    }

    let targetStart: number
    if (desiredStart !== undefined) {
      targetStart = desiredStart < 1.5 ? 0 : desiredStart
    } else {
      const startBlocked = audioItems.some(
        (item) => (item.trackIndex ?? 0) === chosenTrack && item.start < 1.5,
      )
      targetStart = startBlocked ? nextAudioStart(audioItems, chosenTrack) : 0
    }

    let placement = findAudioPlacement(
      audioItems,
      targetStart,
      clipDuration,
      chosenTrack,
      player.duration,
    )

    if (placement === null && explicitTrackIndex === undefined) {
      const newTrackIndex = effectiveTrackCount
      const newPlacement = findAudioPlacement(audioItems, 0, clipDuration, newTrackIndex, player.duration)
      if (newPlacement !== null) {
        placement = newPlacement
        chosenTrack = newTrackIndex
      }
    }

    if (placement === null) {
      setErrors(['Audio track is full. Trim or remove an audio item to make room.'])
      return
    }

    const item = createAudioItem(clipId, 0, placement.length, placement.start, chosenTrack)
    setAudioItems((current) => [...current, item])
    setAudioTrackCount((prev) => Math.max(prev, chosenTrack + 1))
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
      const clamped = clampAudioStart(
        current,
        id,
        start,
        itemLength(item),
        player.duration,
        item.trackIndex ?? 0,
      )
      return clamped === null ? current : current.map((candidate) => (candidate.id === id ? { ...candidate, start: clamped } : candidate))
    })
    showTimeline()
  }

  const moveAudioToTrack = (id: string, targetTrackIndex: number) => {
    setAudioItems((current) => {
      const item = current.find((candidate) => candidate.id === id)
      if (!item) return current
      const len = itemLength(item)
      const clamped = clampAudioStart(current, id, item.start, len, player.duration, targetTrackIndex)
      if (clamped !== null) {
        return current.map((candidate) =>
          candidate.id === id ? { ...candidate, trackIndex: targetTrackIndex, start: clamped } : candidate,
        )
      }
      const placement = findAudioPlacement(
        current.filter((c) => c.id !== id),
        item.start,
        len,
        targetTrackIndex,
        player.duration,
      )
      if (placement !== null) {
        return current.map((candidate) =>
          candidate.id === id
            ? {
                ...candidate,
                trackIndex: targetTrackIndex,
                start: placement.start,
                outPoint: candidate.inPoint + placement.length,
              }
            : candidate,
        )
      }
      setErrors([`Cannot move audio to Track ${targetTrackIndex + 1}: no space available.`])
      return current
    })
    setAudioTrackCount((prev) => Math.max(prev, targetTrackIndex + 1))
    showTimeline()
  }

  const addAudioTrack = () => {
    setAudioTrackCount((prev) => Math.max(prev, effectiveTrackCount) + 1)
  }

  const removeAudioTrack = (trackIndexToRemove: number) => {
    const hasItems = audioItems.some((item) => (item.trackIndex ?? 0) === trackIndexToRemove)
    if (hasItems) return
    setAudioItems((current) =>
      current.map((item) => {
        const idx = item.trackIndex ?? 0
        return idx > trackIndexToRemove ? { ...item, trackIndex: idx - 1 } : item
      }),
    )
    setAudioTrackCount(Math.max(1, effectiveTrackCount - 1))
  }

  const moveText = (id: string, start: number) => {
    setTextItems((current) => moveTextOverlay(current, id, start, player.duration))
    showTimeline()
  }

  const updateText = (updated: TextOverlay) => {
    setTextItems((current) => current.map((item) => (item.id === updated.id ? updated : item)))
  }

  const addOverlay = (category: OverlayItem['category'] = 'media') => {
    const newOverlay = createDefaultOverlay(category, player.time, 4, clips[0]?.id)
    setOverlayItems((curr) => [...curr, newOverlay])
    setSelectedOverlayId(newOverlay.id)
    setSelectedItemId(null)
    setSelectedAudioItemId(null)
    setSelectedTextId(null)
    setSelectedTransitionId(null)
    showTimeline()
  }

  const addMediaOverlay = (clipId: string, start: number) => {
    const newOverlay = createDefaultOverlay('media', start, 4, clipId)
    setOverlayItems((curr) => [...curr, newOverlay])
    setSelectedOverlayId(newOverlay.id)
    setSelectedItemId(null)
    setSelectedAudioItemId(null)
    setSelectedTextId(null)
    setSelectedTransitionId(null)
    showTimeline()
  }

  const updateOverlay = (updated: OverlayItem) => {
    setOverlayItems((curr) => curr.map((item) => (item.id === updated.id ? updated : item)))
  }

  const deleteOverlay = (id: string) => {
    setOverlayItems((curr) => curr.filter((item) => item.id !== id))
    if (selectedOverlayId === id) setSelectedOverlayId(null)
    showTimeline()
  }

  const moveOverlay = (id: string, start: number) => {
    setOverlayItems((curr) => curr.map((item) => (item.id === id ? { ...item, start } : item)))
    showTimeline()
  }

  const trimOverlay = (id: string, edge: 'in' | 'out', time: number) => {
    setOverlayItems((curr) =>
      curr.map((item) => {
        if (item.id !== id) return item
        if (edge === 'in') {
          const newStart = Math.min(time, item.start + item.duration - 0.2)
          const newDuration = item.duration - (newStart - item.start)
          return { ...item, start: newStart, duration: Math.max(0.2, newDuration) }
        } else {
          return { ...item, duration: Math.max(0.2, time - item.start) }
        }
      }),
    )
    showTimeline()
  }

  const addVideoLayerTrack = () => {
    setVideoLayerCount((count) => Math.min(MAX_VIDEO_LAYERS, count + 1))
  }

  const removeVideoLayerTrack = (trackIndex: number) => {
    setVideoLayers((current) => removeVideoLayer(current, trackIndex))
    setVideoLayerCount((count) => Math.max(1, count - 1))
  }

  const addClipToVideoLayer = (clipId: string, trackIndex: number, desiredStart?: number) => {
    const clip = clipsById.get(clipId)
    if (clip === undefined) return
    const duration = Number.isFinite(clip.duration) && clip.duration > 0 ? clip.duration : 4
    const placement = findLayerPlacement(
      videoLayers,
      desiredStart ?? player.time,
      duration,
      trackIndex,
    )
    if (placement === null) return
    const item = createVideoLayerItem(clipId, 0, placement.length, placement.start, placement.trackIndex)
    setVideoLayers((current) => [...current, item])
    setSelectedLayerItemId(item.id)
    showTimeline()
  }

  const updateVideoLayerItem = (updated: VideoLayerItem) => {
    setVideoLayers((current) => current.map((item) => (item.id === updated.id ? updated : item)))
  }

  const moveVideoLayerItem = (id: string, start: number, trackIndex?: number) => {
    setVideoLayers((current) => {
      const item = current.find((candidate) => candidate.id === id)
      if (item === undefined) return current
      const target = trackIndex ?? item.trackIndex
      const length = itemLength(item)
      const landed = clampLayerStart(current, id, start, length, target)
      if (landed === null) return current
      return current.map((candidate) =>
        candidate.id === id ? { ...candidate, start: landed, trackIndex: target } : candidate,
      )
    })
  }

  const trimVideoLayerItem = (id: string, edge: 'in' | 'out', sourceTime: number) => {
    const item = videoLayers.find((candidate) => candidate.id === id)
    if (item === undefined) return
    const clip = clipsById.get(item.clipId)
    setVideoLayers((current) => trimLayerItem(current, id, edge, sourceTime, clip?.duration ?? item.outPoint))
  }

  const deleteVideoLayerItem = (id: string) => {
    setVideoLayers((current) => current.filter((item) => item.id !== id))
    if (selectedLayerItemId === id) setSelectedLayerItemId(null)
  }

  /** Key or re-key one property of whatever visual item is selected, at the playhead. */
  const addKeyframeToSelection = (property: AnimatableProperty, value: number) => {
    const layerItem = videoLayers.find((item) => item.id === validSelectedLayerItemId)
    if (layerItem !== undefined) {
      updateVideoLayerItem({
        ...layerItem,
        keyframes: setKeyframe(layerItem.keyframes, property, player.time - layerItem.start, value),
      })
      return
    }
    const index = items.findIndex((item) => item.id === validSelectedItemId)
    if (index < 0) return
    const localTime = player.time - itemStarts(items)[index]
    setItems((current) =>
      current.map((candidate, candidateIndex) =>
        candidateIndex === index
          ? { ...candidate, keyframes: setKeyframe(candidate.keyframes, property, localTime, value) }
          : candidate,
      ),
    )
  }

  const removeKeyframeFromSelection = (property: AnimatableProperty, keyframeId: string) => {
    const layerItem = videoLayers.find((item) => item.id === validSelectedLayerItemId)
    if (layerItem !== undefined) {
      updateVideoLayerItem({
        ...layerItem,
        keyframes: removeKeyframe(layerItem.keyframes, property, keyframeId),
      })
      return
    }
    setItems((current) =>
      current.map((candidate) =>
        candidate.id === validSelectedItemId
          ? { ...candidate, keyframes: removeKeyframe(candidate.keyframes, property, keyframeId) }
          : candidate,
      ),
    )
  }

  const changeKeyframeEasing = (
    property: AnimatableProperty,
    keyframeId: string,
    easing: Keyframe['easing'],
  ) => {
    const layerItem = videoLayers.find((item) => item.id === validSelectedLayerItemId)
    if (layerItem !== undefined) {
      updateVideoLayerItem({
        ...layerItem,
        keyframes: updateKeyframe(layerItem.keyframes, property, keyframeId, { easing }),
      })
      return
    }
    setItems((current) =>
      current.map((candidate) =>
        candidate.id === validSelectedItemId
          ? { ...candidate, keyframes: updateKeyframe(candidate.keyframes, property, keyframeId, { easing }) }
          : candidate,
      ),
    )
  }

  const setAudioVolume = (id: string, volume: number) => {
    setAudioItems((current) => current.map((item) => (item.id === id ? { ...item, volume } : item)))
  }

  const setAudioFade = (id: string, fadeIn: number, fadeOut: number) => {
    setAudioItems((current) => current.map((item) => (item.id === id ? { ...item, fadeIn, fadeOut } : item)))
  }

  const updateAudioItem = (updated: AudioTimelineItem) => {
    setAudioItems((current) => current.map((item) => (item.id === updated.id ? updated : item)))
  }

  const toggleMuted = (id: string) => {
    setItems((current) => current.map((item) => (item.id === id ? { ...item, muted: !item.muted } : item)))
  }

  const updateTimelineItem = (updated: TimelineItem) => {
    setItems((current) => current.map((item) => (item.id === updated.id ? updated : item)))
  }

  const deleteTimelineItem = (id: string) => {
    setItems((current) => current.filter((item) => item.id !== id))
    if (selectedItemId === id) setSelectedItemId(null)
    showTimeline()
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
    const layerSplit = splitLayerAt(videoLayers, player.time, validSelectedLayerItemId)
    if (layerSplit !== null) {
      setVideoLayers(layerSplit.items)
      setSelectedLayerItemId(layerSplit.rightId)
    }
    if (validSelectedOverlayId !== null) {
      const selectedOverlay = overlayItems.find((o) => o.id === validSelectedOverlayId)
      if (
        selectedOverlay &&
        player.time > selectedOverlay.start &&
        player.time < selectedOverlay.start + selectedOverlay.duration
      ) {
        const leftDuration = player.time - selectedOverlay.start
        const rightDuration = selectedOverlay.duration - leftDuration
        const rightId = crypto.randomUUID()
        const leftItem: OverlayItem = { ...selectedOverlay, duration: leftDuration }
        const rightItem: OverlayItem = { ...selectedOverlay, id: rightId, start: player.time, duration: rightDuration }
        setOverlayItems((curr) => curr.map((o) => (o.id === selectedOverlay.id ? leftItem : o)).concat(rightItem))
        setSelectedOverlayId(rightId)
      }
    }
    showTimeline()
  }

  const addTransition = (fromItemId: string, toItemId: string, type: TransitionType = 'crossfade') => {
    const newTransition = createTransition(fromItemId, toItemId, type)
    setTransitions((current) => [
      ...current.filter((t) => !(t.fromItemId === fromItemId && t.toItemId === toItemId)),
      newTransition,
    ])
    setSelectedTransitionId(newTransition.id)
    setSelectedItemId(null)
    setSelectedAudioItemId(null)
    setSelectedTextId(null)
    setSelectedOverlayId(null)
    showTimeline()
  }

  const updateTransition = (updated: Transition) => {
    setTransitions((current) => current.map((t) => (t.id === updated.id ? updated : t)))
    showTimeline()
  }

  const deleteTransition = (id: string) => {
    setTransitions((current) => current.filter((t) => t.id !== id))
    setSelectedTransitionId(null)
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
    } else if (validSelectedLayerItemId !== null) {
      deleteVideoLayerItem(validSelectedLayerItemId)
    } else if (validSelectedOverlayId !== null) {
      deleteOverlay(validSelectedOverlayId)
    } else if (validSelectedTransitionId !== null) {
      deleteTransition(validSelectedTransitionId)
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

  // Space plays/pauses, S splits, Delete/Backspace removes the selected timeline item, ? toggles shortcuts.
  useEffect(() => {
    const handleKey = (event: KeyboardEvent) => {
      if (event.metaKey || event.ctrlKey || event.altKey) return
      if ((event.target as Element).closest('button, input, textarea, select, video, audio')) return
      if (exportOpen || shortcutsOpen || confirmNewOpen) return
      if (event.key === ' ') togglePlay()
      else if (event.key === 's' || event.key === 'S') split()
      else if (event.key === 'Delete' || event.key === 'Backspace') deleteSelectedItem()
      else if (event.key === '?') setShortcutsOpen((prev) => !prev)
      else return
      event.preventDefault()
    }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  })

  const firstClip = items.length > 0 ? clipsById.get(items[0].clipId) : undefined
  const exportSize = firstClip ? outputSizeForAspectRatio(aspectRatio, firstClip) : null
  const exportLabel = exportSize ? `${exportSize.width}×${exportSize.height} (${aspectRatio}) · 30 fps` : ''

  return (
    <div className="app">
      <header className="app-header">
        <div className="app-brand">
          <div className="brand-logo-box" title="Mini Video Editor Studio">
            <svg width="20" height="20" viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
              <defs>
                <linearGradient id="brand-grad" x1="2" y1="2" x2="30" y2="30" gradientUnits="userSpaceOnUse">
                  <stop stopColor="#38bdf8" />
                  <stop offset="0.5" stopColor="#6366f1" />
                  <stop offset="1" stopColor="#a855f7" />
                </linearGradient>
              </defs>
              <path d="M7 8.5H12L10 12.5H5L7 8.5Z" fill="#38bdf8" />
              <path d="M14.5 8.5H19.5L17.5 12.5H12.5L14.5 8.5Z" fill="#818cf8" />
              <path d="M22 8.5H27L25 12.5H20L22 8.5Z" fill="#c084fc" />
              <path
                d="M11 15.5C11 14.65 11.95 14.15 12.65 14.6L22.2 19.1C22.9 19.45 22.9 20.55 22.2 20.9L12.65 25.4C11.95 25.85 11 25.35 11 24.5V15.5Z"
                fill="url(#brand-grad)"
              />
              <path
                d="M12.5 17L18.8 20L12.5 23V17Z"
                fill="#ffffff"
                fillOpacity="0.85"
              />
            </svg>
          </div>
          <div className="brand-meta">
            <h1>Mini Video Editor</h1>
            <span className="brand-badge">PRO STUDIO</span>
          </div>
        </div>

        <div className="header-project-info">
          <span className="project-status-dot" />
          <span className="project-summary-text">
            {items.length === 0
              ? 'Empty Project'
              : `${items.length} clip${items.length === 1 ? '' : 's'} · ${formatTimecode(totalDuration)}`}
          </span>
          {storageLoaded && (
            <div className={`save-status ${saveStatus}`} title="Project is automatically saved in your browser storage">
              {saveStatus === 'saving' ? (
                <>
                  <span className="spinner-icon">⏳</span> Saving...
                </>
              ) : saveStatus === 'saved' && (items.length > 0 || clips.length > 0 || audioItems.length > 0 || audioClips.length > 0) ? (
                <>
                  <span className="saved-icon">✓</span> Saved
                </>
              ) : null}
            </div>
          )}
        </div>

        <div className="header-actions">
          {/* Undo & Redo History Controls */}
          <div className="header-history-group">
            <button
              type="button"
              className="btn-header-history"
              onClick={undo}
              disabled={!canUndo}
              title="Undo (Cmd+Z / Ctrl+Z)"
              aria-label="Undo"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M3 7v6h6" />
                <path d="M21 17a9 9 0 0 0-9-9 9 9 0 0 0-6 2.3L3 13" />
              </svg>
              <span>Undo</span>
            </button>
            <button
              type="button"
              className="btn-header-history"
              onClick={redo}
              disabled={!canRedo}
              title="Redo (Cmd+Shift+Z / Ctrl+Y)"
              aria-label="Redo"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 7v6h-6" />
                <path d="M3 17a9 9 0 0 1 9-9 9 9 0 0 1 6 2.3L21 13" />
              </svg>
              <span>Redo</span>
            </button>
          </div>

          {/* Project Aspect Ratio Selector */}
          <div className="header-aspect-ratio-group" title="Project Canvas Aspect Ratio">
            <span className="aspect-ratio-icon" aria-hidden="true">📐</span>
            <select
              className="aspect-ratio-select"
              value={aspectRatio}
              onChange={(e) => setAspectRatio(e.target.value as AspectRatio)}
              aria-label="Project Aspect Ratio"
            >
              <option value="16:9">16:9 Landscape</option>
              <option value="9:16">9:16 Vertical (Reels/Shorts)</option>
              <option value="1:1">1:1 Square</option>
              <option value="4:5">4:5 Portrait</option>
              <option value="21:9">21:9 Cinema</option>
            </select>
          </div>

          <button
            type="button"
            className="header-shortcuts-btn"
            onClick={() => setShortcutsOpen(true)}
            title="Keyboard shortcuts & gestures (?)"
            aria-label="Keyboard shortcuts"
          >
            ⌨ Shortcuts
          </button>
          <button
            type="button"
            className="btn-header-new"
            onClick={() => setConfirmNewOpen(true)}
            disabled={clips.length === 0 && items.length === 0 && audioClips.length === 0 && audioItems.length === 0}
            title="Clear current timeline and start a new project"
          >
            New Project
          </button>
          <button
            type="button"
            className="export-button"
            disabled={items.length === 0}
            onClick={() => {
              exporter.reset()
              setExportOpen(true)
            }}
            title={items.length === 0 ? 'Add clips to timeline to export' : 'Export timeline as MP4'}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
              <polyline points="7 10 12 15 17 10" />
              <line x1="12" y1="15" x2="12" y2="3" />
            </svg>
            Export
          </button>
        </div>
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
        timelineEmpty={items.length === 0 && audioItems.length === 0 && textItems.length === 0 && overlayItems.length === 0}
        hasVideo={items.length > 0}
        aspectRatio={aspectRatio}
        timelineVideoRef={timelineVideoRef}
        timelineAudioRef={timelineAudioRef}
        textItems={textItems}
        selectedTextId={validSelectedTextId}
        time={player.time}
        playing={player.playing}
        onSelectText={(id) => {
          setSelectedTextId(id)
          if (id !== null) {
            setSelectedItemId(null)
            setSelectedAudioItemId(null)
            setSelectedTransitionId(null)
          }
          showTimeline()
        }}
        onUpdateText={updateText}
        onDeleteText={(id) => {
          setTextItems((current) => current.filter((item) => item.id !== id))
          setSelectedTextId(null)
          showTimeline()
        }}
        selectedTimelineItem={items.find((item) => item.id === validSelectedItemId) ?? null}
        onUpdateTimelineItem={updateTimelineItem}
        onDeleteTimelineItem={deleteTimelineItem}
        onCloseTimelineInspector={() => setSelectedItemId(null)}
        selectedAudioItem={audioItems.find((item) => item.id === validSelectedAudioItemId) ?? null}
        selectedAudioClipName={
          validSelectedAudioItemId
            ? audioClipsById.get(audioItems.find((item) => item.id === validSelectedAudioItemId)?.clipId ?? '')?.name
            : undefined
        }
        audioTrackCount={effectiveTrackCount}
        onUpdateAudioItem={updateAudioItem}
        onAudioVolumeChange={setAudioVolume}
        onAudioFadeChange={setAudioFade}
        onMoveAudioToTrack={moveAudioToTrack}
        onDeleteAudioItem={(id) => {
          setAudioItems((current) => current.filter((item) => item.id !== id))
          setSelectedAudioItemId(null)
          showTimeline()
        }}
        onCloseAudioInspector={() => setSelectedAudioItemId(null)}
        secondaryVideoRef={timelineSecondaryVideoRef}
        timelineImageRef={timelineImageRef}
        secondaryImageRef={timelineSecondaryImageRef}
        selectedTransition={selectedTransition}
        selectedTransitionItemA={selectedTransitionItemA}
        selectedTransitionItemB={selectedTransitionItemB}
        selectedTransitionMaxDuration={selectedTransitionMaxDuration}
        onUpdateTransition={updateTransition}
        onDeleteTransition={deleteTransition}
        onCloseTransitionInspector={() => setSelectedTransitionId(null)}
        overlayItems={overlayItems}
        selectedOverlayId={validSelectedOverlayId}
        onSelectOverlay={(id) => {
          setSelectedOverlayId(id)
          if (id !== null) {
            setSelectedItemId(null)
            setSelectedAudioItemId(null)
            setSelectedTextId(null)
            setSelectedTransitionId(null)
          }
          showTimeline()
        }}
        onUpdateOverlay={updateOverlay}
        onDeleteOverlay={deleteOverlay}
        onCloseOverlayInspector={() => setSelectedOverlayId(null)}
        videoLayers={videoLayers}
        selectedLayerItemId={validSelectedLayerItemId}
        selectedLayerItem={videoLayers.find((item) => item.id === validSelectedLayerItemId) ?? null}
        onUpdateLayerItem={updateVideoLayerItem}
        onDeleteLayerItem={deleteVideoLayerItem}
        onCloseLayerInspector={() => setSelectedLayerItemId(null)}
        onAddKeyframe={addKeyframeToSelection}
        onRemoveKeyframe={removeKeyframeFromSelection}
        onChangeKeyframeEasing={changeKeyframeEasing}
        selectedItemLocalTime={
          validSelectedItemId === null
            ? 0
            : player.time - (itemStarts(items)[items.findIndex((i) => i.id === validSelectedItemId)] ?? 0)
        }
        onSeekToClipLocalTime={(localTime) => {
          const index = items.findIndex((i) => i.id === validSelectedItemId)
          if (index >= 0) seek(itemStarts(items)[index] + localTime)
        }}
        onSeekToLayerLocalTime={(localTime) => {
          const layer = videoLayers.find((item) => item.id === validSelectedLayerItemId)
          if (layer !== undefined) seek(layer.start + localTime)
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
          setSelectedOverlayId(null)
          setSelectedTransitionId(null)
          showTimeline()
        }}
        onAddClip={addToTimeline}
        onMoveItem={(from, to) => {
          setItems((current) => moveItem(current, from, to))
          showTimeline()
        }}
        onTrimItem={trim}
        onToggleMute={toggleMuted}
        transitions={validTransitions}
        selectedTransitionId={validSelectedTransitionId}
        onSelectTransition={(id) => {
          setSelectedTransitionId(id)
          if (id !== null) {
            setSelectedItemId(null)
            setSelectedAudioItemId(null)
            setSelectedTextId(null)
            setSelectedOverlayId(null)
          }
          showTimeline()
        }}
        onAddTransition={addTransition}
        audioItems={audioItems}
        audioClips={audioClipsById}
        selectedAudioItemId={validSelectedAudioItemId}
        audioTrackCount={effectiveTrackCount}
        onSelectAudioItem={(id) => {
          setSelectedAudioItemId(id)
          setSelectedItemId(null)
          setSelectedTextId(null)
          setSelectedOverlayId(null)
          setSelectedTransitionId(null)
          showTimeline()
        }}
        onAddAudioClip={addAudioToTimeline}
        onMoveAudioItem={moveAudio}
        onTrimAudioItem={trimAudio}
        onAudioVolumeChange={setAudioVolume}
        onAddAudioTrack={addAudioTrack}
        onRemoveAudioTrack={removeAudioTrack}
        textItems={textItems}
        selectedTextId={validSelectedTextId}
        onSelectTextItem={(id) => {
          setSelectedTextId(id)
          if (id !== null) {
            setSelectedItemId(null)
            setSelectedAudioItemId(null)
            setSelectedOverlayId(null)
            setSelectedTransitionId(null)
          }
          showTimeline()
        }}
        onAddText={addTextOverlay}
        onMoveTextItem={moveText}
        onTrimTextItem={trimText}
        overlayItems={overlayItems}
        selectedOverlayId={validSelectedOverlayId}
        onSelectOverlayItem={(id) => {
          setSelectedOverlayId(id)
          if (id !== null) {
            setSelectedItemId(null)
            setSelectedAudioItemId(null)
            setSelectedTextId(null)
            setSelectedTransitionId(null)
          }
          showTimeline()
        }}
        onAddOverlay={addOverlay}
        onMoveOverlayItem={moveOverlay}
        onTrimOverlayItem={trimOverlay}
        onAddMediaOverlay={addMediaOverlay}
        videoLayers={videoLayers}
        videoLayerCount={videoLayerCount}
        selectedLayerItemId={validSelectedLayerItemId}
        onSelectLayerItem={(id) => {
          setSelectedLayerItemId(id)
          if (id !== null) {
            setSelectedItemId(null)
            setSelectedAudioItemId(null)
            setSelectedTextId(null)
            setSelectedOverlayId(null)
            setSelectedTransitionId(null)
          }
        }}
        onAddClipToLayer={(clipId, trackIndex, start) => addClipToVideoLayer(clipId, trackIndex, start)}
        onMoveLayerItem={moveVideoLayerItem}
        onTrimLayerItem={trimVideoLayerItem}
        onAddVideoLayer={addVideoLayerTrack}
        onRemoveVideoLayer={removeVideoLayerTrack}
      />
      {exportOpen && (
        <ExportDialog
          state={exporter.state}
          outputLabel={exportLabel}
          duration={totalDuration}
          onStart={exporter.start}
          onCancel={exporter.cancel}
          onClose={() => {
            if (exporter.state.status !== 'running') setExportOpen(false)
          }}
        />
      )}
      <KeyboardShortcutsModal isOpen={shortcutsOpen} onClose={() => setShortcutsOpen(false)} />
      <ConfirmNewProjectModal
        isOpen={confirmNewOpen}
        onConfirm={startNewProject}
        onCancel={() => setConfirmNewOpen(false)}
      />
    </div>
  )
}

function errorMessage(reason: unknown): string {
  return reason instanceof Error ? reason.message : String(reason)
}

export default App
