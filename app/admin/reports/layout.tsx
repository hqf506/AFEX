'use client'

import type { ReactNode } from 'react'
import { FeatureDisabledState } from '@/components/feature-disabled-state'
import { useSystemSettings } from '@/hooks/use-system-settings'

export default function AdminReportsLayout({ children }: { children: ReactNode }) {
  const { settings, loading } = useSystemSettings()

  if (!loading && settings?.enable_reports === false) {
    return (
      <FeatureDisabledState
        title="ميزة التقارير غير مفعلة"
        message="تم تعطيل التقارير من إعدادات النظام."
      />
    )
  }

  return children
}
