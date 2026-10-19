import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { outputSizeForAspectRatio, planFrames } from '../src/export/plan.ts'
import { FILTER_PRESETS, getClipTransform, getCssFilter } from '../src/filters.ts'
import { itemLength, locate, timelineDuration } from '../src/timeline.ts'
import type { TimelineItem } from '../src/types.ts'

describe('Aspect ratio presets & export sizing', () => {
  const source = { width: 1920, height: 1080 }

  it('calculates 16:9 landscape dimensions', () => {
    const size = outputSizeForAspectRatio('16:9', source)
    assert.deepEqual(size, { width: 1920, height: 1080 })
  })

  it('calculates 9:16 vertical dimensions (TikTok/Reels)', () => {
    const size = outputSizeForAspectRatio('9:16', source)
    assert.deepEqual(size, { width: 1080, height: 1920 })
  })

  it('calculates 1:1 square dimensions (Instagram)', () => {
    const size = outputSizeForAspectRatio('1:1', source)
    assert.deepEqual(size, { width: 1080, height: 1080 })
  })

  it('calculates 4:5 portrait dimensions', () => {
    const size = outputSizeForAspectRatio('4:5', source)
    assert.deepEqual(size, { width: 1080, height: 1350 })
  })

  it('calculates 21:9 cinematic ultra-wide dimensions', () => {
    const size = outputSizeForAspectRatio('21:9', source)
    assert.deepEqual(size, { width: 1920, height: 822 })
  })
})

describe('Filters & Color Grading Presets', () => {
  it('provides 10 distinct preset configurations', () => {
    assert.equal(FILTER_PRESETS.length, 10)
  })

  it('returns none for default filter', () => {
    assert.equal(getCssFilter('none', 1), 'none')
    assert.equal(getCssFilter(undefined, 1), 'none')
  })

  it('generates valid CSS filter for cinematic and adjusts with intensity', () => {
    const full = getCssFilter('cinematic', 1)
    assert.ok(full.includes('contrast'))
    assert.ok(full.includes('saturate'))

    const zero = getCssFilter('cinematic', 0)
    assert.equal(zero, 'none')
  })

  it('generates valid CSS filter for noir and sepia', () => {
    const noir = getCssFilter('noir', 1)
    assert.ok(noir.includes('grayscale('))

    const sepia = getCssFilter('sepia', 1)
    assert.ok(sepia.includes('sepia('))
  })
})

describe('Clip Transforms (Rotate, Flip)', () => {
  it('returns none when no transform applied', () => {
    assert.equal(getClipTransform(undefined), 'none')
    assert.equal(getClipTransform({ inPoint: 0, outPoint: 5, id: '1', clipId: 'c1' }), 'none')
  })

  it('applies rotation correctly', () => {
    const trans = getClipTransform({ inPoint: 0, outPoint: 5, id: '1', clipId: 'c1', rotation: 90 })
    assert.equal(trans, 'rotate(90deg)')
  })

  it('applies horizontal and vertical flips', () => {
    const transH = getClipTransform({ inPoint: 0, outPoint: 5, id: '1', clipId: 'c1', flipH: true })
    assert.equal(transH, 'scaleX(-1)')

    const transBoth = getClipTransform({ inPoint: 0, outPoint: 5, id: '1', clipId: 'c1', rotation: 180, flipH: true, flipV: true })
    assert.ok(transBoth.includes('rotate(180deg)'))
    assert.ok(transBoth.includes('scaleX(-1)'))
    assert.ok(transBoth.includes('scaleY(-1)'))
  })
})

describe('Variable Playback Speed on Timeline', () => {
  it('scales item duration according to speed multiplier', () => {
    const normalItem: TimelineItem = { inPoint: 0, outPoint: 10, id: '1', clipId: 'c1', speed: 1 }
    const fastItem: TimelineItem = { inPoint: 0, outPoint: 10, id: '2', clipId: 'c1', speed: 2 }
    const slowItem: TimelineItem = { inPoint: 0, outPoint: 10, id: '3', clipId: 'c1', speed: 0.5 }

    assert.equal(itemLength(normalItem), 10)
    assert.equal(itemLength(fastItem), 5)
    assert.equal(itemLength(slowItem), 20)
  })

  it('calculates timeline duration with mixed speed items', () => {
    const items: TimelineItem[] = [
      { inPoint: 0, outPoint: 4, id: '1', clipId: 'c1', speed: 2 }, // 2s on timeline
      { inPoint: 0, outPoint: 2, id: '2', clipId: 'c1', speed: 0.5 }, // 4s on timeline
    ]
    assert.equal(timelineDuration(items), 6)
  })

  it('plans frame source times respecting speed', () => {
    const items: TimelineItem[] = [
      { inPoint: 0, outPoint: 2, id: '1', clipId: 'c1', speed: 2 }, // 1s on timeline -> 30 frames
    ]
    const plan = planFrames(items, 30)
    assert.equal(plan.duration, 1)
    assert.equal(plan.frameCount, 30)
    // At 2x speed, after 0.5s on timeline (frame 15), source time should be ~1.0s
    assert.ok(Math.abs(plan.items[0].sourceTimes[15] - 1.0) < 0.1)
  })

  it('locates playhead correctly across speed-scaled items', () => {
    const items: TimelineItem[] = [
      { inPoint: 0, outPoint: 6, id: '1', clipId: 'c1', speed: 2 }, // 0 to 3s
      { inPoint: 10, outPoint: 14, id: '2', clipId: 'c2', speed: 1 }, // 3 to 7s
    ]
    const pos = locate(items, 2)
    assert.notEqual(pos, null)
    assert.equal(pos?.index, 0)
    assert.equal(pos?.offset, 2)

    const pos2 = locate(items, 4)
    assert.notEqual(pos2, null)
    assert.equal(pos2?.index, 1)
    assert.equal(pos2?.offset, 1)
  })
})
