import { describe, it } from 'node:test'
import assert from 'node:assert'
import {
  applyEasing,
  applyFade,
  readFade,
  clearTrack,
  evaluateTrack,
  evaluateTracks,
  hasKeyframes,
  keyframeTimes,
  removeKeyframe,
  setKeyframe,
  sliceTracks,
  updateKeyframe,
} from '../src/keyframes.ts'
import type { Keyframe, KeyframeTracks } from '../src/types.ts'

function frame(time: number, value: number, easing: Keyframe['easing'] = 'linear'): Keyframe {
  return { id: `kf-${time}-${value}`, time, value, easing }
}

describe('Keyframe easing', () => {
  it('pins every curve to 0 and 1 at the ends', () => {
    for (const easing of ['linear', 'ease-in', 'ease-out', 'ease-in-out'] as const) {
      assert.strictEqual(applyEasing(easing, 0), 0, easing)
      assert.strictEqual(applyEasing(easing, 1), 1, easing)
    }
  })

  it('clamps input outside 0..1', () => {
    assert.strictEqual(applyEasing('linear', -5), 0)
    assert.strictEqual(applyEasing('linear', 5), 1)
  })

  it('eases in slower than linear and out faster', () => {
    assert.ok(applyEasing('ease-in', 0.5) < 0.5)
    assert.ok(applyEasing('ease-out', 0.5) > 0.5)
  })

  it('holds at the left value for the whole segment', () => {
    assert.strictEqual(applyEasing('hold', 0.99), 0)
  })
})

describe('Keyframe evaluation', () => {
  it('falls back to the static value with no keyframes', () => {
    assert.strictEqual(evaluateTrack(undefined, 1, 0.42), 0.42)
    assert.strictEqual(evaluateTrack([], 1, 0.42), 0.42)
  })

  it('uses the single keyframe everywhere when only one exists', () => {
    const frames = [frame(2, 0.5)]
    assert.strictEqual(evaluateTrack(frames, 0, 1), 0.5)
    assert.strictEqual(evaluateTrack(frames, 99, 1), 0.5)
  })

  it('interpolates linearly between two keyframes', () => {
    const frames = [frame(0, 0), frame(2, 1)]
    assert.strictEqual(evaluateTrack(frames, 0, 0), 0)
    assert.strictEqual(evaluateTrack(frames, 1, 0), 0.5)
    assert.strictEqual(evaluateTrack(frames, 2, 0), 1)
  })

  it('holds the nearest keyframe outside the keyed range', () => {
    const frames = [frame(1, 0.2), frame(3, 0.9)]
    assert.strictEqual(evaluateTrack(frames, 0, 0), 0.2)
    assert.strictEqual(evaluateTrack(frames, 10, 0), 0.9)
  })

  it('reads keyframes stored out of order', () => {
    const frames = [frame(2, 1), frame(0, 0)]
    assert.strictEqual(evaluateTrack(frames, 1, 0), 0.5)
  })

  it('steps rather than ramps across a hold keyframe', () => {
    const frames = [frame(0, 0, 'hold'), frame(2, 1)]
    assert.strictEqual(evaluateTrack(frames, 1.9, 0), 0)
    assert.strictEqual(evaluateTrack(frames, 2, 0), 1)
  })

  it('walks a multi-segment track', () => {
    const frames = [frame(0, 0), frame(1, 1), frame(2, 0)]
    assert.strictEqual(evaluateTrack(frames, 0.5, 0), 0.5)
    assert.strictEqual(evaluateTrack(frames, 1.5, 0), 0.5)
  })

  it('resolves statics and keyframes together', () => {
    const tracks: KeyframeTracks = { opacity: [frame(0, 0), frame(2, 1)] }
    const values = evaluateTracks(tracks, { scale: 2 }, 1)
    assert.strictEqual(values.opacity, 0.5, 'keyed property animates')
    assert.strictEqual(values.scale, 2, 'static property is kept')
    assert.strictEqual(values.rotate, 0, 'unset property uses its default')
  })
})

