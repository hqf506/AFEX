import { NextRequest } from 'next/server'
import {
  getPrePinProvisioningContext,
  handlePrePinProvisioningRequest,
} from '@/lib/server/offline/pre-pin-provisioning'

export const dynamic = 'force-dynamic'

export async function GET() {
  return getPrePinProvisioningContext()
}

export async function POST(request: NextRequest) {
  return handlePrePinProvisioningRequest(request)
}
