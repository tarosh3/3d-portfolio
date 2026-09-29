import * as THREE from 'three'
import { pathDistance, pointOnPath } from './camera-path'
import type { ArtifactPose } from './artifact-camera'

export type CameraSnapshot = ArtifactPose & { quaternion: THREE.Quaternion }
export const motionEase = (t: number) => t * t * (3 - 2 * t)

export function orientPose(pose: ArtifactPose): CameraSnapshot {
  return { ...pose, quaternion: new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().lookAt(pose.position, pose.target, pose.up)) }
}

/** Retrace exactly the portion already travelled, including early cancellation. */
export function reverseTravelledPath(points: THREE.Vector3[], travelled: number) {
  const distance = Math.min(pathDistance(points), Math.max(0, travelled))
  const result = [pointOnPath(points, distance, new THREE.Vector3())]
  let length = 0
  const passed: THREE.Vector3[] = []
  for (let i = 0; i < points.length; i++) {
    if (i) length += points[i - 1].distanceTo(points[i])
    if (length >= distance - 1e-8) break
    passed.push(points[i].clone())
  }
  result.push(...passed.reverse())
  return result
}

/** Supply the cached route length during playback; one-off callers may omit it. */
export function sampleArtifactMotion(from: CameraSnapshot, to: CameraSnapshot, points: THREE.Vector3[], progress: number, output: CameraSnapshot, distance = pathDistance(points)) {
  const t = motionEase(Math.max(0, Math.min(1, progress)))
  pointOnPath(points, distance * t, output.position)
  output.target.lerpVectors(from.target, to.target, t)
  output.up.lerpVectors(from.up, to.up, t).normalize()
  output.quaternion.slerpQuaternions(from.quaternion, to.quaternion, t)
  output.fov = THREE.MathUtils.lerp(from.fov, to.fov, t)
  return output
}
