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
const domListeners = new Map()
const dom = { style: {}, clientWidth: 390, clientHeight: 844, addEventListener(type, callback, options) { domListeners.set(`${type}:${Boolean(options?.capture)}`, callback) }, removeEventListener(type, callback, options) { domListeners.delete(`${type}:${options === true || Boolean(options?.capture)}`) }, setAttribute() {}, ownerDocument: { addEventListener() {}, removeEventListener() {} } }
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
const moving = [], gestures = [], areaArrivals = []
let props = { arrival: 'done', onArrivalStart() {}, onArrivalEnd() {}, request: { area: 'overview', serial: 0 }, zoom: { direction: 0, serial: 0 }, focus: null, model: new THREE.Group(), reduced: false, enabled: true, onMoving: value => moving.push(value), onAreaArrive: serial => areaArrivals.push(serial), onInteract() {}, onOverview() {}, onSectionStep() {}, onFocusArrive() {}, onFocusReturn() {}, onExploreGesture: gesture => gestures.push(gesture) }
const render = () => { hookIndex = 0; Controller(props); while (effects.length) effects.shift()() }
const tick = (count = 1) => { for (let i = 0; i < count; i++) frame(state, 1 / 60) }
const equalVector = (a, b, message) => assert.ok(a.distanceTo(b) < .000001, message)
render(); tick()
assert.deepEqual(areaArrivals, [0], 'the initial overview reports its completed request')

// A touch/click alone does not teach orbiting: wait for a real camera change.
controls.dispatchEvent({ type: 'start' }); tick(120)
controls.dispatchEvent({ type: 'end' }); tick(60)
assert.deepEqual(gestures, [], 'pointer/start without movement cannot complete a lesson')

// Collapsing the mobile browser bar must not route back to an area pose.
controls.dispatchEvent({ type: 'start' })
controls.setAzimuthalAngle(controls.getAzimuthalAngle() + .15)
tick(120)
assert.deepEqual(gestures, ['orbit'], 'report one accepted orbit, not every damping frame')
const explored = state.camera.position.clone(), target = controls.target.clone(), before = routeCount
state.size.height = 700; render(); tick(90)
equalVector(state.camera.position, explored, 'toolbar resize reset the explored camera')
equalVector(controls.target, target, 'toolbar resize changed the orbit target')
assert.equal(routeCount, before, 'toolbar resize started a new route')
assert.deepEqual(areaArrivals, [0], 'orbiting and resizing are not new area arrivals')

// A resize halfway through travel must keep the same journey, including timing.
props.request = { area: 'veranda', serial: 1 }; render(); tick(60)
const routesDuringFlight = routeCount, journeyStarts = moving.filter(Boolean).length
state.size.height = 790; render(); tick(260)
assert.equal(routeCount, routesDuringFlight, 'height change restarted the flight')
assert.equal(moving.filter(Boolean).length, journeyStarts)
assert.equal(moving.at(-1), false)
assert.equal(areaArrivals.filter(serial => serial === 1).length, 1, 'travel reports arrival exactly once')

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
const beforeZoomEvents = gestures.length
props.zoom = { direction: 1, serial: 1 }; render()
assert.equal(gestures.length, beforeZoomEvents, 'requesting zoom alone does not complete the lesson')
const radiusBefore = state.camera.position.distanceTo(controls.target)
const zoomTarget = Math.max(controls.minDistance, radiusBefore * .88)
tick()
const firstRadius = state.camera.position.distanceTo(controls.target)
assert.ok(firstRadius < radiusBefore && firstRadius > zoomTarget, 'zoom jumped instantly')
tick(120)
assert.ok(Math.abs(state.camera.position.distanceTo(controls.target) - zoomTarget) < .01)
assert.deepEqual(gestures.slice(beforeZoomEvents), ['zoom'], 'accepted button zoom reports exactly once')
const safeCamera = state.camera.position.clone()
const beforeBlockedEvents = gestures.length
collision = true; props.zoom = { direction: -1, serial: 2 }; render(); tick(80)
assert.ok(state.camera.position.distanceTo(safeCamera) < .002, 'zoom crossed the collision boundary')
const stopped = state.camera.position.clone(); tick(80)
equalVector(state.camera.position, stopped, 'collision rollback kept jittering')
assert.equal(gestures.length, beforeBlockedEvents, 'collision-blocked zoom cannot complete a lesson')
controls.dispatchEvent({ type: 'start' })
controls.setAzimuthalAngle(controls.getAzimuthalAngle() + .1)
tick(90)
equalVector(state.camera.position, stopped, 'blocked orbit must return to its safe pose')
assert.equal(gestures.length, beforeBlockedEvents, 'collision-blocked orbit cannot complete a lesson')

