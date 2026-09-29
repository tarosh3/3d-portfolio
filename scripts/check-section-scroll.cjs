const fs = require('node:fs')
const vm = require('node:vm')
const path = require('node:path')
const assert = require('node:assert/strict')
const ts = require('typescript')
const exportsObject = {}
const source = fs.readFileSync(path.join(__dirname, '../app/components/section-scroll.ts'), 'utf8')
vm.runInNewContext(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText, { exports: exportsObject })
const { createSectionScroll } = exportsObject
const sample = (deltaY, time, extra = {}) => ({ deltaX: 0, deltaY, deltaMode: 0, time, ...extra })
let cases = 0
function check(label, test) { test(); cases++; }
check('Trackpad motion and its tail advance exactly one section', () => {
  const input = createSectionScroll()
  assert.deepEqual([10,20,20,30,25,10,4,2].map((dy,i)=>input.push(sample(dy,i*16))), [0,0,1,0,0,0,0,0])
  assert.equal(input.push(sample(60,500)), 1)
  assert.equal(input.push(sample(-60,800)), -1)
})
check('Mouse, line and page wheel units work in both directions', () => {
  for (const [deltaY,deltaMode] of [[100,0],[3,1],[1,2],[-100,0],[-3,1],[-1,2]]) {
    assert.equal(createSectionScroll().push(sample(deltaY,0,{deltaMode})), Math.sign(deltaY))
  }
})
check('Horizontal scrolling and browser zoom gestures do not navigate', () => {
  for(const extra of [{deltaX:300},{ctrlKey:true},{metaKey:true},{altKey:true}]) assert.equal(createSectionScroll().push(sample(100,0,extra)),0)
})
check('A paused reader cannot queue navigation or release a momentum tail', () => {
  const input=createSectionScroll()
  assert.equal(input.push(sample(100,0,{blocked:true})),0)
  assert.equal(input.push(sample(100,40)),0)
  assert.equal(input.push(sample(100,300)),1)
})
check('Opposing small deltas cancel rather than add to a false gesture', () => {
  const input=createSectionScroll()
  assert.deepEqual([input.push(sample(30,0)),input.push(sample(-30,20)),input.push(sample(-20,40))],[0,0,-1])
})
check('A new deliberate gesture can change direction during camera travel', () => {
  const input=createSectionScroll()
  assert.equal(input.push(sample(100,0)),1)
  assert.equal(input.push(sample(-100,250)),-1)
  input.reset()
  assert.equal(input.push(sample(100,260)),1)
})
console.log(`${cases} section-scroll scenarios passed`)
