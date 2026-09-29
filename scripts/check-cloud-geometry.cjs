const assert = require('node:assert/strict')
const { performance } = require('node:perf_hooks')
const THREE = require('three')
const { sourceModule } = require('./island-geometry.cjs')
const { createCloudGeometry } = sourceModule('cloud-geometry')

const started = performance.now(), variants = []
for (let variant = 0; variant < 3; variant++) {
  const geometry = createCloudGeometry(variant)
  const vertices = geometry.attributes.position, normals = geometry.attributes.normal
  const triangles = geometry.index.array, edges = new Map()
  assert.equal(vertices.count, 922)
  assert.equal(triangles.length / 3, 1840)
  assert.ok([...vertices.array, ...normals.array].every(Number.isFinite))
  const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3()
  const normal = new THREE.Vector3(), centroid = new THREE.Vector3()
  for (let i = 0; i < triangles.length; i += 3) {
    const face = [triangles[i], triangles[i + 1], triangles[i + 2]]
    a.fromBufferAttribute(vertices, face[0]); b.fromBufferAttribute(vertices, face[1]); c.fromBufferAttribute(vertices, face[2])
    centroid.copy(a).add(b).add(c).multiplyScalar(1 / 3)
    normal.crossVectors(b.sub(a), c.sub(a))
    assert.ok(normal.lengthSq() > 1e-12, 'no collapsed underside or pole triangles')
    assert.ok(normal.dot(centroid) > 0, 'outward winding across the entire joined skin')
    for (let edge = 0; edge < 3; edge++) {
      const first = face[edge], second = face[(edge + 1) % 3]
      const key = first < second ? `${first}:${second}` : `${second}:${first}`
      const entry = edges.get(key) || { count: 0, direction: 0 }
      entry.count++; entry.direction += first < second ? 1 : -1
      edges.set(key, entry)
    }
  }
  for (const edge of edges.values()) {
    assert.equal(edge.count, 2, 'each edge belongs to exactly two faces: closed surface')
    assert.equal(edge.direction, 0, 'adjacent faces agree on winding')
  }
  assert.equal(vertices.count - edges.size + triangles.length / 3, 2, 'one continuous sphere-topology skin')
  assert.ok(Math.abs(geometry.boundingBox.min.x + 1) < 1e-6)
  assert.ok(Math.abs(geometry.boundingBox.max.x - 1) < 1e-6)
  assert.ok(geometry.boundingBox.max.y > Math.abs(geometry.boundingBox.min.y) * 2, 'full upper billows and shallow underside')
  for (let i = 0; i < normals.count; i++) {
    normal.fromBufferAttribute(normals, i)
    assert.ok(Math.abs(normal.length() - 1) < 1e-5, 'continuous unit vertex normals')
  }
  variants.push(vertices.array.slice())
  geometry.dispose()
}
assert.notDeepEqual(variants[0], variants[1], 'cloud banks have different silhouettes')
assert.notDeepEqual(variants[1], variants[2], 'cloud banks have different silhouettes')
console.log(`Cloud geometry passed: three distinct watertight skins, smooth normals, 1,840 triangles each (${Math.round(performance.now() - started)}ms including topology checks).`)
