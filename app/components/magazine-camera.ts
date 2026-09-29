import * as THREE from 'three'

// The real coffee-table magazine is two 29.4 cm wide faces, folded along a
// shallow crease. Its printed top points diagonally across the veranda.
const center = new THREE.Vector3(-1.02867, 3.102, .08093)
const printedUp = new THREE.Vector3(.660914, 0, -.750458).normalize()
const width = .294
const height = .4005

/** A close reading view of the measured magazine, with upright printed pages. */
export function magazinePose(aspect: number) {
  const fov = 36
  const lens = Math.tan(THREE.MathUtils.degToRad(fov / 2))
  // Portrait screens fit the whole width; wider screens keep enough table in
  // frame to make the hand-off from the physical magazine feel continuous.
  const distance = Math.max(height / (.62 * 2 * lens), width / (.82 * Math.max(.25, aspect) * 2 * lens))
  const target = center.clone()
  const position = target.clone().add(new THREE.Vector3(0, distance, 0)).addScaledVector(printedUp, -.1 * distance)
  return { position, target, up: printedUp.clone(), fov }
}

export type MagazinePose = ReturnType<typeof magazinePose>
