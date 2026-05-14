'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { AdminDarkSelect } from '@/components/admin-dark-select'
import { AdminInput } from '@/components/admin-input'
import {
  type AdminBranchRecord,
  requiresAssignedBranch,
} from '@/lib/admin/branches'
import {
  ADMIN_ROLE_OPTIONS,
  canSubmitAdminUserCreatePayload,
  createEmptyAdminUserPayload,
  hasValidAdminPasswordLength,
  isValidAdminPosPin,
  isPrimaryAdminUsername,
} from '@/lib/admin/users'
import { resolveAuthScopeType } from '@/lib/auth-profile'
import { AppRole, usePageAccess } from '@/hooks/use-page-access'

type ProfileRow = {
  id: string
  full_name: string | null
  username: string | null
  role: AppRole
  is_active: boolean
  branch_id: string | null
  created_at?: string
  updated_at?: string
}

type ResetPasswordModalState = {
  open: boolean
  userId: string
  username: string
}

type ResetPosPinModalState = {
  open: boolean
  userId: string
  username: string
}

type DropdownOption = {
  label: string
  value: string
}

const emptyForm = createEmptyAdminUserPayload()

function getBranchName(
  branches: AdminBranchRecord[],
  branchId: string | null | undefined
) {
  if (!branchId) return 'بدون فرع'
  return branches.find((branch) => branch.id === branchId)?.name || 'فرع غير معروف'
}

const ROLE_DISPLAY_LABELS: Partial<Record<AppRole, string>> = {
  admin: 'المدير',
  employee: 'الإداري',
  cashier: 'أمين الصندوق',
}

function getRoleDisplayLabel(role: AppRole | string) {
  return ROLE_DISPLAY_LABELS[role as AppRole] || role
}

function StyledDropdown({
  value,
  options,
  onChange,
  disabled = false,
  title,
  placeholder = 'اختر',
}: {
  value: string
  options: DropdownOption[]
  onChange: (value: string) => void
  disabled?: boolean
  title?: string
  placeholder?: string
}) {
  return (
    <AdminDarkSelect
      value={value}
      options={options}
      onChange={onChange}
      disabled={disabled}
      placeholder={placeholder}
      ariaLabel={title || placeholder}
      triggerClassName="h-11 rounded-xl border-white/10 bg-white/[0.045] px-3 text-sm text-white hover:border-cyan-300/35 hover:bg-cyan-300/10 focus:border-cyan-300/50 focus:ring-cyan-300/15"
      menuClassName="border-cyan-300/20 bg-[#07111f]"
    />
  )
}

