/* Exercise the actual loader/readiness hooks with a deterministic browser clock.
 * This checks lifecycle behavior; browser QA still verifies WebGL and CSS paint. */
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')
const ts = require('typescript')
const THREE = require('three')
const { ROOT, sourceModule } = require('./island-geometry.cjs')
const { loadingPhase, loadingTarget, EMPTY_LOAD_PROGRESS, LOADER_EXIT_MS, LOADER_SETTLE_MS } = sourceModule('loading-progress')
const downloaded = { ...EMPTY_LOAD_PROGRESS, total: 10, loaded: 10, progress: 100 }
assert.equal(loadingPhase(EMPTY_LOAD_PROGRESS, false, false), 'loading', 'Initial setup is visibly loading')
assert.equal(loadingPhase({ ...downloaded, active: true }, false, false), 'loading', '100% during an active batch is still downloading')
assert.equal(loadingPhase(downloaded, false, false), 'finishing', 'Downloaded assets still need scene preparation')
assert.equal(loadingPhase({ ...downloaded, total: 12 }, false, false), 'loading', 'Newly discovered assets return to the loading stage')
assert.equal(loadingPhase(downloaded, true, false), 'ready')
assert.equal(loadingPhase(downloaded, true, true), 'error', 'An error wins over readiness')
let target = 0
for (const amount of [0, 70, 20, 90, 30, 100]) {
  const next = loadingTarget(target, amount, false)
  assert.ok(next >= target && next <= .9, 'Asset discovery must not reverse or complete progress')
  target = next
}
assert.equal(Math.round(target * 100), 90)
assert.equal(loadingTarget(target, 0, true), 1, 'Only scene/font readiness permits completion')
for (const value of [NaN, Infinity, -30]) assert.equal(loadingTarget(0, value, false), 0)
assert.equal(Math.round(loadingTarget(0, 200, false) * 100), 90)

const equalDeps = (a, b) => a && b && a.length === b.length && a.every((value, index) => Object.is(value, b[index]))
function harness(filename, initialProps, options = {}) {
  const slots = [], effects = [], frames = new Map(), timers = new Map(), mediaListeners = new Set()
  let cursor = 0, now = 100, nextId = 1, dirty = false, tree, mounted = true, sceneFrame
  const props = { ...initialProps }
  const media = { matches: Boolean(options.reduced), addEventListener: (_, callback) => mediaListeners.add(callback), removeEventListener: (_, callback) => mediaListeners.delete(callback) }
  const react = {
    useRef(value) { const index = cursor++; return slots[index] ||= { current: value } },
    useState(value) {
      const index = cursor++
      if (!slots[index]) slots[index] = { value: typeof value === 'function' ? value() : value }
      return [slots[index].value, update => {
        const next = typeof update === 'function' ? update(slots[index].value) : update
        if (!Object.is(next, slots[index].value)) { slots[index].value = next; dirty = true }
      }]
    },
    useCallback(callback, dependencies) {
      const index = cursor++
      if (!equalDeps(slots[index]?.dependencies, dependencies)) slots[index] = { dependencies, callback }
      return slots[index].callback
    },
    useEffect(callback, dependencies) {
      const index = cursor++, previous = slots[index]
      if (!equalDeps(previous?.dependencies, dependencies)) effects.push(() => {
        previous?.cleanup?.()
        slots[index] = { dependencies, effect: callback, cleanup: callback() }
      })
    },
  }
  const jsx = (type, props) => ({ type, props })
  const exports = {}
  const requestAnimationFrame = callback => { const id = nextId++; frames.set(id, callback); return id }
  const cancelAnimationFrame = id => frames.delete(id)
  const setTimeout = (callback, delay) => { const id = nextId++; timers.set(id, { callback, at: now + delay }); return id }
  const clearTimeout = id => timers.delete(id)
  const storage = { getItem() { if (options.deniedStorage) throw Error('Storage denied'); return options.still ? '1' : null } }
  const code = ts.transpileModule(fs.readFileSync(path.join(ROOT, 'app/components', filename), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, jsx: ts.JsxEmit.ReactJSX },
  }).outputText
  vm.runInNewContext(code, {
    exports, console, performance: { now: () => now }, requestAnimationFrame, cancelAnimationFrame, setTimeout, clearTimeout,
    window: { matchMedia: () => media }, sessionStorage: storage,
    require(name) {
      if (name === 'react') return react
      if (name === './LoadingArtwork' || name === './BrandLogo') return { default: () => null }
      if (name === 'react/jsx-runtime') return { jsx, jsxs: jsx, Fragment: 'fragment' }
      if (name === '@react-three/fiber') return { useThree: () => options.scene, useFrame: callback => { sceneFrame = callback } }
      return name.startsWith('./') ? sourceModule(name.slice(2)) : require(name)
    },
  })
  function visit(node, callback) {
    if (Array.isArray(node)) return node.forEach(child => visit(child, callback))
    if (!node || typeof node !== 'object') return
    callback(node)
    visit(node.props?.children, callback)
  }
  function render() {
    if (!mounted) return
    let rounds = 0
    do {
      assert.ok(rounds++ < 20, 'Render updates did not settle')
      dirty = false; cursor = 0
      tree = exports.default(props)
      visit(tree, node => {
        if (!node.props.ref) return
        const ref = node.props.ref
        ref.current ||= { style: { setProperty(key, value) { this[key] = value } }, attributes: {}, setAttribute(key, value) { this.attributes[key] = value }, textContent: String(node.props.children ?? '') }
      })
      while (effects.length) effects.shift()()
    } while (dirty)
  }
  function advance(milliseconds = 1000 / 60, animate = true) {
    now += milliseconds
    for (const [id, timer] of [...timers]) if (timer.at <= now && timers.delete(id)) { timer.callback(); render() }
    if (animate) for (const [id, callback] of [...frames]) if (frames.delete(id)) { callback(now); render() }
  }
  render()
  return {
    props, render, advance, frames, timers, mediaListeners,
    find(predicate) { let result; visit(tree, node => { if (!result && predicate(node)) result = node }); return result },
    change(patch) { Object.assign(props, patch); render() },
    strictReplay() {
      const replay = slots.filter(slot => slot?.effect)
      replay.forEach(slot => slot.cleanup?.())
      replay.forEach(slot => { slot.cleanup = slot.effect() })
      render()
    },
    mediaChange(value) { media.matches = value; mediaListeners.forEach(callback => callback()); render() },
    sceneFrame() { sceneFrame(); render() },
    unmount() { mounted = false; slots.forEach(slot => slot?.cleanup?.()) },
  }
}

