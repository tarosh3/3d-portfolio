import * as THREE from 'three'
import type { CameraGuard } from './camera-path'

export const ARRIVAL_SECONDS = 3.5
export const ARRIVAL_SESSION_KEY = 'island-arrival-seen'
export const STILL_SESSION_KEY = 'island-still'
export type ArrivalPhase = 'pending' | 'playing' | 'done'

// Storage can be unavailable in private/embedded browsing. The mounted scene
// still owns a one-shot state, so a storage failure never blocks exploration.
export function sessionFlag(key: string) {
  try { return window.sessionStorage.getItem(key) === '1' } catch { return false }
}
export function setSessionFlag(key: string, value = true) {
  try { window.sessionStorage.setItem(key, value ? '1' : '0') } catch { /* Optional persistence. */ }
}
export function shouldPlayArrival(reduced: boolean, still: boolean, seen: boolean) {
  return !reduced && !still && !seen
}

export function arrivalRoute(guard: CameraGuard, destination: THREE.Vector3, target: THREE.Vector3) {
  const origin = target.clone().lerp(destination, .52)
  origin.y = Math.max(72, destination.y + 50)
  // The same corridor checks and rounded routes used between areas protect
  // the descent. An unavailable route means skip, never fly through the model.
  return guard.route(origin, destination)
}
