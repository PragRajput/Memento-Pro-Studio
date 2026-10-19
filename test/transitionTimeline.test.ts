import { describe, it } from 'node:test'
import assert from 'node:assert'
import {
  cleanTransitions,
  createTransition,
  getEffectiveTransitionDuration,
  locateTransition,
  maxTransitionDuration,
} from '../src/transitionTimeline.ts'
import type { TimelineItem } from '../src/types.ts'

describe('Transition timeline logic', () => {
  const itemA: TimelineItem = { id: 'item-1', clipId: 'clip-1', inPoint: 0, outPoint: 10, muted: false }
  const itemB: TimelineItem = { id: 'item-2', clipId: 'clip-2', inPoint: 0, outPoint: 10, muted: false }
  const itemC: TimelineItem = { id: 'item-3', clipId: 'clip-3', inPoint: 0, outPoint: 10, muted: false }
  const items = [itemA, itemB, itemC]

  it('creates a transition with default values and bounds duration', () => {
    const t = createTransition('item-1', 'item-2')
    assert.strictEqual(t.fromItemId, 'item-1')
    assert.strictEqual(t.toItemId, 'item-2')
    assert.strictEqual(t.type, 'crossfade')
    assert.strictEqual(t.duration, 0.8)

    const shortItem: TimelineItem = { id: 's', clipId: 'c', inPoint: 0, outPoint: 0.5, muted: false }
    assert.strictEqual(maxTransitionDuration(shortItem, itemB), 0.5)
    assert.strictEqual(getEffectiveTransitionDuration(t, shortItem, itemB), 0.5)
  })

  it('locates an active transition window around cut time', () => {
    // Cut between itemA (0..10) and itemB (10..20) is at T=10s.
    // Transition duration is 1.0s, so window is [9.5s, 10.5s].
    const transition = createTransition('item-1', 'item-2', 'crossfade', 1.0)
    const transitions = [transition]

    // Before window
    assert.strictEqual(locateTransition(items, transitions, 9.0), null)

    // Window start (9.5s)
    const atStart = locateTransition(items, transitions, 9.5)
    assert.ok(atStart)
    assert.strictEqual(atStart.progress, 0)
    assert.strictEqual(atStart.indexA, 0)
    assert.strictEqual(atStart.indexB, 1)

    // Midpoint (10.0s)
    const atMid = locateTransition(items, transitions, 10.0)
    assert.ok(atMid)
    assert.strictEqual(atMid.progress, 0.5)

    // Window end (10.5s)
    const atEnd = locateTransition(items, transitions, 10.5)
    assert.ok(atEnd)
    assert.strictEqual(atEnd.progress, 1)

    // After window
    assert.strictEqual(locateTransition(items, transitions, 11.0), null)
  })

  it('cleanTransitions drops transitions when items are no longer adjacent', () => {
    const t1 = createTransition('item-1', 'item-2')
    const t2 = createTransition('item-2', 'item-3')
    const tBroken = createTransition('item-1', 'item-3') // not adjacent!
    const transitions = [t1, t2, tBroken]

    const cleaned = cleanTransitions(items, transitions)
    assert.strictEqual(cleaned.length, 2)
    assert.ok(cleaned.some((t) => t.fromItemId === 'item-1' && t.toItemId === 'item-2'))
    assert.ok(cleaned.some((t) => t.fromItemId === 'item-2' && t.toItemId === 'item-3'))

    // In reversed [itemB, itemA, itemC], itemA ('item-1') and itemC ('item-3') become adjacent,
    // while item-1 -> item-2 and item-2 -> item-3 are no longer adjacent.
    const reversed = [itemB, itemA, itemC]
    const cleanedReversed = cleanTransitions(reversed, transitions)
    assert.strictEqual(cleanedReversed.length, 1)
    assert.strictEqual(cleanedReversed[0].fromItemId, 'item-1')
    assert.strictEqual(cleanedReversed[0].toItemId, 'item-3')
  })

  it('supports all 13 modern transition types', () => {
    const allTypes = [
      'crossfade',
      'fade-black',
      'fade-white',
      'wipe-left',
      'wipe-right',
      'wipe-up',
      'wipe-down',
      'slide-left',
      'slide-right',
      'zoom-in',
      'zoom-out',
      'iris-circle',
      'blur-dissolve',
    ] as const

    assert.strictEqual(allTypes.length, 13)
    for (const type of allTypes) {
      const t = createTransition('item-1', 'item-2', type, 1.2)
      assert.strictEqual(t.type, type)
      assert.strictEqual(t.duration, 1.2)
    }
  })
})
