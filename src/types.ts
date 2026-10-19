/** Something with a span in its source: `outPoint - inPoint` seconds long. */
export interface SourceRange {
  /** Source time, in seconds, where this piece starts. */
  inPoint: number
  /** Source time, in seconds, where this piece ends. */
  outPoint: number
}

/** A video or photo file imported into the media panel. */
export interface MediaClip {
  id: string
  name: string
  /** The imported file, read again when exporting. */
  file: File
  /** Object URL for the original file; revoke it when the clip is removed. */
  url: string
  /** Length in seconds; not finite when the browser cannot determine it. Photos default to 4s. */
  duration: number
  width: number
  height: number
  /** Small JPEG data URL of an early frame or photo preview. */
  thumbnail: string
  /** Distinguish between video and still photo clips. */
  mediaType?: 'video' | 'image'
}

/** An audio file imported into the media panel. */
export interface AudioClip {
  id: string
  name: string
  /** The imported file, read again when exporting. */
  file: File
  /** Object URL for the original file; revoke it when the clip is removed. */
  url: string
  /** Length in seconds; not finite when the browser cannot determine it. */
  duration: number
  /** Normalized amplitude peaks along the audio track for waveform visualization. */
  peaks?: number[]
  /** Normalized pitch/frequency values along the audio track for waveform visualization. */
  pitches?: number[]
}

export type FilterType =
  | 'none'
  | 'cinematic'
  | 'noir'
  | 'vintage'
  | 'warm'
  | 'cool'
  | 'cyberpunk'
  | 'vivid'
  | 'sepia'
  | 'bleach'

export type AspectRatio = '16:9' | '9:16' | '1:1' | '4:5' | '21:9'

/** One piece of a video or photo clip placed on the primary visual track. Items play back to back. */
export interface TimelineItem extends SourceRange {
  id: string
  clipId: string
  /** Leaves out this clip's own sound when playing and exporting. */
  muted: boolean
  /** Stylistic color filter / LUT preset. */
  filter?: FilterType
  /** 0 to 1 filter intensity (default 1). */
  filterIntensity?: number
  /** Playback speed multiplier (e.g. 0.5 for slow-mo, 2 for timelapse). Default 1. */
  speed?: number
  /** Clockwise rotation angle in degrees: 0, 90, 180, 270. Default 0. */
  rotation?: number
  /** Mirror horizontally. */
  flipH?: boolean
  /** Flip vertically. */
  flipV?: boolean
  /** 'contain' keeps aspect ratio with letterboxing; 'cover' crops to fill frame. */
  fitMode?: 'contain' | 'cover'
}

export type TransitionType =
  | 'crossfade'
  | 'fade-black'
  | 'fade-white'
  | 'wipe-left'
  | 'wipe-right'
  | 'wipe-up'
  | 'wipe-down'
  | 'slide-left'
  | 'slide-right'
  | 'zoom-in'
  | 'zoom-out'
  | 'iris-circle'
  | 'blur-dissolve'

/** A transition between two adjacent video clips on the timeline. */
export interface Transition {
  id: string
  /** The timeline item ID before the cut. */
  fromItemId: string
  /** The timeline item ID after the cut. */
  toItemId: string
  /** Type of blend effect. */
  type: TransitionType
  /** Duration of the transition in seconds (typically 0.5s to 2.0s). */
  duration: number
}

export type AudioEffectType =
  | 'none'
  | 'bass-boost'
  | 'treble-boost'
  | 'vocal-enhance'
  | 'underwater'
  | 'telephone'
  | 'lo-fi'
  | 'concert-hall'
  | 'robot'

/**
 * One piece of an audio clip placed on the audio track, at an explicit timeline
 * position. Unlike video items, audio items do not auto-sequence: they can leave
 * gaps, but may not overlap each other.
 */
export interface AudioTimelineItem extends SourceRange {
  id: string
  clipId: string
  /** Timeline position, in seconds, independent of any video item. */
  start: number
  /** 0 (silent) to 1 (full volume). */
  volume: number
  /** The lane/track index (0 for Audio 1, 1 for Audio 2, etc.) for parallel audio. */
  trackIndex?: number
  /** Volume fade-in duration at the start in seconds (default 0). */
  fadeIn?: number
  /** Volume fade-out duration at the end in seconds (default 0). */
  fadeOut?: number
  /** Stylistic audio effect preset. */
  effect?: AudioEffectType
  /** 0 to 1 effect intensity (default 1). */
  effectIntensity?: number
  /** Playback speed multiplier (default 1). */
  speed?: number
}

export type TextPosition = 'top' | 'center' | 'bottom'
export type TextSize = 'small' | 'medium' | 'large'

/** A text title overlay placed on the timeline. */
export interface TextOverlay {
  id: string
  /** The text content to display. */
  text: string
  /** Timeline position, in seconds, when this title appears. */
  start: number
  /** How long this title appears, in seconds. */
  duration: number
  /** Vertical placement preset (backward-compatible). */
  position: TextPosition
  /** Relative font size preset (backward-compatible). */
  size: TextSize
  /** Text color in CSS format (e.g. '#ffffff'). */
  color: string
  /** Horizontal position percentage on the frame (0 to 100, default 50). */
  x?: number
  /** Vertical position percentage on the frame (0 to 100, default 50). */
  y?: number
  /** Font size in pixels (default 48). */
  fontSize?: number
  /** Font family name (e.g. 'Anton', 'Bebas Neue', 'Inter', 'Pacifico'). */
  fontFamily?: string
  /** Background pill/box color (e.g. 'transparent', 'rgba(0,0,0,0.6)'). */
  backgroundColor?: string
  /** Text alignment (default 'center'). */
  textAlign?: 'left' | 'center' | 'right'
}

