import type { FilterType, TimelineItem } from './types.ts'

export interface FilterPreset {
  id: FilterType
  name: string
  description: string
  icon: string
  cssFilter: (intensity: number) => string
}

export const FILTER_PRESETS: readonly FilterPreset[] = [
  {
    id: 'none',
    name: 'Normal',
    description: 'Original footage colors',
    icon: '✨',
    cssFilter: () => 'none',
  },
  {
    id: 'cinematic',
    name: 'Cinematic',
    description: 'Teal & Orange punch with filmic contrast',
    icon: '🎬',
    cssFilter: (i) => `contrast(${1 + 0.22 * i}) saturate(${1 + 0.28 * i}) hue-rotate(${-10 * i}deg)`,
  },
  {
    id: 'noir',
    name: 'Noir B&W',
    description: 'High-contrast monochrome classic',
    icon: '🎞️',
    cssFilter: (i) => `grayscale(${i}) contrast(${1 + 0.35 * i}) brightness(${1 - 0.05 * i})`,
  },
  {
    id: 'vintage',
    name: 'Vintage 70s',
    description: 'Warm nostalgic retro film print',
    icon: '📻',
    cssFilter: (i) => `sepia(${0.38 * i}) contrast(${1 + 0.12 * i}) brightness(${1 + 0.04 * i}) saturate(${1 + 0.15 * i})`,
  },
  {
    id: 'warm',
    name: 'Golden Hour',
    description: 'Warm glowing sunlight tones',
    icon: '🌅',
    cssFilter: (i) => `sepia(${0.25 * i}) saturate(${1 + 0.35 * i}) brightness(${1 + 0.05 * i})`,
  },
  {
    id: 'cool',
    name: 'Nordic Frost',
    description: 'Icy cold Scandinavian atmosphere',
    icon: '❄️',
    cssFilter: (i) => `hue-rotate(${175 * i}deg) saturate(${1 - 0.2 * i}) contrast(${1 + 0.1 * i})`,
  },
  {
    id: 'cyberpunk',
    name: 'Cyberpunk',
    description: 'Electric neon purple & cyan punch',
    icon: '🌆',
    cssFilter: (i) => `contrast(${1 + 0.3 * i}) saturate(${1 + 0.65 * i}) hue-rotate(${45 * i}deg)`,
  },
  {
    id: 'vivid',
    name: 'Vivid Pop',
    description: 'Lush colors for nature & landscapes',
    icon: '🌺',
    cssFilter: (i) => `saturate(${1 + 0.7 * i}) contrast(${1 + 0.12 * i})`,
  },
  {
    id: 'sepia',
    name: 'Sepia Antique',
    description: 'Parchment and early 20th century photograph',
    icon: '📜',
    cssFilter: (i) => `sepia(${0.85 * i}) contrast(${1 + 0.1 * i})`,
  },
  {
    id: 'bleach',
    name: 'Bleach Bypass',
    description: 'Gritty action movie silver retention',
    icon: '⚔️',
    cssFilter: (i) => `contrast(${1 + 0.45 * i}) saturate(${1 - 0.45 * i}) brightness(${1 + 0.08 * i})`,
  },
]

/** Build CSS filter string for live video/image elements. */
export function getCssFilter(type?: FilterType, intensity = 1): string {
  if (!type || type === 'none') return 'none'
  const clamped = Math.max(0, Math.min(1, intensity))
  if (clamped <= 0.001) return 'none'
  const preset = FILTER_PRESETS.find((p) => p.id === type)
  if (!preset) return 'none'
  return preset.cssFilter(clamped)
}

/** Build CSS transform string for clip rotation and mirroring. */
export function getClipTransform(item?: TimelineItem | null): string {
  if (!item) return 'none'
  const parts: string[] = []
  if (item.rotation) parts.push(`rotate(${item.rotation}deg)`)
  if (item.flipH) parts.push('scaleX(-1)')
  if (item.flipV) parts.push('scaleY(-1)')
  return parts.length > 0 ? parts.join(' ') : 'none'
}
