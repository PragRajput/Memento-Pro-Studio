/** How the value approaches the next keyframe. 'hold' freezes until that keyframe lands. */
export type EasingType = 'linear' | 'ease-in' | 'ease-out' | 'ease-in-out' | 'hold'

/** Properties that can be animated over the length of an item. */
export type AnimatableProperty = 'posX' | 'posY' | 'scale' | 'rotate' | 'opacity' | 'volume'

export interface Keyframe {
  id: string
  /** Seconds from the start of the item that owns this keyframe, never negative. */
  time: number
  value: number
  easing: EasingType
}

/** Keyframes per property. A property with no entry uses its static value instead. */
export type KeyframeTracks = Partial<Record<AnimatableProperty, Keyframe[]>>

/**
 * Static transform applied to a visual item, and the keyframes that animate it.
 * Each static value is the fallback for its property when that property is not keyed.
 */
export interface Transformable {
  /** Horizontal offset from centre, as a percentage of frame width (default 0). */
  posX?: number
  /** Vertical offset from centre, as a percentage of frame height (default 0). */
  posY?: number
  /** Uniform scale multiplier (default 1). */
  scale?: number
  /** Free rotation in degrees; separate from the 90° orientation steps (default 0). */
  rotate?: number
  /** 0 to 1 (default 1). */
  opacity?: number
  keyframes?: KeyframeTracks
}

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
  | 'faded'
  | 'auto'
  | 'moody'

export type AspectRatio = '16:9' | '9:16' | '1:1' | '4:5' | '21:9'

/** One piece of a video or photo clip placed on the primary visual track. Items play back to back. */
export interface TimelineItem extends SourceRange, Transformable {
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

  // --- Manual colour grading. All are -100..100 (0 = untouched) unless noted. ---
  /** Exposure. */
  filterExposure?: number
  /** Contrast. */
  filterContrast?: number
  /** Saturation. */
  filterSaturation?: number
  /** White balance: negative cools (blue), positive warms (orange). */
  filterTemperature?: number
  /** Green/magenta balance: negative green, positive magenta. */
  filterTint?: number
  /** Highlight recovery (negative) or boost (positive). */
  filterHighlights?: number
  /** Shadow lift (positive) or crush (negative). */
  filterShadows?: number
  /** Vignette strength, 0..100. */
  filterVignette?: number
  /** Film grain amount, 0..100. */
  filterGrain?: number
  /** Unsharp amount, 0..100. */
  filterSharpen?: number
  /** Matte / faded-print black lift, 0..100. */
  filterFade?: number
}

/**
 * A clip on a video layer above the base track (V2, V3, …). Unlike base-track
 * items, layer items sit at an explicit timeline position, may leave gaps, and
 * may overlap one another; they composite over whatever the base track shows.
 */
export interface VideoLayerItem extends SourceRange, Transformable {
  id: string
  clipId: string
  /** Timeline position, in seconds. */
  start: number
  /** Which layer this sits on: 0 is V2, the first layer above the base track. */
  trackIndex: number
  /** Leaves out this clip's own sound when playing and exporting. */
  muted: boolean
  /** 0 to 1 gain for this clip's own sound (default 1). */
  volume?: number
  /** Playback speed multiplier (default 1). */
  speed?: number
  filter?: FilterType
  /** 0 to 1 filter intensity (default 1). */
  filterIntensity?: number
  /** How this layer composites onto the layers below (default 'normal'). */
  blendMode?: BlendMode
  /** 'contain' fits the whole frame in; 'cover' crops to fill (default 'contain'). */
  fitMode?: 'contain' | 'cover'
  /** Clockwise orientation in 90° steps: 0, 90, 180, 270. Free rotation is `rotate`. */
  rotation?: number
  flipH?: boolean
  flipV?: boolean
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

/** Named timing curves shared by transitions and edge fades. */
export type TransitionEasing =
  | 'linear'
  | 'ease-in'
  | 'ease-out'
  | 'ease-in-out'
  | 'smoothstep'
  | 'ease-out-back'

/** A fade from or to a flat colour at the very start or end of the timeline. */
export interface EdgeFade {
  /** 'in' fades up from `color` at t=0; 'out' fades down to `color` at the end. */
  edge: 'in' | 'out'
  /** Length of the fade in seconds; 0 disables it. */
  duration: number
  /** Colour the programme fades from or to, covering titles and overlays too. */
  color: string
  /** Timing curve for the ramp. */
  easing: TransitionEasing
}

/** Optional fades at each end of the whole timeline. */
export interface EdgeFades {
  in?: EdgeFade
  out?: EdgeFade
}

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

