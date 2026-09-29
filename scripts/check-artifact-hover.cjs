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

// Frame updates must only mutate cached values. Ban setup APIs while running
// both directions; also assert stable geometry/material/tree identities.
const originalTraverse = group.traverse, originalClone = THREE.Vector3.prototype.clone
const originalMaterialClone = THREE.Material.prototype.clone, originalColorClone = THREE.Color.prototype.clone
const materialId = page.material, shellId = hull.children[0]
group.traverse = () => { throw Error('Frame traversal') }
THREE.Vector3.prototype.clone = THREE.Material.prototype.clone = THREE.Color.prototype.clone = () => { throw Error('Frame allocation') }
try {
  for (let i = 0; i < 40; i++) effect.update(false, 1 / 60)
  for (let i = 0; i < 40; i++) effect.update(true, 1 / 60)
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
console.log('Artifact hover passed: desktop gating, 2% ease, anchored pivot, warm glow, raycast exclusion, stable frame resources, reduced motion and cleanup')
