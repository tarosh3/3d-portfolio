/* Geometry regression checks: no browser or graphics context required. */
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')
const THREE = require('three')
const ts = require('typescript')
const ROOT = path.resolve(__dirname, '..')
function sourceModule(name) {
  const exports = {}
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(path.join(ROOT, 'app/components', name), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText, { exports, require, console })
  return exports
}
function loadGeometry() {
  const bytes = fs.readFileSync(path.join(ROOT, 'public/island-optimized.glb'))
  const jsonLength = bytes.readUInt32LE(12)
  const data = JSON.parse(bytes.subarray(20, 20 + jsonLength).toString())
  const bin = bytes.subarray(28 + jsonLength)
  const types = { 5121: Uint8Array, 5123: Uint16Array, 5125: Uint32Array, 5126: Float32Array }
  const widths = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4 }
  function accessor(index) {
    const a = data.accessors[index], view = data.bufferViews[a.bufferView], Type = types[a.componentType], width = widths[a.type]
    const output = new Type(a.count * width), stride = view.byteStride || width * Type.BYTES_PER_ELEMENT
    for (let i = 0; i < a.count; i++) output.set(new Type(bin.buffer, bin.byteOffset + (view.byteOffset || 0) + (a.byteOffset || 0) + i * stride, width), i * width)
    return output
  }
  const model = new THREE.Group(), material = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide })
  function walk(index, parent) {
    const node = data.nodes[index]
    const local = node.matrix ? new THREE.Matrix4().fromArray(node.matrix) : new THREE.Matrix4().compose(new THREE.Vector3(...(node.translation || [0, 0, 0])), new THREE.Quaternion(...(node.rotation || [0, 0, 0, 1])), new THREE.Vector3(...(node.scale || [1, 1, 1])))
    const world = parent.clone().multiply(local)
    if (node.mesh !== undefined) for (const primitive of data.meshes[node.mesh].primitives) {
      const geometry = new THREE.BufferGeometry()
      geometry.setAttribute('position', new THREE.BufferAttribute(accessor(primitive.attributes.POSITION), 3))
      if (primitive.indices !== undefined) geometry.setIndex(new THREE.BufferAttribute(accessor(primitive.indices), 1))
      geometry.applyMatrix4(world)
      const mesh = new THREE.Mesh(geometry, material); mesh.name = node.name; model.add(mesh)
    }
    for (const child of node.children || []) walk(child, world)
  }
  for (const root of data.scenes[data.scene || 0].nodes) walk(root, new THREE.Matrix4())
  // Match LivingIsland's measured world-space fern offsets. Every other static
  // surface remains in its authored position.
  model.getObjectByName('Bush15_M_Plants_0')?.position.set(-.35, 0, -.1)
  model.getObjectByName('Bush33_M_Plants_0')?.position.set(.45, 0, -.1)
  model.updateMatrixWorld(true)
  return model
}
const model = loadGeometry(), { AREAS, cameraScale } = sourceModule('island-data.ts')
const { createCameraGuard } = sourceModule('camera-path.ts')
const setupStarted = performance.now(), guard = createCameraGuard(model), guardSetupMs = performance.now() - setupStarted
const v = point => new THREE.Vector3(...point)
if (process.argv.includes('--candidates')) {
  const curve = new THREE.CatmullRomCurve3([v([1.25336,4.8,7.37367]),v([.8807,4.65,8.92868]),v([.50803,4.8,10.48369])])
  const subjects = [0,1,2].flatMap(i => {
    const center = curve.getPoint(.8-i*.3).add(v([0,-.31,0])); return [center, center.clone().add(v([0,.2,0])),center.clone().add(v([0,-.2,0]))]
  })
  subjects.push(v([.8,3.4,8.9]))
  const candidates = []
  for(let x=2.5;x<=6.5;x+=.5) for(let y=3.8;y<=5.9;y+=.5) for(let z=7.5;z<=11.5;z+=.5){
    const p=v([x,y,z]), target=v([.9,3.9,8.9]); if(!guard.safe(p))continue
    const visible=subjects.filter(s=>guard.clear(p,s,-.02)).length
    const camera=new THREE.PerspectiveCamera(45,1280/720,.1,260);camera.position.copy(p);camera.lookAt(target);camera.updateMatrixWorld(true)
    const inside=subjects.every(s=>{const q=s.clone().project(camera);return Math.abs(q.x)<.68&&Math.abs(q.y)<.65})
    if(inside)candidates.push({p:p.toArray(),visible,distance:p.distanceTo(target),score:visible*10-Math.abs(p.distanceTo(target)-4.5)})
  }
  console.log(JSON.stringify(candidates.sort((a,b)=>b.score-a.score).slice(0,12),null,2));process.exit(0)
}
let failures = 0, checked = 0, cuts = 0, clearanceSamples = 0, tangentSamples = 0, maxTurnDegrees = 0
// Check the accelerated collision copy against Three's original mesh raycaster.
// Seeded rays cross the island and end near authored areas, so this catches an
// omitted surface or misplaced transform rather than trusting the new BVH alone.
const reference = new THREE.Raycaster()
const referenceSurfaces = model.children.filter(mesh=>/^(House|Changing_Cabin|Pier|polySurface|Bush|Groundplane|Rock)/.test(mesh.name))
let seed = 419, referenceRays = 0
const random = () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296)
for(let i=0;i<512;i++) {
  const a=v([random()*50-25,random()*18+2.9,random()*50-25])
  const b=i%2 ? v(AREAS[i%AREAS.length].target).add(v([random()*2-1,random()*2-1,random()*2-1])) : v([random()*32-16,random()*14+2.9,random()*32-16])
  reference.set(a,b.clone().sub(a).normalize()); reference.near=.001; reference.far=a.distanceTo(b)
  const expected=reference.intersectObjects(referenceSurfaces,false).length===0
  if(guard.clear(a,b,0)!==expected){console.error('Collision acceleration mismatch',i,a.toArray(),b.toArray());failures++}
  referenceRays++
}
const timings = [], fallbacks = []
for (const [width, height] of [[1280,720], [390,844], [320,640], [718,500]]) {
  const aspect = width / height
  const points = AREAS.map(area => {
    const target=v(area.target), point=v(area.position).sub(target).multiplyScalar(cameraScale(aspect)).add(target)
    // Runtime uses CSS width, including narrow landscape windows.
    if(area.id==='overview'&&width<760)point.y+=1.5
    if(!guard.safe(point)){console.error('Unsafe endpoint',width,height,area.id,point.toArray());failures++}
    return point
  })
  // Direct navigation can request any ordered pair, not only tour neighbors.
  const pairs = AREAS.flatMap((_,a)=>AREAS.map((_,b)=>[a,b]).filter(([,b])=>a!==b))
  for(const [a,b] of pairs){
    const started=performance.now(), route=guard.route(points[a],points[b]);checked++
    timings.push({from:AREAS[a].id,to:AREAS[b].id,viewport:[width,height],ms:performance.now()-started})
    if(!route){cuts++;fallbacks.push([width,height,AREAS[a].id,AREAS[b].id]);continue}
    // The controller follows these returned chords at arc-length speed, so a
    // sharp chord join is a visible change in velocity even if its endpoints
    // originated on a nominally smooth curve. Check the actual playback path.
    if(route[0].distanceTo(points[a])>1e-8||route[route.length-1].distanceTo(points[b])>1e-8){console.error('Route changed its endpoints',width,height,AREAS[a].id,AREAS[b].id);failures++}
    for(let i=1;i<route.length-1;i++){
      const incoming=route[i].clone().sub(route[i-1]),outgoing=route[i+1].clone().sub(route[i])
      if(incoming.length()<1e-9||outgoing.length()<1e-9){console.error('Repeated route sample',width,height,AREAS[a].id,AREAS[b].id);failures++;break}
      const turn=THREE.MathUtils.radToDeg(incoming.angleTo(outgoing));tangentSamples++;maxTurnDegrees=Math.max(maxTurnDegrees,turn)
      if(turn>2){console.error('Abrupt camera tangent',width,height,AREAS[a].id,AREAS[b].id,{index:i,turn});failures++;break}
    }
    let invalid = false
    for(let i=1;i<route.length&&!invalid;i++){
      if(!guard.clear(route[i-1],route[i],.21)){console.error('Obstructed route',width,height,AREAS[a].id,AREAS[b].id);failures++;break}
      // Denser than the implementation's .3-unit cross sections. This checks
      // the returned path independently, including straight and rounded paths.
      const steps=Math.max(1,Math.ceil(route[i-1].distanceTo(route[i])/.15))
      for(let step=0;step<=steps;step++){
        const sample=route[i-1].clone().lerp(route[i],step/steps);clearanceSamples++
        if(!guard.safe(sample)){console.error('Insufficient camera clearance',width,height,AREAS[a].id,AREAS[b].id,sample.toArray());failures++;invalid=true;break}
      }
    }
  }
}
// A path whose endpoint is below the supported exploration envelope must fail
// closed, so the caller can use its existing transition fallback.
if(guard.route(v([25,17,23]),v([0,2,0]))!==null){console.error('Unsafe endpoint produced a flight');failures++}
timings.sort((a,b)=>a.ms-b.ms)
const rounded=value=>Math.round(value*10)/10
console.log(JSON.stringify({meshes:model.children.length,referenceRays,guardSetupMs:rounded(guardSetupMs),checkedRoutes:checked,clearanceSamples,tangentSamples,maxTurnDegrees:rounded(maxTurnDegrees),safeFadeFallbacks:cuts,failures,routeTimingMs:{median:rounded(timings[Math.floor(timings.length*.5)].ms),p95:rounded(timings[Math.floor(timings.length*.95)].ms),max:rounded(timings[timings.length-1].ms)},slowest:timings.slice(-3).map(item=>({...item,ms:rounded(item.ms)})),fallbacks},null,2))
process.exitCode = failures ? 1 : 0
