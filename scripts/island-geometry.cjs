const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')
const THREE = require('three')
const ts = require('typescript')
const ROOT = path.resolve(__dirname, '..')
const modules = new Map()

function sourceModule(name) {
  const filename = name.endsWith('.ts') ? name : `${name}.ts`
  if (modules.has(filename)) return modules.get(filename)
  const exports = {}
  modules.set(filename, exports)
  const source = fs.readFileSync(path.join(ROOT, 'app/components', filename), 'utf8')
  vm.runInNewContext(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText, { exports, require: name => name.startsWith('./') ? sourceModule(name.slice(2)) : require(name), console })
  return exports
}

function loadGeometry() {
  const bytes = fs.readFileSync(path.join(ROOT, 'public/island-optimized.glb'))
  const jsonLength = bytes.readUInt32LE(12), data = JSON.parse(bytes.subarray(20, 20 + jsonLength).toString()), bin = bytes.subarray(28 + jsonLength)
  const types = { 5121: Uint8Array, 5123: Uint16Array, 5125: Uint32Array, 5126: Float32Array }, widths = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4 }
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
module.exports = { ROOT, sourceModule, loadGeometry }
