import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  LOWER_THIRD_PRESETS,
  VFX_OVERLAY_PRESETS,
  activeOverlaysAt,
  createDefaultOverlay,
  isNeutralOverlayAnimation,
  overlayAnimationAt,
  pipSourceTime,
  sortOverlaysForPaint,
} from '../src/overlayDraw.ts'
import type { OverlayItem } from '../src/types.ts'

describe('Overlay System', () => {
  it('creates default media overlay with appropriate defaults', () => {
    const item = createDefaultOverlay('media', 2.5, 4, 'clip-123')
    assert.equal(item.category, 'media')
    assert.equal(item.start, 2.5)
    assert.equal(item.duration, 4)
    assert.equal(item.clipId, 'clip-123')
    assert.equal(item.width, 28)
    assert.equal(item.x, 80)
    assert.equal(item.y, 20)
    assert.equal(item.opacity, 1)
    assert.equal(item.borderRadius, 8)
    assert.equal(item.borderWidth, 2)
    assert.equal(item.blendMode, 'normal')
  })

  it('creates default vfx overlay with cinematic letterbox preset', () => {
    const item = createDefaultOverlay('vfx', 0, 5)
    assert.equal(item.category, 'vfx')
    assert.equal(item.start, 0)
    assert.equal(item.vfxType, 'letterbox')
    assert.equal(item.intensity, 0.85)
    assert.equal(item.duration, 5)
  })

  it('creates default lower-third overlay with speaker placeholders and broadcast styling', () => {
    const item = createDefaultOverlay('lower-third', 4)
    assert.equal(item.category, 'lower-third')
    assert.equal(item.start, 4)
    assert.equal(item.lowerThirdStyle, 'broadcast')
    assert.equal(item.title, 'Speaker Name')
    assert.equal(item.subtitle, 'Host / Content Creator')
    assert.equal(item.accentColor, '#3b82f6')
    assert.equal(item.x, 10)
    assert.equal(item.y, 84)
  })

  it('creates default color tint overlay with gradient wash values', () => {
    const item = createDefaultOverlay('color', 1.0)
    assert.equal(item.category, 'color')
    assert.equal(item.start, 1.0)
    assert.equal(item.color, '#f97316')
    assert.equal(item.colorSecondary, '#a855f7')
    assert.equal(item.blendMode, 'overlay')
    assert.equal(item.opacity, 0.25)
  })

  it('provides all expected VFX presets with icons and descriptions', () => {
    const ids = VFX_OVERLAY_PRESETS.map((p) => p.id)
    assert.ok(ids.includes('letterbox'))
    assert.ok(ids.includes('vignette'))
    assert.ok(ids.includes('film-grain'))
    assert.ok(ids.includes('light-leak'))
    assert.ok(ids.includes('glitch'))
    assert.ok(ids.includes('scanlines'))
    assert.ok(ids.includes('bokeh'))

    for (const preset of VFX_OVERLAY_PRESETS) {
      assert.ok(preset.name.length > 0)
      assert.ok(preset.icon.length > 0)
      assert.ok(preset.description.length > 0)
    }
  })

  it('provides all expected Lower Third style presets', () => {
    const ids = LOWER_THIRD_PRESETS.map((p) => p.id)
    assert.ok(ids.includes('broadcast'))
    assert.ok(ids.includes('minimal'))
    assert.ok(ids.includes('social'))
    assert.ok(ids.includes('breaking-news'))

    for (const preset of LOWER_THIRD_PRESETS) {
      assert.ok(preset.name.length > 0)
      assert.ok(preset.icon.length > 0)
    }
  })
})


function overlay(
  id: string,
  category: OverlayItem['category'],
  extra: Partial<OverlayItem> = {},
): OverlayItem {
  return { id, category, start: 0, duration: 10, ...extra }
}

describe('Overlay paint order', () => {
  it('stacks washes under VFX, PiP and titling by default', () => {
    // Deliberately supplied in the wrong order: the sort, not the array, decides.
    const items = [
      overlay('lt', 'lower-third'),
      overlay('pip', 'media'),
      overlay('wash', 'color'),
      overlay('vfx', 'vfx'),
    ]
    assert.deepEqual(
      sortOverlaysForPaint(items).map((item) => item.id),
      ['wash', 'vfx', 'pip', 'lt'],
    )
  })

  it('lets an explicit overlayZ override the category default', () => {
    const items = [overlay('lt', 'lower-third'), overlay('wash', 'color', { overlayZ: 9 })]
    assert.deepEqual(
      sortOverlaysForPaint(items).map((item) => item.id),
      ['lt', 'wash'],
    )
  })

  it('keeps array order as the tie-break so the sort is stable', () => {
    const items = [overlay('first', 'vfx'), overlay('second', 'vfx'), overlay('third', 'vfx')]
    assert.deepEqual(
      sortOverlaysForPaint(items).map((item) => item.id),
      ['first', 'second', 'third'],
    )
  })

  it('returns only overlays covering the time, already in paint order', () => {
    const items = [
      overlay('late', 'color', { start: 20, duration: 5 }),
      overlay('lt', 'lower-third'),
      overlay('wash', 'color'),
    ]
    assert.deepEqual(
      activeOverlaysAt(items, 3).map((item) => item.id),
      ['wash', 'lt'],
    )
    assert.deepEqual(activeOverlaysAt(items, 100), [])
  })

  it('treats the end of an overlay as outside it', () => {
    assert.equal(activeOverlaysAt([overlay('a', 'vfx', { start: 0, duration: 4 })], 4).length, 0)
  })
})

