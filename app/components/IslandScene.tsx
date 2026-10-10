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
import IslandWeatherDriver from './IslandWeatherDriver'
import IslandRain from './IslandRain'
import IslandSound from './IslandSound'
import WeatherControl from './WeatherControl'
import { createWeather, type IslandWeather, type WeatherKind } from './island-weather'
import CinematicTourControl from './CinematicTourControl'
import BrandLogo from './BrandLogo'
import IslandTutorial, { TUTORIAL_SESSION_KEY } from './IslandTutorial'
import TutorialTarget from './TutorialTarget'
import { advanceTutorial, type TutorialStep, type TutorialGesture } from './island-tutorial'
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
function DaylightAtmosphere({ cycle, weather, reduced, paused }: { cycle: DayCycle; weather: IslandWeather; reduced: boolean; paused: boolean }) {
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
    // Keep the solar glow aligned with the world's key light while orbiting.
    atmosphere.current.position.x += 55
    atmosphere.current.position.y += 90
    atmosphere.current.position.z += 85
    halo.current.material.opacity = .38 * (1 - cycle.value) * weather.sun * weather.sun
    if (paused || reduced) return
    halo.current.material.rotation += Math.min(delta, .05) * .018
  })

  return <group ref={atmosphere}>
    <sprite ref={halo} scale={[24, 24, 1]} renderOrder={-11}>
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
  const requestRef = useRef(request); requestRef.current = request
  const [settledSerial, setSettledSerial] = useState(-1)
  const [arrivedSerial, setArrivedSerial] = useState(-1)
  const [moving, setMoving] = useState(false)
  const [cut, setCut] = useState(false)
  const [guideOpen, setGuideOpen] = useState(false)
  const [tutorialOpen, setTutorialOpen] = useState(false)
  const tutorialActive = useRef(tutorialOpen); tutorialActive.current = tutorialOpen
  const [tutorialStep, setTutorialStep] = useState<TutorialStep>('travel')
  const tutorialTarget = useRef<HTMLDivElement>(null)
  const [tutorialBookVisible, setTutorialBookVisible] = useState(false)
  const tutorialHandled = useRef(sessionFlag(TUTORIAL_SESSION_KEY))
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
  const [cinematic, setCinematic] = useState<{ serial: number; seed: number } | null>(null)
  const cinematicSerial = useRef(0)
  const cinematicSeed = useRef(0)
  const [cinematicNotice, setCinematicNotice] = useState('')
  const stopCinematic = useCallback((unavailable = false) => {
    setCinematic(null)
    setCinematicNotice(unavailable ? 'A clear camera route isn’t available from here. Try the tour from Whole island.' : '')
  }, [])
  const [weatherKind, setWeatherKind] = useState<WeatherKind>('clear')
  const weather = useMemo(createWeather, [])
  const [weatherLowQuality, setWeatherLowQuality] = useState(false)
  const lowerWeatherQuality = useCallback(() => setWeatherLowQuality(true), [])
  const cinematicMinute = useCallback(() => {
    setDusk(value => !value)
    setWeatherKind(value => ({ clear: 'cloudy', cloudy: 'rain', rain: 'storm', storm: 'clear' } as const)[value])
  }, [])
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
  const scrollState = useRef({ visible, paused, area: request.area, cinematic: Boolean(cinematic) })
  scrollState.current = { visible, paused: paused || Boolean(focus) || arrival !== 'done', area: request.area, cinematic: Boolean(cinematic) }
  const closeTutorial = useCallback(() => {
    tutorialHandled.current = true
    setSessionFlag(TUTORIAL_SESSION_KEY)
    setTutorialOpen(false)
  }, [])
  const toggleCinematic = () => {
    if (cinematic) { stopCinematic(); return }
    if (reduced || paused || focus || arrival !== 'done') return
    if (tutorialOpen) closeTutorial()
    let seed = Math.floor(Math.random() * 0xffffffff)
    if (seed === cinematicSeed.current) seed = (seed + 1) >>> 0
    cinematicSeed.current = seed
    setCinematicNotice(''); setMapOpen(false); setSettingsOpen(false); setDiscoveryHelp(false); setExplored(true)
    setCinematic({ serial: ++cinematicSerial.current, seed })
  }
  useEffect(() => {
    if (!cinematic) return
    const stop = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      event.preventDefault(); stopCinematic()
    }
    document.addEventListener('keydown', stop)
    return () => document.removeEventListener('keydown', stop)
  }, [cinematic, stopCinematic])
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
    setCinematic(null); setCinematicNotice('')
    setSettingsOpen(false)
    setExplored(id !== 'overview'); setRequest(previous => ({ area: id, serial: previous.serial + 1 }))
    if (window.matchMedia(COMPACT_LAYOUT_QUERY).matches) setMapOpen(false)
  }, [])
  const openTutorial = useCallback(() => {
    if (!visible || focusState.current || arrival !== 'done') return
    tutorialHandled.current = true
    setCinematic(null); setSettingsOpen(false); setMapOpen(false); setDiscoveryHelp(false)
    setTutorialStep('travel'); setTutorialBookVisible(false); setTutorialOpen(true)
    if (request.area !== 'overview') navigate('overview')
  }, [visible, arrival, request.area, navigate])
  useEffect(() => {
    if (tutorialHandled.current || !visible || !renderReady || arrival !== 'done' || moving || paused || focus || cinematic) return
    const timer = setTimeout(() => { if (!tutorialHandled.current) openTutorial() }, 700)
    return () => clearTimeout(timer)
  }, [visible, renderReady, arrival, moving, paused, focus, cinematic, openTutorial])
  useEffect(() => {
    if (!tutorialOpen) return
    if (!moving && arrivedSerial === request.serial) setTutorialStep(value => advanceTutorial(value, { type: 'arrived', area: request.area }))
    if (focus?.phase === 'reading') setTutorialStep(value => advanceTutorial(value, { type: 'reading', stage: focus.request.stage }))
    if (!focus) setTutorialStep(value => advanceTutorial(value, { type: 'returned' }))
  }, [tutorialOpen, moving, arrivedSerial, request, focus])
  const tutorialGesture = useCallback((kind: TutorialGesture) => {
    if (tutorialActive.current) setTutorialStep(value => advanceTutorial(value, { type: 'gesture', kind }))
  }, [])
  const locateMagazine = useCallback(() => navigate('veranda'), [navigate])
  useEffect(() => {
    if (!settingsOpen) return
    const close = (event: KeyboardEvent) => { if (event.key === 'Escape') setSettingsOpen(false) }
    document.addEventListener('keydown', close)
    return () => document.removeEventListener('keydown', close)
  }, [settingsOpen])
  const handleMoving = useCallback((value: boolean, fading = false) => { setMoving(value); setCut(value && fading); if (!value) setSettledSerial(requestRef.current.serial) }, [])
  const handleInteract = useCallback(() => { setExplored(true) }, [])
  const handleOverview = useCallback(() => navigate('overview'), [navigate])
  const ready = useCallback((value: THREE.Group) => setModel(value), [])
  const discover = useCallback((id: string) => setDiscoveries(found => found.includes(id) ? found : [...found, id]), [])
  const openGuide = useCallback(() => { if (!focusState.current) { if (tutorialActive.current) closeTutorial(); setCinematic(null); setGuideOpen(true) } }, [closeTutorial])
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
      // The live lesson focuses its actual target (including a recovery action).
      if (tutorialActive.current) return
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
      if (state.cinematic) stopCinematic()
      const direction = sectionScroll.current.push({ deltaX: event.deltaX, deltaY: event.deltaY, deltaMode: event.deltaMode, time: performance.now() })
      if (direction) step(direction)
    }
    element.addEventListener('wheel', wheel, { passive: false, capture: true })
    return () => element.removeEventListener('wheel', wheel, true)
  }, [step, stopCinematic])
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

  const tutorialCoach = <IslandTutorial step={tutorialStep} mobile={mobile} reduced={reduced}
    busy={moving || settledSerial !== request.serial || Boolean(focus && focus.phase !== 'reading')}
    needsVeranda={request.area !== 'overview'} returnToLesson={Boolean(hasReading && tutorialStep !== 'return')}
    needsMagazine={request.area !== 'veranda' || !tutorialBookVisible} targetRef={tutorialTarget}
    onClose={closeTutorial} onLocateMagazine={locateMagazine} />

  return <div ref={shell} data-weather={weatherKind} data-weather-quality={mobile ? weatherLowQuality ? 'light' : 'mobile' : 'full'} data-arrival={arrival} data-scene-ready={renderReady} data-reading-phase={focus?.phase || 'idle'} data-shadows={shadowsEnabled ? mobile ? '1024' : '2048' : 'off'} data-postprocessing={!mobile && model && !paused ? 'on' : 'off'} className={`exploration-shell ${dusk ? 'is-dusk' : ''} ${focus ? 'is-focusing-artifact' : ''} ${cinematic ? 'is-cinematic' : ''}`}>
    <div ref={sceneLayer} className={`island-scene ${sceneRevealed ? 'island-scene--ready' : ''} ${cut ? 'is-changing-view' : ''}`}>
      <SceneBoundary onRead={openGuide} onError={onLoadError}>
        <Canvas shadows={shadowsEnabled ? SOFT_SHADOWS : false} events={islandEvents} dpr={mobile ? 1 : [1, 1.5]} frameloop={paused || !gpuPrepared ? 'never' : !visible || reduced ? 'demand' : 'always'} camera={{ fov: 45, near: .1, far: 260, position: [25, 17, 23] }} gl={{ antialias: true, alpha: false, powerPreference: 'high-performance', toneMapping: THREE.ACESFilmicToneMapping, toneMappingExposure: 1, outputColorSpace: THREE.SRGBColorSpace }} fallback={<RendererFallback />}>
          <IslandWeatherDriver weather={weather} kind={weatherKind} reduced={reduced} paused={!visible || paused || Boolean(focus)} mobile={mobile} budgetActive={visible && renderReady && arrival === 'done' && !moving && !focus} onSlow={lowerWeatherQuality} />
          <IslandDayCycle weather={weather} cycle={cycle} dusk={dusk} reduced={reduced} paused={paused || Boolean(focus)} />
          <IslandSky weather={weather} cycle={cycle} reduced={reduced} paused={paused || Boolean(focus)} mobile={mobile} />
          <IslandLighting weather={weather} model={model} mobile={mobile} cycle={cycle} shadows={shadowsEnabled} />
          {model && <IslandWater weather={weather} model={model} cycle={cycle} reduced={reduced} paused={paused || Boolean(focus)} mobile={mobile} />}
          {arrival !== 'done' && <ArrivalClouds />}
          <Suspense fallback={null}>
            <DaylightAtmosphere weather={weather} cycle={cycle} reduced={reduced} paused={paused || Boolean(focus)} />
            <LivingIsland weather={weather} reduced={reduced} paused={paused || Boolean(focus)} cycle={cycle} mobile={mobile} onDiscover={discover} onReady={ready} />
            <WorldArtifacts model={model} cuesEnabled={visible && !paused && !focus && !cinematic && arrival === 'done'} mobile={mobile} activeArea={request.area} onRead={read} onNavigate={navigate} reduced={reduced || Boolean(focus)} enabled={visible && !moving && !cinematic} />
          </Suspense>
          {model && <IslandRain model={model} weather={weather} cycle={cycle} mobile={mobile} reduced={reduced} paused={!visible || paused || Boolean(focus)} lowQuality={weatherLowQuality} preparing={!renderReady} />}
          <PhoneShadowBudget active={mobile && shadowsEnabled && visible && !paused && !reduced && Boolean(model) && arrival === 'done'} onSlow={disablePhoneShadows} />
          {!mobile && model && <Suspense fallback={null}><IslandPostprocessing enabled={!paused} preparing={!renderReady} overview={request.area === 'overview' && !moving && !focus && !cinematic && arrival === 'done'} cycle={cycle} reduced={reduced} onReady={pipelinePrepared} /></Suspense>}
          <IslandControls arrival={arrival} onArrivalStart={startArrival} onArrivalEnd={finishArrival} request={request} zoom={zoom} focus={focus} model={model} reduced={reduced} enabled={visible && !paused} onMoving={handleMoving} onAreaArrive={setArrivedSerial} onInteract={handleInteract} onOverview={handleOverview} onSectionStep={step} onFocusArrive={focusArrived} onFocusReturn={focusReturned} cinematic={cinematic} onCinematicEnd={stopCinematic} onCinematicMinute={cinematicMinute} onExploreGesture={tutorialGesture} />
          <TutorialTarget active={tutorialOpen && tutorialStep === 'open' && !focus && !moving && request.area === 'veranda'} model={model} mobile={mobile} reduced={reduced} target={tutorialTarget} onVisible={setTutorialBookVisible} />
          <SceneReadiness available={Boolean(model) && (mobile || pipelineReady) && !active && !paused} renderTarget={mobile ? null : pipelineTarget} onCompiled={shadersPrepared} onReady={scenePrepared} onError={onLoadError} />
        </Canvas>
      </SceneBoundary>
    </div>
    {visible && <div ref={interfaceLayer} className="explore-interface" aria-hidden={focus ? true : undefined}>
      <div className="explore-vignette" aria-hidden="true" />
      <header className="explore-header">
        {(request.area !== 'overview' || explored) && <h1 className="sr-only">Tarosh Mathuria — island portfolio</h1>}
        <button className="explore-brand" onClick={handleOverview} aria-label="Tarosh Mathuria — whole island"><BrandLogo responsive decorative /></button>
        <nav className="explore-nav" aria-label="Portfolio places">{QUICK_LINKS.map(link => <button key={link.area} onClick={() => navigate(link.area)} aria-current={request.area === link.area ? 'location' : undefined}>{link.label}</button>)}</nav>
        <div className="explore-header-actions"><CinematicTourControl active={Boolean(cinematic)} disabled={reduced || arrival !== 'done'} onToggle={toggleCinematic} /><button className="explore-guide" aria-label="Field guide" onClick={openGuide}><svg width="16" height="16" viewBox="0 0 20 20" fill="none" aria-hidden="true"><path d="M4 3h12v14H4zM7 3v14m3-10h3m-3 3h3" stroke="currentColor" /></svg><span>Field guide</span></button>
          <button className="island-settings-toggle" aria-label="Island settings" aria-expanded={settingsOpen} aria-controls="island-settings" onClick={() => { setSettingsOpen(value => !value); setMapOpen(false) }}><svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M4 7h16M4 17h16" stroke="currentColor" strokeWidth="1.5"/><circle cx="9" cy="7" r="3" fill="#234b43" stroke="currentColor"/><circle cx="16" cy="17" r="3" fill="#234b43" stroke="currentColor"/></svg></button></div>
      </header>
      <p className="cinema-notice" role="status">{cinematicNotice}</p>
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
        <button data-tutorial-target="zoom" onClick={() => changeZoom(1)} aria-label="Zoom in">+</button>
      </div>
      <WeatherControl value={weatherKind} onChange={setWeatherKind} disabled={arrival !== 'done'} onOpen={() => { setSettingsOpen(false); setMapOpen(false); if (tutorialOpen) closeTutorial() }} />
      <div className="explore-discoveries">
        <button className="discovery-toggle" onClick={() => setDiscoveryHelp(value => !value)} aria-expanded={discoveryHelp} aria-controls="discovery-hint"><span aria-hidden="true">✧</span><span>Little discoveries</span><strong>{discoveries.length}/7</strong></button>
        <p id="discovery-hint" hidden={!discoveryHelp}>{discoveries.length === 7 ? 'You found all seven little Nessies. Thanks for taking the long way around.' : 'Seven little green Nessies are tucked around the island. Tap one when you spot it. There’s one near the veranda table.'}</p>
        <span className="sr-only" role="status">{discoveries.length ? `${discoveries.length} of 7 little Nessies discovered.` : ''}</span>
      </div>
      <footer className="explore-footer">
        <div id="island-settings" className={`explore-tools ${settingsOpen ? 'is-open' : ''}`}><IslandSound weather={weather} paused={paused || Boolean(focus)} reduced={reduced} /><button className="explore-tool" aria-pressed={dusk} onClick={() => setDusk(value => !value)}><span aria-hidden="true">{dusk ? '☾' : '☀'}</span><span>{dusk ? 'Dusk' : 'Daylight'}</span></button><button className="explore-tool motion-tool" aria-label="Reduce motion" aria-pressed={reduced} disabled={systemReduced} onClick={() => setStill(value => !value)}><span aria-hidden="true">{reduced ? '−' : '≈'}</span><span>{reduced ? 'Still' : 'Motion'}</span></button><button className="explore-tool tutorial-replay" aria-label="How to explore" onClick={openTutorial}><span aria-hidden="true">?</span><span>How to explore</span></button></div>
        <div className="explore-tour">
          <button onClick={() => step(-1)} aria-label="Previous section">←</button>
          <span>{sectionIndex === 0 ? 'WELCOME' : `${sectionIndex} / ${TOUR.length}`}<span>{mobile ? 'Tap arrows to explore' : sectionIndex === 0 ? 'Scroll to explore' : 'Island wander'}</span></span>
          <button data-tutorial-target="next" onClick={() => step(1)} aria-label="Next section">→</button>
        </div>
        <p className="explore-input-hint" id="island-controls-help"><span>Scroll to change sections · Drag to explore</span><span>{area.read || request.area === 'beach' ? 'Tap the glow to open' : 'Drag to look · Pinch to zoom'}</span><span className="sr-only">Use the arrows for sections and the plus and minus buttons or pinch to zoom. Focus the island and use Page Up and Page Down for sections, arrow keys to orbit, plus or minus to zoom, and Home for the whole island.</span></p>
      </footer>
      <div className="explore-area-hint" aria-hidden="true">{!moving && request.area !== 'overview' ? `${area.hint}${area.read ? ' Click the glow to open.' : ''}` : ''}</div>
    </div>}
    {visible && arrival !== 'done' && <button className="arrival-skip" onClick={finishArrival}>Arriving on the island <span aria-hidden="true">·</span> Skip intro</button>}
    {focus && !hasReading && <div className="artifact-focus-status">
      <button ref={cancelButton} onClick={closeReader} disabled={focus.phase === 'return'} aria-label="Cancel opening, back to island"><span aria-hidden="true">←</span> Back to island</button>
      <p role="status">{focus.phase === 'return' ? 'Returning to your view' : `Opening ${artifactLabel(focus.request)}`}</p>
    </div>}
    {tutorialOpen && !hasReading && tutorialCoach}
    {guideOpen && <FieldGuide onClose={() => setGuideOpen(false)} />}
    {focus && hasReading && <ArtifactReader request={focus.request} animated={!reduced} closing={focus.phase === 'closing'} onClose={closeReader} onExited={readerExited} restoreFocus={false} tutorial={tutorialOpen ? tutorialCoach : undefined} />}
  </div>
}
