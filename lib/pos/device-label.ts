export type PosDeviceCategory = 'كمبيوتر' | 'جهاز لوحي' | 'جوال' | 'جهاز غير معروف'
export type PosBrowserFamily = 'Chrome' | 'Safari' | 'Firefox' | 'Edge' | 'متصفح غير معروف'

export function classifyPosDevice(userAgent: string, touchPoints = 0) {
  const agent = userAgent.trim()
  const isTablet = /iPad|Tablet|PlayBook|Silk/i.test(agent) || (/Macintosh/i.test(agent) && touchPoints > 1)
  const isMobile = /Mobi|Android|iPhone|iPod/i.test(agent) && !isTablet
  const isDesktop = /Windows|Macintosh|Linux|CrOS/i.test(agent) && !isTablet && !isMobile
  const category: PosDeviceCategory = isTablet
    ? 'جهاز لوحي'
    : isMobile
      ? 'جوال'
      : isDesktop
        ? 'كمبيوتر'
        : 'جهاز غير معروف'

  const browser: PosBrowserFamily = /Edg\//i.test(agent)
    ? 'Edge'
    : /CriOS|Chrome\//i.test(agent)
      ? 'Chrome'
      : /FxiOS|Firefox\//i.test(agent)
        ? 'Firefox'
        : /Safari\//i.test(agent) && !/Chrome|Chromium|CriOS|Android/i.test(agent)
          ? 'Safari'
          : 'متصفح غير معروف'

  return browser === 'متصفح غير معروف' && category === 'جهاز غير معروف'
    ? category
    : `${category} • ${browser}`
}

export function getCurrentPosDeviceLabel() {
  if (typeof navigator === 'undefined') return 'جهاز غير معروف'
  return classifyPosDevice(navigator.userAgent, navigator.maxTouchPoints)
}
