type WheelSample = { deltaX: number; deltaY: number; deltaMode: number; time: number; blocked?: boolean; ctrlKey?: boolean; metaKey?: boolean; altKey?: boolean }

/** One section per wheel gesture, including the trackpad's momentum tail. */
export function createSectionScroll() {
  let lastTime = -Infinity, amount = 0, consumed = false, direction = 0
  const reset = () => { lastTime = -Infinity; amount = 0; consumed = false; direction = 0 }
  const push = (event: WheelSample): -1 | 0 | 1 => {
    if (event.ctrlKey || event.metaKey || event.altKey || Math.abs(event.deltaX) > Math.abs(event.deltaY) || !event.deltaY) return 0
    const sign = Math.sign(event.deltaY)
    if (event.time - lastTime > 180) { amount = 0; consumed = false; direction = sign }
    lastTime = event.time
    if (event.blocked) { consumed = true; amount = 0; return 0 }
    if (consumed) return 0
    if (sign !== direction) { amount = 0; direction = sign }
    amount += event.deltaY * (event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? 800 : 1)
    if (Math.abs(amount) < 48) return 0
    consumed = true
    return sign as -1 | 1
  }
  return { push, reset }
}
