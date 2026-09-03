import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import {
  buildSelectedCustomerProfile,
  getCustomerPhoneSearchInput,
  isCurrentCustomerProfileResponse,
  isCurrentCustomerSearchResponse,
  isSelectedCustomerProfile,
  resolveCustomerCreateResponse,
  validateSaudiCustomerPhone,
} from '../lib/customers.ts'

const routeSource = readFileSync('app/api/customers/route.ts', 'utf8')
const customerStepSource = readFileSync('components/invoice-customer-step.tsx', 'utf8')
const modalSource = readFileSync('components/pos-add-customer-modal.tsx', 'utf8')
const workspaceSource = readFileSync('components/pos-customer-workspace.tsx', 'utf8')
const profileRouteSource = readFileSync('app/api/customers/[customerId]/route.ts', 'utf8')
const cacheSource = readFileSync('lib/client-resource-cache.ts', 'utf8')
const cssSource = readFileSync('app/globals.css', 'utf8')

test('all supported Saudi phone representations normalize to one identity', () => {
  for (const value of [
    '0512345678',
    '512345678',
    '966512345678',
    '+966512345678',
    '05 123-45678',
    '٠٥١٢٣٤٥٦٧٨',
  ]) {
    assert.equal(getCustomerPhoneSearchInput(value).normalizedPhone, '966512345678')
  }
})

test('phone search strips separators and Arabic digits before applying its minimum length', () => {
  const search = getCustomerPhoneSearchInput('٠٥ ١٢-٣')
  assert.equal(search.digits, '05123')
  assert.equal(search.digits.length >= 3, true)
  assert.equal(getCustomerPhoneSearchInput('٠٥').digits.length >= 3, false)
})

test('valid customer phone inputs remain valid after normalization', () => {
  assert.equal(validateSaudiCustomerPhone('+966 512-345-678').valid, true)
  assert.equal(validateSaudiCustomerPhone('٠٥١٢٣٤٥٦٧٨').valid, true)
  assert.equal(validateSaudiCustomerPhone('441234').valid, false)
})

test('only the newest search request may update mobile results', () => {
  assert.equal(isCurrentCustomerSearchResponse(5, 5), true)
  assert.equal(isCurrentCustomerSearchResponse(4, 5), false)
})

test('a successful customer response is the sole path that carries a selected customer', () => {
  const result = resolveCustomerCreateResponse({
    httpStatus: 201,
    payload: { success: true, customer: { id: 'customer-1' } },
  })
  assert.equal(result.ok, true)
  if (result.ok) assert.equal(result.customer.id, 'customer-1')
})

test('duplicate phone responses remain field-specific and never select a customer', () => {
  const result = resolveCustomerCreateResponse({
    httpStatus: 409,
    payload: { success: false, code: 'CUSTOMER_PHONE_CONFLICT' },
  })
  assert.equal(result.ok, false)
  if (!result.ok) {
    assert.equal(result.failure.code, 'CUSTOMER_PHONE_CONFLICT')
    assert.equal(result.failure.phoneField, true)
  }
})

test('validation failures are safely classified without exposing upstream diagnostics', () => {
  const result = resolveCustomerCreateResponse({
    httpStatus: 400,
    payload: { success: false, code: 'CUSTOMER_VALIDATION_FAILED' },
  })
  assert.equal(result.ok, false)
  if (!result.ok) assert.equal(result.failure.code, 'CUSTOMER_VALIDATION_FAILED')
})

test('API and network failures do not yield a created customer', () => {
  for (const input of [
    { httpStatus: 500, payload: { success: false, code: 'CUSTOMER_PERSISTENCE_FAILED' } },
    { httpStatus: 0, payload: null },
  ]) {
    const result = resolveCustomerCreateResponse(input)
    assert.equal(result.ok, false)
  }
})

test('server customer lookup preserves tenant filtering for normalized and legacy phone paths', () => {
  assert.match(routeSource, /normalizedQuery = applyTenantFilter\(normalizedQuery, tenantId\)/)
  assert.match(routeSource, /legacyQuery = applyTenantFilter\(legacyQuery, tenantId\)/)
  assert.match(routeSource, /query = applyTenantFilter\(query, auth\.profile\.tenant_id\)/)
})

