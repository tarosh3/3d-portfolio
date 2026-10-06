import type { AreaId } from './island-data'

export type TutorialStep = 'travel' | 'open' | 'return' | 'look' | 'zoom' | 'done'
export type TutorialGesture = 'orbit' | 'zoom'
export type TutorialEvent =
  | { type: 'arrived'; area: AreaId }
  | { type: 'reading'; stage: number }
  | { type: 'returned' }
  | { type: 'gesture'; kind: TutorialGesture }

/** Advance only on completed island actions, never a timer or a lesson button. */
export function advanceTutorial(step: TutorialStep, event: TutorialEvent): TutorialStep {
  if (step === 'travel' && event.type === 'arrived' && event.area === 'veranda') return 'open'
  if (step === 'open' && event.type === 'reading' && event.stage === 1) return 'return'
  if (step === 'return' && event.type === 'returned') return 'look'
  if (step === 'look' && event.type === 'gesture' && event.kind === 'orbit') return 'zoom'
  if (step === 'zoom' && event.type === 'gesture' && event.kind === 'zoom') return 'done'
  return step
}
