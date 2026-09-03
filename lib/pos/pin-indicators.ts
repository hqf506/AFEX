export function getPinIndicatorState(pinLength: number, requiredLength = 4) {
  const safeLength = Math.max(0, Math.min(pinLength, requiredLength))
  return Array.from({ length: requiredLength }, (_, index) => index < safeLength)
}
