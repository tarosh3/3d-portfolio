import * as THREE from 'three'

type Occluder = { clear: (from: THREE.Vector3, to: THREE.Vector3, margin: number) => boolean }

/** Cached projection, bounded visibility checks, for invisible generous hit targets. */
export function createArtifactBeacon() {
  const projected = new THREE.Vector3(), view = new THREE.Vector3()
  let sinceCheck = 1, wasActive = false, clear = false
  const state = { visible: false, labelVisible: false, scale: 0 }
  const reset = () => {
    state.visible = state.labelVisible = false
    sinceCheck = 1; wasActive = false
  }
  return {
    state,
    reset,
    update(camera: THREE.Camera, world: THREE.Vector3, width: number, height: number, active: boolean, reduced: boolean, delta: number, guard: Occluder | null, mobile: boolean) {
      if (!active || !guard || width <= 0 || height <= 0) {
        reset()
        return state
      }
      const dt = Math.min(Math.max(delta, 0), .05)
      sinceCheck += dt
      view.copy(world).applyMatrix4(camera.matrixWorldInverse)
      projected.copy(world).project(camera)
      const x = (projected.x + 1) * width / 2, y = (1 - projected.y) * height / 2
      const inView = view.z < 0 && projected.z > -1 && projected.z < 1 && x > 30 && x < width - 30 && y > (mobile ? 116 : 125) && y < height - (mobile ? 145 : 150)
      // Still can have a single demand frame after an orbit or resize. Check
      // that frame immediately; animated scenes need at most nine rays/sec.
      if (inView && (!wasActive || reduced || sinceCheck >= .12)) {
        clear = guard.clear(camera.position, world, 0)
        sinceCheck = 0
      }
      wasActive = true
      state.visible = inView && clear
      state.labelVisible = state.visible && !mobile && x > 110 && x < width - 110 && y > 175
      // Projection depth, not distance, keeps the target 48px wide on phones
      // as the camera orbits, changes its lens, or the browser toolbar resizes.
      state.scale = (mobile ? 48 : 52) * 2 * -view.z / (height * camera.projectionMatrix.elements[5])
      return state
    },
  }
}
