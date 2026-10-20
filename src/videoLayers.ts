import { sliceTracks } from './keyframes.ts'
import { clamp, itemLength, MIN_ITEM_LENGTH } from './timeline.ts'
import type { VideoLayerItem } from './types.ts'

/** How many layers above the base track the UI offers. */
export const MAX_VIDEO_LAYERS = 4

/** Display name for a layer index: 0 is the first layer above the base track. */
export function videoLayerName(trackIndex: number): string {
  return `V${trackIndex + 2}`
}

export function createVideoLayerItem(
  clipId: string,
  inPoint: number,
  outPoint: number,
  start: number,
  trackIndex = 0,
): VideoLayerItem {
  return { id: crypto.randomUUID(), clipId, inPoint, outPoint, start, trackIndex, muted: true }
}

export function videoLayerEnd(item: VideoLayerItem): number {
  return item.start + itemLength(item)
}

export function videoLayersDuration(items: readonly VideoLayerItem[]): number {
  return items.reduce((max, item) => Math.max(max, videoLayerEnd(item)), 0)
}

/** Source time shown by a layer item at a timeline time, honouring its speed. */
export function layerSourceTime(item: VideoLayerItem, time: number): number {
  const offset = Math.max(0, time - item.start)
  const span = item.outPoint - item.inPoint
  return item.inPoint + Math.min(offset * (item.speed ?? 1), Math.max(0, span))
}

/**
 * Every layer covering `time`, bottom layer first, so drawing them in order
 * composites V2 under V3 under V4.
 */
export function activeLayersAt(
  items: readonly VideoLayerItem[],
  time: number,
): VideoLayerItem[] {
  return items
    .filter((item) => time >= item.start && time < videoLayerEnd(item))
    .sort((a, b) => a.trackIndex - b.trackIndex)
}

export function locateVideoLayerItem(
  items: readonly VideoLayerItem[],
  time: number,
  trackIndex?: number,
): VideoLayerItem | null {
  return (
    items.find((item) => {
      if (trackIndex !== undefined && item.trackIndex !== trackIndex) return false
      return time >= item.start && time < videoLayerEnd(item)
    }) ?? null
  )
}

interface Span {
  start: number
  end: number
}

/** Free gaps on one layer, ignoring `excludeId`, within [0, maxEnd]. */
function openGaps(
  items: readonly VideoLayerItem[],
  excludeId: string,
  maxEnd: number,
  trackIndex: number,
): Span[] {
  const obstacles = items
    .filter((item) => item.id !== excludeId && item.trackIndex === trackIndex)
    .map((item) => ({ start: item.start, end: videoLayerEnd(item) }))
    .sort((a, b) => a.start - b.start)
  const gaps: Span[] = []
  let cursor = 0
  for (const obstacle of obstacles) {
    if (obstacle.start > cursor) gaps.push({ start: cursor, end: obstacle.start })
    cursor = Math.max(cursor, obstacle.end)
  }
  gaps.push({ start: cursor, end: Math.max(cursor, maxEnd) })
  return gaps
}

/**
 * Where a clip dropped at `desiredStart` can land on a layer: the closest gap
 * that fits, with the length trimmed to the gap when something is in the way.
 */
export function findLayerPlacement(
  items: readonly VideoLayerItem[],
  desiredStart: number,
  clipDuration: number,
  trackIndex: number,
): { start: number; length: number; trackIndex: number } | null {
  const target = Math.max(0, desiredStart)
  const gaps = openGaps(items, '', Infinity, trackIndex).filter(
    (gap) => gap.end - gap.start >= MIN_ITEM_LENGTH,
  )
  if (gaps.length === 0) return null

  let best = gaps[0]
  let bestDistance = Infinity
  for (const gap of gaps) {
    const candidate = clamp(target, gap.start, Math.max(gap.start, gap.end - MIN_ITEM_LENGTH))
    const distance = Math.abs(candidate - target)
    if (distance < bestDistance) {
      bestDistance = distance
      best = gap
    }
  }

  const start = clamp(target, best.start, Math.max(best.start, best.end - MIN_ITEM_LENGTH))
  const available = best.end === Infinity ? clipDuration : best.end - start
  return { start, length: clamp(Math.min(clipDuration, available), MIN_ITEM_LENGTH, available), trackIndex }
}

/** Nearest start for a dragged item that does not overlap others on its layer. */
export function clampLayerStart(
  items: readonly VideoLayerItem[],
  excludeId: string,
  desiredStart: number,
  length: number,
  trackIndex: number,
): number | null {
  const desired = Math.max(0, desiredStart)
  const viable = openGaps(items, excludeId, Infinity, trackIndex).filter(
    (gap) => gap.end - gap.start >= length - 1e-9,
  )
  if (viable.length === 0) return null

  let best = viable[0]
  let bestDistance = Infinity
  for (const gap of viable) {
    const candidate = clamp(desired, gap.start, Math.max(gap.start, gap.end - length))
    const distance = Math.abs(candidate - desired)
    if (distance < bestDistance) {
      bestDistance = distance
      best = gap
    }
  }
  return clamp(desired, best.start, Math.max(best.start, best.end - length))
}

