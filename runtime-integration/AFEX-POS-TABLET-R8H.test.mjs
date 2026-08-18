import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const css = readFileSync('app/pos-tablet.css', 'utf8')

test('R8H closes employee PIN indicators to one explicit four-column tablet row', () => {
  assert.match(css, /\.pos-entry-pin \.pos-pin-indicators\s*\{[^}]*display:\s*grid\s*!important;[^}]*width:\s*148px;[^}]*grid-template-columns:\s*repeat\(4, 16px\);[^}]*grid-template-rows:\s*16px;[^}]*gap:\s*28px\s*!important;[^}]*direction:\s*ltr;[^}]*flex-wrap:\s*nowrap\s*!important/s)
  assert.match(css, /\.pos-entry-pin \.pos-pin-indicators > \.pos-pin-indicator\s*\{[^}]*width:\s*16px\s*!important;[^}]*min-width:\s*16px;[^}]*max-width:\s*16px;[^}]*height:\s*16px\s*!important;[^}]*grid-row:\s*1;[^}]*flex:\s*0 0 16px/s)
})

test('R8H is tablet-only CSS and does not change PIN state, Auth, API, or routing', () => {
  const tabletStart = css.indexOf('@media (min-width: 768px) and (max-width: 1366px)')
  const indicators = css.indexOf('.pos-entry-pin .pos-pin-indicators')
  const landscapeStart = css.indexOf('@media (min-width: 768px) and (max-width: 1366px) and (orientation: landscape)')
  assert.ok(tabletStart >= 0 && indicators > tabletStart && indicators < landscapeStart)
  assert.doesNotMatch(css.slice(indicators, landscapeStart), /fetch\(|\/api\/|router\.|supabase|sessionStorage|localStorage/)
})
