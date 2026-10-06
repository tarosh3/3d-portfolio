import * as THREE from 'three'
import type { CameraGuard } from './camera-path'

export const CINEMATIC_ATMOSPHERE_SECONDS = 60
export const CINEMATIC_SPEED = 2.7
export const CINEMATIC_ACCELERATION_SECONDS = 1.2
const TAU = Math.PI * 2
const CENTER_X = -3, CENTER_Z = -2
const GATE = Math.PI, STEPS = 1440, STEP = TAU / STEPS

type Sweep = { center: number; width: number; radius: number; height: number }
type Profile = { sweeps: Sweep[]; phase: number; drift: number }
type Track = { points: THREE.Vector3[]; lengths: Float64Array; distance: number }
type Circuit = Track & { profile: Profile }
export type CinematicPath = {
  duration: number; distance: number; direction: number; seed: number; anchored: boolean
  /** One-time live-view entrance, followed by an unbounded sequence of circuits. */
  entryDistance: number
  sample: (progress: number, position: THREE.Vector3, target: THREE.Vector3) => void
}

const wrap = (angle: number) => ((angle % TAU) + TAU) % TAU
const ease = (t: number) => t * t * t * (t * (t * 6 - 15) + 10)
function randomSource(seed: number) {
  let state = seed >>> 0
  return () => { state = (Math.imul(state, 1664525) + 1013904223) >>> 0; return state / 4294967296 }
}

// A surveyed corridor, independent of sections: through the covered veranda,
// along the side walkway, around the rear deck and west wall. Rounded corners
// share their tangent with each straight. Intersect a polar ray with that
// rounded rectangle so the angular coordinate can only advance.
function corridorRadius(angle: number) {
  const x = Math.sin(angle), z = Math.cos(angle)
  const wall = Math.min(Math.abs(x) < 1e-10 ? Infinity : (x > 0 ? 4 : -6.4) / x, Math.abs(z) < 1e-10 ? Infinity : (z > 0 ? 3.55 : -6.4) / z)
  const hitX = CENTER_X + wall * x, hitZ = CENTER_Z + wall * z
  const cornerX = THREE.MathUtils.clamp(hitX, -6.2, -2.2), cornerZ = THREE.MathUtils.clamp(hitZ, -5.2, -1.65)
  if (Math.abs(hitX - cornerX) < 1e-8 || Math.abs(hitZ - cornerZ) < 1e-8) return wall
  const dx = cornerX - CENTER_X, dz = cornerZ - CENTER_Z, projection = dx * x + dz * z
  return projection + Math.sqrt(Math.max(0, projection * projection - dx * dx - dz * dz + 3.2 * 3.2))
}

function profilePoint(profile: Profile, angle: number, result: THREE.Vector3) {
  let radius = corridorRadius(angle), height = 4.2
  for (const sweep of profile.sweeps) {
    const difference = Math.abs(wrap(angle - sweep.center + Math.PI) - Math.PI)
    if (difference >= sweep.width) continue
    const blend = Math.cos(difference / sweep.width * Math.PI * .5) ** 4
    radius += sweep.radius * blend; height += sweep.height * blend
  }
  // All curves share the rear-deck joining tangent, including its derivatives.
  const envelope = Math.max(0, Math.cos(angle - Math.PI / 2)) ** 4
  radius += Math.sin(angle * 2 + profile.phase) * profile.drift * envelope
  height += (.04 + Math.sin(angle + profile.phase) * .025) * envelope
  return result.set(CENTER_X + Math.sin(angle) * radius, height, CENTER_Z + Math.cos(angle) * radius)
}

function measure(points: THREE.Vector3[]): Track {
  const lengths = new Float64Array(points.length)
  for (let i = 1; i < points.length; i++) lengths[i] = lengths[i - 1] + points[i - 1].distanceTo(points[i])
  return { points, lengths, distance: lengths[lengths.length - 1] }
}

function pointAt(track: Track, distance: number, result: THREE.Vector3) {
  let lo = 0, hi = track.points.length - 1
  while (hi - lo > 1) { const mid = (lo + hi) >>> 1; if (track.lengths[mid] <= distance) lo = mid; else hi = mid }
  return result.lerpVectors(track.points[lo], track.points[hi], (distance - track.lengths[lo]) / (track.lengths[hi] - track.lengths[lo] || 1))
}

// Constant speed also needs bounded curvature: a short spiral may be clear of
// geometry yet turn like a hairpin at its exit. Test the actual sampled motion.
function gentle(track: Track) {
  const previous = track.points[0].clone(), position = new THREE.Vector3(), velocity = new THREE.Vector3(), lastVelocity = new THREE.Vector3()
  const step = CINEMATIC_SPEED / 60
  for (let distance = step; distance <= track.distance; distance += step) {
    pointAt(track, distance, position)
    velocity.subVectors(position, previous).normalize()
    if (distance > step && velocity.dot(lastVelocity) < Math.cos(Math.PI / 45)) return false
    previous.copy(position); lastVelocity.copy(velocity)
  }
  return true
}

