import { useCallback, useEffect, useRef, useState } from 'react'
import type { AspectRatio, AudioClip, AudioTimelineItem, MediaClip, TextOverlay, TimelineItem, Transition } from '../types.ts'
import { exportTimeline } from './exportTimeline.ts'
import type { ExportResult } from './exportTimeline.ts'

export type ExportState =
  | { status: 'idle'; notice?: string }
  | { status: 'running'; stage: string; fraction: number }
  | { status: 'done'; result: ExportResult; url: string; fileName: string }
  | { status: 'error'; message: string }

const CANCELLED: ExportState = { status: 'idle', notice: 'Export cancelled.' }

/** Runs one export at a time and owns its download URL. */
export function useExporter(
  items: readonly TimelineItem[],
  clips: ReadonlyMap<string, MediaClip>,
  audioItems: readonly AudioTimelineItem[],
  audioClips: ReadonlyMap<string, AudioClip>,
  textItems: readonly TextOverlay[] = [],
  transitions: readonly Transition[] = [],
  aspectRatio: AspectRatio = '16:9',
) {
  const [state, setState] = useState<ExportState>({ status: 'idle' })
  const controllerRef = useRef<AbortController | null>(null)

  // Release the finished file when it is replaced or the editor closes.
  const url = state.status === 'done' ? state.url : null
  useEffect(() => {
    if (url === null) return
    return () => URL.revokeObjectURL(url)
  }, [url])

  useEffect(() => () => controllerRef.current?.abort(), [])

  const start = useCallback(async () => {
    controllerRef.current?.abort()
    const controller = new AbortController()
    controllerRef.current = controller
    setState({ status: 'running', stage: 'Preparing', fraction: 0 })
    try {
      const result = await exportTimeline(items, clips, audioItems, audioClips, textItems, transitions, aspectRatio, {
        signal: controller.signal,
        onProgress: (stage, fraction) => {
          if (!controller.signal.aborted) setState({ status: 'running', stage, fraction })
        },
      })
      setState(
        controller.signal.aborted
          ? CANCELLED
          : { status: 'done', result, url: URL.createObjectURL(result.blob), fileName: exportFileName() },
      )
    } catch (error) {
      setState(
        controller.signal.aborted
          ? CANCELLED
          : { status: 'error', message: error instanceof Error ? error.message : String(error) },
      )
    } finally {
      if (controllerRef.current === controller) controllerRef.current = null
    }
  }, [items, clips, audioItems, audioClips, textItems, transitions, aspectRatio])


  const cancel = useCallback(() => controllerRef.current?.abort(), [])

  const reset = useCallback(() => {
    controllerRef.current?.abort()
    setState({ status: 'idle' })
  }, [])

  return { state, start, cancel, reset }
}

function exportFileName(): string {
  const now = new Date()
  const pad = (value: number) => String(value).padStart(2, '0')
  const date = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}`
  const time = `${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`
  return `mini-video-editor-${date}-${time}.mp4`
}
