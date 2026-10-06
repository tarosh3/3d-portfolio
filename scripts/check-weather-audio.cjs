const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')
const ts = require('typescript')
const { ROOT, sourceModule } = require('./island-geometry.cjs')
const { createWeather } = sourceModule('island-weather')
const deferred = () => { let resolve, reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no }); return { promise, resolve, reject } }
const flush = async () => { for (let i = 0; i < 6; i++) await Promise.resolve() }
function moduleWithGlobals(filename, globals, customRequire = require) {
  const exports = {}
  const source = fs.readFileSync(path.join(ROOT, 'app/components', filename), 'utf8')
  const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, jsx: ts.JsxEmit.ReactJSX } }).outputText
  vm.runInNewContext(code, { exports, require: customRequire, console, ...globals })
  return exports
}
class Parameter {
  constructor() { this.value = 0; this.events = [] }
  setValueAtTime(value, at) { this.value = value; this.events.push(['set', value, at]) }
  setTargetAtTime(value, at, duration) { this.events.push(['target', value, at, duration]) }
  linearRampToValueAtTime(value, at) { this.events.push(['linear', value, at]) }
  exponentialRampToValueAtTime(value, at) { this.events.push(['exponential', value, at]) }
  cancelScheduledValues(at) { this.events.push(['cancel', at]) }
}
class AudioNode {
  constructor(context, type) { this.context = context; this.type = type; this.disconnects = 0; context.nodes.push(this) }
  connect() {}
  disconnect() { this.disconnects++ }
}
class FakeContext {
  static all = []
  constructor() { this.state = 'suspended'; this.currentTime = 10; this.sampleRate = 100; this.nodes = []; this.operations = []; this.closeCount = 0; FakeContext.all.push(this) }
  createBuffer(channels, size) { const data = new Float32Array(size); return { getChannelData: () => data } }
  createBufferSource() { const source = new AudioNode(this, 'source'); source.starts = 0; source.stops = 0; source.start = () => source.starts++; source.stop = () => source.stops++; return source }
  createGain() { const node = new AudioNode(this, 'gain'); node.gain = new Parameter(); return node }
  createBiquadFilter() { const node = new AudioNode(this, 'filter'); node.frequency = new Parameter(); node.Q = new Parameter(); return node }
  action(state) { const operation = deferred(); this.operations.push({ state, ...operation }); return operation.promise }
  resume() { return this.action('running') }
  suspend() { return this.action('suspended') }
  close() { this.closeCount++; this.state = 'closed'; return Promise.resolve() }
  async complete() { const operation = this.operations.shift(); assert.ok(operation); if (this.state !== 'closed') this.state = operation.state; operation.resolve(); await flush() }
}
async function checkLayers() {
  const { createWeatherAudio } = moduleWithGlobals('weather-audio.ts', { AudioContext: FakeContext })
  const audio = createWeatherAudio(), context = FakeContext.all.at(-1)
  const [master, wind, rain, thunder] = context.nodes.filter(node => node.type === 'gain')
  audio.resume(); assert.equal(context.operations.length, 1)
  audio.pause(); assert.equal(master.gain.value, 0, 'mute is immediate while resume is unresolved')
  await context.complete()
  assert.equal(context.operations[0].state, 'suspended', 'a late resume reconciles the latest pause')
  await context.complete(); assert.equal(context.state, 'suspended')
  audio.resume(); await context.complete()
  audio.pause(); audio.resume()
  await context.complete()
  assert.equal(context.operations[0].state, 'running', 'a late suspend reconciles the latest resume')
  await context.complete(); assert.equal(context.state, 'running')
  const weather = createWeather(); weather.setTarget('storm', true); weather.flashSerial = 5
  const thunderEvents = () => thunder.gain.events.filter(event => event[0] === 'linear')
  audio.update(weather, false)
  assert.equal(thunderEvents().length, 0, 'starting audio must not replay a previously seen lightning flash')
  weather.flashSerial++; audio.update(weather, false)
  assert.equal(thunderEvents().length, 1)
  assert.ok(Math.abs(thunderEvents()[0][2] - context.currentTime - 2.8) < 1e-8, 'thunder follows light with a delayed swell')
  weather.shelter = 1; audio.update(weather, false)
  assert.ok(rain.gain.events.at(-1)[1] < .15, 'a roof attenuates the rain')
  audio.pause(); assert.equal(thunder.gain.events.at(-1)[1], 0, 'pause clears delayed thunder immediately')
  const quietEvents = wind.gain.events.length
  audio.update(weather, false); assert.equal(wind.gain.events.length, quietEvents, 'paused updates cannot schedule sound')
  await context.complete(); weather.flashSerial += 3; audio.resume(); await context.complete(); audio.update(weather, false)
  assert.equal(thunderEvents().length, 1, 'muted or hidden flashes are not replayed on return')
  weather.flashSerial++; audio.update(weather, true)
  assert.equal(thunderEvents().length, 1, 'Still does not schedule new thunder')
  weather.flashSerial++; audio.update(weather, false); assert.equal(thunderEvents().length, 2)
  weather.kind = 'clear'; audio.update(weather, false)
  assert.equal(thunder.gain.events.at(-1)[0], 'target'); assert.equal(thunder.gain.events.at(-1)[1], 0)
  audio.pause(); audio.dispose(); audio.dispose(); await context.complete()
  assert.equal(context.closeCount, 1)
  assert.ok(context.nodes.every(node => node.disconnects === 1))
  const source = context.nodes.find(node => node.type === 'source')
  assert.equal(source.starts, 1); assert.equal(source.stops, 1)
  assert.equal(context.operations.length, 0, 'disposed contexts cannot restart after an async transition')
}

