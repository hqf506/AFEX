import type { ThermalPaperWidth } from '@/lib/invoices/thermal-template'

const THERMAL_PREVIEW_WIDTHS: Record<ThermalPaperWidth, number> = {
  '58mm': 219,
  '80mm': 302,
}

export function getThermalPreviewWidth(paperWidth?: string): number {
  return THERMAL_PREVIEW_WIDTHS[paperWidth === '58mm' ? '58mm' : '80mm']
}

export function prepareThermalInvoicePreviewHtml(
  html: string,
  paperWidth?: string
): string {
  const width = getThermalPreviewWidth(paperWidth)

  return html.replace(
    '</head>',
    `
  <style>
    html,
    body {
      box-sizing: border-box !important;
      width: ${width}px !important;
      max-width: ${width}px !important;
      min-width: 0 !important;
      overflow-x: hidden !important;
      overflow-y: hidden !important;
    }

    .receipt {
      box-sizing: border-box !important;
      width: ${width}px !important;
      max-width: ${width}px !important;
      margin: 0 !important;
    }

    .receipt img {
      max-width: 100% !important;
    }
  </style>
</head>`
  )
}

export function fitThermalPreviewIframe(
  iframe: HTMLIFrameElement,
  setHeight: (height: number) => void
) {
  const measure = () => {
    if (!iframe.isConnected) return

    const frameDocument = iframe.contentDocument
    const documentElement = frameDocument?.documentElement
    const body = frameDocument?.body
    const measuredHeight = Math.max(
      documentElement?.scrollHeight || 0,
      body?.scrollHeight || 0,
      documentElement?.offsetHeight || 0,
      body?.offsetHeight || 0
    )

    if (measuredHeight > 0) {
      setHeight(Math.ceil(measuredHeight))
    }
  }

  measure()
  window.requestAnimationFrame(() => {
    measure()
    window.requestAnimationFrame(measure)
  })
  window.setTimeout(measure, 80)
  window.setTimeout(measure, 250)

  const frameDocument = iframe.contentDocument
  void frameDocument?.fonts?.ready.then(measure).catch(() => undefined)

  for (const image of Array.from(frameDocument?.images || [])) {
    if (image.complete) continue
    image.addEventListener('load', measure, { once: true })
    image.addEventListener('error', measure, { once: true })
  }
}
