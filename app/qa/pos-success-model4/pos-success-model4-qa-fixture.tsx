'use client'

import { PosInvoiceSuccessWorkspace } from '@/components/pos-invoice-success-workspace'
import workspaceStyles from '@/components/pos-invoice-success-workspace.module.css'
import type { InvoiceSuccessSnapshot } from '@/lib/invoices/success'
import styles from './pos-success-model4-qa-fixture.module.css'

const SYNTHETIC_SUCCESS_SNAPSHOT: InvoiceSuccessSnapshot = {
  invoiceNumber: 'QA-00-0000',
  orderNumber: 'QA-ORDER-0000',
  invoiceId: 'qa-fixture-invoice',
  orderId: 'qa-fixture-order',
  status: 'paid',
  customerName: 'عميل اختبار',
  customerPhone: '',
  subtotal: 240,
  discount: 0,
  tax: 36,
  finalTotal: 276,
  paymentMethod: 'mada',
  cashReceived: 0,
  numericCashReceived: 0,
  remainingFromCustomer: 0,
  cashChange: 0,
  note: 'بيانات اصطناعية لاختبار العرض فقط',
  createdAt: '2026-08-24T08:00:00.000Z',
  shouldAutoPrintThermal: false,
  invoiceItems: [
    {
      item_id: 'qa-service-1',
      item_name: 'خدمة اختبار اصطناعية',
      item_type: 'service',
      quantity: 1,
      unit_price: 140,
    },
    {
      item_id: 'qa-product-1',
      item_name: 'منتج اختبار اصطناعي',
      item_type: 'product',
      quantity: 1,
      unit_price: 100,
    },
  ],
}

type Props = {
  fixtureEnabled: boolean
}

const disabledFixtureAction = () => undefined

export function PosSuccessModel4QaFixture({ fixtureEnabled }: Props) {
  if (!fixtureEnabled) {
    return null
  }

  return (
    <div
      className={`${workspaceStyles.page} ${styles.fixtureRoot}`}
      data-success-qa-fixture
      data-fixture-business-actions="disabled"
    >
      <span className={styles.badge}>PREVIEW QA FIXTURE</span>
      <PosInvoiceSuccessWorkspace
        snapshot={SYNTHETIC_SUCCESS_SNAPSHOT}
        issuedAtLabel="24 أغسطس 2026، 11:00 ص"
        printing={false}
        printingEnabled={false}
        whatsappOpening={false}
        whatsappEnabled={false}
        actionMessage=""
        redirectCountdown={30}
        onPrint={disabledFixtureAction}
        onWhatsApp={disabledFixtureAction}
        onNewSale={disabledFixtureAction}
        onBackToPos={disabledFixtureAction}
      />
    </div>
  )
}
