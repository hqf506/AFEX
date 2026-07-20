/* eslint-disable @typescript-eslint/no-require-imports */
const fs = require('node:fs')
const path = require('node:path')

const root = path.resolve(__dirname, '..')
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8')

const checks = [
  ['components/admin-shell-layout.tsx', 'xl:grid-cols-[300px_minmax(0,1fr)]', 'Admin desktop sidebar column'],
  ['components/admin-shell-layout.tsx', "mobileNavigationOpen ? 'fixed inset-y-0 right-0", 'Admin sidebar hidden from mobile flow'],
  ['components/admin-shell-layout.tsx', 'aria-controls="admin-mobile-navigation"', 'Admin mobile menu trigger'],
  ['components/admin-shell-layout.tsx', 'id="admin-mobile-navigation"', 'Admin mobile navigation drawer'],
  ['components/admin-shell-layout.tsx', 'fixed inset-y-0 right-0', 'Admin RTL drawer edge'],
  ['components/developer-shell.tsx', 'aria-controls="developer-mobile-navigation"', 'Developer mobile menu trigger'],
  ['components/developer-shell.tsx', 'id="developer-mobile-navigation"', 'Developer mobile navigation drawer'],
  ['components/pos-shell-layout.tsx', 'w-full max-w-full overflow-hidden bg-slate-950', 'Dark POS viewport without w-screen overflow'],
  ['app/admin/orders/page.tsx', 'max-h-[calc(100dvh-1.5rem)]', 'Invoice preview viewport maximum'],
  ['app/admin/orders/page.tsx', 'sticky left-0 bg-[#07111d]', 'Orders action access'],
  ['app/admin/inventory/page.tsx', 'min-w-[820px] table-fixed', 'Inventory table overflow boundary'],
  ['app/admin/inventory/page.tsx', 'sticky left-0 bg-[#06111f]', 'Inventory action access'],
  ['app/admin/users/page.tsx', 'sticky left-0 bg-[#06111f]', 'Users action access'],
  ['app/admin/receipts/page.tsx', 'h-[100dvh]', 'Receipt drawer dynamic viewport height'],
  ['lib/invoices/thermal-preview.ts', "'58mm': 219", '58mm preview width'],
  ['lib/invoices/thermal-preview.ts', "'80mm': 302", '80mm preview width'],
  ['app/globals.css', '@media (max-width: 1279px)', 'Admin mobile card breakpoint'],
  ['app/globals.css', '.responsive-admin-table tbody > tr', 'Admin mobile card rows'],
  ['app/admin/orders/page.tsx', 'data-responsive-table="orders"', 'Orders responsive list'],
  ['app/admin/customers/page.tsx', 'data-responsive-table="customers"', 'Customers responsive list'],
  ['app/admin/catalog/page.tsx', 'data-responsive-table="catalog"', 'Catalog responsive list'],
  ['app/admin/categories/page.tsx', 'data-responsive-table="categories"', 'Categories responsive list'],
  ['app/admin/inventory/page.tsx', 'data-responsive-table="inventory"', 'Inventory responsive list'],
  ['app/admin/inventory/movements/page.tsx', 'data-responsive-table="movements"', 'Inventory movements responsive list'],
  ['app/admin/branches/page.tsx', 'data-responsive-table="branches-active"', 'Active branches responsive list'],
  ['app/admin/branches/page.tsx', 'data-responsive-table="branches-inactive"', 'Inactive branches responsive list'],
  ['app/admin/users/page.tsx', 'data-responsive-table="users"', 'Users responsive list'],
  ['app/admin/receipts/page.tsx', 'data-responsive-table="receipts"', 'Receipts responsive list'],
  ['app/admin/discounts/page.tsx', 'data-responsive-table="discounts"', 'Discounts responsive list'],
  ['app/admin/announcements/page.tsx', 'data-responsive-table="announcements"', 'Announcements responsive list'],
  ['app/admin/audit-logs/page.tsx', 'data-responsive-table="audit"', 'Audit logs responsive list'],
  ['app/globals.css', '[data-responsive-filters]', 'Shared responsive filter sizing'],
  ['app/globals.css', '[data-responsive-pagination]', 'Shared responsive pagination sizing'],
  ['app/admin/orders/page.tsx', 'data-responsive-filters', 'Orders responsive filters'],
  ['app/admin/catalog/page.tsx', 'data-responsive-filters', 'Catalog responsive filters'],
  ['app/admin/inventory/movements/page.tsx', 'data-responsive-filters', 'Movement responsive filters'],
  ['app/admin/receipts/page.tsx', 'data-responsive-filters', 'Receipt responsive filters'],
  ['app/admin/audit-logs/page.tsx', 'data-responsive-pagination', 'Audit responsive pagination'],
  ['app/admin/reports/sales-trend/page.tsx', 'data-responsive-filters', 'Report date filters'],
  ['app/admin/support/page.tsx', 'data-responsive-filters', 'Support responsive filters'],
  ['app/globals.css', '[data-admin-drawer]', 'Shared mobile drawer bounds'],
  ['app/globals.css', '[data-admin-dialog]', 'Shared mobile dialog bounds'],
  ['app/globals.css', '[data-admin-preview]', 'Shared mobile preview bounds'],
  ['app/globals.css', 'height: 100dvh !important', 'Dynamic viewport drawer height'],
  ['app/globals.css', 'body:has([data-admin-drawer])', 'Overlay body scroll lock'],
  ['app/admin/orders/page.tsx', 'data-admin-drawer', 'Order responsive drawer'],
  ['app/admin/users/page.tsx', 'data-admin-drawer', 'User responsive drawers'],
  ['app/admin/announcements/page.tsx', 'data-admin-drawer', 'Announcement responsive drawers'],
  ['app/admin/settings/invoices/digital/page.tsx', 'data-admin-preview', 'Digital invoice responsive preview'],
  ['app/admin/support/page.tsx', 'data-admin-dialog', 'Support responsive dialog'],
  ['components/admin-dark-select.tsx', 'createPortal(', 'Admin select portal'],
  ['components/admin-dark-date-input.tsx', 'createPortal(', 'Admin date portal'],
  ['app/admin/dashboard/page.tsx', 'data-responsive-dashboard-kpis', 'Dashboard mobile KPI grid'],
  ['app/admin/dashboard/page.tsx', 'data-responsive-chart', 'Dashboard responsive chart'],
  ['app/admin/reports/sales-trend/page.tsx', 'data-responsive-chart', 'Sales trend responsive chart'],
  ['app/admin/reports/sales-by-category/page.tsx', 'data-responsive-report-cards', 'Category report mobile cards'],
  ['app/admin/reports/sales-by-customer/page.tsx', 'data-responsive-report-cards', 'Customer report mobile cards'],
  ['app/admin/reports/sales-by-employee/page.tsx', 'data-responsive-report-cards', 'Employee report mobile cards'],
  ['app/admin/reports/sales-by-item/page.tsx', 'data-responsive-report-cards', 'Item report mobile cards'],
  ['app/admin/settings/page.tsx', 'data-responsive-settings-tabs', 'Settings mobile tabs'],
  ['app/admin/settings/invoices/digital/page.tsx', 'data-responsive-admin-form', 'Digital invoice responsive form'],
  ['app/admin/settings/invoices/thermal/page.tsx', 'data-responsive-admin-form', 'Thermal invoice responsive form'],
  ['app/admin/branches/new/page.tsx', 'data-responsive-admin-form', 'Branch create responsive form'],
  ['app/admin/branches/[id]/edit/page.tsx', 'data-responsive-admin-form', 'Branch edit responsive form'],
  ['app/admin/branch-catalog/page.tsx', 'data-responsive-admin-form', 'Branch catalog responsive form'],
  ['app/admin/vat/page.tsx', 'sm:min-w-[180px]', 'VAT mobile action width safety'],
  ['app/globals.css', '[data-responsive-settings-tabs]', 'Shared settings tab overflow boundary'],
  ['app/admin/support/page.tsx', 'data-responsive-support-cards="admin"', 'Admin Support mobile cards'],
  ['components/provider-support-console.tsx', 'data-responsive-support-cards={variant}', 'Shared Provider and Developer Support mobile cards'],
  ['components/provider-support-console.tsx', 'data-responsive-support-summary', 'Provider responsive summary cards'],
  ['components/provider-support-console.tsx', 'hidden overflow-x-auto xl:block', 'Provider desktop table breakpoint'],
  ['components/provider-support-console.tsx', 'z-[10000]', 'Provider ticket drawer layer'],
  ['components/developer-support-notifications.tsx', 'Math.max(160, Math.min(640', 'Notification popover mobile height bound'],
  ['components/developer-support-notifications.tsx', 'size-11 place-items-center', 'Notification bell touch target'],
  ['components/developer-support-notifications.tsx', 'data-responsive-developer-notifications', 'Developer notifications page layout'],
  ['app/developer/users/page.tsx', 'data-responsive-developer-users', 'Developer users mobile cards'],
  ['app/globals.css', '[data-responsive-developer-users] + section', 'Developer users desktop table breakpoint'],
]

const failures = []
for (const [file, marker, label] of checks) {
  if (!read(file).includes(marker)) failures.push(`${label}: ${file}`)
}

if (read('components/pos-shell-layout.tsx').includes('pos-shell-viewport h-[100dvh] min-h-[100dvh] w-screen')) {
  failures.push('POS viewport still uses w-screen')
}

if (read('components/admin-shell-layout.tsx').includes('max-lg:max-h-[34dvh]')) {
  failures.push('Admin shell still renders the old inline mobile sidebar')
}

if (read('app/admin/reports/sales-trend/page.tsx').includes('min-w-[720px]')) {
  failures.push('Sales trend chart still forces a 720px mobile width')
}

if (failures.length) {
  console.error('Responsive UX source check failed:')
  failures.forEach((failure) => console.error(`- ${failure}`))
  process.exit(1)
}

console.log(`Responsive UX source check passed (${checks.length + 1} assertions).`)
