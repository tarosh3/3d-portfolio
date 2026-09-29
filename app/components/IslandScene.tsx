'use client'

import { Component, lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { CSSProperties, ReactNode } from 'react'
import { Canvas, events, useFrame, useThree } from '@react-three/fiber'
import { useProgress } from '@react-three/drei'
import * as THREE from 'three'
import WorldArtifacts from './WorldArtifacts'
import FieldGuide from './FieldGuide'
import ArtifactReader from './ArtifactReader'
import LivingIsland from './LivingIsland'
import IslandControls from './IslandControls'
import IslandAtlas from './IslandAtlas'
import ArrivalClouds from './ArrivalClouds'
import IslandLighting, { PhoneShadowBudget } from './IslandLighting'
import IslandWater from './IslandWater'
import IslandSky from './IslandSky'
import IslandDayCycle from './IslandDayCycle'
import SceneReadiness from './SceneReadiness'
import { createDayCycle, type DayCycle } from './day-cycle'
import { ARRIVAL_SESSION_KEY, STILL_SESSION_KEY, sessionFlag, setSessionFlag, shouldPlayArrival, type ArrivalPhase } from './island-arrival'
import { areaById, TOUR, type AreaId, type ReadRequest } from './island-data'
import { createSectionScroll } from './section-scroll'
import { artifactLabel, type ArtifactFocus } from './artifact-camera'
import type { IslandLoadProgress } from './loading-progress'

const IslandPostprocessing = lazy(() => import('./IslandPostprocessing'))
// r184 folds PCFSoft into PCF; use its supported name to avoid a warning and
// renderer property reset on every frame. Filtering is identical in r184.
const SOFT_SHADOWS = { type: THREE.PCFShadowMap }
// Keep this layout query aligned with exploration.css, including phone landscape.
const COMPACT_LAYOUT_QUERY = '(max-width: 760px), (max-width: 1024px) and (max-height: 500px)'
const MOBILE_GRAPHICS_QUERY = `${COMPACT_LAYOUT_QUERY}, (hover: none) and (pointer: coarse)`

type IslandSceneProps = {
  visible: boolean
  sceneRevealed?: boolean
  suspended?: boolean
  onReady?: () => void
  onLoadProgress?: (progress: IslandLoadProgress) => void
  onLoadError?: (message: string) => void
}

function useReducedMotion() {
  const [reduced, setReduced] = useState(() => typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches)
  useEffect(() => {
    const query = window.matchMedia('(prefers-reduced-motion: reduce)')
    const update = () => setReduced(query.matches)
    update(); query.addEventListener('change', update)
    return () => query.removeEventListener('change', update)
  }, [])
  return reduced
}
class SceneBoundary extends Component<{ children: ReactNode; onRead: () => void; onError?: (message: string) => void }, { failed: boolean }> {
  state = { failed: false }
  static getDerivedStateFromError() { return { failed: true } }
  componentDidCatch() { this.props.onError?.('The island couldn’t load on this device. You can retry or read the portfolio.') }
  render() {
    if (this.state.failed) return <div className="scene-fallback"><p>The island couldn’t load on this device.</p><button onClick={this.props.onRead}>Read the portfolio</button><button onClick={() => window.location.reload()}>Try again</button></div>
    return this.props.children
  }
}
// R3F mounts this as <canvas> fallback content on every device, so it must not
// report an error itself. Real WebGL failures throw into SceneBoundary.
function RendererFallback() {
  return <div className="scene-fallback"><p>Explore the text edition of this island.</p><a href="/read">Read the portfolio</a></div>
}
const SOUND_OFF_SESSION_KEY = 'island-sound-off'
// Browsers block audible autoplay, so sound is on by default and starts with the
// visitor's first interaction. The audio file is only requested at that point.
// pointerup, touchend and keyup are not consumed by the arrival skip handler.
const SOUND_START_INPUTS = ['pointerup', 'touchend', 'keyup', 'click', 'keydown'] as const
function SoundControl() {
  const sound = useRef<HTMLAudioElement | null>(null)
  const [enabled, setEnabled] = useState(() => !sessionFlag(SOUND_OFF_SESSION_KEY))
  const wanted = useRef(enabled)
  const [playing, setPlaying] = useState(false)
  const [error, setError] = useState(false)
  const load = () => {
    if (!sound.current) {
      sound.current = new Audio('/sounds/beach-ambience.mp3')
      sound.current.loop = true; sound.current.volume = .22
    }
    return sound.current
  }
  useEffect(() => () => { sound.current?.pause() }, [])
  useEffect(() => { setSessionFlag(SOUND_OFF_SESSION_KEY, !enabled) }, [enabled])
  useEffect(() => {
    if (!enabled || playing) return
    const start = (event: Event) => {
      // The toggle handles its own clicks; starting here would turn sound on then off.
      if (event.target instanceof Element && event.target.closest('[data-sound-toggle]')) return
      load().play().then(() => {
        if (wanted.current) { setPlaying(true); setError(false) } else sound.current?.pause()
      }, () => { /* Not a qualifying gesture yet; wait for the next one. */ })
    }
    SOUND_START_INPUTS.forEach(type => window.addEventListener(type, start, { capture: true, passive: true }))
    return () => SOUND_START_INPUTS.forEach(type => window.removeEventListener(type, start, true))
  }, [enabled, playing])
  const toggle = async () => {
    if (enabled) {
      wanted.current = false
      sound.current?.pause(); setPlaying(false); setEnabled(false); setError(false)
      return
    }
    wanted.current = true
    setEnabled(true)
    try {
      await load().play()
      if (wanted.current) { setPlaying(true); setError(false) }
    } catch { setError(true) }
  }
  return <button className="explore-tool" data-sound-toggle onClick={toggle} aria-label={enabled ? 'Turn island sounds off' : 'Turn island sounds on'} aria-pressed={enabled}>
    <span className={`sound-bars ${playing ? 'is-playing' : ''}`} aria-hidden="true"><i /><i /><i /><i /></span>
    <span>{error ? 'Unavailable' : enabled ? 'Sound on' : 'Sound off'}</span>
  </button>
}

function DaylightAtmosphere({ cycle, reduced, paused }: { cycle: DayCycle; reduced: boolean; paused: boolean }) {
  const { camera } = useThree()
  const atmosphere = useRef<THREE.Group>(null)
  const halo = useRef<THREE.Sprite>(null)
  const sunTexture = useMemo(() => {
    const canvas = document.createElement('canvas')
    canvas.width = 128
    canvas.height = 128
    const context = canvas.getContext('2d')!
    const glow = context.createRadialGradient(64, 64, 3, 64, 64, 64)
    glow.addColorStop(0, 'rgba(255, 248, 216, .72)')
    glow.addColorStop(.16, 'rgba(255, 228, 164, .35)')
    glow.addColorStop(.42, 'rgba(255, 222, 161, .1)')
    glow.addColorStop(1, 'rgba(255, 222, 161, 0)')
    context.fillStyle = glow
    context.fillRect(0, 0, 128, 128)
    const result = new THREE.CanvasTexture(canvas)
    result.colorSpace = THREE.SRGBColorSpace
    return result
  }, [])

  useEffect(() => () => sunTexture.dispose(), [sunTexture])
  useFrame((_, delta) => {
    if (!atmosphere.current || !halo.current) return
    atmosphere.current.position.copy(camera.position)
    atmosphere.current.quaternion.copy(camera.quaternion)
    atmosphere.current.translateX(10)
    atmosphere.current.translateY(8)
    atmosphere.current.translateZ(-44)
    halo.current.material.opacity = .54 * (1 - cycle.value)
    if (paused || reduced) return
    halo.current.material.rotation += Math.min(delta, .05) * .018
  })

  return <group ref={atmosphere}>
    <sprite ref={halo} scale={[18, 18, 1]} renderOrder={-11}>
      <spriteMaterial map={sunTexture} transparent opacity={.54} depthWrite={false} toneMapped={false} blending={THREE.AdditiveBlending} />
    </sprite>
  </group>
}
const QUICK_LINKS: { label: string; area: AreaId }[] = [{ label: 'About', area: 'veranda' }, { label: 'Work', area: 'cabin' }, { label: 'Engineering', area: 'deck' }, { label: 'Journey', area: 'hammock' }, { label: 'Contact', area: 'pier' }]
const SECTIONS: AreaId[] = ['overview', ...TOUR]

// Touch has no hover. Avoid raycasting all 264 model meshes on every drag;
// taps still use R3F's normal hit testing and native OrbitControls sees moves.
const islandEvents: typeof events = store => {
  const manager = events(store)
  const move = manager.handlers?.onPointerMove
  if (manager.handlers) manager.handlers.onPointerMove = event => {
    const pointer = event as PointerEvent
    if (pointer.pointerType === 'touch' || pointer.buttons) return
    move?.(event)
  }
  return manager
}

export default function IslandScene({ visible, sceneRevealed = visible, suspended = false, onReady, onLoadProgress, onLoadError }: IslandSceneProps) {
  const { progress, active, errors, total, loaded } = useProgress()
  const [renderReady, setRenderReady] = useState(false)
  const [gpuPrepared, setGpuPrepared] = useState(false)
  const shadersPrepared = useCallback(() => setGpuPrepared(true), [])
  const [pipelineReady, setPipelineReady] = useState(false)
  const [pipelineTarget, setPipelineTarget] = useState<THREE.WebGLRenderTarget | null>(null)
  const pipelinePrepared = useCallback((target: THREE.WebGLRenderTarget) => { setPipelineTarget(target); setPipelineReady(true) }, [])
  const scenePrepared = useCallback(() => { setRenderReady(true); onReady?.() }, [onReady])
  useEffect(() => { onLoadProgress?.({ progress, active, errors, total, loaded }) }, [progress, active, errors, total, loaded, onLoadProgress])
  const [request, setRequest] = useState<{ area: AreaId; serial: number }>({ area: 'overview', serial: 0 })
  const [moving, setMoving] = useState(false)
  const [cut, setCut] = useState(false)
  const [guideOpen, setGuideOpen] = useState(false)
  const [focus, setFocus] = useState<ArtifactFocus | null>(null)
  const focusState = useRef<ArtifactFocus | null>(null)
  const focusSerial = useRef(0)
  const opener = useRef<HTMLElement | null>(null)
  const cancelButton = useRef<HTMLButtonElement>(null)
  const interfaceLayer = useRef<HTMLDivElement>(null)
  const sceneLayer = useRef<HTMLDivElement>(null)
  const updateFocus = useCallback((value: ArtifactFocus | null) => { focusState.current = value; setFocus(value) }, [])
  const [model, setModel] = useState<THREE.Group | null>(null)
  const [pageActive, setPageActive] = useState(true)
  const [dusk, setDusk] = useState(false)
  const cycle = useMemo(createDayCycle, [])
  const [mobile, setMobile] = useState(() => typeof window !== 'undefined' && window.matchMedia(MOBILE_GRAPHICS_QUERY).matches)
  const [phoneShadowsOff, setPhoneShadowsOff] = useState(false)
  const disablePhoneShadows = useCallback(() => setPhoneShadowsOff(true), [])
  const shadowsEnabled = !mobile || !phoneShadowsOff
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [zoom, setZoom] = useState({ direction: 0, serial: 0 })
  const shell = useRef<HTMLDivElement>(null)
  const sectionScroll = useRef(createSectionScroll())
  const [explored, setExplored] = useState(false)
  const [mapOpen, setMapOpen] = useState(false)
  const [discoveries, setDiscoveries] = useState<string[]>([])
  const [discoveryHelp, setDiscoveryHelp] = useState(false)
  const systemReduced = useReducedMotion()
  const [still, setStill] = useState(() => sessionFlag(STILL_SESSION_KEY))
  const reduced = systemReduced || still
  const [arrival, setArrival] = useState<ArrivalPhase>(() => shouldPlayArrival(systemReduced, still, sessionFlag(ARRIVAL_SESSION_KEY)) ? 'pending' : 'done')
  const finishArrival = useCallback(() => setArrival('done'), [])
  const startArrival = useCallback(() => setArrival(value => value === 'pending' ? 'playing' : value), [])
  const hasReading = focus?.phase === 'reading' || focus?.phase === 'closing'
  const paused = guideOpen || hasReading || suspended || !pageActive
  const area = areaById(request.area)
  const sectionIndex = SECTIONS.indexOf(request.area)
  const scrollState = useRef({ visible, paused, area: request.area })
  scrollState.current = { visible, paused: paused || Boolean(focus) || arrival !== 'done', area: request.area }
  useEffect(() => {
    if (!visible) return
    // Consume the first reveal even when skipped, reduced, or opened as text.
    setSessionFlag(ARRIVAL_SESSION_KEY)
    if (reduced || suspended) finishArrival()
  }, [visible, reduced, suspended, finishArrival])
  useEffect(() => { setSessionFlag(STILL_SESSION_KEY, still) }, [still])
  useEffect(() => {
    if (!visible || arrival === 'done') return
    const skip = (event: Event) => {
      if (event instanceof PointerEvent && event.type === 'pointermove' && !event.movementX && !event.movementY) return
      if (event instanceof WheelEvent) sectionScroll.current.push({ deltaX: event.deltaX, deltaY: event.deltaY, deltaMode: event.deltaMode, time: performance.now(), blocked: true })
      finishArrival()
      // The gesture skips the arrival rather than also scrolling to an area
      // or starting an orbit while the camera is still above the clouds.
      if (event.cancelable) event.preventDefault()
      event.stopImmediatePropagation()
    }
    const inputs = ['pointerdown', 'pointermove', 'touchstart', 'click', 'wheel', 'keydown'] as const
    inputs.forEach(type => window.addEventListener(type, skip, { capture: true, passive: false }))
    return () => inputs.forEach(type => window.removeEventListener(type, skip, true))
  }, [arrival, visible, finishArrival])
  const navigate = useCallback((id: AreaId) => {
    if (focusState.current) return
    setSettingsOpen(false)
    setExplored(id !== 'overview'); setRequest(previous => ({ area: id, serial: previous.serial + 1 }))
    if (window.matchMedia(COMPACT_LAYOUT_QUERY).matches) setMapOpen(false)
  }, [])
  useEffect(() => {
    if (!settingsOpen) return
    const close = (event: KeyboardEvent) => { if (event.key === 'Escape') setSettingsOpen(false) }
    document.addEventListener('keydown', close)
    return () => document.removeEventListener('keydown', close)
  }, [settingsOpen])
  const handleMoving = useCallback((value: boolean, fading = false) => { setMoving(value); setCut(value && fading) }, [])
  const handleInteract = useCallback(() => { setExplored(true) }, [])
  const handleOverview = useCallback(() => navigate('overview'), [navigate])
  const ready = useCallback((value: THREE.Group) => setModel(value), [])
  const discover = useCallback((id: string) => setDiscoveries(found => found.includes(id) ? found : [...found, id]), [])
  const openGuide = useCallback(() => { if (!focusState.current) setGuideOpen(true) }, [])
  const read = useCallback((value: ReadRequest) => {
    if (focusState.current || !visible || moving || paused) return
    opener.current = document.activeElement instanceof HTMLElement ? document.activeElement : null
    updateFocus({ serial: ++focusSerial.current, request: value, phase: 'approach' })
  }, [moving, paused, updateFocus, visible])
  const focusArrived = useCallback(() => {
    const current = focusState.current
    if (current?.phase === 'approach') updateFocus({ ...current, phase: 'reading' })
  }, [updateFocus])
  const focusReturned = useCallback(() => updateFocus(null), [updateFocus])
  const closeReader = useCallback(() => {
    const current = focusState.current
    if (current?.phase === 'reading') updateFocus({ ...current, phase: 'closing' })
    else if (current?.phase === 'approach') updateFocus({ ...current, phase: 'return' })
  }, [updateFocus])
  const readerExited = useCallback(() => {
    const current = focusState.current
    if (current?.phase === 'closing') updateFocus({ ...current, phase: 'return' })
  }, [updateFocus])
  useEffect(() => {
    const active = Boolean(focus)
    if (interfaceLayer.current) interfaceLayer.current.inert = active
    if (sceneLayer.current) sceneLayer.current.inert = active
    if (focus?.phase === 'approach') cancelButton.current?.focus({ preventScroll: true })
    if (!focus && opener.current) {
      const target = opener.current
      opener.current = null
      const frame = requestAnimationFrame(() => {
        if (target.isConnected) target.focus({ preventScroll: true })
        if (document.activeElement !== target) shell.current?.querySelector<HTMLElement>('.area-read, canvas')?.focus({ preventScroll: true })
      })
      return () => cancelAnimationFrame(frame)
    }
  }, [focus])
  useEffect(() => {
    const cancelApproach = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && focusState.current?.phase === 'approach') {
        event.preventDefault(); event.stopPropagation(); closeReader()
      }
    }
    document.addEventListener('keydown', cancelApproach, true)
    return () => document.removeEventListener('keydown', cancelApproach, true)
  }, [closeReader])
  const step = useCallback((direction: number) => {
    const index = SECTIONS.indexOf(scrollState.current.area)
    // The island is a loop: the overview follows the pier and the pier
    // follows the overview. Keep the same guarded camera flight in both
    // directions so the loop feels like one continuous walk around the shore.
    const next = SECTIONS[(index + direction + SECTIONS.length) % SECTIONS.length]
    navigate(next)
  }, [navigate])
  const changeZoom = (direction: number) => setZoom(previous => ({ direction, serial: previous.serial + 1 }))
  useEffect(() => {
    const element = shell.current
    if (!element) return
    const wheel = (event: WheelEvent) => {
      if (event.target instanceof Element && event.target.closest('#island-atlas-body')) return
      if (event.ctrlKey || event.metaKey || event.altKey || Math.abs(event.deltaX) > Math.abs(event.deltaY)) return
      const state = scrollState.current
      if (!state.visible || state.paused) {
        sectionScroll.current.push({ deltaX: event.deltaX, deltaY: event.deltaY, deltaMode: event.deltaMode, time: performance.now(), blocked: true })
        return
      }
      event.preventDefault(); event.stopPropagation()
      const direction = sectionScroll.current.push({ deltaX: event.deltaX, deltaY: event.deltaY, deltaMode: event.deltaMode, time: performance.now() })
      if (direction) step(direction)
    }
    element.addEventListener('wheel', wheel, { passive: false, capture: true })
    return () => element.removeEventListener('wheel', wheel, true)
  }, [step])
  useEffect(() => {
    setMapOpen(window.innerWidth >= 1100)
    const mobileQuery = window.matchMedia(MOBILE_GRAPHICS_QUERY)
    const updateMobile = () => setMobile(mobileQuery.matches)
    updateMobile()
    const update = () => setPageActive(!document.hidden)
    mobileQuery.addEventListener('change', updateMobile)
    document.addEventListener('visibilitychange', update)
    return () => {
      mobileQuery.removeEventListener('change', updateMobile)
      document.removeEventListener('visibilitychange', update)
    }
  }, [])

  return <div ref={shell} data-arrival={arrival} data-scene-ready={renderReady} data-reading-phase={focus?.phase || 'idle'} data-shadows={shadowsEnabled ? mobile ? '1024' : '2048' : 'off'} data-postprocessing={!mobile && model && !paused ? 'on' : 'off'} className={`exploration-shell ${dusk ? 'is-dusk' : ''} ${focus ? 'is-focusing-artifact' : ''}`}>
    <div ref={sceneLayer} className={`island-scene ${sceneRevealed ? 'island-scene--ready' : ''} ${cut ? 'is-changing-view' : ''}`}>
      <SceneBoundary onRead={openGuide} onError={onLoadError}>
        <Canvas shadows={shadowsEnabled ? SOFT_SHADOWS : false} events={islandEvents} dpr={mobile ? 1 : [1, 1.5]} frameloop={paused || !gpuPrepared ? 'never' : !visible || reduced ? 'demand' : 'always'} camera={{ fov: 45, near: .1, far: 260, position: [25, 17, 23] }} gl={{ antialias: true, alpha: false, powerPreference: 'high-performance', toneMapping: THREE.ACESFilmicToneMapping, toneMappingExposure: 1, outputColorSpace: THREE.SRGBColorSpace }} fallback={<RendererFallback />}>
          <IslandDayCycle cycle={cycle} dusk={dusk} reduced={reduced} paused={paused || Boolean(focus)} />
          <IslandSky cycle={cycle} reduced={reduced} paused={paused || Boolean(focus)} />
          <IslandLighting model={model} mobile={mobile} cycle={cycle} shadows={shadowsEnabled} />
          {model && <IslandWater model={model} cycle={cycle} reduced={reduced} paused={paused || Boolean(focus)} mobile={mobile} />}
          {arrival !== 'done' && <ArrivalClouds />}
          <Suspense fallback={null}>
            <DaylightAtmosphere cycle={cycle} reduced={reduced} paused={paused || Boolean(focus)} />
            <LivingIsland reduced={reduced} paused={paused || Boolean(focus)} cycle={cycle} mobile={mobile} onDiscover={discover} onReady={ready} />
            <WorldArtifacts model={model} cuesEnabled={visible && !paused && !focus && arrival === 'done'} mobile={mobile} activeArea={request.area} onRead={read} onNavigate={navigate} reduced={reduced || Boolean(focus)} enabled={visible && !moving} />
          </Suspense>
          <PhoneShadowBudget active={mobile && shadowsEnabled && visible && !paused && !reduced && Boolean(model) && arrival === 'done'} onSlow={disablePhoneShadows} />
          {!mobile && model && <Suspense fallback={null}><IslandPostprocessing enabled={!paused} preparing={!renderReady} overview={request.area === 'overview' && !moving && !focus && arrival === 'done'} cycle={cycle} reduced={reduced} onReady={pipelinePrepared} /></Suspense>}
          <IslandControls arrival={arrival} onArrivalStart={startArrival} onArrivalEnd={finishArrival} request={request} zoom={zoom} focus={focus} model={model} reduced={reduced} enabled={visible && !paused} onMoving={handleMoving} onInteract={handleInteract} onOverview={handleOverview} onSectionStep={step} onFocusArrive={focusArrived} onFocusReturn={focusReturned} />
          <SceneReadiness available={Boolean(model) && (mobile || pipelineReady) && !active && !paused} renderTarget={mobile ? null : pipelineTarget} onCompiled={shadersPrepared} onReady={scenePrepared} onError={onLoadError} />
        </Canvas>
      </SceneBoundary>
    </div>
    {visible && <div ref={interfaceLayer} className="explore-interface" aria-hidden={focus ? true : undefined}>
      <div className="explore-vignette" aria-hidden="true" />
      <header className="explore-header">
        {(request.area !== 'overview' || explored) && <h1 className="sr-only">Tarosh Mathuria — island portfolio</h1>}
        <button className="explore-brand" onClick={handleOverview} aria-label="Tarosh Mathuria — whole island"><svg className="brand-star" width="30" height="30" viewBox="0 0 30 30" fill="none" aria-hidden="true"><path d="M15 2v26M2 15h26M6 6l18 18M6 24 24 6" stroke="currentColor" strokeWidth="1.3" /></svg><span>TM<span>A PERSONAL ISLAND</span></span></button>
        <nav className="explore-nav" aria-label="Portfolio places">{QUICK_LINKS.map(link => <button key={link.area} onClick={() => navigate(link.area)} aria-current={request.area === link.area ? 'location' : undefined}>{link.label}</button>)}</nav>
        <div className="explore-header-actions"><button className="explore-guide" onClick={openGuide}><svg width="16" height="16" viewBox="0 0 20 20" fill="none" aria-hidden="true"><path d="M4 3h12v14H4zM7 3v14m3-10h3m-3 3h3" stroke="currentColor" /></svg><span>Field guide</span></button>
          <button className="island-settings-toggle" aria-label="Island settings" aria-expanded={settingsOpen} aria-controls="island-settings" onClick={() => { setSettingsOpen(value => !value); setMapOpen(false) }}><svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M4 7h16M4 17h16" stroke="currentColor" strokeWidth="1.5"/><circle cx="9" cy="7" r="3" fill="#234b43" stroke="currentColor"/><circle cx="16" cy="17" r="3" fill="#234b43" stroke="currentColor"/></svg></button></div>
      </header>
      {request.area === 'overview' && !explored && <section className="explore-welcome" aria-label="Welcome to Tarosh’s island">
        <p className="explore-eyebrow">BACKEND ENGINEER. CURIOUS BY NATURE.</p>
        <h1 aria-label="Tarosh Mathuria."><span className="welcome-word" aria-hidden="true">{Array.from('Tarosh').map((letter, index) => <span className="welcome-letter" key={index} style={{ '--letter-index': index } as CSSProperties}>{letter}</span>)}</span>{' '}<em aria-hidden="true">{Array.from('Mathuria.').map((letter, index) => <span className="welcome-letter" key={index} style={{ '--letter-index': index + 6 } as CSSProperties}>{letter}</span>)}</em></h1>
        <p>I build the systems behind everyday things.<br />This is my little corner of the internet.</p>
        <div><button onClick={() => navigate('veranda')}>Come ashore <span aria-hidden="true">↗</span></button><button onClick={() => navigate('cabin')}>Selected work <span aria-hidden="true">→</span></button></div>
      </section>}
      <section className={`area-caption ${request.area === 'overview' && !explored ? 'is-welcome' : ''} ${request.area === 'lagoon' || request.area === 'west' ? 'has-field-story' : ''} ${moving ? 'is-travelling' : ''}`} aria-label="Current island area" aria-live="polite">
        <p className="explore-eyebrow">{moving ? 'TAKING THE SCENIC ROUTE' : area.chapter}</p>
        <h2>{area.label}</h2><p><span className="area-summary">{area.description}</span>{area.compactDescription && <span className="area-compact-summary">{area.compactDescription}</span>}</p>
        {area.read && <button className="area-read" disabled={moving} onClick={() => read(area.read!)}>{area.readLabel || (request.area === 'pier' ? 'Open the postbox' : request.area === 'cabin' ? 'Explore the projects' : request.area === 'deck' ? 'Open the notebook' : request.area === 'hammock' ? 'Read the stories' : 'Open the magazine')} <span aria-hidden="true">↗</span></button>}
      </section>
      <IslandAtlas active={request.area} open={mapOpen} onToggle={() => { setMapOpen(value => !value); setSettingsOpen(false) }} onNavigate={navigate} />
      <div className="explore-zoom" role="group" aria-label="Island zoom">
        <button onClick={() => changeZoom(-1)} aria-label="Zoom out">−</button>
        <button onClick={() => changeZoom(1)} aria-label="Zoom in">+</button>
      </div>
      <div className="explore-discoveries">
        <button className="discovery-toggle" onClick={() => setDiscoveryHelp(value => !value)} aria-expanded={discoveryHelp} aria-controls="discovery-hint"><span aria-hidden="true">✧</span><span>Little discoveries</span><strong>{discoveries.length}/7</strong></button>
        <p id="discovery-hint" hidden={!discoveryHelp}>{discoveries.length === 7 ? 'You found all seven little Nessies. Thanks for taking the long way around.' : 'Seven little green Nessies are tucked around the island. Tap one when you spot it. There’s one near the veranda table.'}</p>
        <span className="sr-only" role="status">{discoveries.length ? `${discoveries.length} of 7 little Nessies discovered.` : ''}</span>
      </div>
      <footer className="explore-footer">
        <div id="island-settings" className={`explore-tools ${settingsOpen ? 'is-open' : ''}`}><SoundControl /><button className="explore-tool" aria-pressed={dusk} onClick={() => setDusk(value => !value)}><span aria-hidden="true">{dusk ? '☾' : '☀'}</span><span>{dusk ? 'Dusk' : 'Daylight'}</span></button><button className="explore-tool motion-tool" aria-label="Reduce motion" aria-pressed={reduced} disabled={systemReduced} onClick={() => setStill(value => !value)}><span aria-hidden="true">{reduced ? '−' : '≈'}</span><span>{reduced ? 'Still' : 'Motion'}</span></button></div>
        <div className="explore-tour">
          <button onClick={() => step(-1)} aria-label="Previous section">←</button>
          <span>{sectionIndex === 0 ? 'WELCOME' : `${sectionIndex} / ${TOUR.length}`}<span>{mobile ? 'Tap arrows to explore' : sectionIndex === 0 ? 'Scroll to explore' : 'Island wander'}</span></span>
          <button onClick={() => step(1)} aria-label="Next section">→</button>
        </div>
        <p className="explore-input-hint" id="island-controls-help"><span>Scroll to change sections · Drag to explore</span><span>{area.read || request.area === 'beach' ? 'Tap a glowing + to open' : 'Drag to look · Pinch to zoom'}</span><span className="sr-only">Use the arrows for sections and the plus and minus buttons or pinch to zoom. Focus the island and use Page Up and Page Down for sections, arrow keys to orbit, plus or minus to zoom, and Home for the whole island.</span></p>
      </footer>
      <div className="explore-area-hint" aria-hidden="true">{!moving && request.area !== 'overview' ? `${area.hint}${area.read ? ' Click a glowing + to open.' : ''}` : ''}</div>
    </div>}
    {visible && arrival !== 'done' && <button className="arrival-skip" onClick={finishArrival}>Arriving on the island <span aria-hidden="true">·</span> Skip intro</button>}
    {focus && !hasReading && <div className="artifact-focus-status">
      <button ref={cancelButton} onClick={closeReader} disabled={focus.phase === 'return'} aria-label="Cancel opening, back to island"><span aria-hidden="true">←</span> Back to island</button>
      <p role="status">{focus.phase === 'return' ? 'Returning to your view' : `Opening ${artifactLabel(focus.request)}`}</p>
    </div>}
    {guideOpen && <FieldGuide onClose={() => setGuideOpen(false)} />}
    {focus && hasReading && <ArtifactReader request={focus.request} animated={!reduced} closing={focus.phase === 'closing'} onClose={closeReader} onExited={readerExited} restoreFocus={false} />}
  </div>
}
