import * as THREE from 'three'

const WARM = new THREE.Color('#ffd69a')
const NO_RAYCAST = () => {}
const LAYERS = [
  { scale: 1.025, opacity: .2 },
  { scale: 1.055, opacity: .085 },
  { scale: 1.09, opacity: .035 },
]

export function isDesktopHover(pointerType: string, buttons: number, capable: boolean) {
  return capable && pointerType === 'mouse' && buttons === 0
}

/** Own only the highlight materials; geometry and print textures stay shared. */
export function createArtifactHover(root: THREE.Group) {
  const basePosition = root.position.clone(), baseScale = root.scale.clone()
  const inverse = new THREE.Matrix4(), transform = new THREE.Matrix4()
  const bounds = new THREE.Box3(), box = new THREE.Box3(), center = new THREE.Vector3(), size = new THREE.Vector3()
  const originals: { mesh: THREE.Mesh; material: THREE.Material | THREE.Material[] }[] = []
  const emissives: { material: THREE.MeshStandardMaterial; color: THREE.Color; intensity: number }[] = []
  const clones = new Map<THREE.Material, THREE.Material>()
  const shells: THREE.Group[] = []
  const glowMaterials: { material: THREE.MeshBasicMaterial; opacity: number }[] = []
  const materials = [THREE.BackSide, THREE.DoubleSide].map(side => LAYERS.map(layer => {
    const material = new THREE.MeshBasicMaterial({ color: WARM, side, transparent: true, opacity: 0, depthWrite: false, depthTest: true, blending: THREE.AdditiveBlending, toneMapped: false, polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 1 })
    material.forceSinglePass = true
    glowMaterials.push({ material, opacity: layer.opacity })
    return material
  }))
  root.updateWorldMatrix(true, true)
  inverse.copy(root.matrixWorld).invert()
  // Snapshot before adding shells; include authored child offsets, notably
  // the magazine's world-positioned pages and the notebook's tiny index tabs.
  root.traverse(object => {
    if (!(object instanceof THREE.Mesh)) return
    originals.push({ mesh: object, material: object.material })
    if (!object.geometry.boundingBox) object.geometry.computeBoundingBox()
    transform.multiplyMatrices(inverse, object.matrixWorld)
    bounds.union(box.copy(object.geometry.boundingBox!).applyMatrix4(transform))
  })
  const pivot = bounds.isEmpty() ? new THREE.Vector3() : bounds.getCenter(new THREE.Vector3()).multiply(baseScale).applyQuaternion(root.quaternion)
  const ownMaterial = (original: THREE.Material) => {
    if (!(original instanceof THREE.MeshStandardMaterial)) return original
    let owned = clones.get(original)
    if (!owned) {
      owned = original.clone()
      clones.set(original, owned)
      emissives.push({ material: owned as THREE.MeshStandardMaterial, color: original.emissive.clone(), intensity: original.emissiveIntensity })
    }
    return owned
  }
  for (const { mesh, material } of originals) {
    mesh.material = Array.isArray(material) ? material.map(ownMaterial) : ownMaterial(material)
    mesh.geometry.boundingBox!.getCenter(center)
    mesh.geometry.boundingBox!.getSize(size)
    // Flat prints need a double-sided, depth-offset rim. Solid props use an
    // inverted hull so their front faces don't acquire a translucent coating.
    const flat = Math.min(size.x, size.y, size.z) < 1e-6
    const shell = new THREE.Group()
    shell.name = 'Artifact hover glow'
    shell.visible = false
    for (let i = 0; i < LAYERS.length; i++) {
      const glow = new THREE.Mesh(mesh.geometry, materials[flat ? 1 : 0][i])
      glow.scale.setScalar(LAYERS[i].scale)
      glow.position.copy(center).multiplyScalar(1 - LAYERS[i].scale)
      glow.raycast = NO_RAYCAST
      glow.matrixAutoUpdate = false
      glow.updateMatrix()
      shell.add(glow)
    }
    mesh.add(shell); shells.push(shell)
  }

  let amount = 0
  const apply = (value: number) => {
    amount = value
    const scale = 1 + .02 * value
    root.scale.copy(baseScale).multiplyScalar(scale)
    root.position.copy(basePosition).addScaledVector(pivot, 1 - scale)
    for (let i = 0; i < emissives.length; i++) {
      const entry = emissives[i]
      entry.material.emissive.copy(entry.color).lerp(WARM, value * .045)
      entry.material.emissiveIntensity = THREE.MathUtils.lerp(entry.intensity, Math.max(.8, entry.intensity), value)
    }
    for (let i = 0; i < glowMaterials.length; i++) glowMaterials[i].material.opacity = glowMaterials[i].opacity * value
    for (let i = 0; i < shells.length; i++) shells[i].visible = value > 0
  }
  return {
    // No traversal, new objects, arrays, closures, or material swaps in frames.
    update(hovered: boolean, delta: number, reduced = false) {
      const target = hovered ? 1 : 0
      if (amount === target) return false
      const next = reduced ? target : THREE.MathUtils.damp(amount, target, 24, Math.min(delta, .05))
      apply(Math.abs(next - target) < .001 ? target : next)
      return amount !== target
    },
    reset() { if (amount) apply(0) },
    dispose() {
      apply(0)
      for (const { mesh, material } of originals) mesh.material = material
      for (const shell of shells) shell.removeFromParent()
      clones.forEach(material => material.dispose())
      for (const entry of glowMaterials) entry.material.dispose()
    },
  }
}
