const assert = require('node:assert/strict')
const { sourceModule } = require('./island-geometry.cjs')
const { createWeather } = sourceModule('island-weather')
const w = createWeather()
const tick = seconds => { for (let i = 0; i < seconds * 60; i++) w.update(1 / 60, false, false) }
w.setTarget('rain')
assert.equal(w.rain, 0)
tick(.5)
assert.ok(w.cloud > 0 && w.rain === 0, 'clouds build before rain starts')
tick(12)
assert.ok(w.rain > .55 && w.wetness > .35, 'rain and wetness arrive naturally')
const rainSnapshot = { ...w }
w.setTarget('clear')
assert.equal(w.rain, rainSnapshot.rain, 'retarget never snaps')
tick(5)
assert.ok(w.rain < .1 && w.wetness > .3, 'surfaces remain damp after rain clears')
const freeze = [w.time,w.drift,w.cloud,w.rain,w.wetness]
w.update(5,false,true)
assert.deepEqual([w.time,w.drift,w.cloud,w.rain,w.wetness],freeze,'reader/tab pause freezes weather')
w.setTarget('storm')
const beforeResume = w.time
w.update(500,false,false)
assert.ok(w.time-beforeResume <= .051, 'resume delta is capped')
let flashes = 0, lastFlash = -Infinity
for (let i=0;i<60*180;i++) {
  const previous=w.flashSerial
  w.update(1/60,false,false)
  if(w.flashSerial!==previous){assert.ok(w.time-lastFlash>=16,'lightning is sparse');lastFlash=w.time;flashes++}
  for(const key of ['cloud','rain','wind','gust','fog','wetness','sun','lightning']) assert.ok(Number.isFinite(w[key])&&w[key]>=0&&w[key]<=1,key)
}
assert.ok(flashes>=3&&flashes<12,'storm has occasional distant light')
const stillTime=w.time
w.update(1/60,true,false)
assert.equal(w.lightning,0)
assert.equal(w.time,stillTime)
w.setTarget('clear',true)
assert.equal(w.cloud,0);assert.equal(w.rain,0);assert.equal(w.sun,1)
for(const invalid of [NaN,-1,Infinity,0]) w.update(invalid,false,false)
assert.equal(w.time,stillTime)
console.log('Island weather passed: clouds-before-rain, continuous reversal, residual wetness, pause/resume, bounded sparse lightning, invalid deltas and instant Still.')
