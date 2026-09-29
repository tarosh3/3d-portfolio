/* Actual GLB clearance plus controller lifecycle checks, without WebGL. */
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')
const ts = require('typescript')
const THREE = require('three')
const { OrbitControls } = require('three-stdlib')
const { ROOT, sourceModule, loadGeometry } = require('./island-geometry.cjs')
const arrival = sourceModule('island-arrival')
const { areaById, cameraScale, cameraFov } = sourceModule('island-data')
const { createCameraGuard, pathDistance, pointOnPath } = sourceModule('camera-path')
const guard = createCameraGuard(loadGeometry())
const overview = (width, height) => {
  const area = areaById('overview'), target = new THREE.Vector3(...area.target)
  const offset = new THREE.Vector3(...area.position).sub(target).multiplyScalar(cameraScale(width / height))
  if (width < 760) target.y += 1.5
  return { target, destination: target.clone().add(offset) }
}
let clearanceSamples = 0
for (const [width, height] of [[1280, 720], [390, 844], [320, 640], [844, 390]]) {
  const pose = overview(width, height), route = arrival.arrivalRoute(guard, pose.destination, pose.target)
  assert.ok(route, `No safe arrival at ${width}×${height}`)
  assert.ok(route[0].y >= 72, 'Arrival must start above the cloud layer')
  assert.ok(route.at(-1).distanceTo(pose.destination) < 1e-8, 'Arrival changed overview')
  const distance = pathDistance(route), count = Math.ceil(distance / .1)
  for (let i = 0; i <= count; i++) {
    assert.ok(guard.safe(pointOnPath(route, distance * i / count, new THREE.Vector3())), 'Arrival crosses model')
    clearanceSamples++
  }
  for (let i = 1; i < route.length; i++) assert.ok(guard.clear(route[i - 1], route[i], .21))
}