// Reading must retain its measured route through every frame and restore the
// actual explored pose after pausing, without leaking the reading orientation.
collision = false
const readPosition = state.camera.position.clone(), readTarget = controls.target.clone()
const readQuaternion = state.camera.quaternion.clone(), readUp = state.camera.up.clone(), readFov = state.camera.fov
const beforeReadingEvents = gestures.length
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
assert.equal(gestures.length, beforeReadingEvents, 'automatic reader camera movement is not user exploration')
props.focus = null; render()

// A film owns the camera continuously, keeps its active-time clock while hidden,
// and returns the exact shot without consuming a simultaneous navigation request.
let atmosphereChanges = 0, cinemaEnds = 0
props.onCinematicMinute = () => atmosphereChanges++
props.onCinematicEnd = () => { cinemaEnds++ }
const cinemaOrigin = state.camera.position.clone(), cinemaGaze = controls.target.clone(), cinemaLens = state.camera.fov
const requestBeforeCinema = props.request, routesBeforeCinema = routeCount
props.cinematic = { serial: 1, seed: 0xabc123 }
render()
equalVector(state.camera.position, cinemaOrigin, 'Starting must retain the live camera immediately')
equalVector(controls.target, cinemaGaze, 'Starting must retain the live gaze immediately')
assert.equal(state.camera.fov, cinemaLens)
tick()
assert.ok(state.camera.position.distanceTo(cinemaOrigin) < .001, 'First cinematic frame starts in place')
assert.ok(controls.target.distanceTo(cinemaGaze) < .001, 'First cinematic frame retains the explored gaze')
assert.equal(routeCount, routesBeforeCinema, 'The cinematic route must not reuse section-navigation paths')
assert.equal(props.request, requestBeforeCinema)
tick(599)
assert.equal(controls.enabled, false, 'Orbit controls must not clamp a cinematic shot')
const cinemaStart = state.camera.position.clone(), cinemaRoutes = routeCount
props.enabled = false; render(); tick(3600)
equalVector(state.camera.position, cinemaStart, 'Hidden cinematic tour must not move')
assert.equal(atmosphereChanges, 0, 'Hidden time cannot advance weather')
props.enabled = true; render(); tick(3000)
assert.equal(atmosphereChanges, 0, 'Atmosphere must wait for a complete active minute')
tick(2)
assert.equal(atmosphereChanges, 1, 'Atmosphere changes once at one active minute')
state.size.height = 690; render(); tick(180)
assert.equal(routeCount, cinemaRoutes, 'Phone toolbar resize cannot rebuild a cinematic route')
assert.ok(state.camera.position.distanceTo(cinemaOrigin) > 5, 'Cinematic tour travels around the island')
tick(3600)
assert.equal(atmosphereChanges, 2, 'Atmosphere continues changing once per minute')
const stopPose = state.camera.position.clone(), stopTarget = controls.target.clone()
props.cinematic = null; render(); tick()
equalVector(state.camera.position, stopPose, 'Stopping the film must retain its current shot')
equalVector(controls.target, stopTarget, 'Stopping the film must retain its gaze')
assert.equal(controls.enabled, true)
controls.dispatchEvent({ type: 'start' }); controls.setAzimuthalAngle(controls.getAzimuthalAngle() + .3); tick(120)
const changedOrigin = state.camera.position.clone(), changedGaze = controls.target.clone()
assert.ok(changedOrigin.distanceTo(stopPose) > 1, 'Manual exploration must move the camera for this regression')
props.cinematic = { serial: 2, seed: 0xabc123 }; render(); tick()
assert.ok(state.camera.position.distanceTo(changedOrigin) < .001, 'Restarting with even the same seed starts at the new view')
assert.ok(controls.target.distanceTo(changedGaze) < .001, 'Restarting retains the new gaze')
tick(499)
const pointerPose = state.camera.position.clone()
domListeners.get('pointerdown:true')()
assert.equal(cinemaEnds, 1, 'Pointer down cancels the tour immediately')
assert.equal(controls.enabled, true, 'The very first drag can take camera control')
props.cinematic = null; render(); tick()
equalVector(state.camera.position, pointerPose, 'Pointer takeover must not snap the camera')
props.cinematic = { serial: 3, seed: 0xdeadbeef }; render(); tick(400)
const routesBeforeNavigate = routeCount
props.cinematic = null; props.request = { area: 'cabin', serial: 5 }; render(); tick()
assert.equal(routeCount, routesBeforeNavigate + 1, 'Stopping and navigating must preserve the new section request')
tick(300)
props.cinematic = { serial: 4, seed: 998877 }; render(); tick(300)
const stillPose = state.camera.position.clone()
props.reduced = true; render(); tick()
assert.equal(cinemaEnds, 2, 'Still mode cancels automatic travel')
equalVector(state.camera.position, stillPose, 'Still mode freezes the cinematic pose')
props.cinematic = null; render()