function loader(options = {}) {
  const calls = { reveal: 0, complete: 0 }
  const component = harness('LoadingScreen.tsx', {
    progress: { ...EMPTY_LOAD_PROGRESS }, ready: false, failed: null,
    onReveal: () => calls.reveal++, onComplete: () => calls.complete++, ...options.props,
  }, options)
  const untilReveal = () => {
    for (let frame = 0; frame < 600 && !calls.reveal; frame++) component.advance()
    assert.equal(calls.reveal, 1, 'Prepared loader reveals once')
  }
  return { ...component, calls, untilReveal,
    percent: () => Number(component.find(node => node.props?.role === 'progressbar').props['aria-valuenow']),
    transition(target = 'root', propertyName = 'opacity') {
      const root = component.find(node => node.type === 'section'), element = root.props.ref.current
      root.props.onTransitionEnd({ target: target === 'root' ? element : {}, currentTarget: element, propertyName })
      component.render()
    },
  }
}

const normal = loader({ deniedStorage: true })
normal.strictReplay()
assert.equal(normal.find(node => node.props?.['aria-current'] === 'step').props['data-state'], 'current', 'The initial loading stage is visible immediately')
assert.equal(normal.frames.size, 0, 'Loader motion must not use a main-thread RAF loop')
assert.equal(normal.mediaListeners.size, 1, 'Strict Mode leaves one preference listener')
normal.change({ progress: { ...EMPTY_LOAD_PROGRESS, progress: 100 } })
for (let frame = 0; frame < 300; frame++) normal.advance()
assert.equal(normal.percent(), 90)
assert.equal(normal.calls.reveal, 0, 'Fully loaded assets cannot reveal an unprepared scene')
normal.advance(12000, false)
assert.match(normal.find(node => node.props?.className === 'arrival-help').props.children, /Still preparing/, 'A long wait offers a clear reading alternative')
normal.change({ ready: true }); normal.untilReveal()
assert.equal(normal.percent(), 100)
assert.equal(normal.calls.complete, 0, 'Interface waits for the loader exit')
normal.transition('child'); normal.transition('root', 'transform')
assert.equal(normal.calls.complete, 0, 'Child and unrelated transition events cannot complete the loader')
normal.transition(); normal.transition()
normal.advance(LOADER_EXIT_MS + 200)
assert.equal(normal.calls.complete, 1, 'Transition and timeout cannot complete twice')
normal.unmount()
assert.equal(normal.frames.size + normal.timers.size + normal.mediaListeners.size, 0, 'Unmount clears callbacks and listeners')

const fallback = loader({ props: { ready: true } })
fallback.untilReveal(); fallback.advance(LOADER_EXIT_MS + 101, false)
assert.equal(fallback.calls.complete, 1, 'Missing transition events still finish in hidden tabs')

