import { ImageResponse } from 'next/og'

export const contentType = 'image/png'

export const size = {
  width: 512,
  height: 512,
}

export default function Icon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: 'linear-gradient(135deg, #0f172a 0%, #1e293b 100%)',
          color: '#67e8f9',
          fontSize: 112,
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
