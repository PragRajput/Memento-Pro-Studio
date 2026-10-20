import { describe, it } from 'node:test'
import assert from 'node:assert'
import {
  cleanTransitions,
  createTransition,
  edgeFadeAt,
  getEffectiveTransitionDuration,
  locateTransition,
  maxTransitionDuration,
  applyTransitionEasing,
  transitionEasingFor,
  transitionLayerAlpha,
  fadesOutgoingClip,
  transitionVeilAt,
  wipeDirection,
  wipeEdge,
} from '../src/transitionTimeline.ts'
import type { TimelineItem, Transition, TransitionType } from '../src/types.ts'

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

describe('Transition layer opacity', () => {
  const ALL_TYPES: TransitionType[] = [
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
  ]

  it('fully retires the outgoing clip on every type that fades it', () => {
    // The regression this guards: zoom-in faded the outgoing clip to 0.6 and
    // stopped, so it stayed visible wherever the incoming clip did not cover
    // the frame — which is any time the two clips are framed differently.
    for (const type of ALL_TYPES) {
      if (!fadesOutgoingClip(type)) continue
      assert.equal(transitionLayerAlpha(type, 1).a, 0, `${type} must take clip A to zero`)
    }
  })

  it('brings the incoming clip to full on every type', () => {
    for (const type of ALL_TYPES) {
      assert.equal(transitionLayerAlpha(type, 1).b, 1, `${type} must land clip B at full`)
    }
  })

  it('starts with the outgoing clip visible and the incoming one not yet shown', () => {
    for (const type of ALL_TYPES) {
      const start = transitionLayerAlpha(type, 0)
      assert.equal(start.a, 1, `${type} must open on clip A`)
      if (fadesOutgoingClip(type) || type === 'crossfade') {
        assert.equal(start.b, 0, `${type} must not show clip B at the start`)
      }
    }
  })

  it('keeps both clips opaque for the types that reveal by geometry', () => {
    for (const type of ['wipe-left', 'slide-right', 'iris-circle'] as const) {
      assert.deepEqual(transitionLayerAlpha(type, 0.5), { a: 1, b: 1 }, type)
    }
  })

  it('never produces an opacity outside 0..1, at any progress', () => {
    for (const type of ALL_TYPES) {
      for (let step = 0; step <= 20; step++) {
        const { a, b } = transitionLayerAlpha(type, step / 20)
        assert.ok(a >= 0 && a <= 1, `${type} alpha A out of range: ${a}`)
        assert.ok(b >= 0 && b <= 1, `${type} alpha B out of range: ${b}`)
      }
    }
  })

  it('clamps progress supplied outside the window', () => {
    assert.deepEqual(transitionLayerAlpha('zoom-in', -1), transitionLayerAlpha('zoom-in', 0))
    assert.deepEqual(transitionLayerAlpha('zoom-in', 5), transitionLayerAlpha('zoom-in', 1))
  })
})

describe('Edge fades and transition alignment', () => {
  const itemA: TimelineItem = { id: 'item-1', clipId: 'clip-1', inPoint: 0, outPoint: 10, muted: false }
  const itemB: TimelineItem = { id: 'item-2', clipId: 'clip-2', inPoint: 0, outPoint: 10, muted: false }
  const items = [itemA, itemB]

  it('respects transition alignment relative to cut point', () => {
    // Cut between itemA (0..10) and itemB (10..20) is at T=10s. Duration is 1.0s.
    const tCenter = { ...createTransition('item-1', 'item-2', 'crossfade', 1.0), transitionAlign: 'center' as const }
    const tStart = { ...createTransition('item-1', 'item-2', 'crossfade', 1.0), transitionAlign: 'start' as const }
    const tEnd = { ...createTransition('item-1', 'item-2', 'crossfade', 1.0), transitionAlign: 'end' as const }

    // 'center': window is [9.5, 10.5]
    assert.strictEqual(locateTransition(items, [tCenter], 9.4), null)
    assert.strictEqual(locateTransition(items, [tCenter], 9.5)?.progress, 0)
    assert.strictEqual(locateTransition(items, [tCenter], 10.0)?.progress, 0.5)
    assert.strictEqual(locateTransition(items, [tCenter], 10.5)?.progress, 1)
    assert.strictEqual(locateTransition(items, [tCenter], 10.6), null)

    // 'start': window starts at cut [10.0, 11.0]
    assert.strictEqual(locateTransition(items, [tStart], 9.9), null)
    assert.strictEqual(locateTransition(items, [tStart], 10.0)?.progress, 0)
    assert.strictEqual(locateTransition(items, [tStart], 10.5)?.progress, 0.5)
    assert.strictEqual(locateTransition(items, [tStart], 11.0)?.progress, 1)
    assert.strictEqual(locateTransition(items, [tStart], 11.1), null)

    // 'end': window ends at cut [9.0, 10.0]
    assert.strictEqual(locateTransition(items, [tEnd], 8.9), null)
    assert.strictEqual(locateTransition(items, [tEnd], 9.0)?.progress, 0)
    assert.strictEqual(locateTransition(items, [tEnd], 9.5)?.progress, 0.5)
    assert.strictEqual(locateTransition(items, [tEnd], 10.0)?.progress, 1)
    assert.strictEqual(locateTransition(items, [tEnd], 10.1), null)
  })

  it('calculates edge fades correctly for in, out, and idle intervals', () => {
    const edgeFades = {
      in: { edge: 'in' as const, duration: 2.0, color: '#000000', easing: 'linear' as const },
      out: { edge: 'out' as const, duration: 1.0, color: '#ffffff', easing: 'linear' as const },
    }
    const totalDuration = 10.0

    // Fade in: [0, 2.0]
    const at0 = edgeFadeAt(edgeFades, 0, totalDuration)
    assert.ok(at0)
    assert.strictEqual(at0.color, '#000000')
    assert.strictEqual(at0.opacity, 1)

    const at1 = edgeFadeAt(edgeFades, 1.0, totalDuration)
    assert.ok(at1)
    assert.strictEqual(at1.opacity, 0.5)

    const at2 = edgeFadeAt(edgeFades, 2.0, totalDuration)
    assert.strictEqual(at2, null)

    // Middle (idle): no fade active
    assert.strictEqual(edgeFadeAt(edgeFades, 5.0, totalDuration), null)

    // Fade out: [9.0, 10.0]
    const at9 = edgeFadeAt(edgeFades, 9.0, totalDuration)
    assert.strictEqual(at9, null) // time > startOut (9.0), so at exactly 9.0 it hasn't started yet

    const at95 = edgeFadeAt(edgeFades, 9.5, totalDuration)
    assert.ok(at95)
    assert.strictEqual(at95.color, '#ffffff')
    assert.strictEqual(at95.opacity, 0.5)

    const at10 = edgeFadeAt(edgeFades, 10.0, totalDuration)
    assert.ok(at10)
    assert.strictEqual(at10.opacity, 1)

    // Beyond timeline duration (time > 10.0)
    const at11 = edgeFadeAt(edgeFades, 11.0, totalDuration)
    assert.ok(at11) // clamp gives 1
    assert.strictEqual(at11.opacity, 1)
  })
})