// The exploration guard checks a swept .23-unit camera corridor. All checks
// and allocations happen at activation, never in sample().
function corridorCheck(guard: CameraGuard) {
  const a = new THREE.Vector3(), b = new THREE.Vector3()
  const axes = [new THREE.Vector3(.23, 0, 0), new THREE.Vector3(0, .23, 0), new THREE.Vector3(0, 0, .23)]
  return (points: THREE.Vector3[]) => {
    for (let i = 0; i < points.length; i++) {
      if (!guard.safe(points[i])) return false
      if (!i) continue
      if (!guard.clear(points[i - 1], points[i], 0)) return false
      for (const axis of axes) for (const sign of [-1, 1]) {
        if (!guard.clear(a.copy(points[i - 1]).addScaledVector(axis, sign), b.copy(points[i]).addScaledVector(axis, sign), 0)) return false
      }
    }
    return true
  }
}

function makeCircuit(profile: Profile, direction: number, check: (points: THREE.Vector3[]) => boolean): Circuit | null {
  const points = Array.from({ length: STEPS + 1 }, (_, i) => profilePoint(profile, GATE + direction * i * STEP, new THREE.Vector3()))
  points[STEPS].copy(points[0])
  const track = measure(points)
  return gentle(track) && check(points) ? { ...track, profile } : null
}

function buildCircuits(random: () => number, direction: number, check: (points: THREE.Vector3[]) => boolean) {
  const circuits: Circuit[] = []
  // Alternate covered passes with open beach/pier sweeps. Every seed changes
  // the curve itself, not an ordered list of destination poses.
  for (let style = 0; style < 4; style++) {
    for (let attempt = 0; attempt < 12; attempt++) {
      const sweeps: Sweep[] = []
      if (style !== 2) sweeps.push({ center: (235 + random() * 10) * Math.PI / 180, width: (35 + random() * 10) * Math.PI / 180, radius: 3 + random() * 4, height: .2 + random() * .8 })
      if (style % 2 === 1) sweeps.push({ center: (random() - .5) * .08, width: (60 + random() * 10) * Math.PI / 180, radius: 5.5 + random() * 2, height: .2 + random() * 1.5 })
      if (style >= 2) sweeps.push({ center: (100 + random() * 12) * Math.PI / 180, width: (42 + random() * 10) * Math.PI / 180, radius: 4 + random() * 6, height: .2 + random() * .8 })
      const circuit = makeCircuit({ sweeps, phase: random() * TAU, drift: .04 + random() * .04 }, direction, check)
      if (circuit) { circuits.push(circuit); break }
    }
  }
  return circuits
}

function liveEntrance(circuits: Circuit[], origin: THREE.Vector3, direction: number, check: (points: THREE.Vector3[]) => boolean) {
  const radius = Math.hypot(origin.x - CENTER_X, origin.z - CENTER_Z)
  const offset = wrap(direction * (Math.atan2(origin.x - CENTER_X, origin.z - CENTER_Z) - GATE))
  const startAngle = GATE + direction * offset, scratch = new THREE.Vector3()
  const candidates = circuits.map(circuit => ({ circuit, distance: profilePoint(circuit.profile, startAngle, scratch).distanceToSquared(origin) })).sort((a, b) => a.distance - b.distance)
  // Depart directly toward a curve ahead of the live view, matching its first
  // two radial/height derivatives at the join. Starting at rest needs no fixed
  // departure tangent; forcing one would hook sharply back towards the island.
  for (const span of [.18, .35, .6, .9, 1.3, 1.8, 2.4, 3.1, 4.2, 5.5, 7]) for (const { circuit } of candidates) for (const departure of [0, 1]) {
    const endStep = Math.ceil((offset + span) / STEP), endOffset = endStep * STEP, angleSpan = endOffset - offset
    const count = Math.ceil(angleSpan * Math.max(radius, 16) / .065), points: THREE.Vector3[] = []
    for (let i = 0; i <= count; i++) {
      const t = i / count, angle = startAngle + direction * angleSpan * t
      const softDeparture = radius > 20 ? departure === 0 : departure === 1
      const blend = softDeparture ? ease(t) : 1 - (1 - t) ** 3
      profilePoint(circuit.profile, angle, scratch)
      const r = THREE.MathUtils.lerp(radius, Math.hypot(scratch.x - CENTER_X, scratch.z - CENTER_Z), blend)
      points.push(new THREE.Vector3(CENTER_X + Math.sin(angle) * r, THREE.MathUtils.lerp(origin.y, scratch.y, blend), CENTER_Z + Math.cos(angle) * r))
    }
    points[0].copy(origin)
    const join = endStep % STEPS
    points[points.length - 1].copy(circuit.points[join])
    if (!check(points)) continue
    for (let i = join + 1; i <= STEPS; i++) points.push(circuit.points[i])
    const track = measure(points)
    if (gentle(track)) return track
  }
  return null
}

