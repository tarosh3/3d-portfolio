import * as THREE from 'three'

const WARM = new THREE.Color('#ffd69a')
const NO_RAYCAST = () => {}
const LAYERS = [
  { scale: 1.025, opacity: .30 },
  { scale: 1.055, opacity: .14 },
  { scale: 1.09, opacity: .055 },
]

export function isDesktopHover(pointerType: string, buttons: number, capable: boolean) {
  return capable && pointerType === 'mouse' && buttons === 0
}

/** Own only the highlight materials; geometry and print textures stay shared. */
export function createArtifactHover(root: THREE.Group, mobile = false) {
  const layers = mobile ? LAYERS.slice(0, 2) : LAYERS
  const basePosition = root.position.clone(), baseScale = root.scale.clone()
  const inverse = new THREE.Matrix4(), transform = new THREE.Matrix4()
  const bounds = new THREE.Box3(), box = new THREE.Box3(), center = new THREE.Vector3(), size = new THREE.Vector3()
  const originals: { mesh: THREE.Mesh; material: THREE.Material | THREE.Material[] }[] = []
  const emissives: { material: THREE.MeshStandardMaterial; color: THREE.Color; intensity: number }[] = []
  const clones = new Map<THREE.Material, THREE.Material>()
  const shells: THREE.Group[] = []
  const glowMaterials: { material: THREE.MeshBasicMaterial; opacity: number }[] = []
  const materials = [THREE.BackSide, THREE.DoubleSide].map(side => layers.map(layer => {
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
    // Compile the transparent shell materials beneath the loader, too.
    // Frame updates hide inactive shells after the preparation pass.
    for (let i = 0; i < layers.length; i++) {
      const glow = new THREE.Mesh(mesh.geometry, materials[flat ? 1 : 0][i])
      glow.scale.setScalar(layers[i].scale)
      glow.position.copy(center).multiplyScalar(1 - layers[i].scale)
      glow.raycast = NO_RAYCAST
      glow.matrixAutoUpdate = false
      glow.updateMatrix()
      shell.add(glow)
    }
    mesh.add(shell); shells.push(shell)
  }

  let amount = 0, invitation = 0, elapsed = 0, hasRendered = false
  const apply = (value: number, light: number) => {
    amount = value
    const scale = 1 + .02 * value
    root.scale.copy(baseScale).multiplyScalar(scale)
    root.position.copy(basePosition).addScaledVector(pivot, 1 - scale)
    for (let i = 0; i < emissives.length; i++) {
      const entry = emissives[i]
      entry.material.emissive.copy(entry.color).lerp(WARM, Math.min(1.8, light) * .055)
      entry.material.emissiveIntensity = THREE.MathUtils.lerp(entry.intensity, Math.max(.8, entry.intensity), Math.min(1, light))
    }
    for (let i = 0; i < glowMaterials.length; i++) glowMaterials[i].material.opacity = glowMaterials[i].opacity * light
    for (let i = 0; i < shells.length; i++) shells[i].visible = light > 0
  }
  return {
    // No traversal, new objects, arrays, closures, or material swaps in frames.
    update(hovered: boolean, delta: number, reduced = false, invited = false) {
      hasRendered = true
      const target = hovered ? 1 : 0
      const dt = Math.min(Math.max(delta, 0), .05)
      if (invited && !reduced) elapsed += dt
      invitation = reduced ? Number(invited) : THREE.MathUtils.damp(invitation, Number(invited), 14, dt)
      if (Math.abs(invitation - Number(invited)) < .001) invitation = Number(invited)
      const breath = reduced ? .5 : (1 - Math.cos(elapsed * Math.PI * 2 / 2.8)) / 2
      const next = reduced ? target : THREE.MathUtils.damp(amount, target, 24, dt)
      const hover = Math.abs(next - target) < .001 ? target : next
      // Light follows the entire artifact. Only deliberate desktop hover
      // scales the object; the idle pulse never changes its physical footprint.
      const idle = invitation * (.9 + .65 * breath)
      apply(hover, idle + hover * (1 + .1 * invitation))
      return amount !== target
    },
    reset() {
      invitation = elapsed = 0; apply(0, 0)
      if (!hasRendered) for (const shell of shells) shell.visible = true
    },
    dispose() {
      apply(0, 0)
      for (const { mesh, material } of originals) mesh.material = material
      for (const shell of shells) shell.removeFromParent()
      clones.forEach(material => material.dispose())
      for (const entry of glowMaterials) entry.material.dispose()
    },
  }
}
