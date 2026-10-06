const assert = require('node:assert/strict')
const THREE = require('three')
const { sourceModule } = require('./island-geometry.cjs')
const { createArtifactHover, isDesktopHover } = sourceModule('artifact-hover')

assert.equal(isDesktopHover('mouse', 0, true), true)
for (const type of ['touch', 'pen', '']) assert.equal(isDesktopHover(type, 0, true), false)
assert.equal(isDesktopHover('mouse', 1, true), false)
assert.equal(isDesktopHover('mouse', 0, false), false)

// Use off-origin, rotated, non-unit-scale parents like the magazine and cards.
const parent = new THREE.Group(), group = new THREE.Group()
parent.rotation.set(.2, -.4, .1); parent.position.set(2, 4, -3)
group.position.set(.2, .4, .1); group.rotation.set(.1, .5, .2); group.scale.set(1.2, .9, 1.1)
parent.add(group)
const paperTexture = new THREE.Texture()
const material = new THREE.MeshStandardMaterial({ color: '#e1d6b7', emissive: '#171008', emissiveIntensity: .4, map: paperTexture })
const page = new THREE.Mesh(new THREE.BoxGeometry(.294, .194, .004), material)
page.position.set(-1.03, 3.1, .09)
page.rotation.set(-Math.PI / 2, .25, .1)
const print = new THREE.Mesh(new THREE.PlaneGeometry(.294, .194), material)
print.position.z = .0026
page.add(print); group.add(page)
const originalScale = group.scale.clone(), originalPosition = group.position.clone()
parent.updateMatrixWorld(true)
const localBounds = new THREE.Box3(), inverse = group.matrixWorld.clone().invert()
for (const mesh of [page, print]) {
  mesh.geometry.computeBoundingBox()
  localBounds.union(mesh.geometry.boundingBox.clone().applyMatrix4(new THREE.Matrix4().multiplyMatrices(inverse, mesh.matrixWorld)))
}
const localCenter = localBounds.getCenter(new THREE.Vector3()), centerBefore = group.localToWorld(localCenter.clone())
let geometryDisposals = 0, textureDisposals = 0, originalDisposals = 0, cloneDisposals = 0
page.geometry.addEventListener('dispose', () => geometryDisposals++)
paperTexture.addEventListener('dispose', () => textureDisposals++)
material.addEventListener('dispose', () => originalDisposals++)
const effect = createArtifactHover(group)
const cloned = page.material
cloned.addEventListener('dispose', () => cloneDisposals++)
assert.notEqual(cloned, material)
assert.equal(print.material, cloned, 'Shared source materials should get one owned clone')
assert.equal(cloned.map, paperTexture, 'Printed texture should remain shared')
const beforeEmissive = material.emissive.clone()

assert.equal(effect.update(true, 1 / 60), true)
assert.ok(group.scale.x > originalScale.x && group.scale.x < originalScale.x * 1.02, 'No quick ease toward 2%')
for (let i = 0; i < 30; i++) effect.update(true, 1 / 60)
assert.ok(Math.abs(group.scale.x / originalScale.x - 1.02) < 1e-8)
parent.updateMatrixWorld(true)
assert.ok(group.localToWorld(localCenter.clone()).distanceTo(centerBefore) < 1e-8, 'Hover moved the artifact off its anchor')
assert.ok(cloned.emissive.r > beforeEmissive.r, 'Missing warm light')
assert.ok(material.emissive.equals(beforeEmissive), 'Mutated shared source material')
assert.ok(page.getObjectByName('Artifact hover glow').visible)
const hull = page.children.find(child => child.name === 'Artifact hover glow')
const flat = print.children.find(child => child.name === 'Artifact hover glow')
assert.equal(hull.children[0].material.side, THREE.BackSide)
assert.equal(flat.children[0].material.side, THREE.DoubleSide)
assert.equal(hull.children[0].geometry, page.geometry)
assert.equal(hull.children[0].material.depthTest, true, 'Glow must remain behind occluders')
const intersections = []
hull.children[0].raycast(new THREE.Raycaster(), intersections)
assert.equal(intersections.length, 0, 'Glow intercepted selection')

