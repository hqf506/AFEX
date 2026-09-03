import { NextRequest } from 'next/server'
import { handleOfflineOrderCreatePilotRequest } from '@/lib/server/offline/order-create-pilot-transport'

export const dynamic = 'force-dynamic'

export async function POST(request: NextRequest) {
  return handleOfflineOrderCreatePilotRequest(request)
}
