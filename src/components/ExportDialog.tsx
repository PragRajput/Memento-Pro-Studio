import { formatTimecode } from '../format.ts'
import type { ExportState } from '../export/useExporter.ts'

interface ExportDialogProps {
  state: ExportState
  /** What the export will produce, e.g. "1920×1080 · 30 fps". */
  outputLabel: string
  duration: number
  onStart: () => void
  onCancel: () => void
  onClose: () => void
}

export function ExportDialog({ state, outputLabel, duration, onStart, onCancel, onClose }: ExportDialogProps) {
  return (
    <div className="dialog-backdrop">
      <div
        className="dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="export-title"
        onKeyDown={(event) => {
          if (event.key === 'Escape' && state.status !== 'running') onClose()
        }}
      >
        <h2 id="export-title">Export video</h2>
        <p className="dialog-summary">
          MP4 · {outputLabel} · {formatTimecode(duration)}
        </p>

        {state.status === 'idle' && (
          <>
            {state.notice && <p className="dialog-note">{state.notice}</p>}
            <p>The video is created on this computer; nothing is uploaded.</p>
            <div className="dialog-actions">
              <button type="button" className="secondary" onClick={onClose}>
                Close
              </button>
              <button type="button" onClick={onStart} autoFocus>
                Start export
              </button>
            </div>
          </>
        )}

        {state.status === 'running' && (
          <>
            <progress className="export-progress" max={1} value={state.fraction} />
            <p className="dialog-note" aria-live="polite">
              {state.stage} · {Math.floor(state.fraction * 100)}%
            </p>
            <div className="dialog-actions">
              <button type="button" className="secondary" onClick={onCancel} autoFocus>
                Cancel
              </button>
            </div>
          </>
        )}

        {state.status === 'done' && (
          <>
            <p>
              Your video is ready ({formatFileSize(state.result.blob.size)}, {state.result.codecs}).
            </p>
            {state.result.notes.map((note) => (
              <p key={note} className="dialog-note">
                {note}
              </p>
            ))}
            <div className="dialog-actions">
              <button type="button" className="secondary" onClick={onClose}>
                Close
              </button>
              <a className="button download-link" href={state.url} download={state.fileName} autoFocus>
                Download
              </a>
            </div>
          </>
        )}

        {state.status === 'error' && (
          <>
            <p className="error" role="alert">
              {state.message}
            </p>
            <div className="dialog-actions">
              <button type="button" className="secondary" onClick={onClose}>
                Close
              </button>
              <button type="button" onClick={onStart} autoFocus>
                Try again
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}
