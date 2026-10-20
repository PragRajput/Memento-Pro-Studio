import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { stepBack, stepForward } from '../src/useHistory.ts'
import type { HistorySnapshot, HistoryStacks } from '../src/useHistory.ts'

/** A snapshot distinguishable by its aspect ratio, which is enough to track identity. */
function snap(tag: string): HistorySnapshot {
  return {
    items: [],
    audioItems: [],
    textItems: [],
    transitions: [],
    aspectRatio: tag as HistorySnapshot['aspectRatio'],
  }
}

const empty: HistoryStacks = { past: [], future: [] }

describe('History transitions', () => {
  it('has nothing to undo or redo when both stacks are empty', () => {
    assert.equal(stepBack(empty, snap('now')), null)
    assert.equal(stepForward(empty, snap('now')), null)
  })

  it('moves exactly one entry onto the redo stack per undo', () => {
    // The regression this guards: these were computed inside a setState
    // updater that also called setFuture, so StrictMode's double invocation
    // pushed two entries and one undo then needed two redos.
    const step = stepBack({ past: [snap('a')], future: [] }, snap('now'))
    assert.equal(step?.future.length, 1)
    assert.equal(step?.past.length, 0)
    assert.equal(step?.snapshot.aspectRatio, 'a')
  })

  it('moves exactly one entry back per redo', () => {
    const step = stepForward({ past: [], future: [snap('b')] }, snap('now'))
    assert.equal(step?.past.length, 1)
    assert.equal(step?.future.length, 0)
    assert.equal(step?.snapshot.aspectRatio, 'b')
  })

  it('returns to the starting state after one undo and one redo', () => {
    const current = snap('now')
    const back = stepBack({ past: [snap('a')], future: [] }, current)!
    const forward = stepForward({ past: back.past, future: back.future }, back.snapshot)!
    assert.equal(forward.snapshot.aspectRatio, 'now', 'redo must restore what undo replaced')
    assert.deepEqual(
      forward.past.map((s) => s.aspectRatio),
      ['a'],
      'and put the undone step back on the past stack',
    )
    assert.equal(forward.future.length, 0)
  })

  it('round-trips a run of edits without drift', () => {
    const current = snap('now')
    let stacks: HistoryStacks = { past: [snap('a'), snap('b'), snap('c')], future: [] }
    let applied = current

    for (let i = 0; i < 3; i++) {
      const step = stepBack(stacks, applied)!
      stacks = { past: step.past, future: step.future }
      applied = step.snapshot
    }
    assert.equal(stacks.past.length, 0)
    assert.equal(stacks.future.length, 3, 'three undos must leave exactly three redos')

    for (let i = 0; i < 3; i++) {
      const step = stepForward(stacks, applied)!
      stacks = { past: step.past, future: step.future }
      applied = step.snapshot
    }
    assert.equal(stacks.future.length, 0)
    assert.equal(stacks.past.length, 3)
    assert.equal(applied.aspectRatio, 'now', 'back where we started')
  })

  it('preserves undo order, most recent first', () => {
    const stacks: HistoryStacks = { past: [snap('old'), snap('recent')], future: [] }
    const step = stepBack(stacks, snap('now'))!
    assert.equal(step.snapshot.aspectRatio, 'recent')
    assert.deepEqual(step.past.map((s) => s.aspectRatio), ['old'])
  })

  it('does not mutate the stacks it is given', () => {
    const past = [snap('a')]
    const future = [snap('b')]
    stepBack({ past, future }, snap('now'))
    stepForward({ past, future }, snap('now'))
    assert.equal(past.length, 1)
    assert.equal(future.length, 1)
  })
})
