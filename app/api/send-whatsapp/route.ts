import { NextRequest } from 'next/server'
import { jsonResponse } from '@/lib/api/responses'
import { getTrimmedString } from '@/lib/api/validation'

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()

    const {
      phone,
      customerName,
      invoiceNumber,
      orderNumber,
      total,
    }: {
      phone?: string
      customerName?: string
      invoiceNumber?: string
      orderNumber?: string
      total?: number
    } = body

    const normalizedPhone = getTrimmedString(phone)

    if (!normalizedPhone) {
      return jsonResponse(
        { success: false, error: 'Phone is required' }, 400)
    }

    const token = process.env.ULTRAMSG_TOKEN
    const apiUrl = process.env.ULTRAMSG_API_URL

    if (!token || !apiUrl) {
      return jsonResponse(
        {
          success: false,
          error: 'Missing ULTRAMSG env vars',
          debug: {
            hasToken: Boolean(token),
            hasApiUrl: Boolean(apiUrl),
          },
        }, 500)
    }

    const cleanPhone = normalizedPhone.replace(/\D/g, '')

    const message =
      `مرحبًا ${customerName || 'عميلنا العزيز'}\n` +
      `تم إنشاء فاتورتك بنجاح لدى Leather Fix ERP.\n` +
      `رقم الفاتورة: ${invoiceNumber || '—'}\n` +
      `رقم الطلب: ${orderNumber || '—'}\n` +
      `الإجمالي: ${total ?? 0} ر.س\n` +
      `شكرًا لتعاملك معنا.`

    const response = await fetch(`${apiUrl}/messages/chat`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        token,
        to: cleanPhone,
        body: message,
      }),
    })

    const result = await response.json().catch(() => null)

    if (!response.ok) {
      return jsonResponse(
        {
          success: false,
          error: result || 'UltraMsg request failed',
          status: response.status,
        }, 500)
    }

    return jsonResponse({
      success: true,
      result,
    })
  } catch (error) {
    return jsonResponse(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      }, 500)
  }
}
