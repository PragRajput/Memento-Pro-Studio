import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { outputSize, planFrames } from '../src/export/plan.ts'
import type { TimelineItem } from '../src/types.ts'

describe('Footage orientation and export sizing', () => {
  it('preserves 1080p landscape dimensions', () => {
    const size = outputSize({ width: 1920, height: 1080 })
    assert.deepEqual(size, { width: 1920, height: 1080 })
  })

  it('correctly handles iPhone portrait 9:16 footage (1080x1920)', () => {
    const size = outputSize({ width: 1080, height: 1920 })
    assert.deepEqual(size, { width: 1080, height: 1920 })
  })

  it('downscales 4K landscape footage (3840x2160) to 1080p while preserving aspect ratio', () => {
    const size = outputSize({ width: 3840, height: 2160 })
    assert.deepEqual(size, { width: 1920, height: 1080 })
  })

  it('downscales 4K iPhone portrait footage (2160x3840) to 1080x1920', () => {
    const size = outputSize({ width: 2160, height: 3840 })
    assert.deepEqual(size, { width: 1080, height: 1920 })
  })

  it('preserves 1:1 square video (1080x1080)', () => {
    const size = outputSize({ width: 1080, height: 1080 })
    assert.deepEqual(size, { width: 1080, height: 1080 })
  })

  it('ensures odd dimensions are floored to even numbers for H.264 codec compatibility', () => {
    const size = outputSize({ width: 721, height: 1281 })
    assert.equal(size.width % 2, 0)
    assert.equal(size.height % 2, 0)
  })

  it('plans frames monotonically over timeline items', () => {
    const items: TimelineItem[] = [
      { id: 'item-1', clipId: 'clip-1', inPoint: 0, outPoint: 2 },
      { id: 'item-2', clipId: 'clip-2', inPoint: 1, outPoint: 3 },
    ]
    const plan = planFrames(items, 30)
    assert.equal(plan.duration, 4)
    assert.equal(plan.frameCount, 120)
    assert.equal(plan.items.length, 2)
    assert.equal(plan.items[0].sourceTimes.length, 60)
    assert.equal(plan.items[1].sourceTimes.length, 60)
  })
})

