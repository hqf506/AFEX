import type { CapacitorConfig } from '@capacitor/cli'

const isProduction = process.env.NODE_ENV === 'production'
const posAppUrl = isProduction
  ? process.env.NEXT_PUBLIC_POS_APP_URL || 'http://localhost:3000/pos'
  : 'http://10.0.2.2:3000/pos'
const allowCleartextTraffic =
  !isProduction && posAppUrl.startsWith('http://')

const config: CapacitorConfig = {
  appId: 'com.afex.pos',
  appName: 'AFEX POS',
  webDir: 'capacitor-web',
  server: {
    url: posAppUrl,
    cleartext: allowCleartextTraffic,
  },
  ios: {
    backgroundColor: '#0f172a',
    contentInset: 'never',
    allowsLinkPreview: false,
    preferredContentMode: 'desktop',
  },
}

export default config
