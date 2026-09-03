import { NextRequest } from 'next/server'
import {
  getPrePinProvisioningContext,
  handlePrePinClientDiagnosticRequest,
  handlePrePinProvisioningRequest,
} from '@/lib/server/offline/pre-pin-provisioning'

export const dynamic = 'force-dynamic'

export async function GET() {
  return getPrePinProvisioningContext()
}

export async function POST(request: NextRequest) {
  return handlePrePinProvisioningRequest(request)
}

export async function PUT(request: NextRequest) {
  return handlePrePinClientDiagnosticRequest(request)
}
