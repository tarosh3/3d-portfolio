const assert = require('node:assert/strict')
const THREE = require('three')
const { sourceModule, loadGeometry } = require('./island-geometry.cjs')
const { createWeather } = sourceModule('island-weather')
const { createIslandWater, attachSandCaustics } = sourceModule('island-water')
const { attachIslandWetness } = sourceModule('island-wetness')
const { acquireRainSurface, releaseRainSurface, sampleRainSurface } = sourceModule('rain-surface')

const source = loadGeometry()
source.traverse(mesh => {
  if (!mesh.isMesh) return
  mesh.material = new THREE.MeshStandardMaterial({ name: mesh.name.match(/_([Mm]_[^]+)_0$/)?.[1] || 'Untouched', roughness: .9 })
})
const clone = source.clone(true)
clone.traverse(mesh => { if (mesh.isMesh) mesh.material = mesh.material.clone() })
const sourceSand = source.getObjectByName('Groundplane_M_SandTop_0').material
const sand = clone.getObjectByName('Groundplane_M_SandTop_0').material
const sourceHook = sourceSand.onBeforeCompile
const originalHook = sand.onBeforeCompile, originalKey = sand.customProgramCacheKey
const water = createIslandWater(clone), weather = createWeather()
const uniforms = water.material.uniforms, direction = uniforms.uWindDirection.value
const time = water.time, sun = water.sun
water.setPalette(0, weather)
const clear = uniforms.uDeep.value.clone()
weather.setTarget('storm')
for (let i = 0; i < 1800; i++) {
  weather.update(1 / 60, false, false)
  water.setPalette(.5, weather)
  water.update(1 / 60, false, false, weather)
}
assert.ok(weather.rain > .98 && weather.wind > .9)
assert.equal(time.value, weather.time)
assert.equal(uniforms.uDrift.value, weather.drift)
assert.equal(uniforms.uGust.value, weather.gust)
assert.equal(sun.value, weather.sun)
assert.ok(!uniforms.uDeep.value.equals(clear))
assert.equal(uniforms.uWindDirection.value, direction, 'frames reuse the wind uniform')
assert.equal(water.time, time)
const frozen = weather.time, frozenDrift = weather.drift
weather.update(100, false, true); water.update(100, false, true, weather)
assert.equal(time.value, frozen)
assert.equal(uniforms.uDrift.value, frozenDrift)
weather.update(100, true, false); water.update(100, true, false, weather)
assert.equal(time.value, frozen, 'Still freezes ocean and shared caustic phase')
assert.equal(uniforms.uLightning.value, 0)

const surface = acquireRainSurface(clone)
const roof = sampleRainSurface(surface, -3, -2, false)
assert.ok(roof > 4.9, 'real bungalow roof shields the interior floor')
assert.ok(roof - 2.78 > .26)
assert.ok(sampleRainSurface(surface, 7, 0, false) < 3, 'exposed pier has no roof above it')
let disposed = 0
surface.texture.addEventListener('dispose', () => disposed++)
const compile = () => {
  const shader = { uniforms: {}, vertexShader: THREE.ShaderLib.standard.vertexShader, fragmentShader: THREE.ShaderLib.standard.fragmentShader }
  sand.onBeforeCompile(shader, {})
  return shader
}
// Wetness and caustics share sand. Test either cleanup order, including the
// effect cleanup/setup replay React performs during development.
for (const wetFirst of [true, false]) {
  const wet = attachIslandWetness(clone)
  const dryCaustics = attachSandCaustics(clone, water)
  wet.update(.8)
  let shader = compile()
  assert.equal(shader.uniforms.uIslandWetness.value, .8)
  assert.equal(shader.uniforms.uWetSurface.value, surface.texture)
  assert.equal(shader.uniforms.uWaterTime, time)
  assert.equal(shader.uniforms.uWaterSun, sun)
  assert.equal(sourceSand.onBeforeCompile, sourceHook, 'cached/source materials stay untouched')
  assert.equal(sand.roughness, .9, 'spatial wetness does not flatten material properties globally')
  if (wetFirst) {
    wet.dispose()
    shader = compile()
    assert.equal(shader.uniforms.uIslandWetness, undefined)
    assert.equal(shader.uniforms.uWaterTime, time)
    const replay = attachIslandWetness(clone)
    shader = compile()
    assert.equal((shader.fragmentShader.match(/varying vec3 vWetWorld;/g) || []).length, 1)
    replay.dispose(); dryCaustics()
  } else {
    dryCaustics()
    shader = compile()
    assert.equal(shader.uniforms.uWaterTime, undefined)
    assert.equal(shader.uniforms.uIslandWetness.value, .8)
    wet.dispose()
  }
  assert.equal(sand.onBeforeCompile, originalHook)
  assert.equal(sand.customProgramCacheKey, originalKey)
  assert.equal(disposed, 0, 'rain reader still owns the shared roof texture')
}
releaseRainSurface(clone)
assert.equal(disposed, 1)
water.dispose()
clone.traverse(mesh => { if (mesh.isMesh) mesh.material.dispose() })
source.traverse(mesh => { if (mesh.isMesh) { mesh.material.dispose(); mesh.geometry.dispose() } })
console.log('Weather ocean passed: shared wind/time/palette, pause and Still, real roof exposure, source material isolation, caustic/wetness hook composition, cleanup/replay, and shared texture ownership.')
