const assert = require('node:assert/strict')
const THREE = require('three')
const { loadGeometry, sourceModule } = require('./island-geometry.cjs')
const { fitIslandShadow, castsIslandShadow, createPhoneShadowBudget } = sourceModule('island-rendering')

const model = loadGeometry()
const light = new THREE.DirectionalLight()
light.position.set(8, 22, 15)
const original = model.children.map(object => object.matrixWorld.clone())
fitIslandShadow(light, model)
light.shadow.updateMatrices(light)
const camera = light.shadow.camera
const projection = new THREE.Matrix4().multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse)
const point = new THREE.Vector3()
let vertices = 0, casters = 0
model.children.forEach((mesh, index) => {
  assert.ok(mesh.matrixWorld.equals(original[index]), 'fitting shadows must not move the model')
  if (castsIslandShadow(mesh.name)) casters++
  const positions = mesh.geometry.getAttribute('position')
  for (let i = 0; i < positions.count; i++) {
    point.fromBufferAttribute(positions, i).applyMatrix4(mesh.matrixWorld).applyMatrix4(projection)
    assert.ok(Math.max(Math.abs(point.x), Math.abs(point.y), Math.abs(point.z)) < 1, `shadow frustum clips ${mesh.name}`)
    vertices++
  }
})
assert.ok(camera.right - camera.left < 45 && camera.top - camera.bottom < 40, 'fit the island, not the 420-unit ocean')
assert.ok(camera.far - camera.near < 40)
for (const name of ['House_M_Floor_0', 'Changing_Cabin_M_PlanksWall_0', 'Pier_M_Pier_0', 'polySurface136_M_PalmTreeLeaves_0', 'polySurface174_M_PalmTree_0']) assert.ok(castsIslandShadow(name), name)
for (const name of ['Water_M_Water_0', 'Fish1_M_Fish_0', 'SeaWeed_M_SeaWeed_0', 'Footprint_Decals_M_Decals_0']) assert.ok(!castsIslandShadow(name), name)

const sampleFor = (budget, fps, seconds) => {
  let disabled = false
  for (let i = 0; i < fps * seconds; i++) disabled = budget.sample(1 / fps) || disabled
  return disabled
}
assert.equal(sampleFor(createPhoneShadowBudget(), 60, 20), false, 'healthy phone keeps shadows')
assert.equal(sampleFor(createPhoneShadowBudget(), 50, 20), false, 'a near-smooth phone keeps shadows')
assert.equal(sampleFor(createPhoneShadowBudget(), 40, 6), true, 'sustained 40fps reduces rendering cost before it feels badly stalled')
assert.equal(sampleFor(createPhoneShadowBudget(), 30, 6), true, 'sustained 30fps triggers cheaper rendering')
assert.equal(sampleFor(createPhoneShadowBudget(), 20, 3), false, 'allow warmup and more than one slow interval')
const recovering = createPhoneShadowBudget()
sampleFor(recovering, 20, 3.6)
assert.equal(sampleFor(recovering, 60, 8), false, 'one slow window must recover')
recovering.reset()
assert.equal(sampleFor(recovering, 20, 3), false, 'reader/visibility pause resets timing')
recovering.sample(10)
assert.equal(sampleFor(recovering, 20, 3), false, 'tab resume and loading hitches do not trip the budget')
assert.equal(recovering.sample(NaN), false)
assert.equal(sampleFor(createPhoneShadowBudget(), 2, 2), true, 'consecutive severe stalls must also disable shadows')
console.log(`Shadow frustum contains ${vertices.toLocaleString()} model vertices; ${casters} authored casters. Phone timing checks passed.`)