// Still mode resolves movement immediately instead of leaving damping active.
collision = false; props.reduced = true; props.request = { area: 'overview', serial: 6 }; render(); tick()
assert.equal(moving.at(-1), false); assert.equal(controls.enableDamping, false)
props.request = { area: 'veranda', serial: 7 }; render(); tick()
const failedOrigin = state.camera.position.clone(), failedGaze = controls.target.clone(), failedRoutes = routeCount, failedRequest = props.request
collision = true; props.reduced = false; props.cinematic = { serial: 5, seed: 556677 }; render(); tick(120)
equalVector(state.camera.position, failedOrigin, 'Rejected cinematic route must leave the current view in place')
equalVector(controls.target, failedGaze, 'Rejected cinematic route must retain the current gaze')
assert.equal(routeCount, failedRoutes, 'Rejected route must not start an overview flight')
assert.equal(props.request, failedRequest)

// Stopping a route is distinct from arriving. A drag in mid-flight must not
// claim its destination, even after the original route's duration has elapsed.
collision = false; props.cinematic = null; props.reduced = false
props.request = { area: 'overview', serial: 100 }; render(); tick(300)
assert.equal(areaArrivals.filter(serial => serial === 100).length, 1)
props.request = { area: 'veranda', serial: 101 }; render(); tick(30)
assert.equal(areaArrivals.includes(101), false, 'in-flight destination is not reached yet')
controls.dispatchEvent({ type: 'start' }); tick(300)
assert.equal(moving.at(-1), false, 'the user may interrupt a camera flight')
assert.equal(areaArrivals.includes(101), false, 'interruption must never acknowledge area arrival')
props.request = { area: 'veranda', serial: 102 }; render(); tick(300)
assert.equal(areaArrivals.filter(serial => serial === 102).length, 1, 'a fresh request can finish the interrupted route')
props.reduced = true; props.request = { area: 'overview', serial: 103 }; render(); tick()
assert.equal(areaArrivals.filter(serial => serial === 103).length, 1, 'Still mode acknowledges its immediate destination')
tick(90)
assert.equal(areaArrivals.filter(serial => serial === 103).length, 1, 'idle demand frames must not repeat arrival')

// Remount through the same hook harness to exercise the one-time fly-in path.
const remount = () => {
  for (const hook of hooks) hook?.cleanup?.()
  hooks.length = 0
  state.camera = new THREE.PerspectiveCamera(72, 390 / 844, .1, 260)
  state.camera.position.set(25, 17, 23)
  render()
}
props.reduced = false; props.arrival = 'pending'; props.zoom = { direction: 0, serial: 0 }
props.request = { area: 'overview', serial: 104 }; remount(); tick(300)
assert.equal(areaArrivals.filter(serial => serial === 104).length, 1, 'the completed fly-in acknowledges overview once')
props.request = { area: 'overview', serial: 105 }; remount(); tick(20)
props.arrival = 'done'; props.request = { area: 'veranda', serial: 106 }; render(); tick()
assert.equal(areaArrivals.includes(106), false, 'skipping the intro cannot acknowledge a queued section at overview')
tick(300)
assert.equal(areaArrivals.filter(serial => serial === 106).length, 1, 'the queued section acknowledges only its own arrival')
console.log('Mobile camera scenarios passed: completed area arrivals, interrupted/queued flight rejection, Still and fly-in arrival, real gesture reporting, click-only/blocked-gesture rejection, resize, travel, inertia, zoom, collision, reader return, cinematic live-view start/restart, pause/resume, minute changes, pointer takeover, rejected-route preservation and navigation handoff')
