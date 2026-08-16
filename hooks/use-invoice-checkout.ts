'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import {
  calculateInvoiceSubtotal,
  parseCashReceivedAmount,
  type CreatedInvoiceRecord,
  type InvoiceLineItem,
} from '@/lib/invoices/items'
import {
  isReceivedAmountEditable,
  normalizeUiPaymentMethod,
  type PosPaymentMethod,
} from '@/lib/invoices/payment-method'
import {
  buildInvoiceSuccessSnapshot,
  type InvoiceSuccessSnapshot,
} from '@/lib/invoices/success'
import { clearAllInvoiceCatalogCache } from '@/lib/invoices/catalog'
import { savePosOfflineInvoiceDraft } from '@/lib/pos-offline-draft'
import {
  acquirePosCheckoutIdentity,
  clearPosCheckoutIdentity,
  markPosCheckoutIdentitySucceeded,
} from '@/lib/pos-checkout-identity'
import { readActivePosEmployee } from '@/lib/pos-employee-session'
import { POS_UX_MESSAGES } from '@/lib/pos-ux-messages'
import { INVOICE_SALE_CHECKOUT_STORAGE_KEY, parseStoredInvoiceSaleCheckoutDraft, serializeInvoiceSaleCheckoutDraft } from '@/lib/invoices/sale-navigation'

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
  customerId: string | null
  customerName: string
  customerPhone: string
  invoiceItems: InvoiceLineItem[]
  hasInvalidBranchContext: boolean
  hasAmbiguousAdminBranchContext: boolean
  branchId: string | null
  vatSetting?: CheckoutVatSetting | null
  onInvoiceCreated?: (
    result: CreatedInvoiceRecord,
    successSnapshot: InvoiceSuccessSnapshot
  ) => void
  persistSaleDraft?: boolean
}

