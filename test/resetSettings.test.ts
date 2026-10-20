import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  resetAudioItem,
  resetOverlayItem,
  resetTextOverlay,
  resetTimelineItem,
  resetTransition,
  resetVideoLayerItem,
} from '../src/resetSettings.ts'
import { setKeyframe } from '../src/keyframes.ts'
import type {
  AudioTimelineItem,
  OverlayItem,
  TextOverlay,
  TimelineItem,
  Transition,
  VideoLayerItem,
} from '../src/types.ts'

describe('Resetting a base-track clip', () => {
  const item: TimelineItem = {
    id: 'i1',
    clipId: 'c1',
    inPoint: 2,
    outPoint: 8,
    muted: true,
    filter: 'noir',
    filterIntensity: 0.4,
    speed: 2,
    rotation: 90,
    flipH: true,
    flipV: true,
    fitMode: 'cover',
    filterExposure: 40,
    filterTemperature: -30,
    posX: 12,
    scale: 1.6,
    opacity: 0.3,
    keyframes: setKeyframe(undefined, 'opacity', 1, 0),
  }

  it('keeps which clip it is and where it was trimmed', () => {
    const reset = resetTimelineItem(item)
    assert.equal(reset.id, 'i1')
    assert.equal(reset.clipId, 'c1')
    assert.equal(reset.inPoint, 2)
    assert.equal(reset.outPoint, 8)
  })

  it('clears grading, transform, speed and framing', () => {
    const reset = resetTimelineItem(item)
    assert.equal(reset.filter, undefined)
    assert.equal(reset.speed, undefined)
    assert.equal(reset.rotation, undefined)
    assert.equal(reset.flipH, undefined)
    assert.equal(reset.fitMode, undefined)
    assert.equal(reset.filterExposure, undefined)
    assert.equal(reset.filterTemperature, undefined)
    assert.equal(reset.scale, undefined)
    assert.equal(reset.keyframes, undefined)
    assert.equal(reset.muted, false)
  })
})

describe('Resetting a video layer clip', () => {
  const item: VideoLayerItem = {
    id: 'l1',
    clipId: 'c2',
    inPoint: 1,
    outPoint: 5,
    start: 9,
    trackIndex: 2,
    muted: false,
    volume: 0.2,
    blendMode: 'screen',
    filter: 'cyberpunk',
    scale: 3,
    keyframes: setKeyframe(undefined, 'posX', 0, 40),
  }

  it('stays on the same layer at the same position', () => {
    const reset = resetVideoLayerItem(item)
    assert.equal(reset.start, 9)
    assert.equal(reset.trackIndex, 2)
    assert.equal(reset.inPoint, 1)
    assert.equal(reset.outPoint, 5)
  })

  it('clears compositing and animation, and goes back to muted', () => {
    const reset = resetVideoLayerItem(item)
    assert.equal(reset.blendMode, undefined)
    assert.equal(reset.filter, undefined)
    assert.equal(reset.scale, undefined)
    assert.equal(reset.keyframes, undefined)
    // Layers default to muted so they do not double the base track's audio.
    assert.equal(reset.muted, true)
  })
})

describe('Resetting an audio clip', () => {
  const item: AudioTimelineItem = {
    id: 'a1',
    clipId: 'ac1',
    inPoint: 3,
    outPoint: 20,
    start: 4,
    trackIndex: 1,
    volume: 0.1,
    fadeIn: 2,
    fadeOut: 3,
    effect: 'robot',
    effectIntensity: 0.9,
    speed: 1.5,
    keyframes: setKeyframe(undefined, 'volume', 0, 0),
  }

  it('keeps its lane, position and trim', () => {
    const reset = resetAudioItem(item)
    assert.equal(reset.start, 4)
    assert.equal(reset.trackIndex, 1)
    assert.equal(reset.inPoint, 3)
    assert.equal(reset.outPoint, 20)
  })

  it('returns to full volume with no fades, effect or automation', () => {
    const reset = resetAudioItem(item)
    assert.equal(reset.volume, 1)
    assert.equal(reset.fadeIn, undefined)
    assert.equal(reset.fadeOut, undefined)
    assert.equal(reset.effect, undefined)
    assert.equal(reset.speed, undefined)
    assert.equal(reset.keyframes, undefined)
  })
})

describe('Resetting a title', () => {
  const item: TextOverlay = {
    id: 't1',
    text: 'Keep these words',
    start: 6,
    duration: 3,
    position: 'top',
    size: 'large',
    color: '#ff0000',
    fontSize: 120,
    fontFamily: 'Anton',
    backgroundColor: 'rgba(0,0,0,0.6)',
    textStrokeWidth: 0.1,
    textGlowBlur: 0.4,
    textAnimIn: 'typewriter',
  }

  it('keeps the words and the timing', () => {
    const reset = resetTextOverlay(item)
    assert.equal(reset.text, 'Keep these words')
    assert.equal(reset.start, 6)
    assert.equal(reset.duration, 3)
    assert.equal(reset.id, 't1')
  })

  it('drops every style choice back to the default look', () => {
    const reset = resetTextOverlay(item)
    assert.equal(reset.color, '#ffffff')
    assert.equal(reset.fontSize, 48)
    assert.equal(reset.fontFamily, 'Inter')
    assert.equal(reset.backgroundColor, 'transparent')
    assert.equal(reset.textStrokeWidth, undefined)
    assert.equal(reset.textGlowBlur, undefined)
    assert.equal(reset.textAnimIn, undefined)
  })
})

describe('Resetting an overlay', () => {
  it('rebuilds from the category defaults but keeps id, placement and source', () => {
    const item: OverlayItem = {
      id: 'o1',
      category: 'media',
      clipId: 'c9',
      start: 7,
      duration: 2,
      x: 5,
      y: 5,
      width: 95,
      opacity: 0.1,
      overlayAnimIn: 'wipe-right',
    }
    const reset = resetOverlayItem(item)
    assert.equal(reset.id, 'o1')
    assert.equal(reset.category, 'media')
    assert.equal(reset.clipId, 'c9')
    assert.equal(reset.start, 7)
    assert.equal(reset.duration, 2)
    assert.equal(reset.x, 80, 'back to the default corner')
    assert.equal(reset.opacity, 1)
    assert.equal(reset.overlayAnimIn, undefined)
  })

  it('uses the right defaults for each category', () => {
    const wash = resetOverlayItem({ id: 'o2', category: 'color', start: 0, duration: 4, color: '#000' })
    assert.equal(wash.color, '#f97316')
    assert.equal(wash.blendMode, 'overlay')

    const vfx = resetOverlayItem({ id: 'o3', category: 'vfx', start: 0, duration: 4, vfxType: 'glitch' })
    assert.equal(vfx.vfxType, 'letterbox')
  })
})

describe('Resetting a transition', () => {
  it('goes back to a plain crossfade between the same two clips', () => {
    const transition: Transition = {
      id: 'tr1',
      fromItemId: 'a',
      toItemId: 'b',
      type: 'blur-dissolve',
      duration: 2.5,
      transitionEasing: 'ease-out-back',
      transitionAudioFade: 'dip',
      transitionStrength: 0.2,
    }
    const reset = resetTransition(transition)
    assert.equal(reset.id, 'tr1')
    assert.equal(reset.fromItemId, 'a')
    assert.equal(reset.toItemId, 'b')
    assert.equal(reset.type, 'crossfade')
    assert.equal(reset.duration, 0.8)
    assert.equal(reset.transitionEasing, undefined)
    assert.equal(reset.transitionAudioFade, undefined)
    assert.equal(reset.transitionStrength, undefined)
  })
})
