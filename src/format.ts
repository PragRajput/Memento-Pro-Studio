/** Whole seconds as m:ss, rounded down as media players do. */
export function formatDuration(seconds: number): string {
  if (!Number.isFinite(seconds)) return '--:--'
  const total = Math.floor(seconds)
  const minutes = Math.floor(total / 60)
  return `${minutes}:${String(total % 60).padStart(2, '0')}`
}

/** Seconds as m:ss.t (tenths), for the playhead. */
export function formatTimecode(seconds: number): string {
  const tenths = Math.floor(seconds * 10 + 1e-6)
  const minutes = Math.floor(tenths / 600)
  const wholeSeconds = Math.floor(tenths / 10) % 60
  return `${minutes}:${String(wholeSeconds).padStart(2, '0')}.${tenths % 10}`
}
