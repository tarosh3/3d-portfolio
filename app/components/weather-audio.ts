import type { IslandWeather } from './island-weather'

/** Quiet, continuous weather layers. Created only inside a visitor gesture. */
export function createWeatherAudio() {
  const context = new AudioContext()
  const noise = context.createBuffer(1, context.sampleRate * 6, context.sampleRate)
  const data = noise.getChannelData(0)
  let seed = 8492, brown = 0
  for (let i = 0; i < data.length; i++) {
    seed = (seed * 1664525 + 1013904223) >>> 0
    const white = seed / 2147483648 - 1
    brown = (brown + .02 * white) / 1.02
    data[i] = white * .65 + brown * 1.1
  }
  const source = context.createBufferSource()
  source.buffer = noise; source.loop = true
  const master = context.createGain(); master.gain.value = .85
  master.connect(context.destination)
  const wind = context.createBiquadFilter(); wind.type = 'lowpass'; wind.frequency.value = 280; wind.Q.value = .45
  const windGain = context.createGain(); windGain.gain.value = 0
  source.connect(wind); wind.connect(windGain); windGain.connect(master)
  const rainHigh = context.createBiquadFilter(); rainHigh.type = 'highpass'; rainHigh.frequency.value = 700
  const rainLow = context.createBiquadFilter(); rainLow.type = 'lowpass'; rainLow.frequency.value = 5800
  const rainGain = context.createGain(); rainGain.gain.value = 0
  source.connect(rainHigh); rainHigh.connect(rainLow); rainLow.connect(rainGain); rainGain.connect(master)
  const thunder = context.createBiquadFilter(); thunder.type = 'lowpass'; thunder.frequency.value = 120; thunder.Q.value = .8
  const thunderGain = context.createGain(); thunderGain.gain.value = 0
  source.connect(thunder); thunder.connect(thunderGain); thunderGain.connect(master)
  source.start()
  let seenFlash: number | null = null, disposed = false, wantsRunning = false
  let changingState = false
  const silenceThunder = () => {
    thunderGain.gain.cancelScheduledValues(context.currentTime)
    thunderGain.gain.setValueAtTime(0, context.currentTime)
    seenFlash = null
  }
  const reconcileState = () => {
    if (disposed || changingState || context.state === 'closed') return
    if (wantsRunning === (context.state === 'running')) return
    changingState = true
    const requestedRunning = wantsRunning
    const transition = requestedRunning ? context.resume() : context.suspend()
    void transition.then(() => {
      changingState = false
      // A reader/mute can arrive while resume is still pending, and vice
      // versa. Reconcile the latest request after the in-flight operation.
      if (!disposed) reconcileState()
    }, () => {
      changingState = false
      // A browser rejection needs a fresh gesture, not a promise retry loop.
      if (!disposed && requestedRunning !== wantsRunning) reconcileState()
    })
  }
  return {
    resume() {
      if (disposed) return
      wantsRunning = true
      master.gain.setValueAtTime(.85, context.currentTime)
      reconcileState()
    },
    pause() {
      if (disposed) return
      wantsRunning = false
      // Silence synchronously, even if a pending resume temporarily wins the
      // browser's state race. Do not retain delayed thunder across a pause.
      master.gain.setValueAtTime(0, context.currentTime)
      silenceThunder()
      reconcileState()
    },
    update(weather: IslandWeather, reduced: boolean) {
      if (disposed || !wantsRunning) return
      const now = context.currentTime
      const exposure = 1 - weather.shelter * .68
      wind.frequency.setTargetAtTime(240 + weather.wind * 430 + weather.gust * 100, now, .6)
      windGain.gain.setTargetAtTime((.025 + weather.wind * .16 + weather.gust * .045) * exposure, now, .6)
      rainLow.frequency.setTargetAtTime(5800 - weather.shelter * 3600, now, .35)
      rainGain.gain.setTargetAtTime(weather.rain * .15 * (1 - weather.shelter * .44), now, .45)
      if (seenFlash === null) seenFlash = weather.flashSerial
      if (seenFlash !== weather.flashSerial) {
        seenFlash = weather.flashSerial
        if (!reduced && weather.kind === 'storm') {
          const start = now + 2.1
          thunderGain.gain.cancelScheduledValues(now)
          thunderGain.gain.setValueAtTime(0, now)
          thunderGain.gain.setValueAtTime(0, start)
          thunderGain.gain.linearRampToValueAtTime(.65, start + .7)
          thunderGain.gain.exponentialRampToValueAtTime(.001, start + 5.5)
        }
      }
      if (weather.kind !== 'storm' || reduced) {
        thunderGain.gain.cancelScheduledValues(now)
        thunderGain.gain.setTargetAtTime(0, now, .3)
      }
    },
    dispose() {
      if (disposed) return
      disposed = true; source.stop(); source.disconnect()
      wind.disconnect(); windGain.disconnect(); rainHigh.disconnect(); rainLow.disconnect(); rainGain.disconnect(); thunder.disconnect(); thunderGain.disconnect(); master.disconnect()
      void context.close().catch(() => {})
    },
  }
}