// Invitations illuminate all authored surfaces without lifting or resizing the
// prop. Sample after the reveal has settled and cover a complete pulse cycle.
effect.reset()
let idleMin = Infinity, idleMax = 0, idleEmissiveMax = 0
for (let i = 0; i < 240; i++) {
  effect.update(false, 1 / 60, false, true)
  assert.ok(group.scale.equals(originalScale), 'Idle glow resized the artifact')
  assert.ok(group.position.equals(originalPosition), 'Idle glow moved the artifact')
  for (const shell of [hull, flat]) {
    assert.equal(shell.visible, true, 'Idle invitation missed an authored surface')
    for (const layer of shell.children) assert.ok(layer.material.opacity > 0, 'Idle shell is unlit')
  }
  if (i >= 60) {
    idleMin = Math.min(idleMin, hull.children[0].material.opacity)
    idleMax = Math.max(idleMax, hull.children[0].material.opacity)
    idleEmissiveMax = Math.max(idleEmissiveMax, cloned.emissive.r)
  }
}
assert.ok(idleMin > 0, 'An invitation must stay discoverable between beats')
assert.ok(idleMax - idleMin > .04, 'Entire-object light must visibly pulse')
for (let i = 0; i < 40; i++) effect.update(true, 1 / 60, false, true)
assert.ok(hull.children[0].material.opacity > idleMax, 'Hover must brighten the idle glow')
assert.ok(cloned.emissive.r > idleEmissiveMax, 'Hover must warm the entire printed surface')
assert.ok(Math.abs(group.scale.x / originalScale.x - 1.02) < 1e-8)
for (let i = 0; i < 40; i++) effect.update(false, 1 / 60, false, true)
assert.ok(group.scale.equals(originalScale)); assert.ok(group.position.equals(originalPosition))
assert.equal(hull.visible, true, 'Mouseout must preserve the idle invitation')
assert.ok(hull.children[0].material.opacity >= idleMin - .001)