export function useInvoiceCheckout({
  customerId,
  customerName,
  customerPhone,
  invoiceItems,
  hasInvalidBranchContext,
  hasAmbiguousAdminBranchContext,
  branchId,
  vatSetting = null,
  onInvoiceCreated,
  persistSaleDraft = false,
}: UseInvoiceCheckoutOptions) {
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
  const saleDraftHydratedRef = useRef(!persistSaleDraft)

  useEffect(() => {
    if (!persistSaleDraft) return
    const stored = parseStoredInvoiceSaleCheckoutDraft(window.localStorage.getItem(INVOICE_SALE_CHECKOUT_STORAGE_KEY))
    if (!stored) {
      saleDraftHydratedRef.current = true
      return
    }
    const timer = window.setTimeout(() => {
      saleDraftHydratedRef.current = true
      setPaymentMethodState(stored.paymentMethod)
      setSelectedDiscountState(stored.selectedDiscount)
      setNote(stored.note)
      setCashReceivedInput(stored.cashReceivedInput)
    }, 0)
    return () => window.clearTimeout(timer)
  }, [persistSaleDraft])

  useEffect(() => {
    if (!persistSaleDraft || !saleDraftHydratedRef.current) return
    window.localStorage.setItem(INVOICE_SALE_CHECKOUT_STORAGE_KEY, serializeInvoiceSaleCheckoutDraft({ paymentMethod, selectedDiscount, note, cashReceivedInput }))
  }, [cashReceivedInput, note, paymentMethod, persistSaleDraft, selectedDiscount])

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
      return Math.min(
        Math.max(parseCashReceivedAmount(cashReceivedInput), 0),
        finalTotal
      ).toString()
    }

    return cashReceivedInput
  }, [cashReceivedInput, finalTotal, paymentMethod])

  const numericCashReceived = useMemo(() => {
    const safePaymentMethod = normalizeUiPaymentMethod(paymentMethod)

    if (safePaymentMethod === 'mada' || safePaymentMethod === 'visa') {
      return finalTotal
    }

    if (safePaymentMethod === 'cod') {
      return Math.min(
        Math.max(parseCashReceivedAmount(cashReceivedInput), 0),
        finalTotal
      )
    }

    return parseCashReceivedAmount(cashReceivedInput)
  }, [cashReceivedInput, finalTotal, paymentMethod])

  const remainingFromCustomer = useMemo(() => {
    const safePaymentMethod = normalizeUiPaymentMethod(paymentMethod)

    if (safePaymentMethod !== 'cash' && safePaymentMethod !== 'cod') {
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
    if (normalizeUiPaymentMethod(paymentMethod) !== 'cash') return

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
    clearPosCheckoutIdentity()
    if (persistSaleDraft && typeof window !== 'undefined') window.localStorage.removeItem(INVOICE_SALE_CHECKOUT_STORAGE_KEY)
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

    if (!customerName.trim() || !customerPhone.trim()) {
      setErrorMessage(POS_UX_MESSAGES.missingCustomer)
      return
    }

    if (invoiceItems.length === 0) {
      setErrorMessage(POS_UX_MESSAGES.noItems)
      return
    }

    const safePaymentMethod = normalizeUiPaymentMethod(paymentMethod)

    if (safePaymentMethod === 'cash' && numericCashReceived <= 0) {
      setErrorMessage(POS_UX_MESSAGES.invalidReceivedAmount)
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

    if (!branchId) {
      setLoading(false)
      setErrorMessage('اختر فرعًا محددًا قبل إتمام البيع')
      return
    }

    const activePosEmployee = readActivePosEmployee()
    let clientIdempotencyKey: string

    try {
      clientIdempotencyKey = (
        await acquirePosCheckoutIdentity({
          version: 1,
          customerId,
          branchId,
          paymentMethod: safePaymentMethod,
          cashReceived: numericCashReceived,
          remainingFromCustomer,
          cashChange,
          discountAmount,
          taxAmount,
          note,
          items: validItems.map((item) => ({
            itemId: item.item_id,
            quantity: item.quantity,
            unitPrice: item.unit_price,
          })),
        })
      ).requestId
    } catch {
      setLoading(false)
      setErrorMessage(POS_UX_MESSAGES.uncertainSubmission)
      return
    }

    if (typeof navigator !== 'undefined' && navigator.onLine === false) {
      try {
        savePosOfflineInvoiceDraft({
          clientIdempotencyKey,
          customerId,
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

        setOfflineDraftMessage(POS_UX_MESSAGES.draftSaved)
      } catch (error) {
        console.error('[POS OFFLINE] Failed to save checkout draft.', error)
        setErrorMessage(POS_UX_MESSAGES.draftSaveFailure)
      } finally {
        setLoading(false)
      }

      return
    }

    try {
      performance.mark('afex-checkout-request-dispatch')
      const createOrderResponse = await fetch('/api/orders', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        clientIdempotencyKey,
        customerId,
        employee_id: activePosEmployee?.id ?? null,
        branch_id: branchId,
        customerName,
        customerPhone,
        paymentMethod: safePaymentMethod,
        cashReceived: numericCashReceived,
        remainingFromCustomer,
        cashChange,
        discountAmount,
        taxAmount,
        note,
        items: validItems,
      }),
    })
      performance.mark('afex-checkout-response-received')

      const createOrderResult = (await createOrderResponse
      .json()
      .catch(() => null)) as
      | {
          success?: boolean
          data?: CreatedInvoiceRecord
          error?: string
          message?: string
          coreDisposition?: string
          duplicate?: boolean
        }
      | null

    if (
      !createOrderResponse.ok ||
      !createOrderResult?.success ||
      !createOrderResult.data
    ) {
        setErrorMessage(
          typeof createOrderResult?.message === 'string' &&
            createOrderResult.message.trim()
            ? createOrderResult.message
            : POS_UX_MESSAGES.orderFailure
        )
        return
      }

    const result = createOrderResult.data
    markPosCheckoutIdentitySucceeded(clientIdempotencyKey)
    performance.mark('afex-checkout-terminal-success')

    setLastInvoiceNumber(result?.invoice_number || '')
    setLastOrderNumber(result?.order_number || '')
      setSuccessMessage(
        createOrderResult.duplicate
          ? POS_UX_MESSAGES.duplicateSubmission
          : POS_UX_MESSAGES.orderSuccess
      )

    clearAllInvoiceCatalogCache()

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
        shouldAutoPrintThermal: createOrderResult.duplicate !== true,
      })
    )

    } catch {
      setErrorMessage(POS_UX_MESSAGES.uncertainSubmission)
    } finally {
      setLoading(false)
    }
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
