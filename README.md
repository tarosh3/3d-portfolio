# Tarosh Mathuria — A personal island

A Next.js portfolio set on an explorable island. Scroll down or up to move between sections, drag to orbit, and use pinch or the plus/minus controls to zoom. The island map visits the veranda, rear deck, project cabin, hammock, pier, beach, lagoon, and west shore. Small physical objects invite visitors to open readable portfolio details while keeping the surrounding scene intact.

Clickable artifacts gently pulse with warm light across their entire surfaces and edges. The magazine highlights both pages; cards, notebooks, posters and field notes use the same treatment. Hover increases the light and eases the object up 2%; labels appear only on hover or keyboard focus. Phones keep the idle pulse, two glow-shell layers and fixed 48px tap targets, with no floating labels. The glow reuses existing mesh geometry and owned materials, prepared beneath the loader, with no frame allocations or extra render pass. Cues are limited to the settled area and disappear during travel, readers, overlays and the introduction. Invisible hit targets and labels retain bounded static-model BVH visibility checks. Still/reduced motion keeps a steady glow with no extra frame loop.

A skippable hands-on tutorial teaches the real island controls. A small translucent helper gives one short instruction while an animated cursor (finger on phones) points to the actual section arrow, magazine, reader Back control and zoom button, and demonstrates dragging directly over the scene. Visitors complete each action to advance: arrive at the veranda, open and close its magazine, look around, then zoom. The magazine target follows its measured 3D position. There are no lesson Next buttons or blocking tutorial modal. Replay **How to explore** in the footer (Island settings on phones); completion/Skip is remembered for the session. Still/reduced motion uses static pointers. The reader lesson lives inside its native dialog so its Back and Skip controls remain usable. Interrupted travel never counts as arrival; a recovery action guides visitors back if they explore somewhere else during a lesson.

The **360° tour** starts at the camera position and gaze you are currently exploring. It generates its own curves through the covered veranda, side walkway and rear deck, with seeded sweeps over the beach, west shore and lagoon. Distance and height vary between activations and laps, while travel keeps one direction around the island. The model guard checks camera clearance and turns before playback. A single 1.2-second acceleration leads into a continuous 2.7-unit-per-second cruise; matching tangents carry movement through every join without stopping, reversing or returning to a section pose. A seeded sequence selects different cached curves on successive laps without per-frame allocations or route rebuilding. Every 60 seconds of active playback, Daylight/Dusk blends and the weather advances through Sunlit, Overcast, Tropical rain and Storm. Drag, scroll, Escape or Stop tour returns control without snapping the camera. Hidden tabs pause the camera and atmosphere clock; Still and system reduced motion disable automatic travel. Phones keep the normal lightweight render path.

## Run

```sh
npm install --legacy-peer-deps
npm run dev
```

Use the URL printed by Next.js; pass `-- -p 3001` to request that port explicitly.

## Explore and read

- **Mouse / touch:** use the wheel or the previous/next buttons for sections; drag to look around; pinch or use the plus/minus buttons to zoom within the current area's bounds. The route loops smoothly: moving forward from west shore returns to the overview, and moving back from the overview returns to west shore.
- **Keyboard:** focus the island canvas, then use `PageDown` / `PageUp` for sections, arrow keys to orbit, `+` / `-` to zoom, and `Home` for the whole island. The map, navigation, and reading actions are also DOM buttons.
- **Navigation:** previous/next buttons are always available and wrap around the island loop. You can also select a map location or a named section. A deliberate wheel gesture moves one section and consumes its momentum tail. New gestures can retarget travel; dragging cancels it immediately.
- **Reading:** select a physical object or the current area's reading button. The camera approaches that object's measured surface, aligns the print, and then reveals its native reader. This applies to the magazine, notebook, both posters, all three hanging cards, door note, postbox, lagoon tide log, and west-shore field board. “Back to area” or Escape dismisses the reader and retraces the approach to your saved orbit and zoom, with focus restored. Escape or “Back to island” can also cancel an approach. `/read` provides the complete portfolio independently of WebGL.
- **Atmosphere:** sound is on by default and starts on the first interaction (browsers block autoplay); daylight/dusk and a Still setting are available. The day toggle eases over about two seconds, blending the background, fog, ambient/hemisphere/directional lighting, sky and water together. Daylight has warmer fill, a soft sun halo and drifting canopy motes; dusk fades in fireflies, ember light, stars and a small crescent moon. Palm crowns move through small phase-shifted wind gusts, while fish, gulls, the hammock and hanging cards keep their own slower motion. Still and system reduced motion switch the palette instantly, stop ambient movement and make area changes immediate.
- **Weather:** the compact weather selector offers Sunlit, Overcast, Tropical rain and Storm in daylight or dusk. Clouds gather before showers, direct light softens, wind moves the clouds, palms and sea together, and exposed surfaces stay damp after the rain clears. Rain stops at roofs and umbrellas, with splashes on exposed ground and rings on water. Storm adds occasional distant cloud illumination and delayed thunder. Sound blends rain and wind with the beach ambience and softens under shelter. Still/reduced motion keeps the selected atmosphere, hides falling rain and suppresses lightning and thunder.