function componentHarness(initial = {}) {
  const slots = [], effects = [], listeners = new Map(), timers = new Map(), media = [], layers = [], props = { weather: createWeather(), paused: false, reduced: false, ...initial }
  let cursor = 0, dirty = false, mounted = true, tree, nextTimer = 0, lateUpdates = 0, storedOff = Boolean(initial.storedOff)
  const equal = (a, b) => a && b && a.length === b.length && a.every((value, index) => Object.is(value, b[index]))
  const react = {
    useRef(value) { return slots[cursor++] ||= { current: value } },
    useState(value) {
      const i = cursor++
      slots[i] ||= { value: typeof value === 'function' ? value() : value }
      return [slots[i].value, update => { if (!mounted) lateUpdates++; const next = typeof update === 'function' ? update(slots[i].value) : update; if (!Object.is(slots[i].value, next)) { slots[i].value = next; dirty = true } }]
    },
    useEffect(effect, dependencies) {
      const i = cursor++, previous = slots[i]
      if (!equal(previous?.dependencies, dependencies)) effects.push(() => { previous?.cleanup?.(); slots[i] = { effect, dependencies, cleanup: effect() } })
    },
  }
  const events = {
    addEventListener(type, callback) { if (!listeners.has(type)) listeners.set(type, new Set()); listeners.get(type).add(callback) },
    removeEventListener(type, callback) { listeners.get(type)?.delete(callback) },
  }
  const document = { hidden: false, ...events }
  class FakeMedia {
    constructor(url) { this.url = url; this.paused = true; this.jobs = []; this.pauses = 0; this.loads = 0; this.removed = []; media.push(this) }
    play() { const job = deferred(); this.jobs.push(job); return job.promise }
    pause() { this.paused = true; this.pauses++ }
    removeAttribute(name) { this.removed.push(name) }
    load() { this.loads++ }
    resolve(index = this.jobs.length - 1) { this.paused = false; this.jobs[index].resolve() }
  }
  const jsx = (type, props) => ({ type, props })
  const code = moduleWithGlobals('IslandSound.tsx', {
    window: events, document, Audio: FakeMedia, Element: class {},
    setInterval(callback) { const id = ++nextTimer; timers.set(id, callback); return id }, clearInterval: id => timers.delete(id),
  }, name => {
    if (name === 'react') return react
    if (name === 'react/jsx-runtime') return { jsx, jsxs: jsx }
    if (name === './island-arrival') return { sessionFlag: () => storedOff, setSessionFlag: (_, value) => { storedOff = value } }
    if (name === './weather-audio') return { createWeatherAudio() { const layer = { resumes: 0, pauses: 0, updates: 0, disposals: 0, resume() { this.resumes++ }, pause() { this.pauses++ }, update() { this.updates++ }, dispose() { this.disposals++ } }; layers.push(layer); return layer } }
    return require(name)
  })
  function render() {
    if (!mounted) return
    let rounds = 0
    do { assert.ok(rounds++ < 20); dirty = false; cursor = 0; tree = code.default(props); while (effects.length) effects.shift()() } while (dirty)
  }
  render()
  return {
    media, layers, timers, document,
    get tree() { return tree }, get lateUpdates() { return lateUpdates }, get storedOff() { return storedOff },
    async flush() { await flush(); render(); await flush(); render() },
    change(patch) { Object.assign(props, patch); render() },
    emit(type) { for (const listener of [...(listeners.get(type) || [])]) listener({ target: null }); render() },
    toggle() { tree.props.onClick(); render() },
    strictReplay() { const entries = slots.filter(slot => slot?.effect); entries.forEach(slot => slot.cleanup?.()); entries.forEach(slot => { slot.cleanup = slot.effect() }); render() },
    unmount() { mounted = false; slots.forEach(slot => slot?.cleanup?.()) },
    listenerCount() { return [...listeners.values()].reduce((count, set) => count + set.size, 0) },
  }
}
async function checkComponent() {
  const app = componentHarness()
  app.strictReplay(); assert.equal(app.media.length, 0, 'no audio file or context is requested before a gesture')
  app.emit('pointerup'); app.emit('click'); app.emit('keyup')
  assert.equal(app.media.length, 1); assert.equal(app.layers.length, 1)
  assert.equal(app.media[0].jobs.length, 1, 'one interaction cannot stack unresolved play requests')
  app.media[0].resolve(); await app.flush()
  assert.equal(app.timers.size, 1); assert.equal(app.media[0].jobs.length, 1)
  app.document.hidden = true; app.emit('visibilitychange')
  assert.equal(app.media[0].paused, true, 'visibility event silences media before parent rendering')
  app.change({ paused: true }); assert.equal(app.timers.size, 0)
  app.document.hidden = false; app.change({ paused: false })
  assert.equal(app.media[0].jobs.length, 2, 'a previously started sound resumes after the reader/hidden pause')
  app.toggle(); assert.equal(app.storedOff, true); assert.equal(app.timers.size, 0)
  app.media[0].jobs[1].resolve(); await app.flush()
  assert.equal(app.tree.props['aria-pressed'], false, 'a late play resolution cannot undo mute')
  app.toggle(); assert.equal(app.media[0].jobs.length, 3)
  const audio = app.media[0], layer = app.layers[0]
  app.unmount(); audio.jobs[2].resolve(); await app.flush()
  assert.equal(app.lateUpdates, 0, 'unmounted play promises do not update React state')
  assert.equal(app.listenerCount(), 0); assert.equal(app.timers.size, 0)
  assert.equal(layer.disposals, 1); assert.equal(audio.loads, 1); assert.deepEqual(audio.removed, ['src'])
  const muted = componentHarness({ storedOff: true })
  muted.emit('click'); assert.equal(muted.media.length, 0, 'session mute suppresses gesture autostart')
  muted.toggle(); assert.equal(muted.media.length, 1)
  muted.media[0].jobs[0].reject(Error('Media unavailable')); await muted.flush()
  assert.equal(muted.timers.size, 0)
  assert.equal(muted.tree.props.children[1].props.children, 'Unavailable')
  muted.emit('pointerup'); assert.equal(muted.media[0].jobs.length, 2, 'a failed start can retry on the next deliberate input')
  muted.unmount(); muted.media[0].jobs[1].reject(Error('Disposed')); await muted.flush()
  assert.equal(muted.lateUpdates, 0)
}
Promise.resolve().then(checkLayers).then(checkComponent).then(() => {
  console.log('Weather audio passed: gesture-only loading, coalesced starts, session mute, async resume/pause races, hidden-tab silence, no stale thunder, reduced motion, failure retry, timer/listener cleanup and unmounted promise safety.')
}).catch(error => { console.error(error); process.exitCode = 1 })
