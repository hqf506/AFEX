import { jsonResponse } from '@/lib/api/responses'

function goneResponse() {
  return jsonResponse(
    {
      success: false,
      error: 'هذا المسار قديم ومغلق. استخدم /api/whatsapp/send.',
    },
    410
  )
}

export async function GET() {
  return goneResponse()
}

export async function POST() {
  return goneResponse()
}
