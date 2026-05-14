'use client'

import { useMemo, useRef, useState } from 'react'
import { supabase } from '@/lib/supabase/client'
import {
  calculateInvoiceSubtotal,
  parseCashReceivedAmount,
  type CreatedInvoiceRecord,
  type InvoiceLineItem,
} from '@/lib/invoices/items'
import {
  isReceivedAmountEditable,
  normalizeUiPaymentMethod,
  toApiPaymentMethod,
  type PosPaymentMethod,
} from '@/lib/invoices/payment-method'
import {
  buildInvoiceSuccessSnapshot,
  type InvoiceSuccessSnapshot,
} from '@/lib/invoices/success'
import {
  createPosClientIdempotencyKey,
  savePosOfflineInvoiceDraft,
} from '@/lib/pos-offline-draft'
import { readActivePosEmployee } from '@/lib/pos-employee-session'
import { useAuthState } from '@/components/auth-state-provider'

export type CheckoutDiscountOption = {
  id: string
  name: string
  type: 'percentage' | 'fixed'
  value: number
  branch_id: string | null
}

export type CheckoutVatSetting = {
  id: string
  name: string
  rate: number
  is_active: boolean
  branch_id: string | null
}

type UseInvoiceCheckoutOptions = {
  customerName: string
  customerPhone: string
  invoiceItems: InvoiceLineItem[]
  hasInvalidBranchContext: boolean
  hasAmbiguousAdminBranchContext: boolean
  vatSetting?: CheckoutVatSetting | null
  onInvoiceCreated?: (
    result: CreatedInvoiceRecord,
    successSnapshot: InvoiceSuccessSnapshot
  ) => void
}

