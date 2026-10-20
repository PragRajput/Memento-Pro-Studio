import { useCallback, useEffect, useRef, useState } from 'react'
import type { AspectRatio, AudioTimelineItem, EdgeFades, OverlayItem, TextOverlay, TimelineItem, Transition, VideoLayerItem } from './types.ts'

export interface HistorySnapshot {
  items: TimelineItem[]
  audioItems: AudioTimelineItem[]
  textItems: TextOverlay[]
  overlayItems?: OverlayItem[]
  videoLayers?: VideoLayerItem[]
  transitions: Transition[]
  aspectRatio: AspectRatio
  edgeFades?: EdgeFades
}

const MAX_HISTORY = 40

export interface HistoryStacks {
  past: HistorySnapshot[]
  future: HistorySnapshot[]
}

export interface HistoryStep extends HistoryStacks {
  /** The state to apply to the editor. */
  snapshot: HistorySnapshot
}

/**
 * Step back one edit. Returns null when there is nothing to undo.
 *
 * Pure on purpose. These used to be computed inside a `setPast` updater that
 * also called `setFuture` and applied the snapshot; React double-invokes
 * updaters under StrictMode to surface exactly that kind of impurity, so a
 * single undo pushed two entries onto the redo stack and needed two redos.
 */
export function stepBack(
  { past, future }: HistoryStacks,
  current: HistorySnapshot,
): HistoryStep | null {
  if (past.length === 0) return null
  return {
    snapshot: past[past.length - 1],
    past: past.slice(0, -1),
    future: [current, ...future],
  }
}

/** Step forward one edit. Returns null when there is nothing to redo. */
export function stepForward(
  { past, future }: HistoryStacks,
  current: HistorySnapshot,
): HistoryStep | null {
  if (future.length === 0) return null
  return {
    snapshot: future[0],
    past: [...past, current],
    future: future.slice(1),
  }
}

export function useHistory(
  currentState: HistorySnapshot,
  onApplySnapshot: (snapshot: HistorySnapshot) => void,
  enabled: boolean = true,
) {
  const [past, setPast] = useState<HistorySnapshot[]>([])
  const [future, setFuture] = useState<HistorySnapshot[]>([])
  const isUndoingOrRedoing = useRef(false)
  const previousRef = useRef<HistorySnapshot>(currentState)
  const debounceTimerRef = useRef<number>(0)
  const isInitializedRef = useRef(false)

  // Explicitly record a snapshot (bypasses debounce)
  const record = useCallback((state: HistorySnapshot) => {
    if (isUndoingOrRedoing.current) return
    window.clearTimeout(debounceTimerRef.current)
    setPast((prev) => [...prev.slice(-MAX_HISTORY + 1), state])
    setFuture([])
  }, [])

  // Auto-record edits with debouncing (collapsing rapid slider changes into 1 step)
  useEffect(() => {
    if (!enabled) {
      previousRef.current = currentState
      return
    }

    if (!isInitializedRef.current) {
      isInitializedRef.current = true
      previousRef.current = currentState
      return
    }

    if (isUndoingOrRedoing.current) {
      previousRef.current = currentState
      return
    }

    const prevJson = JSON.stringify(previousRef.current)
    const currJson = JSON.stringify(currentState)
    if (prevJson === currJson) return

    // Keep `previousRef` pinned to the state from before this whole run of edits
    // (not just the one before this latest change) until a snapshot actually
    // commits. Advancing it on every intermediate change here, as a rapid sequence
    // like a drag produces, would make each commit capture only the state one tiny
    // step back from the end of the gesture instead of the state from before it
    // started, so Undo would barely move.
    const snapshotToSave = previousRef.current
    window.clearTimeout(debounceTimerRef.current)
    debounceTimerRef.current = window.setTimeout(() => {
      setPast((prev) => [...prev.slice(-MAX_HISTORY + 1), snapshotToSave])
      setFuture([])
      // Each edit replaces the previous (cancelled) timer with a new one closing
      // over that render's `currentState`, so only the final, surviving timer's
      // closure — the state as of the end of this run of edits — ever runs here.
      previousRef.current = currentState
    }, 250)
  }, [currentState, enabled])

  const undo = useCallback(() => {
    window.clearTimeout(debounceTimerRef.current)
    const step = stepBack({ past, future }, currentState)
    if (step === null) return

    isUndoingOrRedoing.current = true
    setPast(step.past)
    setFuture(step.future)
    onApplySnapshot(step.snapshot)
    previousRef.current = step.snapshot
    window.setTimeout(() => {
      isUndoingOrRedoing.current = false
    }, 100)
  }, [past, future, currentState, onApplySnapshot])

  const redo = useCallback(() => {
    window.clearTimeout(debounceTimerRef.current)
    const step = stepForward({ past, future }, currentState)
    if (step === null) return

    isUndoingOrRedoing.current = true
    setPast(step.past)
    setFuture(step.future)
    onApplySnapshot(step.snapshot)
    previousRef.current = step.snapshot
    window.setTimeout(() => {
      isUndoingOrRedoing.current = false
    }, 100)
  }, [past, future, currentState, onApplySnapshot])

  // Global keyboard shortcuts (Cmd+Z / Ctrl+Z for Undo, Cmd+Shift+Z / Ctrl+Y for Redo)
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const activeTag = (event.target as HTMLElement | null)?.tagName
      if (activeTag === 'INPUT' || activeTag === 'TEXTAREA' || activeTag === 'SELECT') {
        return
      }

      const isMac = navigator.platform.toUpperCase().includes('MAC')
      const modifier = isMac ? event.metaKey : event.ctrlKey

      if (modifier && event.key.toLowerCase() === 'z') {
        event.preventDefault()
        if (event.shiftKey) {
          redo()
        } else {
          undo()
        }
      } else if (!isMac && modifier && event.key.toLowerCase() === 'y') {
        event.preventDefault()
        redo()
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [undo, redo])

  return {
    canUndo: past.length > 0,
    canRedo: future.length > 0,
    undo,
    redo,
    record,
  }
}

