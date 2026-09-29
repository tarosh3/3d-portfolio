/* Exercise the real controller and OrbitControls without a WebGL context. */
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')
const ts = require('typescript')
const THREE = require('three')
const { OrbitControls } = require('three-stdlib')
const root = path.resolve(__dirname, '../app/components')
const hooks = [], effects = [], modules = new Map()
let hookIndex = 0, frame, controls, routeCount = 0, pathMeasurements = 0, collision = false
const dom = { style: {}, clientWidth: 390, clientHeight: 844, addEventListener() {}, removeEventListener() {}, setAttribute() {}, ownerDocument: { addEventListener() {}, removeEventListener() {} } }
const state = { camera: new THREE.PerspectiveCamera(72, 390 / 844, .1, 260), gl: { domElement: dom }, size: { width: 390, height: 844 }, invalidate() {} }
state.camera.position.set(25, 17, 23)
const react = {
  useRef(initial) { const index = hookIndex++; return hooks[index] ||= { current: initial } },
  useEffect(callback, dependencies) {
    const index = hookIndex++, previous = hooks[index]
    if (!previous || dependencies.some((value, i) => value !== previous.dependencies[i])) {
      effects.push(() => { previous?.cleanup?.(); hooks[index] = { dependencies, cleanup: callback() } })
    }
  },
}
function load(name) {
  if (modules.has(name)) return modules.get(name)
  const exports = {}
  const source = ts.transpileModule(fs.readFileSync(path.join(root, name), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText
  vm.runInNewContext(source, { exports, console, document: dom.ownerDocument, require: dependency => {
    if (dependency === 'react') return react
    if (dependency === '@react-three/fiber') return { useThree: () => state, useFrame: callback => { frame = callback } }
    if (dependency === 'three-stdlib') return { OrbitControls: class extends OrbitControls { constructor(...args) { super(...args); controls = this } } }
    if (dependency === './camera-path') return { ...load('camera-path.ts'), pathDistance: points => {
      pathMeasurements++
      return load('camera-path.ts').pathDistance(points)
    }, createCameraGuard: () => ({
      safe: () => !collision, clear: () => !collision,
      route: (from, to) => { routeCount++; return [from.clone(), to.clone()] },
    }) }
    if (dependency.startsWith('./')) return load(dependency.slice(2) + '.ts')
    return require(dependency)
  } }, { filename: name })
  modules.set(name, exports)
  return exports
}
const Controller = load('IslandControls.tsx').default
const moving = []
let props = { arrival: 'done', onArrivalStart() {}, onArrivalEnd() {}, request: { area: 'overview', serial: 0 }, zoom: { direction: 0, serial: 0 }, focus: null, model: new THREE.Group(), reduced: false, enabled: true, onMoving: value => moving.push(value), onInteract() {}, onOverview() {}, onSectionStep() {}, onFocusArrive() {}, onFocusReturn() {} }
const render = () => { hookIndex = 0; Controller(props); while (effects.length) effects.shift()() }
const tick = (count = 1) => { for (let i = 0; i < count; i++) frame(state, 1 / 60) }
const equalVector = (a, b, message) => assert.ok(a.distanceTo(b) < .000001, message)
render(); tick()

// Collapsing the mobile browser bar must not route back to an area pose.
controls.dispatchEvent({ type: 'start' })
controls.setAzimuthalAngle(controls.getAzimuthalAngle() + .15)
tick(120)
const explored = state.camera.position.clone(), target = controls.target.clone(), before = routeCount
state.size.height = 700; render(); tick(90)
equalVector(state.camera.position, explored, 'toolbar resize reset the explored camera')
equalVector(controls.target, target, 'toolbar resize changed the orbit target')
assert.equal(routeCount, before, 'toolbar resize started a new route')

// A resize halfway through travel must keep the same journey, including timing.
props.request = { area: 'veranda', serial: 1 }; render(); tick(60)
const routesDuringFlight = routeCount, journeyStarts = moving.filter(Boolean).length
state.size.height = 790; render(); tick(260)
assert.equal(routeCount, routesDuringFlight, 'height change restarted the flight')
assert.equal(moving.filter(Boolean).length, journeyStarts)
assert.equal(moving.at(-1), false)

// Touching a nearly completed close-range flight must not clamp it outward.
props.request = { area: 'veranda', serial: 2 }; render(); tick()
controls.dispatchEvent({ type: 'start' })
const nearCamera = state.camera.position.clone(); tick()
equalVector(state.camera.position, nearCamera, 'interrupt snapped the near camera outward')

// Drag velocity must settle before a new controlled flight.
controls.dispatchEvent({ type: 'start' }); controls.setAzimuthalAngle(controls.getAzimuthalAngle() + .2)
props.request = { area: 'cabin', serial: 3 }; render(); tick(300)
const arrival = state.camera.position.clone(); tick(120)
equalVector(state.camera.position, arrival, 'drag inertia leaked into the flight endpoint')

// Button zoom eases over multiple frames and stops cleanly at a collision.
props.zoom = { direction: 1, serial: 1 }; render()
const radiusBefore = state.camera.position.distanceTo(controls.target)
const zoomTarget = Math.max(controls.minDistance, radiusBefore * .88)
tick()
const firstRadius = state.camera.position.distanceTo(controls.target)
assert.ok(firstRadius < radiusBefore && firstRadius > zoomTarget, 'zoom jumped instantly')
tick(120)
assert.ok(Math.abs(state.camera.position.distanceTo(controls.target) - zoomTarget) < .01)
const safeCamera = state.camera.position.clone()
collision = true; props.zoom = { direction: -1, serial: 2 }; render(); tick(80)
assert.ok(state.camera.position.distanceTo(safeCamera) < .002, 'zoom crossed the collision boundary')
const stopped = state.camera.position.clone(); tick(80)
equalVector(state.camera.position, stopped, 'collision rollback kept jittering')

// Reading must retain its measured route through every frame and restore the
// actual explored pose after pausing, without leaking the reading orientation.
collision = false
const readPosition = state.camera.position.clone(), readTarget = controls.target.clone()
const readQuaternion = state.camera.quaternion.clone(), readUp = state.camera.up.clone(), readFov = state.camera.fov
let focusArrivals = 0, focusReturns = 0
props.onFocusArrive = () => focusArrivals++
props.onFocusReturn = () => focusReturns++
props.focus = { serial: 1, request: { stage: 1 }, phase: 'approach' }
const beforeApproach = pathMeasurements
render(); tick()
assert.equal(pathMeasurements, beforeApproach + 1, 'measure the approach when it is created')
tick(300)
assert.equal(focusArrivals, 1, 'reading must wait for camera arrival')
assert.equal(pathMeasurements, beforeApproach + 1, 'reading frames rescanned the unchanged route')
props.focus = { ...props.focus, phase: 'reading' }; props.enabled = false; render()
const heldPosition = state.camera.position.clone(); tick(60)
equalVector(state.camera.position, heldPosition, 'paused reader moved the camera')
props.focus = { ...props.focus, phase: 'return' }; props.enabled = true; render(); tick()
const returnMeasurements = pathMeasurements
assert.equal(returnMeasurements, beforeApproach + 3, 'clamp the travelled distance and measure the reversed route once at creation')
tick(300)
assert.equal(pathMeasurements, returnMeasurements, 'return frames rescanned the unchanged route')
assert.equal(focusReturns, 1)
equalVector(state.camera.position, readPosition, 'reader return missed the explored camera')
equalVector(controls.target, readTarget, 'reader return missed the explored target')
equalVector(state.camera.up, readUp, 'reader return changed world-up')
assert.ok(state.camera.quaternion.angleTo(readQuaternion) < 1e-7, 'reader return changed the explored orientation')
assert.ok(Math.abs(state.camera.fov - readFov) < 1e-8, 'reader return changed the explored lens')
props.focus = null; render()

// Still mode resolves movement immediately instead of leaving damping active.
collision = false; props.reduced = true; props.request = { area: 'overview', serial: 4 }; render(); tick()
assert.equal(moving.at(-1), false); assert.equal(controls.enableDamping, false)
console.log('8 mobile camera scenarios passed: resize, travel, interruption, inertia, zoom, collision, reader return, Still')
