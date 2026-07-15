/* eslint-disable @typescript-eslint/no-require-imports */
const fs = require('node:fs')
const path = require('node:path')

const root = path.resolve(__dirname, '..')
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8')

const checks = [
  ['components/admin-shell-layout.tsx', 'lg:grid-cols-[260px_minmax(0,1fr)]', 'Admin tablet sidebar column'],
  ['components/admin-shell-layout.tsx', 'lg:max-h-[calc(100dvh-2rem)] lg:overflow-y-auto', 'Admin sidebar viewport scrolling'],
  ['components/pos-shell-layout.tsx', 'w-full max-w-full overflow-hidden bg-slate-950', 'Dark POS viewport without w-screen overflow'],
  ['app/admin/orders/page.tsx', 'max-h-[calc(100dvh-1.5rem)]', 'Invoice preview viewport maximum'],
  ['app/admin/orders/page.tsx', 'sticky left-0 bg-[#07111d]', 'Orders action access'],
  ['app/admin/inventory/page.tsx', 'min-w-[820px] table-fixed', 'Inventory table overflow boundary'],
  ['app/admin/inventory/page.tsx', 'sticky left-0 bg-[#06111f]', 'Inventory action access'],
  ['app/admin/users/page.tsx', 'sticky left-0 bg-[#06111f]', 'Users action access'],
  ['app/admin/receipts/page.tsx', 'h-[100dvh]', 'Receipt drawer dynamic viewport height'],
  ['lib/invoices/thermal-preview.ts', "'58mm': 219", '58mm preview width'],
  ['lib/invoices/thermal-preview.ts', "'80mm': 302", '80mm preview width'],
]

const failures = []
for (const [file, marker, label] of checks) {
  if (!read(file).includes(marker)) failures.push(`${label}: ${file}`)
}

if (read('components/pos-shell-layout.tsx').includes('pos-shell-viewport h-[100dvh] min-h-[100dvh] w-screen')) {
  failures.push('POS viewport still uses w-screen')
}

if (failures.length) {
  console.error('Responsive UX source check failed:')
  failures.forEach((failure) => console.error(`- ${failure}`))
  process.exit(1)
}

console.log(`Responsive UX source check passed (${checks.length + 1} assertions).`)
