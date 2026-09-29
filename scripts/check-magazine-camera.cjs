/* Verify close reading against the actual model and the printed page corners. */
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')
const THREE = require('three')
const ts = require('typescript')
const ROOT = path.resolve(__dirname, '..')

function sourceModule(name) {
  const exports = {}
  const source = fs.readFileSync(path.join(ROOT, 'app/components', name), 'utf8')
  vm.runInNewContext(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText, { exports, require, console })
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
  model.getObjectByName('Bush15_M_Plants_0')?.position.set(-.35, 0, -.1)
  model.getObjectByName('Bush33_M_Plants_0')?.position.set(.45, 0, -.1)
  model.updateMatrixWorld(true)
  return model
}

// Read the actual printed faces rather than using the helper's framing bounds
// as both the implementation and its expected answer.
const artifacts = fs.readFileSync(path.join(ROOT, 'app/components/WorldArtifacts.tsx'), 'utf8')
const faces = [...artifacts.matchAll(/position: \[([^\]]+)\], quaternion: \[([^\]]+)\], height: ([.\d]+), kind: 'magazine(?:-back)?'/g)].map(match => ({
  center: new THREE.Vector3(...match[1].split(',').map(Number)),
  rotation: new THREE.Quaternion(...match[2].split(',').map(Number)).normalize(),
  height: Number(match[3]),
}))
assert.equal(faces.length, 2, 'Expected the two physical magazine faces')
const corners = faces.flatMap(face => [-1, 1].flatMap(x => [-1, 1].map(y => new THREE.Vector3(x * .294 / 2, y * face.height / 2, .0026).applyQuaternion(face.rotation).add(face.center))))
const model = loadGeometry()
const { magazinePose } = sourceModule('magazine-camera.ts')
const { createCameraGuard } = sourceModule('camera-path.ts')
const { AREAS, cameraScale } = sourceModule('island-data.ts')
const veranda = AREAS.find(area => area.id === 'veranda')
const guard = createCameraGuard(model)
const raycaster = new THREE.Raycaster()
let routeSamples = 0, sightlines = 0
const results = []
for (const [width, height] of [[1280, 720], [390, 844], [320, 640], [718, 773]]) {
  const aspect = width / height, pose = magazinePose(aspect)
  assert(guard.safe(pose.position), `Unsafe reading endpoint at ${width} × ${height}`)
  const camera = new THREE.PerspectiveCamera(pose.fov, aspect, .05, 260)
  camera.position.copy(pose.position); camera.up.copy(pose.up); camera.lookAt(pose.target); camera.updateMatrixWorld(true)
  const projected = corners.map(corner => corner.clone().project(camera))
  const frameWidth = (Math.max(...projected.map(p => p.x)) - Math.min(...projected.map(p => p.x))) / 2
  const frameHeight = (Math.max(...projected.map(p => p.y)) - Math.min(...projected.map(p => p.y))) / 2
  assert(frameWidth < .85 && frameHeight > .45 && frameHeight < .66, `Unreadable framing at ${width} × ${height}: ${frameWidth}, ${frameHeight}`)
  assert(projected.every(p => Math.abs(p.x) < .9 && Math.abs(p.y) < .9 && p.z > -1 && p.z < 1), 'A printed corner is clipped')
  for (const face of faces) {
    const top = new THREE.Vector3(0, face.height / 2, .0026).applyQuaternion(face.rotation).add(face.center).project(camera)
    const bottom = new THREE.Vector3(0, -face.height / 2, .0026).applyQuaternion(face.rotation).add(face.center).project(camera)
    assert(top.y > bottom.y && Math.abs(top.x - bottom.x) < .003, 'Printed text is not upright')
  }
  // Raycast every page corner and center against ALL model objects, including
  // small table props outside the travel guard's static collision whitelist.
  for (const subject of [...corners, ...faces.map(face => face.center)]) {
    raycaster.set(pose.position, subject.clone().sub(pose.position).normalize())
    raycaster.near = .001; raycaster.far = pose.position.distanceTo(subject) - .015
    const hit = raycaster.intersectObjects(model.children, false)[0]
    assert(!hit, `Magazine hidden by ${hit?.object.name} at ${width} × ${height}`)
    sightlines++
  }
  const target = new THREE.Vector3(...veranda.target)
  const start = new THREE.Vector3(...veranda.position).sub(target).multiplyScalar(cameraScale(aspect)).add(target)
  for (const [from, to] of [[start, pose.position], [pose.position, start]]) {
    const route = guard.route(from, to)
    assert(route, 'Reading needs a continuous route in both directions')
    assert(route[0].distanceTo(from) < 1e-8 && route.at(-1).distanceTo(to) < 1e-8, 'Route changed its endpoints')
    for (let i = 1; i < route.length; i++) {
      assert(guard.clear(route[i - 1], route[i], .21), 'Reading route clips an obstacle')
      const steps = Math.max(1, Math.ceil(route[i - 1].distanceTo(route[i]) / .05))
      for (let step = 0; step <= steps; step++) {
        assert(guard.safe(route[i - 1].clone().lerp(route[i], step / steps)), 'Reading route lacks camera clearance')
        routeSamples++
      }
    }
  }
  results.push({ viewport: [width, height], magazineWidth: +frameWidth.toFixed(3), magazineHeight: +frameHeight.toFixed(3) })
}
console.log(JSON.stringify({ views: results, sightlines, routeSamples, failures: 0 }, null, 2))
