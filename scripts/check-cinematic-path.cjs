const assert = require('node:assert/strict')
const THREE = require('three')
const { sourceModule, loadGeometry } = require('./island-geometry.cjs')
const { createCameraGuard } = sourceModule('camera-path')
const { createCinematicPath, cinematicTravelTime, CINEMATIC_SPEED, CINEMATIC_ACCELERATION_SECONDS, CINEMATIC_ATMOSPHERE_SECONDS } = sourceModule('cinematic-path')
const { AREAS } = sourceModule('island-data')
const realGuard = createCameraGuard(loadGeometry())
// The film may use the same collision geometry; it must not use section routes.
const guard = { ...realGuard, route() { assert.fail('Cinematic movement reused a section-navigation path') } }
const p = new THREE.Vector3(), target = new THREE.Vector3(), previous = new THREE.Vector3()
const velocity = new THREE.Vector3(), lastVelocity = new THREE.Vector3(), gaze = new THREE.Vector3(), lastGaze = new THREE.Vector3()
const rayStart = new THREE.Vector3(), rayEnd = new THREE.Vector3()
const axes = [new THREE.Vector3(.23, 0, 0), new THREE.Vector3(0, .23, 0), new THREE.Vector3(0, 0, .23)]
const seeds = [12345, 0x2fffffff, 0x98765432, 0xabcdef00]
let frames = 0, starts = 0, maxTurn = 0, maxGaze = 0, minSpeed = Infinity, maxSpeed = 0, maxSetup = 0

function checkMovie(path, seconds, label, coverage = false) {
  const seen = new Set(), signature = []
  path.sample(0, previous, target)
  lastGaze.subVectors(target, previous).normalize()
  let angle = Math.atan2(previous.x + 3, previous.z + 2)
  for (let frame = 1; frame <= seconds * 60; frame++) {
    const time = frame / 60
    path.sample(cinematicTravelTime(time) / path.duration, p, target)
    assert.ok(Number.isFinite(p.x + p.y + p.z + target.x + target.y + target.z), label + ' finite pose')
    assert.ok(guard.safe(p) && guard.clear(previous, p, 0), label + ' camera collision at ' + time)
    for (const axis of axes) for (const sign of [-1, 1]) {
      assert.ok(guard.clear(rayStart.copy(previous).addScaledVector(axis, sign), rayEnd.copy(p).addScaledVector(axis, sign), 0), label + ' swept clearance at ' + time)
    }
    const nextAngle = Math.atan2(p.x + 3, p.z + 2)
    const turnAroundIsland = Math.atan2(Math.sin(nextAngle - angle), Math.cos(nextAngle - angle))
    assert.ok(turnAroundIsland * path.direction > -1e-8, label + ' reversed orbit direction at ' + time)
    angle = nextAngle
    velocity.subVectors(p, previous)
    const speed = velocity.length() * 60
    if (time > CINEMATIC_ACCELERATION_SECONDS + .05) {
      minSpeed = Math.min(minSpeed, speed); maxSpeed = Math.max(maxSpeed, speed)
      assert.ok(speed > CINEMATIC_SPEED * .985 && speed < CINEMATIC_SPEED * 1.001, label + ' slowed/stopped at ' + time + ': ' + speed)
    }
    velocity.normalize()
    if (frame > 2) {
      const headingChange = THREE.MathUtils.radToDeg(velocity.angleTo(lastVelocity))
      maxTurn = Math.max(maxTurn, headingChange)
      assert.ok(headingChange < 5, label + ' sharp turn at ' + time + ': ' + headingChange)
    }
    gaze.subVectors(target, p).normalize()
    const gazeChange = THREE.MathUtils.radToDeg(gaze.angleTo(lastGaze))
    maxGaze = Math.max(maxGaze, gazeChange)
    assert.ok(gazeChange < 2, label + ' gaze snapped at ' + time + ': ' + gazeChange)
    assert.ok(p.distanceTo(target) > 1, 'Never look through a zero-length target vector')
    // Spatial regions, not copies of the portfolio's section camera poses.
    if (p.x > -6.5 && p.x < 0 && p.z > 1.1 && p.z < 1.9 && p.y < 4.8) seen.add('covered veranda')
    if (p.z < -7 && p.x > -7.5 && p.x < 1.5 && p.y < 5) seen.add('rear deck')
    if (p.x < -8.5 && Math.abs(p.z + 2) < 2) seen.add('west shore')
    if (p.z > 6 && p.y < 7) seen.add('beach')
    if (p.x > 7 && p.y < 7) seen.add('pier/lagoon')
    if (frame % 600 === 0) signature.push(p.toArray())
    previous.copy(p); lastVelocity.copy(velocity); lastGaze.copy(gaze); frames++
  }
  if (coverage) assert.equal(seen.size, 5, label + ' missing spatial coverage: ' + [...seen].join(', '))
  return signature
}

