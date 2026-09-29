import * as THREE from 'three'

/** Soft mist used only by the first-arrival layer; caller owns the texture. */
export function createCloudTexture() {
  const canvas = document.createElement('canvas')
  canvas.width = 256; canvas.height = 128
  const context = canvas.getContext('2d')!
  for (const [x, y, radius] of [[54, 70, 48], [100, 52, 49], [146, 60, 55], [198, 73, 45]]) {
    const glow = context.createRadialGradient(x, y, 0, x, y, radius)
    glow.addColorStop(0, 'rgba(250, 253, 247, .68)')
    glow.addColorStop(.4, 'rgba(245, 250, 244, .4)')
    glow.addColorStop(1, 'rgba(241, 248, 242, 0)')
    context.fillStyle = glow; context.fillRect(0, 0, 256, 128)
  }
  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  return texture
}
