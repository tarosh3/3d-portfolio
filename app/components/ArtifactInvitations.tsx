'use client'

import { createContext, useContext, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { Html, useCursor } from '@react-three/drei'
import { useFrame, useThree, type ThreeEvent } from '@react-three/fiber'
import * as THREE from 'three'
import { createCameraGuard, type CameraGuard } from './camera-path'
import { createArtifactBeacon } from './artifact-beacon'

const Invitations = createContext<{ mobile: boolean; reduced: boolean; enabled: boolean; reset: number; capable: boolean; guard: CameraGuard | null }>({ mobile: false, reduced: false, enabled: false, reset: 0, capable: false, guard: null })

export function ArtifactInvitations({ children, model, mobile, reduced, enabled, reset, capable }: {
  children: ReactNode; model: THREE.Group | null; mobile: boolean; reduced: boolean; enabled: boolean; reset: number; capable: boolean
}) {
  const guard = useMemo(() => model ? createCameraGuard(model) : null, [model])
  const value = useMemo(() => ({ guard, mobile, reduced, enabled, reset, capable }), [guard, mobile, reduced, enabled, reset, capable])
  return <Invitations.Provider value={value}>{children}</Invitations.Provider>
}

const Interaction = createContext<{
  available: boolean; hovered: boolean
  setObjectHovered: (value: boolean) => void
  setMarkerHovered: (value: boolean) => void
  setFocused: (value: boolean) => void
}>({ available: false, hovered: false, setObjectHovered: () => {}, setMarkerHovered: () => {}, setFocused: () => {} })

/** One shared response for the real meshes, generous hit area and hover label. */
export function ArtifactInteraction({ active, children }: { active: boolean; children: ReactNode }) {
  const { enabled, reset, capable, mobile } = useContext(Invitations)
  const available = active && enabled
  const [objectHovered, setObjectHovered] = useState(false)
  const [markerHovered, setMarkerHovered] = useState(false)
  const [focused, setFocused] = useState(false)
  useLayoutEffect(() => {
    setObjectHovered(false); setMarkerHovered(false); setFocused(false)
  }, [available, reset, capable, mobile])
  const value = useMemo(() => ({ available, hovered: objectHovered || markerHovered || focused, setObjectHovered, setMarkerHovered, setFocused }), [available, objectHovered, markerHovered, focused])
  return <Interaction.Provider value={value}>{children}</Interaction.Provider>
}

export function useArtifactInteraction() { return useContext(Interaction) }

export function ArtifactInvitation({ position, children, onSelect, secondary = false }: {
  position: [number, number, number]; children: ReactNode; onSelect: () => void; secondary?: boolean
}) {
  const { guard, mobile, reduced } = useContext(Invitations)
  const { available, hovered, setMarkerHovered, setFocused } = useArtifactInteraction()
  const anchor = useRef<THREE.Group>(null), sprite = useRef<THREE.Sprite>(null), button = useRef<HTMLButtonElement>(null)
  const world = useMemo(() => new THREE.Vector3(), [])
  const beacon = useMemo(createArtifactBeacon, [])
  const { invalidate, gl } = useThree()
  const hover = hovered && available && !mobile
  useCursor(hover, 'pointer', '', gl.domElement)
  useLayoutEffect(() => {
    // Leave zero-opacity hit sprites mounted for shader warmup. Hide DOM
    // labels immediately when reading begins, before the canvas pauses.
    if (!available) {
      beacon.reset()
      if (button.current) button.current.style.visibility = 'hidden'
      setMarkerHovered(false)
    }
    invalidate()
  }, [available, beacon, invalidate, setMarkerHovered])
  useEffect(() => { invalidate() }, [reduced, hover, invalidate])
  useFrame(({ camera, size }, delta) => {
    if (!anchor.current || !sprite.current) return
    if (!available) { sprite.current.visible = false; return }
    anchor.current.getWorldPosition(world)
    const state = beacon.update(camera, world, size.width, size.height, available, reduced, delta, guard, mobile)
    sprite.current.visible = state.visible
    sprite.current.scale.setScalar(state.scale)
    if (button.current) button.current.style.visibility = state.labelVisible ? 'visible' : 'hidden'
    // No invalidation loop: Motion already renders; Still remains one frame.
  })
  const select = (event: ThreeEvent<MouseEvent>) => {
    if (!available || !beacon.state.visible || event.delta > 5) return
    event.stopPropagation(); setMarkerHovered(false); onSelect()
  }
  return <group ref={anchor} position={position}>
    <sprite ref={sprite} name="Artifact invitation" onClick={select}
      onPointerOver={event => { if (available && event.pointerType === 'mouse' && !event.buttons && !mobile) { event.stopPropagation(); setMarkerHovered(true) } }}
      onPointerOut={() => setMarkerHovered(false)} onPointerDown={() => setMarkerHovered(false)}
      raycast={function (this: THREE.Sprite, raycaster, intersections) { if (available && beacon.state.visible) THREE.Sprite.prototype.raycast.call(this, raycaster, intersections) }}>
      <spriteMaterial transparent opacity={0} depthTest depthWrite={false} colorWrite={false} />
    </sprite>
    {!mobile && <Html center zIndexRange={[18, 10]} style={{ pointerEvents: 'none' }}>
      <button ref={button} type="button" disabled={!available} style={{ visibility: 'hidden' }} data-revealed={hover || undefined}
        className={`artifact-marker artifact-invitation${secondary ? ' artifact-marker--secondary' : ''}${reduced ? ' is-still' : ''}`}
        onPointerDown={event => event.stopPropagation()}
        onPointerEnter={() => setMarkerHovered(true)} onPointerLeave={() => setMarkerHovered(false)}
        onFocus={() => setFocused(true)} onBlur={() => setFocused(false)}
        onClick={event => { if (!available) return; event.stopPropagation(); setMarkerHovered(false); onSelect() }}>
        {children}<span aria-hidden="true">↗</span>
      </button>
    </Html>}
  </group>
}
