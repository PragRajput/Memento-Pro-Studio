import { useEffect, useRef, useState } from 'react'
import type { RefObject } from 'react'
import type { MediaSelection } from './MediaBin.tsx'
import { AudioInspector } from './AudioInspector.tsx'
import { ClipInspector } from './ClipInspector.tsx'
import { OverlayInspector } from './OverlayInspector.tsx'
import { TextInspector } from './TextInspector.tsx'
import { TransitionInspector } from './TransitionInspector.tsx'
import { VIGNETTE, vignetteAlpha } from '../filters.ts'
import {
  VFX_OVERLAY_PRESETS,
  grainTileHeightFraction,
  grainTileUrl,
  isNeutralOverlayAnimation,
  overlayAnimationAt,
  pipSourceTime,
  sortOverlaysForPaint,
} from '../overlayDraw.ts'
import { blockLeft, blockTop, resolveTextStyle, textAnimationAt } from '../textStyle.ts'
import { edgeFadeAt } from '../transitionTimeline.ts'
import { locate } from '../timeline.ts'
import { VideoLayerStage } from './VideoLayerStage.tsx'
import { VideoLayerInspector } from './VideoLayerInspector.tsx'
import type { AnimatableProperty, AspectRatio, AudioClip, AudioTimelineItem, EasingType, EdgeFades, MediaClip, OverlayItem, TextOverlay, TimelineItem, Transition, VideoLayerItem } from '../types.ts'

function PipVideo({
  src,
  playing,
  timelineTime,
  overlay,
}: {
  src: string
  playing?: boolean
  timelineTime: number
  overlay: OverlayItem
}) {
  const videoRef = useRef<HTMLVideoElement>(null)

  useEffect(() => {
    const el = videoRef.current
    if (!el) return
    const target = pipSourceTime(overlay, timelineTime)
    // Tighter while paused so scrubbing lands on the right frame; looser during
    // playback so a small drift does not cause a visible re-seek every frame.
    if (Math.abs(el.currentTime - target) > (playing ? 0.3 : 0.05)) {
      el.currentTime = target
    }
  }, [overlay, timelineTime, playing])

  useEffect(() => {
    const el = videoRef.current
    if (!el) return
    el.playbackRate = overlay.pipSpeed ?? 1
    const volume = overlay.pipVolume ?? 0
    el.muted = volume <= 0
    el.volume = Math.max(0, Math.min(1, volume))
  }, [overlay])

  useEffect(() => {
    const el = videoRef.current
    if (!el) return
    if (playing) {
      void el.play().catch(() => {})
    } else {
      el.pause()
    }
  }, [playing])

  return (
    <video
      ref={videoRef}
      src={src}
      playsInline
      style={{ width: '100%', height: 'auto', display: 'block', pointerEvents: 'none' }}
    />
  )
}

/**
 * The entrance or exit styling for an overlay at this instant, from the same
 * state the exporter uses. Percentage offsets resolve against the element,
 * which fills the stage, so they match the canvas renderer's frame fractions.
 *
 * Composes with what the element already sets rather than replacing it: opacity
 * multiplies, and the animation's transform is appended to any base transform.
 */
function overlayAnimationStyle(
  overlay: OverlayItem,
  time: number,
  base: { transform?: string; opacity?: number } = {},
): React.CSSProperties {
  const animation = overlayAnimationAt(overlay, time)
  const baseOpacity = base.opacity ?? 1
  if (isNeutralOverlayAnimation(animation)) {
    return {
      opacity: baseOpacity,
      ...(base.transform === undefined ? null : { transform: base.transform }),
    }
  }

  const transforms: string[] = base.transform === undefined ? [] : [base.transform]
  if (animation.offsetX !== 0 || animation.offsetY !== 0) {
    transforms.push(`translate(${animation.offsetX * 100}%, ${animation.offsetY * 100}%)`)
  }
  if (animation.scale !== 1) transforms.push(`scale(${animation.scale})`)

  return {
    opacity: baseOpacity * animation.opacity,
    ...(transforms.length > 0 ? { transform: transforms.join(' ') } : null),
    ...(animation.reveal < 1
      ? { clipPath: `inset(0 ${(1 - animation.reveal) * 100}% 0 0)` }
      : null),
  }
}

/** CSS background that reproduces the exporter's grain tile at the same density. */
function grainBackground(overlay: OverlayItem, time: number): React.CSSProperties | null {
  const url = grainTileUrl(overlay, Math.floor(time * 12))
  if (url === null) return null
  const heightPct = grainTileHeightFraction(overlay) * 100
  return {
    backgroundImage: `url(${url})`,
    // `auto` keeps the square tile square; the height ratio is resolution-free.
    backgroundSize: `auto ${heightPct}%`,
    backgroundRepeat: 'repeat',
    mixBlendMode: 'overlay',
    opacity: 0.38 * Math.max(0, Math.min(1, overlay.intensity ?? 1)),
  }
}

