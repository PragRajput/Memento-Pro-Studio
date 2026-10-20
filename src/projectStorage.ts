import type { AspectRatio, AudioClip, AudioTimelineItem, MediaClip, OverlayItem, TextOverlay, TimelineItem, Transition, VideoLayerItem } from './types.ts'

const DB_NAME = 'MiniVideoEditorDB'
const DB_VERSION = 1
const STORE_NAME = 'project_store'
/** Legacy (v1) key: the whole project, including every clip's blob, in one record. */
const LEGACY_PROJECT_KEY = 'active_project'
/** Current key: project state and which clips it references, with no blobs. */
const META_KEY = 'active_project_meta'

const videoAssetKey = (id: string) => `video_asset:${id}`
const audioAssetKey = (id: string) => `audio_asset:${id}`

interface StoredVideoAsset {
  id: string
  name: string
  duration: number
  width: number
  height: number
  thumbnail: string
  blob: Blob
  mediaType?: 'video' | 'image'
}

interface StoredAudioAsset {
  id: string
  name: string
  duration: number
  blob: Blob
  peaks?: number[]
  pitches?: number[]
}

interface ProjectMeta {
  version: 2
  updatedAt: number
  items: TimelineItem[]
  audioItems: AudioTimelineItem[]
  textItems: TextOverlay[]
  overlayItems?: OverlayItem[]
  videoLayers?: VideoLayerItem[]
  transitions: Transition[]
  audioTrackCount: number
  aspectRatio?: AspectRatio
  /** Which stored assets this project uses; the assets themselves are not here. */
  clipIds: string[]
  audioClipIds: string[]
}

/** The shape every clip arrived in before assets were split out of the project record. */
interface LegacyProjectData {
  version: 1
  items: TimelineItem[]
  audioItems: AudioTimelineItem[]
  textItems: TextOverlay[]
  overlayItems?: OverlayItem[]
  transitions: Transition[]
  audioTrackCount: number
  aspectRatio?: AspectRatio
  clips: (StoredVideoAsset & { id: string })[]
  audioClips: (StoredAudioAsset & { id: string })[]
}

export interface RestoredProject {
  items: TimelineItem[]
  clips: MediaClip[]
  audioItems: AudioTimelineItem[]
  audioClips: AudioClip[]
  textItems: TextOverlay[]
  overlayItems: OverlayItem[]
  videoLayers: VideoLayerItem[]
  transitions: Transition[]
  audioTrackCount: number
  aspectRatio: AspectRatio
}

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('IndexedDB is not available in this environment.'))
      return
    }
    const request = indexedDB.open(DB_NAME, DB_VERSION)
    request.onupgradeneeded = () => {
      const db = request.result
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME)
      }
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

function put(db: IDBDatabase, key: string, value: unknown): Promise<void> {
  return new Promise((resolve, reject) => {
    const store = db.transaction(STORE_NAME, 'readwrite').objectStore(STORE_NAME)
    const request = store.put(value, key)
    request.onsuccess = () => resolve()
    request.onerror = () => reject(request.error)
  })
}

function get<T>(db: IDBDatabase, key: string): Promise<T | undefined> {
  return new Promise((resolve, reject) => {
    const store = db.transaction(STORE_NAME, 'readonly').objectStore(STORE_NAME)
    const request = store.get(key)
    request.onsuccess = () => resolve(request.result as T | undefined)
    request.onerror = () => reject(request.error)
  })
}

function remove(db: IDBDatabase, key: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const store = db.transaction(STORE_NAME, 'readwrite').objectStore(STORE_NAME)
    const request = store.delete(key)
    request.onsuccess = () => resolve()
    request.onerror = () => reject(request.error)
  })
}

/** Save one video (or photo) clip's file; call once when it's imported. */
export async function persistVideoAsset(clip: MediaClip): Promise<void> {
  if (typeof indexedDB === 'undefined') return
  try {
    const db = await openDB()
    const asset: StoredVideoAsset = {
      id: clip.id,
      name: clip.name,
      duration: clip.duration,
      width: clip.width,
      height: clip.height,
      thumbnail: clip.thumbnail,
      blob: clip.file,
      mediaType: clip.mediaType,
    }
    await put(db, videoAssetKey(clip.id), asset)
  } catch (err) {
    console.warn('Failed to save video asset to IndexedDB:', err)
  }
}

