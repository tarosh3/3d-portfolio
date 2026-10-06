const assert = require('node:assert/strict')
const THREE = require('three')
const { sourceModule, loadGeometry } = require('./island-geometry.cjs')
const { bakeRainSurface, acquireRainSurface, releaseRainSurface, sampleRainSurface, RAIN_SURFACE_MESH, RAIN_HEIGHT_RANGE } = sourceModule('rain-surface')
const { createIslandRain, RAIN_PARTICLES, RAIN_SPLASHES } = sourceModule('island-rain')
const { createWeather } = sourceModule('island-weather')
const { WATER_LEVEL } = sourceModule('water-depth')
const model = loadGeometry()
const original = model.children.map(mesh => ({ positions: mesh.geometry.attributes.position.array.slice(), matrix: mesh.matrixWorld.clone(), index: mesh.geometry.index?.array.slice() }))
const surfaces = model.children.filter(mesh => RAIN_SURFACE_MESH.test(mesh.name))
const roofMeshes = model.children.filter(mesh => /^(House_|Changing_Cabin_|BeachUmbrella_)/.test(mesh.name))
const baked = bakeRainSurface(model)
const ray = new THREE.Raycaster(new THREE.Vector3(), new THREE.Vector3(0, -1, 0))
const topHeight = (x, z, meshes = surfaces) => {
  ray.ray.origin.set(x, 20, z)
  return Math.max(WATER_LEVEL, ray.intersectObjects(meshes, false)[0]?.point.y ?? WATER_LEVEL)
}
let heightsChecked = 0, roofsChecked = 0, sheltered = 0, splashChecked = 0
// These rays interrogate the real GLTF independently of the rasterizer.
for (let z = 2; z < baked.size - 2; z += 13) for (let x = 2; x < baked.size - 2; x += 13) {
  const wx = baked.bounds.x + (x + .5) * baked.cell, wz = baked.bounds.y + (z + .5) * baked.cell
  const height = topHeight(wx, wz), sample = sampleRainSurface(baked, wx, wz, false)
  assert.ok(Math.abs(sample - height) < .0001, `exact top surface ${wx},${wz}: ${sample} != ${height}`)
  assert.ok(sampleRainSurface(baked, wx, wz) + .00001 >= height, 'shelter cannot lie below a sampled roof or terrain')
  const i = (z * baked.size + x) * 4, bytes = baked.texture.image.data
  const decoded = (bytes[i] * 256 + bytes[i + 1]) / 65535 * RAIN_HEIGHT_RANGE
  assert.ok(decoded >= sample - .00001 && decoded - sample < .00026, '16-bit height encoding')
  heightsChecked++
}
// Offset samples near edges and within each cell catch roof pinholes that a
// center-only bake misses. Every actual roof intersection must block the rain.
const roofBounds = new THREE.Box3()
roofMeshes.forEach(mesh => roofBounds.union(new THREE.Box3().setFromObject(mesh)))
for (let z = roofBounds.min.z; z <= roofBounds.max.z; z += .123) for (let x = roofBounds.min.x; x <= roofBounds.max.x; x += .117) {
  const height = topHeight(x, z, roofMeshes)
  if (height <= WATER_LEVEL + .8) continue
  const safe = sampleRainSurface(baked, x, z)
  assert.ok(safe + .00001 >= height, `roof leaked at ${x},${z}: ${safe} < ${height}`)
  if (height > 4.6) sheltered++
  roofsChecked++
}
assert.ok(heightsChecked > 1000 && roofsChecked > 1000 && sheltered > 100)
assert.equal(sampleRainSurface(baked, 1000, 1000), WATER_LEVEL)
assert.equal(baked.texture.minFilter, THREE.NearestFilter)
assert.equal(baked.texture.generateMipmaps, false)
model.children.forEach((mesh, i) => {
  assert.ok(mesh.matrixWorld.equals(original[i].matrix))
  assert.deepEqual(mesh.geometry.attributes.position.array, original[i].positions)
  assert.deepEqual(mesh.geometry.index?.array, original[i].index)
})

// Concurrent consumers (rain and wetness) share one texture. Strict Mode's
// final release disposes it; replay creates a new live GPU texture from CPU data.
const first = acquireRainSurface(model), second = acquireRainSurface(model)
assert.equal(first, second)
assert.equal(first.heights, baked.heights, 'CPU bake reused rather than repeating model work')
let textureDisposals = 0
first.texture.addEventListener('dispose', () => textureDisposals++)
releaseRainSurface(model); assert.equal(textureDisposals, 0)
releaseRainSurface(model); assert.equal(textureDisposals, 1)
const replay = acquireRainSurface(model)
assert.notEqual(replay.texture, first.texture)
assert.equal(replay.heights, first.heights)
releaseRainSurface(model)

