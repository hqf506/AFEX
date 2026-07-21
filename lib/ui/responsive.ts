export const AFEX_BREAKPOINTS = {
  sm: 640,
  md: 768,
  lg: 1024,
  xl: 1280,
  '2xl': 1536,
} as const

export const AFEX_MEDIA_QUERIES = {
  phone: `(max-width: ${AFEX_BREAKPOINTS.md - 1}px)`,
  tablet: `(min-width: ${AFEX_BREAKPOINTS.md}px) and (max-width: ${AFEX_BREAKPOINTS.xl - 1}px)`,
  desktop: `(min-width: ${AFEX_BREAKPOINTS.xl}px)`,
} as const

export type AfexViewport = keyof typeof AFEX_MEDIA_QUERIES
