export type IslandLoadProgress = {
  progress: number; active: boolean; errors: string[]; total: number; loaded: number
}
export const EMPTY_LOAD_PROGRESS: IslandLoadProgress = { progress: 0, active: false, errors: [], total: 0, loaded: 0 }
export const LOADER_EXIT_MS = 900
export const LOADER_SETTLE_MS = 1000

/** LoadingManager can discover a new batch after reporting 100%. Keep the
 * current stage truthful instead of inferring renderer readiness from percent. */
export function loadingPhase(progress: IslandLoadProgress, ready: boolean, error: boolean) {
  if (error) return 'error'
  if (ready) return 'ready'
  if (progress.total > 0 && !progress.active && progress.loaded >= progress.total) return 'finishing'
  return 'loading'
}

/** Asset totals can change as textures are discovered. The visual bar never
 * retreats, and cannot finish until the actual renderer/font gate is ready. */
export function loadingTarget(previous: number, progress: number, ready: boolean) {
  const assets = Number.isFinite(progress) ? Math.max(0, Math.min(100, progress)) : 0
  return Math.max(previous, ready ? 1 : assets * .009)
}
