'use client'

import { useEffect, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { OrbitControls } from 'three-stdlib'
import * as THREE from 'three'
import { areaById, cameraFov, cameraScale, type AreaId, type IslandArea } from './island-data'
import { createCameraGuard, pathDistance, pointOnPath, type CameraGuard } from './camera-path'
import { artifactPose, type ArtifactFocus } from './artifact-camera'
import { motionEase, orientPose, reverseTravelledPath, sampleArtifactMotion, type CameraSnapshot } from './artifact-motion'
import { ARRIVAL_SECONDS, arrivalRoute, type ArrivalPhase } from './island-arrival'
import type { TutorialGesture } from './island-tutorial'
import { CINEMATIC_ATMOSPHERE_SECONDS, cinematicTravelTime, createCinematicPath, type CinematicPath } from './cinematic-path'

type Flight = { points: THREE.Vector3[] | null; distance: number; sourceTarget: THREE.Vector3; target: THREE.Vector3; destination: THREE.Vector3; sourceFov: number; targetFov: number; elapsed: number; duration: number }
const limitKeys = ['minDistance', 'maxDistance', 'minPolarAngle', 'maxPolarAngle', 'minAzimuthAngle', 'maxAzimuthAngle'] as const
type FocusFlight = { serial: number; original: CameraSnapshot; from: CameraSnapshot; to: CameraSnapshot; output: CameraSnapshot; points: THREE.Vector3[]; distance: number; travelled: number; elapsed: number; duration: number; phase: 'approach' | 'hold' | 'return' | 'done'; limits: Record<typeof limitKeys[number], number> }
type Props = { arrival: ArrivalPhase; onArrivalStart: () => void; onArrivalEnd: () => void; request: { area: AreaId; serial: number }; zoom: { direction: number; serial: number }; focus: ArtifactFocus | null; model: THREE.Group | null; reduced: boolean; enabled: boolean; onMoving: (moving: boolean, cut?: boolean) => void; onAreaArrive?: (serial: number) => void; onInteract: () => void; onOverview: () => void; onSectionStep: (direction: number) => void; onFocusArrive: () => void; onFocusReturn: () => void; cinematic?: { serial: number; seed: number } | null; onCinematicEnd?: (unavailable?: boolean) => void; onCinematicMinute?: () => void; onExploreGesture?: (gesture: TutorialGesture) => void }
type CinematicFlight = { serial: number; path: CinematicPath; entry: Flight; elapsed: number; minute: number; target: THREE.Vector3; cruising: boolean }
const ease = (t: number) => t * t * t * (t * (t * 6 - 15) + 10)

// OrbitControls keeps drag velocity internally. Drain it without moving the
// visible camera before a flight, a collision rollback, or a reading approach.
function clearMomentum(controls: OrbitControls, camera: THREE.Camera) {
  const position = camera.position.clone(), target = controls.target.clone()
  const quaternion = camera.quaternion.clone()
  controls.enableDamping = false
  controls.update()
  camera.position.copy(position); controls.target.copy(target)
  camera.quaternion.copy(quaternion)
}

function releaseCinematicOrbit(controls: OrbitControls, camera: THREE.Camera) {
  const radius = camera.position.distanceTo(controls.target)
  controls.minDistance = Math.max(1, radius * .4); controls.maxDistance = Math.max(70, radius + 1)
  controls.minPolarAngle = .05; controls.maxPolarAngle = 1.5
  controls.minAzimuthAngle = -Infinity; controls.maxAzimuthAngle = Infinity
}

export default function IslandControls(props: Props) {
  const { camera, gl, size, invalidate } = useThree()
  const latest = useRef(props); latest.current = props
  const control = useRef<OrbitControls | null>(null)
  const guard = useRef<CameraGuard | null>(null)
  const flight = useRef<Flight | null>(null)
  const focusFlight = useRef<FocusFlight | null>(null)
  const previous = useRef(new THREE.Vector3())
  const last = useRef(-1)
  const initialized = useRef(false)
  const lastZoom = useRef(0)
  const zoomRadius = useRef<number | null>(null)
  const zoomOffset = useRef(new THREE.Vector3())
  const gesture = useRef<'pointer' | TutorialGesture | null>(null)
  const gestureDirection = useRef(new THREE.Vector3())
  const gestureOffset = useRef(new THREE.Vector3())
  const gestureRadius = useRef(0)
  const interactRef = useRef<(() => void) | null>(null)
  const arrivalFlight = useRef<(Flight & { started: boolean }) | null>(null)
  const arrivalHandled = useRef(false)
  const cinematicFlight = useRef<CinematicFlight | null>(null)
  const aspect = useRef(size.width / size.height); aspect.current = size.width / size.height
  const zoomScale = () => cameraScale(size.width / size.height)

  useEffect(() => {
    guard.current = props.model ? createCameraGuard(props.model) : null
    return () => { guard.current = null }
  }, [props.model])
  useEffect(() => {
    const controls = new OrbitControls(camera, gl.domElement)
    last.current = -1
    control.current = controls
    controls.enableDamping = false
    controls.dampingFactor = .16
    controls.enablePan = false
    controls.rotateSpeed = .45
    controls.zoomSpeed = .7
    controls.target.set(1, 2.6, 0)
    gl.domElement.tabIndex = 0
    gl.domElement.setAttribute('aria-label', 'Explore the 3D island')
    gl.domElement.setAttribute('aria-describedby', 'island-controls-help')
    const interact = () => {
      if (!latest.current.enabled) return
      if (latest.current.focus || latest.current.arrival !== 'done') return
      if (latest.current.cinematic) latest.current.onCinematicEnd?.()
      zoomRadius.current = null
      gesture.current = null
      if (flight.current) {
        flight.current = null
        const radius = camera.position.distanceTo(controls.target)
        const polar = new THREE.Spherical().setFromVector3(camera.position.clone().sub(controls.target)).phi
        controls.minAzimuthAngle = -Infinity; controls.maxAzimuthAngle = Infinity
        controls.minDistance = Math.max(.5, radius * .65)
        controls.maxDistance = Math.max(70, controls.minDistance + 20)
        controls.minPolarAngle = Math.min(.15, polar); controls.maxPolarAngle = Math.max(1.4, polar)
        latest.current.onMoving(false)
      }
      controls.enableDamping = !latest.current.reduced
      latest.current.onInteract()
      invalidate()
    }
    interactRef.current = interact
    const takeOver = () => {
      if (!cinematicFlight.current || !latest.current.enabled) return
      cinematicFlight.current = null
      releaseCinematicOrbit(controls, camera)
      previous.current.copy(camera.position)
      controls.enabled = true
      latest.current.onMoving(false)
      latest.current.onCinematicEnd?.()
    }
    // Section scrolling is handled by the shell. Keep OrbitControls' touch
    // pinch support, but never let its wheel listener turn scrolling into zoom.
    const stopWheelZoom = (event: WheelEvent) => event.stopImmediatePropagation()
    const changed = () => invalidate()
    const beginGesture = () => {
      interact()
      if (!latest.current.enabled || latest.current.focus) return
      gesture.current = 'pointer'
      gestureRadius.current = camera.position.distanceTo(controls.target)
      gestureDirection.current.subVectors(camera.position, controls.target).normalize()
    }
    const keyboard = (event: KeyboardEvent) => {
      if (!latest.current.enabled || latest.current.focus) return
      if (event.ctrlKey || event.metaKey || event.altKey) return
      if (event.key === 'PageDown' || event.key === 'PageUp' || event.key === ' ') {
        event.preventDefault(); latest.current.onSectionStep(event.key === 'PageUp' || event.shiftKey ? -1 : 1); return
      }
      if (event.key === 'Home') { event.preventDefault(); latest.current.onOverview(); return }
      if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', '+', '=', '-', '_'].includes(event.key)) return
      event.preventDefault(); takeOver(); interact()
      gesture.current = event.key.startsWith('Arrow') ? 'orbit' : 'zoom'
      gestureRadius.current = camera.position.distanceTo(controls.target)
      gestureDirection.current.subVectors(camera.position, controls.target).normalize()
      const offset = camera.position.clone().sub(controls.target)
      const spherical = new THREE.Spherical().setFromVector3(offset)
      if (event.key === 'ArrowLeft') spherical.theta -= .09
      if (event.key === 'ArrowRight') spherical.theta += .09
      if (event.key === 'ArrowUp') spherical.phi -= .06
      if (event.key === 'ArrowDown') spherical.phi += .06
      if (event.key === '+' || event.key === '=') spherical.radius *= .9
      if (event.key === '-' || event.key === '_') spherical.radius *= 1.1
      camera.position.copy(controls.target).add(offset.setFromSpherical(spherical))
      controls.update(); invalidate()
    }
    controls.addEventListener('start', beginGesture)
    controls.addEventListener('change', changed)
    gl.domElement.addEventListener('keydown', keyboard)
    gl.domElement.addEventListener('pointerdown', takeOver, { capture: true })
    gl.domElement.addEventListener('wheel', stopWheelZoom, { capture: true, passive: true })
    return () => {
      controls.removeEventListener('start', beginGesture); controls.removeEventListener('change', changed)
      gl.domElement.removeEventListener('keydown', keyboard)
      gl.domElement.removeEventListener('pointerdown', takeOver, true)
      gl.domElement.removeEventListener('wheel', stopWheelZoom, true)
      controls.dispose(); control.current = null; interactRef.current = null
    }
  }, [camera, gl, invalidate])
  useEffect(() => { gesture.current = null }, [props.request.serial, props.focus, props.cinematic, props.enabled])
  useEffect(() => {
    const controls = control.current
    if (!controls) return
    controls.enabled = props.enabled && !props.focus && !props.cinematic && props.arrival === 'done'
    if (!controls.enabled || props.reduced) clearMomentum(controls, camera)
  }, [camera, props.enabled, props.focus, props.reduced, props.arrival, props.cinematic])

  useEffect(() => {
    const controls = control.current
    if (!controls) return
    if (!props.cinematic || props.reduced) {
      if (cinematicFlight.current) {
        cinematicFlight.current = null
        previous.current.copy(camera.position)
        // Hand back this exact view. Area limits from an earlier close-up must
        // not clamp the film's camera position or restart its old area flight.
        releaseCinematicOrbit(controls, camera)
        latest.current.onMoving(false)
      }
      if (props.cinematic && props.reduced) latest.current.onCinematicEnd?.()
      return
    }
    const safety = guard.current
    const path = safety && createCinematicPath(safety, props.cinematic.seed, aspect.current, { position: camera.position, target: controls.target })
    const destination = new THREE.Vector3(), target = new THREE.Vector3()
    path?.sample(0, destination, target)
    const points = path?.anchored ? [camera.position.clone()] : path && safety?.route(camera.position, destination)
    if (!path || !points) { latest.current.onCinematicEnd?.(true); return }
    clearMomentum(controls, camera)
    flight.current = null; zoomRadius.current = null
    const distance = pathDistance(points), fov = camera instanceof THREE.PerspectiveCamera ? camera.fov : cameraFov(aspect.current)
    cinematicFlight.current = {
      serial: props.cinematic.serial, path, elapsed: 0, minute: 0, target: new THREE.Vector3(), cruising: path.anchored,
      entry: { points, distance, sourceTarget: controls.target.clone(), target, destination, sourceFov: fov, targetFov: cameraFov(aspect.current), elapsed: 0, duration: Math.min(5.5, Math.max(2.5, distance / 9)) },
    }
    controls.enabled = false
    last.current = latest.current.request.serial
    latest.current.onMoving(true)
    invalidate()
  }, [camera, invalidate, props.cinematic, props.reduced, props.model])

  const frameArea = (area: IslandArea) => {
    const target = new THREE.Vector3(...area.target)
    const offset = new THREE.Vector3(...area.position).sub(target).multiplyScalar(zoomScale())
    if (area.id === 'overview' && size.width < 760) target.y += 1.5
    let destination = target.clone().add(offset)
    // Small safety adjustment for portrait framing or an authored pose close to a leaf.
    if (guard.current && !guard.current.safe(destination)) {
      const spherical = new THREE.Spherical().setFromVector3(offset)
      outer: for (const radius of [1.1, 1.25, 1.5]) for (const turn of [0, .16, -.16, .32, -.32]) {
        const candidate = new THREE.Vector3().setFromSpherical(new THREE.Spherical(spherical.radius * radius, spherical.phi, spherical.theta + turn)).add(target)
        if (guard.current.safe(candidate)) { destination = candidate; break outer }
      }
    }
    return { target, destination }
  }
  const limits = (area: IslandArea) => {
    const controls = control.current!
    const spherical = new THREE.Spherical().setFromVector3(camera.position.clone().sub(controls.target))
    const overview = area.id === 'overview'
    controls.minDistance = Math.min(spherical.radius, area.range[0] * zoomScale())
    controls.maxDistance = Math.max(spherical.radius + 1, area.range[1] * zoomScale())
    controls.minPolarAngle = overview ? .2 : Math.max(.2, spherical.phi - .35)
    controls.maxPolarAngle = overview ? 1.28 : Math.min(1.63, spherical.phi + .16)
    controls.minAzimuthAngle = overview ? -Infinity : spherical.theta - area.arc
    controls.maxAzimuthAngle = overview ? Infinity : spherical.theta + area.arc
  }

  useFrame((_, delta) => {
    const controls = control.current
    if (!controls) return
    // Mobile browser bars continually change canvas height. Only an explicit
    // area request starts a journey; resizing must preserve the current orbit.
    const signature = props.request.serial
    if (!arrivalHandled.current) {
      const overview = areaById('overview')
      const settle = () => {
        const pose = arrivalFlight.current || frameArea(overview)
        clearMomentum(controls, camera)
        camera.position.copy(pose.destination); controls.target.copy(pose.target)
        camera.up.set(0, 1, 0)
        if (camera instanceof THREE.PerspectiveCamera) {
          camera.fov = arrivalFlight.current?.targetFov ?? cameraFov(size.width / size.height)
          camera.updateProjectionMatrix()
        }
        controls.update(); limits(overview); previous.current.copy(camera.position)
        initialized.current = true
        // A click may already have requested a place as it skipped the intro.
        // Let that request travel normally from the overview on the next frame.
        last.current = props.request.area === 'overview' ? signature : -1
        arrivalFlight.current = null; arrivalHandled.current = true
        // Skipping the intro can already have requested another destination.
        // Reaching overview must not acknowledge that later area's request.
        if (props.request.area === 'overview') props.onAreaArrive?.(signature)
        props.onArrivalEnd(); props.onMoving(false); invalidate()
      }
      if (props.arrival === 'done' || props.reduced || props.request.area !== 'overview') {
        if (arrivalFlight.current) settle()
        else { arrivalHandled.current = true; if (props.arrival !== 'done') props.onArrivalEnd() }
      } else {
        controls.enabled = false
        if (!guard.current) return
        if (!arrivalFlight.current) {
          const { destination, target } = frameArea(overview)
          const points = arrivalRoute(guard.current, destination, target)
          controls.minDistance = 1; controls.maxDistance = 180
          controls.minPolarAngle = .01; controls.maxPolarAngle = Math.PI - .01
          controls.minAzimuthAngle = -Infinity; controls.maxAzimuthAngle = Infinity
          if (!points) { settle(); return }
          const targetFov = cameraFov(size.width / size.height)
          arrivalFlight.current = { points, distance: pathDistance(points), sourceTarget: target.clone(), target, destination, sourceFov: targetFov, targetFov, elapsed: 0, duration: ARRIVAL_SECONDS, started: false }
          camera.position.copy(points[0]); controls.target.copy(target)
          camera.up.set(0, 1, 0)
          if (camera instanceof THREE.PerspectiveCamera) { camera.fov = targetFov; camera.updateProjectionMatrix() }
          controls.update(); previous.current.copy(camera.position)
        }
        // Prepare above the cloud layer beneath the loader, but start the clock
        // only when LoadingScreen has revealed the scene and the tab is active.
        if (!props.enabled) return
        const trip = arrivalFlight.current
        if (!trip.started) { trip.started = true; props.onArrivalStart() }
        else trip.elapsed += Math.min(delta, .05)
        const t = Math.min(1, trip.elapsed / trip.duration)
        pointOnPath(trip.points!, trip.distance * ease(t), camera.position)
        controls.update(); previous.current.copy(camera.position)
        if (t === 1) settle()
        invalidate()
        return
      }
    }
    const cinema = cinematicFlight.current
    if (cinema && props.cinematic && !props.reduced) {
      if (!props.enabled) return
      controls.enabled = false
      const dt = Math.min(Math.max(delta, 0), .05)
      cinema.elapsed += dt
      const minute = Math.floor(cinema.elapsed / CINEMATIC_ATMOSPHERE_SECONDS)
      if (minute > cinema.minute) { cinema.minute = minute; props.onCinematicMinute?.() }
      const entry = cinema.entry
      if (!cinema.cruising) {
        entry.elapsed += dt
        const t = Math.min(1, entry.elapsed / entry.duration), blend = ease(t)
        pointOnPath(entry.points!, entry.distance * blend, camera.position)
        controls.target.lerpVectors(entry.sourceTarget, entry.target, blend)
        if (camera instanceof THREE.PerspectiveCamera) camera.fov = THREE.MathUtils.lerp(entry.sourceFov, cameraFov(size.width / size.height), blend)
        if (t === 1) cinema.cruising = true
      } else {
        const time = cinematicTravelTime(cinema.elapsed - entry.elapsed)
        cinema.path.sample(time / cinema.path.duration, camera.position, cinema.target)
        controls.target.copy(cinema.target)
        if (camera instanceof THREE.PerspectiveCamera) camera.fov = THREE.MathUtils.damp(camera.fov, cameraFov(size.width / size.height), 5, dt)
      }
      camera.up.set(0, 1, 0); camera.lookAt(controls.target)
      if (camera instanceof THREE.PerspectiveCamera) camera.updateProjectionMatrix()
      previous.current.copy(camera.position)
      // OrbitControls.update would clamp the cinematic path to the previous
      // area's orbit limits. Only this branch owns the camera during the film.
      return
    }
    if (props.focus) {
      if (!props.enabled) return
      controls.enabled = false
      const capture = (): CameraSnapshot => ({ position: camera.position.clone(), target: controls.target.clone(), up: camera.up.clone(), quaternion: camera.quaternion.clone(), fov: camera instanceof THREE.PerspectiveCamera ? camera.fov : 45 })
      let trip = focusFlight.current
      // Escape can arrive before the first frame has captured an approach.
      // Nothing has moved yet, so there is no path to retrace.
      if ((!trip || trip.serial !== props.focus.serial) && props.focus.phase === 'return') {
        props.onFocusReturn()
        return
      }
      if ((!trip || trip.serial !== props.focus.serial) && props.focus.phase === 'approach') {
        zoomRadius.current = null
        clearMomentum(controls, camera)
        const original = capture(), destination = orientPose(artifactPose(props.focus.request, size.width / size.height))
        const route = guard.current?.route(original.position, destination.position)
        // A manually orbited pose may be boxed in. Keep the current view if no
        // checked route exists; opening content must never teleport through walls.
        const points = route || [original.position.clone()]
        const distance = pathDistance(points)
        trip = { serial: props.focus.serial, original, from: original, to: route ? destination : original, output: capture(), points, distance, travelled: 0, elapsed: 0, duration: Math.min(3.4, Math.max(1.25, distance / 8)), phase: 'approach', limits: Object.fromEntries(limitKeys.map(key => [key, controls[key]])) as FocusFlight['limits'] }
        focusFlight.current = trip
        flight.current = null
        lastZoom.current = props.zoom.serial
      }
      if (!trip || trip.phase === 'done') return
      if (props.focus.phase === 'return' && trip.phase !== 'return') {
        trip.points = reverseTravelledPath(trip.points, trip.travelled)
        trip.distance = pathDistance(trip.points)
        trip.from = capture(); trip.to = trip.original
        trip.elapsed = 0; trip.duration = Math.min(2.8, Math.max(.65, trip.distance / 9)); trip.phase = 'return'
      }
      if (trip.phase === 'hold') return
      trip.elapsed += Math.min(delta, .05)
      const t = props.reduced ? 1 : Math.min(1, trip.elapsed / trip.duration)
      trip.travelled = trip.distance * motionEase(t)
      const pose = sampleArtifactMotion(trip.from, trip.to, trip.points, t, trip.output, trip.distance)
      camera.position.copy(pose.position); camera.up.copy(pose.up); camera.quaternion.copy(pose.quaternion)
      controls.target.copy(pose.target)
      if (camera instanceof THREE.PerspectiveCamera) { camera.fov = pose.fov; camera.updateProjectionMatrix() }
      // OrbitControls caches world-up at construction. It must not update a
      // tilted reading view, or it can clamp the approach or erase its rotation.
      previous.current.copy(camera.position)
      if (t === 1 && (props.reduced || trip.phase === 'return' || trip.elapsed >= trip.duration + .18)) {
        if (trip.phase === 'return') {
          Object.assign(controls, trip.limits)
          controls.update()
          previous.current.copy(camera.position)
          last.current = signature
          trip.phase = 'done'
          props.onFocusReturn()
        } else {
          trip.phase = 'hold'
          props.onFocusArrive()
        }
      }
      invalidate()
      return
    }
    focusFlight.current = null
    // Repeat visits and Still also need their correct pose painted underneath
    // LoadingScreen. Input stays disabled until the reveal has completed.
    if (last.current !== signature && (props.enabled || (!initialized.current && Boolean(props.model)))) {
      last.current = signature
      clearMomentum(controls, camera)
      zoomRadius.current = null
      const area = areaById(props.request.area)
      const targetFov = cameraFov(size.width / size.height)
      const { destination, target } = frameArea(area)
      const first = !initialized.current
      initialized.current = true
      // A single controller owns both travel and exploration. No document scroll state.
      controls.minAzimuthAngle = -Infinity; controls.maxAzimuthAngle = Infinity
      controls.minDistance = 1; controls.maxDistance = 180
      controls.minPolarAngle = .01; controls.maxPolarAngle = Math.PI - .01
      const points = first || props.reduced ? [camera.position.clone(), destination] : guard.current?.route(camera.position, destination) || null
      const distance = points ? pathDistance(points) : 0
      if (first || props.reduced || distance < .02 && points) {
        camera.position.copy(destination); controls.target.copy(target); camera.up.set(0, 1, 0)
        if (camera instanceof THREE.PerspectiveCamera) { camera.fov = targetFov; camera.updateProjectionMatrix() }
        controls.update(); previous.current.copy(camera.position); limits(area)
        flight.current = null; props.onMoving(false)
        props.onAreaArrive?.(signature)
      } else {
        flight.current = { points, distance, sourceTarget: controls.target.clone(), target, destination, sourceFov: camera instanceof THREE.PerspectiveCamera ? camera.fov : targetFov, targetFov, elapsed: 0, duration: points ? Math.min(4, Math.max(.9, distance / 15)) : .45 }
        props.onMoving(true, !points)
      }
      invalidate()
    }
    if (!props.enabled) return
    if (lastZoom.current !== props.zoom.serial) {
      lastZoom.current = props.zoom.serial
      const radius = zoomRadius.current ?? camera.position.distanceTo(controls.target)
      interactRef.current?.()
      gesture.current = 'zoom'
      gestureRadius.current = camera.position.distanceTo(controls.target)
      gestureDirection.current.subVectors(camera.position, controls.target).normalize()
      zoomRadius.current = THREE.MathUtils.clamp(radius * (props.zoom.direction > 0 ? .88 : 1 / .88), controls.minDistance, controls.maxDistance)
      invalidate()
    }
    const current = flight.current
    if (current) {
      if (props.reduced) current.elapsed = current.duration
      current.elapsed += Math.min(delta, .05)
      const t = Math.min(1, current.elapsed / current.duration)
      if (current.points) {
        pointOnPath(current.points, current.distance * ease(t), camera.position)
        controls.target.lerpVectors(current.sourceTarget, current.target, ease(t))
      } else if (t > .45) {
        // Rare fully obstructed routes change view under a brief fade instead of crossing geometry.
        camera.position.copy(current.destination); controls.target.copy(current.target)
      }
      camera.up.set(0, 1, 0)
      if (camera instanceof THREE.PerspectiveCamera) { camera.fov = THREE.MathUtils.lerp(current.sourceFov, current.targetFov, ease(t)); camera.updateProjectionMatrix() }
      controls.update()
      if (t === 1) {
        camera.position.copy(current.destination); controls.target.copy(current.target)
        if (camera instanceof THREE.PerspectiveCamera) { camera.fov = current.targetFov; camera.updateProjectionMatrix() }
        controls.update()
        limits(areaById(props.request.area))
        flight.current = null; props.onMoving(false)
        props.onAreaArrive?.(signature)
      }
      previous.current.copy(camera.position)
      invalidate()
    } else {
      controls.enableDamping = !props.reduced
      controls.dampingFactor = 1 - Math.exp(-12 * Math.min(delta, .05))
      controls.update()
      if (zoomRadius.current !== null) {
        const offset = zoomOffset.current.subVectors(camera.position, controls.target)
        const radius = props.reduced ? zoomRadius.current : THREE.MathUtils.damp(offset.length(), zoomRadius.current, 12, Math.min(delta, .05))
        camera.position.copy(controls.target).add(offset.setLength(radius))
        if (Math.abs(radius - zoomRadius.current) < .002) zoomRadius.current = null
        invalidate()
      }
      if (camera.position.distanceToSquared(previous.current) > .000001) {
        if (camera.position.y < 2.9 || guard.current && (!guard.current.clear(previous.current, camera.position, .3) || !guard.current.safe(camera.position))) {
          clearMomentum(controls, camera)
          zoomRadius.current = null
          camera.position.copy(previous.current); controls.update()
        } else previous.current.copy(camera.position)
      }
      // Report a real, collision-accepted change once per gesture. A click,
      // canceled flight or camera animation must never complete a lesson.
      if (gesture.current) {
        const radius = camera.position.distanceTo(controls.target)
        const zoomed = Math.abs(radius - gestureRadius.current) > Math.max(.015, gestureRadius.current * .02)
        gestureOffset.current.subVectors(camera.position, controls.target).normalize()
        const orbited = gestureOffset.current.dot(gestureDirection.current) < Math.cos(.025)
        const kind = zoomed && gesture.current !== 'orbit' ? 'zoom' : orbited && gesture.current !== 'zoom' ? 'orbit' : null
        if (kind) { gesture.current = null; props.onExploreGesture?.(kind) }
      }
      // A lens adjustment fits the new aspect without discarding an explored
      // view or routing back to the default area on every toolbar resize.
      if (camera instanceof THREE.PerspectiveCamera) {
        const targetFov = cameraFov(size.width / size.height)
        if (Math.abs(camera.fov - targetFov) > .01) {
          camera.fov = props.reduced ? targetFov : THREE.MathUtils.damp(camera.fov, targetFov, 10, Math.min(delta, .05))
          camera.updateProjectionMatrix()
          invalidate()
        }
      }
    }
  // Finish camera motion before camera-follow sky/moon subscribers (priority 0).
  // Negative priority preserves R3F/composer ownership of the actual render.
  }, -50)
  return null
}
