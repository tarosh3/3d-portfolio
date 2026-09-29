const assert = require('node:assert/strict')
const THREE = require('three')
const { sourceModule, loadGeometry } = require('./island-geometry.cjs')
const { createArtifactBeacon } = sourceModule('artifact-beacon')
const { createCameraGuard } = sourceModule('camera-path')
const { areaById, cameraFov, cameraScale } = sourceModule('island-data')

const camera = new THREE.PerspectiveCamera(50, 390 / 844, .1, 260)
camera.position.set(0, 4, 8); camera.lookAt(0, 3, 0); camera.updateMatrixWorld(true)
const point = new THREE.Vector3(0, 3, 0)
let checks = 0, clear = true
const guard = { clear(from, to, margin) {
  checks++
  assert.equal(margin, 0, 'do not extend the visibility ray into the table or wall')
  return clear
} }
const cue = createArtifactBeacon(), first = cue.state
const update = (active = true, reduced = false) => cue.update(camera, point, 390, 844, active, reduced, 1 / 60, guard, true)
assert.equal(update().visible, true)
assert.ok(first.opacity > 0 && first.opacity < .84, 'reveal must ease in')
const originalProject = THREE.Vector3.prototype.clone
THREE.Vector3.prototype.clone = () => { throw Error('allocated a vector in the frame loop') }
try { for (let i = 0; i < 120; i++) assert.equal(update(), first, 'frame result must be reused') }
finally { THREE.Vector3.prototype.clone = originalProject }
assert.ok(checks <= 18, `visibility raycast every frame (${checks} checks)`) 
const view = point.clone().applyMatrix4(camera.matrixWorldInverse)
assert.ok(Math.abs(first.scale * camera.projectionMatrix.elements[5] / (-2 * view.z) * 844 - 48) < 1e-8)
assert.equal(first.labelVisible, false, 'phones must not mount floating HTML labels')
clear = false
for (let i = 0; i < 8; i++) update()
assert.equal(first.visible, false, 'occluded invitations must disappear')
clear = true
update(true, true)
assert.equal(first.visible, true, 'a single Still demand frame must update occlusion')
const stillOpacity = first.opacity, stillScale = first.scale
for (let i = 0; i < 90; i++) update(true, true)
assert.equal(first.opacity, stillOpacity); assert.equal(first.scale, stillScale)
update(false)
assert.equal(first.visible, false); assert.equal(first.opacity, 0)
update(true, true)
point.set(0, 4, 20)
assert.equal(update(true, true).visible, false, 'behind-camera cue must not be clickable')
point.set(100, 3, 0)
assert.equal(update(true, true).visible, false, 'offscreen cue must not be clickable')
point.set(0, 3, 0)
assert.equal(cue.update(camera, point, 390, 844, true, true, 0, null, true).visible, false)

// Validate authored surfaces against the real model, including the small gap
// above the original table magazine and notebook tray. No synthetic occluders.
const islandGuard = createCameraGuard(loadGeometry())
const anchors = [
  ['veranda', new THREE.Vector3(-1.025, 3.145, .083)],
  ['deck', new THREE.Vector3(-1.293, 3.155, -6.724)],
  ['pier', new THREE.Vector3(7.346, 2.95, 1.525)],
  ['lagoon', new THREE.Vector3(0, 0, .06).applyEuler(new THREE.Euler(-Math.PI / 2, 0, .12)).add(new THREE.Vector3(8.20, 2.40, .90))],
  ['west', new THREE.Vector3(0, 0, .06).applyEuler(new THREE.Euler(0, -2, 0)).add(new THREE.Vector3(-7.30, 3.96, -2.22))],
]
const posterBasis = new THREE.Matrix4().compose(new THREE.Vector3(-4.34089, 3.75651, 4.86166), new THREE.Quaternion(-.00305, -.37208, -.03008, .92771), new THREE.Vector3(1, 1, 1))
for (const side of [-1, 1]) anchors.push(['cabin', new THREE.Vector3(side * .56, .02, .06).applyMatrix4(posterBasis)])
const rope = new THREE.CatmullRomCurve3([new THREE.Vector3(1.25336, 4.8, 7.37367), new THREE.Vector3(.8807, 4.65, 8.92868), new THREE.Vector3(.50803, 4.8, 10.48369)])
for (let i = 0; i < 3; i++) anchors.push(['hammock', new THREE.Vector3(0, -.32, .1).applyEuler(new THREE.Euler(0, 1.335, (i - 1) * .022)).add(rope.getPoint(.8 - i * .3))])
let visible = 0
for (const [width, height] of [[1280, 720], [390, 844], [320, 568], [844, 390]]) {
  for (const [areaId, anchor] of anchors) {
    const area = areaById(areaId), aspect = width / height
    const lens = new THREE.PerspectiveCamera(cameraFov(aspect), aspect, .1, 260)
    const target = new THREE.Vector3(...area.target)
    lens.position.fromArray(area.position).sub(target).multiplyScalar(cameraScale(aspect)).add(target)
    lens.lookAt(target); lens.updateMatrixWorld(true)
    assert.ok(islandGuard.clear(lens.position, anchor, 0), `${areaId} invitation hidden by authored geometry at ${width}×${height}`)
    const result = createArtifactBeacon().update(lens, anchor, width, height, true, true, 0, islandGuard, width <= 760 || height <= 500)
    assert.ok(result.visible, `${areaId} invitation conflicts with viewport controls at ${width}×${height}`)
    visible++
  }
}
console.log(`Artifact invitations passed: ${visible} real-model views, fixed 48px targets, bounded raycasts, occlusion, frame reuse, reveal, inactive state and Still`)