  /** Timing curve; omitted uses the per-type default. */
  transitionEasing?: TransitionEasing
  /** Where the window sits relative to the cut. */
  transitionAlign?: 'center' | 'start' | 'end'
  /** How the two clips' own sound is blended across the window. */
  transitionAudioFade?: 'equal-power' | 'linear' | 'dip' | 'none'
  /** 0..1 scale on the type's signature amount (blur, zoom range, veil peak). */
  transitionStrength?: number
  /** Feathered edge width for wipes and the iris, as a fraction of the short side. */
  transitionSoftness?: number
  /** Colour of the full-frame wash used by the dip and flash types. */
  transitionVeilColor?: string
  /** Travel angle in degrees clockwise from screen-right, for wipes and slides. */
  transitionDirectionDeg?: number
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
  /** Volume automation over this piece; overrides `volume` wherever it is keyed. */
  keyframes?: KeyframeTracks
}

export type TextPosition = 'top' | 'center' | 'bottom'
export type TextSize = 'small' | 'medium' | 'large'

/** A named title look; 'custom' once any individual style field is edited. */
export type TitlePresetId =
  | 'custom'
  | 'bold-caption'
  | 'subtitle'
  | 'neon'
  | 'lower-third-minimal'
  | 'impact'
  | 'elegant'
  | 'highlight'
  | 'sticker'

/** Entrance/exit animation kinds; 'typewriter' is entrance-only. */
export type TextAnimationType = 'none' | 'fade' | 'slide-up' | 'pop' | 'typewriter'

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
  /** Text alignment of lines within the block (default 'center'). */
  textAlign?: 'left' | 'center' | 'right'

  // --- Style. Lengths marked (em) are fractions of fontSize, so they survive
  // --- any output resolution and keep preview and export identical.
  /** Named look this title was built from. */
  textPreset?: TitlePresetId
  /** Numeric font weight 100-900. */
  textWeight?: number
  /** Render the italic face when the family has one. */
  textItalic?: boolean
  /** Upper-case at render time without changing the stored text. */
  textUppercase?: boolean
  /** Tracking (em), -0.05..0.30. */
  textLetterSpacing?: number
  /** Line height as a multiple of font size, 0.90..2.00. */
  textLineHeight?: number
  /** Overall opacity 0..1, multiplied by any animation opacity. */
  textOpacity?: number
  /** Clockwise rotation in degrees about the anchor, -45..45. */
  textRotation?: number
  /** Outline width (em); 0 disables the outline. */
  textStrokeWidth?: number
  /** Outline colour. */
  textStrokeColor?: string
  /** Outline alpha 0..1. */
  textStrokeOpacity?: number
  /** Drop shadow colour, including its own alpha. */
  textShadowColor?: string
  /** Shadow blur (em); 0 disables the shadow. */
  textShadowBlur?: number
  /** Shadow horizontal offset (em). */
  textShadowOffsetX?: number
  /** Shadow vertical offset (em), positive is downward. */
  textShadowOffsetY?: number
  /** Coloured glow colour, drawn as repeated shadow passes. */
  textGlowColor?: string
  /** Glow blur (em); 0 disables the glow. */
  textGlowBlur?: number
  /** Background pill horizontal padding (em). */
  textBgPaddingX?: number
  /** Background pill vertical padding (em). */
  textBgPaddingY?: number
  /** Background pill corner radius (em). */
  textBgRadius?: number
  /** Background pill alpha 0..1. */
  textBgOpacity?: number
  /** One pill per wrapped line instead of one box around the block. */
  textBgPerLine?: boolean
  /** Word-wrap width as a percentage of frame width, 20..100. */
  textMaxWidth?: number
  /** Which edge of the block attaches to x. */
  textAnchorX?: 'left' | 'center' | 'right'
  /** Which edge of the block attaches to y. */
  textAnchorY?: 'top' | 'middle' | 'bottom'
  /** Entrance animation. */
  textAnimIn?: TextAnimationType
  /** Exit animation. */
  textAnimOut?: TextAnimationType
  /** Entrance duration in seconds, clamped to half the title duration. */
  textAnimInDuration?: number
  /** Exit duration in seconds, clamped to half the title duration. */
  textAnimOutDuration?: number
}

export type OverlayCategory = 'media' | 'vfx' | 'lower-third' | 'color'

export type VfxOverlayType =
  | 'letterbox'
  | 'vignette'
  | 'film-grain'
  | 'light-leak'
  | 'glitch'
  | 'scanlines'
  | 'bokeh'

export type LowerThirdStyle = 'broadcast' | 'minimal' | 'social' | 'breaking-news'

export type BlendMode = 'normal' | 'screen' | 'multiply' | 'overlay' | 'soft-light'

/** In/out motion shared by every overlay category. */
export type OverlayAnimation = 'none' | 'fade' | 'slide-left' | 'slide-up' | 'wipe-right' | 'scale-pop'

/** Mask shape for a picture-in-picture overlay. */
export type OverlayPipShape = 'rect' | 'rounded' | 'circle'

/** Aspect ratio the Cinematic Bars preset crops to. */
export type OverlayLetterboxRatio = '2.39' | '2.35' | '2.00' | '1.85' | '4:3'

/** How a colour wash is distributed across the frame. */
export type OverlayWashShape = 'flat' | 'linear' | 'radial' | 'scrim-bottom' | 'scrim-top'

