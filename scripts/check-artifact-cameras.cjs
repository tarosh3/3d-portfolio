const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const THREE = require('three')
const { ROOT, sourceModule, loadGeometry } = require('./island-geometry.cjs')
const { artifactPose, artifactLabel } = sourceModule('artifact-camera')
const { createCameraGuard, pathDistance, pointOnPath } = sourceModule('camera-path')
const { orientPose, reverseTravelledPath, sampleArtifactMotion } = sourceModule('artifact-motion')
const { AREAS, cameraScale, cameraFov } = sourceModule('island-data')
const model = loadGeometry(), guard = createCameraGuard(model), ray = new THREE.Raycaster()
const source = fs.readFileSync(path.join(ROOT, 'app/components/WorldArtifacts.tsx'), 'utf8')
const v = values => new THREE.Vector3(...values)
const numbers = text => text.split(',').map(Number)
function groupBasis(name) {
  const body = source.slice(source.indexOf(`function ${name}(`))
  const found = body.match(/<group position=\{\[([^\]]+)\]\} (quaternion|rotation)=\{\[([^\]]+)\]\}/)
  assert(found, `Missing measured ${name} surface`)
  const components = numbers(found[3].replace(/-Math\.PI\s*\/\s*2/g, String(-Math.PI / 2)))
  assert(components.every(Number.isFinite), `Unsupported ${name} rotation`)
  const rotation = found[2] === 'quaternion'
    ? new THREE.Quaternion(...components).normalize()
    : new THREE.Quaternion().setFromEuler(new THREE.Euler(...components))
  return { center: v(numbers(found[1])), rotation }
}
function corners(center, rotation, width, height) {
  return [-1, 1].flatMap(x => [-1, 1].map(y => v([x * width / 2, y * height / 2, .005]).applyQuaternion(rotation).add(center)))
}
const fixtures = []
const magazine = [...source.matchAll(/position: \[([^\]]+)\], quaternion: \[([^\]]+)\], height: ([.\d]+), kind: 'magazine(?:-back)?'/g)]
fixtures.push({ id: 'magazine', area: 'veranda', request: { stage: 1 }, corners: magazine.flatMap(m => corners(v(numbers(m[1])), new THREE.Quaternion(...numbers(m[2])).normalize(), .294, Number(m[3]))) })
const notebook = groupBasis('Notebook')
fixtures.push({ id: 'notebook', area: 'deck', request: { stage: 2 }, corners: corners(notebook.center.clone().add(v([0,0,.022]).applyQuaternion(notebook.rotation)), notebook.rotation, .324, .168) })
const cabin = groupBasis('CabinPosters')
for (let item = 0; item < 2; item++) {
  const center = cabin.center.clone().add(v([(item ? 1 : -1) * .56, .02, 0]).applyQuaternion(cabin.rotation))
  const rotation = cabin.rotation.clone().multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(0,0,item ? .017 : -.021)))
  fixtures.push({ id: `poster-${item}`, area: 'cabin', request: { stage: 3, item }, corners: corners(center, rotation, .56, .765) })
}
const rope = new THREE.CatmullRomCurve3([v([1.25336,4.8,7.37367]),v([.8807,4.65,8.92868]),v([.50803,4.8,10.48369])])
for (let item = 0; item < 3; item++) {
  const rotation = new THREE.Quaternion().setFromEuler(new THREE.Euler(0,1.335,(item-1)*.022))
  const center = rope.getPoint(.8-item*.3).add(v([0,-.31,0]).applyQuaternion(rotation))
  fixtures.push({ id: `story-${item}`, area: 'hammock', request: { stage: 4, item }, corners: corners(center, rotation, .44, .58) })
}
const door = groupBasis('DoorNote')
fixtures.push({ id: 'door', area: 'veranda', request: { stage: 4, item: 2, source: 'door' }, corners: corners(door.center, door.rotation, .33, .44) })
const postRotation = new THREE.Quaternion().setFromEuler(new THREE.Euler(0,.35,0))
fixtures.push({ id: 'postbox', area: 'pier', request: { stage: 5 }, corners: corners(v([7.27708,2.905,1.33696]).add(v([0,0,.157]).applyQuaternion(postRotation)),postRotation,.334,.398) })
const lagoon = groupBasis('LagoonLog')
fixtures.push({ id: 'tide-log', area: 'lagoon', request: { stage: 6 }, corners: corners(lagoon.center.clone().add(v([0,0,.002]).applyQuaternion(lagoon.rotation)), lagoon.rotation, .70, .52) })
const west = groupBasis('WestShoreBoard')
fixtures.push({ id: 'field-board', area: 'west', request: { stage: 7 }, corners: corners(west.center.clone().add(v([0,0,.004]).applyQuaternion(west.rotation)), west.rotation, .90, .72) })
assert.equal(artifactLabel({ stage: 6 }), 'the tide log')
assert.equal(artifactLabel({ stage: 7 }), 'the field board')
let views = 0, routes = 0, samples = 0, sightlines = 0, propChecks = 0, failures = 0
const check = (condition, detail) => { if (!condition) { console.error(detail); failures++ } }
for (const [width,height] of [[1280,720],[390,844],[320,640],[320,568],[718,773],[844,390]]) for (const fixture of fixtures) {
  const name = `${fixture.id} ${width}×${height}`, aspect = width/height
  const close = orientPose(artifactPose(fixture.request,aspect))
  check(guard.safe(close.position), `${name}: unsafe close position ${close.position.toArray()}`)
  const camera = new THREE.PerspectiveCamera(close.fov,aspect,.1,260)
  camera.position.copy(close.position); camera.quaternion.copy(close.quaternion); camera.updateMatrixWorld(true)
  const projected = fixture.corners.map(c => c.clone().project(camera))
  check(projected.every(c => Math.abs(c.x)<.92 && Math.abs(c.y)<.92 && c.z>-1 && c.z<1), `${name}: clipped print`)
  for(let i=0;i<fixture.corners.length;i+=4) {
    const top=fixture.corners[i+1].clone().lerp(fixture.corners[i+3],.5).project(camera)
    const bottom=fixture.corners[i].clone().lerp(fixture.corners[i+2],.5).project(camera)
    check(top.y>bottom.y && Math.abs(top.x-bottom.x)<.01,`${name}: page text is not upright`)
  }
  for (const subject of fixture.corners) {
    ray.set(close.position,subject.clone().sub(close.position).normalize()); ray.near=.001; ray.far=close.position.distanceTo(subject)-.025
    const hit=ray.intersectObjects(model.children,false)[0]
    check(!hit,`${name}: print hidden by ${hit?.object.name}`); sightlines++
  }
  const area=AREAS.find(a=>a.id===fixture.area),target=v(area.target)
  const from=orientPose({position:v(area.position).sub(target).multiplyScalar(cameraScale(aspect)).add(target),target,up:v([0,1,0]),fov:cameraFov(aspect)})
  const route=guard.route(from.position,close.position)
  check(Boolean(route),`${name}: no approach route`)
  if(route) {
    for(let i=1;i<route.length;i++) {
      // Include bottles, cans, furniture and other original props that are not
      // part of the section-navigation collision whitelist.
      ray.set(route[i-1],route[i].clone().sub(route[i-1]).normalize()); ray.near=.001; ray.far=route[i-1].distanceTo(route[i])
      const hit=ray.intersectObjects(model.children,false)[0]
      check(!hit,`${name}: approach crosses ${hit?.object.name}`); propChecks++
      const count=Math.max(1,Math.ceil(route[i-1].distanceTo(route[i])/.08))
      for(let j=0;j<=count;j++) { check(guard.safe(route[i-1].clone().lerp(route[i],j/count)),`${name}: blocked approach`); samples++ }
    }
    // Cancelling at several points must retrace the already checked route and
    // restore the actual source pose, including its roll, lens and look target.
    for(const fraction of [0,.19,.64,1]) {
      const travelled=pathDistance(route)*fraction,back=reverseTravelledPath(route,travelled)
      check(back[0].distanceTo(pointOnPath(route,travelled,new THREE.Vector3()))<1e-7,`${name}: cancellation starts with a jump`)
      check(back.at(-1).distanceTo(from.position)<1e-7,`${name}: return misses original view`)
      const current=orientPose({...close,position:back[0]})
      const result=sampleArtifactMotion(current,from,back,1,orientPose(artifactPose(fixture.request,aspect)))
      check(result.position.distanceTo(from.position)<1e-7 && result.target.distanceTo(from.target)<1e-7 && result.quaternion.angleTo(from.quaternion)<1e-7 && Math.abs(result.fov-from.fov)<1e-8,`${name}: incomplete restoration`)
      routes++
    }
  }
  views++
}
console.log(JSON.stringify({views,sightlines,propChecks,returnScenarios:routes,clearanceSamples:samples,failures},null,2))
process.exitCode=failures?1:0
