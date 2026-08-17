export const POS_ORDER_HISTORY_HOURS = 48
export const POS_ORDER_HISTORY_WINDOW_MS =
  POS_ORDER_HISTORY_HOURS * 60 * 60 * 1000

export function getPosOrderHistoryCutoffIso(serverNowMs = Date.now()) {
  return new Date(serverNowMs - POS_ORDER_HISTORY_WINDOW_MS).toISOString()
}
export function isInsidePosOrderHistoryWindow(
  createdAt: string,
  serverNowMs: number
) {
  const createdAtMs = Date.parse(createdAt)
  return Number.isFinite(createdAtMs) &&
    createdAtMs > serverNowMs - POS_ORDER_HISTORY_WINDOW_MS &&
    createdAtMs <= serverNowMs
}
