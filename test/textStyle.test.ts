import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { TITLE_PRESETS, textAnimationAt } from '../src/textStyle.ts'
import type { TextOverlay } from '../src/types.ts'

describe('Title presets and text animations', () => {
  it('defines the complete set of title presets with unique IDs', () => {
    assert.equal(TITLE_PRESETS.length, 8)
    const expectedIds = [
      'bold-caption',
      'subtitle',
      'neon',
      'impact',
      'elegant',
      'highlight',
      'sticker',
      'lower-third-minimal',
    ]
    const ids = TITLE_PRESETS.map((p) => p.id)
    assert.deepEqual(ids, expectedIds)
    for (const preset of TITLE_PRESETS) {
      assert.ok(preset.name.length > 0, `${preset.id} requires a name`)
      assert.ok(preset.description.length > 0, `${preset.id} requires a description`)
      assert.ok(preset.styles.fontSize && preset.styles.fontSize > 0, `${preset.id} requires positive font size`)
      assert.ok(preset.styles.fontFamily, `${preset.id} requires font family`)
    }
  })

  const baseText: TextOverlay = {
    id: 't1',
    text: 'Hello World',
    position: 'center',
    fontSize: 48,
    color: '#ffffff',
    start: 2.0,
    duration: 4.0,
  }

  it('evaluates neutral animation state during normal playback', () => {
    const state = textAnimationAt(baseText, 4.0)
    assert.equal(state.opacity, 1)
    assert.equal(state.offsetY, 0)
    assert.equal(state.scale, 1)
    assert.equal(state.visibleChars, undefined)
  })

  it('evaluates zero opacity outside text overlay window', () => {
    assert.equal(textAnimationAt(baseText, 1.0).opacity, 0)
    assert.equal(textAnimationAt(baseText, 7.0).opacity, 0)
  })

  it('animates fade entrance and exit', () => {
    const item: TextOverlay = {
      ...baseText,
      textAnimIn: 'fade',
      textAnimInDuration: 1.0,
      textAnimOut: 'fade',
      textAnimOutDuration: 1.0,
    }
    // Entrance [2.0, 3.0]
    assert.equal(textAnimationAt(item, 2.0).opacity, 0)
    assert.ok(textAnimationAt(item, 2.5).opacity > 0 && textAnimationAt(item, 2.5).opacity < 1)
    assert.equal(textAnimationAt(item, 3.0).opacity, 1)

    // Midpoint [3.0, 5.0]
    assert.equal(textAnimationAt(item, 4.0).opacity, 1)

    // Exit [5.0, 6.0]
    assert.equal(textAnimationAt(item, 5.0).opacity, 1)
    assert.ok(textAnimationAt(item, 5.5).opacity > 0 && textAnimationAt(item, 5.5).opacity < 1)
    assert.equal(textAnimationAt(item, 6.0).opacity, 0)
  })

  it('animates typewriter glyph reveal', () => {
    const item: TextOverlay = {
      ...baseText,
      text: 'ANTIGRAVITY', // 11 characters
      textAnimIn: 'typewriter',
      textAnimInDuration: 1.0,
    }
    assert.equal(textAnimationAt(item, 2.0).visibleChars, 0)
    const midChars = textAnimationAt(item, 2.5).visibleChars
    assert.ok(typeof midChars === 'number' && midChars > 0 && midChars < 11)
    assert.equal(textAnimationAt(item, 2.99).visibleChars, 11)
    assert.equal(textAnimationAt(item, 3.0).visibleChars, undefined)
  })

  it('animates pop scale entrance', () => {
    const item: TextOverlay = {
      ...baseText,
      textAnimIn: 'pop',
      textAnimInDuration: 1.0,
    }
    assert.equal(textAnimationAt(item, 2.0).scale, 0.7)
    assert.ok(textAnimationAt(item, 2.5).scale > 0.7 && textAnimationAt(item, 2.5).scale < 1.0)
    assert.equal(textAnimationAt(item, 3.0).scale, 1.0)
  })

  it('animates slide-up entrance with vertical offset', () => {
    const item: TextOverlay = {
      ...baseText,
      textAnimIn: 'slide-up',
      textAnimInDuration: 1.0,
    }
    assert.equal(textAnimationAt(item, 2.0).offsetY, 0.4)
    assert.ok(textAnimationAt(item, 2.5).offsetY > 0 && textAnimationAt(item, 2.5).offsetY < 0.4)
    assert.equal(textAnimationAt(item, 3.0).offsetY, 0)
  })
})
