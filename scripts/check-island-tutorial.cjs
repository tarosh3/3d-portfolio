/* The lesson advances through completed user actions, never presentation timing. */
const assert = require('node:assert/strict')
const { sourceModule } = require('./island-geometry.cjs')
const { advanceTutorial } = sourceModule('island-tutorial')

let step = 'travel'
const send = event => (step = advanceTutorial(step, event))
const orbit = { type: 'gesture', kind: 'orbit' }
const zoom = { type: 'gesture', kind: 'zoom' }
const arrived = area => ({ type: 'arrived', area })
const reading = stage => ({ type: 'reading', stage })
const returned = { type: 'returned' }

// An unrelated control, different destination, or earlier interaction cannot
// accidentally skip the first hands-on instruction.
for (const event of [orbit, zoom, arrived('cabin'), reading(1), returned]) {
  assert.equal(send(event), 'travel', 'wait for actual arrival at the veranda')
}
assert.equal(send(arrived('veranda')), 'open')

// A canceled approach returns to the area without ever reaching "reading".
// It must leave the magazine instruction available for the next attempt.
for (const event of [arrived('veranda'), returned, orbit, zoom, reading(2), reading(4)]) {
  assert.equal(send(event), 'open', 'only the open magazine completes this lesson')
}
assert.equal(send(reading(1)), 'return')

// Repeated reading notifications and gestures behind the modal do not count as
// going back. The lesson waits for the completed camera return.
for (const event of [reading(1), arrived('veranda'), orbit, zoom]) {
  assert.equal(send(event), 'return', 'wait for the reader and return journey to finish')
}
assert.equal(send(returned), 'look')
for (const event of [returned, zoom, reading(1), arrived('veranda')]) {
  assert.equal(send(event), 'look', 'zooming is not the requested orbit practice')
}
assert.equal(send(orbit), 'zoom')

// OrbitControls can emit many changes while damping settles; none should
// consume the following zoom lesson.
for (let i = 0; i < 120; i++) assert.equal(send(orbit), 'zoom')
assert.equal(send(returned), 'zoom')
assert.equal(send(zoom), 'done')

// Completion is stable, and replay begins from a fresh travel step.
for (const event of [arrived('veranda'), reading(1), returned, orbit, zoom]) {
  assert.equal(send(event), 'done', 'completed lessons cannot restart themselves')
}
step = 'travel'
assert.equal(send(zoom), 'travel', 'an old gesture cannot complete a replay')
for (const event of [arrived('veranda'), reading(1), returned, orbit, zoom]) send(event)
assert.equal(step, 'done')

console.log('Hands-on tutorial passed: ordered user actions, wrong destination/content, canceled approach, completed return, repeated gestures, stable completion and fresh replay')
