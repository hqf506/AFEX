/* eslint-disable @typescript-eslint/no-require-imports */
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const root = path.resolve(__dirname, '..')
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8')

const safeError = read('lib/api/safe-error.ts')
const clientError = read('lib/api/client-error.ts')
const responses = read('lib/api/responses.ts')
const pinRoute = read('app/api/pos/identify-employee-by-pin/route.ts')
const catalogPage = read('app/admin/catalog/page.tsx')
const catalogRoutes = [
  read('app/api/admin/catalog/route.ts'),
  read('app/api/admin/catalog/[id]/route.ts'),
  read('app/api/admin/catalog/upload-image/route.ts'),
].join('\n')

const statusMessages = new Map([
  [401, 'انتهت جلسة الدخول. سجّل الدخول مرة أخرى.'],
  [403, 'لا تملك صلاحية تنفيذ هذه العملية.'],
  [404, 'العنصر المطلوب غير موجود أو تم حذفه.'],
  [409, 'هذه البيانات مستخدمة مسبقًا أو تتعارض مع سجل موجود.'],
  [422, 'تحقق من البيانات المدخلة ثم حاول مرة أخرى.'],
  [429, 'تم تنفيذ محاولات كثيرة خلال وقت قصير. انتظر قليلًا ثم حاول مرة أخرى.'],
  [500, 'حدث خطأ غير متوقع أثناء تنفيذ العملية. لم تكتمل العملية. حاول مرة أخرى، وإذا استمرت المشكلة تواصل مع المسؤول.'],
])

for (const [status, message] of statusMessages) {
  assert.match(safeError, new RegExp(`${status}:`))
  assert.ok(safeError.includes(message), `missing safe ${status} message`)
}

for (const key of [
  'details', 'hint', 'code', 'stack', 'cause', 'query', 'constraint', 'schema',
  'table', 'column', 'providerResponse', 'rawError',
]) {
  assert.ok(safeError.includes(`'${key}'`), `blocked response key is missing: ${key}`)
}

assert.ok(responses.includes('sanitizeApiErrorBody'), 'API responses must use the shared sanitizer')
assert.ok(clientError.includes('response.error'), 'client extractor must use the safe error field')
assert.ok(!clientError.includes('.details'), 'client extractor must never read details')
assert.ok(!clientError.includes('.hint'), 'client extractor must never read hint')
assert.ok(!clientError.includes('.code'), 'client extractor must never read code')
assert.ok(!clientError.includes('String(payload)'), 'client extractor must never stringify payloads')
assert.ok(clientError.includes('SUPPORT_REFERENCE_PATTERN'), 'support references must be format checked')
assert.ok(safeError.includes('crypto.getRandomValues'), 'support references must use random bytes')
assert.ok(!safeError.includes('tenantId') && !safeError.includes('userId'), 'support reference must not use identifiers')

for (const databaseLeak of [
  'duplicate key value violates unique constraint',
  'column does not exist',
  '[object Object]',
]) {
  assert.ok(!clientError.includes(databaseLeak), `unsafe browser text found: ${databaseLeak}`)
}

for (const message of [
  'الرمز غير صحيح. تحقق من الرمز ثم حاول مرة أخرى.',
  'يوجد أكثر من مستخدم بهذا الرمز. تواصل مع مدير النظام لتغيير أحد الرموز.',
  'تم إيقاف المحاولات مؤقتًا بسبب تكرار الرمز الخاطئ. حاول مرة أخرى بعد قليل.',
  'لا يمكن فتح نقطة البيع لأن الحساب غير مرتبط بفرع. تواصل مع مدير النظام.',
  'تعذر التحقق من رمز الموظف حاليًا. حاول مرة أخرى، وإذا استمرت المشكلة تواصل مع المسؤول.',
]) {
  assert.ok(pinRoute.includes(message), `PIN mapping is missing: ${message}`)
}

for (const internalConstant of [
  'FORBIDDEN', 'INVALID_CATALOG_ITEM_ID', 'MISSING_SERVICE_ROLE_KEY',
  'CATALOG_ITEM_NOT_FOUND', 'CATALOG_ITEM_LOOKUP_FAILED',
  'BRANCH_CATALOG_DELETE_FAILED', 'UNEXPECTED_DELETE_ERROR', 'MISSING_TENANT_ID',
  'INVALID_FORM_DATA', 'MISSING_ITEM_ID', 'MISSING_FILE', 'STORAGE_UPLOAD_FAILED',
  'CATALOG_IMAGE_URL_UPDATE_FAILED',
]) {
  assert.ok(!catalogRoutes.includes(`error: '${internalConstant}'`), `catalog exposes ${internalConstant}`)
}

assert.ok(
  catalogPage.includes('هل تريد حذف العناصر المحددة؟ لن تظهر هذه العناصر في الكتالوج بعد الحذف.'),
  'normal catalog deletion confirmation is missing'
)
assert.ok(
  catalogPage.includes('هل تريد حذف العناصر المحددة نهائيًا؟ لا يمكن التراجع عن هذه العملية.'),
  'permanent catalog deletion confirmation is missing'
)
assert.ok(!catalogPage.includes('?? ???? ???'), 'corrupted catalog confirmation remains')

console.log('Production error-safety contract checks passed.')
