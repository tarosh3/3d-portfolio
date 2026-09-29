const assert = require('node:assert/strict')
const THREE = require('three')
const { sourceModule, loadGeometry } = require('./island-geometry.cjs')
const { bakeWaterDepth, WATER_LEVEL, DEPTH_MIN, DEPTH_RANGE } = sourceModule('water-depth')
const { createIslandWater, attachSandCaustics } = sourceModule('island-water')
const model = loadGeometry()
const originals = model.children.map(mesh => ({ matrix: mesh.matrixWorld.clone(), positions: mesh.geometry.attributes.position.array.slice() }))
const baked = bakeWaterDepth(model)
const { data, width: size } = baked.texture.image
const cell = baked.bounds.z / size
const terrain = model.children.filter(mesh => /^(Groundplane_|Rocks_)/.test(mesh.name))
const ray = new THREE.Raycaster(new THREE.Vector3(), new THREE.Vector3(0, -1, 0))
let checked = 0
// Independent downward rays validate the baked heights against actual triangles.
for (let z = 8; z < size - 8; z += 7) for (let x = 8; x < size - 8; x += 7) {
  const i = (z * size + x) * 4
  if (!data[i + 2]) continue
  ray.ray.origin.set(baked.bounds.x + (x + .5) * cell, 10, baked.bounds.y + (z + .5) * cell)
  const hit = ray.intersectObjects(terrain, false)[0]
  assert.ok(hit, 'visible seabed must exist under transparent water')
  const height = data[i] / 255 * DEPTH_RANGE + DEPTH_MIN
  assert.ok(Math.abs(height - hit.point.y) <= DEPTH_RANGE / 255, `height mismatch at ${x},${z}`)
  if (Math.abs(hit.point.y - WATER_LEVEL) > .04) assert.equal(data[i + 1] < 128, hit.point.y > WATER_LEVEL, 'shore distance sign')
  checked++
}
assert.ok(checked > 100)
const sample = (x, z) => {
  const i = (Math.floor((z - baked.bounds.y) / cell) * size + Math.floor((x - baked.bounds.x) / cell)) * 4
  return { height: data[i] / 255 * DEPTH_RANGE + DEPTH_MIN, shore: (data[i + 1] / 255 - .5) * 12, clear: data[i + 2] / 255 }
}
assert.ok(sample(-3, 0).height > WATER_LEVEL && sample(-3, 0).shore < 0)
assert.ok(sample(4, 0).shore > 0 && sample(4, 0).shore < .7)
assert.ok(sample(17, 0).height < sample(6, 0).height)
assert.equal(sample(17, 0).clear, 0, 'conceal the finite seabed edge')
assert.equal(sample(9, 0).clear, 1, 'preserve the fish in the lagoon')
assert.equal(data.length, 256 * 256 * 4)
assert.equal(baked.texture.generateMipmaps, false)
// Regression for the visible square/diamond around the island. GPU sampling
// outside the lookup uses DEPTH_MIN; every perimeter texel must match it.
for (let p = 0; p < size; p++) for (const edge of [p, (size - 1) * size + p, p * size, p * size + size - 1]) {
  assert.equal(data[edge * 4], 0, `depth lookup must meet open ocean at perimeter ${edge}`)
  assert.equal(data[edge * 4 + 2], 0, 'no visible sand at the lookup boundary')
}
// An outer ring also prevents filtering or quantization revealing the edge.
for (let p = 0; p < size; p++) for (const edge of [size + p, (size - 2) * size + p, p * size + 1, p * size + size - 2]) {
  assert.equal(data[edge * 4], 0)
}
model.children.forEach((mesh, i) => {
  assert.ok(mesh.matrixWorld.equals(originals[i].matrix))
  assert.deepEqual(mesh.geometry.attributes.position.array, originals[i].positions)
})

const water = createIslandWater(model)
const time = water.time, uniforms = water.material.uniforms, texture = uniforms.uDepth.value
water.update(1 / 60, false, false)
assert.equal(time.value, 1 / 60)
for (let i = 0; i < 120; i++) { water.update(.016, true, false); water.update(.016, false, true) }
assert.equal(time.value, 1 / 60, 'Still/reduced motion and readers must freeze the same shared clock')
water.update(10, false, false)
assert.ok(time.value < .07, 'resume should not jump through ten seconds of waves')
const t = time.value
water.update(NaN, false, false); water.update(-1, false, false)
assert.equal(time.value, t)
const day = uniforms.uDeep.value.clone()
water.setPalette(true)
assert.ok(!uniforms.uDeep.value.equals(day)); assert.equal(water.dusk.value, 1)
water.setPalette(false); assert.ok(uniforms.uDeep.value.equals(day))
for (let i = 0; i < 300; i++) water.update(1 / 60, false, false)
assert.equal(water.time, time); assert.equal(water.material.uniforms, uniforms); assert.equal(uniforms.uDepth.value, texture)
assert.equal(water.material.depthWrite, false)

const sand = new THREE.MeshStandardMaterial({ name: 'M_SandWater' })
const sandTexture = new THREE.Texture(); sand.map = sandTexture
const fixture = new THREE.Group()
const ground = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), sand); ground.name = 'Groundplane_M_SandWater_0'; fixture.add(ground)
const oldCompile = sand.onBeforeCompile, oldKey = sand.customProgramCacheKey
const restore = attachSandCaustics(fixture, water)
const shader = { uniforms: {}, vertexShader: THREE.ShaderLib.standard.vertexShader, fragmentShader: THREE.ShaderLib.standard.fragmentShader }
sand.onBeforeCompile(shader, {})
assert.equal(shader.uniforms.uWaterTime, time)
assert.equal(shader.uniforms.uWaterDusk, water.dusk)
assert.ok(shader.fragmentShader.includes('#include <lights_fragment_begin>'), 'keep real lighting and shadows')
assert.ok(shader.fragmentShader.includes('float waterDepth = 2.08 - vSandWorld.y'), 'caustics must stop above the waterline')
assert.equal(sand.map, sandTexture)
restore(); assert.equal(sand.onBeforeCompile, oldCompile); assert.equal(sand.customProgramCacheKey, oldKey)
let materialDisposed = 0, textureDisposed = 0
water.material.addEventListener('dispose', () => materialDisposed++)
texture.addEventListener('dispose', () => textureDisposed++)
water.dispose(); baked.texture.dispose()
assert.equal(materialDisposed, 1); assert.equal(textureDisposed, 1)
console.log(`Water passed: ${checked} real seabed heights, seamless ocean perimeter, shoreline signs, edge concealment, palettes, frozen/shared clock, stable frame resources and cleanup.`)
