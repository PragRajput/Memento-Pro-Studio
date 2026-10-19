import { useCallback, useEffect, useRef, useState } from 'react'
import type { AspectRatio, AudioTimelineItem, TextOverlay, TimelineItem, Transition } from './types.ts'

export interface HistorySnapshot {
  items: TimelineItem[]
  audioItems: AudioTimelineItem[]
  textItems: TextOverlay[]
  transitions: Transition[]
  aspectRatio: AspectRatio
}

const MAX_HISTORY = 40

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

    const snapshotToSave = previousRef.current
    window.clearTimeout(debounceTimerRef.current)
    debounceTimerRef.current = window.setTimeout(() => {
      setPast((prev) => [...prev.slice(-MAX_HISTORY + 1), snapshotToSave])
      setFuture([])
    }, 250)

    previousRef.current = currentState
  }, [currentState, enabled])

  const undo = useCallback(() => {
    window.clearTimeout(debounceTimerRef.current)
    setPast((prevPast) => {
      if (prevPast.length === 0) return prevPast
      const previous = prevPast[prevPast.length - 1]
      const newPast = prevPast.slice(0, -1)

      isUndoingOrRedoing.current = true
      setFuture((prevFuture) => [currentState, ...prevFuture])
      onApplySnapshot(previous)
      previousRef.current = previous
      setTimeout(() => {
        isUndoingOrRedoing.current = false
      }, 100)

      return newPast
    })
  }, [currentState, onApplySnapshot])

  const redo = useCallback(() => {
    window.clearTimeout(debounceTimerRef.current)
    setFuture((prevFuture) => {
      if (prevFuture.length === 0) return prevFuture
      const next = prevFuture[0]
      const newFuture = prevFuture.slice(1)

      isUndoingOrRedoing.current = true
      setPast((prevPast) => [...prevPast, currentState])
      onApplySnapshot(next)
      previousRef.current = next
      setTimeout(() => {
        isUndoingOrRedoing.current = false
      }, 100)

      return newFuture
    })
  }, [currentState, onApplySnapshot])

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