const rain = createIslandRain(model), weather = createWeather()
weather.setTarget('storm', true)
weather.time = 9; weather.drift = 4; weather.wind = .8; weather.gust = .7
// SceneReadiness uses traverseVisible before drawing, so both shaders and the
// shelter texture must be discoverable even while paused/Still beneath loader.
rain.update(weather, 0, true, true, true, true, .001, true)
assert.equal(rain.group.visible, true)
assert.equal(rain.rainGeometry.instanceCount, 1)
assert.equal(rain.splashGeometry.instanceCount, 1)
assert.equal(rain.material.uniforms.uRain.value, 0, 'warm-up draws discard every fragment')
const warmMaterials = [], warmTextures = new Set()
rain.group.traverseVisible(object => {
  if (!object.material) return
  warmMaterials.push(object.material)
  for (const uniform of Object.values(object.material.uniforms)) if (uniform.value instanceof THREE.Texture) warmTextures.add(uniform.value)
})
assert.equal(warmMaterials.length, 2, 'both rain programs are visible to readiness compilation')
assert.ok(warmTextures.has(rain.surface.texture), 'readiness uploads the rain shelter lookup')
weather.rain = 0
rain.update(weather, 0, false, false, false, false, .001, false)
assert.equal(rain.group.visible, false, 'clear weather adds no rain draws after readiness')
weather.rain = 1
rain.update(weather, 0, false, false, false, false, .001)
assert.equal(rain.group.visible, true)
assert.equal(rain.rainGeometry.instanceCount, RAIN_PARTICLES.desktop)
assert.equal(rain.group.children.length, 2)
assert.ok(rain.splashGeometry.instanceCount > 250)
const impact = rain.splashGeometry.attributes.aImpact
for (let i = 0; i < rain.splashGeometry.instanceCount; i++) {
  const x = impact.getX(i), y = impact.getY(i), z = impact.getZ(i)
  assert.ok(y > WATER_LEVEL + .08, 'ocean impacts are handled in the ocean shader')
  assert.ok(Math.abs(y - topHeight(x, z) - .012) < .0001, 'splash touches an exposed actual surface')
  splashChecked++
}
const uniforms = rain.material.uniforms, seedAttribute = rain.rainGeometry.attributes.aSeed
const day = uniforms.uColor.value.clone()
rain.update(weather, 1, true, false, false, false, .001)
assert.equal(rain.rainGeometry.instanceCount, RAIN_PARTICLES.mobile)
assert.equal(rain.splashGeometry.instanceCount, RAIN_SPLASHES.mobile)
assert.ok(!uniforms.uColor.value.equals(day))
rain.update(weather, 1, true, true, false, false, .001)
assert.equal(rain.rainGeometry.instanceCount, RAIN_PARTICLES.low)
assert.equal(rain.splashGeometry.instanceCount, 0)
const time = uniforms.uTime.value, drift = uniforms.uDrift.value
weather.time += 20; weather.drift += 10
rain.update(weather, 0, false, false, false, true, .001)
assert.equal(uniforms.uTime.value, time, 'paused rain must freeze even if a caller advances weather')
assert.equal(uniforms.uDrift.value, drift)
rain.update(weather, 0, false, false, true, false, .001)
assert.equal(rain.group.visible, false, 'Still/reduced motion omits suspended streaks')
weather.rain = 0
rain.update(weather, 0, false, false, false, false, .001)
assert.equal(rain.group.visible, false)
weather.rain = .8
for (let i = 0; i < 300; i++) { weather.time += .016; rain.update(weather, .5, false, false, false, false, .001) }
assert.equal(rain.material.uniforms, uniforms)
assert.equal(rain.rainGeometry.attributes.aSeed, seedAttribute)
assert.equal(uniforms.uSurface.value, rain.surface.texture)
assert.equal(rain.material.depthTest, true); assert.equal(rain.material.depthWrite, false)
const hits = []
for (const child of rain.group.children) { child.raycast(ray, hits); assert.equal(child.frustumCulled, false) }
assert.equal(hits.length, 0, 'atmosphere does not intercept object input')
assert.equal(rain.shelterAt(-3.4, 3.1, -2.5), 1, 'bungalow interior is sheltered')
assert.equal(rain.shelterAt(15, 3.1, 15), 0, 'open water is exposed')
assert.ok(rain.material.fragmentShader.includes('vWorld.y < surface + .014'), 'roof clipping is per fragment, including slanted segments')
const duplicate = createIslandRain(model)
assert.deepEqual(duplicate.rainGeometry.attributes.aSeed.array, seedAttribute.array, 'particle placement is deterministic')
let materialsDisposed = 0, geometryDisposed = 0, sharedDisposed = 0
for (const resource of [rain.material, rain.splashMaterial]) resource.addEventListener('dispose', () => materialsDisposed++)
for (const resource of [rain.rainGeometry, rain.splashGeometry]) resource.addEventListener('dispose', () => geometryDisposed++)
rain.surface.texture.addEventListener('dispose', () => sharedDisposed++)
rain.dispose(); rain.dispose()
assert.equal(materialsDisposed, 2); assert.equal(geometryDisposed, 2)
assert.equal(sharedDisposed, 0, 'second rain consumer still owns the surface texture')
duplicate.dispose(); assert.equal(sharedDisposed, 1)
baked.texture.dispose()
console.log(`Rain passed: ${heightsChecked} real surface rays, ${roofsChecked} offset roof samples without leaks, ${splashChecked} exposed impacts, shared/refcounted shelter, deterministic GPU seeds, bounded phone tiers, pause/Still, disabled input and cleanup.`)