/** Can this item sit on `trackIndex` at its current span without overlapping? */
export function layerAccepts(
  items: readonly VideoLayerItem[],
  excludeId: string,
  start: number,
  length: number,
  trackIndex: number,
): boolean {
  return items.every((item) => {
    if (item.id === excludeId || item.trackIndex !== trackIndex) return true
    return start + length <= item.start + 1e-9 || start >= videoLayerEnd(item) - 1e-9
  })
}

/** Edges of the neighbouring items around `start` on the same layer. */
function neighborBounds(
  items: readonly VideoLayerItem[],
  excludeId: string,
  start: number,
  trackIndex: number,
): { prevEnd: number; nextStart: number } {
  let prevEnd = 0
  let nextStart = Infinity
  for (const item of items) {
    if (item.id === excludeId || item.trackIndex !== trackIndex) continue
    const end = videoLayerEnd(item)
    if (end <= start && end > prevEnd) prevEnd = end
    if (item.start >= start && item.start < nextStart) nextStart = item.start
  }
  return { prevEnd, nextStart }
}

/**
 * Move one edge of a layer item. Trimming the in edge also moves its timeline
 * position so the other edge stays put, and keyframes follow the media.
 */
export function trimLayerItem(
  items: readonly VideoLayerItem[],
  id: string,
  edge: 'in' | 'out',
  sourceTime: number,
  sourceDuration: number,
): VideoLayerItem[] {
  return items.map((item) => {
    if (item.id !== id) return item
    const { prevEnd, nextStart } = neighborBounds(items, id, item.start, item.trackIndex)
    const speed = item.speed ?? 1

    if (edge === 'out') {
      const lengthLimit = nextStart - item.start
      const outPoint = clamp(sourceTime, item.inPoint + MIN_ITEM_LENGTH, sourceDuration)
      const length = clamp(
        (outPoint - item.inPoint) / speed,
        MIN_ITEM_LENGTH,
        Math.max(MIN_ITEM_LENGTH, lengthLimit),
      )
      return {
        ...item,
        outPoint: item.inPoint + length * speed,
        keyframes: sliceTracks(item.keyframes, 0, length),
      }
    }

    const end = videoLayerEnd(item)
    const minDelta = Math.max(-item.inPoint, (prevEnd - item.start) * speed)
    const maxDelta = Math.min(
      item.outPoint - MIN_ITEM_LENGTH - item.inPoint,
      (end - MIN_ITEM_LENGTH - item.start) * speed,
    )
    const delta = clamp(sourceTime - item.inPoint, minDelta, maxDelta)
    const timelineDelta = delta / speed
    return {
      ...item,
      inPoint: item.inPoint + delta,
      start: item.start + timelineDelta,
      keyframes: sliceTracks(item.keyframes, timelineDelta, (end - item.start) - timelineDelta),
    }
  })
}

/** Cut the layer item under `time` in two, splitting its keyframes with it. */
export function splitLayerAt(
  items: readonly VideoLayerItem[],
  time: number,
  selectedId?: string | null,
): { items: VideoLayerItem[]; rightId: string } | null {
  const item = selectedId
    ? items.find((candidate) => candidate.id === selectedId)
    : locateVideoLayerItem(items, time)
  if (!item || time < item.start || time >= videoLayerEnd(item)) return null

  const offset = time - item.start
  const length = itemLength(item)
  if (offset < MIN_ITEM_LENGTH || length - offset < MIN_ITEM_LENGTH) return null

  const cut = item.inPoint + offset * (item.speed ?? 1)
  const left: VideoLayerItem = {
    ...item,
    outPoint: cut,
    keyframes: sliceTracks(item.keyframes, 0, offset),
  }
  const right: VideoLayerItem = {
    ...item,
    id: crypto.randomUUID(),
    inPoint: cut,
    start: time,
    keyframes: sliceTracks(item.keyframes, offset, length - offset),
  }
  return {
    items: items.map((candidate) => (candidate.id === item.id ? left : candidate)).concat(right),
    rightId: right.id,
  }
}

/** Drop a whole layer and pull the layers above it down one index. */
export function removeVideoLayer(
  items: readonly VideoLayerItem[],
  trackIndex: number,
): VideoLayerItem[] {
  return items
    .filter((item) => item.trackIndex !== trackIndex)
    .map((item) =>
      item.trackIndex > trackIndex ? { ...item, trackIndex: item.trackIndex - 1 } : item,
    )
}