for (const options of [{ reduced: true }, { still: true }]) {
  const instant = loader({ ...options, props: { ready: true } })
  instant.advance()
  assert.equal(instant.percent(), 100)
  assert.equal(instant.calls.reveal, 1, 'Reduced motion and Still skip the animated fill')
  instant.advance(1, false)
  assert.equal(instant.calls.complete, 1, 'Reduced motion and Still skip the animated exit')
  instant.unmount()
}
const changingMotion = loader({ props: { ready: true } })
changingMotion.untilReveal(); changingMotion.mediaChange(true); changingMotion.advance(1, false)
assert.equal(changingMotion.calls.complete, 1, 'Changing reduced motion mid-exit cannot strand the loader')

for (const props of [
  { failed: 'WebGL failed', ready: true },
  { ready: true, progress: { ...EMPTY_LOAD_PROGRESS, progress: 100, errors: ['texture.jpg'] } },
]) {
  const failed = loader({ props })
  for (let frame = 0; frame < 300; frame++) failed.advance()
  assert.equal(failed.calls.reveal + failed.calls.complete, 0, 'Renderer and asset errors hold the loader')
  assert.ok(failed.percent() <= 90, 'Failure cannot claim complete preparation')
  assert.equal(failed.find(node => node.props?.role === 'status').props.children, 'The island couldn’t be reached.')
  assert.equal(failed.find(node => node.type === 'a').props.href, '/read', 'Failure preserves the text-edition escape')
  failed.unmount()
}
const unsettled = loader({ props: { ready: true } })
unsettled.advance(LOADER_SETTLE_MS / 2, false)
assert.equal(unsettled.calls.reveal, 0, 'Ready GPU receives a quiet compositor settling interval')
unsettled.change({ ready: false })
unsettled.advance(LOADER_SETTLE_MS * 2, false)
assert.equal(unsettled.calls.reveal, 0, 'New pending resources cancel a scheduled reveal')
unsettled.change({ ready: true }); unsettled.untilReveal(); unsettled.unmount()
const abandoned = loader()
abandoned.unmount(); abandoned.advance(20000)
assert.equal(abandoned.calls.reveal + abandoned.calls.complete, 0, 'Unmounted loaders cannot reveal later')