describe('Keyframe editing', () => {
  it('adds a keyframe and keeps the track sorted', () => {
    let tracks = setKeyframe(undefined, 'opacity', 2, 1)
    tracks = setKeyframe(tracks, 'opacity', 0, 0)
    assert.deepStrictEqual(tracks.opacity?.map((f) => f.time), [0, 2])
  })

  it('overwrites the keyframe already at that time instead of stacking', () => {
    let tracks = setKeyframe(undefined, 'scale', 1, 1)
    tracks = setKeyframe(tracks, 'scale', 1, 2)
    assert.strictEqual(tracks.scale?.length, 1)
    assert.strictEqual(tracks.scale?.[0].value, 2)
  })

  it('removes a keyframe and drops the track once it is empty', () => {
    const tracks = setKeyframe(undefined, 'posX', 0, 10)
    const id = tracks.posX![0].id
    assert.strictEqual(removeKeyframe(tracks, 'posX', id).posX, undefined)
  })

  it('re-sorts after a keyframe is moved in time', () => {
    let tracks = setKeyframe(undefined, 'rotate', 0, 0)
    tracks = setKeyframe(tracks, 'rotate', 1, 90)
    const firstId = tracks.rotate![0].id
    const moved = updateKeyframe(tracks, 'rotate', firstId, { time: 5 })
    assert.deepStrictEqual(moved.rotate?.map((f) => f.time), [1, 5])
  })

  it('never lets a keyframe sit before the item starts', () => {
    const tracks = setKeyframe(undefined, 'posY', 1, 0)
    const id = tracks.posY![0].id
    assert.strictEqual(updateKeyframe(tracks, 'posY', id, { time: -3 }).posY?.[0].time, 0)
  })

  it('reports and clears animated properties', () => {
    const tracks = setKeyframe(undefined, 'opacity', 0, 1)
    assert.strictEqual(hasKeyframes(tracks), true)
    assert.strictEqual(hasKeyframes(clearTrack(tracks, 'opacity')), false)
  })

  it('collects marker times across every property without duplicates', () => {
    let tracks = setKeyframe(undefined, 'opacity', 1, 0)
    tracks = setKeyframe(tracks, 'scale', 1, 2)
    tracks = setKeyframe(tracks, 'posX', 3, 5)
    assert.deepStrictEqual(keyframeTimes(tracks), [1, 3])
  })
})

describe('Keyframes through trims and splits', () => {
  it('shifts keyframes back and drops those trimmed away', () => {
    const tracks: KeyframeTracks = { opacity: [frame(0, 0), frame(2, 1), frame(4, 0)] }
    const sliced = sliceTracks(tracks, 2, 2)
    assert.deepStrictEqual(sliced?.opacity?.map((f) => f.time), [0, 2])
    assert.deepStrictEqual(sliced?.opacity?.map((f) => f.value), [1, 0])
  })

  it('returns undefined when nothing survives the slice', () => {
    const tracks: KeyframeTracks = { opacity: [frame(0, 0), frame(1, 1)] }
    assert.strictEqual(sliceTracks(tracks, 5, 2), undefined)
  })

  it('keeps the left half of a split intact', () => {
    const tracks: KeyframeTracks = { scale: [frame(0, 1), frame(3, 2)] }
    assert.deepStrictEqual(sliceTracks(tracks, 0, 3)?.scale?.map((f) => f.time), [0, 3])
  })
})

describe('Clip fades as opacity keyframes', () => {
  it('fades up from nothing over the requested time', () => {
    const tracks = applyFade(undefined, 10, 2, 0)!
    assert.deepStrictEqual(tracks.opacity?.map((f) => [f.time, f.value]), [[0, 0], [2, 1]])
  })

  it('fades down to nothing at the very end', () => {
    const tracks = applyFade(undefined, 10, 0, 3)!
    assert.deepStrictEqual(tracks.opacity?.map((f) => [f.time, f.value]), [[7, 1], [10, 0]])
  })

  it('combines both fades without them meeting', () => {
    const tracks = applyFade(undefined, 10, 2, 2)!
    assert.deepStrictEqual(
      tracks.opacity?.map((f) => [f.time, f.value]),
      [[0, 0], [2, 1], [8, 1], [10, 0]],
    )
  })

  it('caps each fade at half the clip so they cannot overlap', () => {
    const tracks = applyFade(undefined, 4, 10, 10)!
    const times = tracks.opacity!.map((f) => f.time)
    assert.deepStrictEqual(times, [0, 2, 2, 4])
    assert.ok(times.every((t) => t <= 4))
  })

  it('clears the fade when both lengths are zero', () => {
    const existing = applyFade(undefined, 10, 2, 2)
    assert.strictEqual(applyFade(existing, 10, 0, 0), undefined)
  })

  it('ignores a fade too short to be seen', () => {
    assert.strictEqual(applyFade(undefined, 10, 0.01, 0), undefined)
  })

  it('leaves other animated properties alone', () => {
    const withScale = setKeyframe(undefined, 'scale', 1, 2)
    const faded = applyFade(withScale, 10, 1, 0)!
    assert.ok(faded.scale !== undefined, 'scale must survive')
    assert.ok(faded.opacity !== undefined)
    // Removing the fade must not take the scale track with it.
    assert.ok(applyFade(faded, 10, 0, 0)?.scale !== undefined)
  })

  it('reads back the fades it wrote', () => {
    const tracks = applyFade(undefined, 10, 1.5, 2.5)
    assert.deepStrictEqual(readFade(tracks, 10), { fadeIn: 1.5, fadeOut: 2.5 })
  })

  it('reports no fade for a clip that is not faded', () => {
    assert.deepStrictEqual(readFade(undefined, 10), { fadeIn: 0, fadeOut: 0 })
    assert.deepStrictEqual(readFade(setKeyframe(undefined, 'scale', 0, 2), 10), { fadeIn: 0, fadeOut: 0 })
  })

  it('survives a split, because it is ordinary keyframe data', () => {
    const tracks = applyFade(undefined, 10, 2, 2)
    const right = sliceTracks(tracks, 5, 5)
    assert.ok(right?.opacity !== undefined, 'the tail keeps its fade down')
    assert.deepStrictEqual(right.opacity?.map((f) => f.time), [3, 5])
  })
})
