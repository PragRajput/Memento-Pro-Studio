import { describe, it } from 'node:test'
import assert from 'node:assert'
import {
  audioItemEnd,
  clampAudioStart,
  createAudioItem,
  findAudioPlacement,
  nextAudioStart,
  splitAudioAt,
  trimAudioItem,
} from '../src/audioTimeline.ts'

describe('Multi-track audio timeline logic', () => {
  it('allows items to overlap across different tracks at 0:00', () => {
    const itemTrack0 = createAudioItem('clipA', 0, 10, 0, 0)
    const itemTrack1 = createAudioItem('clipB', 0, 10, 0, 1)
    const items = [itemTrack0, itemTrack1]

    // Placing a new 5s clip on track 0: start is blocked, so it should place after itemTrack0 (at 10s)
    const placeTrack0 = findAudioPlacement(items, 0, 5, 0)
    assert.ok(placeTrack0)
    assert.strictEqual(placeTrack0.start, 10)
    assert.strictEqual(placeTrack0.trackIndex, 0)

    // Placing a new 5s clip on track 2: track 2 is completely empty, so it should place at 0s
    const placeTrack2 = findAudioPlacement(items, 0, 5, 2)
    assert.ok(placeTrack2)
    assert.strictEqual(placeTrack2.start, 0)
    assert.strictEqual(placeTrack2.trackIndex, 2)
  })

  it('clampAudioStart prevents collision within the same track but allows overlap with another track', () => {
    const item0 = createAudioItem('clipA', 0, 10, 0, 0)
    const item1 = createAudioItem('clipB', 0, 5, 0, 1) // On Track 1 at 0-5s
    const items = [item0, item1]

    // Dragging item1 on Track 1 to desiredStart 2s: no other items on Track 1, so desired 2s is allowed!
    const clampedTrack1 = clampAudioStart(items, item1.id, 2, 5, 30, 1)
    assert.strictEqual(clampedTrack1, 2)

    // A second item on Track 0 at 12-20s
    const item0B = createAudioItem('clipC', 0, 8, 12, 0)
    const itemsTrack0 = [item0, item0B]

    // Dragging item0B towards 5s: item0 occupies 0-10s on Track 0, so item0B must clamp to 10s
    const clampedTrack0 = clampAudioStart(itemsTrack0, item0B.id, 5, 8, 30, 0)
    assert.strictEqual(clampedTrack0, 10)
  })

  it('trimAudioItem respects neighbors only on the same track', () => {
    const itemTrack0A = createAudioItem('clipA', 0, 10, 0, 0)
    const itemTrack0B = createAudioItem('clipB', 0, 10, 12, 0)
    const itemTrack1 = createAudioItem('clipC', 0, 20, 5, 1) // Crosses Track 0's items on Track 1
    const items = [itemTrack0A, itemTrack0B, itemTrack1]

    // Trimming itemTrack0A's out edge towards 15s should clamp at 12s (next item on Track 0)
    const trimmed = trimAudioItem(items, itemTrack0A.id, 'out', 15, 20, 30)
    const updatedA = trimmed.find((i) => i.id === itemTrack0A.id)
    assert.ok(updatedA)
    assert.strictEqual(audioItemEnd(updatedA), 12)

    // itemTrack1 on Track 1 is untouched and extends freely
    const checkTrack1 = trimmed.find((i) => i.id === itemTrack1.id)
    assert.ok(checkTrack1)
    assert.strictEqual(checkTrack1.start, 5)
    assert.strictEqual(audioItemEnd(checkTrack1), 25)
  })

  it('splitAudioAt preserves the trackIndex on both halves', () => {
    const item = createAudioItem('clipA', 0, 10, 2, 3)
    item.volume = 0.75
    const split = splitAudioAt([item], 5, item.id)
    assert.ok(split)
    assert.strictEqual(split.items.length, 2)
    assert.strictEqual(split.items[0].trackIndex, 3)
    assert.strictEqual(split.items[1].trackIndex, 3)
    assert.strictEqual(split.items[0].volume, 0.75)
    assert.strictEqual(split.items[1].volume, 0.75)
  })

  it('nextAudioStart is scoped to specific track', () => {
    const item0 = createAudioItem('clipA', 0, 10, 0, 0)
    const item1 = createAudioItem('clipB', 0, 4, 0, 1)
    const items = [item0, item1]

    assert.strictEqual(nextAudioStart(items, 0), 10)
    assert.strictEqual(nextAudioStart(items, 1), 4)
    assert.strictEqual(nextAudioStart(items, 2), 0)
  })
})

