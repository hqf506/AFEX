import path from 'node:path'
import { fileURLToPath } from 'node:url'
import type { NextConfig } from 'next'

const projectRoot = path.dirname(fileURLToPath(import.meta.url))

const nextConfig: NextConfig = {
  allowedDevOrigins: ['192.168.8.56', 'http://192.168.8.56:3000'],
  turbopack: {
    root: projectRoot,
  },
}

export default nextConfig
