import { locate, timelineDuration } from '../timeline.ts'
import type { TimelineItem } from '../types.ts'

/** Largest export: 1080p in either orientation. */
const MAX_LONG_SIDE = 1920
const MAX_SHORT_SIDE = 1080

export interface Size {
  width: number
  height: number
}

/**
 * Export size for a source size: the same shape, scaled down to fit 1080p, with even
 * dimensions because H.264 requires them.
 */
export function outputSize({ width, height }: Size): Size {
  const scale = Math.min(
    1,
    MAX_LONG_SIDE / Math.max(width, height),
    MAX_SHORT_SIDE / Math.min(width, height),
  )
  return { width: evenFloor(width * scale), height: evenFloor(height * scale) }
}

/** Output frames drawn from one timeline item, in order. */
export interface ItemFrames {
  itemIndex: number
  /** Index of the first output frame that shows this item. */
  firstFrame: number
  /** Source time (seconds, in the editor's clip timeline) shown by each of these frames. */
  sourceTimes: number[]
}

export interface FramePlan {
  frameCount: number
  /** Exported length in seconds: frameCount / fps. Audio is rendered to the same length. */
  duration: number
  items: ItemFrames[]
}

/** Assign every output frame to the item under its timeline time; frame n shows time n / fps. */
export function planFrames(items: readonly TimelineItem[], fps: number): FramePlan {
  const frameCount = Math.max(1, Math.round(timelineDuration(items) * fps))
  const groups: ItemFrames[] = []
  for (let frame = 0; frame < frameCount; frame++) {
    const position = locate(items, frame / fps)
    if (position === null) break
    const item = items[position.index]
    let group = groups.at(-1)
    if (group === undefined || group.itemIndex !== position.index) {
      group = { itemIndex: position.index, firstFrame: frame, sourceTimes: [] }
      groups.push(group)
    }
    group.sourceTimes.push(item.inPoint + position.offset)
  }
  return { frameCount, duration: frameCount / fps, items: groups }
}

function evenFloor(value: number): number {
  return Math.max(2, Math.floor(value / 2) * 2)
}
