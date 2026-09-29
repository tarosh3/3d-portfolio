/** A generation keeps a cancelled/Strict Mode warmup from revealing a new scene. */
export function createSceneReadiness(requiredFrames = 3) {
  let generation = 0
  let compiled = false
  let frames = 0
  let complete = false
  return {
    begin() {
      generation++
      compiled = false
      frames = 0
      complete = false
      return generation
    },
    compiled(token: number) {
      if (token !== generation || complete) return false
      compiled = true
      return true
    },
    frame(token: number) {
      if (token !== generation || !compiled || complete) return false
      frames++
      if (frames < requiredFrames) return false
      complete = true
      return true
    },
    current(token: number) { return token === generation },
    cancel(token: number) {
      if (token === generation) { generation++; compiled = false; complete = false }
    },
  }
}
