import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

import { notifyPersistedOrderStatusTransition } from '../lib/orders/order-status-whatsapp.ts'
import { transitionOrderStatus } from '../lib/server/orders/order-status-transition.ts'

const routeSource = readFileSync('app/api/pos/orders/[id]/status/route.ts', 'utf8')
const pageSource = readFileSync('app/pos/order-status/page.tsx', 'utf8')
const serverSource = readFileSync('lib/server/orders/order-status-whatsapp.ts', 'utf8')
const messagesSource = readFileSync('lib/whatsapp/messages.ts', 'utf8')
const serviceSource = readFileSync('lib/whatsapp/service.ts', 'utf8')

const authority = {
  tenantId: 'tenant-a',
  branchId: 'branch-a',
  actorId: 'actor-a',
  actorRole: 'employee',
  canWriteOrders: true,
}

function createHarness(options = {}) {
  let persisted = {
    id: 'order-a',
    orderNumber: '02-0048',
    tenantId: 'tenant-a',
    branchId: 'branch-a',
    status: options.status || 'in_progress',
  }
  const events = []
  const sends = []
  const notificationAudits = []
  const transitionAudits = []
  const transitionGateway = {
    async loadOrder(input) {
      events.push('load-order')
      if (!persisted || persisted.id !== input.orderId || persisted.tenantId !== input.tenantId) return null
      return { ...persisted }
    },
    async compareAndSetStatus(input) {
      events.push('persist-status')
      if (options.zeroRow) return { outcome: 'not_updated' }
      if (persisted.status !== input.currentStatus) return { outcome: 'not_updated' }
      persisted = { ...persisted, status: input.targetStatus }
      return { outcome: 'updated', order: { ...persisted } }
    },
    async recordAudit(input) {
      events.push('status-audit')
      transitionAudits.push(input)
    },
  }
  const notificationGateway = {
    async loadContext() {
      events.push('load-notification-context')
      if (options.contextThrows) throw new Error('raw context error')
      if (options.contextMissing) return null
      return {
        orderId: persisted.id,
        persistedStatus: persisted.status,
        orderNumber: persisted.orderNumber,
        customerName: 'عميل اختبار',
        customerPhone: options.phone === undefined ? '0566118082' : options.phone,
        branchName: 'الفرع',
        storeName: 'AFEX',
        mapUrl: 'https://example.invalid/map',
        total: 276,
        enabled: options.enabled !== false,
        readyTemplate: options.readyTemplate || null,
        deliveredTemplate: options.deliveredTemplate || null,
      }
    },
    isPhoneValid(phone) {
      return options.phoneValid === false ? false : /^05\d{8}$/.test(phone)
    },
    buildText(context, targetStatus) {
      events.push(`build-${targetStatus}`)
      return targetStatus === 'ready'
        ? `READY:${context.orderNumber}`
        : `DELIVERED:${context.orderNumber}`
    },
    async sendText(input) {
      events.push('provider-send')
      sends.push(input)
      if (options.providerThrows) throw new Error('raw provider response and secret')
      return {
        success: options.providerSuccess !== false,
        providerKey: 'ultramsg',
        providerStatus: options.providerSuccess === false ? 'failed' : 'sent',
      }
    },
    async recordAudit(input) {
      events.push(`notification-audit-${input.classification}`)
      notificationAudits.push(input)
      if (options.auditThrows) throw new Error('audit unavailable')
    },
  }

  async function execute(targetStatus = persisted.status === 'in_progress' ? 'ready' : 'closed', overrideAuthority = authority) {
    const previousStatus = targetStatus === 'ready' ? 'in_progress' : 'ready'
    const transition = await transitionOrderStatus({
      orderId: 'order-a',
      targetStatus,
      authority: overrideAuthority,
    }, transitionGateway)
    const notification = await notifyPersistedOrderStatusTransition({
      tenantId: authority.tenantId,
      branchId: authority.branchId,
      orderId: 'order-a',
      previousStatus,
      targetStatus,
    }, transition, notificationGateway)
    return { transition, notification }
  }

  return {
    execute,
    events,
    sends,
    transitionAudits,
    notificationAudits,
    status: () => persisted.status,
  }
}

