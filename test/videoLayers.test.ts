import { describe, it } from 'node:test'
import assert from 'node:assert'
import {
  activeLayersAt,
  clampLayerStart,
  createVideoLayerItem,
  findLayerPlacement,
  layerAccepts,
  layerSourceTime,
  removeVideoLayer,
  splitLayerAt,
  trimLayerItem,
  videoLayerEnd,
  videoLayerName,
  videoLayersDuration,
} from '../src/videoLayers.ts'
import { setKeyframe } from '../src/keyframes.ts'
import type { VideoLayerItem } from '../src/types.ts'

function layer(
  id: string,
  start: number,
  length: number,
  trackIndex = 0,
  extra: Partial<VideoLayerItem> = {},
): VideoLayerItem {
  return {
    id,
    clipId: `clip-${id}`,
    inPoint: 0,
    outPoint: length,
    start,
    trackIndex,
    muted: true,
    ...extra,
  }
}

describe('Video layer naming and spans', () => {
  it('names layers from V2 upward', () => {
    assert.strictEqual(videoLayerName(0), 'V2')
    assert.strictEqual(videoLayerName(2), 'V4')
  })

  it('measures an item end through its speed', () => {
    assert.strictEqual(videoLayerEnd(layer('a', 2, 4)), 6)
    assert.strictEqual(videoLayerEnd(layer('a', 0, 4, 0, { speed: 2 })), 2)
  })

  it('reports the furthest end as the duration', () => {
    assert.strictEqual(videoLayersDuration([layer('a', 0, 3), layer('b', 10, 2, 1)]), 12)
    assert.strictEqual(videoLayersDuration([]), 0)
  })

  it('maps a timeline time onto source time, scaled by speed', () => {
    assert.strictEqual(layerSourceTime(layer('a', 2, 10), 5), 3)
    assert.strictEqual(layerSourceTime(layer('a', 0, 10, 0, { speed: 2 }), 2), 4)
  })

  it('never reads past the end of the source', () => {
    assert.strictEqual(layerSourceTime(layer('a', 0, 4), 99), 4)
  })
})

describe('Video layer stacking', () => {
  it('returns only layers covering the time, lowest track first', () => {
    const items = [layer('top', 0, 10, 2), layer('bottom', 0, 10, 0), layer('later', 50, 5, 1)]
    assert.deepStrictEqual(
      activeLayersAt(items, 5).map((item) => item.id),
      ['bottom', 'top'],
    )
  })

  it('treats the end of an item as outside it', () => {
    assert.strictEqual(activeLayersAt([layer('a', 0, 4)], 4).length, 0)
  })
})

describe('Video layer placement', () => {
  it('drops a clip at the requested time when the layer is free', () => {
    const placed = findLayerPlacement([], 3, 5, 0)
    assert.deepStrictEqual(placed, { start: 3, length: 5, trackIndex: 0 })
  })

  it('shortens a clip to fit the gap before the next item', () => {
    const placed = findLayerPlacement([layer('a', 6, 4)], 4, 5, 0)
    assert.strictEqual(placed?.start, 4)
    assert.strictEqual(placed?.length, 2)
  })

  it('ignores items on other layers', () => {
    const placed = findLayerPlacement([layer('a', 0, 10, 1)], 2, 3, 0)
    assert.deepStrictEqual(placed, { start: 2, length: 3, trackIndex: 0 })
  })

  it('slides a dragged item to the nearest free spot', () => {
    const items = [layer('fixed', 0, 5), layer('moving', 5, 2)]
    assert.strictEqual(clampLayerStart(items, 'moving', 2, 2, 0), 5)
  })

  it('lets an item drop where it already is', () => {
    const items = [layer('a', 0, 4), layer('b', 10, 4)]
    assert.strictEqual(clampLayerStart(items, 'b', 6, 4, 0), 6)
  })

  it('accepts a span only on a layer where nothing overlaps', () => {
    const items = [layer('a', 0, 5, 1)]
    assert.strictEqual(layerAccepts(items, 'x', 2, 2, 1), false)
    assert.strictEqual(layerAccepts(items, 'x', 5, 2, 1), true)
    assert.strictEqual(layerAccepts(items, 'x', 2, 2, 0), true)
  })
})

describe('Video layer trimming and splitting', () => {
  it('trims the out edge without moving the item', () => {
    const [trimmed] = trimLayerItem([layer('a', 2, 10)], 'a', 'out', 6, 10)
    assert.strictEqual(trimmed.start, 2)
    assert.strictEqual(trimmed.outPoint, 6)
  })

  it('trims the in edge and moves the item so the out edge stays put', () => {
    const [trimmed] = trimLayerItem([layer('a', 2, 10)], 'a', 'in', 3, 10)
    assert.strictEqual(trimmed.inPoint, 3)
    assert.strictEqual(trimmed.start, 5)
    assert.strictEqual(videoLayerEnd(trimmed), 12)
  })

  it('stops a trim from running into the neighbour on its layer', () => {
    const items = [layer('a', 0, 5), layer('b', 5, 5)]
    const [trimmed] = trimLayerItem(items, 'a', 'out', 10, 10)
    assert.strictEqual(videoLayerEnd(trimmed), 5)
  })

  it('splits an item in two at the playhead', () => {
    const result = splitLayerAt([layer('a', 0, 10)], 4)
    assert.strictEqual(result?.items.length, 2)
    const right = result?.items.find((item) => item.id === result.rightId)
    assert.strictEqual(right?.start, 4)
    assert.strictEqual(right?.inPoint, 4)
  })

  it('refuses a split that would leave a sliver', () => {
    assert.strictEqual(splitLayerAt([layer('a', 0, 10)], 0.01), null)
    assert.strictEqual(splitLayerAt([layer('a', 0, 10)], 50), null)
  })

  it('divides keyframes between the two halves of a split', () => {
    const keyed = layer('a', 0, 10, 0, {
      keyframes: setKeyframe(setKeyframe(undefined, 'opacity', 1, 0), 'opacity', 7, 1),
    })
    const result = splitLayerAt([keyed], 4)
    const left = result?.items.find((item) => item.id === 'a')
    const right = result?.items.find((item) => item.id === result.rightId)
    assert.deepStrictEqual(left?.keyframes?.opacity?.map((f) => f.time), [1])
    assert.deepStrictEqual(right?.keyframes?.opacity?.map((f) => f.time), [3])
  })

  it('shifts keyframes with the media when the in edge is trimmed', () => {
    const keyed = layer('a', 0, 10, 0, { keyframes: setKeyframe(undefined, 'scale', 5, 2) })
    const [trimmed] = trimLayerItem([keyed], 'a', 'in', 3, 10)
    assert.deepStrictEqual(trimmed.keyframes?.scale?.map((f) => f.time), [2])
  })
})

describe('Removing a video layer', () => {
  it('drops that layer and pulls the ones above it down', () => {
    const items = [layer('a', 0, 2, 0), layer('b', 0, 2, 1), layer('c', 0, 2, 2)]
    const next = removeVideoLayer(items, 1)
    assert.deepStrictEqual(
      next.map((item) => [item.id, item.trackIndex]),
      [
        ['a', 0],
        ['c', 1],
      ],
    )
  })
})

describe('Creating a layer item', () => {
  it('starts muted so it does not double up the base track audio', () => {
    assert.strictEqual(createVideoLayerItem('clip', 0, 5, 1, 2).muted, true)
    assert.strictEqual(createVideoLayerItem('clip', 0, 5, 1, 2).trackIndex, 2)
  })
})