test('phone lookup uses the authenticated server route rather than a browser RPC', () => {
  assert.doesNotMatch(customerStepSource, /lookup_customer_phone_identity_v1/)
  assert.match(customerStepSource, /fetch\(\s*`\/api\/customers\?\$\{searchParams\.toString\(\)\}`/)
})

test('modal blocks duplicate submission and calls onCreated only after an accepted response', () => {
  assert.match(modalSource, /if \(saving\) return/)
  assert.match(modalSource, /if \(!creation\.ok\)/)
  assert.match(modalSource, /onCreated\(creation\.customer\)/)
  assert.doesNotMatch(modalSource, /onCreated\(result\.customer/)
})

test('mobile customer controls retain telephone keyboard behavior and explicit empty results', () => {
  assert.match(workspaceSource, /type="tel"/)
  assert.match(workspaceSource, /inputMode="tel"/)
  assert.match(workspaceSource, /لا توجد نتائج مطابقة/)
})

test('authorized customer profile preserves factual fields and metrics', () => {
  const profile = buildSelectedCustomerProfile(
    {
      id: '00000000-0000-4000-8000-000000000001',
      customer_code: 'C-0192',
      name: 'عميل اختبار',
      display_phone: '0512345678',
      email: 'customer@example.test',
      city: 'الرياض',
      address: 'عنوان مصرح',
      notes: 'ملاحظة مصرح بها',
      created_at: '2026-08-20T08:00:00Z',
    },
    {
      visitCount: 3,
      totalSpending: 276,
      lastOrderNumber: '02-0012',
      lastOrderAt: '2026-08-20T08:30:00Z',
    }
  )

  assert.equal(profile?.customerNumber, 'C-0192')
  assert.equal(profile?.visitCount, 3)
  assert.equal(profile?.totalSpending, 276)
  assert.equal(isSelectedCustomerProfile(profile), true)
})

test('missing profile fields stay null and never fall back to a UUID customer number', () => {
  const id = '00000000-0000-4000-8000-000000000002'
  const profile = buildSelectedCustomerProfile(
    { id, name: 'عميل', phone: '0512345678' },
    { visitCount: null, totalSpending: null, lastOrderNumber: null, lastOrderAt: null }
  )
  assert.equal(profile?.customerNumber, null)
  assert.equal(profile?.email, null)
  assert.notEqual(profile?.customerNumber, id)
})

test('invalid or negative customer activity is hidden instead of fabricated', () => {
  const profile = buildSelectedCustomerProfile(
    { id: 'customer-3', name: 'عميل', phone: '0512345678' },
    { visitCount: -1, totalSpending: Number.NaN, lastOrderNumber: null, lastOrderAt: null }
  )
  assert.equal(profile?.visitCount, null)
  assert.equal(profile?.totalSpending, null)
})

test('only the newest selected-customer profile request may update the panel', () => {
  assert.equal(isCurrentCustomerProfileResponse(7, 7), true)
  assert.equal(isCurrentCustomerProfileResponse(6, 7), false)
  assert.match(customerStepSource, /customerProfileAbortRef\.current\?\.abort\(\)/)
  assert.match(customerStepSource, /signal: controller\.signal/)
})

test('selected profile endpoint derives authority from the authenticated tenant', () => {
  assert.match(profileRouteSource, /const tenantId = auth\.profile\.tenant_id/)
  assert.match(profileRouteSource, /customerQuery = applyTenantFilter\(customerQuery, tenantId\)/)
  assert.match(profileRouteSource, /activityQuery = applyTenantFilter\(activityQuery, tenantId\)/)
  assert.match(profileRouteSource, /orderQuery = applyTenantFilter\(orderQuery, tenantId\)/)
  assert.doesNotMatch(profileRouteSource, /searchParams|get\(['"]tenant|get\(['"]branch/)
})

test('selected profile endpoint fails closed for invalid or unauthorized identifiers', () => {
  assert.match(profileRouteSource, /if \(!isUuid\(customerId\)\)/)
  assert.match(profileRouteSource, /CUSTOMER_PROFILE_NOT_FOUND/)
  assert.match(profileRouteSource, /404/)
  assert.match(profileRouteSource, /requireApiAuth\(request, \['admin', 'employee', 'cashier'\]\)/)
})

test('selected profile response is allowlisted and carries no raw database diagnostics', () => {
  assert.match(profileRouteSource, /CUSTOMER_PROFILE_SELECT/)
  assert.match(profileRouteSource, /private, no-store/)
  assert.doesNotMatch(profileRouteSource, /error\.message|error\.details|phone:\s*customer|email:\s*customer/)
  assert.match(profileRouteSource, /upstreamCode:/)
  assert.match(profileRouteSource, /correlationId:/)
})

test('profile loading has protected tenant-and-customer cache plus explicit retry', () => {
  assert.match(customerStepSource, /`customer-profile:\$\{tenantId \|\| 'tenant'\}:\$\{customer\.id\}`/)
  assert.match(customerStepSource, /protectedResource: true/)
  assert.match(customerStepSource, /loadSelectedCustomerProfile\(selectedCustomer, true\)/)
  assert.match(cacheSource, /'customer-profile:'/)
  assert.match(workspaceSource, /جارٍ تحميل بيانات العميل/)
  assert.match(workspaceSource, /إعادة المحاولة/)
})

test('newly created customer is selected only from a validated full server profile', () => {
  assert.match(modalSource, /isSelectedCustomerProfile\(creation\.customer\)/)
  assert.match(customerStepSource, /setSelectedCustomerProfile\(createdCustomer\)/)
  assert.match(customerStepSource, /writeClientResource\(/)
  assert.doesNotMatch(customerStepSource.slice(customerStepSource.indexOf('const handleCustomerCreated'), customerStepSource.indexOf('const retrySelectedCustomerProfile')), /router\.push|handleNext\(/)
})

test('created customer response is hydrated server-side with factual zero initial activity', () => {
  assert.match(routeSource, /CUSTOMER_PROFILE_SELECT/)
  assert.match(routeSource, /buildSelectedCustomerProfile/)
  assert.match(routeSource, /visitCount: 0/)
  assert.match(routeSource, /totalSpending: 0/)
  assert.match(routeSource, /\.eq\('id', createdCustomer\.id\)/)
})

test('exact phone fast path does not invent zero activity metrics', () => {
  assert.match(routeSource, /visitsCount: normalizedFullPhone \? null/)
  assert.match(routeSource, /totalSpent: normalizedFullPhone \? null/)
  assert.match(workspaceSource, /سجل عميل/)
})

test('Model 1 panel renders the complete authorized field set and hides unsafe edit', () => {
  for (const label of ['رقم الجوال', 'البريد الإلكتروني', 'المدينة', 'العنوان', 'ملاحظات', 'رقم العميل', 'تاريخ التسجيل', 'عدد الزيارات', 'إجمالي المشتريات', 'آخر طلب']) {
    assert.match(workspaceSource, new RegExp(label))
  }
  assert.match(workspaceSource, /غير مسجل/)
  assert.match(workspaceSource, /إزالة العميل/)
  assert.match(workspaceSource, /اختيار العميل/)
  assert.doesNotMatch(workspaceSource, />تعديل</)
})

test('customer profile keeps one in-panel scroll owner and fixed structural actions', () => {
  assert.match(cssSource, /\.afex-customer-profile-scroll \{[^}]*overflow-y: auto/s)
  assert.match(cssSource, /\.afex-customer-ticket-actions \{[^}]*flex: 0 0 auto/s)
  assert.match(cssSource, /\.afex-customer-ticket-footer \{[^}]*flex: 0 0 auto/s)
  assert.match(cssSource, /\.afex-customer-layout \{[^}]*grid-template-columns: 355px minmax\(0, 1fr\)/s)
  assert.match(workspaceSource, /onContinue} disabled={!selected}/)
  assert.doesNotMatch(workspaceSource, /disabled={!selectedCustomerProfile|disabled={profileLoading/)
})

test('mobile profile remains in document flow after search results without a fixed action overlay', () => {
  assert.match(cssSource, /@media \(max-width: 767px\)[\s\S]*\.afex-customer-ticket \{ order: 2/)
  assert.match(cssSource, /@media \(max-width: 767px\)[\s\S]*\.afex-customer-panel \{ order: 1/)
  assert.doesNotMatch(workspaceSource, /afex-customer-mobile-action/)
  assert.match(cssSource, /\.afex-customer-detail-row \{[^}]*min-width: 0/s)
})