test('1 in_progress to ready persists before sending the ready notification', async () => {
  const run = createHarness()
  const result = await run.execute('ready')
  assert.equal(result.transition.classification, 'ORDER_STATUS_UPDATED')
  assert.equal(result.notification.classification, 'WHATSAPP_SENT')
  assert.equal(run.sends[0].notificationType, 'order_ready')
  assert.ok(run.events.indexOf('persist-status') < run.events.indexOf('provider-send'))
})

test('2 ready to closed persists before sending the delivered notification', async () => {
  const run = createHarness({ status: 'ready' })
  const result = await run.execute('closed')
  assert.equal(result.notification.classification, 'WHATSAPP_SENT')
  assert.equal(run.sends[0].notificationType, 'order_delivered')
  assert.match(run.sends[0].text, /^DELIVERED:/)
})

test('3 unauthorized transition sends nothing', async () => {
  const run = createHarness()
  const result = await run.execute('ready', { ...authority, canWriteOrders: false })
  assert.equal(result.transition.classification, 'ORDER_STATUS_FORBIDDEN')
  assert.equal(result.notification.classification, 'STATUS_NOT_PERSISTED')
  assert.equal(run.sends.length, 0)
})

test('4 invalid lifecycle transition sends nothing', async () => {
  const run = createHarness()
  const result = await run.execute('closed')
  assert.equal(result.transition.classification, 'ORDER_STATUS_TRANSITION_INVALID')
  assert.equal(run.sends.length, 0)
})

test('5 CAS zero-row result sends nothing', async () => {
  const run = createHarness({ zeroRow: true })
  const result = await run.execute('ready')
  assert.equal(result.transition.classification, 'ORDER_STATUS_STALE')
  assert.equal(run.sends.length, 0)
})

test('6 an already-target status sends nothing', async () => {
  const run = createHarness({ status: 'ready' })
  const result = await run.execute('ready')
  assert.equal(result.transition.classification, 'ORDER_STATUS_ALREADY_APPLIED')
  assert.equal(result.notification.classification, 'ALREADY_APPLIED_NO_RESEND')
  assert.equal(run.sends.length, 0)
})

test('7 repeated request cannot duplicate the notification after the CAS winner', async () => {
  const run = createHarness()
  const first = await run.execute('ready')
  const retry = await run.execute('ready')
  assert.equal(first.notification.classification, 'WHATSAPP_SENT')
  assert.equal(retry.notification.classification, 'ALREADY_APPLIED_NO_RESEND')
  assert.equal(run.sends.length, 1)
})

test('8 missing phone persists status and skips notification', async () => {
  const run = createHarness({ phone: '' })
  const result = await run.execute('ready')
  assert.equal(run.status(), 'ready')
  assert.deepEqual(result.notification, { outcome: 'skipped', classification: 'PHONE_UNAVAILABLE' })
  assert.equal(run.sends.length, 0)
})

test('9 invalid phone persists status without provider invocation', async () => {
  const run = createHarness({ phone: '123', phoneValid: false })
  const result = await run.execute('ready')
  assert.equal(run.status(), 'ready')
  assert.equal(result.notification.classification, 'PHONE_UNAVAILABLE')
  assert.equal(run.sends.length, 0)
})

test('10 provider failure preserves persisted status and returns partial success', async () => {
  const run = createHarness({ providerSuccess: false })
  const result = await run.execute('ready')
  assert.equal(run.status(), 'ready')
  assert.equal(result.transition.ok, true)
  assert.deepEqual(result.notification, { outcome: 'failed', classification: 'WHATSAPP_DELIVERY_FAILED' })
})

test('11 thrown provider error is redacted to the same safe partial-success result', async () => {
  const run = createHarness({ providerThrows: true })
  const result = await run.execute('ready')
  assert.equal(JSON.stringify(result).includes('raw provider'), false)
  assert.equal(result.notification.classification, 'WHATSAPP_DELIVERY_FAILED')
})

