import type { ReactNode } from 'react'
import { redirect } from 'next/navigation'
import { DeveloperShell } from '@/components/developer-shell'
import { requireDeveloperAccess } from '@/lib/developer/server'

export const dynamic = 'force-dynamic'

export default async function DeveloperLayout({ children }: { children: ReactNode }) {
  const access = await requireDeveloperAccess()
  if (!access.ok) redirect('/')
  return <DeveloperShell>{children}</DeveloperShell>
}
