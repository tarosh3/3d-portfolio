import * as THREE from 'three'

import { MeshBVH } from 'three-mesh-bvh'

const collisionCache = new WeakMap<THREE.Group, MeshBVH>()

function collisionTree(model: THREE.Group) {
  const cached = collisionCache.get(model)
  if (cached) return cached
  model.updateMatrixWorld(true)
  const surfaces: THREE.Mesh[] = []
  let vertexCount = 0, indexCount = 0
  model.traverse(object => {
    if (!(object instanceof THREE.Mesh) || !/^(House|Changing_Cabin|Pier|polySurface|Bush|Groundplane|Rock)/.test(object.name)) return
    surfaces.push(object)
    vertexCount += object.geometry.attributes.position.count
    indexCount += object.geometry.index?.count ?? object.geometry.attributes.position.count
  })
  // Keep a separate, world-space collision copy. BVH construction may reorder
  // its index; the displayed model and shared GLTF buffers are never modified.
  const positions = new Float32Array(vertexCount * 3), indices = new Uint32Array(indexCount)
  const vertex = new THREE.Vector3()
  let vertexOffset = 0, indexOffset = 0
  for (const mesh of surfaces) {
    const attribute = mesh.geometry.attributes.position, index = mesh.geometry.index
    for (let i = 0; i < attribute.count; i++) {
      vertex.fromBufferAttribute(attribute, i).applyMatrix4(mesh.matrixWorld)
      vertex.toArray(positions, (vertexOffset + i) * 3)
    }
    const count = index?.count ?? attribute.count
    for (let i = 0; i < count; i++) indices[indexOffset + i] = vertexOffset + (index ? index.getX(i) : i)
    vertexOffset += attribute.count; indexOffset += count
  }
  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3))
  geometry.setIndex(new THREE.BufferAttribute(indices, 1))
  const tree = new MeshBVH(geometry, { maxLeafTris: 8, verbose: false })
  collisionCache.set(model, tree)
  return tree
}