describe('Transition veil (dip and flash)', () => {
  const dip = (over: Partial<Transition> = {}): Transition => ({
    id: 't', fromItemId: 'a', toItemId: 'b', type: 'fade-black', duration: 1, ...over,
  })

  it('only the dip and flash types wash the frame', () => {
    assert.equal(transitionVeilAt(dip(), 0.5)?.color, '#000000')
    assert.equal(transitionVeilAt(dip({ type: 'fade-white' }), 0.5)?.color, '#ffffff')
    assert.equal(transitionVeilAt(dip({ type: 'crossfade' }), 0.5), null)
    assert.equal(transitionVeilAt(dip({ type: 'wipe-left' }), 0.5), null)
  })

  it('peaks at the midpoint and is clear at both ends', () => {
    assert.equal(transitionVeilAt(dip(), 0)!.alpha, 0)
    assert.equal(transitionVeilAt(dip(), 0.5)!.alpha, 1)
    assert.equal(transitionVeilAt(dip(), 1)!.alpha, 0)
  })

  it('honours a custom veil colour', () => {
    // The regression this guards: the exporter read this field and the preview
    // did not, so a coloured dip looked black on screen and tinted in the file.
    assert.equal(transitionVeilAt(dip({ transitionVeilColor: '#ff0000' }), 0.5)!.color, '#ff0000')
    assert.equal(
      transitionVeilAt(dip({ type: 'fade-white', transitionVeilColor: '#00ff00' }), 0.5)!.color,
      '#00ff00',
    )
  })

  it('scales the wash with strength', () => {
    assert.equal(transitionVeilAt(dip({ transitionStrength: 0.5 }), 0.5)!.alpha, 0.5)
    assert.equal(transitionVeilAt(dip({ transitionStrength: 0 }), 0.5)!.alpha, 0)
  })

  it('never exceeds full opacity', () => {
    assert.equal(transitionVeilAt(dip({ transitionStrength: 5 }), 0.5)!.alpha, 1)
  })
})

describe('Wipe edges', () => {
  it('identifies the four wipe directions and nothing else', () => {
    assert.equal(wipeDirection('wipe-left'), 'left')
    assert.equal(wipeDirection('wipe-right'), 'right')
    assert.equal(wipeDirection('wipe-up'), 'up')
    assert.equal(wipeDirection('wipe-down'), 'down')
    assert.equal(wipeDirection('crossfade'), null)
    assert.equal(wipeDirection('zoom-in'), null)
  })

  it('collapses to a hard edge with no softness', () => {
    const edge = wipeEdge(0.5, 0)
    assert.equal(edge.solid, 0.5)
    assert.equal(edge.clear, 0.5)
  })

  it('spreads the feather either side of the wipe position', () => {
    // The regression this guards: softness feathered the preview's mask but the
    // exporter always clipped a hard rectangle.
    const edge = wipeEdge(0.5, 0.5)
    assert.ok(edge.solid < 0.5 && edge.clear > 0.5)
    assert.ok(Math.abs((0.5 - edge.solid) - (edge.clear - 0.5)) < 1e-9, 'feather must be symmetric')
  })

  it('keeps the edge inside the frame at either extreme', () => {
    for (const softness of [0, 0.5, 1]) {
      for (const p of [0, 0.5, 1]) {
        const edge = wipeEdge(p, softness)
        assert.ok(edge.solid >= 0 && edge.solid <= 1, `solid ${edge.solid}`)
        assert.ok(edge.clear >= 0 && edge.clear <= 1, `clear ${edge.clear}`)
        assert.ok(edge.solid <= edge.clear, 'solid must not pass clear')
      }
    }
  })

  it('advances the edge as the wipe progresses', () => {
    assert.ok(wipeEdge(0.8, 0.2).solid > wipeEdge(0.2, 0.2).solid)
  })
})