// Session policy includes denied storage and a new browsing session.
for (const reduced of [false, true]) for (const still of [false, true]) for (const seen of [false, true]) {
  assert.equal(arrival.shouldPlayArrival(reduced, still, seen), !(reduced || still || seen))
}
const compile = name => ts.transpileModule(fs.readFileSync(path.join(ROOT, 'app/components', name), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText
const stored = new Map(), policy = {}, browser = { sessionStorage: { getItem: key => stored.get(key), setItem: (key, value) => stored.set(key, value) } }
vm.runInNewContext(compile('island-arrival.ts'), { exports: policy, require, window: browser })
assert.equal(policy.sessionFlag(arrival.ARRIVAL_SESSION_KEY), false)
policy.setSessionFlag(arrival.ARRIVAL_SESSION_KEY)
assert.equal(policy.sessionFlag(arrival.ARRIVAL_SESSION_KEY), true)
policy.setSessionFlag(arrival.STILL_SESSION_KEY)
assert.equal(policy.sessionFlag(arrival.STILL_SESSION_KEY), true)
policy.setSessionFlag(arrival.STILL_SESSION_KEY, false)
assert.equal(policy.sessionFlag(arrival.STILL_SESSION_KEY), false)
browser.sessionStorage = { getItem() { throw Error('denied') }, setItem() { throw Error('denied') } }
assert.equal(policy.sessionFlag(arrival.ARRIVAL_SESSION_KEY), false)
assert.doesNotThrow(() => policy.setSessionFlag(arrival.ARRIVAL_SESSION_KEY))

function controller(options = {}) {
  const hooks = [], effects = []
  let index = 0, frame, controls
  const stats = { starts: 0, ends: 0, routes: 0 }
  const dom = { style: {}, clientWidth: 390, clientHeight: 844, addEventListener() {}, removeEventListener() {}, setAttribute() {}, ownerDocument: { addEventListener() {}, removeEventListener() {} } }
  const state = { camera: new THREE.PerspectiveCamera(45, 390 / 844, .1, 260), gl: { domElement: dom }, size: { width: 390, height: 844 }, invalidate() {} }
  state.camera.position.set(25, 17, 23)
  const react = {
    useRef(initial) { return hooks[index++] ||= { current: initial } },
    useEffect(callback, dependencies) {
      const current = index++, previous = hooks[current]
      if (!previous || dependencies.some((value, i) => value !== previous.dependencies[i])) effects.push(() => {
        previous?.cleanup?.(); hooks[current] = { dependencies, cleanup: callback() }
      })
    },
  }
  const exports = {}
  vm.runInNewContext(compile('IslandControls.tsx'), { exports, console, document: dom.ownerDocument, require: name => {
    if (name === 'react') return react
    if (name === '@react-three/fiber') return { useThree: () => state, useFrame: callback => { frame = callback } }
    if (name === 'three-stdlib') return { OrbitControls: class extends OrbitControls { constructor(...args) { super(...args); controls = this } } }
    if (name === './camera-path') return { ...sourceModule('camera-path'), createCameraGuard: () => ({ safe: () => true, clear: () => true, route: (a, b) => { stats.routes++; return options.blocked ? null : [a.clone(), b.clone()] } }) }
    return name.startsWith('./') ? sourceModule(name.slice(2)) : require(name)
  } })
  const props = { arrival: 'pending', request: { area: 'overview', serial: 0 }, zoom: { direction: 0, serial: 0 }, focus: null, model: new THREE.Group(), enabled: false, reduced: false, onArrivalStart() { stats.starts++; props.arrival = 'playing' }, onArrivalEnd() { stats.ends++; props.arrival = 'done' }, onMoving() {}, onInteract() {}, onOverview() {}, onSectionStep() {}, onFocusArrive() {}, onFocusReturn() {}, ...options.props }
  const render = () => { index = 0; exports.default(props); while (effects.length) effects.shift()() }
  const tick = (count = 1) => { for (let i = 0; i < count; i++) { frame(state, 1 / 60); render() } }
  const change = patch => { Object.assign(props, patch); render() }
  const atOverview = () => {
    const expected = overview(state.size.width, state.size.height)
    assert.ok(state.camera.position.distanceTo(expected.destination) < 1e-7, 'Camera missed overview')
    assert.ok(controls.target.distanceTo(expected.target) < 1e-7, 'Target missed overview')
    assert.ok(Math.abs(state.camera.fov - cameraFov(state.size.width / state.size.height)) < 1e-7)
  }
  render()
  return { state, stats, props, tick, change, atOverview, controls: () => controls }
}

const normal = controller()
normal.tick(240)
assert.equal(normal.stats.starts, 0, 'Arrival started behind loading screen')
assert.ok(normal.state.camera.position.y >= 72)
normal.change({ enabled: true }); normal.tick(1)
assert.equal(normal.stats.starts, 1)
normal.tick(105)
assert.ok(normal.state.camera.position.y > 30 && normal.state.camera.position.y < 65, 'No cloud-layer descent')
normal.tick(104)
assert.equal(normal.stats.ends, 0, 'Arrival ended before 3.5 seconds')
normal.tick(2); normal.atOverview()
assert.equal(normal.stats.ends, 1)
normal.tick(240); normal.atOverview()
assert.equal(normal.stats.starts, 1, 'Arrival replayed')
assert.equal(normal.controls().enabled, true, 'Controls not returned')

for (const frame of [0, 30, 150]) {
  const skip = controller()
  skip.tick(); skip.change({ enabled: true }); skip.tick(frame)
  skip.change({ arrival: 'done' }); skip.tick(); skip.atOverview()
  skip.tick(240); skip.atOverview()
  assert.equal(skip.stats.ends, 1, 'Skip did not settle exactly once')
}
const interrupted = controller()
interrupted.tick(); interrupted.change({ enabled: true }); interrupted.tick(60)
interrupted.change({ arrival: 'done', request: { area: 'veranda', serial: 1 } }); interrupted.tick(300)
assert.ok(interrupted.state.camera.position.y < 10, 'Navigation after skip was lost')

const reduced = controller({ props: { reduced: true, enabled: true } })
reduced.tick(); reduced.atOverview(); assert.equal(reduced.stats.starts, 0)
const repeat = controller({ props: { arrival: 'done', enabled: true } })
repeat.tick(); repeat.atOverview(); assert.equal(repeat.stats.starts, 0)
// Scene readiness warms the camera before the loader permits input. Both a
// repeat visit and Still must paint the overview during those hidden frames.
for (const [label, props] of [
  ['repeat', { arrival: 'done' }],
  ['Still/reduced motion', { reduced: true }],
]) {
  const covered = controller({ props: { ...props, enabled: false } })
  covered.tick(); covered.atOverview()
  assert.equal(covered.controls().enabled, false, `${label}: setup must preserve the loader input lock`)
  covered.tick(180); covered.atOverview()
  assert.equal(covered.stats.starts, 0, `${label}: intro cannot start beneath the loader`)
  const preparedPosition = covered.state.camera.position.clone()
  covered.change({ enabled: true }); covered.tick(); covered.atOverview()
  assert.ok(covered.state.camera.position.distanceTo(preparedPosition) < 1e-8, `${label}: reveal must preserve the prepared overview`)
  assert.equal(covered.controls().enabled, true, `${label}: reveal restores exploration input`)
  assert.equal(covered.stats.starts, 0, `${label}: reveal must not restart the intro`)
}
const dynamicReduced = controller()
dynamicReduced.tick(); dynamicReduced.change({ enabled: true }); dynamicReduced.tick(60)
dynamicReduced.change({ reduced: true }); dynamicReduced.tick(); dynamicReduced.atOverview()
const blocked = controller({ blocked: true })
blocked.tick(); blocked.atOverview(); assert.equal(blocked.stats.starts, 0)
const paused = controller()
paused.tick(); paused.change({ enabled: true }); paused.tick(60)
const pausedPosition = paused.state.camera.position.clone()
paused.change({ enabled: false }); paused.tick(300)
assert.ok(paused.state.camera.position.distanceTo(pausedPosition) < 1e-8)
paused.change({ enabled: true }); paused.tick(160); paused.atOverview()
const waiting = controller({ props: { model: null, enabled: true } })
waiting.tick(300); assert.equal(waiting.stats.starts, 0)
waiting.change({ model: new THREE.Group() }); waiting.tick(215); waiting.atOverview()
console.log(`Arrival passed: 4 guarded viewports, ${clearanceSamples} clearance samples, timing, loader handoff, covered repeat/Still overview, skip, navigation, reduced motion, session policy, pause and late model`)