/**
 * Save one audio clip's file; call once when it's imported, and again whenever its
 * waveform peaks/pitches are computed, so that analysis is not silently lost.
 */
export async function persistAudioAsset(clip: AudioClip): Promise<void> {
  if (typeof indexedDB === 'undefined') return
  try {
    const db = await openDB()
    const asset: StoredAudioAsset = {
      id: clip.id,
      name: clip.name,
      duration: clip.duration,
      blob: clip.file,
      peaks: clip.peaks,
      pitches: clip.pitches,
    }
    await put(db, audioAssetKey(clip.id), asset)
  } catch (err) {
    console.warn('Failed to save audio asset to IndexedDB:', err)
  }
}

/** Remove one clip's stored file; call when it's removed from the Media panel. */
export async function removeVideoAsset(id: string): Promise<void> {
  if (typeof indexedDB === 'undefined') return
  try {
    await remove(await openDB(), videoAssetKey(id))
  } catch (err) {
    console.warn('Failed to remove video asset from IndexedDB:', err)
  }
}

export async function removeAudioAsset(id: string): Promise<void> {
  if (typeof indexedDB === 'undefined') return
  try {
    await remove(await openDB(), audioAssetKey(id))
  } catch (err) {
    console.warn('Failed to remove audio asset from IndexedDB:', err)
  }
}

/**
 * Persist the project's state — the timeline, titles, overlays, transitions and
 * which clips they reference — without touching any clip's stored file. Call this
 * on every edit; it stays cheap regardless of how large the imported clips are.
 */
export async function persistProjectMeta(
  items: readonly TimelineItem[],
  clips: readonly MediaClip[],
  audioItems: readonly AudioTimelineItem[],
  audioClips: readonly AudioClip[],
  textItems: readonly TextOverlay[],
  transitions: readonly Transition[],
  audioTrackCount: number,
  aspectRatio?: AspectRatio,
  overlayItems: readonly OverlayItem[] = [],
  videoLayers: readonly VideoLayerItem[] = [],
): Promise<void> {
  if (typeof indexedDB === 'undefined') return
  try {
    const db = await openDB()
    const meta: ProjectMeta = {
      version: 2,
      updatedAt: Date.now(),
      items: [...items],
      audioItems: [...audioItems],
      textItems: [...textItems],
      overlayItems: [...overlayItems],
      videoLayers: [...videoLayers],
      transitions: [...transitions],
      audioTrackCount,
      aspectRatio,
      clipIds: clips.map((c) => c.id),
      audioClipIds: audioClips.map((c) => c.id),
    }
    await put(db, META_KEY, meta)
  } catch (err) {
    console.warn('Failed to auto-save project to IndexedDB:', err)
  }
}

export { persistProjectMeta as persistProject }

function rehydrateVideoAsset(asset: StoredVideoAsset): MediaClip {
  const file = new File([asset.blob], asset.name, { type: asset.blob.type })
  return {
    id: asset.id,
    name: asset.name,
    duration: asset.duration,
    width: asset.width,
    height: asset.height,
    thumbnail: asset.thumbnail,
    file,
    url: URL.createObjectURL(file),
    mediaType: asset.mediaType,
  }
}

function rehydrateAudioAsset(asset: StoredAudioAsset): AudioClip {
  const file = new File([asset.blob], asset.name, { type: asset.blob.type })
  return {
    id: asset.id,
    name: asset.name,
    duration: asset.duration,
    file,
    url: URL.createObjectURL(file),
    peaks: asset.peaks,
    pitches: asset.pitches,
  }
}