const signatures = []
for (const aspect of [16 / 9, 390 / 844]) for (const seed of seeds) {
  const origin = { position: new THREE.Vector3(25, 17, 23), target: new THREE.Vector3(1, 2.6, 0) }
  const start = performance.now(), path = createCinematicPath(guard, seed, aspect, origin)
  maxSetup = Math.max(maxSetup, performance.now() - start)
  assert.ok(path?.anchored, 'Overview must start from the live view')
  path.sample(0, p, target)
  assert.ok(p.equals(origin.position) && target.equals(origin.target), 'Capture the exact live pose')
  const signature = checkMovie(path, 180, 'seed ' + seed + ', aspect ' + aspect, true)
  if (aspect > 1) signatures.push(signature)
  starts++
  // Looking backward in the deterministic sampler cannot corrupt later laps.
  path.sample(95 / path.duration, p, target)
  const saved = p.clone()
  path.sample(0, p, target)
  path.sample(95 / path.duration, p, target)
  assert.ok(p.distanceTo(saved) < 1e-8, 'Seek/restart changed the generated sequence')
}
for (let i = 0; i < signatures.length; i++) for (let j = i + 1; j < signatures.length; j++) {
  const differing = signatures[i].filter((point, k) => new THREE.Vector3(...point).distanceTo(new THREE.Vector3(...signatures[j][k])) > 1).length
  assert.ok(differing >= 10, 'Seeds must change the actual route from the same initial view')
}

// Arbitrary explored views and close-ups must retain their pose on activation.
const origins = AREAS.filter(area => area.id !== 'overview').map(area => ({ name: area.id, position: new THREE.Vector3(...area.position), target: new THREE.Vector3(...area.target) }))
for (let side = 0; side < 8; side++) {
  const angle = side * Math.PI / 4
  origins.push({ name: 'explored side ' + side, position: new THREE.Vector3(1 + Math.sin(angle) * 25, 13, Math.cos(angle) * 25), target: new THREE.Vector3(-1, 3.7, 2) })
}
for (const seed of [12345, 0x2fffffff]) for (const origin of origins) {
  const savedPosition = origin.position.clone(), savedTarget = origin.target.clone()
  const path = createCinematicPath(guard, seed, 390 / 844, origin)
  assert.ok(path?.anchored, 'No live entrance from ' + origin.name + ', seed ' + seed)
  path.sample(0, p, target)
  assert.ok(p.equals(savedPosition) && target.equals(savedTarget), 'Live view was reset')
  checkMovie(path, Math.max(35, path.entryDistance / CINEMATIC_SPEED + 5), origin.name + ', seed ' + seed)
  assert.ok(origin.position.equals(savedPosition) && origin.target.equals(savedTarget), 'Mutated the caller pose')
  // The controller passes mutable camera/target vectors. Keep a snapshot.
  origin.position.set(80, 80, 80); origin.target.set(40, 40, 40)
  path.sample(0, p, target)
  assert.ok(p.equals(savedPosition) && target.equals(savedTarget), 'Retained mutable live references')
  origin.position.copy(savedPosition); origin.target.copy(savedTarget)
  starts++
}
assert.equal(createCinematicPath({ safe: () => false, clear: () => false }, 1, 1.5), null)
assert.equal(cinematicTravelTime(0), 0)
assert.ok(cinematicTravelTime(.01) < .000001)
assert.ok(Math.abs(cinematicTravelTime(3.001) - cinematicTravelTime(2.999) - .002) < 1e-8)
assert.equal(CINEMATIC_ATMOSPHERE_SECONDS, 60)
console.log(JSON.stringify({ frames, liveStarts: starts, seededProfiles: signatures.length, cruiseSpeed: [minSpeed, maxSpeed].map(n => +n.toFixed(4)), maxHeadingDegreesPerFrame: +maxTurn.toFixed(3), maxGazeDegreesPerFrame: +maxGaze.toFixed(3), maxOverviewSetupMs: Math.round(maxSetup), coverage: 'covered veranda, rear deck, west shore, beach, pier/lagoon', result: 'continuous speed, forward-only travel, independent curves, swept clearance, multi-lap joins and live starts passed' }, null, 2))
