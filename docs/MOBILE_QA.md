# Mobile verification — 27 September 2026

## Changes

- Phone landscape (up to 1024px wide and 500px high) retains compact touch controls, named map destinations and the phone rendering budget. Selecting a destination closes the compact map.
- Landscape navigation, captions and menus have dedicated positions; the map and settings can scroll within the available height.
- A longer, soft mobile sky gradient improves welcome-text contrast over bright clouds without adding a panel or blur.
- The 320px magazine cover no longer widens its reading surface: measured content width and scroll width both equal 290px.
- Reader close controls and notebook tabs have at least 44px touch targets. Narrow reader tabs use 12px text; the small-phone field-guide header leaves more reading space.
- Phone field-guide backdrops omit blur. Slow-frame shadow fallback now responds after two 1.5-second windows averaging over 22ms, following a 2-second warmup. It remains latched for the visit and excludes readers, background tabs, loading and Still mode.
- Camera reader playback reuses the route length measured at creation. Live collision checks reuse their endpoint vectors; path-length calculation no longer creates a temporary array.

## Browser checks

Production build tested in the Codex browser at 320×568, 390×844, 844×390 and 430×932, plus a shorter 390×700 viewport.

- Loading/reveal, portrait-to-landscape resize, all eight destinations, next/previous navigation and last-section return to home.
- Magazine, project, engineering, career and contact readers: opening, native scrolling, tabs and close/return.
- Compact map scrolling and destination selection; field-guide chapter links, sticky header and close target.
- Daylight/Dusk and Still settings. Postprocessing stays off on phone layouts and during reading.
- No browser runtime errors. The installed R3F/Three combination emits a one-time THREE.Clock deprecation warning on canvas creation.

## Automated validation

- Production build, lint and TypeScript checks pass.
- Loading lifecycle and scene readiness, section-scroll input, first arrival, and day-cycle checks pass.
- Eight mobile controller scenarios pass, including resize during travel, collision-limited zoom and returning to the exact explored pose after reading.
- 144 artifact-return scenarios and 288 routes against actual island geometry pass with no collision or fallback failures.
- Shadow frustum and slow-frame fallback tests pass, including healthy 50/60fps, sustained 40/30fps, isolated stalls and pause/reset behavior.

## Scope of evidence

Browser viewport checks run on desktop hardware. They do not establish iPhone/Android GPU frame rate, touch latency, thermal behavior or Safari toolbar/safe-area behavior. The controller tests simulate resize events and OrbitControls state; actual device motion should be checked using the optimized production preview rather than Next development mode.
