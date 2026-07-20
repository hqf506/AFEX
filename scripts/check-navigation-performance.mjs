import { readFileSync } from 'node:fs'

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8')
const failures = []
const expect = (condition, message) => {
  if (!condition) failures.push(message)
}

const feedback = read('components/navigation-feedback.tsx')
const adminShell = read('components/admin-shell-layout.tsx')
const developerShell = read('components/developer-shell.tsx')
const providerShell = read('components/developer-support-notifications.tsx')
const adminLayout = read('app/admin/layout.tsx')

expect(feedback.includes("document.addEventListener('click', handleNavigationClick, true)"), 'Navigation feedback must observe shell link activation immediately.')
expect(feedback.includes('pendingHrefRef.current === destinationKey'), 'Repeated navigation to the same destination must be guarded.')
expect(feedback.includes('requestIdleCallback'), 'Common route prefetch must wait for browser idle time.')
expect(feedback.includes("connection?.saveData"), 'Idle prefetch must respect reduced-data connections.')
expect(feedback.includes('prefetchedRoutesRef.current.has(route)'), 'Shell prefetch must not repeat the same route.')
expect(adminShell.includes('<NavigationFeedback prefetchRoutes={ADMIN_PREFETCH_ROUTES} />'), 'Admin shell must render shared navigation feedback.')
expect(developerShell.includes('<NavigationFeedback prefetchRoutes={DEVELOPER_PREFETCH_ROUTES} />'), 'Developer shell must render shared navigation feedback.')
expect(providerShell.includes('<NavigationFeedback prefetchRoutes={PROVIDER_PREFETCH_ROUTES} />'), 'Provider shell must render shared navigation feedback.')
expect(adminLayout.includes('await Promise.all(['), 'Independent Admin profile/provider checks must run in parallel.')

for (const path of ['app/admin/loading.tsx', 'app/provider/loading.tsx', 'app/developer/loading.tsx']) {
  expect(read(path).includes('RouteLoadingState'), `${path} must preserve an instant route loading boundary.`)
}

for (const [path, source] of [
  ['components/admin-shell-layout.tsx', adminShell],
  ['components/developer-shell.tsx', developerShell],
  ['components/mobile/mobile-bottom-nav.tsx', read('components/mobile/mobile-bottom-nav.tsx')],
]) {
  expect(!source.includes('prefetch={false}'), `${path} must not disable prefetch for primary navigation links.`)
}

if (failures.length) {
  console.error(failures.map((failure) => `- ${failure}`).join('\n'))
  process.exit(1)
}

console.log('Navigation and perceived-performance regression checks passed.')
