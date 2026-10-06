const assert = require('node:assert/strict')
const THREE = require('three')
const { sourceModule } = require('./island-geometry.cjs')
const { createIslandSky } = sourceModule('island-sky')
const { createWeather } = sourceModule('island-weather')
const { setWeatherHorizon } = sourceModule('sky-atmosphere')
const sky = createIslandSky(), weather = createWeather(), horizon = new THREE.Color()
const uniforms = sky.material.uniforms, texture = uniforms.uNoise.value
const luminance = color => color.r * .2126 + color.g * .7152 + color.b * .0722

assert.equal(texture.image.width, 256)
assert.equal(texture.image.height, 256)
assert.equal(texture.wrapS, THREE.RepeatWrapping)
assert.equal(texture.wrapT, THREE.RepeatWrapping)
assert.equal(texture.image.data.length, 256 * 256 * 4, 'clouds use one small cached lookup')
const clearZenith = luminance(uniforms.uZenith.value)
for (const kind of ['clear', 'cloudy', 'rain', 'storm']) {
  weather.setTarget(kind, true)
  for (let dusk = 0; dusk <= 1; dusk += .1) {
    sky.setPalette(dusk, weather)
    setWeatherHorizon(horizon, dusk, weather)
    assert.ok(uniforms.uHorizon.value.equals(horizon), 'weather sky meets the exact fog horizon')
    for (const name of ['uHorizon', 'uZenith', 'uCloud', 'uCloudBase', 'uGlow']) {
      assert.ok(uniforms[name].value.toArray().every(Number.isFinite))
    }
  }
}
weather.setTarget('storm', true)
sky.setPalette(0, weather)
assert.ok(luminance(uniforms.uZenith.value) < clearZenith * .7, 'storm dims the upper sky')
sky.setPalette(1, weather)
assert.equal(sky.night.value, 0, 'dense cloud obscures stars and moon')
const unlitHorizon = uniforms.uHorizon.value.clone()
weather.lightning = .4
sky.setPalette(1, weather)
assert.ok(luminance(uniforms.uHorizon.value) > luminance(unlitHorizon), 'lightning softly lights the shared atmosphere')
assert.equal(uniforms.uFlash.value, .4)

weather.setTarget('clear', true)
sky.setPalette(1, weather)
assert.equal(sky.night.value, 1, 'celestial lights return when skies clear')
assert.equal(sky.starMaterial.uniforms.uNoise, uniforms.uNoise, 'stars use the same cloud mask')
assert.equal(sky.moonMaterial.uniforms.uNoise, uniforms.uNoise, 'moon uses the same cloud mask')
for (let i = 0; i < 180; i++) weather.update(1 / 60, false, false)
sky.setPalette(0, weather)
const drift = uniforms.uDrift.value
assert.ok(drift > 0, 'cloud field follows integrated shared wind')
for (let i = 0; i < 180; i++) { weather.update(1 / 60, false, true); weather.update(1 / 60, true, false) }
sky.setPalette(1, weather)
assert.equal(uniforms.uDrift.value, drift, 'reader pause and Still freeze cloud drift while colour can change')
assert.equal(uniforms.uNoise.value, texture, 'weather updates reuse the texture')
assert.equal(sky.material.uniforms, uniforms, 'weather updates reuse uniforms')
let disposed = 0
for (const resource of [texture, sky.material, sky.stars, sky.starMaterial, sky.moonMaterial]) resource.addEventListener('dispose', () => disposed++)
sky.dispose()
assert.equal(disposed, 5, 'all sky-owned GPU resources are released')
console.log('Weather sky passed: continuous fog palette, darkening, celestial obscuration, restrained lightning, shared wind/pause, cached noise and cleanup.')