The island fills one viewport. Document scrolling is reserved for readers and the standalone reading edition.

Lighting uses island-fitted directional shadows at 2048px on desktop and 1024px on phones. A phone drops shadows for the rest of the page visit after two sustained slow-frame windows (over 22ms average), excluding loading, Still, hidden tabs and readers. Phones and coarse touch devices skip postprocessing, including in landscape. Desktop adds subtle N8AO contact shading, selective bloom that fades with the dusk lights, a soft vignette, and an eased tilt-shift effect confined to the overview. The overview blur is capped at 0.035 to retain sky detail. The entire composer stops while any reader or field guide is open. The desktop effects chunk loads only when needed.

`@react-three/postprocessing` is pinned to 2.19.1 for React 18 / Fiber 8. Canvas uses the supported `PCFShadowMap` name in Three r184; it has the same filtering as the deprecated `PCFSoftShadowMap` alias without resetting the renderer or logging each frame.

The ocean and lagoon share a custom water shader at the model's shallow-water level. A 256×256 map baked once from the sand and rock geometry drives turquoise-to-teal depth colours and shoreline foam. The sand keeps its original lighting and shadows beneath subtle procedural caustics. Water normals and caustics share an accumulated clock that freezes under Still, reduced motion, hidden tabs and reading. Day and dusk have separate palettes. Phones use two ripple layers on the same two-triangle surface, with no reflection/refraction render targets. Water becomes opaque before the finite seabed ends, while remaining translucent around the lagoon fish. The old cloned transmission-water mesh and glint particles are replaced; the source GLTF is preserved.

The depth lookup settles to exactly the open-ocean depth before its perimeter, preventing a square patch from appearing around the island. Weather changes the sea colour, wind-driven ripples, sun highlights, rain rings and restrained whitecaps; the same active clock drives water and sand caustics. Damp sand, rocks, buildings and pier boards darken and become slightly smoother, while the roof-height map protects interiors and the source model materials remain untouched.

A persistent gradient sky dome blends soft cloud banks into a broad overcast ceiling and a matching fog horizon. The cloud projection follows the visible horizon at the camera's height. At night, indigo gradients frame two slowly folding teal/violet aurora curtains, a faint galactic band, and 1,800 stars with varied magnitudes, colours and gentle scintillation. Phones draw 900 stars and one aurora curtain. The moon has an owned 256px procedural maria/crater map, a shaded terminator, faint earthshine and an atmospheric halo. The existing cloud field obscures every celestial effect; dense weather hides the aurora entirely. Aurora sampling reuses the cached cloud-noise texture, with no volumetric raymarching or extra sky passes. The home gaze leaves more sky above the island, and overview tilt-shift fades out at night to retain fine celestial detail. Moonlight catches the existing water normals without a reflection pass.

A shared day-cycle value and weather state keep sky, fog, lighting, water and wind coordinated; reversing a setting continues from the current state. Readers and hidden tabs pause active clocks; Still and reduced motion settle the palette immediately and freeze clouds, aurora and star twinkle. The temporary arrival layer retains its separate cloud texture.

