import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import test from 'node:test'

const [component, styles, layout, globals, shell, settings, items, history, invoices, orderStatus] = await Promise.all([
  readFile(resolve('components/pos-theme-toggle.tsx'), 'utf8'),
  readFile(resolve('components/pos-theme-toggle.module.css'), 'utf8'),
  readFile(resolve('app/pos/layout.tsx'), 'utf8'),
  readFile(resolve('app/globals.css'), 'utf8'),
  readFile(resolve('components/pos-shell/pos-responsive-shell.tsx'), 'utf8'),
  readFile(resolve('app/pos/settings/page.tsx'), 'utf8'),
  readFile(resolve('components/invoice-items-step.tsx'), 'utf8'),
  readFile(resolve('app/pos/order-history/page.tsx'), 'utf8'),
  readFile(resolve('app/pos/invoices/page.tsx'), 'utf8'),
  readFile(resolve('app/pos/order-status/page.tsx'), 'utf8'),
])

const sharedRule = styles.slice(0, styles.indexOf('@media (prefers-reduced-motion'))

test('the existing shared POS theme control owns one scoped Model 1 implementation', () => {
  assert.match(component, /import styles from '\.\/pos-theme-toggle\.module\.css'/)
  assert.equal((component.match(/data-pos-theme-toggle="model-one"/g) ?? []).length, 1)
})

test('one shared circular implementation applies without device-specific forks', () => {
  assert.doesNotMatch(sharedRule, /@media/)
  assert.doesNotMatch(styles, /pointer:\s*coarse|hover:\s*none|min-width:\s*768px/)
})

test('all-device geometry is a fixed perfect 48px circle', () => {
  for (const declaration of [
    /width:\s*48px(?:\s*!important)?;/,
    /min-width:\s*48px(?:\s*!important)?;/,
    /max-width:\s*48px(?:\s*!important)?;/,
    /height:\s*48px(?:\s*!important)?;/,
    /min-height:\s*48px(?:\s*!important)?;/,
    /aspect-ratio:\s*1;/,
    /border-radius:\s*50%(?:\s*!important)?;/,
  ]) assert.match(sharedRule, declaration)
})

