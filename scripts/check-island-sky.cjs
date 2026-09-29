const assert = require('node:assert/strict')
const { sourceModule } = require('./island-geometry.cjs')
const { createIslandSky } = sourceModule('island-sky')
const sky = createIslandSky()
const uniforms = sky.material.uniforms, time = sky.time
for (let i = 0; i < 180; i++) sky.update(1 / 60, false, false)
assert.ok(time.value > 2.99 && time.value < 3.01, 'cloud drift advances in Motion')
const before = time.value
for (let i = 0; i < 180; i++) { sky.update(.016, true, false); sky.update(.016, false, true) }
assert.equal(time.value, before, 'Still, reduced motion and a reader freeze cloud drift')
sky.update(60, false, false)
assert.ok(Math.abs(time.value - before - .05) < 1e-10, 'no jump after background/resume')
const after = time.value
sky.update(NaN, false, false); sky.update(-1, false, false)
assert.equal(time.value, after)
const day = uniforms.uCloud.value.clone()
sky.setPalette(true); assert.ok(!uniforms.uCloud.value.equals(day))
sky.setPalette(false); assert.ok(uniforms.uCloud.value.equals(day))
assert.equal(sky.material.uniforms, uniforms); assert.equal(sky.time, time)
assert.equal(sky.material.depthWrite, false)
assert.equal(sky.material.toneMapped, false, 'direct-rendered sky must match the untone-mapped fog horizon')
let disposed = 0
sky.material.addEventListener('dispose', () => disposed++)
sky.dispose(); assert.equal(disposed, 1)
console.log('Sky passed: ongoing drift, Still/reduced/reader pause, resume clamp, palettes, stable resources and cleanup.')