Rain uses two instanced draws with deterministic GPU particle motion and a shared 512×512 surface/shelter map baked from the island. Desktop allows up to 12,000 streaks and 340 splashes; phones use 4,600 and 100. Sustained slow phone frames reduce that to 2,200 streaks with no surface splashes for the remainder of the visit. Clear weather skips rain draws after shader preparation, and Still omits them. The rain shaders and shelter texture warm up beneath the loader even when the island starts sunlit.

On phones, including short landscape viewports, sound, daylight and Still live in the header settings menu. The map offers named, 44px-tall destinations; the bottom navigation floats directly over the scene. Rendering uses DPR 1 with antialiasing, skips hover raycasts during touch/drag, and omits duplicate floating HTML markers and their per-frame occlusion checks. Physical objects remain tappable. Browser toolbar resizing adjusts the lens without resetting the explored camera or restarting travel. Drag inertia is cleared before flights and reading; explicit zoom buttons ease to a collision-checked distance. Reader flights reuse their measured route lengths, and live collision probes reuse vector storage. See `docs/MOBILE_QA.md` for the browser checks and device-testing limits.

## Physical content

| Content | Home on the island |
| --- | --- |
| About | The existing open magazine on the veranda coffee table |
| Engineering | A small tabbed notebook on a fitted tray beside the rear-deck loungers |
| Projects | Two pinned posters on the changing cabin; the original chalkboard points toward them |
| Career | Three pegged cards above the hammock, ordered education → internship → senior engineer |
| Current role | A compact pinned note on the bungalow door |
| Contact | A small postbox and envelope beside an outer pier post |
| Systems at scale | A tide log laid on the lagoon pier with ONDC, metro, Go, Kafka and Redis notes |
| Infrastructure | A field board mounted on the west bungalow wall beneath the satellite dish |

The beach is a quieter exploration stop. The lagoon and west shore finish the portfolio with systems-at-scale and infrastructure stories. Seven existing Nessie figures form an optional discovery trail; it never gates portfolio content.

## Architecture

| File | Responsibility |
| --- | --- |
| `app/portfolio-data.ts` | Shared profile facts, skills, projects, career records, and contact destinations |
| `app/components/island-data.ts` | Area identities, camera poses and limits, map coordinates, tour order, and `ReadRequest` |
| `app/components/IslandScene.tsx` | Scene lifecycle, section navigation, map state, readers, weather, daylight/dusk, audio, and motion controls |
| `app/components/IslandLighting.tsx`, `island-rendering.ts` | Weather-responsive lighting, fitted shadow camera, model caster policy, and sustained phone frame-time fallback |
| `app/components/IslandPostprocessing.tsx` | Desktop-only AO, selected dusk bloom, overview blur, and tone mapping |
| `app/components/IslandWater.tsx`, `island-water.ts`, `water-depth.ts` | Shared ocean shader, sand caustics, baked seabed depth and shoreline distance |
| `app/components/IslandDayCycle.tsx`, `day-cycle.ts` | Shared two-second atmosphere blend, reversal, pause/resume and instant reduced-motion switching |
| `app/components/IslandSky.tsx`, `island-sky.ts`, `sky-atmosphere.ts`, `night-sky.ts` | Clouds, matching fog horizon, aurora, varied stars and textured moon |
| `app/components/IslandWeatherDriver.tsx`, `island-weather.ts`, `WeatherControl.tsx` | Shared weather transitions, active clock, wind/lightning, phone budget and selector |
| `app/components/IslandRain.tsx`, `island-rain.ts`, `rain-surface.ts` | GPU rain and splashes, baked roof shelter, quality tiers and resource ownership |
| `app/components/island-wetness.ts`, `island-material-effects.ts` | Exposed-surface wetness and composable owned-material shader effects |
| `app/components/IslandSound.tsx`, `weather-audio.ts` | Interaction-gated beach ambience, wind, rain, shelter and distant thunder |
| `app/components/ArrivalClouds.tsx`, `cloud-texture.ts` | Temporary textured cloud layer for the first-visit camera arrival |
| `app/components/section-scroll.ts` | Wheel gesture threshold, direction, momentum consumption, and reader suspension |
| `app/components/magazine-camera.ts` | Measured close-reading pose and printed-page orientation for the veranda magazine |
| `app/components/artifact-camera.ts`, `artifact-motion.ts` | Per-object reading poses, camera orientation, saved views, and reversible approaches |
| `app/components/IslandControls.tsx` | One camera owner for direct orbit, keyboard input, responsive framing, interruptible travel, and bounds |
| `app/components/camera-path.ts` | Raycast collision guard and routes around static model surfaces |
| `app/components/WorldArtifacts.tsx` | Measured object placements, selection, physical prints, pegs, rope, notebook tray, and postbox |
| `app/components/artifact-textures.ts` | Small canvas-generated covers, labels, and diagrams on the physical objects |
| `app/components/LivingIsland.tsx` | Cloned model, local fish/gull/hammock motion, wind, daylight motes, dusk accents, and discoveries |
| `app/components/ArtifactReader.tsx` | Accessible magazine, notebook, project, timeline, contact, and field-note reading dialogs |
| `app/components/FieldGuide.tsx`, `PortfolioContent.tsx` | Complete shared reading content; also used by `app/read/page.tsx` |
| `app/components/SceneWrapper.tsx` | Server-rendered loading shell, client-only scene import, font readiness, and the reveal/input handoff |
| `app/components/LoadingScreen.tsx`, `loading-progress.ts`, `loading-screen.css` | Composited island illustration, monotonic progress, one-shot exit, and fallback reading access |
| `app/components/SceneReadiness.tsx`, `scene-readiness.ts` | Shader compilation, rendered-frame warmup, and cancellation of stale preparation callbacks |
| `app/components/exploration.css`, `artifact-reader.css` | Exploration and reader styling, imported by `app/globals.css` |