export function useInvoiceCheckout({
  customerName,
  customerPhone,
  invoiceItems,
  hasInvalidBranchContext,
  hasAmbiguousAdminBranchContext,
  vatSetting = null,
  onInvoiceCreated,
}: UseInvoiceCheckoutOptions) {
  const authState = useAuthState()
  const tenantId = authState.profile?.tenant_id || null
  const [paymentMethod, setPaymentMethodState] =
    useState<PosPaymentMethod>('mada')
  const [selectedDiscount, setSelectedDiscountState] =
    useState<CheckoutDiscountOption | null>(null)
  const [note, setNote] = useState('')
  const [cashReceivedInput, setCashReceivedInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [successMessage, setSuccessMessage] = useState('')
  const [errorMessage, setErrorMessage] = useState('')
  const [offlineDraftMessage, setOfflineDraftMessage] = useState('')
  const [lastInvoiceNumber, setLastInvoiceNumber] = useState('')
  const [lastOrderNumber, setLastOrderNumber] = useState('')
  const clientIdempotencyKeyRef = useRef('')

  const subtotal = useMemo(() => {
    return calculateInvoiceSubtotal(invoiceItems)
  }, [invoiceItems])

  const discountAmount = useMemo(() => {
    if (selectedDiscount) {
      if (selectedDiscount.type === 'percentage') {
        return subtotal * (selectedDiscount.value / 100)
      }

      return Math.min(subtotal, selectedDiscount.value)
    }

    return 0
  }, [selectedDiscount, subtotal])

  const taxableBase = useMemo(() => {
    return subtotal - discountAmount
  }, [subtotal, discountAmount])

  const vatRate = useMemo(() => {
    return vatSetting?.is_active ? Number(vatSetting.rate) || 0 : 0
  }, [vatSetting])

  const vatEnabled = vatRate > 0

  const taxAmount = useMemo(() => {
    return taxableBase * (vatRate / 100)
  }, [taxableBase, vatRate])

  const finalTotal = useMemo(() => {
    return taxableBase + taxAmount
  }, [taxableBase, taxAmount])

  const receivedAmountEditable = useMemo(() => {
    return isReceivedAmountEditable(paymentMethod)
  }, [paymentMethod])

  const cashReceived = useMemo(() => {
    const safePaymentMethod = normalizeUiPaymentMethod(paymentMethod)

    if (safePaymentMethod === 'mada' || safePaymentMethod === 'visa') {
      return finalTotal.toFixed(2)
    }

    if (safePaymentMethod === 'cod') {
      return '0'
    }

    return cashReceivedInput
  }, [cashReceivedInput, finalTotal, paymentMethod])

  const numericCashReceived = useMemo(() => {
    const safePaymentMethod = normalizeUiPaymentMethod(paymentMethod)

    if (safePaymentMethod === 'mada' || safePaymentMethod === 'visa') {
      return finalTotal
    }

    if (safePaymentMethod === 'cod') {
      return 0
    }

    return parseCashReceivedAmount(cashReceivedInput)
  }, [cashReceivedInput, finalTotal, paymentMethod])

  const remainingFromCustomer = useMemo(() => {
    const safePaymentMethod = normalizeUiPaymentMethod(paymentMethod)

    if (safePaymentMethod === 'cod') {
      return finalTotal
    }

    if (safePaymentMethod !== 'cash') {
      return 0
    }

    return Math.max(finalTotal - numericCashReceived, 0)
  }, [paymentMethod, finalTotal, numericCashReceived])

  const cashChange = useMemo(() => {
    const safePaymentMethod = normalizeUiPaymentMethod(paymentMethod)

    if (safePaymentMethod !== 'cash') {
      return 0
    }

    return Math.max(numericCashReceived - finalTotal, 0)
  }, [paymentMethod, numericCashReceived, finalTotal])

  const setSelectedDiscount = (value: CheckoutDiscountOption | null) => {
    setSelectedDiscountState(value)
  }

  const setPaymentMethod = (value: PosPaymentMethod) => {
    const safePaymentMethod = normalizeUiPaymentMethod(value)

    setPaymentMethodState(safePaymentMethod)
    setCashReceivedInput((currentValue) => {
      if (safePaymentMethod === 'mada' || safePaymentMethod === 'visa') {
        return finalTotal.toFixed(2)
      }

      if (safePaymentMethod === 'cod') {
        return '0'
      }

      return parseCashReceivedAmount(currentValue) > 0
        ? currentValue
        : finalTotal.toFixed(2)
    })
  }

  const setCashReceived = (value: string) => {
    setCashReceivedInput(value)
  }

  const clearAppliedDiscount = () => {
    setSelectedDiscountState(null)
  }

  const clearCheckout = () => {
    clearAppliedDiscount()
    setNote('')
    setPaymentMethodState('mada')
    setCashReceivedInput('')
    clientIdempotencyKeyRef.current = ''
  }

  const getOrCreateClientIdempotencyKey = () => {
    if (!clientIdempotencyKeyRef.current) {
      clientIdempotencyKeyRef.current = createPosClientIdempotencyKey()
    }

    return clientIdempotencyKeyRef.current
  }

  const createInvoice = async () => {
    if (loading) return

    if (hasInvalidBranchContext) {
      setErrorMessage('لا يمكن إنشاء فاتورة لأن حسابك غير مرتبط بفرع صالح')
      return
    }

    if (hasAmbiguousAdminBranchContext) {
      setErrorMessage('اختر فرعًا محددًا قبل استخدام شاشة الفاتورة')
      return
    }

    if (invoiceItems.length === 0) {
      setErrorMessage('أضف عنصرًا واحدًا على الأقل')
      return
    }

    const safePaymentMethod = normalizeUiPaymentMethod(paymentMethod)

    if (safePaymentMethod === 'cash' && numericCashReceived <= 0) {
      setErrorMessage('اكتب المبلغ المستلم من العميل')
      return
    }

    setLoading(true)
    setErrorMessage('')
    setSuccessMessage('')
    setOfflineDraftMessage('')

    const invoiceItemsPayload = invoiceItems.map((item) => ({
      ...item,
      item_id:
        typeof item.item_id === 'string' && item.item_id.trim()
          ? item.item_id.trim()
          : null,
    }))

    const validItems = invoiceItemsPayload.filter(
      (item) =>
        typeof item.item_id === 'string' && item.item_id.trim().length > 0
    )

    if (validItems.length === 0) {
      setLoading(false)
      setErrorMessage('حدث خطأ في بيانات العناصر، الرجاء إعادة الإضافة')
      return
    }

    const clientIdempotencyKey = getOrCreateClientIdempotencyKey()
    const activePosEmployee = readActivePosEmployee()

    if (typeof navigator !== 'undefined' && navigator.onLine === false) {
      try {
        savePosOfflineInvoiceDraft({
          clientIdempotencyKey,
          customerName,
          customerPhone,
          paymentMethod: safePaymentMethod,
          note,
          items: validItems,
          totalsSnapshot: {
            subtotal,
            discountAmount,
            taxAmount,
            finalTotal,
            cashReceived,
            numericCashReceived,
            remainingFromCustomer,
            cashChange,
          },
          employee: activePosEmployee,
        })

        setOfflineDraftMessage('تم حفظ الفاتورة كمسودة بسبب انقطاع الاتصال')
        window.setTimeout(() => {
          setOfflineDraftMessage('')
        }, 5000)
      } catch (error) {
        console.error('[POS OFFLINE] Failed to save checkout draft.', error)
        setErrorMessage('تعذر حفظ الفاتورة كمسودة محلية')
      } finally {
        setLoading(false)
      }

      return
    }

    const createOrderResponse = await fetch('/api/orders', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        clientIdempotencyKey,
        employee_id: activePosEmployee?.id ?? null,
        branch_id: activePosEmployee?.branch_id ?? null,
        customerName,
        customerPhone,
        paymentMethod: toApiPaymentMethod(safePaymentMethod),
        discountAmount,
        taxAmount,
        note,
        items: validItems,
      }),
    })

    const createOrderResult = (await createOrderResponse
      .json()
      .catch(() => null)) as
      | {
          success?: boolean
          data?: CreatedInvoiceRecord
          error?: string
        }
      | null

    if (
      !createOrderResponse.ok ||
      !createOrderResult?.success ||
      !createOrderResult.data
    ) {
      setLoading(false)
      setErrorMessage(createOrderResult?.error || 'تعذر إنشاء الفاتورة')
      return
    }

    const result = createOrderResult.data

    if (result?.invoice_id) {
      if (!tenantId) {
        setLoading(false)
        setErrorMessage('ØªØ¹Ø°Ø± ØªØ­Ø¯ÙŠØ¯ Ù†Ø·Ø§Ù‚ Ø§Ù„Ù…Ù†Ø´Ø£Ø© Ù„Ø­ÙØ¸ Ø¨ÙŠØ§Ù†Ø§Øª Ø§Ù„Ø¯ÙØ¹')
        return
      }

      await supabase
        .from('invoices')
        .update({
          cash_received: safePaymentMethod === 'cash' ? numericCashReceived : 0,
          remaining_from_customer:
            safePaymentMethod === 'cash' ? remainingFromCustomer : 0,
          cash_change: safePaymentMethod === 'cash' ? cashChange : 0,
        })
        .eq('id', result.invoice_id)
        .eq('tenant_id', tenantId)

      await fetch('/api/invoices/cost-snapshot', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          invoice_id: result.invoice_id,
          items: validItems,
        }),
      })
    }

    setLastInvoiceNumber(result?.invoice_number || '')
    setLastOrderNumber(result?.order_number || '')
    setSuccessMessage(`تم إنشاء الفاتورة ${result?.invoice_number || ''} بنجاح`)

    onInvoiceCreated?.(
      result,
      buildInvoiceSuccessSnapshot({
        result,
        customerName,
        customerPhone,
        subtotal,
        discount: discountAmount,
        tax: taxAmount,
        finalTotal,
        paymentMethod: safePaymentMethod,
        numericCashReceived,
        remainingFromCustomer,
        cashChange,
        note,
        invoiceItems,
        shouldAutoPrintThermal: true,
      })
    )

    setLoading(false)

    setTimeout(() => {
      setSuccessMessage('')
    }, 4000)
  }

  return {
    paymentMethod,
    setPaymentMethod,
    selectedDiscount,
    setSelectedDiscount,
    clearAppliedDiscount,
    vatRate,
    vatEnabled,
    note,
    setNote,
    cashReceived,
    setCashReceived,
    isReceivedAmountEditable: receivedAmountEditable,
    loading,
    successMessage,
    errorMessage,
    offlineDraftMessage,
    lastInvoiceNumber,
    lastOrderNumber,
    subtotal,
    discountAmount,
    taxableBase,
    taxAmount,
    finalTotal,
    numericCashReceived,
    remainingFromCustomer,
    cashChange,
    clearCheckout,
    createInvoice,
  }
}
