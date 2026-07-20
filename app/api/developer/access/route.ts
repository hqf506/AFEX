import { NextResponse } from 'next/server'
import { requireDeveloperAccess } from '@/lib/developer/server'

export async function GET() {
  const access = await requireDeveloperAccess()
  return NextResponse.json({ allowed: access.ok }, { status: access.ok ? 200 : access.status, headers: { 'Cache-Control': 'no-store' } })
}
