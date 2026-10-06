'use client'

import { useLayoutEffect, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { createPhoneShadowBudget } from './island-rendering'
import type { IslandWeather, WeatherKind } from './island-weather'

export default function IslandWeatherDriver({ weather, kind, reduced, paused, mobile, budgetActive, onSlow }: {
  weather: IslandWeather; kind: WeatherKind; reduced: boolean; paused: boolean
  mobile: boolean; budgetActive: boolean; onSlow: () => void
}) {
  const invalidate = useThree(state => state.invalidate)
  const budget = useRef(createPhoneShadowBudget())
  const tripped = useRef(false)
  useLayoutEffect(() => {
    weather.setTarget(kind, reduced)
    invalidate()
  }, [weather, kind, reduced, invalidate])
  useLayoutEffect(() => { budget.current.reset() }, [budgetActive, mobile])
  useFrame((_, delta) => {
    weather.update(delta, reduced, paused)
    if (mobile && budgetActive && !paused && !reduced && !tripped.current && weather.rain > .1 && budget.current.sample(delta)) {
      tripped.current = true; onSlow()
    }
  }, -110)
  return null
}