/** A rich overlay placed on the timeline (Media PiP, VFX, Lower Thirds, or Color Wash). */
export interface OverlayItem {
  id: string
  category: OverlayCategory
  /** Timeline start time in seconds */
  start: number
  /** Duration in seconds */
  duration: number
  /** Overall opacity from 0 to 1 (default 1) */
  opacity?: number
  /** CSS blend mode or canvas globalCompositeOperation (default 'normal') */
  blendMode?: BlendMode

  // Media / Picture-in-Picture (image or video)
  clipId?: string
  /** Center X position in percentage of frame width (0 to 100, default 50) */
  x?: number
  /** Center Y position in percentage of frame height (0 to 100, default 50) */
  y?: number
  /** Width in percentage of frame width (10 to 100, default 30) */
  width?: number
  /** Rounded corners in pixels (default 0) */
  borderRadius?: number
  /** Border stroke color (e.g. '#ffffff' or 'transparent') */
  borderColor?: string
  /** Border stroke width in pixels (default 0) */
  borderWidth?: number

  // Visual FX Atmosphere
  vfxType?: VfxOverlayType
  /** 0 to 1 effect intensity (default 1) */
  intensity?: number

  // Lower Thirds
  lowerThirdStyle?: LowerThirdStyle
  title?: string
  subtitle?: string
  accentColor?: string

  // Color & Gradient Wash
  color?: string
  colorSecondary?: string
  gradientAngle?: number

  // --- Stacking and motion (all categories) ---
  /** Paint order within the lane; higher paints later. */
  overlayZ?: number
  /** Motion over the first overlayAnimInDuration seconds. */
  overlayAnimIn?: OverlayAnimation
  /** Motion over the last overlayAnimOutDuration seconds. */
  overlayAnimOut?: OverlayAnimation
  /** Seconds the in-animation takes; clamped to duration/2. */
  overlayAnimInDuration?: number
  /** Seconds the out-animation takes; clamped to duration/2. */
  overlayAnimOutDuration?: number

  // --- Picture-in-picture ---
  /** Seconds into the PiP source shown when the overlay starts. */
  pipInPoint?: number
  /** Playback-rate multiplier for a PiP video source. */
  pipSpeed?: number
  /** 0..1 gain for a PiP video's own sound; 0 keeps it silent. */
  pipVolume?: number
  /** Mask shape; 'circle' uses radius = min(width, height) / 2. */
  pipShape?: OverlayPipShape
  /** Corner radius as a percentage (0..50) of the PiP's short side. */
  pipRadiusPct?: number
  /** Explicit height as a percentage of frame height; unset keeps the source aspect. */
  pipHeight?: number
  /** How the source fills the box when pipHeight breaks the source aspect. */
  pipFit?: 'cover' | 'contain'
  /** Clockwise rotation in degrees about the PiP centre, -180..180. */
  pipRotation?: number
  /** Mirror the PiP horizontally (selfie footage). */
  pipFlipH?: boolean
  /** Draw a drop shadow behind the PiP. */
  pipShadow?: boolean
  /** Shadow blur in 1080p-reference pixels; scaled by height/1080. */
  pipShadowBlur?: number
  /** Shadow vertical offset in 1080p-reference pixels. */
  pipShadowY?: number
  /** Shadow alpha 0..1. */
  pipShadowOpacity?: number

  // --- Visual FX ---
  /** Ratio the Cinematic Bars preset crops to, using the real output size. */
  vfxLetterboxRatio?: OverlayLetterboxRatio
  /** Fraction of the vignette radius that stays fully clear, 0..0.9. */
  vfxVignetteFeather?: number
  /** 0 follows the frame rectangle, 1 is a perfect circle. */
  vfxVignetteRoundness?: number
  /** Vignette colour; white gives the bloom/halation variant. */
  vfxVignetteColor?: string
  /** Output pixels per noise texel at 1080p: 0.8 fine, 1.4 classic 35mm, 3.0 Super-8. */
  vfxGrainSize?: number
  /** true gives per-channel chroma noise; false is monochrome luma grain. */
  vfxGrainColor?: boolean
  /** Degrees around the frame centre the light leak enters from. */
  vfxLeakAngle?: number
  /** Scanline pitch as a fraction of frame height. */
  vfxScanlinePeriod?: number
  /** Number of floating bokeh discs, 4..48. */
  vfxBokehCount?: number
  /** Maximum horizontal tear bands per glitch burst, 0..6. */
  vfxGlitchSlices?: number

  // --- Colour wash ---
  /** Distribution of the wash across the frame. */
  colorWashShape?: OverlayWashShape
  /** Fraction of frame height a scrim wash covers. */
  colorWashScrimSize?: number

  // --- Lower thirds ---
  /** Multiplier on type and padding sizes, 0.6..1.8. */
  lowerThirdScale?: number
  /** Backdrop blur in 1080p-reference pixels behind the card; 0 disables it. */
  lowerThirdBackdropBlur?: number
}


