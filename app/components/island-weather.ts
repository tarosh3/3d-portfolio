export type WeatherKind = 'clear' | 'cloudy' | 'rain' | 'storm'
export const WEATHER_OPTIONS: { id: WeatherKind; label: string; description: string }[] = [
  { id: 'clear', label: 'Sunlit', description: 'Warm light & a sea breeze' },
  { id: 'cloudy', label: 'Overcast', description: 'Soft skies & drifting cloud' },
  { id: 'rain', label: 'Tropical rain', description: 'Passing showers & silver seas' },
  { id: 'storm', label: 'Storm', description: 'Rolling thunder & ocean gusts' },
]
const PROFILES = {
  clear: { cloud: 0, rain: 0, wind: .2, fog: 0 },
  cloudy: { cloud: .72, rain: 0, wind: .42, fog: .3 },
  rain: { cloud: .88, rain: .62, wind: .55, fog: .62 },
  storm: { cloud: 1, rain: 1, wind: .92, fog: .84 },
}
const damp = (a: number, b: number, speed: number, dt: number) => Math.abs(b - a) < .0001 ? b : a + (b - a) * (1 - Math.exp(-speed * dt))

/** Mutable shared atmosphere. Consumers read it; only the driver advances active time. */
export function createWeather() {
  let seed = 83911, nextLightning = 13, flashAge = 10
  const random = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296 }
  const weather = {
    kind: 'clear' as WeatherKind,
    cloud: 0, rain: 0, wind: .2, gust: 0, fog: 0, wetness: 0,
    sun: 1, lightning: 0, flashSerial: 0, shelter: 0,
    windX: .8, windZ: .6, time: 0, drift: 0,
    setTarget(kind: WeatherKind, reduced = false) {
      weather.kind = kind
      if (reduced) {
        Object.assign(weather, PROFILES[kind])
        weather.wetness = PROFILES[kind].rain
        weather.sun = 1 - weather.cloud * .86
        weather.lightning = 0; weather.gust = 0
      }
    },
    update(delta: number, reduced: boolean, paused: boolean) {
      if (paused) return
      if (reduced) { weather.setTarget(weather.kind, true); return }
      if (!Number.isFinite(delta) || delta <= 0) return
      const dt = Math.min(delta, .05), profile = PROFILES[weather.kind]
      weather.time += dt
      weather.cloud = damp(weather.cloud, profile.cloud, .55, dt)
      weather.wind = damp(weather.wind, profile.wind, .45, dt)
      weather.fog = damp(weather.fog, profile.fog, .36, dt)
      // The sky closes before rain arrives; drying out takes longer than the shower.
      const cover = Math.max(0, Math.min(1, (weather.cloud - .32) / .45))
      weather.rain = damp(weather.rain, profile.rain * cover, .65, dt)
      weather.wetness = damp(weather.wetness, weather.rain, weather.rain > weather.wetness ? .2 : .025, dt)
      weather.sun = 1 - weather.cloud * .86
      weather.gust = weather.wind * (.5 + .3 * Math.sin(weather.time * .63) + .2 * Math.sin(weather.time * 1.37 + 2))
      weather.drift += dt * (.45 + weather.wind * 1.5 + weather.gust * .35)
      flashAge += dt; nextLightning -= dt
      if (weather.kind === 'storm' && weather.rain > .65 && nextLightning <= 0) {
        flashAge = 0; nextLightning = 17 + random() * 16; weather.flashSerial++
      } else if (weather.kind !== 'storm') nextLightning = Math.max(nextLightning, 8)
      // A restrained cloud illumination, never a rapid full-screen strobe.
      weather.lightning = weather.kind === 'storm' && flashAge < .85 ? Math.sin(Math.min(1, flashAge / .12) * Math.PI / 2) * Math.exp(-flashAge * 5) * .52 : 0
    },
  }
  return weather
}
export type IslandWeather = ReturnType<typeof createWeather>