The camera guard builds a separate world-space collision mesh and a bounding volume hierarchy (BVH) for fast ray queries. It checks selected static model surfaces, tries direct travel before routes through inner and outer rings, and discourages sharp reversals. Local quadratic curves round each corner with matching entry/exit directions; their sampled segments must pass the clearance checks. The displayed GLTF buffers remain untouched. Unroutable trips fall back to a brief faded view change. Orbit moves that collide or pass below the camera floor are rejected. This is a geometric guard, not a complete physics or camera-frustum collision system.

Rendering pauses while a reader is open or the tab is hidden. Ambient motion also pauses during reading approaches and returns. Reduced motion and Still skip travel and paper reveals while preserving the same compositions. Reading approaches lock section navigation and orbit input; if no checked route exists from a manually explored view, the reader opens from that view without moving through geometry. Ambient motion uses local pivots and accumulated active time so returning to a hidden tab does not advance the simulation abruptly.

The first reveal includes a 3.5-second guarded descent through a temporary cloud layer and a staggered welcome-name reveal. Any input skips to the overview. Reduced motion, Still, and repeat visits in the same browser session skip the introduction entirely. Still is also remembered in session storage. To preview the arrival again, use a fresh browsing session.

The loading screen renders in the first HTML with an explicit “Loading your island” label. A miniature island assembles inside an animated nautical compass, with drifting clouds, expanding tides and a moving sailboat. Three visible stages follow the actual loading-manager and readiness signals: gathering details, preparing the scene, and arriving. Activity remains visible during the renderer/font wait; a long wait explains the text-edition alternative. Repeating animation uses only CSS transforms and opacity on HTML layers; there is no JavaScript animation loop, inherited per-frame progress variable or SVG path repaint. The progress bar follows real asset preparation monotonically, while a separate tide indicates activity without a jumping numeric counter. Scene mounting waits for two loader paint opportunities. Texture uploads run in small batches; scene shaders compile against the actual desktop composer target, and the overview blur passes warm up while covered. Rendering stays off until compilation, then uses demand frames until the loader has left. Fonts and three rendered warmup frames gate readiness, followed by a short settling interval and a single 900 ms dissolve. The camera establishes its arrival origin or skipped-intro overview beneath the loader. Still and reduced motion skip the animated fill, settling interval and exit; loading errors retain the link to `/read`.

