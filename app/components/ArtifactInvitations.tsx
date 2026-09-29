'use client'

import { createContext, useContext, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { Html, useCursor } from '@react-three/drei'
import { useFrame, useThree, type ThreeEvent } from '@react-three/fiber'
import * as THREE from 'three'
import { createCameraGuard, type CameraGuard } from './camera-path'
import { createArtifactBeacon, makeBeaconTexture } from './artifact-beacon'

const Invitations = createContext<{ mobile: boolean; reduced: boolean; enabled: boolean; texture: THREE.Texture | null; guard: CameraGuard | null }>({ mobile: false, reduced: false, enabled: false, texture: null, guard: null })

export function ArtifactInvitations({ children, model, mobile, reduced, enabled }: {
  children: ReactNode; model: THREE.Group | null; mobile: boolean; reduced: boolean; enabled: boolean
}) {
  const texture = useMemo(makeBeaconTexture, [])
  const guard = useMemo(() => model ? createCameraGuard(model) : null, [model])
  useEffect(() => () => texture.dispose(), [texture])
  const value = useMemo(() => ({ texture, guard, mobile, reduced, enabled }), [texture, guard, mobile, reduced, enabled])
  return <Invitations.Provider value={value}>{children}</Invitations.Provider>
}

export function ArtifactInvitation({ position, children, onSelect, active, secondary = false }: {
  position: [number, number, number]; children: ReactNode; onSelect: () => void; active: boolean; secondary?: boolean
}) {
  const { texture, guard, mobile, reduced, enabled } = useContext(Invitations)
  const available = active && enabled
  const anchor = useRef<THREE.Group>(null), sprite = useRef<THREE.Sprite>(null), button = useRef<HTMLButtonElement>(null)
  const world = useMemo(() => new THREE.Vector3(), [])
  const beacon = useMemo(createArtifactBeacon, [])
  const { invalidate, gl } = useThree()
  const [hovered, setHovered] = useState(false)
  const hover = hovered && available && !mobile
  useCursor(hover, 'pointer', '', gl.domElement)
  useLayoutEffect(() => {
    // Leave zero-opacity sprites mounted for shader/texture warmup. Hide DOM
    // labels immediately when reading begins, before the canvas pauses.
    if (!available) {
      beacon.reset()
      if (sprite.current) (sprite.current.material as THREE.SpriteMaterial).opacity = 0
      if (button.current) button.current.style.visibility = 'hidden'
      setHovered(false)
    }
    invalidate()
  }, [available, beacon, invalidate])
  useEffect(() => { invalidate() }, [reduced, hover, invalidate])
  useFrame(({ camera, size }, delta) => {
    if (!anchor.current || !sprite.current) return
    if (!available) { sprite.current.visible = false; return }
    anchor.current.getWorldPosition(world)
    const state = beacon.update(camera, world, size.width, size.height, available, reduced, delta, guard, mobile)
    sprite.current.visible = state.visible
    sprite.current.scale.setScalar(state.scale)
    ;(sprite.current.material as THREE.SpriteMaterial).opacity = hover ? 1 : state.opacity
    if (button.current) button.current.style.visibility = state.labelVisible ? 'visible' : 'hidden'
    // No invalidation loop: Motion already renders; Still remains one frame.
  })
  const select = (event: ThreeEvent<MouseEvent>) => {
    if (!available || !beacon.state.visible || event.delta > 5) return
    event.stopPropagation(); setHovered(false); onSelect()
  }
  return <group ref={anchor} position={position}>
    <sprite ref={sprite} name="Artifact invitation" onClick={select}
      onPointerOver={event => { if (available && event.pointerType === 'mouse' && !event.buttons && !mobile) { event.stopPropagation(); setHovered(true) } }}
      onPointerOut={() => setHovered(false)} onPointerDown={() => setHovered(false)}
      raycast={function (this: THREE.Sprite, raycaster, intersections) { if (available && beacon.state.visible) THREE.Sprite.prototype.raycast.call(this, raycaster, intersections) }}>
      <spriteMaterial map={texture} transparent opacity={0} depthTest depthWrite={false} toneMapped={false} />
    </sprite>
    {!mobile && <Html center zIndexRange={[18, 10]} style={{ pointerEvents: 'none' }}>
      <button ref={button} type="button" disabled={!available} style={{ visibility: 'hidden' }}
        className={`artifact-marker artifact-invitation${secondary ? ' artifact-marker--secondary' : ''}${reduced ? ' is-still' : ''}`}
        onPointerDown={event => event.stopPropagation()}
        onPointerEnter={() => setHovered(true)} onPointerLeave={() => setHovered(false)}
        onFocus={() => setHovered(true)} onBlur={() => setHovered(false)}
        onClick={event => { if (!available) return; event.stopPropagation(); setHovered(false); onSelect() }}>
        {children}<span aria-hidden="true">↗</span>
      </button>
    </Html>}
  </group>
}