// Camera travel is checked against the real static surfaces, including leaves.
// The outer ring is a route around the diorama, not a curve through its centre.
export function createCameraGuard(model: THREE.Group) {
  const tree = collisionTree(model)
  const ray = new THREE.Ray()
  const direction = new THREE.Vector3()
  const probe = new THREE.Vector3()
  const probeEnd = new THREE.Vector3()
  const axes = [new THREE.Vector3(1, 0, 0), new THREE.Vector3(0, 1, 0), new THREE.Vector3(0, 0, 1)]
  const clear = (a: THREE.Vector3, b: THREE.Vector3, margin = .22) => {
    const length = a.distanceTo(b)
    if (length < .001) return true
    direction.subVectors(b, a).normalize()
    ray.set(a, direction)
    return tree.raycastFirst(ray, THREE.DoubleSide, .001, length + margin) === null
  }
  const safe = (point: THREE.Vector3) => {
    if (point.y < 2.9) return false
    for (const axis of axes) {
      if (!clear(probe.copy(point).addScaledVector(axis, -.23), probeEnd.copy(point).addScaledVector(axis, .23), 0)) return false
    }
    return true
  }
  // Flight needs a corridor around the camera, not only an unobstructed centre
  // line. Offset rays check the sides continuously; cross-section samples catch
  // leaves entering between those rays. Keep clear/safe cheap for live dragging.
  const corridorCache = new Map<string, boolean>()
  const sweptClear = (a: THREE.Vector3, b: THREE.Vector3) => {
    const startKey = a.toArray().join(','), endKey = b.toArray().join(',')
    const key = startKey < endKey ? `${startKey}:${endKey}` : `${endKey}:${startKey}`
    const cached = corridorCache.get(key)
    if (cached !== undefined) return cached
    let result = safe(a) && safe(b) && clear(a, b, 0)
    const start = new THREE.Vector3(), end = new THREE.Vector3()
    if (result) for (const axis of axes) for (const sign of [-1, 1]) {
      if (!clear(start.copy(a).addScaledVector(axis, sign * .23), end.copy(b).addScaledVector(axis, sign * .23), 0)) result = false
    }
    if (result) {
      const steps = Math.ceil(a.distanceTo(b) / .3)
      for (let i = 1; i < steps; i++) {
        if (!safe(start.lerpVectors(a, b, i / steps))) { result = false; break }
      }
    }
    // Coordinates stay exact: quantizing this cache can reuse a clear result for
    // a nearby, obstructed pose. Bound memory after many interrupted journeys.
    if (corridorCache.size >= 512) corridorCache.clear()
    corridorCache.set(key, result)
    return result
  }
  const route = (from: THREE.Vector3, to: THREE.Vector3) => {
    if (!safe(from) || !safe(to)) return null
    if (sweptClear(from, to)) return [from.clone(), to.clone()]
    const nodes = [from.clone(), to.clone()]
    // The inner ring follows the shore, keeping nearby sections near the island.
    // The outer ring remains available when palms block a local connection.
    // Low rings leave the hammock beneath its canopy; high rings pass over it.
    // Neither radius is assumed clear: every chosen connection is checked.
    const ringHeights = [3.6, 7, 17], ringRadii = [8, 12, 23]
    const topIndex = 2 + ringHeights.length * ringRadii.length * 12
    for (const radius of ringRadii) for (const y of ringHeights) for (let i = 0; i < 12; i++) {
      const a = i / 12 * Math.PI * 2
      nodes.push(new THREE.Vector3(1 + Math.sin(a) * radius, y, Math.cos(a) * radius))
    }
    nodes.push(new THREE.Vector3(0, 22, 0))
    const edges = nodes.map(() => [] as { to: number; cost: number }[])
    const connect = (a: number, b: number) => {
      if (!clear(nodes[a], nodes[b], .35)) return
      const cost = nodes[a].distanceTo(nodes[b])
      edges[a].push({ to: b, cost }); edges[b].push({ to: a, cost })
    }
    for (let i = 2; i < nodes.length; i++) { connect(0, i); connect(1, i) }
    for (let radius = 0; radius < ringRadii.length; radius++) for (let ring = 0; ring < ringHeights.length; ring++) for (let i = 0; i < 12; i++) {
      const start = 2 + radius * ringHeights.length * 12 + ring * 12, index = start + i
      connect(index, start + (i + 1) % 12)
      if (ring < ringHeights.length - 1) connect(index, index + 12)
      else connect(index, topIndex)
      if (radius < ringRadii.length - 1) connect(index, index + ringHeights.length * 12)
    }
    // Check expensive corridor clearance only on candidate shortest paths.
    // Reject a blocked edge and search again; every retry removes an edge, so
    // the search is bounded by this small graph rather than a per-frame scan.
    let points: THREE.Vector3[] | null = null
    while (!points) {
      // Search directed edges, rather than nodes alone, so the route cost can
      // include its change of heading. The shortest polygon often goes out to
      // a single ring point then doubles back with an almost 180-degree turn.
      // A few extra metres around the ring make a much calmer camera journey.
      const count = nodes.length, distances = new Float64Array(count * count).fill(Infinity)
      const previous = new Int32Array(count * count).fill(-1)
      const pending: { state: number; cost: number }[] = []
      const push = (state: number, cost: number) => {
        let index = pending.length
        pending.push({ state, cost })
        while (index > 0) {
          const parent = Math.floor((index - 1) / 2)
          if (pending[parent].cost <= cost) break
          pending[index] = pending[parent]; index = parent
        }
        pending[index] = { state, cost }
      }
      const pop = () => {
        const first = pending[0], last = pending.pop()!
        if (pending.length) {
          let index = 0
          while (index * 2 + 1 < pending.length) {
            let child = index * 2 + 1
            if (child + 1 < pending.length && pending[child + 1].cost < pending[child].cost) child++
            if (last.cost <= pending[child].cost) break
            pending[index] = pending[child]; index = child
          }
          pending[index] = last
        }
        return first
      }
      const incoming = new THREE.Vector3(), outgoing = new THREE.Vector3()
      distances[0] = 0; push(0, 0)
      let destination = -1
      while (pending.length) {
        const { state, cost } = pop()
        if (cost !== distances[state]) continue
        const current = state % count, before = Math.floor(state / count)
        if (current === 1) { destination = state; break }
        for (const edge of edges[current]) {
          if (edge.to === before || edge.to === 0) continue
          const turn = current === 0 ? 0 : incoming.subVectors(nodes[current], nodes[before]).angleTo(outgoing.subVectors(nodes[edge.to], nodes[current]))
          const nextCost = cost + edge.cost + turn ** 4, next = current * count + edge.to
          if (nextCost >= distances[next]) continue
          distances[next] = nextCost; previous[next] = state; push(next, nextCost)
        }
      }
      if (destination < 0) return null
      const order: number[] = []
      for (let state = destination; state >= 0; state = previous[state]) order.push(state % count)
      order.reverse()
      let blocked = false
      for (let i = 1; i < order.length; i++) {
        const a = order[i - 1], b = order[i]
        if (sweptClear(nodes[a], nodes[b])) continue
        edges[a] = edges[a].filter(edge => edge.to !== b)
        edges[b] = edges[b].filter(edge => edge.to !== a)
        blocked = true
        break
      }
      if (!blocked) points = order.map(index => nodes[index])
    }
    // A global spline can overshoot a wall near one waypoint. Falling back to
    // the entire polygon then makes every other bend visibly snap. Instead,
    // each quadratic fillet shares the exact incoming and outgoing tangents
    // of its neighboring straight segments. Only a constrained bend shrinks.
    const rounded = [points[0].clone()]
    for (let i = 1; i < points.length - 1; i++) {
      const before = points[i - 1], corner = points[i], after = points[i + 1]
      const incoming = corner.clone().sub(before).normalize(), outgoing = after.clone().sub(corner).normalize()
      if (incoming.angleTo(outgoing) < 1e-6) continue
      let trim = Math.min(8, before.distanceTo(corner) * .45, corner.distanceTo(after) * .45)
      let bend: THREE.Vector3[] | null = null
      for (let attempt = 0; attempt < 14; attempt++, trim *= .5) {
        const start = corner.clone().addScaledVector(incoming, -trim)
        const end = corner.clone().addScaledVector(outgoing, trim)
        const curve = new THREE.QuadraticBezierCurve3(start, corner, end)
        const samples = [start]
        // Sampling follows curvature as well as length. Tiny, tight corners
        // need more samples than an equal-length straight segment; otherwise
        // a "smooth" curve still arrives at the renderer as a hard elbow.
        const subdivide = (u: number, v: number, depth: number) => {
          const a = curve.getPoint(u), b = curve.getPoint(v)
          const turn = curve.getTangent(u).angleTo(curve.getTangent(v))
          if (depth < 14 && (a.distanceTo(b) > .25 || turn > Math.PI / 180)) {
            const middle = (u + v) / 2
            subdivide(u, middle, depth + 1); subdivide(middle, v, depth + 1)
          } else samples.push(b)
        }
        subdivide(0, 1, 0)
        if (samples.every((point, j) => !j || sweptClear(samples[j - 1], point))) { bend = samples; break }
      }
      // Fail closed if a genuinely pinched route cannot accommodate a bend.
      // Never send a polygon with an unchecked corner to the camera controller.
      if (!bend) return null
      rounded.push(...bend)
    }
    rounded.push(points[points.length - 1].clone())
    return rounded
  }
  return { clear, safe, route }
}
export type CameraGuard = ReturnType<typeof createCameraGuard>

export function pathDistance(points: THREE.Vector3[]) {
  let distance = 0
  for (let i = 1; i < points.length; i++) distance += points[i].distanceTo(points[i - 1])
  return distance
}
export function pointOnPath(points: THREE.Vector3[], distance: number, result: THREE.Vector3) {
  for (let i = 1; i < points.length; i++) {
    const segment = points[i - 1].distanceTo(points[i])
    if (distance <= segment) return result.lerpVectors(points[i - 1], points[i], segment ? distance / segment : 1)
    distance -= segment
  }
  return result.copy(points[points.length - 1])
}
