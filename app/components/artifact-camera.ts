import * as THREE from 'three'
import { magazinePose } from './magazine-camera'
import type { ReadRequest } from './island-data'

export type ArtifactFocus = { serial: number; request: ReadRequest; phase: 'approach' | 'reading' | 'closing' | 'return' }
export type ArtifactPose = { position: THREE.Vector3; target: THREE.Vector3; up: THREE.Vector3; fov: number }
const v = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z)
const q = (x: number, y: number, z: number, w: number) => new THREE.Quaternion(x, y, z, w).normalize()
const itemIndex = (request: ReadRequest, length: number) => Math.max(0, Math.min(length - 1, Math.floor(request.item || 0)))

export function artifactLabel(request: ReadRequest) {
  if (request.source === 'door') return 'the door note'
  if (request.stage === 1) return 'the magazine'
  if (request.stage === 2) return 'the notebook'
  if (request.stage === 3) return itemIndex(request, 2) ? 'the research poster' : 'the FitNyx poster'
  if (request.stage === 4) return ['the first story', 'the internship story', 'the current chapter'][itemIndex(request, 3)]
  if (request.stage === 6) return 'the tide log'
  if (request.stage === 7) return 'the field board'
  return 'the postbox'
}

function facePose(center: THREE.Vector3, rotation: THREE.Quaternion, width: number, height: number, aspect: number, tilt = 0, minDistance = .65): ArtifactPose {
  const fov = 36, lens = 2 * Math.tan(THREE.MathUtils.degToRad(fov / 2))
  const distance = Math.max(minDistance, height / (.60 * lens), width / (.78 * Math.max(.25, aspect) * lens))
  const up = v(0, 1, 0).applyQuaternion(rotation)
  const normal = v(0, 0, 1).applyQuaternion(rotation)
  return { target: center, position: center.clone().addScaledVector(normal, distance).addScaledVector(up, distance * tilt), up, fov }
}

/** Camera poses use the same measured surface bases as the physical prints. */
export function artifactPose(request: ReadRequest, aspect: number): ArtifactPose {
  if (request.source === 'door') return facePose(v(-1.333, 4.109, -3.170), q(.00015, .54031, -.00134, .84147), .33, .44, aspect)
  if (request.stage === 1) return magazinePose(aspect)
  if (request.stage === 2) {
    const rotation = q(-.65696, .26049, .25986, .65805)
    const center = v(-1.29341, 3.09853, -6.72417).add(v(0, 0, .025).applyQuaternion(rotation))
    return facePose(center, rotation, .324, .168, aspect, -.13)
  }
  if (request.stage === 3) {
    const item = itemIndex(request, 2), rotation = q(-.00305, -.37208, -.03008, .92771)
    const center = v(-4.34089, 3.75651, 4.86166).add(v((item ? 1 : -1) * .56, .02, .005).applyQuaternion(rotation))
    rotation.multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(0, 0, item ? .017 : -.021)))
    return facePose(center, rotation, .56, .765, aspect)
  }
  if (request.stage === 4) {
    const index = itemIndex(request, 3)
    const rope = new THREE.CatmullRomCurve3([v(1.25336, 4.8, 7.37367), v(.8807, 4.65, 8.92868), v(.50803, 4.8, 10.48369)])
    const rotation = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, 1.335, (index - 1) * .022))
    const center = rope.getPoint(.8 - index * .3).add(v(0, -.31, .005).applyQuaternion(rotation))
    return facePose(center, rotation, .44, .58, aspect, -.3)
  }
  if (request.stage === 6) {
    const rotation = new THREE.Quaternion().setFromEuler(new THREE.Euler(-Math.PI / 2, 0, .12))
    const center = v(8.20, 2.40, .90).add(v(0, 0, .002).applyQuaternion(rotation))
    return facePose(center, rotation, .70, .52, aspect, -.12)
  }
  if (request.stage === 7) {
    // Follow the bungalow's measured wall normal, keeping the entire board
    // outside the angled wall and above the fern beneath it.
    const rotation = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, -2, 0))
    const center = v(-7.30, 3.96, -2.22).add(v(0, 0, .004).applyQuaternion(rotation))
    return facePose(center, rotation, .90, .72, aspect)
  }
  const rotation = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, .35, 0))
  const center = v(7.27708, 2.96, 1.33696).add(v(0, 0, .16).applyQuaternion(rotation))
  return facePose(center, rotation, .50, .58, aspect, .42)
}