interface PreviewProps {
  selection: MediaSelection
  videoClips: ReadonlyMap<string, MediaClip>
  audioClips: ReadonlyMap<string, AudioClip>
  timelineEmpty: boolean
  hasVideo: boolean
  aspectRatio?: AspectRatio
  timelineItems?: TimelineItem[]
  edgeFades?: EdgeFades
  totalDuration?: number
  timelineVideoRef: RefObject<HTMLVideoElement | null>
  secondaryVideoRef?: RefObject<HTMLVideoElement | null>
  timelineImageRef?: RefObject<HTMLImageElement | null>
  secondaryImageRef?: RefObject<HTMLImageElement | null>
  timelineAudioRef: RefObject<HTMLAudioElement | null>
  timelineVeilRef?: RefObject<HTMLDivElement | null>
  textItems: TextOverlay[]
  selectedTextId: string | null
  time: number
  playing?: boolean
  onSelectText: (id: string | null) => void
  onUpdateText: (updated: TextOverlay) => void
  onDeleteText: (id: string) => void
  selectedTimelineItem?: TimelineItem | null
  onUpdateTimelineItem?: (updated: TimelineItem) => void
  onDeleteTimelineItem?: (id: string) => void
  onCloseTimelineInspector?: () => void
  selectedAudioItem?: AudioTimelineItem | null
  selectedAudioClipName?: string
  audioTrackCount?: number
  onUpdateAudioItem?: (updated: AudioTimelineItem) => void
  onAudioVolumeChange?: (id: string, volume: number) => void
  onAudioFadeChange?: (id: string, fadeIn: number, fadeOut: number) => void
  onMoveAudioToTrack?: (id: string, trackIndex: number) => void
  onDeleteAudioItem?: (id: string) => void
  onCloseAudioInspector?: () => void
  selectedTransition?: Transition | null
  selectedTransitionItemA?: TimelineItem | null
  selectedTransitionItemB?: TimelineItem | null
  selectedTransitionMaxDuration?: number
  onUpdateTransition?: (updated: Transition) => void
  onDeleteTransition?: (id: string) => void
  onCloseTransitionInspector?: () => void
  overlayItems?: OverlayItem[]
  selectedOverlayId?: string | null
  onSelectOverlay?: (id: string | null) => void
  onUpdateOverlay?: (updated: OverlayItem) => void
  onDeleteOverlay?: (id: string) => void
  onCloseOverlayInspector?: () => void
  videoLayers?: VideoLayerItem[]
  selectedLayerItem?: VideoLayerItem | null
  selectedLayerItemId?: string | null
  onUpdateLayerItem?: (updated: VideoLayerItem) => void
  onDeleteLayerItem?: (id: string) => void
  onCloseLayerInspector?: () => void
  onAddKeyframe?: (property: AnimatableProperty, value: number) => void
  onRemoveKeyframe?: (property: AnimatableProperty, keyframeId: string) => void
  onChangeKeyframeEasing?: (property: AnimatableProperty, keyframeId: string, easing: EasingType) => void
  onSeekToLayerLocalTime?: (localTime: number) => void
  /** Seconds from the selected base-track clip's start to the playhead. */
  selectedItemLocalTime?: number
  onSeekToClipLocalTime?: (localTime: number) => void
}