## Checks

```sh
npm run lint
npx tsc --noEmit
node scripts/check-section-scroll.cjs
node scripts/check-mobile-camera.cjs
node scripts/check-cinematic-path.cjs
node scripts/check-island-arrival.cjs
node scripts/check-loading-lifecycle.cjs
node scripts/check-scene-readiness.cjs
node scripts/check-artifact-hover.cjs
node scripts/check-artifact-beacons.cjs
node scripts/check-island-rendering.cjs
node scripts/check-island-water.cjs
node scripts/check-island-sky.cjs
node scripts/check-night-sky.cjs
node scripts/check-cloud-geometry.cjs
node scripts/check-day-cycle.cjs
node scripts/check-island-weather.cjs
node scripts/check-weather-sky.cjs
node scripts/check-island-rain.cjs
node scripts/check-weather-ocean.cjs
node scripts/check-weather-audio.cjs
node scripts/check-magazine-camera.cjs
node scripts/check-artifact-cameras.cjs
node scripts/check-island-navigation.cjs
npm run build
npm start
```

The scroll check covers gesture momentum, reversal, delta units, modifiers, horizontal input, and reader suspension. The navigation geometry check loads the optimized GLB without a browser and verifies all 288 ordered area routes across four viewport sizes. The artifact check covers nine distinct surfaces at four viewport sizes: print framing and orientation, sightlines, original-model prop intersections, approach clearance, cancellation, and exact saved-view restoration. These checks do not establish every orbit position, touch behavior, or accessibility; browser acceptance is still required.

The loading lifecycle check runs the actual loader/readiness hooks against a deterministic browser clock, covering a zero-RAF loader, monotonic progress, honest phase changes (including new resource batches), long-wait guidance, Strict Mode replay, error handling, one-shot exit, Still/reduced motion, batched texture uploads, matching shader colour-space targets and cancelled preparation. The readiness check covers generation and warmup-frame gating. The arrival check also verifies repeat/Still overview setup while loader input remains disabled. These checks cover lifecycle behavior; inspect actual GPU preparation and the visible handoff in a browser.

Weather checks cover cloud-before-rain sequencing, smooth reversal, retained wetness, sparse lightning, exact sky/fog colour matching, celestial masking, shared clocks and resource cleanup. The rain check compares baked shelter against thousands of independent rays through the actual model, checks exposed impacts and phone tiers, and verifies shader preparation. The ocean check covers wind/time uniforms, pause/Still, roof exposure and wetness/caustic shader-hook cleanup in either order. The retained cloud-geometry check covers an unused compatibility helper; the live sky renders its clouds in the dome shader. Browser acceptance should include all four modes in daylight/dusk, sheltered veranda views, first rain after loading, post-rain drying, audio after interaction, and reader/tab/Still transitions on desktop and phone-sized viewports.

Before release, inspect all map destinations on desktop and narrow portrait; interrupt camera travel; orbit near buildings and palms; exercise the reader tabs, Escape, and focus restoration; test reduced motion, loading fallback, and the `/read` route. See [the exploration record](docs/ISLAND_EXPLORATION.md) for placement evidence and acceptance checks.

Production builds use `.next-production`, leaving an active development server's `.next` output separate.

## Assets and known limitation

The original island model is credited to **Jef Belmans** and preserved as `public/island.glb` (79.32 MiB). The page loads `public/island-optimized.glb` (12.34 MiB). `scripts/optimize-island.mjs` documents the external tooling used to resize/compress textures while retaining scene structure and geometry. Audio comes from `public/sounds/beach-ambience.mp3`.

Some original plant, palm-leaf, and torch atlases are **RGB images without an alpha channel**. Their optimized versions retain that limitation: leaf/flame cards can show opaque shapes at close angles, and `alphaTest` cannot reconstruct missing transparency. The implementation preserves those textures rather than guessing a color key or removing foliage. Correcting them requires authored alpha masks or replacement source textures.

Existing profile claims and contact destinations are preserved. Project URLs were not supplied.
