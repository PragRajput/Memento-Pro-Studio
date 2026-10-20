import { locate, timelineDuration } from '../timeline.ts'
import type { AspectRatio, TimelineItem } from '../types.ts'

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

/** Export dimensions for project aspect ratio presets. */
export function outputSizeForAspectRatio(aspectRatio?: AspectRatio, sourceSize?: Size): Size {
  if (!aspectRatio) {
    return sourceSize ? outputSize(sourceSize) : { width: 1920, height: 1080 }
  }
  switch (aspectRatio) {
    case '9:16':
      return { width: 1080, height: 1920 }
    case '1:1':
      return { width: 1080, height: 1080 }
    case '4:5':
      return { width: 1080, height: 1350 }
    case '21:9':
      return { width: 1920, height: 822 }
    case '16:9':
    default:
      return { width: 1920, height: 1080 }
  }
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
export function planFrames(items: readonly TimelineItem[], fps: number, totalDuration?: number): FramePlan {
  const duration = Math.max(timelineDuration(items), totalDuration ?? 0)
  const frameCount = Math.max(1, Math.round(duration * fps))
  const videoFrames = Math.round(timelineDuration(items) * fps)
  const groups: ItemFrames[] = []
  for (let frame = 0; frame < videoFrames; frame++) {
    const position = locate(items, frame / fps)
    if (position === null) break
    const item = items[position.index]
    let group = groups.at(-1)
    if (group === undefined || group.itemIndex !== position.index) {
      group = { itemIndex: position.index, firstFrame: frame, sourceTimes: [] }
      groups.push(group)
    }
    group.sourceTimes.push(item.inPoint + position.offset * (item.speed ?? 1))
  }
  return { frameCount, duration: frameCount / fps, items: groups }
}

function evenFloor(value: number): number {
  return Math.max(2, Math.floor(value / 2) * 2)
}
