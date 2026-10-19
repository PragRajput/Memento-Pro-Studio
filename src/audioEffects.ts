import type { AudioEffectType } from './types.ts'

export interface AudioEffectPreset {
  id: AudioEffectType
  name: string
  description: string
  icon: string
  category: 'eq' | 'creative' | 'spatial'
}

export const AUDIO_EFFECT_PRESETS: readonly AudioEffectPreset[] = [
  {
    id: 'none',
    name: 'Normal',
    description: 'Clean original audio without processing',
    icon: '✨',
    category: 'eq',
  },
  {
    id: 'bass-boost',
    name: 'Bass Boost',
    description: 'Deep punchy low-end for music beats & kicks',
    icon: '🔊',
    category: 'eq',
  },
  {
    id: 'treble-boost',
    name: 'Treble Clarity',
    description: 'Crisp bright highs and presence for instruments',
    icon: '💎',
    category: 'eq',
  },
  {
    id: 'vocal-enhance',
    name: 'Vocal Enhance',
    description: 'Cleans dialogue, cuts rumble, boosts voice clarity',
    icon: '🎙️',
    category: 'eq',
  },
  {
    id: 'underwater',
    name: 'Underwater',
    description: 'Muffled low-pass filter (club bathroom effect)',
    icon: '🌊',
    category: 'creative',
  },
  {
    id: 'telephone',
    name: 'Vintage Radio',
    description: 'Narrow bandpass walkie-talkie / 1950s AM speaker',
    icon: '📻',
    category: 'creative',
  },
  {
    id: 'lo-fi',
    name: 'Lo-Fi Chill',
    description: 'Soft high-cut with warm saturated vintage tone',
    icon: '☕',
    category: 'creative',
  },
  {
    id: 'concert-hall',
    name: 'Concert Hall',
    description: 'Expansive spatial echo and reverberant depth',
    icon: '🏛️',
    category: 'spatial',
  },
  {
    id: 'robot',
    name: 'Sci-Fi Synth',
    description: 'Resonant metallic futuristic modulation',
    icon: '🤖',
    category: 'creative',
  },
]

/**
 * Connects Web Audio effect nodes between source and destination.
 * Works seamlessly in both live AudioContext and export OfflineAudioContext.
 */
