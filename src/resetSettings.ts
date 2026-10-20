import { createDefaultOverlay } from './overlayDraw.ts'
import { DEFAULT_TRANSITION_DURATION } from './transitionTimeline.ts'
import type {
  AudioTimelineItem,
  OverlayItem,
  TextOverlay,
  TimelineItem,
  Transition,
  VideoLayerItem,
} from './types.ts'

/**
 * Restoring an item's settings to their defaults.
 *
 * Every reset keeps the things that say *which* item this is and *where* it
 * sits — id, source clip, in/out points, timeline position, track — and clears
 * only what the inspector can change. Reset is not a delete, and it must never
 * move a clip or lose a trim.
 */

/** A base-track clip: clears grading, transform, speed and framing. */
export function resetTimelineItem(item: TimelineItem): TimelineItem {
  return {
    id: item.id,
    clipId: item.clipId,
    inPoint: item.inPoint,
    outPoint: item.outPoint,
    muted: false,
  }
}

/** A clip on a layer above the base track. Layers start muted so they do not double the audio. */
export function resetVideoLayerItem(item: VideoLayerItem): VideoLayerItem {
  return {
    id: item.id,
    clipId: item.clipId,
    inPoint: item.inPoint,
    outPoint: item.outPoint,
    start: item.start,
    trackIndex: item.trackIndex,
    muted: true,
  }
}

/** An audio clip: back to full volume, no fades, no effect, normal speed. */
export function resetAudioItem(item: AudioTimelineItem): AudioTimelineItem {
  return {
    id: item.id,
    clipId: item.clipId,
    inPoint: item.inPoint,
    outPoint: item.outPoint,
    start: item.start,
    trackIndex: item.trackIndex,
    volume: 1,
  }
}

/** A title: keeps its words and its place, drops every style choice. */
export function resetTextOverlay(item: TextOverlay): TextOverlay {
  return {
    id: item.id,
    text: item.text,
    start: item.start,
    duration: item.duration,
    position: 'bottom',
    size: 'medium',
    color: '#ffffff',
    x: 50,
    y: 85,
    fontSize: 48,
    fontFamily: 'Inter',
    backgroundColor: 'transparent',
    textAlign: 'center',
  }
}

/** An overlay: rebuilt from its category's defaults, keeping id, placement and source. */
export function resetOverlayItem(item: OverlayItem): OverlayItem {
  const fresh = createDefaultOverlay(item.category, item.start, item.duration, item.clipId)
  return { ...fresh, id: item.id }
}

/** A transition: back to a plain crossfade at the default length, between the same two clips. */
export function resetTransition(transition: Transition): Transition {
  return {
    id: transition.id,
    fromItemId: transition.fromItemId,
    toItemId: transition.toItemId,
    type: 'crossfade',
    duration: DEFAULT_TRANSITION_DURATION,
  }
}
