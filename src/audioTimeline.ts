import { clamp, itemLength, MIN_ITEM_LENGTH } from './timeline.ts'
import type { AudioTimelineItem } from './types.ts'

export function createAudioItem(
  clipId: string,
  inPoint: number,
  outPoint: number,
  start: number,
): AudioTimelineItem {
  return { id: crypto.randomUUID(), clipId, inPoint, outPoint, start, volume: 1 }
}

export function audioItemEnd(item: AudioTimelineItem): number {
  return item.start + itemLength(item)
}

/** Where a newly added item should start: right after the last one, or at 0 if the lane is empty. */
export function nextAudioStart(items: readonly AudioTimelineItem[]): number {
  return items.reduce((end, item) => Math.max(end, audioItemEnd(item)), 0)
}

/** Find the item covering a timeline time, if any (items never overlap each other). */
export function locateAudioItem(
  items: readonly AudioTimelineItem[],
  time: number,
): AudioTimelineItem | null {
  return items.find((item) => time >= item.start && time < audioItemEnd(item)) ?? null
}

interface Span {
  start: number
  end: number
}

/** The free gaps between other items, within [0, maxEnd]. */
function openGaps(items: readonly AudioTimelineItem[], excludeId: string, maxEnd: number): Span[] {
  const obstacles = items
    .filter((item) => item.id !== excludeId)
    .map((item) => ({ start: item.start, end: audioItemEnd(item) }))
    .sort((a, b) => a.start - b.start)
  const gaps: Span[] = []
  let cursor = 0
  for (const obstacle of obstacles) {
    if (obstacle.start > cursor) gaps.push({ start: cursor, end: obstacle.start })
    cursor = Math.max(cursor, obstacle.end)
  }
  if (cursor < maxEnd) gaps.push({ start: cursor, end: maxEnd })
  return gaps
}

/**
 * Find where a new audio clip can land: finds the closest gap to desiredStart
 * and automatically fits its length to the available gap if bounded by another item.
 */
export function findAudioPlacement(
  items: readonly AudioTimelineItem[],
  desiredStart: number,
  clipDuration: number,
  maxEnd?: number,
): { start: number; length: number } | null {
  const target = desiredStart < 1.5 ? 0 : desiredStart

  // Sort existing obstacles
  const obstacles = items
    .map((item) => ({ start: item.start, end: audioItemEnd(item) }))
    .sort((a, b) => a.start - b.start)
  const gaps: Span[] = []
  let cursor = 0
  for (const obstacle of obstacles) {
    if (obstacle.start > cursor) gaps.push({ start: cursor, end: obstacle.start })
    cursor = Math.max(cursor, obstacle.end)
  }
  const effectiveMax = maxEnd !== undefined && maxEnd > 0 ? Math.max(cursor, maxEnd) : Infinity
  gaps.push({ start: cursor, end: effectiveMax })

  const viable = gaps.filter((gap) => gap.end - gap.start >= MIN_ITEM_LENGTH)
  if (viable.length === 0) return null

  let best = viable[0]
  let bestDistance = Infinity
  for (const gap of viable) {
    const candidate = clamp(target, gap.start, Math.max(gap.start, gap.end - MIN_ITEM_LENGTH))
    const distance = Math.abs(candidate - target)
    if (distance < bestDistance) {
      bestDistance = distance
      best = gap
    }
  }

  const start = clamp(target, best.start, Math.max(best.start, best.end - MIN_ITEM_LENGTH))
  const snappedStart = start < 1.5 && best.start === 0 ? 0 : start
  const available = best.end === Infinity ? clipDuration : best.end - snappedStart
  const length = clamp(Math.min(clipDuration, available), MIN_ITEM_LENGTH, available)
  return { start: snappedStart, length }
}

/**
 * Where a dragged item should land: as close to `desiredStart` as possible,
 * within [0, maxEnd], without overlapping another item in the lane.
 */
