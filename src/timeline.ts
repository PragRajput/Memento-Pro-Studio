import type { SourceRange, TimelineItem } from './types.ts'

/** Shortest piece, in seconds, that a trim or split may leave. */
export const MIN_ITEM_LENGTH = 0.1

export function itemLength(item: SourceRange & { speed?: number }): number {
  const speed = item.speed ?? 1
  return (item.outPoint - item.inPoint) / (speed > 0 ? speed : 1)
}

export function timelineDuration(items: readonly TimelineItem[]): number {
  return items.reduce((total, item) => total + itemLength(item), 0)
}

/** Timeline start time of every item; items play back to back without gaps. */
export function itemStarts(items: readonly TimelineItem[]): number[] {
  const starts: number[] = []
  let time = 0
  for (const item of items) {
    starts.push(time)
    time += itemLength(item)
  }
  return starts
}

export interface TimelinePosition {
  index: number
  /** Seconds from the start of that item. */
  offset: number
}

/** Find the item at a timeline time. Times at or past the end map to the end of the last item. */
export function locate(items: readonly TimelineItem[], time: number): TimelinePosition | null {
  let start = 0
  for (const [index, item] of items.entries()) {
    const length = itemLength(item)
    if (time < start + length || index === items.length - 1) {
      return { index, offset: clamp(time - start, 0, length) }
    }
    start += length
  }
  return null
}

export function createItem(clipId: string, inPoint: number, outPoint: number): TimelineItem {
  return { id: crypto.randomUUID(), clipId, inPoint, outPoint, muted: false }
}

export function insertItem(
  items: readonly TimelineItem[],
  item: TimelineItem,
  index: number,
): TimelineItem[] {
  const next = [...items]
  next.splice(index, 0, item)
  return next
}

/** Move an item; `to` is its index among the other items. */
export function moveItem(items: readonly TimelineItem[], from: number, to: number): TimelineItem[] {
  const next = [...items]
  const [moved] = next.splice(from, 1)
  next.splice(to, 0, moved)
  return next
}

/** Move one edge of an item, keeping it inside its source and at least MIN_ITEM_LENGTH long. */
export function trimItem(
  items: readonly TimelineItem[],
  id: string,
  edge: 'in' | 'out',
  sourceTime: number,
  sourceDuration: number,
): TimelineItem[] {
  return items.map((item) => {
    if (item.id !== id) return item
    return edge === 'in'
      ? { ...item, inPoint: clamp(sourceTime, 0, item.outPoint - MIN_ITEM_LENGTH) }
      : { ...item, outPoint: clamp(sourceTime, item.inPoint + MIN_ITEM_LENGTH, sourceDuration) }
  })
}

/** Cut the item under `time` in two, or return null when a piece would be too short. */
export function splitAt(
  items: readonly TimelineItem[],
  time: number,
): { items: TimelineItem[]; rightId: string } | null {
  const position = locate(items, time)
  if (position === null) return null
  const item = items[position.index]
  if (position.offset < MIN_ITEM_LENGTH || itemLength(item) - position.offset < MIN_ITEM_LENGTH) {
    return null
  }
  const cut = item.inPoint + position.offset * (item.speed ?? 1)
  const right: TimelineItem = {
    ...item,
    id: crypto.randomUUID(),
    inPoint: cut,
    outPoint: item.outPoint,
  }
  const next = [...items]
  next.splice(position.index, 1, { ...item, outPoint: cut }, right)
  return { items: next, rightId: right.id }
}

/** Where a new item dropped at `time` goes: before the first item whose midpoint is later. */
export function insertionIndex(items: readonly TimelineItem[], time: number): number {
  const starts = itemStarts(items)
  return items.filter((item, index) => starts[index] + itemLength(item) / 2 < time).length
}

/** Where the dragged item lands, as an index among the other items, judged by the current layout. */
export function reorderTarget(items: readonly TimelineItem[], from: number, time: number): number {
  const starts = itemStarts(items)
  return items.filter(
    (item, index) => index !== from && starts[index] + itemLength(item) / 2 < time,
  ).length
}

/** Timeline time, in the current layout, of the gap where a dragged item would land. */
export function reorderMarkerTime(items: readonly TimelineItem[], from: number, to: number): number {
  const starts = itemStarts(items)
  const others = items.flatMap((item, index) =>
    index === from ? [] : [{ start: starts[index], end: starts[index] + itemLength(item) }],
  )
  if (others.length === 0) return 0
  return to < others.length ? others[to].start : others[others.length - 1].end
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max)
}
