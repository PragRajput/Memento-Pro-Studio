import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import type { ReactNode, RefObject } from 'react'

interface PopoverProps {
  /** The control the panel hangs from. */
  anchorRef: RefObject<HTMLElement | null>
  open: boolean
  onClose: () => void
  width: number
  children: ReactNode
  className?: string
}

/** Gap between the anchor and the panel, and the margin kept from the viewport edge. */
const OFFSET = 6
const EDGE_MARGIN = 8

/**
 * A panel anchored to a control but rendered into document.body.
 *
 * It has to escape the DOM: these menus hang off the timeline toolbar, which
 * sits inside a panel with `overflow: hidden` near the bottom of the window, so
 * an absolutely positioned child is clipped whichever way it opens. Portalling
 * out and positioning from the anchor's rect sidesteps every clipping ancestor,
 * and lets the panel flip above the control when there is no room below.
 */
export function Popover({ anchorRef, open, onClose, width, children, className }: PopoverProps) {
  const panelRef = useRef<HTMLDivElement>(null)
  const [position, setPosition] = useState<{ left: number; top: number } | null>(null)

  useLayoutEffect(() => {
    // A stale position is harmless: this runs before paint, so reopening
    // re-measures and repositions the panel before it is ever shown.
    if (!open) return

    const place = () => {
      const anchor = anchorRef.current
      if (anchor === null) return
      const rect = anchor.getBoundingClientRect()
      const height = panelRef.current?.offsetHeight ?? 0

      const spaceBelow = window.innerHeight - rect.bottom - OFFSET - EDGE_MARGIN
      const openUpward = height > spaceBelow && rect.top - OFFSET - EDGE_MARGIN > spaceBelow
      const top = openUpward ? Math.max(EDGE_MARGIN, rect.top - OFFSET - height) : rect.bottom + OFFSET

      const left = Math.min(
        Math.max(EDGE_MARGIN, rect.left),
        Math.max(EDGE_MARGIN, window.innerWidth - width - EDGE_MARGIN),
      )
      setPosition({ left, top })
    }

    // Place once the panel has a height to measure, then keep it anchored.
    place()
    const frame = requestAnimationFrame(place)
    window.addEventListener('resize', place)
    window.addEventListener('scroll', place, true)
    return () => {
      cancelAnimationFrame(frame)
      window.removeEventListener('resize', place)
      window.removeEventListener('scroll', place, true)
    }
  }, [open, anchorRef, width])

  useEffect(() => {
    if (!open) return
    const onPointerDown = (event: globalThis.PointerEvent) => {
      const target = event.target as Node | null
      if (panelRef.current?.contains(target ?? null)) return
      if (anchorRef.current?.contains(target ?? null)) return
      onClose()
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    document.addEventListener('pointerdown', onPointerDown, true)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('pointerdown', onPointerDown, true)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [open, onClose, anchorRef])

  if (!open) return null

  return createPortal(
    <div
      ref={panelRef}
      className={`popover-panel${className ? ` ${className}` : ''}`}
      style={{
        position: 'fixed',
        width,
        left: position?.left ?? -9999,
        top: position?.top ?? -9999,
        // Hidden until measured, so it never flashes in the wrong place.
        visibility: position === null ? 'hidden' : 'visible',
      }}
    >
      {children}
    </div>,
    document.body,
  )
}