/** Independent seeded fly-throughs with monotonic orbit heading, no section
 * stops or periodic easing, and a different prevalidated curve on each lap. */
export function createCinematicPath(guard: CameraGuard, seed: number, _aspect: number, origin?: { position: THREE.Vector3; target: THREE.Vector3 }): CinematicPath | null {
  if (origin && !guard.safe(origin.position)) return null
  if (origin) origin = { position: origin.position.clone(), target: origin.target.clone() }
  if (!guard.safe(new THREE.Vector3(-3, 4.2, -8.4))) return null
  const random = randomSource(seed), check = corridorCheck(guard)
  let direction = random() < .5 ? -1 : 1, circuits = buildCircuits(random, direction, check)
  if (!circuits.length) return null
  let entrance = origin ? liveEntrance(circuits, origin.position, direction, check) : null
  if (origin && !entrance) {
    direction = -direction
    circuits = circuits.map(circuit => ({ ...measure([...circuit.points].reverse()), profile: circuit.profile }))
    entrance = liveEntrance(circuits, origin.position, direction, check)
    if (!entrance) return null
  }
  const distance = circuits[0].distance, duration = distance / CINEMATIC_SPEED, entryDistance = entrance?.distance ?? 0
  const initialPosition = origin?.position ?? circuits[0].points[0]
  const initialRadius = Math.hypot(initialPosition.x - CENTER_X, initialPosition.z - CENTER_Z)
  const initialYaw = Math.atan2(initialPosition.x - CENTER_X, initialPosition.z - CENTER_Z) + Math.PI - direction * .2
  const initialPitch = Math.atan2(3.2 - initialPosition.y, Math.max(1.5, initialRadius * .6))
  const initialDirection = origin?.target.clone().sub(initialPosition)
  const yawOffset = initialDirection ? wrap(Math.atan2(initialDirection.x, initialDirection.z) - initialYaw + Math.PI) - Math.PI : 0
  const pitchOffset = initialDirection ? Math.atan2(initialDirection.y, Math.hypot(initialDirection.x, initialDirection.z)) - initialPitch : 0
  const initialFocus = initialDirection?.length() ?? Math.hypot(initialRadius * .6, 3.2 - initialPosition.y)
  // Select among cached curves without rebuilding a path or allocating at a
  // seam. The deterministic stream continues without a short repeated playlist.
  let lapStart = entryDistance, lap = 0, selected = 0
  const nextCircuit = () => {
    lap++
    let hash = Math.imul((seed + lap) | 0, 0x45d9f3b)
    hash = Math.imul(hash ^ (hash >>> 16), 0x45d9f3b)
    selected = circuits.length < 2 ? 0 : (selected + 1 + ((hash ^ (hash >>> 16)) >>> 0) % (circuits.length - 1)) % circuits.length
  }
  const sample = (progress: number, position: THREE.Vector3, target: THREE.Vector3) => {
    const travelled = Math.max(0, progress) * distance
    if (entrance && travelled < entryDistance) pointAt(entrance, travelled, position)
    else {
      if (travelled < lapStart) { lapStart = entryDistance; lap = 0; selected = 0 }
      while (travelled >= lapStart + circuits[selected].distance) { lapStart += circuits[selected].distance; nextCircuit() }
      pointAt(circuits[selected], travelled - lapStart, position)
    }
    const radius = Math.hypot(position.x - CENTER_X, position.z - CENTER_Z)
    const residual = 1 - ease(Math.min(1, travelled / 12))
    const yaw = Math.atan2(position.x - CENTER_X, position.z - CENTER_Z) + Math.PI - direction * .2 + yawOffset * residual
    const pitch = Math.atan2(3.2 - position.y, Math.max(1.5, radius * .6)) + pitchOffset * residual
    const focus = THREE.MathUtils.lerp(Math.hypot(Math.max(1.5, radius * .6), 3.2 - position.y), initialFocus, residual)
    target.set(position.x + Math.sin(yaw) * Math.cos(pitch) * focus, position.y + Math.sin(pitch) * focus, position.z + Math.cos(yaw) * Math.cos(pitch) * focus)
    if (travelled === 0 && origin) { position.copy(origin.position); target.copy(origin.target) }
  }
  return { duration, distance, direction, seed, anchored: Boolean(origin), entryDistance, sample }
}

export function cinematicTravelTime(elapsed: number) {
  const ramp = CINEMATIC_ACCELERATION_SECONDS
  if (elapsed >= ramp) return elapsed - ramp / 2
  const t = Math.max(0, elapsed) / ramp
  return ramp * (t * t * t - .5 * t * t * t * t)
}