export function applyAudioEffectNodes(
  ctx: BaseAudioContext,
  source: AudioNode,
  destination: AudioNode,
  effect: AudioEffectType | undefined,
  intensity = 1,
): AudioNode[] {
  const safeIntensity = Math.max(0, Math.min(1, intensity))

  if (!effect || effect === 'none' || safeIntensity <= 0) {
    source.connect(destination)
    return []
  }

  const nodes: AudioNode[] = []

  switch (effect) {
    case 'bass-boost': {
      const lowShelf = ctx.createBiquadFilter()
      lowShelf.type = 'lowshelf'
      lowShelf.frequency.value = 130
      lowShelf.gain.value = 11 * safeIntensity
      source.connect(lowShelf)
      lowShelf.connect(destination)
      nodes.push(lowShelf)
      break
    }

    case 'treble-boost': {
      const highShelf = ctx.createBiquadFilter()
      highShelf.type = 'highshelf'
      highShelf.frequency.value = 4200
      highShelf.gain.value = 9 * safeIntensity
      source.connect(highShelf)
      highShelf.connect(destination)
      nodes.push(highShelf)
      break
    }

    case 'vocal-enhance': {
      // 1. Highpass to remove microphone handling and sub-bass rumble
      const highpass = ctx.createBiquadFilter()
      highpass.type = 'highpass'
      highpass.frequency.value = 100 * safeIntensity

      // 2. Presence boost around 2.6 kHz for speech intelligibility
      const presence = ctx.createBiquadFilter()
      presence.type = 'peaking'
      presence.frequency.value = 2600
      presence.Q.value = 1.6
      presence.gain.value = 6 * safeIntensity

      // 3. Gentle high-shelf dip around 8 kHz to tame harsh sibilance ('s' sounds)
      const deEss = ctx.createBiquadFilter()
      deEss.type = 'highshelf'
      deEss.frequency.value = 8000
      deEss.gain.value = -3.5 * safeIntensity

      source.connect(highpass)
      highpass.connect(presence)
      presence.connect(deEss)
      deEss.connect(destination)
      nodes.push(highpass, presence, deEss)
      break
    }

    case 'underwater': {
      // Steep lowpass filter creating the muffled, submerged sensation
      const lowpass = ctx.createBiquadFilter()
      lowpass.type = 'lowpass'
      // 20kHz down to 450Hz based on intensity
      lowpass.frequency.value = 20000 - (20000 - 450) * safeIntensity
      lowpass.Q.value = 1.3
      source.connect(lowpass)
      lowpass.connect(destination)
      nodes.push(lowpass)
      break
    }

    case 'telephone': {
      // Bandpass filter isolating mid-range phone/radio frequencies (400Hz - 3.5kHz)
      const bandpass = ctx.createBiquadFilter()
      bandpass.type = 'bandpass'
      bandpass.frequency.value = 1500
      bandpass.Q.value = 1.6 * safeIntensity + 0.6

      const makeupGain = ctx.createGain()
      makeupGain.gain.value = 1.5

      source.connect(bandpass)
      bandpass.connect(makeupGain)
      makeupGain.connect(destination)
      nodes.push(bandpass, makeupGain)
      break
    }

    case 'lo-fi': {
      // Soft high-cut lowpass filter + warm low-shelf boost
      const lowpass = ctx.createBiquadFilter()
      lowpass.type = 'lowpass'
      lowpass.frequency.value = 20000 - (20000 - 2800) * safeIntensity

      const warmBass = ctx.createBiquadFilter()
      warmBass.type = 'lowshelf'
      warmBass.frequency.value = 200
      warmBass.gain.value = 5 * safeIntensity

      source.connect(lowpass)
      lowpass.connect(warmBass)
      warmBass.connect(destination)
      nodes.push(lowpass, warmBass)
      break
    }

    case 'concert-hall': {
      // Synthetic impulse response reverb for expansive acoustic space
      try {
        const convolver = ctx.createConvolver()
        convolver.buffer = createImpulseResponse(ctx, 1.8, 2.4)

        const dryGain = ctx.createGain()
        dryGain.gain.value = 1 - 0.4 * safeIntensity

        const wetGain = ctx.createGain()
        wetGain.gain.value = 0.55 * safeIntensity

        source.connect(dryGain)
        dryGain.connect(destination)

        source.connect(convolver)
        convolver.connect(wetGain)
        wetGain.connect(destination)

        nodes.push(convolver, dryGain, wetGain)
      } catch {
        // Fallback to direct pass if convolver fails
        source.connect(destination)
      }
      break
    }

    case 'robot': {
      // High-Q harmonic resonant filters producing robotic metallic timbre
      const peak1 = ctx.createBiquadFilter()
      peak1.type = 'peaking'
      peak1.frequency.value = 440
      peak1.Q.value = 7 * safeIntensity + 1
      peak1.gain.value = 13 * safeIntensity

      const peak2 = ctx.createBiquadFilter()
      peak2.type = 'peaking'
      peak2.frequency.value = 880
      peak2.Q.value = 7 * safeIntensity + 1
      peak2.gain.value = 11 * safeIntensity

      source.connect(peak1)
      peak1.connect(peak2)
      peak2.connect(destination)
      nodes.push(peak1, peak2)
      break
    }

    default:
      source.connect(destination)
      break
  }

  return nodes
}

/**
 * Synthesizes an acoustic room impulse response buffer for the ConvolverNode.
 */
function createImpulseResponse(ctx: BaseAudioContext, duration: number, decay: number): AudioBuffer {
  const sampleRate = ctx.sampleRate
  const length = Math.floor(sampleRate * duration)
  const impulse = ctx.createBuffer(2, length, sampleRate)
  const left = impulse.getChannelData(0)
  const right = impulse.getChannelData(1)

  for (let i = 0; i < length; i++) {
    const envelope = Math.pow(1 - i / length, decay)
    left[i] = (Math.random() * 2 - 1) * envelope
    right[i] = (Math.random() * 2 - 1) * envelope
  }

  return impulse
}

/**
 * Applies an audio effect to an AudioBuffer offline, returning the processed buffer.
 */
export async function processAudioBufferWithEffect(
  buffer: AudioBuffer,
  effect: AudioEffectType | undefined,
  intensity = 1,
): Promise<AudioBuffer> {
  if (!effect || effect === 'none' || intensity <= 0) return buffer

  try {
    const offlineCtx = new OfflineAudioContext(
      buffer.numberOfChannels,
      buffer.length,
      buffer.sampleRate,
    )
    const source = offlineCtx.createBufferSource()
    source.buffer = buffer

    applyAudioEffectNodes(offlineCtx, source, offlineCtx.destination, effect, intensity)
    source.start(0)

    return await offlineCtx.startRendering()
  } catch (err) {
    console.warn('Offline audio effect processing failed, returning dry buffer:', err)
    return buffer
  }
}
