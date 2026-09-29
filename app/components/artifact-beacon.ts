import * as THREE from 'three'

type Occluder = { clear: (from: THREE.Vector3, to: THREE.Vector3, margin: number) => boolean }

/** Cached projection, bounded visibility checks, and a quiet breathing cue. */
export function createArtifactBeacon() {
  const projected = new THREE.Vector3(), view = new THREE.Vector3()
  let elapsed = 0, sinceCheck = 1, wasActive = false, clear = false
  const state = { visible: false, labelVisible: false, scale: 0, opacity: 0 }
  const reset = () => {
    state.visible = state.labelVisible = false
    state.opacity = 0
    elapsed = 0; sinceCheck = 1; wasActive = false
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
      if (!reduced) elapsed += dt
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
      const breath = reduced ? 0 : (1 - Math.cos(elapsed * Math.PI * 2 / 3.4)) / 2
      // Projection depth, not distance, keeps the target 48px wide on phones
      // as the camera orbits, changes its lens, or the browser toolbar resizes.
      state.scale = (mobile ? 48 : 52) * 2 * -view.z / (height * camera.projectionMatrix.elements[5])
      const reveal = reduced ? 1 : 1 - Math.pow(1 - Math.min(1, elapsed / .24), 3)
      state.opacity = (.84 + breath * .16) * reveal
      return state
    },
  }
}

/** One tiny texture, shared by every invitation and uploaded under the loader. */
export function makeBeaconTexture() {
  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = 128
  const ctx = canvas.getContext('2d')!
  const halo = ctx.createRadialGradient(64, 64, 21, 64, 64, 63)
  halo.addColorStop(0, 'rgba(237,190,122,.56)')
  halo.addColorStop(.5, 'rgba(237,190,122,.19)')
  halo.addColorStop(1, 'rgba(237,190,122,0)')
  ctx.fillStyle = halo; ctx.fillRect(0, 0, 128, 128)
  ctx.beginPath(); ctx.arc(64, 64, 38, 0, Math.PI * 2)
  ctx.strokeStyle = 'rgba(245,239,217,.62)'; ctx.lineWidth = 1.8; ctx.stroke()
  ctx.beginPath(); ctx.arc(64, 64, 25, 0, Math.PI * 2)
  ctx.fillStyle = '#213d36'; ctx.fill()
  ctx.strokeStyle = '#edbe7a'; ctx.lineWidth = 3; ctx.stroke()
  ctx.beginPath(); ctx.moveTo(54, 64); ctx.lineTo(74, 64); ctx.moveTo(64, 54); ctx.lineTo(64, 74)
  ctx.strokeStyle = '#f5efd9'; ctx.lineWidth = 3.5; ctx.lineCap = 'round'; ctx.stroke()
  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  return texture
}
