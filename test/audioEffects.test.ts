import { describe, it } from 'node:test'
import assert from 'node:assert'
import { AUDIO_EFFECT_PRESETS } from '../src/audioEffects.ts'
import type { AudioEffectType } from '../src/types.ts'

describe('Audio effects presets and configuration', () => {
  it('defines all required audio effect presets with unique IDs', () => {
    const ids = AUDIO_EFFECT_PRESETS.map((p) => p.id)
    const uniqueIds = new Set(ids)
    assert.strictEqual(ids.length, uniqueIds.size)
    assert.ok(uniqueIds.has('none'))
    assert.ok(uniqueIds.has('bass-boost'))
    assert.ok(uniqueIds.has('treble-boost'))
    assert.ok(uniqueIds.has('vocal-enhance'))
    assert.ok(uniqueIds.has('underwater'))
    assert.ok(uniqueIds.has('telephone'))
    assert.ok(uniqueIds.has('lo-fi'))
    assert.ok(uniqueIds.has('concert-hall'))
    assert.ok(uniqueIds.has('robot'))
  })

  it('ensures each preset has non-empty metadata (name, description, category)', () => {
    for (const preset of AUDIO_EFFECT_PRESETS) {
      assert.ok(preset.name.length > 0)
      assert.ok(preset.description.length > 0)
      assert.ok(['eq', 'creative', 'spatial'].includes(preset.category))
    }
  })

  it('validates preset ID compatibility with AudioEffectType union', () => {
    const validEffectTypes: AudioEffectType[] = [
      'none',
      'bass-boost',
      'treble-boost',
      'vocal-enhance',
      'underwater',
      'telephone',
      'lo-fi',
      'concert-hall',
      'robot',
    ]

    for (const type of validEffectTypes) {
      const found = AUDIO_EFFECT_PRESETS.find((p) => p.id === type)
      assert.ok(found !== undefined, `Preset definition missing for ${type}`)
    }
  })
})