function deferred() {
  let resolve, reject
  const promise = new Promise((yes, no) => { resolve = yes; reject = no })
  return { promise, resolve, reject }
}
function readiness(options = {}) {
  const calls = { compile: [], targets: [], compiled: 0, ready: 0, errors: [], invalidations: 0, matrices: 0 }
  const scene = {
    scene: { updateMatrixWorld: () => calls.matrices++, traverseVisible: callback => (options.meshes || []).forEach(callback) }, camera: {}, invalidate: () => calls.invalidations++,
    gl: options.sync ? { compile() { calls.compile.push(true) } } : { compileAsync() { calls.targets.push(target); const job = deferred(); calls.compile.push(job); return job.promise } },
  }
  let target = { name: 'previous target' }
  scene.gl.getRenderTarget = () => target
  scene.gl.setRenderTarget = value => { target = value }
  scene.gl.initTexture = texture => { calls.uploads ||= []; calls.uploads.push(texture) }
  const component = harness('SceneReadiness.tsx', { available: false, onCompiled: () => calls.compiled++, onReady: () => calls.ready++, onError: message => calls.errors.push(message), ...options.props }, { scene })
  return { ...component, calls, scene, async compile(index = calls.compile.length - 1) { calls.compile[index].resolve(); await Promise.resolve(); await Promise.resolve() } }
}
async function checkReadiness() {
  const colourTarget = { texture: { colorSpace: 'linear' } }
  const firstTexture = new THREE.Texture(), secondTexture = new THREE.Texture(), thirdTexture = new THREE.Texture()
  const material = new THREE.MeshStandardMaterial({ map: firstTexture, normalMap: secondTexture })
  const shader = new THREE.ShaderMaterial({ uniforms: { depth: { value: thirdTexture }, duplicate: { value: firstTexture } } })
  const upload = readiness({ props: { available: true, renderTarget: colourTarget }, meshes: [{ material: [material, shader] }] })
  const initialTarget = upload.scene.gl.getRenderTarget()
  const init = upload.scene.gl.initTexture
  upload.scene.gl.initTexture = texture => { init(texture); upload.advance(5, false) }
  assert.equal(upload.calls.compile.length, 0, 'Texture preparation precedes shader compilation')
  upload.advance(); assert.equal(upload.calls.uploads.length, 1, 'A costly texture yields before the next upload')
  upload.advance(); assert.equal(upload.calls.uploads.length, 2)
  upload.advance(); assert.equal(upload.calls.uploads.length, 3, 'Shared textures upload only once')
  assert.equal(upload.calls.targets[0], colourTarget, 'Compile the composer colour-space variant')
  assert.equal(upload.scene.gl.getRenderTarget(), initialTarget, 'Restore render target before asynchronous compilation resolves')
  await upload.compile()
  assert.equal(upload.calls.compiled, 1, 'Render loop unlocks only after preparation')
  assert.equal(upload.calls.ready, 0, 'Shader readiness does not bypass rendered warmup')
  upload.unmount()
  const cancelledUpload = readiness({ props: { available: true }, meshes: [{ material }] })
  cancelledUpload.unmount(); cancelledUpload.advance()
  assert.equal(cancelledUpload.calls.compile.length, 0, 'Unmount cancels scheduled texture upload')
  assert.equal(cancelledUpload.calls.uploads, undefined)
  const fresh = readiness()
  fresh.sceneFrame(); fresh.advance()
  assert.equal(fresh.calls.compile.length, 0, 'Unavailable assets/pipeline cannot start compilation')
  fresh.change({ available: true })
  fresh.sceneFrame(); fresh.sceneFrame(); fresh.advance()
  assert.equal(fresh.calls.ready, 0, 'Render frames before compilation cannot prepare the scene')
  fresh.strictReplay()
  assert.equal(fresh.calls.compile.length, 2, 'Strict Mode restarts the cancelled warmup')
  await fresh.compile(0)
  fresh.sceneFrame(); fresh.sceneFrame(); fresh.sceneFrame(); fresh.advance()
  assert.equal(fresh.calls.ready, 0, 'A stale compilation cannot reveal the replacement scene')
  await fresh.compile(1)
  fresh.sceneFrame(); fresh.sceneFrame()
  assert.equal(fresh.frames.size, 0, 'Two rendered warmup frames do not reveal yet')
  fresh.sceneFrame()
  assert.equal(fresh.calls.ready, 0, 'The final frame must reach the browser before reveal')
  fresh.advance()
  assert.equal(fresh.calls.ready, 1)
  fresh.sceneFrame(); fresh.advance(); fresh.change({ available: false }); fresh.change({ available: true })
  assert.equal(fresh.calls.ready, 1, 'Completed scene preparation is one-shot')
  assert.equal(fresh.calls.compile.length, 2, 'Later availability changes cannot restart a finished scene')

  const paused = readiness({ props: { available: true } })
  await paused.compile()
  paused.sceneFrame(); paused.sceneFrame(); paused.sceneFrame()
  paused.change({ available: false }); paused.advance()
  assert.equal(paused.calls.ready, 0, 'Pausing cancels the pending presentation callback')
  paused.change({ available: true }); await paused.compile()
  paused.sceneFrame(); paused.sceneFrame(); paused.advance()
  assert.equal(paused.calls.ready, 0, 'Resuming requires a fresh set of warmup frames')
  paused.sceneFrame(); paused.advance()
  assert.equal(paused.calls.ready, 1)

  const failure = readiness({ props: { available: true } })
  failure.strictReplay()
  failure.calls.compile[0].reject(Error('Obsolete shader'))
  await Promise.resolve(); await Promise.resolve()
  assert.equal(failure.calls.errors.length, 0, 'Stale compilation errors cannot fail the replacement scene')
  failure.calls.compile[1].reject(Error('Shader failed'))
  await Promise.resolve(); await Promise.resolve()
  assert.equal(failure.calls.errors.length, 1, 'The active renderer error reaches the loader')
  for (let frame = 0; frame < 5; frame++) { failure.sceneFrame(); failure.advance() }
  assert.equal(failure.calls.ready, 0, 'Compilation failure cannot reveal')

  const cancelled = readiness({ props: { available: true } })
  cancelled.unmount(); await cancelled.compile(); cancelled.advance()
  assert.equal(cancelled.calls.ready + cancelled.calls.errors.length + cancelled.calls.invalidations, 0, 'Unmount invalidates an in-flight compilation')

  const sync = readiness({ sync: true, props: { available: true } })
  await Promise.resolve()
  sync.sceneFrame(); sync.sceneFrame(); sync.sceneFrame(); sync.advance()
  assert.equal(sync.calls.ready, 1, 'Browsers without compileAsync use the synchronous preparation path')
  for (const item of [fresh, paused, failure, sync]) item.unmount()
}
checkReadiness().then(() => {
  console.log('Loading lifecycle passed: compositor-only loader (zero RAF callbacks), monotonic asset progress, Strict Mode, error gates, one-shot exit, reduced/Still motion, cancelled compilation, pause/resume, and presented warmup frames.')
}).catch(error => { console.error(error); process.exitCode = 1 })