/** Bring an old (v1, inline-blob) saved project into the current split storage, once. */
async function migrateLegacyProject(db: IDBDatabase, legacy: LegacyProjectData): Promise<RestoredProject> {
  const clips: MediaClip[] = []
  for (const stored of legacy.clips) {
    await put(db, videoAssetKey(stored.id), stored)
    clips.push(rehydrateVideoAsset(stored))
  }
  const audioClips: AudioClip[] = []
  for (const stored of legacy.audioClips) {
    await put(db, audioAssetKey(stored.id), stored)
    audioClips.push(rehydrateAudioAsset(stored))
  }
  const meta: ProjectMeta = {
    version: 2,
    updatedAt: Date.now(),
    items: legacy.items ?? [],
    audioItems: legacy.audioItems ?? [],
    textItems: legacy.textItems ?? [],
    overlayItems: legacy.overlayItems ?? [],
    videoLayers: [],
    transitions: legacy.transitions ?? [],
    audioTrackCount: legacy.audioTrackCount ?? 2,
    aspectRatio: legacy.aspectRatio,
    clipIds: clips.map((c) => c.id),
    audioClipIds: audioClips.map((c) => c.id),
  }
  await put(db, META_KEY, meta)
  await remove(db, LEGACY_PROJECT_KEY)
  return {
    items: meta.items,
    clips,
    audioItems: meta.audioItems,
    audioClips,
    textItems: meta.textItems,
    overlayItems: meta.overlayItems ?? [],
    videoLayers: meta.videoLayers ?? [],
    transitions: meta.transitions,
    audioTrackCount: meta.audioTrackCount,
    aspectRatio: meta.aspectRatio ?? '16:9',
  }
}

/** Restore the previously auto-saved project, migrating an older save if that's what's there. */
export async function restoreProject(): Promise<RestoredProject | null> {
  if (typeof indexedDB === 'undefined') return null
  try {
    const db = await openDB()
    const meta = await get<ProjectMeta>(db, META_KEY)
    if (meta === undefined) {
      const legacy = await get<LegacyProjectData>(db, LEGACY_PROJECT_KEY)
      if (legacy === undefined || (!legacy.clips.length && !legacy.audioClips.length && !legacy.items.length)) {
        return null
      }
      return migrateLegacyProject(db, legacy)
    }
    if (!meta.clipIds.length && !meta.audioClipIds.length && !meta.items.length) return null

    const clips: MediaClip[] = []
    for (const id of meta.clipIds) {
      const asset = await get<StoredVideoAsset>(db, videoAssetKey(id))
      if (asset !== undefined) clips.push(rehydrateVideoAsset(asset))
    }
    const audioClips: AudioClip[] = []
    for (const id of meta.audioClipIds) {
      const asset = await get<StoredAudioAsset>(db, audioAssetKey(id))
      if (asset !== undefined) audioClips.push(rehydrateAudioAsset(asset))
    }

    // Asset removal applies immediately, while the metadata referencing it is only
    // saved on the next debounced save; a reload in that window would otherwise
    // restore timeline items whose clip never actually came back.
    const clipIds = new Set(clips.map((c) => c.id))
    const audioClipIds = new Set(audioClips.map((c) => c.id))

    return {
      items: (meta.items ?? []).filter((item) => clipIds.has(item.clipId)),
      clips,
      audioItems: (meta.audioItems ?? []).filter((item) => audioClipIds.has(item.clipId)),
      audioClips,
      textItems: meta.textItems ?? [],
      overlayItems: meta.overlayItems ?? [],
      videoLayers: meta.videoLayers ?? [],
      transitions: meta.transitions ?? [],
      audioTrackCount: meta.audioTrackCount ?? 2,
      aspectRatio: meta.aspectRatio ?? '16:9',
    }
  } catch (err) {
    console.warn('Failed to restore project from IndexedDB:', err)
    return null
  }
}

/** Clear all saved project data and clip files (e.g. for Start New Project). */
export async function clearProjectStorage(): Promise<void> {
  if (typeof indexedDB === 'undefined') return
  try {
    const db = await openDB()
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite')
      const request = tx.objectStore(STORE_NAME).clear()
      request.onsuccess = () => resolve()
      request.onerror = () => reject(request.error)
    })
  } catch (err) {
    console.warn('Failed to clear project storage:', err)
  }
}