describe('Picture-in-picture source time', () => {
  it('starts at the overlay in point and advances with the timeline', () => {
    const item = overlay('pip', 'media', { start: 2, pipInPoint: 5 })
    assert.equal(pipSourceTime(item, 2), 5)
    assert.equal(pipSourceTime(item, 4), 7)
  })

  it('scales with the PiP speed', () => {
    const item = overlay('pip', 'media', { start: 0, pipInPoint: 0, pipSpeed: 2 })
    assert.equal(pipSourceTime(item, 3), 6)
  })

  it('never reads before the start of the source', () => {
    const item = overlay('pip', 'media', { start: 5 })
    assert.equal(pipSourceTime(item, 0), 0)
  })

  it('defaults to the top of the clip at normal speed', () => {
    assert.equal(pipSourceTime(overlay('pip', 'media', { start: 0 }), 3), 3)
  })
})

describe('Overlay entrance and exit', () => {
  const base = { start: 2, duration: 10 } as const

  it('stays neutral when no animation is set', () => {
    const state = overlayAnimationAt(overlay('a', 'vfx', base), 5)
    assert.equal(isNeutralOverlayAnimation(state), true)
  })

  it('fades in from nothing and reaches full opacity', () => {
    const item = overlay('a', 'color', { ...base, overlayAnimIn: 'fade', overlayAnimInDuration: 1 })
    assert.equal(overlayAnimationAt(item, 2).opacity, 0)
    assert.equal(overlayAnimationAt(item, 3).opacity, 1)
    assert.ok(overlayAnimationAt(item, 2.5).opacity > 0)
    assert.ok(overlayAnimationAt(item, 2.5).opacity < 1)
  })

  it('fades out to nothing at the very end', () => {
    const item = overlay('a', 'color', { ...base, overlayAnimOut: 'fade', overlayAnimOutDuration: 1 })
    assert.equal(overlayAnimationAt(item, 12).opacity, 0)
    assert.ok(overlayAnimationAt(item, 11.5).opacity < 1)
    assert.equal(overlayAnimationAt(item, 10).opacity, 1, 'untouched before the exit begins')
  })

  it('slides in from off-frame and settles at zero offset', () => {
    const item = overlay('a', 'media', { ...base, overlayAnimIn: 'slide-left', overlayAnimInDuration: 1 })
    assert.ok(overlayAnimationAt(item, 2).offsetX > 0)
    assert.equal(overlayAnimationAt(item, 3).offsetX, 0)
  })

  it('pops in from a smaller scale', () => {
    const item = overlay('a', 'lower-third', { ...base, overlayAnimIn: 'scale-pop', overlayAnimInDuration: 1 })
    assert.ok(overlayAnimationAt(item, 2).scale < 1)
    assert.equal(overlayAnimationAt(item, 3).scale, 1)
  })

  it('wipes open from nothing to fully revealed', () => {
    const item = overlay('a', 'vfx', { ...base, overlayAnimIn: 'wipe-right', overlayAnimInDuration: 1 })
    assert.equal(overlayAnimationAt(item, 2).reveal, 0)
    assert.equal(overlayAnimationAt(item, 3).reveal, 1)
  })

  it('clamps an animation to half the overlay so entrance and exit cannot overlap', () => {
    // A 1s overlay asking for a 10s entrance gets 0.5s.
    const item = overlay('a', 'color', {
      start: 0,
      duration: 1,
      overlayAnimIn: 'fade',
      overlayAnimInDuration: 10,
    })
    assert.equal(overlayAnimationAt(item, 0.5).opacity, 1, 'entrance must finish by the midpoint')
  })

  it('is neutral for a zero-length overlay rather than dividing by zero', () => {
    const item = overlay('a', 'color', { start: 0, duration: 0, overlayAnimIn: 'fade' })
    assert.equal(isNeutralOverlayAnimation(overlayAnimationAt(item, 0)), true)
  })
})
