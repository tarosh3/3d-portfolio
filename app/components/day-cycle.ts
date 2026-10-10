import * as THREE from 'three'

export const DAY_HORIZON = new THREE.Color('#a6c2c1')
export const DUSK_HORIZON = new THREE.Color('#1c3048')
export const DAY_CYCLE_SECONDS = 2

/** A single active-time transition shared by every atmosphere consumer. */
export function createDayCycle() {
  let from = 0, elapsed = 0, duration = DAY_CYCLE_SECONDS
  const cycle = {
    value: 0,
    target: 0,
    horizon: DAY_HORIZON.clone(),
    setTarget(dusk: boolean, reduced: boolean) {
      const target = dusk ? 1 : 0
      if (target !== cycle.target) {
        from = cycle.value; elapsed = 0
        duration = DAY_CYCLE_SECONDS * Math.abs(target - from)
        cycle.target = target
      }
      if (reduced) cycle.value = target
      cycle.horizon.lerpColors(DAY_HORIZON, DUSK_HORIZON, cycle.value)
    },
    update(delta: number, reduced: boolean, paused: boolean) {
      if (reduced) cycle.value = cycle.target
      else if (!paused && Number.isFinite(delta) && delta > 0 && cycle.value !== cycle.target) {
        elapsed += Math.min(delta, .05)
        const t = Math.min(1, elapsed / Math.max(duration, .001))
        cycle.value = THREE.MathUtils.lerp(from, cycle.target, t * t * (3 - 2 * t))
      }
      cycle.horizon.lerpColors(DAY_HORIZON, DUSK_HORIZON, cycle.value)
    },
  }
  return cycle
}
export type DayCycle = ReturnType<typeof createDayCycle>
