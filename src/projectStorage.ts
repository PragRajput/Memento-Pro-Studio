import type { AudioClip, AudioTimelineItem, MediaClip, TextOverlay, TimelineItem, Transition } from './types.ts'

const DB_NAME = 'MiniVideoEditorDB'
const DB_VERSION = 1
const STORE_NAME = 'project_store'
const PROJECT_KEY = 'active_project'

export interface SerializedMediaClip {
  id: string
  name: string
  duration: number
  width: number
  height: number
  thumbnail: string
  blob: Blob
}

export interface SerializedAudioClip {
  id: string
  name: string
  duration: number
  blob: Blob
}

export interface ProjectData {
  version: 1
  updatedAt: number
  items: TimelineItem[]
  audioItems: AudioTimelineItem[]
  textItems: TextOverlay[]
  transitions: Transition[]
  audioTrackCount: number
  clips: SerializedMediaClip[]
  audioClips: SerializedAudioClip[]
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

/** Automatically persist active project data and media blobs to browser storage. */
export async function persistProject(
  items: readonly TimelineItem[],
  clips: readonly MediaClip[],
  audioItems: readonly AudioTimelineItem[],
  audioClips: readonly AudioClip[],
  textItems: readonly TextOverlay[],
  transitions: readonly Transition[],
  audioTrackCount: number,
): Promise<void> {
  if (typeof indexedDB === 'undefined') return
  try {
    const db = await openDB()
    const serializedClips: SerializedMediaClip[] = clips.map((c) => ({
      id: c.id,
      name: c.name,
      duration: c.duration,
      width: c.width,
      height: c.height,
      thumbnail: c.thumbnail,
      blob: c.file,
    }))
    const serializedAudioClips: SerializedAudioClip[] = audioClips.map((c) => ({
      id: c.id,
      name: c.name,
      duration: c.duration,
      blob: c.file,
    }))

    const project: ProjectData = {
      version: 1,
      updatedAt: Date.now(),
      items: [...items],
      audioItems: [...audioItems],
      textItems: [...textItems],
      transitions: [...transitions],
      audioTrackCount,
      clips: serializedClips,
      audioClips: serializedAudioClips,
    }

    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite')
      const store = tx.objectStore(STORE_NAME)
      const request = store.put(project, PROJECT_KEY)
      request.onsuccess = () => resolve()
      request.onerror = () => reject(request.error)
    })
  } catch (err) {
    console.warn('Failed to auto-save project to IndexedDB:', err)
  }
}

/** Restore previously auto-saved project from browser storage. */
export async function restoreProject(): Promise<{
  items: TimelineItem[]
  clips: MediaClip[]
  audioItems: AudioTimelineItem[]
  audioClips: AudioClip[]
  textItems: TextOverlay[]
  transitions: Transition[]
  audioTrackCount: number
} | null> {
  if (typeof indexedDB === 'undefined') return null
  try {
    const db = await openDB()
    const project = await new Promise<ProjectData | undefined>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readonly')
      const store = tx.objectStore(STORE_NAME)
      const request = store.get(PROJECT_KEY)
      request.onsuccess = () => resolve(request.result)
      request.onerror = () => reject(request.error)
    })

    if (!project || (!project.clips.length && !project.audioClips.length && !project.items.length)) {
      return null
    }

    const rehydratedClips: MediaClip[] = project.clips.map((sc) => {
      const file = new File([sc.blob], sc.name, { type: sc.blob.type })
      const url = URL.createObjectURL(file)
      return {
        id: sc.id,
        name: sc.name,
        duration: sc.duration,
        width: sc.width,
        height: sc.height,
        thumbnail: sc.thumbnail,
        file,
        url,
      }
    })

    const rehydratedAudioClips: AudioClip[] = project.audioClips.map((sc) => {
      const file = new File([sc.blob], sc.name, { type: sc.blob.type })
      const url = URL.createObjectURL(file)
      return {
        id: sc.id,
        name: sc.name,
        duration: sc.duration,
        file,
        url,
      }
    })

    return {
      items: project.items ?? [],
      clips: rehydratedClips,
      audioItems: project.audioItems ?? [],
      audioClips: rehydratedAudioClips,
      textItems: project.textItems ?? [],
      transitions: project.transitions ?? [],
      audioTrackCount: project.audioTrackCount ?? 2,
    }
  } catch (err) {
    console.warn('Failed to restore project from IndexedDB:', err)
    return null
  }
}

/** Clear saved project data from browser storage (e.g. for Start New Project). */
export async function clearProjectStorage(): Promise<void> {
  if (typeof indexedDB === 'undefined') return
  try {
    const db = await openDB()
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite')
      const store = tx.objectStore(STORE_NAME)
      const request = store.delete(PROJECT_KEY)
      request.onsuccess = () => resolve()
      request.onerror = () => reject(request.error)
    })
  } catch (err) {
    console.warn('Failed to clear project storage:', err)
  }
}
