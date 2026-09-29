import * as THREE from 'three'

/** The ocean and underwater/flat decal meshes must not fill the shadow map. */
export function castsIslandShadow(name: string) {
  return /_M_PalmTree(?:Leaves)?_0$/.test(name) || /^(House_|Changing_Cabin_|Pier_|Sofa_|Sunbed|BeachUmbrella|Hammock_|Torch|Mountinbike|Rocks_|BurnedCampfire)/.test(name)
}

/** Fit once in light space, independent of the visitor's camera and the ocean plane. */
export function fitIslandShadow(light: THREE.DirectionalLight, model: THREE.Object3D) {
  const bounds = new THREE.Box3().setFromObject(model, true)
  if (bounds.isEmpty()) return
  bounds.getCenter(light.target.position)
  light.target.updateMatrixWorld(true)
  light.updateMatrixWorld(true)
  light.shadow.updateMatrices(light)
  const camera = light.shadow.camera
  const lightBounds = new THREE.Box3()
  const point = new THREE.Vector3()
  for (let i = 0; i < 8; i++) {
    point.set(i & 1 ? bounds.max.x : bounds.min.x, i & 2 ? bounds.max.y : bounds.min.y, i & 4 ? bounds.max.z : bounds.min.z)
    lightBounds.expandByPoint(point.applyMatrix4(camera.matrixWorldInverse))
  }
  // Allow small palm gusts and the physical prints beyond their static surfaces.
  const padding = .8
  camera.left = lightBounds.min.x - padding
  camera.right = lightBounds.max.x + padding
  camera.bottom = lightBounds.min.y - padding
  camera.top = lightBounds.max.y + padding
  camera.near = Math.max(.1, -lightBounds.max.z - padding)
  camera.far = -lightBounds.min.z + padding
  camera.updateProjectionMatrix()
  light.shadow.needsUpdate = true
}

/** Latched by the caller: sustained slow frames, not one shader/loading hitch. */
export function createPhoneShadowBudget() {
  let warmup = 0, elapsed = 0, frames = 0, slowWindows = 0, stalledFrames = 0
  return {
    reset() { warmup = 0; elapsed = 0; frames = 0; slowWindows = 0; stalledFrames = 0 },
    sample(delta: number) {
      if (!Number.isFinite(delta) || delta <= 0) return false
      if (delta > .25) {
        // One loading/tab hitch is harmless; consecutive stalls must not keep
        // resetting the budget forever on a genuinely overwhelmed phone.
        warmup = 0; elapsed = 0; frames = 0; slowWindows = 0
        return ++stalledFrames >= 3
      }
      stalledFrames = 0
      if (warmup < 2) { warmup += delta; return false }
      elapsed += delta
      frames++
      if (elapsed < 1.5) return false
      // A sustained sub-45fps phone benefits from the cheaper shadow-free pass.
      // Keep two windows so a single route calculation never changes quality.
      slowWindows = elapsed / frames > .022 ? slowWindows + 1 : 0
      elapsed = 0
      frames = 0
      return slowWindows >= 2
    },
  }
}
