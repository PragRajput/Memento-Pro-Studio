import { useEffect } from 'react'

interface KeyboardShortcutsModalProps {
  isOpen: boolean
  onClose: () => void
}

interface ShortcutItem {
  keys: string[]
  label: string
  description: string
}

const SHORTCUTS: ShortcutItem[] = [
  {
    keys: ['Space'],
    label: 'Play / Pause',
    description: 'Toggle playback of the timeline or selected media clip',
  },
  {
    keys: ['S'],
    label: 'Split Clip',
    description: 'Split the video, audio, or text item at the current playhead position',
  },
  {
    keys: ['Del', 'Backspace'],
    label: 'Delete Selected',
    description: 'Delete the currently selected video clip, audio piece, title, or transition',
  },
  {
    keys: ['?'],
    label: 'Shortcuts Help',
    description: 'Open or close this keyboard shortcuts guide',
  },
]

const TIMELINE_GESTURES = [
  {
    action: 'Trim Edges',
    description: 'Hover and drag the left or right handle of any video, audio, or title item to trim',
  },
  {
    action: 'Reposition Audio',
    description: 'Click and drag an audio piece to shift its start time or move it between audio tracks',
  },
  {
    action: 'Position Titles',
    description: 'Click and drag text titles directly on the preview screen to position them anywhere',
  },
  {
    action: 'Add Transitions',
    description: 'Hover over the cut line between two adjacent video clips and click "+" to add a transition',
  },
]

export function KeyboardShortcutsModal({ isOpen, onClose }: KeyboardShortcutsModalProps) {
  useEffect(() => {
    if (!isOpen) return
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        onClose()
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [isOpen, onClose])

  if (!isOpen) return null

  return (
    <div className="dialog-backdrop" onClick={onClose} role="presentation">
      <div
        className="dialog shortcuts-dialog"
        role="dialog"
        aria-modal="true"
        aria-label="Keyboard Shortcuts"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="dialog-header">
          <h2>Keyboard Shortcuts & Gestures</h2>
          <button
            type="button"
            className="dialog-close-btn"
            onClick={onClose}
            aria-label="Close shortcuts"
          >
            ×
          </button>
        </div>

        <div className="shortcuts-section">
          <h3 className="shortcuts-subheading">Keyboard Controls</h3>
          <div className="shortcuts-list">
            {SHORTCUTS.map((item) => (
              <div key={item.label} className="shortcut-row">
                <div className="shortcut-keys">
                  {item.keys.map((k) => (
                    <kbd key={k} className="shortcut-key">
                      {k}
                    </kbd>
                  ))}
                </div>
                <div className="shortcut-details">
                  <span className="shortcut-name">{item.label}</span>
                  <span className="shortcut-desc">{item.description}</span>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="shortcuts-section">
          <h3 className="shortcuts-subheading">Timeline & Preview Gestures</h3>
          <div className="shortcuts-list">
            {TIMELINE_GESTURES.map((item) => (
              <div key={item.action} className="shortcut-row">
                <div className="shortcut-action-tag">
                  <span>{item.action}</span>
                </div>
                <div className="shortcut-details">
                  <span className="shortcut-desc">{item.description}</span>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="dialog-actions">
          <button type="button" className="btn-secondary" onClick={onClose}>
            Got it
          </button>
        </div>
      </div>
    </div>
  )
}

