import { describe, it } from 'node:test'
import assert from 'node:assert'
import {
  cleanTransitions,
  createTransition,
  getEffectiveTransitionDuration,
  locateTransition,
  maxTransitionDuration,
  applyTransitionEasing,
  transitionEasingFor,
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

describe('Transition handles', () => {
  // A and B are each 10s long, trimmed out of a 30s source, so both have
  // plenty of unused material either side of their trim points.
  const itemA: TimelineItem = { id: 'a', clipId: 'ca', inPoint: 5, outPoint: 15, muted: false }
  const itemB: TimelineItem = { id: 'b', clipId: 'cb', inPoint: 5, outPoint: 15, muted: false }
  const items = [itemA, itemB]
  const transitions = [
    { id: 't', fromItemId: 'a', toItemId: 'b', type: 'crossfade' as const, duration: 0.8 },
  ]
  const clips = new Map([
    ['ca', { duration: 30 }],
    ['cb', { duration: 30 }],
  ])

  it('keeps clip A rolling past its out point instead of freezing', () => {
    // Cut is at 10s; the window runs 9.6 to 10.4.
    const atStart = locateTransition(items, transitions, 9.6, clips)!
    const atEnd = locateTransition(items, transitions, 10.4, clips)!
    assert.ok(
      atEnd.sourceTimeA > atStart.sourceTimeA + 0.7,
      `A must advance through the window, got ${atStart.sourceTimeA} -> ${atEnd.sourceTimeA}`,
    )
    assert.ok(atEnd.sourceTimeA > itemA.outPoint, 'A should read into its tail handle')
  })

  it('starts clip B before its in point instead of freezing', () => {
    const atStart = locateTransition(items, transitions, 9.6, clips)!
    const atEnd = locateTransition(items, transitions, 10.4, clips)!
    assert.ok(
      atEnd.sourceTimeB > atStart.sourceTimeB + 0.7,
      `B must advance through the window, got ${atStart.sourceTimeB} -> ${atEnd.sourceTimeB}`,
    )
    assert.ok(atStart.sourceTimeB < itemB.inPoint, 'B should read into its head handle')
  })

  it('advances both clips at every step across the window', () => {
    let previousA = -Infinity
    let previousB = -Infinity
    const steps = 16
    for (let step = 0; step <= steps; step++) {
      const time = 9.6 + (0.8 * step) / steps
      const active = locateTransition(items, transitions, time, clips)
      assert.ok(active !== null, `no transition at ${time.toFixed(3)}`)
      assert.ok(active.sourceTimeA > previousA, `A stalled at ${time.toFixed(3)}`)
      assert.ok(active.sourceTimeB > previousB, `B stalled at ${time.toFixed(3)}`)
      previousA = active.sourceTimeA
      previousB = active.sourceTimeB
    }
  })

  it('reports no shortfall when both clips have handles', () => {
    assert.equal(locateTransition(items, transitions, 10, clips)!.handleShortfall, 0)
  })

  it('never reads outside the source, and reports the shortfall when handles run out', () => {
    // B starts at source 0 and A ends exactly at the end of its source, so
    // neither has anything to give.
    const tightA: TimelineItem = { id: 'a', clipId: 'ca', inPoint: 0, outPoint: 10, muted: false }
    const tightB: TimelineItem = { id: 'b', clipId: 'cb', inPoint: 0, outPoint: 10, muted: false }
    const tight = new Map([
      ['ca', { duration: 10 }],
      ['cb', { duration: 10 }],
    ])
    const active = locateTransition([tightA, tightB], transitions, 10.4, tight)!
    assert.ok(active.sourceTimeA <= 10, 'must not seek past the end of the source')
    assert.ok(active.sourceTimeB >= 0, 'must not seek before the start of the source')
    assert.ok(active.handleShortfall > 0, 'should report that media ran out')
  })

  it('falls back to the old unclamped behaviour when clip lengths are unknown', () => {
    const active = locateTransition(items, transitions, 10.4)!
    assert.ok(Number.isFinite(active.sourceTimeA))
    assert.ok(active.sourceTimeA > itemA.outPoint)
  })
})

describe('Transition easing', () => {
  it('pins every curve to both ends', () => {
    for (const easing of ['linear', 'ease-in', 'ease-out', 'ease-in-out', 'smoothstep', 'ease-out-back'] as const) {
      assert.ok(Math.abs(applyTransitionEasing(easing, 0)) < 1e-9, easing)
      assert.ok(Math.abs(applyTransitionEasing(easing, 1) - 1) < 1e-9, easing)
    }
  })

  it('shapes the midpoint away from linear', () => {
    assert.equal(applyTransitionEasing('linear', 0.5), 0.5)
    assert.ok(applyTransitionEasing('ease-in', 0.5) < 0.5)
    assert.ok(applyTransitionEasing('ease-out', 0.5) > 0.5)
    assert.equal(applyTransitionEasing('smoothstep', 0.5), 0.5)
  })

  it('gives each type a sensible default curve, overridable per transition', () => {
    assert.equal(transitionEasingFor({ id: 't', fromItemId: 'a', toItemId: 'b', type: 'crossfade', duration: 1 }), 'smoothstep')
    assert.equal(transitionEasingFor({ id: 't', fromItemId: 'a', toItemId: 'b', type: 'slide-left', duration: 1 }), 'ease-out')
    assert.equal(
      transitionEasingFor({ id: 't', fromItemId: 'a', toItemId: 'b', type: 'crossfade', duration: 1, transitionEasing: 'linear' }),
      'linear',
    )
  })

  it('exposes an eased progress alongside the raw one', () => {
    const items = [
      { id: 'a', clipId: 'ca', inPoint: 0, outPoint: 10, muted: false },
      { id: 'b', clipId: 'cb', inPoint: 0, outPoint: 10, muted: false },
    ]
    const transitions = [{ id: 't', fromItemId: 'a', toItemId: 'b', type: 'ease' as never, duration: 0.8 }]
    const linear = locateTransition(items, [{ ...transitions[0], type: 'crossfade', transitionEasing: 'linear' }], 10)!
    assert.equal(linear.easedProgress, linear.progress)
  })
})
