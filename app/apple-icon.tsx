import { ImageResponse } from 'next/og'

export const contentType = 'image/png'

export const size = {
  width: 180,
  height: 180,
}

export default function AppleIcon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: '#0f172a',
          color: '#67e8f9',
          borderRadius: 36,
          fontSize: 42,
          fontWeight: 900,
          letterSpacing: '0.02em',
        }}
      >
        AFEX
      </div>
    ),
    size
  )
}