export function Preview({
  selection,
  videoClips,
  audioClips,
  timelineEmpty,
  hasVideo,
  aspectRatio = '16:9',
  timelineItems = [],
  edgeFades,
  totalDuration = 0,
  timelineVideoRef,
  secondaryVideoRef,
  timelineImageRef,
  secondaryImageRef,
  timelineAudioRef,
  timelineVeilRef,
  textItems,
  selectedTextId,
  time,
  playing = false,
  onSelectText,
  onUpdateText,
  onDeleteText,
  selectedTimelineItem,
  onUpdateTimelineItem,
  onDeleteTimelineItem,
  onCloseTimelineInspector,
  selectedAudioItem,
  selectedAudioClipName,
  audioTrackCount = 2,
  onUpdateAudioItem,
  onAudioVolumeChange,
  onAudioFadeChange,
  onMoveAudioToTrack,
  onDeleteAudioItem,
  onCloseAudioInspector,
  selectedTransition,
  selectedTransitionItemA,
  selectedTransitionItemB,
  selectedTransitionMaxDuration = 3,
  onUpdateTransition,
  onDeleteTransition,
  onCloseTransitionInspector,
  overlayItems = [],
  selectedOverlayId = null,
  onSelectOverlay,
  onUpdateOverlay,
  onDeleteOverlay,
  onCloseOverlayInspector,
  videoLayers = [],
  selectedLayerItem = null,
  selectedLayerItemId = null,
  onUpdateLayerItem,
  onDeleteLayerItem,
  onCloseLayerInspector,
  onAddKeyframe,
  onRemoveKeyframe,
  onChangeKeyframeEasing,
  onSeekToLayerLocalTime,
  selectedItemLocalTime = 0,
  onSeekToClipLocalTime,
}: PreviewProps) {
  const videoClip = selection?.kind === 'video' ? videoClips.get(selection.id) : undefined
  const audioClip = selection?.kind === 'audio' ? audioClips.get(selection.id) : undefined
  const showingTimeline = videoClip === undefined && audioClip === undefined
  const selectedText = textItems.find((item) => item.id === selectedTextId)
  const selectedOverlay = overlayItems.find((item) => item.id === selectedOverlayId)

  const hasInspector = Boolean(
    selectedText ||
    (selectedTimelineItem && onUpdateTimelineItem && onDeleteTimelineItem && onCloseTimelineInspector) ||
    (selectedAudioItem && onAudioVolumeChange && onMoveAudioToTrack && onDeleteAudioItem && onCloseAudioInspector) ||
    (selectedTransition && onUpdateTransition && onDeleteTransition && onCloseTransitionInspector) ||
    (selectedOverlay && onUpdateOverlay && onDeleteOverlay && onCloseOverlayInspector) ||
    (selectedLayerItem && onUpdateLayerItem && onDeleteLayerItem && onCloseLayerInspector)
  )

  // Show active overlays at current playhead time, plus the currently selected overlay for live editing
  const visibleTexts = textItems.filter(
    (item) => (time >= item.start && time < item.start + item.duration) || item.id === selectedTextId,
  )

  const visibleOverlays = sortOverlaysForPaint(
    overlayItems.filter(
      (item) => (time >= item.start && time < item.start + item.duration) || item.id === selectedOverlayId,
    ),
  )

  // Stack by the same order the exporter paints in. These are absolutely
  // positioned siblings, so z-index alone decides the stack and the four render
  // passes below can stay grouped by category.
  const overlayZIndex = new Map(visibleOverlays.map((item, index) => [item.id, index + 2]))

  const activeEdgeFade = edgeFadeAt(edgeFades, time, totalDuration)
  const pos = locate(timelineItems, time)
  const activeClipItem = pos !== null ? timelineItems[pos.index] : null
  const activeClipVignette = activeClipItem?.filterVignette ?? 0

  const stageRef = useRef<HTMLDivElement>(null)
  const [stageSize, setStageSize] = useState({ width: 0, height: 0 })
  useEffect(() => {
    const element = stageRef.current
    if (element === null) return
    const observer = new ResizeObserver(([entry]) =>
      setStageSize({ width: entry.contentRect.width, height: entry.contentRect.height }),
    )
    observer.observe(element)
    return () => observer.disconnect()
  }, [])

  const beginTitleDrag = (event: React.PointerEvent<HTMLDivElement>, title: TextOverlay) => {
    if (event.button !== 0) return
    event.stopPropagation()
    onSelectText(title.id)
    const element = event.currentTarget
    const stage = element.closest('.preview-stage') as HTMLElement | null
    if (!stage) return
    element.setPointerCapture(event.pointerId)
    const rect = stage.getBoundingClientRect()
    const startX = event.clientX
    const startY = event.clientY
    const startPosX = title.x ?? 50
    const startPosY = title.y ?? (title.position === 'top' ? 15 : title.position === 'center' ? 50 : 85)
    let moved = false

    const onMove = (move: PointerEvent) => {
      const dx = move.clientX - startX
      const dy = move.clientY - startY
      if (!moved && Math.hypot(dx, dy) < 3) return
      moved = true
      const nextX = Math.round(Math.min(95, Math.max(5, startPosX + (dx / rect.width) * 100)))
      const nextY = Math.round(Math.min(95, Math.max(5, startPosY + (dy / rect.height) * 100)))
      onUpdateText({ ...title, x: nextX, y: nextY })
    }

    const finish = () => {
      element.removeEventListener('pointermove', onMove)
      element.removeEventListener('pointerup', finish)
      element.removeEventListener('pointercancel', finish)
    }

    element.addEventListener('pointermove', onMove)
    element.addEventListener('pointerup', finish)
    element.addEventListener('pointercancel', finish)
  }

  const beginOverlayDrag = (event: React.PointerEvent<HTMLDivElement>, overlay: OverlayItem) => {
    if (event.button !== 0 || !onUpdateOverlay) return
    event.stopPropagation()
    onSelectOverlay?.(overlay.id)
    const element = event.currentTarget
    const stage = element.closest('.preview-stage') as HTMLElement | null
    if (!stage) return
    element.setPointerCapture(event.pointerId)
    const rect = stage.getBoundingClientRect()
    const startX = event.clientX
    const startY = event.clientY
    const startPosX = overlay.x ?? 50
    const startPosY = overlay.y ?? 50
    let moved = false

    const onMove = (move: PointerEvent) => {
      const dx = move.clientX - startX
      const dy = move.clientY - startY
      if (!moved && Math.hypot(dx, dy) < 3) return
      moved = true
      const nextX = Math.round(Math.min(95, Math.max(5, startPosX + (dx / rect.width) * 100)))
      const nextY = Math.round(Math.min(95, Math.max(5, startPosY + (dy / rect.height) * 100)))
      onUpdateOverlay({ ...overlay, x: nextX, y: nextY })
    }

    const finish = () => {
      element.removeEventListener('pointermove', onMove)
      element.removeEventListener('pointerup', finish)
      element.removeEventListener('pointercancel', finish)
    }

    element.addEventListener('pointermove', onMove)
    element.addEventListener('pointerup', finish)
    element.addEventListener('pointercancel', finish)
  }

  return (
    <section className={`panel preview${hasInspector ? ' has-inspector' : ''}`} aria-label="Preview Monitor">
      <div className="preview-viewport">
        {/* Top Monitor Bar */}
        <div className="preview-monitor-header">
          <div className="monitor-badge">
            <span className="live-dot" />
            <span className="monitor-label">
              {videoClip ? `Source: ${videoClip.name}` : audioClip ? `Audio: ${audioClip.name}` : 'Program Monitor'}
            </span>
          </div>
          {videoClip && (
            <span className="monitor-meta">
              {videoClip.width}×{videoClip.height}
            </span>
          )}
        </div>

        {/* Canvas Stage */}
        <div className="preview-canvas-wrapper">
          {videoClip && (
            videoClip.mediaType === 'image' ? (
              <img key={videoClip.id} src={videoClip.url} alt={videoClip.name} className="preview-source-video preview-source-image" />
            ) : (
              <video key={videoClip.id} src={videoClip.url} controls className="preview-source-video" />
            )
          )}

          {audioClip && (
            <div className="audio-preview">
              <div className="audio-viz-ring static">
                <span className="clip-icon-large" aria-hidden="true">♪</span>
              </div>
              <p className="audio-preview-name">{audioClip.name}</p>
              <audio key={audioClip.id} src={audioClip.url} controls />
            </div>
          )}

          {/* Timeline preview stage */}
          <div
            ref={stageRef}
            className="preview-stage"
            hidden={!showingTimeline || timelineEmpty}
            style={{ aspectRatio: (aspectRatio ?? '16:9').replace(':', ' / ') }}
          >
            {hasVideo ? (
              <>
                <video ref={timelineVideoRef} className="preview-video primary" />
                <video
                  ref={secondaryVideoRef}
                  className="preview-video secondary"
                  style={{ display: 'none' }}
                />
                <img
                  ref={timelineImageRef}
                  className="preview-image primary"
                  style={{ display: 'none' }}
                  alt=""
                />
                <img
                  ref={secondaryImageRef}
                  className="preview-image secondary"
                  style={{ display: 'none' }}
                  alt=""
                />
              </>
            ) : (
              <div className="audio-timeline-banner">
                <div className="audio-viz-ring">
                  <div className="audio-viz-bars">
                    <span className="viz-bar" />
                    <span className="viz-bar" />
                    <span className="viz-bar" />
                    <span className="viz-bar" />
                    <span className="viz-bar" />
                  </div>
                  <span className="audio-viz-icon" aria-hidden="true">♪</span>
                </div>
                <p className="audio-viz-label">Audio Playback</p>
                <p className="audio-viz-sub">No video track — playing audio timeline</p>
              </div>
            )}

            <VideoLayerStage
              videoLayers={videoLayers}
              clips={videoClips}
              time={time}
              playing={playing}
              selectedLayerItemId={selectedLayerItemId}
            />

            <div className="preview-overlay">
              {/* Active Overlay Indicator Pill */}
              {selectedOverlay && (
                <div className="preview-overlay-selected-pill">
                  <span className="pill-dot" />
                  <span>
                    Overlay Active:{' '}
                    {selectedOverlay.category === 'vfx'
                      ? (VFX_OVERLAY_PRESETS.find((p) => p.id === selectedOverlay.vfxType)?.name ?? 'Visual FX')
                      : selectedOverlay.category === 'lower-third'
                        ? (selectedOverlay.title || 'Lower Third')
                        : selectedOverlay.category === 'color'
                          ? 'Color Wash'
                          : (videoClips.get(selectedOverlay.clipId ?? '')?.name ?? 'Picture-in-Picture')}
                  </span>
                </div>
              )}

              {/* Color Wash Overlays */}
              {visibleOverlays
                .filter((o) => o.category === 'color')
                .map((overlay) => {
                  const shape = overlay.colorWashShape ?? (overlay.colorSecondary ? 'linear' : 'flat')
                  const c1 = overlay.color ?? '#f97316'
                  const c2 = overlay.colorSecondary ?? c1
                  const scrimPct = (overlay.colorWashScrimSize ?? 0.5) * 100
                  let bg = c1
                  if (shape === 'scrim-bottom') {
                    bg = `linear-gradient(to bottom, transparent ${100 - scrimPct}%, ${c1})`
                  } else if (shape === 'scrim-top') {
                    bg = `linear-gradient(to top, transparent ${100 - scrimPct}%, ${c1})`
                  } else if (shape === 'radial') {
                    bg = `radial-gradient(circle, ${c1}, ${c2})`
                  } else if (shape === 'linear' || overlay.colorSecondary) {
                    bg = `linear-gradient(${overlay.gradientAngle ?? 135}deg, ${c1}, ${c2})`
                  }
                  return (
                    <div
                      key={overlay.id}
                      className="preview-color-overlay"
                      style={{
                        position: 'absolute',
                        inset: 0,
                        ...overlayAnimationStyle(overlay, time, { opacity: overlay.opacity ?? 0.3 }),
                        mixBlendMode: overlay.blendMode ?? 'overlay',
                        background: bg,
                        pointerEvents: 'none',
                        zIndex: overlayZIndex.get(overlay.id) ?? 2,
                      }}
                    />
                  )
                })}

              {/* Visual FX Overlays */}
              {visibleOverlays
                .filter((o) => o.category === 'vfx')
                .map((overlay) => {
                  const intensity = overlay.intensity ?? 1
                  const type = overlay.vfxType ?? 'letterbox'
                  const isSelected = overlay.id === selectedOverlayId

                  if (type === 'letterbox') {
                    const ratioStr = overlay.vfxLetterboxRatio ?? '2.35'
                    const targetRatio = ratioStr === '4:3' ? 4 / 3 : parseFloat(ratioStr) || 2.35
                    const frameRatio = 16 / 9
                    let barHeight = Math.round(12.5 * intensity)
                    if (targetRatio > frameRatio) {
                      const visibleHeightFrac = frameRatio / targetRatio
                      barHeight = Math.max(0, Math.round(((1 - visibleHeightFrac) / 2) * 100 * intensity))
                    }
                    return (
                      <div
                        key={overlay.id}
                        className={`preview-vfx-letterbox${isSelected ? ' selected' : ''}`}
                      >
                        <div className="bar-top" style={{ height: `${barHeight}%` }} />
                        <div className="bar-bottom" style={{ height: `${barHeight}%` }} />
                      </div>
                    )
                  }

                  if (type === 'vignette') {
                    const feather = Math.round((overlay.vfxVignetteFeather ?? 0.45) * 100)
                    const color = overlay.vfxVignetteColor ?? '#000000'
                    return (
                      <div
                        key={overlay.id}
                        className="preview-vfx-vignette"
                        style={{
                          position: 'absolute',
                          inset: 0,
                          background: `radial-gradient(circle, transparent ${feather}%, ${color} 100%)`,
                          ...overlayAnimationStyle(overlay, time, { opacity: (overlay.opacity ?? 1) * intensity }),
                          mixBlendMode: overlay.blendMode && overlay.blendMode !== 'normal' ? overlay.blendMode : undefined,
                          pointerEvents: 'none',
                          zIndex: overlayZIndex.get(overlay.id) ?? 2,
                        }}
                      />
                    )
                  }

                  if (type === 'light-leak') {
                    return (
                      <div
                        key={overlay.id}
                        className="preview-vfx-lightleak"
                        style={{
                          position: 'absolute',
                          inset: 0,
                          background: `radial-gradient(circle at 15% 15%, rgba(255, 170, 70, ${0.45 * intensity}) 0%, rgba(255, 90, 150, ${0.25 * intensity}) 40%, transparent 70%)`,
                          ...overlayAnimationStyle(overlay, time, { opacity: overlay.opacity ?? 1 }),
                          mixBlendMode: 'screen',
                          pointerEvents: 'none',
                          zIndex: overlayZIndex.get(overlay.id) ?? 2,
                        }}
                      />
                    )
                  }

                  return (
                    <div
                      key={overlay.id}
                      className={`preview-vfx-fx vfx-${type}`}
                      style={{
                        position: 'absolute',
                        inset: 0,
                        ...overlayAnimationStyle(overlay, time, { opacity: (overlay.opacity ?? 1) * intensity }),
                        mixBlendMode: overlay.blendMode && overlay.blendMode !== 'normal' ? overlay.blendMode : undefined,
                        pointerEvents: 'none',
                        zIndex: overlayZIndex.get(overlay.id) ?? 2,
                        // Grain uses the exporter's own noise tile rather than a CSS
                        // dot pattern, so the two cover the frame identically.
                        ...(type === 'film-grain' ? grainBackground(overlay, time) : null),
                      }}
                    />
                  )
                })}

              {/* Media Picture-in-Picture Overlays */}
              {visibleOverlays
                .filter((o) => o.category === 'media')
                .map((overlay) => {
                  const clip = videoClips.get(overlay.clipId ?? '')
                  if (!clip) return null
                  const isSelected = overlay.id === selectedOverlayId
                  const shape = overlay.pipShape ?? 'rounded'
                  const isCircle = shape === 'circle'
                  const shadowCss = overlay.pipShadow
                    ? `0 ${(overlay.pipShadowY ?? 8)}px ${(overlay.pipShadowBlur ?? 16)}px rgba(0, 0, 0, ${overlay.pipShadowOpacity ?? 0.55})`
                    : undefined
                  const transforms = ['translate(-50%, -50%)']
                  if (overlay.pipRotation) transforms.push(`rotate(${overlay.pipRotation}deg)`)
                  if (overlay.pipFlipH) transforms.push('scaleX(-1)')

                  return (
                    <div
                      key={overlay.id}
                      className={`preview-media-overlay${isSelected ? ' selected' : ''}`}
                      style={{
                        position: 'absolute',
                        left: `${overlay.x ?? 50}%`,
                        top: `${overlay.y ?? 50}%`,
                        width: `${overlay.width ?? 30}%`,
                        ...overlayAnimationStyle(overlay, time, {
                          transform: transforms.join(' '),
                          opacity: overlay.opacity ?? 1,
                        }),
                        borderRadius: isCircle ? '50%' : `${overlay.borderRadius ?? (shape === 'rect' ? 0 : 8)}px`,
                        border:
                          overlay.borderWidth && overlay.borderWidth > 0
                            ? `${overlay.borderWidth}px solid ${overlay.borderColor ?? '#fff'}`
                            : undefined,
                        boxShadow: shadowCss,
                        mixBlendMode:
                          overlay.blendMode && overlay.blendMode !== 'normal' ? overlay.blendMode : undefined,
                        overflow: 'hidden',
                        cursor: 'grab',
                        zIndex: overlayZIndex.get(overlay.id) ?? 2,
                      }}
                      title="Picture-in-Picture overlay: Drag to position, click to edit"
                      onPointerDown={(e) => beginOverlayDrag(e, overlay)}
                      onClick={(e) => {
                        e.stopPropagation()
                        onSelectOverlay?.(overlay.id)
                      }}
                    >
                      {clip.mediaType === 'image' ? (
                        <img
                          src={clip.url}
                          alt={clip.name}
                          style={{ width: '100%', height: 'auto', display: 'block', pointerEvents: 'none' }}
                        />
                      ) : (
                        <PipVideo
                          src={clip.url}
                          playing={playing}
                          timelineTime={time}
                          overlay={overlay}
                        />
                      )}
                    </div>
                  )
                })}

              {/* Lower Third Overlays */}
              {visibleOverlays
                .filter((o) => o.category === 'lower-third')
                .map((overlay) => {
                  const isSelected = overlay.id === selectedOverlayId
                  const style = overlay.lowerThirdStyle ?? 'broadcast'
                  const title = overlay.title || 'Speaker Name'
                  const subtitle = overlay.subtitle || 'Role / Title'
                  const accent = overlay.accentColor ?? '#3b82f6'
                  const l3Scale = overlay.lowerThirdScale ?? 1

                  return (
                    <div
                      key={overlay.id}
                      className={`preview-lower-third style-${style}${isSelected ? ' selected' : ''}`}
                      style={{
                        position: 'absolute',
                        left: `${overlay.x ?? 8}%`,
                        top: `${overlay.y ?? 82}%`,
                        transform: `scale(${l3Scale})`,
                        transformOrigin: 'bottom left',
                        ...overlayAnimationStyle(overlay, time, { opacity: overlay.opacity ?? 1 }),
                        cursor: 'grab',
                        zIndex: overlayZIndex.get(overlay.id) ?? 2,
                        userSelect: 'none',
                      }}
                      title="Lower Third: Drag to position, click to edit"
                      onPointerDown={(e) => beginOverlayDrag(e, overlay)}
                      onClick={(e) => {
                        e.stopPropagation()
                        onSelectOverlay?.(overlay.id)
                      }}
                    >
                      {style === 'breaking-news' ? (
                        <div className="lt-breaking-box">
                          <span className="lt-alert-tag">BREAKING</span>
                          <span className="lt-headline">{title}</span>
                        </div>
                      ) : style === 'minimal' ? (
                        <div className="lt-minimal-box">
                          <div className="lt-title">{title}</div>
                          <div className="lt-sub">{subtitle}</div>
                        </div>
                      ) : style === 'social' ? (
                        <div className="lt-social-box">
                          <span className="lt-accent-dot" style={{ backgroundColor: accent }} />
                          <span className="lt-title">{title}</span>
                        </div>
                      ) : (
                        <div className="lt-broadcast-box">
                          <div className="lt-accent-bar" style={{ backgroundColor: accent }} />
                          <div className="lt-text-col">
                            <div className="lt-title">{title}</div>
                            <div className="lt-sub" style={{ color: accent }}>{subtitle}</div>
                          </div>
                        </div>
                      )}
                    </div>
                  )
                })}

              {/* Text Titles */}
              {stageSize.height > 0 &&
                visibleTexts.map((title) => {
                  const isSelected = title.id === selectedTextId
                  const anim = textAnimationAt(title, time)
                  if (anim.opacity <= 0.001) return null

                  const style = resolveTextStyle(title, stageSize)
                  let charsLeft = anim.visibleChars ?? Number.POSITIVE_INFINITY
                  const linesToDraw = style.lines.map((line) => {
                    if (charsLeft <= 0) return ''
                    if (line.length <= charsLeft) {
                      charsLeft -= line.length
                      return line
                    }
                    const sub = line.slice(0, charsLeft)
                    charsLeft = 0
                    return sub
                  })

                  const shadow = style.shadowBlurPx > 0
                    ? `${style.shadowOffsetXPx}px ${style.shadowOffsetYPx}px ${style.shadowBlurPx}px ${style.shadowColor}`
                    : undefined
                  const glow = style.glowBlurPx > 0 && style.glowColor
                    ? `0 0 ${style.glowBlurPx}px ${style.glowColor}`
                    : undefined
                  const combinedShadow = [shadow, glow].filter(Boolean).join(', ') || undefined
                  const stroke = style.strokePx > 0
                    ? `${style.strokePx}px ${style.strokeColor}`
                    : undefined

                  const transforms: string[] = []
                  if (style.rotation !== 0) transforms.push(`rotate(${style.rotation}deg)`)
                  if (anim.scale !== 1) transforms.push(`scale(${anim.scale})`)
                  if (anim.offsetY !== 0) transforms.push(`translateY(${anim.offsetY * 100}%)`)

                  return (
                    <div
                      key={title.id}
                      className={`title-overlay${isSelected ? ' selected' : ''}`}
                      style={{
                        left: `${blockLeft(style) - style.bgPadXPx}px`,
                        top: `${blockTop(style) - style.bgPadYPx}px`,
                        width: `${style.blockWidthPx + style.bgPadXPx * 2}px`,
                        font: style.fontCss,
                        letterSpacing: `${style.letterSpacingPx}px`,
                        lineHeight: `${style.lineHeightPx}px`,
                        color: style.color,
                        opacity: style.opacity * anim.opacity,
                        transform: transforms.length > 0 ? transforms.join(' ') : undefined,
                        textAlign: style.textAlign,
                        padding: `${style.bgPadYPx}px ${style.bgPadXPx}px`,
                        borderRadius: `${style.bgRadiusPx}px`,
                        backgroundColor: style.bgColor ?? undefined,
                        textShadow: combinedShadow,
                        WebkitTextStroke: stroke,
                        paintOrder: 'stroke fill',
                      }}
                      title="Click and drag to position anywhere on screen"
                      onPointerDown={(event) => beginTitleDrag(event, title)}
                      onClick={(event) => {
                        event.stopPropagation()
                        onSelectText(title.id)
                      }}
                    >
                      {linesToDraw.map((line, index) => (
                        <div key={index}>{line === '' ? '\u00a0' : line}</div>
                      ))}
                    </div>
                  )
                })}

              {/* Active Clip Vignette */}
              {activeClipVignette > 0 && (
                <div
                  className="preview-clip-vignette"
                  style={{
                    position: 'absolute',
                    inset: 0,
                    background: `radial-gradient(circle, transparent ${VIGNETTE.clearStop * 100}%, rgba(0,0,0,${vignetteAlpha(activeClipVignette).toFixed(3)}) 100%)`,
                    pointerEvents: 'none',
                    zIndex: 1,
                  }}
                />
              )}

              {/* Dip / flash wash, painted imperatively by the player. */}
              <div
                ref={timelineVeilRef}
                className="preview-transition-veil"
                style={{
                  position: 'absolute',
                  inset: 0,
                  opacity: 0,
                  pointerEvents: 'none',
                  zIndex: 9998,
                }}
              />

              {/* Program Edge Fade */}
              {activeEdgeFade !== null && (
                <div
                  className="preview-edge-fade"
                  style={{
                    position: 'absolute',
                    inset: 0,
                    backgroundColor: activeEdgeFade.color,
                    opacity: activeEdgeFade.opacity,
                    pointerEvents: 'none',
                    zIndex: 9999,
                  }}
                />
              )}
            </div>
          </div>

          {showingTimeline && timelineEmpty && (
            <div className="preview-empty-state">
              <div className="empty-icon-group">
                <svg
                  className="empty-icon"
                  width="34"
                  height="34"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <rect x="2" y="4" width="20" height="16" rx="2" />
                  <path d="M2 9h20M7 4v5M12 4v5M17 4v5" />
                </svg>
              </div>
              <p className="empty-title">Timeline is Empty</p>
              <p className="empty-desc">
                Import videos or audio into the Media Pool, then add them to the timeline to begin editing.
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Docked Inspector Sidebar (Does not obscure video canvas!) */}
      {hasInspector && (
        <aside className="preview-inspector-dock">
          {selectedTimelineItem && onUpdateTimelineItem && onDeleteTimelineItem && onCloseTimelineInspector && (
            <ClipInspector
              item={selectedTimelineItem}
              clip={videoClips.get(selectedTimelineItem.clipId)}
              onChange={onUpdateTimelineItem}
              onDelete={onDeleteTimelineItem}
              onClose={onCloseTimelineInspector}
              localTime={selectedItemLocalTime}
              onAddKeyframe={onAddKeyframe}
              onRemoveKeyframe={onRemoveKeyframe}
              onChangeEasing={onChangeKeyframeEasing}
              onSeekToLocalTime={onSeekToClipLocalTime}
            />
          )}

          {selectedText && (
            <TextInspector
              item={selectedText}
              onChange={onUpdateText}
              onDelete={onDeleteText}
              onClose={() => onSelectText(null)}
            />
          )}

          {selectedAudioItem && onAudioVolumeChange && onMoveAudioToTrack && onDeleteAudioItem && onCloseAudioInspector && (
            <AudioInspector
              item={selectedAudioItem}
              clipName={selectedAudioClipName ?? 'Audio clip'}
              trackCount={audioTrackCount}
              onChange={onUpdateAudioItem}
              onVolumeChange={onAudioVolumeChange}
              onFadeChange={onAudioFadeChange}
              onMoveToTrack={onMoveAudioToTrack}
              onDelete={onDeleteAudioItem}
              onClose={onCloseAudioInspector}
            />
          )}

          {selectedTransition && onUpdateTransition && onDeleteTransition && onCloseTransitionInspector && (
            <TransitionInspector
              transition={selectedTransition}
              clipAName={videoClips.get(selectedTransitionItemA?.clipId ?? '')?.name ?? 'Clip A'}
              clipBName={videoClips.get(selectedTransitionItemB?.clipId ?? '')?.name ?? 'Clip B'}
              maxDuration={selectedTransitionMaxDuration}
              onChange={onUpdateTransition}
              onDelete={onDeleteTransition}
              onClose={onCloseTransitionInspector}
            />
          )}

          {selectedLayerItem && onUpdateLayerItem && onDeleteLayerItem && onCloseLayerInspector && (
            <VideoLayerInspector
              item={selectedLayerItem}
              clip={videoClips.get(selectedLayerItem.clipId)}
              time={time}
              onChange={onUpdateLayerItem}
              onDelete={onDeleteLayerItem}
              onClose={onCloseLayerInspector}
              onAddKeyframe={onAddKeyframe}
              onRemoveKeyframe={onRemoveKeyframe}
              onChangeEasing={onChangeKeyframeEasing}
              onSeekToLocalTime={onSeekToLayerLocalTime}
            />
          )}

          {selectedOverlay && onUpdateOverlay && onDeleteOverlay && onCloseOverlayInspector && (
            <OverlayInspector
              item={selectedOverlay}
              mediaClips={videoClips}
              onChange={onUpdateOverlay}
              onDelete={onDeleteOverlay}
              onClose={onCloseOverlayInspector}
            />
          )}
        </aside>
      )}

      <audio ref={timelineAudioRef} hidden />
    </section>
  )
}
