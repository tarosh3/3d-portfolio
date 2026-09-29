'use client'

import { createContext, useContext, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { useCursor } from '@react-three/drei'
import { useFrame, useThree, type ThreeEvent } from '@react-three/fiber'
import * as THREE from 'three'
import { makeArtifactPrint, type PrintKind } from './artifact-textures'
import type { AreaId, ReadRequest } from './island-data'
import { createArtifactHover, isDesktopHover } from './artifact-hover'
import { ArtifactInvitations, ArtifactInvitation as Marker } from './ArtifactInvitations'

type Vec3 = [number, number, number]
type Quat = [number, number, number, number]
type Props = {
  mobile?: boolean
  model: THREE.Group | null
  cuesEnabled: boolean
  activeArea: AreaId
  onRead: (request: ReadRequest) => void
  onNavigate: (area: AreaId) => void
  reduced: boolean
  enabled: boolean
}
const HoverContext = createContext({ capable: false, reduced: false, reset: 0 })

function usePrint(kind: PrintKind) {
  const texture = useMemo(() => makeArtifactPrint(kind), [kind])
  useEffect(() => () => texture.dispose(), [texture])
  return texture
}

function Selectable({ children, onSelect, enabled }: { children: ReactNode; onSelect: () => void; enabled: boolean }) {
  const [hovered, setHovered] = useState(false)
  const { capable, reduced, reset } = useContext(HoverContext)
  const { invalidate, gl } = useThree()
  const root = useRef<THREE.Group>(null)
  const effect = useRef<ReturnType<typeof createArtifactHover> | null>(null)
  const hoverTarget = useRef(false)
  const active = hovered && enabled && capable
  useCursor(active, 'pointer', '', gl.domElement)
  useLayoutEffect(() => {
    if (!capable || !root.current) return
    const highlight = createArtifactHover(root.current)
    effect.current = highlight
    return () => { highlight.dispose(); effect.current = null }
  }, [capable])
  useEffect(() => {
    hoverTarget.current = false; setHovered(false); effect.current?.reset(); invalidate()
  }, [capable, enabled, reset, invalidate])
  useEffect(() => { invalidate() }, [active, reduced, invalidate])
  useFrame((_, delta) => {
    if (effect.current?.update(hoverTarget.current && enabled && capable, delta, reduced)) invalidate()
  })
  const clear = () => { hoverTarget.current = false; setHovered(false); effect.current?.reset(); invalidate() }
  const over = (event: ThreeEvent<PointerEvent>) => {
    if (!enabled || !isDesktopHover(event.pointerType, event.buttons, capable)) return
    event.stopPropagation(); hoverTarget.current = true; setHovered(true); invalidate()
  }
  return <group ref={root}
    onPointerOver={over}
    onPointerMove={over}
    onPointerOut={() => { hoverTarget.current = false; setHovered(false); invalidate() }}
    onPointerDown={clear}
    onPointerCancel={clear}
    onClick={(event: ThreeEvent<MouseEvent>) => {
      if (!enabled || event.delta > 5) return
      event.stopPropagation()
      clear()
      onSelect()
    }}
  >{children}</group>
}

function Print({ kind, width, height, double = false }: { kind: PrintKind; width: number; height: number; double?: boolean }) {
  const map = usePrint(kind)
  return <>
    <mesh receiveShadow castShadow><boxGeometry args={[width, height, .004]} /><meshStandardMaterial color="#e1d6b7" roughness={.97} /></mesh>
    <mesh position={[0, 0, .0026]} receiveShadow>
      <planeGeometry args={[width, height]} /><meshStandardMaterial map={map} roughness={.96} side={double ? THREE.DoubleSide : THREE.FrontSide} />
    </mesh>
    {double && <mesh position={[0, 0, -.0026]} rotation={[0, Math.PI, 0]} receiveShadow>
      <planeGeometry args={[width, height]} /><meshStandardMaterial map={map} roughness={.96} />
    </mesh>}
  </>
}

function Pin({ position }: { position: Vec3 }) {
  return <mesh position={position} rotation={[Math.PI / 2, 0, 0]} castShadow>
    <cylinderGeometry args={[.008, .006, .012, 8]} /><meshStandardMaterial color="#b58a4d" roughness={.56} metalness={.45} />
  </mesh>
}

function Magazine({ onRead, activeArea, enabled }: Pick<Props, 'onRead' | 'activeArea' | 'enabled'>) {
  // Two measured page faces retain the existing magazine's crease and footprint.
  const pages: { position: Vec3; quaternion: Quat; height: number; kind: PrintKind }[] = [
    { position: [-.96042, 3.1005, .00344], quaternion: [-.66222, -.24951, -.25003, .66083], height: .194, kind: 'magazine' },
    { position: [-1.10219, 3.09895, .16443], quaternion: [-.65529, -.2521, -.24741, .6677], height: .178, kind: 'magazine-back' },
  ]
  return <>
    <Selectable enabled={enabled} onSelect={() => onRead({ stage: 1 })}>
      {pages.map(page => <group key={page.kind} position={page.position} quaternion={page.quaternion}>
        <Print kind={page.kind} width={.294} height={page.height} />
      </group>)}
    </Selectable>
    <Marker active={activeArea === 'veranda'} position={[-1.025, 3.145, .083]} onSelect={() => onRead({ stage: 1 })}>Open magazine</Marker>
  </>
}

function CabinPosters({ onRead, onNavigate, activeArea, enabled }: Pick<Props, 'onRead' | 'onNavigate' | 'activeArea' | 'enabled'>) {
  return <>
    <group position={[-4.34089, 3.75651, 4.86166]} quaternion={[-.00305, -.37208, -.03008, .92771]}>
      {(['fitnyx', 'segmentation'] as const).map((kind, i) => <group key={kind} position={[(i ? 1 : -1) * .56, .02, 0]} rotation={[0, 0, i ? .017 : -.021]}>
        <Selectable enabled={enabled} onSelect={() => onRead({ stage: 3, item: i })}>
          <Print kind={kind} width={.56} height={.765} />
          <Pin position={[-.23, .35, .008]} /><Pin position={[.23, .35, .008]} />
        </Selectable>
        <Marker active={activeArea === 'cabin'} position={[0, 0, .06]} onSelect={() => onRead({ stage: 3, item: i })}>{i ? 'Research' : 'FitNyx'}</Marker>
      </group>)}
    </group>
    <group position={[-4.18035, 3.11654, 8.16818]} quaternion={[-.11875, -.10219, -.03707, .98696]}>
      <Selectable enabled={enabled} onSelect={() => onNavigate('cabin')}>
        <Print kind="index" width={.519} height={.746} />
      </Selectable>
      <Marker active={activeArea === 'beach'} position={[0, .05, .055]} onSelect={() => onNavigate('cabin')}>Projects at the cabin</Marker>
    </group>
  </>
}

function Notebook({ onRead, activeArea, enabled }: Pick<Props, 'onRead' | 'activeArea' | 'enabled'>) {
  // A 35 × 19.5 cm tray fits the far half of the 45 cm table. The bottle occupies
  // its near half. This footprint is measured in the table's own surface basis.
  return <>
    <group position={[-1.29341, 3.09853, -6.72417]} quaternion={[-.65696, .26049, .25986, .65805]}>
      <mesh receiveShadow castShadow><boxGeometry args={[.35, .195, .018]} /><meshStandardMaterial color="#a8885e" roughness={.96} /></mesh>
      {[-1, 1].map(side => <mesh key={side} position={[side * .1725, 0, .012]} receiveShadow castShadow>
        <boxGeometry args={[.006, .195, .018]} /><meshStandardMaterial color="#b49b73" roughness={.96} />
      </mesh>)}
      <Selectable enabled={enabled} onSelect={() => onRead({ stage: 2, item: 0 })}>
        <mesh position={[0, 0, .014]} castShadow><boxGeometry args={[.324, .168, .008]} /><meshStandardMaterial color="#335b4d" roughness={.92} /></mesh>
        <group position={[-.0808, 0, .021]} rotation={[0, -.025, 0]}><Print kind="notebook" width={.157} height={.16} /></group>
        <group position={[.0808, 0, .021]} rotation={[0, .025, 0]}><Print kind="notebook-notes" width={.157} height={.16} /></group>
      </Selectable>
      {['#b88353', '#6f8e72', '#adb580', '#738e96'].map((color, i) => <Selectable key={color} enabled={enabled} onSelect={() => onRead({ stage: 2, item: i })}>
        <mesh position={[.164, .057 - i * .038, .020]} castShadow>
          <boxGeometry args={[.018, .027, .004]} /><meshStandardMaterial color={color} roughness={1} />
        </mesh>
      </Selectable>)}
      <mesh position={[-.159, 0, .025]} rotation={[0, 0, -.055]} castShadow>
        <boxGeometry args={[.006, .144, .006]} /><meshStandardMaterial color="#6c4e30" roughness={.9} />
      </mesh>
    </group>
    <Marker active={activeArea === 'deck'} position={[-1.293, 3.155, -6.724]} onSelect={() => onRead({ stage: 2, item: 0 })}>Open notebook</Marker>
  </>
}

function CareerCard({ position, kind, index, reduced, enabled, active, onRead }: {
  position: THREE.Vector3; kind: PrintKind; index: number; reduced: boolean; enabled: boolean; active: boolean; onRead: Props['onRead']
}) {
  const pivot = useRef<THREE.Group>(null)
  const time = useRef(0)
  useFrame((_, delta) => {
    if (!pivot.current) return
    if (reduced || !enabled || document.hidden) return
    time.current += Math.min(delta, .05)
    pivot.current.rotation.x = Math.sin(time.current * .65 + index * 1.7) * .022
  })
  return <group position={position} rotation={[0, 1.335, (index - 1) * .022]}>
    <group ref={pivot}>
      <Selectable enabled={enabled} onSelect={() => onRead({ stage: 4, item: index })}>
        <group position={[0, -.31, 0]}><Print kind={kind} width={.44} height={.58} double /></group>
        {[-.16, .16].map(x => <group key={x} position={[x, -.024, .014]}>
          <mesh castShadow><boxGeometry args={[.027, .085, .027]} /><meshStandardMaterial color="#ba966b" roughness={.9} /></mesh>
          <mesh position={[0, 0, .015]}><boxGeometry args={[.03, .008, .004]} /><meshStandardMaterial color="#827567" roughness={.5} metalness={.6} /></mesh>
        </group>)}
      </Selectable>
      <Marker active={active} position={[0, -.32, .10]} onSelect={() => onRead({ stage: 4, item: index })}>{['2018–22', '2022', '2022–now'][index]}</Marker>
    </group>
  </group>
}

function CareerLine({ onRead, activeArea, reduced, enabled }: Pick<Props, 'onRead' | 'activeArea' | 'reduced' | 'enabled'>) {
  const curve = useMemo(() => new THREE.CatmullRomCurve3([
    new THREE.Vector3(1.25336, 4.8, 7.37367), new THREE.Vector3(.8807, 4.65, 8.92868), new THREE.Vector3(.50803, 4.8, 10.48369),
  ]), [])
  return <>
    <mesh castShadow><tubeGeometry args={[curve, 32, .009, 6, false]} /><meshStandardMaterial color="#a58b60" roughness={1} /></mesh>
    {(['education', 'internship', 'career'] as const).map((kind, index) => <CareerCard
      key={kind} kind={kind} index={index} position={curve.getPoint(.8 - index * .3)}
      reduced={reduced} enabled={enabled} active={enabled && activeArea === 'hammock'} onRead={onRead}
    />)}
  </>
}

function DoorNote({ onRead, activeArea, enabled }: Pick<Props, 'onRead' | 'activeArea' | 'enabled'>) {
  return <group position={[-1.333, 4.109, -3.170]} quaternion={[.00015, .54031, -.00134, .84147]}>
    <Selectable enabled={enabled} onSelect={() => onRead({ stage: 4, item: 2, source: 'door' })}>
      <Print kind="door" width={.33} height={.44} />
      <Pin position={[0, .202, .008]} />
    </Selectable>
    <Marker active={activeArea === 'veranda'} position={[0, 0, .075]} secondary onSelect={() => onRead({ stage: 4, item: 2, source: 'door' })}>Current role</Marker>
  </group>
}

function Postbox({ onRead, activeArea, enabled }: Pick<Props, 'onRead' | 'activeArea' | 'enabled'>) {
  const mailMap = usePrint('mail')
  return <>
    {/* Fitted to the real outer pier post at [7.277, 2.642, 1.337]. */}
    <group position={[7.27708, 2.66, 1.33696]} rotation={[0, .35, 0]}>
      <Selectable enabled={enabled} onSelect={() => onRead({ stage: 5 })}>
        <mesh position={[0, .015, 0]} castShadow receiveShadow><boxGeometry args={[.27, .05, .27]} /><meshStandardMaterial color="#735d41" roughness={1} /></mesh>
        <mesh position={[0, .26, 0]} castShadow receiveShadow><boxGeometry args={[.38, .43, .3]} /><meshStandardMaterial color="#3d6a5c" roughness={.87} metalness={.08} /></mesh>
        <mesh position={[0, .245, .153]} receiveShadow><planeGeometry args={[.334, .398]} /><meshStandardMaterial map={mailMap} roughness={.88} /></mesh>
        {/* Two weathered roof plates, with enough overhang to cast a small shadow. */}
        {[-1, 1].map(side => <mesh key={side} position={[side * .106, .516, 0]} rotation={[0, 0, -side * .34]} castShadow receiveShadow>
          <boxGeometry args={[.23, .025, .36]} /><meshStandardMaterial color="#a87954" roughness={.9} />
        </mesh>)}
        <mesh position={[0, .427, .157]}><boxGeometry args={[.249, .017, .008]} /><meshStandardMaterial color="#162e27" roughness={1} /></mesh>
        <group position={[.006, .43, .185]} rotation={[-.19, 0, -.12]}>
          <mesh castShadow><boxGeometry args={[.18, .10, .008]} /><meshStandardMaterial color="#e8ddbc" roughness={1} /></mesh>
          <mesh position={[0, .008, .005]} rotation={[0, 0, Math.PI]}><coneGeometry args={[.064, .052, 3]} /><meshStandardMaterial color="#cbbd99" roughness={1} /></mesh>
        </group>
        <mesh position={[.226, .30, 0]} castShadow><boxGeometry args={[.02, .32, .027]} /><meshStandardMaterial color="#b36148" roughness={.88} /></mesh>
        <mesh position={[.266, .452, 0]} castShadow><boxGeometry args={[.09, .063, .016]} /><meshStandardMaterial color="#b36148" roughness={.88} /></mesh>
      </Selectable>
    </group>
    <Marker active={activeArea === 'pier'} position={[7.346, 2.95, 1.525]} onSelect={() => onRead({ stage: 5 })}>Send a note</Marker>
  </>
}

function LagoonLog({ onRead, activeArea, enabled }: Pick<Props, 'onRead' | 'activeArea' | 'enabled'>) {
  const texture = usePrint('lagoon-log')
  return <group position={[8.20, 2.40, .90]} rotation={[-Math.PI / 2, 0, .12]}>
    <Selectable enabled={enabled} onSelect={() => onRead({ stage: 6 })}>
      <mesh position={[0, 0, -.018]} castShadow receiveShadow>
        <boxGeometry args={[.76, .58, .032]} /><meshStandardMaterial color="#805f43" roughness={.98} />
      </mesh>
      <mesh position={[0, 0, .002]} receiveShadow>
        <planeGeometry args={[.70, .52]} /><meshStandardMaterial map={texture} roughness={.96} side={THREE.DoubleSide} />
      </mesh>
      {[-.28, .28].map(x => <mesh key={x} position={[x, .21, .024]}>
        <cylinderGeometry args={[.018, .018, .012, 8]} /><meshStandardMaterial color="#b28a57" roughness={.62} metalness={.3} />
      </mesh>)}
    </Selectable>
    <Marker active={activeArea === 'lagoon'} position={[0, 0, .06]} onSelect={() => onRead({ stage: 6 })}>Open tide log</Marker>
  </group>
}

function WestShoreBoard({ onRead, activeArea, enabled }: Pick<Props, 'onRead' | 'activeArea' | 'enabled'>) {
  const texture = usePrint('shoreboard')
  // Match the angled wall normal and clear the fern below the satellite dish.
  return <group position={[-7.30, 3.96, -2.22]} rotation={[0, -2, 0]}>
    <Selectable enabled={enabled} onSelect={() => onRead({ stage: 7 })}>
      <mesh position={[0, 0, -.018]} castShadow receiveShadow>
        <boxGeometry args={[.98, .80, .036]} /><meshStandardMaterial color="#765a43" roughness={.98} />
      </mesh>
      <mesh position={[0, 0, .004]} receiveShadow>
        <planeGeometry args={[.90, .72]} /><meshStandardMaterial map={texture} roughness={.96} side={THREE.DoubleSide} />
      </mesh>
      {[-.35, .35].map(x => <mesh key={x} position={[x, .31, .026]}>
        <cylinderGeometry args={[.018, .018, .012, 8]} /><meshStandardMaterial color="#b28a57" roughness={.62} metalness={.3} />
      </mesh>)}
    </Selectable>
    <Marker active={activeArea === 'west'} position={[0, 0, .06]} onSelect={() => onRead({ stage: 7 })}>Read field board</Marker>
  </group>
}


/** Invitations stay attached to the real objects throughout exploration. */
export default function WorldArtifacts(props: Props) {
  const [finePointer, setFinePointer] = useState(false)
  const [reset, setReset] = useState(0)
  useEffect(() => {
    const query = window.matchMedia('(hover: hover) and (pointer: fine)')
    const update = () => setFinePointer(query.matches)
    const clear = () => setReset(value => value + 1)
    const pointer = (event: PointerEvent) => { if (event.pointerType !== 'mouse') clear() }
    const hidden = () => { if (document.hidden) clear() }
    update(); query.addEventListener('change', update)
    window.addEventListener('pointerdown', pointer, true)
    window.addEventListener('blur', clear)
    document.addEventListener('visibilitychange', hidden)
    return () => {
      query.removeEventListener('change', update)
      window.removeEventListener('pointerdown', pointer, true)
      window.removeEventListener('blur', clear)
      document.removeEventListener('visibilitychange', hidden)
    }
  }, [])
  const hover = useMemo(() => ({ capable: finePointer && !props.mobile, reduced: props.reduced, reset }), [finePointer, props.mobile, props.reduced, reset])
  return <ArtifactInvitations model={props.model} mobile={Boolean(props.mobile)} reduced={props.reduced} enabled={props.enabled && props.cuesEnabled}><HoverContext.Provider value={hover}><group name="Portfolio artifacts">
    <Magazine {...props} />
    <CabinPosters {...props} />
    <Notebook {...props} />
    <CareerLine {...props} />
    <DoorNote {...props} />
    <Postbox {...props} />
    <LagoonLog {...props} />
    <WestShoreBoard {...props} />
  </group></HoverContext.Provider></ArtifactInvitations>
}
