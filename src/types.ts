/** Something with a span in its source: `outPoint - inPoint` seconds long. */
export interface SourceRange {
  /** Source time, in seconds, where this piece starts. */
  inPoint: number
  /** Source time, in seconds, where this piece ends. */
  outPoint: number
}

/** A video file imported into the media panel. */
export interface MediaClip {
  id: string
  name: string
  /** The imported file, read again when exporting. */
  file: File
  /** Object URL for the original file; revoke it when the clip is removed. */
  url: string
  /** Length in seconds; not finite when the browser cannot determine it. */
  duration: number
  width: number
  height: number
  /** Small JPEG data URL of an early frame. */
  thumbnail: string
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
}

/** One piece of a video clip placed on the video track. Items play back to back. */
export interface TimelineItem extends SourceRange {
  id: string
  clipId: string
  /** Leaves out this clip's own sound when playing and exporting. */
  muted: boolean
}

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

