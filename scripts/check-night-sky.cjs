const assert = require('node:assert/strict')
const THREE = require('three')
const { sourceModule } = require('./island-geometry.cjs')
const { createIslandSky } = sourceModule('island-sky')
const { createWeather } = sourceModule('island-weather')
const { NIGHT_STAR_COUNT, PHONE_STAR_COUNT } = sourceModule('night-sky')
const { areaById, cameraFov } = sourceModule('island-data')
const sky = createIslandSky(), weather = createWeather()
const attributes = sky.stars.attributes
const data = attributes.starData.array.slice()
const position = new THREE.Vector3(), camera = new THREE.PerspectiveCamera(cameraFov(16 / 9), 16 / 9, .1, 260)
const overview = areaById('overview')
camera.position.fromArray(overview.position); camera.lookAt(new THREE.Vector3(...overview.target)); camera.updateMatrixWorld()
sky.setViewHeight(camera.position.y)
sky.setPalette(1, weather)
sky.setQuality(false, 1.5)
assert.equal(sky.stars.drawRange.count, NIGHT_STAR_COUNT)
let visible = 0, faint = 0
for (let i = 0; i < NIGHT_STAR_COUNT; i++) {
  position.fromBufferAttribute(attributes.position, i)
  position.y -= sky.material.uniforms.uHorizonDip.value * 180
  position.add(camera.position).project(camera)
  if (Math.abs(position.x) < 1 && Math.abs(position.y) < 1 && position.z > -1 && position.z < 1) visible++
  if (attributes.starData.getX(i) < .4) faint++
}
assert.ok(visible > 20, `${visible} stars in the actual overview; celestial detail must be in frame`)
assert.ok(faint > NIGHT_STAR_COUNT * .55, 'most stars should be faint rather than identical bright dots')
position.copy(sky.moonPosition).add(camera.position).project(camera)
assert.ok(Math.abs(position.x) < .98 && Math.abs(position.y) < .98 && position.z < 1, 'moon is visible from the real home pose')
const uniforms = sky.material.uniforms, positions = attributes.position.array
for (let i = 0; i < 180; i++) { weather.update(1 / 60, false, false); sky.update(1 / 60, false, false, weather); sky.setPalette(1, weather) }
assert.equal(sky.time.value, weather.time, 'aurora and stars share weather active time')
const time = sky.time.value
weather.update(60, false, true); sky.update(60, false, true, weather)
assert.equal(sky.time.value, time, 'reader freezes the aurora without a return jump')
weather.update(60, true, false); sky.update(60, true, false, weather)
assert.equal(sky.time.value, time, 'Still freezes both twinkle and curtains')
weather.setTarget('storm', true); sky.setPalette(1, weather)
assert.equal(sky.night.value, 0, 'stars, moon and aurora vanish behind dense weather')
sky.setPalette(0, weather); assert.equal(sky.night.value, 0, 'celestial effects never leak into daylight')
sky.setQuality(true, 3)
assert.equal(sky.stars.drawRange.count, PHONE_STAR_COUNT)
assert.equal(uniforms.uMobile.value, 1)
assert.equal(uniforms.uPixelRatio.value, 1.5)
assert.equal(sky.material.uniforms, uniforms)
assert.equal(attributes.position.array, positions)
assert.deepEqual(attributes.starData.array, data, 'frames never rebuild the star field')
sky.dispose()
console.log(`Night sky passed: ${visible} overview stars, in-frame moon, magnitude diversity, shared active time, cloud masking, Still/reader pause and bounded mobile resources.`)