export function clampAudioStart(
  items: readonly AudioTimelineItem[],
  excludeId: string,
  desiredStart: number,
  length: number,
  maxEnd: number,
): number | null {
  const target = desiredStart < 1.5 ? 0 : desiredStart
  if (maxEnd <= 0) return Math.max(0, target)
  const desired = clamp(target, 0, Math.max(0, maxEnd - length))
  const viable = openGaps(items, excludeId, maxEnd).filter((gap) => gap.end - gap.start >= length - 1e-9)
  if (viable.length === 0) return null

  let best = viable[0]
  let bestDistance = Infinity
  for (const gap of viable) {
    const candidate = clamp(desired, gap.start, gap.end - length)
    const distance = Math.abs(candidate - desired)
    if (distance < bestDistance) {
      bestDistance = distance
      best = gap
    }
  }
  const result = clamp(desired, best.start, best.end - length)
  return result < 1.5 && best.start === 0 ? 0 : result
}


/** The nearest other items' edges around `start`, to bound a trim. */
function neighborBounds(
  items: readonly AudioTimelineItem[],
  excludeId: string,
  start: number,
): { prevEnd: number; nextStart: number } {
  let prevEnd = 0
  let nextStart = Infinity
  for (const item of items) {
    if (item.id === excludeId) continue
    const end = audioItemEnd(item)
    if (end <= start && end > prevEnd) prevEnd = end
    if (item.start >= start && item.start < nextStart) nextStart = item.start
  }
  return { prevEnd, nextStart }
}

/**
 * Move one edge of an audio item. Trimming the in edge also moves the item's
 * timeline position, so the untouched edge stays put. Neither edge may cross a
 * neighboring item, the source bounds, or [0, maxEnd].
 */
export function trimAudioItem(
  items: readonly AudioTimelineItem[],
  id: string,
  edge: 'in' | 'out',
  sourceTime: number,
  sourceDuration: number,
  maxEnd: number,
): AudioTimelineItem[] {
  return items.map((item) => {
    if (item.id !== id) return item
    const { prevEnd, nextStart } = neighborBounds(items, id, item.start)
    if (edge === 'out') {
      const lengthLimit = Math.min(nextStart, maxEnd) - item.start
      const outPoint = clamp(sourceTime, item.inPoint + MIN_ITEM_LENGTH, sourceDuration)
      const length = clamp(outPoint - item.inPoint, MIN_ITEM_LENGTH, Math.max(MIN_ITEM_LENGTH, lengthLimit))
      return { ...item, outPoint: item.inPoint + length }
    }
    // The in edge and the timeline start move together (shrinking from the left
    // moves the start later; growing moves it earlier), while the out edge and
    // audioItemEnd(item) both stay fixed. Find the shared shift valid for both the
    // source bounds and the timeline bounds, then apply it to both fields at once.
    const end = audioItemEnd(item)
    const minDelta = Math.max(0 - item.inPoint, prevEnd - item.start)
    const maxDelta = Math.min(item.outPoint - MIN_ITEM_LENGTH - item.inPoint, end - MIN_ITEM_LENGTH - item.start)
    const delta = clamp(sourceTime - item.inPoint, minDelta, maxDelta)
    return { ...item, inPoint: item.inPoint + delta, start: item.start + delta }
  })
}

/** Cut the item under `time` in two, or null when no item is there or a piece would be too short. */
export function splitAudioAt(
  items: readonly AudioTimelineItem[],
  time: number,
): { items: AudioTimelineItem[]; rightId: string } | null {
  const item = locateAudioItem(items, time)
  if (item === null) return null
  const offset = time - item.start
  if (offset < MIN_ITEM_LENGTH || itemLength(item) - offset < MIN_ITEM_LENGTH) return null

  const cut = item.inPoint + offset
  const left = { ...item, outPoint: cut }
  const right = createAudioItem(item.clipId, cut, item.outPoint, time)
  right.volume = item.volume
  return { items: items.map((candidate) => (candidate.id === item.id ? left : candidate)).concat(right), rightId: right.id }
}
