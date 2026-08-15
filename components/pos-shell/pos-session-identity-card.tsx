import { getRoleLabel } from '@/lib/app-roles'
import type { ActivePosEmployee } from '@/lib/pos-employee-session'

export function PosSessionIdentityCard({
  employee,
  branchName,
}: {
  employee: ActivePosEmployee
  branchName: string
}) {
  const displayName = employee.full_name?.trim() || employee.username?.trim() || 'موظف نقطة البيع'

  return (
    <section className="afex-pos-identity" aria-label="هوية جلسة نقطة البيع">
      <span className="afex-pos-avatar" aria-hidden="true">{displayName.charAt(0)}</span>
      <div className="afex-pos-identity-copy">
        <strong>{displayName}</strong>
        <span>{branchName} <b aria-hidden="true">•</b> {getRoleLabel(employee.role)}</span>
      </div>
      <PosSessionStatus />
    </section>
  )
}

export function PosSessionStatus() {
  return <span className="afex-pos-session-status"><i aria-hidden="true" />جلسة POS فعالة</span>
}