export default function AdminUsersPage() {
  const access = usePageAccess(['admin'])
  const { loading: accessLoading, allowed, scopeType, branchId: actorBranchId } =
    access
  const isSystemAdmin = scopeType === 'system'

  const [users, setUsers] = useState<ProfileRow[]>([])
  const [branches, setBranches] = useState<AdminBranchRecord[]>([])
  const [branchSelections, setBranchSelections] = useState<Record<string, string>>({})
  const [loadingUsers, setLoadingUsers] = useState(false)
  const [loadingBranches, setLoadingBranches] = useState(false)
  const [creating, setCreating] = useState(false)
  const [showCreateForm, setShowCreateForm] = useState(false)
  const [updatingUserId, setUpdatingUserId] = useState<string | null>(null)

  const [username, setUsername] = useState(emptyForm.username)
  const [fullName, setFullName] = useState(emptyForm.fullName)
  const [contactEmail, setContactEmail] = useState(emptyForm.contactEmail)
  const [phone, setPhone] = useState(emptyForm.phone)
  const [posPin, setPosPin] = useState(emptyForm.posPin)
  const [password, setPassword] = useState(emptyForm.password)
  const [confirmPassword, setConfirmPassword] = useState(emptyForm.confirmPassword)
  const [role, setRole] = useState<AppRole>(emptyForm.role)
  const [createBranchId, setCreateBranchId] = useState(emptyForm.branchId)

  const [successMessage, setSuccessMessage] = useState('')
  const [errorMessage, setErrorMessage] = useState('')

  const [resetModal, setResetModal] = useState<ResetPasswordModalState>({
    open: false,
    userId: '',
    username: '',
  })
  const [pinResetModal, setPinResetModal] = useState<ResetPosPinModalState>({
    open: false,
    userId: '',
    username: '',
  })
  const [newPassword, setNewPassword] = useState('')
  const [confirmNewPassword, setConfirmNewPassword] = useState('')
  const [newPosPin, setNewPosPin] = useState('')
  const [confirmNewPosPin, setConfirmNewPosPin] = useState('')

  const resetForm = useCallback(() => {
    setUsername('')
    setFullName('')
    setContactEmail('')
    setPhone('')
    setPosPin('')
    setPassword('')
    setConfirmPassword('')
    setRole('employee')
    setCreateBranchId(isSystemAdmin ? '' : actorBranchId || '')
  }, [actorBranchId, isSystemAdmin])

  function closeResetModal() {
    setResetModal({
      open: false,
      userId: '',
      username: '',
    })
    setNewPassword('')
    setConfirmNewPassword('')
  }

  function closePinResetModal() {
    setPinResetModal({
      open: false,
      userId: '',
      username: '',
    })
    setNewPosPin('')
    setConfirmNewPosPin('')
  }

  async function loadBranches() {
    try {
      setLoadingBranches(true)

      const response = await fetch('/api/admin/branches', {
        method: 'GET',
      })

      const result = await response.json()

      if (!response.ok) {
        throw new Error(result?.details || result?.error || 'تعذر تحميل الفروع')
      }

      setBranches(result.branches || [])
    } catch (error) {
      console.error('Load branches error:', error)
      setErrorMessage(error instanceof Error ? error.message : 'تعذر تحميل الفروع')
    } finally {
      setLoadingBranches(false)
    }
  }

  async function loadUsers() {
    try {
      setLoadingUsers(true)
      setErrorMessage('')

      const response = await fetch('/api/admin/list-users', {
        method: 'GET',
      })

      const result = await response.json()

      if (!response.ok) {
        throw new Error(result?.details || result?.error || 'تعذر تحميل المستخدمين')
      }

      const nextUsers = (result.users || []) as ProfileRow[]
      setUsers(nextUsers)
      setBranchSelections(
        nextUsers.reduce<Record<string, string>>((acc, user) => {
          acc[user.id] = user.branch_id || ''
          return acc
        }, {})
      )
    } catch (error) {
      console.error('Load users error:', error)
      setErrorMessage(
        error instanceof Error ? error.message : 'تعذر تحميل المستخدمين'
      )
    } finally {
      setLoadingUsers(false)
    }
  }

  useEffect(() => {
    if (!accessLoading && allowed) {
      void Promise.all([loadUsers(), loadBranches()])
      resetForm()
    }
  }, [accessLoading, allowed, resetForm])

  const branchIdForCreate = isSystemAdmin ? createBranchId : actorBranchId || ''

  const canSubmitCreate = useMemo(() => {
    const baseValid = canSubmitAdminUserCreatePayload({
      username,
      password,
      confirmPassword,
      posPin,
    })

    if (!baseValid) {
      return false
    }

    if (requiresAssignedBranch(role)) {
      return Boolean(branchIdForCreate)
    }

    return true
  }, [username, password, confirmPassword, posPin, role, branchIdForCreate])

  const activeUsersCount = useMemo(
    () => users.filter((user) => user.is_active).length,
    [users]
  )

  const inactiveUsersCount = users.length - activeUsersCount
  const adminUsersCount = useMemo(
    () => users.filter((user) => user.role === 'admin').length,
    [users]
  )
  const cashierUsersCount = useMemo(
    () => users.filter((user) => user.role === 'cashier').length,
    [users]
  )
  const roleOptions = useMemo(
    () =>
      ADMIN_ROLE_OPTIONS.map((option) => ({
        label: getRoleDisplayLabel(option.value),
        value: option.value,
      })),
    []
  )
  const fullNameParts = useMemo(() => {
    const normalizedName = fullName.trim()

    if (!normalizedName) {
      return {
        firstName: '',
        lastName: '',
      }
    }

    const [firstName, ...lastNameParts] = normalizedName.split(/\s+/)

    return {
      firstName,
      lastName: lastNameParts.join(' '),
    }
  }, [fullName])

  const updateFullNameParts = useCallback(
    (nextFirstName: string, nextLastName: string) => {
      setFullName(
        [nextFirstName.trim(), nextLastName.trim()].filter(Boolean).join(' ')
      )
    },
    []
  )

  async function handleCreateUser(e: React.FormEvent) {
    e.preventDefault()

    try {
      setCreating(true)
      setSuccessMessage('')
      setErrorMessage('')

      if (!username.trim()) {
        throw new Error('يرجى كتابة اسم المستخدم')
      }

      if (!hasValidAdminPasswordLength(password.trim())) {
        throw new Error('كلمة المرور يجب أن تكون 6 أحرف أو أكثر')
      }

      if (password !== confirmPassword) {
        throw new Error('تأكيد كلمة المرور غير مطابق')
      }

      const normalizedPosPin = posPin.trim()

      if (!isValidAdminPosPin(normalizedPosPin)) {
        throw new Error('POS PIN يجب أن يتكون من 4 أرقام')
      }

      if (requiresAssignedBranch(role) && !branchIdForCreate) {
        throw new Error('يجب اختيار فرع لهذا المستخدم')
      }

      const response = await fetch('/api/admin/create-user', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          username,
          full_name: fullName,
          contact_email: contactEmail.trim() || null,
          phone: phone.trim() || null,
          pos_pin: normalizedPosPin,
          password,
          role,
          branch_id: branchIdForCreate || null,
        }),
      })

      const result = await response.json()

      if (!response.ok) {
        throw new Error(result?.details || result?.error || 'فشل إنشاء المستخدم')
      }

      setSuccessMessage(`تم إنشاء المستخدم ${result.user?.username || username} بنجاح`)
      resetForm()
      await loadUsers()
    } catch (error) {
      console.error('Create user error:', error)
      setErrorMessage(
        error instanceof Error ? error.message : 'حدث خطأ أثناء إنشاء المستخدم'
      )
    } finally {
      setCreating(false)
    }
  }

  async function handleRoleChange(userId: string, newRole: AppRole) {
    try {
      setUpdatingUserId(userId)
      setSuccessMessage('')
      setErrorMessage('')

      const response = await fetch('/api/admin/update-user-role', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          userId,
          role: newRole,
        }),
      })

      const result = await response.json()

      if (!response.ok) {
        throw new Error(result?.details || result?.error || 'فشل تحديث الوظيفة')
      }

      setSuccessMessage('تم تحديث الوظيفة بنجاح')
      await loadUsers()
    } catch (error) {
      console.error('Update role error:', error)
      setErrorMessage(
        error instanceof Error ? error.message : 'تعذر تحديث الوظيفة'
      )
    } finally {
      setUpdatingUserId(null)
    }
  }

  async function handleUserBranchUpdate(user: ProfileRow) {
    try {
      setUpdatingUserId(user.id)
      setSuccessMessage('')
      setErrorMessage('')

      const selectedBranchId = branchSelections[user.id] || ''

      if (requiresAssignedBranch(user.role) && !selectedBranchId) {
        throw new Error('يجب تعيين فرع للمستخدمين غير الأدمن')
      }

      const response = await fetch('/api/admin/update-user-branch', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          userId: user.id,
          branch_id: selectedBranchId || null,
        }),
      })

      const result = await response.json()

      if (!response.ok) {
        throw new Error(
          result?.details || result?.error || 'فشل تحديث فرع المستخدم'
        )
      }

      setSuccessMessage(result.message || 'تم تحديث فرع المستخدم بنجاح')
      await loadUsers()
    } catch (error) {
      console.error('Update user branch error:', error)
      setErrorMessage(
        error instanceof Error ? error.message : 'تعذر تحديث فرع المستخدم'
      )
    } finally {
      setUpdatingUserId(null)
    }
  }

  async function handleToggleStatus(user: ProfileRow) {
    try {
      setUpdatingUserId(user.id)
      setSuccessMessage('')
      setErrorMessage('')

      const response = await fetch('/api/admin/toggle-user-status', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          userId: user.id,
          is_active: !user.is_active,
        }),
      })

      const result = await response.json()

      if (!response.ok) {
        throw new Error(
          result?.details || result?.error || 'فشل تحديث حالة المستخدم'
        )
      }

      setSuccessMessage(result.message || 'تم تحديث حالة المستخدم بنجاح')
      await loadUsers()
    } catch (error) {
      console.error('Toggle user status error:', error)
      setErrorMessage(
        error instanceof Error ? error.message : 'تعذر تحديث حالة المستخدم'
      )
    } finally {
      setUpdatingUserId(null)
    }
  }

  function openResetPasswordModal(user: ProfileRow) {
    setSuccessMessage('')
    setErrorMessage('')
    setResetModal({
      open: true,
      userId: user.id,
      username: user.username || '',
    })
    setNewPassword('')
    setConfirmNewPassword('')
  }

  function openResetPosPinModal(user: ProfileRow) {
    setSuccessMessage('')
    setErrorMessage('')
    setPinResetModal({
      open: true,
      userId: user.id,
      username: user.username || '',
    })
    setNewPosPin('')
    setConfirmNewPosPin('')
  }

  async function handleConfirmResetPassword() {
    try {
      if (!newPassword.trim() || newPassword.trim().length < 6) {
        throw new Error('كلمة المرور الجديدة يجب أن تكون 6 أحرف أو أكثر')
      }

      if (newPassword !== confirmNewPassword) {
        throw new Error('تأكيد كلمة المرور غير مطابق')
      }

      setUpdatingUserId(resetModal.userId)
      setSuccessMessage('')
      setErrorMessage('')

      const response = await fetch('/api/admin/reset-user-password', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          userId: resetModal.userId,
          newPassword,
        }),
      })

      const result = await response.json()

      if (!response.ok) {
        throw new Error(
          result?.details || result?.error || 'فشل إعادة تعيين كلمة المرور'
        )
      }

      setSuccessMessage(result.message || 'تمت إعادة تعيين كلمة المرور بنجاح')
      closeResetModal()
    } catch (error) {
      console.error('Reset password error:', error)
      setErrorMessage(
        error instanceof Error ? error.message : 'تعذر إعادة تعيين كلمة المرور'
      )
    } finally {
      setUpdatingUserId(null)
    }
  }

  async function handleConfirmResetPosPin() {
    try {
      const normalizedPin = newPosPin.trim()

      if (!isValidAdminPosPin(normalizedPin)) {
        throw new Error('POS PIN يجب أن يتكون من 4 أرقام')
      }

      if (normalizedPin !== confirmNewPosPin.trim()) {
        throw new Error('تأكيد POS PIN غير مطابق')
      }

      setUpdatingUserId(pinResetModal.userId)
      setSuccessMessage('')
      setErrorMessage('')

      const response = await fetch('/api/admin/reset-user-pos-pin', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          userId: pinResetModal.userId,
          pin: normalizedPin,
        }),
      })

      const result = await response.json()

      if (!response.ok) {
        throw new Error(
          result?.details || result?.error || 'فشل إعادة تعيين POS PIN'
        )
      }

      setSuccessMessage(result.message || 'تمت إعادة تعيين POS PIN بنجاح')
      closePinResetModal()
    } catch (error) {
      console.error('Reset POS PIN error:', error)
      setErrorMessage(
        error instanceof Error ? error.message : 'تعذر إعادة تعيين POS PIN'
      )
    } finally {
      setUpdatingUserId(null)
    }
  }

  async function handleDeleteUser(user: ProfileRow) {
    const confirmed = window.confirm(`هل أنت متأكد من حذف المستخدم ${user.username}؟`)

    if (!confirmed) return

    try {
      setUpdatingUserId(user.id)
      setSuccessMessage('')
      setErrorMessage('')

      const response = await fetch('/api/admin/delete-user', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          userId: user.id,
        }),
      })

      const result = await response.json()

      if (!response.ok) {
        throw new Error(result?.details || result?.error || 'فشل حذف المستخدم')
      }

      setSuccessMessage(result.message || 'تم حذف المستخدم بنجاح')
      await loadUsers()
    } catch (error) {
      console.error('Delete user error:', error)
      setErrorMessage(
        error instanceof Error ? error.message : 'تعذر حذف المستخدم'
      )
    } finally {
      setUpdatingUserId(null)
    }
  }

  if (accessLoading) {
    return (
      <div className="min-h-full bg-[#030714] p-4 text-white md:p-6">
        <div className="mx-auto h-32 max-w-7xl animate-pulse rounded-3xl border border-cyan-300/10 bg-white/[0.055] shadow-[0_24px_80px_rgba(0,0,0,0.28)]" />
      </div>
    )
  }

  if (!allowed) {
    return (
      <div className="min-h-full bg-[#030714] p-4 text-white md:p-6">
        <div className="mx-auto max-w-7xl">
          <div className="rounded-3xl border border-red-300/15 bg-red-500/10 p-6 text-right shadow-[0_24px_80px_rgba(0,0,0,0.28)]">
            <h1 className="text-2xl font-black text-white">غير مصرح لك</h1>
            <p className="mt-2 text-slate-400">هذه الصفحة متاحة للأدمن فقط.</p>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="relative min-h-screen overflow-hidden bg-[#030714] text-white [&_.border-slate-100]:border-white/10 [&_.border-slate-200]:border-white/10 [&_.bg-slate-50]:bg-white/[0.045] [&_.bg-white]:bg-white/[0.045] [&_.divide-slate-100]:divide-white/10 [&_.field-input]:border-cyan-300/15 [&_.field-input]:bg-white/[0.045] [&_.field-input]:text-white [&_.field-input]:placeholder:text-slate-500 [&_.field-input]:focus:border-cyan-300/50 [&_.field-input]:focus:bg-white/[0.07] [&_.text-slate-950]:text-white [&_.text-slate-900]:text-white [&_.text-slate-700]:text-slate-200 [&_.text-slate-600]:text-slate-300 [&_.text-slate-500]:text-slate-400">
      <div className="pointer-events-none absolute inset-0 -z-0">
        <div className="absolute right-[-14rem] top-[-12rem] h-[36rem] w-[36rem] rounded-full bg-cyan-400/16 blur-[130px]" />
        <div className="absolute left-[-16rem] bottom-[-14rem] h-[38rem] w-[38rem] rounded-full bg-emerald-400/10 blur-[140px]" />
        <div className="absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.03)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.024)_1px,transparent_1px)] bg-[size:72px_72px] opacity-20" />
      </div>

      <div className="relative z-10 flex w-full flex-col gap-4 px-3 py-3 md:px-4 xl:px-5">
        <header className="overflow-hidden rounded-[28px] border border-cyan-300/15 bg-white/[0.055] px-5 py-4 shadow-[0_24px_90px_rgba(0,0,0,0.28)] backdrop-blur-xl md:px-6">
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div className="text-right">
              <p className="text-xs font-black uppercase tracking-[0.24em] text-cyan-300/80">
                AFEX ADMIN
              </p>
              <h1 className="mt-1 text-3xl font-black text-white">
                إدارة المستخدمين
              </h1>
              <p className="mt-1 max-w-2xl text-sm font-medium leading-6 text-slate-300">
                إدارة الحسابات والصلاحيات داخل النظام
              </p>
            </div>

            <div className="flex flex-wrap justify-end gap-2">
              <button
                type="button"
                onClick={() => setShowCreateForm(true)}
                className="inline-flex h-10 items-center justify-center rounded-xl bg-gradient-to-l from-cyan-300 to-emerald-300 px-4 text-sm font-black text-slate-950 shadow-[0_0_28px_rgba(34,211,238,0.22)] transition hover:scale-[1.01] active:scale-[0.98]"
              >
                إنشاء مستخدم جديد
              </button>
            </div>
          </div>
        </header>

        {successMessage ? (
          <div className="rounded-2xl border border-emerald-300/20 bg-emerald-400/10 px-4 py-3 text-sm font-bold text-emerald-200 shadow-[0_18px_50px_rgba(0,0,0,0.2)]">
            {successMessage}
          </div>
        ) : null}

        {errorMessage ? (
          <div className="whitespace-pre-wrap rounded-2xl border border-red-300/20 bg-red-500/10 px-4 py-3 text-sm font-bold text-red-200 shadow-[0_18px_50px_rgba(0,0,0,0.2)]">
            {errorMessage}
          </div>
        ) : null}

        <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
          {[
            {
              label: 'عدد المستخدمين',
              value: users.length,
              hint: 'حساب داخل النظام',
              tone: 'from-cyan-300/18 to-blue-400/10',
            },
            {
              label: 'المستخدمون النشطون',
              value: activeUsersCount,
              hint: 'جاهزون للعمل',
              tone: 'from-emerald-300/18 to-cyan-400/10',
            },
            {
              label: 'المعطلون',
              value: inactiveUsersCount,
              hint: 'حسابات غير مفعلة',
              tone: 'from-red-300/16 to-rose-400/10',
            },
            {
              label: 'الإداريون',
              value: adminUsersCount,
              hint: `الكاشير: ${cashierUsersCount}`,
              tone: 'from-violet-300/16 to-cyan-400/10',
            },
          ].map((card) => (
            <div
              key={card.label}
              className={`rounded-[22px] border border-cyan-300/12 bg-gradient-to-br ${card.tone} p-3 shadow-[0_18px_55px_rgba(0,0,0,0.2)] backdrop-blur-xl`}
            >
              <div className="flex items-center justify-between gap-3">
                <div className="text-right">
                  <p className="text-xs font-bold text-slate-400">{card.label}</p>
                  <p className="mt-1.5 text-2xl font-black text-white">{card.value}</p>
                  <p className="mt-1 text-xs font-bold text-cyan-200/80">
                    {card.hint}
                  </p>
                </div>
                <span className="flex h-10 w-10 items-center justify-center rounded-2xl border border-cyan-300/15 bg-[#06111f] text-cyan-200 shadow-[0_0_20px_rgba(34,211,238,0.13)]">
                  <svg
                    viewBox="0 0 24 24"
                    className="h-5 w-5"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.8"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    aria-hidden="true"
                  >
                    <path d="M16 21v-2a4 4 0 0 0-4-4H7a4 4 0 0 0-4 4v2" />
                    <circle cx="9.5" cy="7" r="3.5" />
                    <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
                    <path d="M16 3.13a3.5 3.5 0 0 1 0 6.74" />
                  </svg>
                </span>
              </div>
            </div>
          ))}
        </div>

        <div className="space-y-4">
          {showCreateForm ? (
          <section
            id="create-user-form"
            className="overflow-hidden rounded-[28px] border border-cyan-300/15 bg-white/[0.055] shadow-[0_24px_90px_rgba(0,0,0,0.28)] backdrop-blur-xl"
          >
            <div className="border-b border-white/10 px-5 py-4 text-right">
              <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                <div>
                  <p className="text-xs font-black uppercase tracking-[0.18em] text-cyan-300/75">
                    حساب جديد
                  </p>
                  <h2 className="mt-1 text-2xl font-black text-white">
                    إنشاء مستخدم
                  </h2>
                  <p className="mt-1 text-sm leading-6 text-slate-400">
                    نموذج مختصر لإضافة موظف أو مدير وربطه بالفرع.
                  </p>
                </div>

                <div className="flex flex-wrap justify-end gap-2">
                  {requiresAssignedBranch(role) ? (
                    <span className="shrink-0 rounded-full border border-cyan-300/20 bg-cyan-300/10 px-3 py-1 text-xs font-bold text-cyan-100">
                      يتطلب فرعًا
                    </span>
                  ) : (
                    <span className="shrink-0 rounded-full border border-emerald-300/20 bg-emerald-300/10 px-3 py-1 text-xs font-bold text-emerald-100">
                      مرن
                    </span>
                  )}
                  <button
                    type="button"
                    onClick={() => {
                      resetForm()
                      setShowCreateForm(false)
                    }}
                    className="h-8 rounded-full border border-white/10 bg-white/[0.045] px-3 text-xs font-bold text-slate-300 transition hover:bg-white/[0.075]"
                  >
                    إغلاق
                  </button>
                </div>
              </div>
            </div>

            <form onSubmit={handleCreateUser} className="grid gap-4 p-5 lg:grid-cols-2 2xl:grid-cols-3">
              <div>
                <label className="mb-1.5 block text-sm font-bold text-slate-200">
                  اسم المستخدم
                </label>
                <AdminInput
                  type="text"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="مثال: faisal"
                  className="h-11 rounded-xl border-slate-200 bg-slate-50 text-right focus:border-slate-400 focus:bg-white"
                  autoComplete="off"
                />
              </div>

              <div className="grid gap-3 sm:grid-cols-2 lg:col-span-2 2xl:col-span-2">
                <div>
                  <label className="mb-1.5 block text-sm font-bold text-slate-200">
                    الاسم الأول
                  </label>
                  <AdminInput
                    type="text"
                    value={fullNameParts.firstName}
                    onChange={(e) =>
                      updateFullNameParts(e.target.value, fullNameParts.lastName)
                    }
                    placeholder="مثال: فيصل"
                    className="h-11 rounded-xl border-slate-200 bg-slate-50 text-right focus:border-slate-400 focus:bg-white"
                    autoComplete="off"
                  />
                </div>

                <div>
                  <label className="mb-1.5 block text-sm font-bold text-slate-200">
                    اسم العائلة
                  </label>
                  <AdminInput
                    type="text"
                    value={fullNameParts.lastName}
                    onChange={(e) =>
                      updateFullNameParts(fullNameParts.firstName, e.target.value)
                    }
                    placeholder="مثال: أحمد"
                    className="h-11 rounded-xl border-slate-200 bg-slate-50 text-right focus:border-slate-400 focus:bg-white"
                    autoComplete="off"
                  />
                </div>
              </div>

              <div className="grid gap-3 sm:grid-cols-2 lg:col-span-2 2xl:col-span-2">
                <div>
                  <label className="mb-1.5 block text-sm font-bold text-slate-200">
                    البريد الإلكتروني
                  </label>
                  <AdminInput
                    type="email"
                    value={contactEmail}
                    onChange={(e) => setContactEmail(e.target.value)}
                    placeholder="اختياري"
                    className="h-11 rounded-xl border-slate-200 bg-slate-50 text-left focus:border-slate-400 focus:bg-white"
                    autoComplete="email"
                    dir="ltr"
                  />
                </div>

                <div>
                  <label className="mb-1.5 block text-sm font-bold text-slate-200">
                    الهاتف
                  </label>
                  <AdminInput
                    type="tel"
                    inputMode="tel"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    placeholder="اختياري"
                    className="h-11 rounded-xl border-slate-200 bg-slate-50 text-left focus:border-slate-400 focus:bg-white"
                    autoComplete="tel"
                    dir="ltr"
                  />
                </div>
              </div>

              <div className="2xl:col-span-1">
                <div className="mb-1.5 flex items-center justify-between gap-2">
                  <label className="block text-sm font-bold text-slate-200">
                    POS PIN (4 أرقام)
                  </label>
                  <span className="text-xs font-bold text-cyan-300/80">إجباري</span>
                </div>
                <AdminInput
                  type="password"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  maxLength={4}
                  value={posPin}
                  onChange={(e) =>
                    setPosPin(e.target.value.replace(/\D/g, '').slice(0, 4))
                  }
                  placeholder="••••"
                  className="h-11 rounded-xl border-slate-200 bg-slate-50 text-center text-lg font-black tracking-[0.35em] focus:border-slate-400 focus:bg-white"
                  autoComplete="off"
                  dir="ltr"
                />
                <p className="mt-1.5 text-xs text-slate-500">
                  يستخدم لاحقًا للتعرف على موظف POS، ويتم حفظه كـ hash.
                </p>
              </div>

              <div className="grid gap-3 sm:grid-cols-2 lg:col-span-2 2xl:col-span-2">
                <div>
                  <label className="mb-1.5 block text-sm font-bold text-slate-200">
                    كلمة المرور
                  </label>
                  <AdminInput
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="6 أحرف أو أكثر"
                    className="h-11 rounded-xl border-slate-200 bg-slate-50 text-right focus:border-slate-400 focus:bg-white"
                    autoComplete="new-password"
                  />
                </div>

                <div>
                  <label className="mb-1.5 block text-sm font-bold text-slate-200">
                    التأكيد
                  </label>
                  <AdminInput
                    type="password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder="أعد الكتابة"
                    className="h-11 rounded-xl border-slate-200 bg-slate-50 text-right focus:border-slate-400 focus:bg-white"
                    autoComplete="new-password"
                  />
                </div>
              </div>

              <div>
                <label className="mb-1.5 block text-sm font-bold text-slate-200">
                  الوظيفة
                </label>
                <StyledDropdown
                  value={role}
                  onChange={(nextRole) => setRole(nextRole as AppRole)}
                  options={roleOptions}
                />
              </div>

              <div>
                <label className="mb-1.5 block text-sm font-bold text-slate-200">
                  الفرع
                </label>

                {isSystemAdmin ? (
                  <StyledDropdown
                    value={createBranchId}
                    onChange={setCreateBranchId}
                    disabled={loadingBranches}
                    options={[
                      {
                        label:
                          role === 'admin'
                            ? 'بدون فرع (أدمن على مستوى النظام)'
                            : 'اختر فرعًا',
                        value: '',
                      },
                      ...branches.map((branch) => ({
                        label: `${branch.name} (${branch.code})${
                          !branch.is_active ? ' - معطل' : ''
                        }`,
                        value: branch.id,
                      })),
                    ]}
                  />
                ) : (
                  <div className="flex min-h-11 items-center rounded-xl border border-cyan-300/15 bg-white/[0.045] px-3 text-right text-sm font-bold text-slate-200">
                    {getBranchName(branches, actorBranchId)}
                  </div>
                )}

                {requiresAssignedBranch(role) && !branchIdForCreate ? (
                  <p className="mt-2 text-xs font-bold text-amber-300">
                    يجب اختيار فرع لهذا المستخدم قبل الإنشاء.
                  </p>
                ) : null}
              </div>

              <div className="flex items-center justify-between gap-3 border-t border-white/10 pt-4 lg:col-span-2 2xl:col-span-3">
                <button
                  type="button"
                  onClick={() => {
                    resetForm()
                    setShowCreateForm(false)
                  }}
                  className="h-10 rounded-xl border border-white/10 bg-white/[0.045] px-3 text-xs font-bold text-slate-300 transition hover:bg-white/[0.075]"
                >
                  إلغاء
                </button>

                <button
                  type="submit"
                  disabled={!canSubmitCreate || creating}
                  className="h-12 flex-1 rounded-xl bg-gradient-to-l from-cyan-300 to-emerald-300 px-5 text-sm font-black text-slate-950 shadow-[0_0_30px_rgba(34,211,238,0.22)] transition hover:scale-[1.01] active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {creating ? 'جاري الإنشاء...' : 'إنشاء المستخدم'}
                </button>
              </div>
            </form>
          </section>
          ) : null}

          <section className="overflow-hidden rounded-[28px] border border-cyan-300/15 bg-white/[0.055] shadow-[0_24px_90px_rgba(0,0,0,0.28)] backdrop-blur-xl">
            <div className="flex flex-col gap-3 border-b border-white/10 px-5 py-4 md:flex-row md:items-center md:justify-between">
              <div className="text-right">
                <h2 className="text-2xl font-black text-white">
                  المستخدمون الحاليون
                </h2>
                <p className="mt-1 text-sm text-slate-400">
                  قائمة تشغيلية مختصرة لإدارة الصلاحيات والفروع وإجراءات الحساب.
                </p>
              </div>

              <div className="flex flex-wrap justify-end gap-2">
                <span className="rounded-full border border-emerald-300/20 bg-emerald-300/10 px-3 py-1 text-xs font-bold text-emerald-100">
                  نشط: {activeUsersCount}
                </span>
                <span className="rounded-full border border-red-300/20 bg-red-400/10 px-3 py-1 text-xs font-bold text-red-100">
                  معطل: {inactiveUsersCount}
                </span>
                <span className="rounded-full border border-cyan-300/20 bg-cyan-300/10 px-3 py-1 text-xs font-bold text-cyan-100">
                  الإجمالي: {users.length}
                </span>
                <button
                  type="button"
                  onClick={loadUsers}
                  className="h-8 rounded-lg border border-white/10 bg-white/[0.045] px-3 text-xs font-bold text-slate-200 transition hover:bg-white/[0.075]"
                >
                  تحديث
                </button>
              </div>
            </div>

            <div className="bg-transparent p-3">
              {loadingUsers ? (
                <p className="rounded-2xl border border-cyan-300/12 bg-white/[0.045] p-4 text-sm text-slate-400 shadow-sm">
                  جاري تحميل المستخدمين...
                </p>
              ) : users.length === 0 ? (
                <div className="rounded-3xl border border-dashed border-cyan-300/20 bg-cyan-300/5 p-8 text-center">
                  <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl border border-cyan-300/20 bg-[#06111f] text-cyan-200">
                    <svg
                      viewBox="0 0 24 24"
                      className="h-6 w-6"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.8"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      aria-hidden="true"
                    >
                      <path d="M16 21v-2a4 4 0 0 0-4-4H7a4 4 0 0 0-4 4v2" />
                      <circle cx="9.5" cy="7" r="3.5" />
                      <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
                      <path d="M16 3.13a3.5 3.5 0 0 1 0 6.74" />
                    </svg>
                  </div>
                  <h3 className="mt-4 text-lg font-black text-white">
                    لا يوجد مستخدمون
                  </h3>
                  <p className="mt-1 text-sm text-slate-400">
                    ابدأ بإضافة أول مستخدم للفريق من نموذج الإنشاء.
                  </p>
                  <button
                    type="button"
                    onClick={() => setShowCreateForm(true)}
                    className="mt-4 inline-flex h-10 items-center justify-center rounded-xl bg-gradient-to-l from-cyan-300 to-emerald-300 px-4 text-sm font-black text-slate-950"
                  >
                    إضافة مستخدم
                  </button>
                </div>
              ) : (
                <div className="overflow-x-auto rounded-2xl border border-cyan-300/12 bg-[#06111f]/65">
                  <table className="w-full min-w-[1180px] border-collapse text-right">
                    <thead className="bg-white/[0.035] text-xs font-black text-slate-400">
                      <tr className="[&>th]:px-4 [&>th]:py-4">
                        <th>الاسم</th>
                        <th>اسم المستخدم</th>
                        <th>الوظيفة</th>
                        <th>الفرع</th>
                        <th>الحالة</th>
                        <th>الإجراءات</th>
                      </tr>
                    </thead>

                    <tbody className="divide-y divide-white/10">
                      {users.map((user) => {
                        const isBusy = updatingUserId === user.id
                        const isMainAdmin = isPrimaryAdminUsername(user.username)
                        const scopeLabel =
                          resolveAuthScopeType(user.role, user.branch_id) === 'system'
                            ? 'نظام'
                            : 'فرع'
                        const selectedBranchId = branchSelections[user.id] || ''
                        const hasBranchChanges =
                          selectedBranchId !== (user.branch_id || '')

                        return (
                          <tr
                            key={user.id}
                            className="align-middle transition hover:bg-cyan-300/[0.035]"
                          >
                            <td className="w-[240px] px-4 py-4">
                              <div className="flex min-w-0 items-center gap-3">
                                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-cyan-300/20 bg-cyan-300/10 text-sm font-black text-cyan-100 shadow-[0_0_22px_rgba(34,211,238,0.13)]">
                                  {(user.full_name || user.username || '?').slice(0, 1)}
                                </div>
                                <div className="min-w-0">
                                  <p className="truncate text-sm font-black text-white">
                                    {user.full_name || 'بدون اسم'}
                                  </p>
                                  <p className="mt-1 text-xs font-bold text-slate-500">
                                    {scopeLabel}
                                  </p>
                                </div>
                              </div>
                            </td>

                            <td className="min-w-[190px] px-4 py-4">
                              <p className="truncate text-sm font-black text-slate-200">
                                {user.username || '-'}
                              </p>
                              {isMainAdmin ? (
                                <p className="mt-1 text-xs font-bold text-cyan-300/75">
                                  الحساب الرئيسي
                                </p>
                              ) : null}
                            </td>

                            <td className="w-[210px] px-4 py-4">
                              <StyledDropdown
                                value={user.role}
                                onChange={(nextRole) =>
                                  handleRoleChange(user.id, nextRole as AppRole)
                                }
                                disabled={isBusy || isMainAdmin}
                                title={
                                  isMainAdmin
                                    ? 'غير مسموح التعديل على الحساب الرئيسي'
                                    : ''
                                }
                                options={roleOptions}
                              />
                            </td>

                            <td className="w-[310px] px-4 py-4">
                              {isSystemAdmin ? (
                                <div
                                  className={
                                    hasBranchChanges
                                      ? 'grid grid-cols-[minmax(0,1fr)_72px] gap-2'
                                      : ''
                                  }
                                >
                                  <StyledDropdown
                                    value={selectedBranchId}
                                    onChange={(nextBranchId) =>
                                      setBranchSelections((prev) => ({
                                        ...prev,
                                        [user.id]: nextBranchId,
                                      }))
                                    }
                                    disabled={isBusy || isMainAdmin}
                                    options={[
                                      {
                                        label:
                                          user.role === 'admin'
                                            ? 'بدون فرع'
                                            : 'اختر فرعًا',
                                        value: '',
                                      },
                                      ...branches.map((branch) => ({
                                        label: `${branch.name}${
                                          !branch.is_active ? ' - معطل' : ''
                                        }`,
                                        value: branch.id,
                                      })),
                                    ]}
                                  />

                                  {hasBranchChanges ? (
                                    <button
                                      type="button"
                                      onClick={() => handleUserBranchUpdate(user)}
                                      disabled={isBusy || isMainAdmin}
                                      className="h-11 rounded-xl border border-cyan-300/20 bg-cyan-300/10 px-3 text-xs font-black text-cyan-100 transition hover:bg-cyan-300/15 disabled:cursor-not-allowed disabled:opacity-50"
                                    >
                                      حفظ
                                    </button>
                                  ) : null}
                                </div>
                              ) : (
                                <span className="inline-flex h-11 max-w-full items-center truncate rounded-xl border border-white/10 bg-white/[0.045] px-3 text-sm font-bold text-slate-200">
                                  {getBranchName(branches, user.branch_id)}
                                </span>
                              )}
                            </td>

                            <td className="w-[120px] px-4 py-4">
                              <span
                                className={`inline-flex rounded-full border px-3 py-1 text-xs font-black ${
                                  user.is_active
                                    ? 'border-emerald-300/20 bg-emerald-300/10 text-emerald-100'
                                    : 'border-red-300/20 bg-red-500/10 text-red-100'
                                }`}
                              >
                                {user.is_active ? 'نشط' : 'معطل'}
                              </span>
                            </td>

                            <td className="w-[420px] px-4 py-4">
                              <div className="grid grid-cols-[1.25fr_1fr_0.75fr_0.65fr] gap-2">
                                <button
                                  type="button"
                                  onClick={() => openResetPasswordModal(user)}
                                  disabled={isBusy}
                                  className="h-10 w-full rounded-xl border border-cyan-300/15 bg-white/[0.045] px-2 text-xs font-bold text-slate-200 transition hover:border-cyan-300/35 hover:bg-cyan-300/10 disabled:cursor-not-allowed disabled:opacity-50"
                                >
                                  إعادة كلمة المرور
                                </button>

                                <button
                                  type="button"
                                  onClick={() => openResetPosPinModal(user)}
                                  disabled={isBusy}
                                  className="h-10 w-full rounded-xl border border-emerald-300/20 bg-emerald-300/10 px-2 text-xs font-bold text-emerald-100 transition hover:border-emerald-300/35 hover:bg-emerald-300/15 disabled:cursor-not-allowed disabled:opacity-50"
                                >
                                  إعادة تعيين PIN
                                </button>

                                <button
                                  type="button"
                                  onClick={() => handleToggleStatus(user)}
                                  disabled={isBusy || isMainAdmin}
                                  className={`h-10 w-full rounded-xl border px-2 text-xs font-bold transition disabled:cursor-not-allowed disabled:opacity-50 ${
                                    user.is_active
                                      ? 'border-amber-300/20 bg-amber-300/10 text-amber-100 hover:bg-amber-300/15'
                                      : 'border-emerald-300/20 bg-emerald-300/10 text-emerald-100 hover:bg-emerald-300/15'
                                  }`}
                                >
                                  {user.is_active ? 'تعطيل' : 'تفعيل'}
                                </button>

                                <button
                                  type="button"
                                  onClick={() => handleDeleteUser(user)}
                                  disabled={isBusy || isMainAdmin}
                                  className="h-10 w-full rounded-xl border border-red-300/20 bg-red-500/10 px-2 text-xs font-bold text-red-100 transition hover:bg-red-500/15 disabled:cursor-not-allowed disabled:opacity-50"
                                >
                                  حذف
                                </button>
                              </div>
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </section>

        </div>
      </div>

      {resetModal.open ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-[28px] border border-cyan-300/15 bg-[#07111f] p-6 shadow-[0_30px_110px_rgba(0,0,0,0.55)]">
            <div className="mb-5 text-right">
              <h3 className="text-2xl font-black text-white">إعادة تعيين كلمة المرور</h3>
              <p className="mt-1 text-sm text-slate-400">المستخدم: {resetModal.username}</p>
            </div>

            <div className="space-y-4">
              <div>
                <label className="mb-2 block text-sm font-bold text-slate-200">
                  كلمة المرور الجديدة
                </label>
                <AdminInput
                  type="password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="6 أحرف أو أكثر"
                  className="h-14 border-slate-300 text-right focus:border-slate-500"
                  autoComplete="new-password"
                />
              </div>

              <div>
                <label className="mb-2 block text-sm font-bold text-slate-200">
                  تأكيد كلمة المرور الجديدة
                </label>
                <AdminInput
                  type="password"
                  value={confirmNewPassword}
                  onChange={(e) => setConfirmNewPassword(e.target.value)}
                  placeholder="أعد كتابة كلمة المرور"
                  className="h-14 border-slate-300 text-right focus:border-slate-500"
                  autoComplete="new-password"
                />
              </div>
            </div>

            <div className="mt-6 flex justify-end gap-3">
              <button
                type="button"
                onClick={closeResetModal}
                className="h-12 rounded-2xl border border-white/10 bg-white/[0.045] px-5 text-sm font-bold text-slate-200 transition hover:bg-white/[0.075]"
              >
                إلغاء
              </button>

              <button
                type="button"
                onClick={handleConfirmResetPassword}
                disabled={updatingUserId === resetModal.userId}
                className="h-12 rounded-2xl bg-gradient-to-l from-cyan-300 to-emerald-300 px-5 text-sm font-black text-slate-950 shadow-[0_0_28px_rgba(34,211,238,0.2)] disabled:opacity-60"
              >
                حفظ كلمة المرور
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {pinResetModal.open ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-[28px] border border-emerald-300/15 bg-[#07111f] p-6 shadow-[0_30px_110px_rgba(0,0,0,0.55)]">
            <div className="mb-5 text-right">
              <h3 className="text-2xl font-black text-white">إعادة تعيين POS PIN</h3>
              <p className="mt-1 text-sm text-slate-400">
                PIN الدخول إلى نقطة البيع للمستخدم: {pinResetModal.username}
              </p>
            </div>

            <div className="space-y-4">
              <div>
                <label className="mb-2 block text-sm font-bold text-slate-200">
                  PIN الدخول إلى نقطة البيع
                </label>
                <AdminInput
                  type="password"
                  value={newPosPin}
                  onChange={(e) =>
                    setNewPosPin(e.target.value.replace(/\D/g, '').slice(0, 4))
                  }
                  placeholder="4 أرقام"
                  className="h-14 border-slate-300 text-right tracking-[0.45em] focus:border-slate-500"
                  inputMode="numeric"
                  maxLength={4}
                  autoComplete="new-password"
                />
              </div>

              <div>
                <label className="mb-2 block text-sm font-bold text-slate-200">
                  تأكيد POS PIN
                </label>
                <AdminInput
                  type="password"
                  value={confirmNewPosPin}
                  onChange={(e) =>
                    setConfirmNewPosPin(
                      e.target.value.replace(/\D/g, '').slice(0, 4)
                    )
                  }
                  placeholder="أعد كتابة PIN"
                  className="h-14 border-slate-300 text-right tracking-[0.45em] focus:border-slate-500"
                  inputMode="numeric"
                  maxLength={4}
                  autoComplete="new-password"
                />
              </div>
            </div>

            <div className="mt-6 flex justify-end gap-3">
              <button
                type="button"
                onClick={closePinResetModal}
                className="h-12 rounded-2xl border border-white/10 bg-white/[0.045] px-5 text-sm font-bold text-slate-200 transition hover:bg-white/[0.075]"
              >
                إلغاء
              </button>

              <button
                type="button"
                onClick={handleConfirmResetPosPin}
                disabled={updatingUserId === pinResetModal.userId}
                className="h-12 rounded-2xl bg-gradient-to-l from-emerald-300 to-cyan-300 px-5 text-sm font-black text-slate-950 shadow-[0_0_28px_rgba(16,185,129,0.2)] disabled:opacity-60"
              >
                حفظ POS PIN
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}
