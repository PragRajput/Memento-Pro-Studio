import { clamp, MIN_ITEM_LENGTH } from './timeline.ts'
import type { TextOverlay, TextPosition, TextSize } from './types.ts'

export const DEFAULT_TEXT_DURATION = 3

export function createTextOverlay(
  start: number,
  duration = DEFAULT_TEXT_DURATION,
  text = 'Your Title Here',
  position: TextPosition = 'bottom',
  size: TextSize = 'medium',
  color = '#ffffff',
  x = 50,
  y = 85,
  fontSize = 48,
  fontFamily = 'Inter',
  backgroundColor = 'transparent',
): TextOverlay {
  return {
    id: crypto.randomUUID(),
    text,
    start,
    duration: Math.max(MIN_ITEM_LENGTH, duration),
    position,
    size,
    color,
    x,
    y,
    fontSize,
    fontFamily,
    backgroundColor,
    textAlign: 'center',
  }
}

export function textOverlayEnd(item: TextOverlay): number {
  return item.start + item.duration
}

/** Check which text overlays are active at a given timeline time. */
export function locateActiveTexts(
  items: readonly TextOverlay[],
  time: number,
): TextOverlay[] {
  return items.filter((item) => time >= item.start && time < textOverlayEnd(item))
}

/** Find the text overlay under playhead time. */
export function locateTextUnder(
  items: readonly TextOverlay[],
  time: number,
): TextOverlay | null {
  return items.find((item) => time >= item.start && time < textOverlayEnd(item)) ?? null
}

/** Move a text overlay's start time, keeping it within [0, maxEnd - item.duration]. */
export function moveTextOverlay(
  items: readonly TextOverlay[],
  id: string,
  start: number,
  maxEnd: number,
): TextOverlay[] {
  return items.map((item) => {
    if (item.id !== id) return item
    const clampedStart = clamp(start, 0, Math.max(0, maxEnd - item.duration))
    return { ...item, start: clampedStart }
  })
}

/** Trim start or end of a text overlay. */
export function trimTextOverlay(
  items: readonly TextOverlay[],
  id: string,
  edge: 'in' | 'out',
  time: number,
  maxEnd: number,
): TextOverlay[] {
  return items.map((item) => {
    if (item.id !== id) return item
    if (edge === 'out') {
      const newDuration = clamp(time - item.start, MIN_ITEM_LENGTH, Math.max(MIN_ITEM_LENGTH, maxEnd - item.start))
      return { ...item, duration: newDuration }
    } else {
      const end = textOverlayEnd(item)
      const clampedStart = clamp(time, 0, end - MIN_ITEM_LENGTH)
      return { ...item, start: clampedStart, duration: end - clampedStart }
    }
  })
}

/** Split the text overlay under `time` in two. */
export function splitTextAt(
  items: readonly TextOverlay[],
  time: number,
): { items: TextOverlay[]; rightId: string } | null {
  const item = locateTextUnder(items, time)
  if (item === null) return null
  const offset = time - item.start
  if (offset < MIN_ITEM_LENGTH || item.duration - offset < MIN_ITEM_LENGTH) return null

  const left: TextOverlay = { ...item, duration: offset }
  const right: TextOverlay = {
    ...item,
    id: crypto.randomUUID(),
    start: time,
    duration: item.duration - offset,
  }
  return {
    items: items.map((candidate) => (candidate.id === item.id ? left : candidate)).concat(right),
    rightId: right.id,
  }
}

