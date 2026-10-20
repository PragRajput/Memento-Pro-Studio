import { useEffect, useRef } from 'react'
import { getClipTransform, getCssFilter } from '../filters.ts'
import { evaluateTransform, evaluateVolume, transformToCss } from '../transform.ts'
import { activeLayersAt, layerSourceTime } from '../videoLayers.ts'
import type { MediaClip, VideoLayerItem } from '../types.ts'

/** Drift past which the element is re-seeked; looser while playing to avoid stutter. */
const SEEK_TOLERANCE_PLAYING = 0.3
const SEEK_TOLERANCE_PAUSED = 0.05

function layerStyle(layer: VideoLayerItem, time: number): React.CSSProperties {
  const animated = evaluateTransform(layer, time - layer.start)
  const orientation = getClipTransform(layer)
  const motion = transformToCss(animated)
  const transform = motion && orientation !== 'none' ? `${motion} ${orientation}` : motion || orientation

  return {
    position: 'absolute',
    inset: 0,
    width: '100%',
    height: '100%',
    objectFit: layer.fitMode ?? 'contain',
    opacity: Math.max(0, Math.min(1, animated.opacity)),
    transform: transform === 'none' ? undefined : transform,
    filter: getCssFilter(layer.filter, layer.filterIntensity) || undefined,
    mixBlendMode: layer.blendMode && layer.blendMode !== 'normal' ? layer.blendMode : undefined,
    pointerEvents: 'none',
  }
}

function LayerVideo({
  layer,
  clip,
  time,
  playing,
}: {
  layer: VideoLayerItem
  clip: MediaClip
  time: number
  playing: boolean
}) {
  const ref = useRef<HTMLVideoElement>(null)

  useEffect(() => {
    const el = ref.current
    if (el === null) return
    const target = layerSourceTime(layer, time)
    const tolerance = playing ? SEEK_TOLERANCE_PLAYING : SEEK_TOLERANCE_PAUSED
    if (Math.abs(el.currentTime - target) > tolerance) el.currentTime = target
  }, [layer, time, playing])

  useEffect(() => {
    const el = ref.current
    if (el === null) return
    el.playbackRate = layer.speed ?? 1
    el.muted = layer.muted
    el.volume = layer.muted ? 0 : evaluateVolume(layer.keyframes, layer.volume ?? 1, time - layer.start)
  }, [layer, time])

  useEffect(() => {
    const el = ref.current
    if (el === null) return
    if (playing) {
      void el.play().catch(() => {})
    } else {
      el.pause()
    }
  }, [playing])

  return <video ref={ref} src={clip.url} playsInline style={layerStyle(layer, time)} />
}

/**
 * Video layers above the base track, composited in track order so V2 sits under
 * V3. Mirrors what the canvas exporter draws for the same frame.
 */
export function VideoLayerStage({
  videoLayers,
  clips,
  time,
  playing,
  selectedLayerItemId,
}: {
  videoLayers: readonly VideoLayerItem[]
  clips: ReadonlyMap<string, MediaClip>
  time: number
  playing: boolean
  selectedLayerItemId?: string | null
}) {
  // A selected layer stays visible while it is being set up, even off its span.
  const selected = videoLayers.find((layer) => layer.id === selectedLayerItemId)
  const active = activeLayersAt(videoLayers, time)
  const visible =
    selected !== undefined && !active.some((layer) => layer.id === selected.id)
      ? [...active, selected]
      : active

  return (
    <>
      {visible.map((layer) => {
        const clip = clips.get(layer.clipId)
        if (clip === undefined) return null
        const key = `${layer.id}-${layer.clipId}`
        return clip.mediaType === 'image' ? (
          <img key={key} src={clip.url} alt="" style={layerStyle(layer, time)} />
        ) : (
          <LayerVideo key={key} layer={layer} clip={clip} time={time} playing={playing} />
        )
      })}
    </>
  )
}