test('12 missing authoritative notification context never reaches the provider', async () => {
  const run = createHarness({ contextMissing: true })
  const result = await run.execute('ready')
  assert.equal(result.notification.classification, 'WHATSAPP_DELIVERY_FAILED')
  assert.equal(run.sends.length, 0)
})

test('13 disabled tenant communication preserves status and records a safe skip', async () => {
  const run = createHarness({ enabled: false })
  const result = await run.execute('ready')
  assert.equal(run.status(), 'ready')
  assert.equal(result.notification.classification, 'WHATSAPP_DISABLED')
  assert.equal(run.notificationAudits[0].action, 'whatsapp.message_skipped')
})

test('14 notification audit failure cannot reverse delivery or status', async () => {
  const run = createHarness({ auditThrows: true })
  const result = await run.execute('ready')
  assert.equal(run.status(), 'ready')
  assert.equal(result.notification.classification, 'WHATSAPP_SENT')
})

test('15 concurrent requests produce one CAS winner and at most one send', async () => {
  const run = createHarness()
  const results = await Promise.all([run.execute('ready'), run.execute('ready')])
  assert.equal(results.filter((item) => item.notification.classification === 'WHATSAPP_SENT').length, 1)
  assert.equal(run.sends.length, 1)
})

test('16 trusted server context loads order customer settings and branch within tenant and branch', () => {
  assert.match(serverSource, /from\('orders'\)[\s\S]*?eq\('tenant_id', input\.tenantId\)[\s\S]*?eq\('branch_id', input\.branchId\)/)
  assert.match(serverSource, /customers \(name, phone\)/)
  assert.match(serverSource, /whatsapp_order_ready_message_template, whatsapp_order_delivered_message_template/)
  assert.doesNotMatch(routeSource, /body\.(tenant|branch|employee|phone|template|provider)/)
})

test('17 approved templates builders phone normalization and provider service are reused', () => {
  assert.match(serverSource, /applyOrderStatusWhatsAppTemplate/)
  assert.match(serverSource, /buildReadyOrderStatusWhatsAppMessage/)
  assert.match(serverSource, /buildDeliveredOrderStatusWhatsAppMessage/)
  assert.match(serverSource, /isSendableWhatsAppPhone/)
  assert.match(serverSource, /sendWhatsAppText/)
  assert.match(messagesSource, /normalizeSaudiCustomerPhone/)
  assert.match(serviceSource, /getBranchWhatsAppProviderConfig/)
})

test('18 response and client expose only classified outcomes and no raw provider data or phone', () => {
  assert.match(routeSource, /notification,/)
  assert.doesNotMatch(routeSource, /providerMessageId|customerPhone|raw:/)
  assert.doesNotMatch(pageSource, /providerMessageId|customerPhone|raw provider/)
  assert.match(pageSource, /WHATSAPP_DELIVERY_FAILED|PHONE_UNAVAILABLE|WHATSAPP_SENT/)
})

test('19 provider failure keeps the list workspace and shows the approved Arabic partial-success message', () => {
  assert.match(pageSource, /تم تحديث حالة الطلب، لكن تعذر إرسال إشعار واتساب للعميل/)
  assert.match(pageSource, /تم تحديث حالة الطلب، ولا يوجد رقم جوال صالح لإرسال إشعار واتساب/)
  assert.doesNotMatch(pageSource, /setOrders\(\[\]\)/)
  assert.match(pageSource, /data-order-status-inline-details/)
})

test('20 browser uses only the trusted transition route and has no WhatsApp or Supabase mutation', () => {
  const advance = pageSource.slice(pageSource.indexOf('const advance'), pageSource.indexOf('if (access.loading'))
  assert.match(advance, /fetch\(`\/api\/pos\/orders\/\$\{encodeURIComponent\(order\.id\)\}\/status`/)
  assert.doesNotMatch(advance, /api\/whatsapp|supabase\.from|sendWhatsApp/)
  assert.match(routeSource, /sendPersistedOrderStatusWhatsApp/)
  assert.match(routeSource, /ORDER_STATUS_UPDATED/)
})