// Frame updates must only mutate cached values. Ban setup APIs while running
// idle and both hover directions; also assert stable resource identities.
const originalTraverse = group.traverse, originalClone = THREE.Vector3.prototype.clone
const originalMaterialClone = THREE.Material.prototype.clone, originalColorClone = THREE.Color.prototype.clone
const materialId = page.material, shellId = hull.children[0]
group.traverse = () => { throw Error('Frame traversal') }
THREE.Vector3.prototype.clone = THREE.Material.prototype.clone = THREE.Color.prototype.clone = () => { throw Error('Frame allocation') }
try {
  for (let i = 0; i < 180; i++) effect.update(false, 1 / 60, false, true)
  for (let i = 0; i < 40; i++) effect.update(true, 1 / 60, false, true)
  for (let i = 0; i < 40; i++) effect.update(false, 1 / 60, false, true)
} finally {
  group.traverse = originalTraverse
  THREE.Vector3.prototype.clone = originalClone
  THREE.Material.prototype.clone = originalMaterialClone
  THREE.Color.prototype.clone = originalColorClone
}
assert.equal(page.material, materialId)
assert.equal(hull.children[0], shellId)
effect.reset()
assert.ok(group.scale.equals(originalScale)); assert.ok(group.position.equals(originalPosition))
assert.equal(hull.visible, false)
assert.ok(cloned.emissive.equals(beforeEmissive))
assert.equal(effect.update(true, 1 / 60, true), false, 'Reduced motion should settle immediately')
assert.ok(Math.abs(group.scale.x / originalScale.x - 1.02) < 1e-8)
assert.equal(effect.update(false, 1 / 60, true, true), false, 'Still invitation must settle in one frame')
const stillOpacity = hull.children[0].material.opacity, stillEmissive = cloned.emissive.clone()
assert.ok(stillOpacity > 0, 'Still must retain a visible invitation')
for (let i = 0; i < 90; i++) {
  assert.equal(effect.update(false, 1 / 60, true, true), false, 'Still requested more frames')
  assert.equal(hull.children[0].material.opacity, stillOpacity)
  assert.ok(cloned.emissive.equals(stillEmissive))
  assert.ok(group.scale.equals(originalScale)); assert.ok(group.position.equals(originalPosition))
}
assert.equal(effect.update(true, 1 / 60, true, true), false)
assert.ok(hull.children[0].material.opacity > stillOpacity)
effect.reset()
assert.equal(hull.visible, false, 'Reset must hide cues before a paused reader')
assert.equal(flat.visible, false)
assert.equal(hull.children[0].material.opacity, 0)
assert.ok(cloned.emissive.equals(beforeEmissive))
assert.equal(effect.update(false, 1 / 60, true, false), false)
assert.equal(hull.visible, false, 'Inactive invitation came back after reset')
effect.dispose()
assert.equal(page.material, material)
assert.equal(print.material, material)
assert.equal(group.getObjectByName('Artifact hover glow'), undefined)
assert.ok(group.scale.equals(originalScale)); assert.ok(group.position.equals(originalPosition))
assert.equal(geometryDisposals + textureDisposals + originalDisposals, 0, 'Disposed borrowed resources')
assert.equal(cloneDisposals, 1)
// React StrictMode remounts and pointer-capability changes must be reversible.
const again = createArtifactHover(group)
again.update(true, .02); again.dispose()
assert.equal(page.material, material)
assert.ok(group.position.equals(originalPosition))

// Phones retain the idle affordance with fewer draws; touch hover is already
// rejected by the input policy above. Frame updates still reuse every resource.
const mobileEffect = createArtifactHover(group, true)
const mobileHull = page.children.find(child => child.name === 'Artifact hover glow')
const mobileFlat = print.children.find(child => child.name === 'Artifact hover glow')
assert.equal(mobileHull.children.length, 2); assert.equal(mobileFlat.children.length, 2)
const mobileMaterial = page.material, mobileShell = mobileHull.children[0]
group.traverse = () => { throw Error('Mobile frame traversal') }
THREE.Vector3.prototype.clone = THREE.Material.prototype.clone = THREE.Color.prototype.clone = () => { throw Error('Mobile frame allocation') }
let mobileMin = Infinity, mobileMax = 0
try {
  for (let i = 0; i < 240; i++) {
    mobileEffect.update(false, 1 / 60, false, true)
    assert.ok(group.scale.equals(originalScale)); assert.ok(group.position.equals(originalPosition))
    if (i >= 60) {
      mobileMin = Math.min(mobileMin, mobileShell.material.opacity)
      mobileMax = Math.max(mobileMax, mobileShell.material.opacity)
    }
  }
} finally {
  group.traverse = originalTraverse
  THREE.Vector3.prototype.clone = originalClone
  THREE.Material.prototype.clone = originalMaterialClone
  THREE.Color.prototype.clone = originalColorClone
}
assert.ok(mobileMin > 0 && mobileMax - mobileMin > .04, 'Mobile idle light must pulse')
assert.equal(page.material, mobileMaterial); assert.equal(mobileHull.children[0], mobileShell)
mobileEffect.dispose()
assert.equal(page.material, material); assert.equal(print.material, material)
assert.equal(group.getObjectByName('Artifact hover glow'), undefined)
assert.equal(geometryDisposals + textureDisposals + originalDisposals, 0)
console.log('Artifact glow passed: full-object idle pulse, stronger desktop hover, fixed idle footprint, 2% anchored ease, mobile shell budget, allocation-free frames, Still and resource cleanup')