test('the icon remains centered at the approved 24px visual size', () => {
  assert.match(sharedRule, /\.actionIcon\s*\{[\s\S]*?display:\s*grid;[\s\S]*?width:\s*24px;[\s\S]*?height:\s*24px;[\s\S]*?place-items:\s*center;/)
  assert.match(sharedRule, /\.actionIcon svg\s*\{[\s\S]*?width:\s*24px;[\s\S]*?height:\s*24px;/)
})

test('Light Mode exposes exactly the Moon action icon and suppresses the Sun icon', () => {
  assert.equal((component.match(/data-pos-theme-icon="moon"/g) ?? []).length, 1)
  assert.match(sharedRule, /html\[data-pos-theme='light'\][\s\S]*?\.moonIcon\s*\{\s*display:\s*block;/)
  assert.match(sharedRule, /\.moonIcon,\s*\.sunIcon\s*\{\s*display:\s*none;/)
})

test('Dark Mode exposes exactly the Sun action icon and suppresses the Moon icon', () => {
  assert.equal((component.match(/data-pos-theme-icon="sun"/g) ?? []).length, 1)
  assert.match(sharedRule, /html\[data-pos-theme='dark'\][\s\S]*?\.sunIcon\s*\{\s*display:\s*block;/)
  assert.match(sharedRule, /\.moonIcon,\s*\.sunIcon\s*\{\s*display:\s*none;/)
})

test('Moon and Sun use the established SVG stroke language without emoji icons', () => {
  assert.equal((component.match(/stroke="currentColor"/g) ?? []).length, 2)
  assert.equal((component.match(/strokeWidth="1\.8"/g) ?? []).length, 2)
  assert.doesNotMatch(component, /☾|☀|🌙|🌞/u)
})

test('Light Mode uses the AFEX ivory surface, warm-gold border and warm-gold Moon', () => {
  const rule = sharedRule.match(/html\[data-pos-theme='light'\][^\{]*\.toggle\.toggle\.toggle\s*\{([\s\S]*?)\n\s*\}/)?.[1] ?? ''
  assert.match(rule, /background:\s*var\(--afex-pos-raised\)/)
  assert.match(rule, /border-color:\s*var\(--afex-pos-emerald-strong\)/)
  assert.match(rule, /color:\s*var\(--afex-pos-emerald-strong\)/)
})

test('Dark Mode uses the AFEX warm-gold surface and charcoal icon token', () => {
  const rule = sharedRule.match(/html\[data-pos-theme='dark'\][^\{]*\.toggle\.toggle\.toggle\s*\{([\s\S]*?)\n\s*\}/)?.[1] ?? ''
  assert.match(rule, /background:\s*var\(--afex-pos-emerald\)/)
  assert.match(rule, /border-color:\s*var\(--afex-pos-emerald-strong\)/)
  assert.match(rule, /color:\s*var\(--afex-pos-base\)/)
})

test('the old visible theme word and legacy icon are absent on every device', () => {
  assert.doesNotMatch(component, /المظهر|legacyIcon|◐/u)
  assert.doesNotMatch(styles, /\.label|\.legacyIcon/)
})

test('accessible name and title always describe the destination theme', () => {
  assert.match(component, /theme === 'light' \? 'تفعيل الوضع الليلي' : 'تفعيل الوضع النهاري'/)
  assert.match(component, /aria-label=\{actionLabel\}/)
  assert.match(component, /title=\{actionLabel\}/)
  assert.match(component, /aria-pressed=\{theme === 'dark'\}/)
})

test('one native button activation performs exactly one authoritative theme transition', () => {
  assert.match(component, /<button\s+[\s\S]*?type="button"/)
  assert.equal((component.match(/document\.documentElement\.dataset\.posTheme = nextTheme/g) ?? []).length, 1)
  assert.equal((component.match(/window\.localStorage\.setItem\(STORAGE_KEY, nextTheme\)/g) ?? []).length, 1)
  assert.match(component, /event\.stopPropagation\(\)/)
})

test('the component observes the authoritative DOM theme without introducing local theme state', () => {
  assert.match(component, /useSyncExternalStore\(subscribeToTheme, currentTheme, serverTheme\)/)
  assert.match(component, /attributeFilter:\s*\['data-pos-theme'\]/)
  assert.doesNotMatch(component, /useState|useReducer|new CustomEvent/)
})

test('the trusted pre-paint theme persistence contract remains unchanged', () => {
  assert.match(layout, /const k='afex-pos-theme-v1'/)
  assert.match(layout, /localStorage\.getItem\(k\)/)
  assert.match(layout, /document\.documentElement\.dataset\.posTheme=t/)
  assert.equal((component.match(/afex-pos-theme-v1/g) ?? []).length, 1)
})

test('focus, press and reduced-motion states are bounded and do not rotate the icon', () => {
  assert.match(sharedRule, /:focus-visible\s*\{[\s\S]*?outline:\s*2px solid var\(--afex-pos-emerald\)/)
  assert.match(sharedRule, /:active\s*\{[\s\S]*?transform:\s*scale\(0\.97\)/)
  assert.match(styles, /prefers-reduced-motion:\s*reduce[\s\S]*?transition:\s*none;/)
  assert.doesNotMatch(styles, /rotate|animation:/)
})

test('the shared control preserves header heights and keeps ten-pixel neighboring spacing', () => {
  assert.match(sharedRule, /afex-pos-responsive-actions[\s\S]*?afex-pos-sale-left-controls[\s\S]*?gap:\s*10px;/)
  assert.doesNotMatch(styles, /:global\(\.afex-pos-(?:responsive|sale)-header\)\s*\{/)
  assert.match(globals, /\.afex-pos-responsive-header\s*\{[\s\S]*?height:\s*68px;/)
})

test('all existing POS consumers continue to use the one shared theme component', () => {
  assert.equal((shell.match(/<PosThemeToggle \/>/g) ?? []).length, 4)
  assert.equal((settings.match(/<PosThemeToggle \/>/g) ?? []).length, 1)
  assert.equal((items.match(/<PosThemeToggle \/>/g) ?? []).length, 1)
  assert.equal((history.match(/<PosThemeToggle \/>/g) ?? []).length, 1)
  assert.equal((invoices.match(/<PosThemeToggle \/>/g) ?? []).length, 1)
  assert.equal((orderStatus.match(/<PosThemeToggle \/>/g) ?? []).length, 1)
  assert.doesNotMatch(shell + settings + items + history + invoices + orderStatus, /data-pos-theme-icon=/)
})

test('the shared rule wins historical pill colors without undefined or off-brand tokens', () => {
  assert.match(sharedRule, /background:\s*var\(--afex-pos-raised\) !important/)
  assert.match(sharedRule, /background:\s*var\(--afex-pos-emerald\) !important/)
  assert.doesNotMatch(styles, /--afex-pos-(?:bronze|cyan)|\b(?:blue|purple|red)\b/iu)
})

test('the scoped visual change contains no API, SQL, database or business path', () => {
  const changedSources = component + styles
  assert.doesNotMatch(changedSources, /fetch\(|supabase|\.from\(|rpc\(|\b(?:INSERT|UPDATE|DELETE|checkout|invoice|order)\b/iu)
})
