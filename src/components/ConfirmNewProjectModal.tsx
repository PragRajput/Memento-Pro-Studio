import { useEffect } from 'react'

interface ConfirmNewProjectModalProps {
  isOpen: boolean
  onConfirm: () => void
  onCancel: () => void
}

export function ConfirmNewProjectModal({ isOpen, onConfirm, onCancel }: ConfirmNewProjectModalProps) {
  useEffect(() => {
    if (!isOpen) return
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        onCancel()
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [isOpen, onCancel])

  if (!isOpen) return null

  return (
    <div className="dialog-backdrop" onClick={onCancel} role="presentation">
      <div
        className="dialog confirm-dialog"
        role="dialog"
        aria-modal="true"
        aria-label="Start New Project"
        onClick={(e) => e.stopPropagation()}
      >
        <h2>Start New Project?</h2>
        <p className="dialog-summary">
          This will clear all video clips, audio tracks, titles, and transitions from your timeline and browser storage.
        </p>
        <p className="dialog-note">
          Any exported MP4 files will remain untouched on your computer.
        </p>
        <div className="dialog-actions">
          <button type="button" className="btn-secondary" onClick={onCancel}>
            Cancel
          </button>
          <button type="button" className="btn-danger" onClick={onConfirm}>
            Start New Project
          </button>
        </div>
      </div>
    </div>
  )
}

