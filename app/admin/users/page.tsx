'use client'

import Link from 'next/link'
import { useEffect, useMemo, useState } from 'react'
import { AppRole, usePageAccess } from '@/hooks/use-page-access'

type ProfileRow = {
  id: string
  full_name: string | null
  username: string | null
  role: AppRole
  is_active: boolean
  created_at?: string
  updated_at?: string
}

type ResetPasswordModalState = {
  open: boolean
  userId: string
  username: string
}

const emptyForm = {
  username: '',
  fullName: '',
  password: '',
  confirmPassword: '',
  role: 'employee' as AppRole,
}

const roleOptions: { value: AppRole; label: string }[] = [
  { value: 'employee', label: 'employee' },
  { value: 'cashier', label: 'cashier' },
  { value: 'admin', label: 'admin' },
]

function RoleTabs({
  value,
  onChange,
  disabled = false,
  disabledMessage,
}: {
  value: AppRole
  onChange: (role: AppRole) => void
  disabled?: boolean
  disabledMessage?: string
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {roleOptions.map((option) => {
        const active = value === option.value

        return (
          <button
            key={option.value}
            type="button"
            disabled={disabled}
            onClick={() => onChange(option.value)}
            title={disabled ? disabledMessage || '' : ''}
            className={`h-11 rounded-2xl px-4 text-sm font-bold transition ${
              active
                ? 'border border-slate-950 bg-slate-950 text-white'
                : 'border border-slate-300 bg-white text-slate-900 hover:border-slate-400'
            } ${
              disabled
                ? 'cursor-not-allowed border-slate-200 bg-slate-100 text-slate-400 opacity-70'
                : ''
            }`}
          >
            {option.label}
          </button>
        )
      })}
    </div>
  )
}

function ActionButton({
  label,
  onClick,
  disabled = false,
  variant = 'default',
  className = '',
}: {
  label: string
  onClick: () => void
  disabled?: boolean
  variant?: 'default' | 'danger' | 'active' | 'inactive'
  className?: string
}) {
  const styles = {
    default:
      'border border-slate-300 bg-white text-slate-800 hover:border-slate-400',
    danger:
      'border border-red-300 bg-white text-red-600 hover:border-red-400',
    active:
      'border border-amber-300 bg-white text-amber-700 hover:border-amber-400',
    inactive:
      'border border-emerald-300 bg-white text-emerald-700 hover:border-emerald-400',
  }

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`h-11 rounded-2xl px-4 text-sm font-bold transition ${styles[variant]} ${
        disabled ? 'cursor-not-allowed opacity-60' : ''
      } ${className}`}
    >
      {label}
    </button>
  )
}

export default function AdminUsersPage() {
  const { loading: accessLoading, allowed } = usePageAccess(['admin'])

  const [users, setUsers] = useState<ProfileRow[]>([])
  const [loadingUsers, setLoadingUsers] = useState(false)
  const [creating, setCreating] = useState(false)
  const [updatingUserId, setUpdatingUserId] = useState<string | null>(null)

  const [username, setUsername] = useState(emptyForm.username)
  const [fullName, setFullName] = useState(emptyForm.fullName)
  const [password, setPassword] = useState(emptyForm.password)
  const [confirmPassword, setConfirmPassword] = useState(emptyForm.confirmPassword)
  const [role, setRole] = useState<AppRole>(emptyForm.role)

  const [successMessage, setSuccessMessage] = useState('')
  const [errorMessage, setErrorMessage] = useState('')

  const [resetModal, setResetModal] = useState<ResetPasswordModalState>({
    open: false,
    userId: '',
    username: '',
  })
  const [newPassword, setNewPassword] = useState('')
  const [confirmNewPassword, setConfirmNewPassword] = useState('')

  function resetForm() {
    setUsername('')
    setFullName('')
    setPassword('')
    setConfirmPassword('')
    setRole('employee')
  }

  function closeResetModal() {
    setResetModal({
      open: false,
      userId: '',
      username: '',
    })
    setNewPassword('')
    setConfirmNewPassword('')
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

      setUsers(result.users || [])
    } catch (error) {
      console.error('Load users error:', error)
      setErrorMessage(error instanceof Error ? error.message : 'تعذر تحميل المستخدمين')
    } finally {
      setLoadingUsers(false)
    }
  }

  useEffect(() => {
    if (!accessLoading && allowed) {
      loadUsers()
      resetForm()
    }
  }, [accessLoading, allowed])

  const canSubmitCreate = useMemo(() => {
    return (
      username.trim().length > 0 &&
      password.trim().length >= 6 &&
      confirmPassword.trim().length >= 6 &&
      password === confirmPassword
    )
  }, [username, password, confirmPassword])

  async function handleCreateUser(e: React.FormEvent) {
    e.preventDefault()

    try {
      setCreating(true)
      setSuccessMessage('')
      setErrorMessage('')

      if (!username.trim()) {
        throw new Error('يرجى كتابة اسم المستخدم')
      }

      if (password.trim().length < 6) {
        throw new Error('كلمة المرور يجب أن تكون 6 أحرف أو أكثر')
      }

      if (password !== confirmPassword) {
        throw new Error('تأكيد كلمة المرور غير مطابق')
      }

      const response = await fetch('/api/admin/create-user', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          username,
          full_name: fullName,
          password,
          role,
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
      setErrorMessage(error instanceof Error ? error.message : 'حدث خطأ أثناء إنشاء المستخدم')
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
        throw new Error(result?.details || result?.error || 'فشل تحديث الصلاحية')
      }

      setSuccessMessage('تم تحديث الصلاحية بنجاح')
      await loadUsers()
    } catch (error) {
      console.error('Update role error:', error)
      setErrorMessage(error instanceof Error ? error.message : 'تعذر تحديث الصلاحية')
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
        throw new Error(result?.details || result?.error || 'فشل تحديث حالة المستخدم')
      }

      setSuccessMessage(result.message || 'تم تحديث حالة المستخدم بنجاح')
      await loadUsers()
    } catch (error) {
      console.error('Toggle user status error:', error)
      setErrorMessage(error instanceof Error ? error.message : 'تعذر تحديث حالة المستخدم')
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
        throw new Error(result?.details || result?.error || 'فشل إعادة تعيين كلمة المرور')
      }

      setSuccessMessage(result.message || 'تمت إعادة تعيين كلمة المرور بنجاح')
      closeResetModal()
    } catch (error) {
      console.error('Reset password error:', error)
      setErrorMessage(error instanceof Error ? error.message : 'تعذر إعادة تعيين كلمة المرور')
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
      setErrorMessage(error instanceof Error ? error.message : 'تعذر حذف المستخدم')
    } finally {
      setUpdatingUserId(null)
    }
  }

  if (accessLoading) {
    return (
      <main className="min-h-screen bg-slate-50 p-4 md:p-6">
        <div className="mx-auto max-w-7xl">
          <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
            جاري التحقق من الصلاحية...
          </div>
        </div>
      </main>
    )
  }

  if (!allowed) {
    return (
      <main className="min-h-screen bg-slate-50 p-4 md:p-6">
        <div className="mx-auto max-w-7xl">
          <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
            <h1 className="text-2xl font-black text-slate-900">غير مصرح لك</h1>
            <p className="mt-2 text-slate-600">هذه الصفحة متاحة للأدمن فقط.</p>

            <div className="mt-4">
              <Link
                href="/"
                className="inline-flex items-center rounded-2xl bg-slate-950 px-4 py-2 text-white"
              >
                العودة إلى القائمة الرئيسية
              </Link>
            </div>
          </div>
        </div>
      </main>
    )
  }

  return (
    <main className="min-h-screen bg-slate-50 p-4 md:p-6">
      <div className="mx-auto max-w-7xl space-y-6">
        <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
          <div className="text-right">
            <h1 className="text-4xl font-black text-slate-900">إدارة المستخدمين</h1>
            <p className="mt-1 text-sm text-slate-500">
              إنشاء المستخدمين وتعديل الصلاحيات وإدارة الحسابات
            </p>
          </div>

          <Link
            href="/"
            className="inline-flex items-center justify-center rounded-2xl bg-slate-950 px-5 py-3 text-sm font-bold text-white"
          >
            العودة إلى القائمة الرئيسية
          </Link>
        </div>

        {successMessage ? (
          <div className="rounded-2xl border border-green-200 bg-green-50 px-4 py-3 text-sm font-medium text-green-700">
            {successMessage}
          </div>
        ) : null}

        {errorMessage ? (
          <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-700 whitespace-pre-wrap">
            {errorMessage}
          </div>
        ) : null}

        <section className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-sm md:p-7">
          <div className="mb-6 text-right">
            <h2 className="text-2xl font-black text-slate-900">إنشاء مستخدم جديد</h2>
          </div>

          <form onSubmit={handleCreateUser} className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div>
              <label className="mb-2 block text-sm font-bold text-slate-700">
                اسم المستخدم
              </label>
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="مثال: Faisal"
                className="h-14 w-full rounded-2xl border border-slate-300 bg-white px-4 text-right outline-none focus:border-slate-500"
                autoComplete="off"
              />
            </div>

            <div>
              <label className="mb-2 block text-sm font-bold text-slate-700">
                الاسم الكامل
              </label>
              <input
                type="text"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                placeholder="اختياري"
                className="h-14 w-full rounded-2xl border border-slate-300 bg-white px-4 text-right outline-none focus:border-slate-500"
                autoComplete="off"
              />
            </div>

            <div>
              <label className="mb-2 block text-sm font-bold text-slate-700">
                كلمة المرور
              </label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="6 أحرف أو أكثر"
                className="h-14 w-full rounded-2xl border border-slate-300 bg-white px-4 text-right outline-none focus:border-slate-500"
                autoComplete="new-password"
              />
            </div>

            <div>
              <label className="mb-2 block text-sm font-bold text-slate-700">
                تأكيد كلمة المرور
              </label>
              <input
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="أعد كتابة كلمة المرور"
                className="h-14 w-full rounded-2xl border border-slate-300 bg-white px-4 text-right outline-none focus:border-slate-500"
                autoComplete="new-password"
              />
            </div>

            <div className="md:col-span-2">
              <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
                <div className="text-right">
                  <label className="mb-2 block text-sm font-bold text-slate-700">
                    الصلاحية
                  </label>
                  <RoleTabs value={role} onChange={setRole} />
                </div>

                <div className="flex flex-wrap items-center gap-3 lg:self-end">
                  <ActionButton
                    label="مسح الحقول"
                    onClick={resetForm}
                    className="min-w-[140px]"
                  />

                  <button
                    type="submit"
                    disabled={!canSubmitCreate || creating}
                    className="h-11 min-w-[160px] rounded-2xl bg-slate-950 px-6 text-sm font-bold text-white transition disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {creating ? 'جاري إنشاء المستخدم...' : 'إنشاء المستخدم'}
                  </button>
                </div>
              </div>
            </div>
          </form>
        </section>

        <section className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-sm md:p-7">
          <div className="mb-5 flex items-center justify-between">
            <h2 className="text-2xl font-black text-slate-900">المستخدمون الحاليون</h2>

            <ActionButton label="تحديث" onClick={loadUsers} />
          </div>

          {loadingUsers ? (
            <p className="text-slate-500">جاري تحميل المستخدمين...</p>
          ) : users.length === 0 ? (
            <p className="text-slate-500">لا يوجد مستخدمون حاليًا.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full">
                <thead>
                  <tr className="border-b border-slate-200 text-right">
                    <th className="px-3 py-3 text-sm font-bold text-slate-700">الاسم الكامل</th>
                    <th className="px-3 py-3 text-sm font-bold text-slate-700">اسم المستخدم</th>
                    <th className="px-3 py-3 text-sm font-bold text-slate-700">الصلاحية</th>
                    <th className="px-3 py-3 text-sm font-bold text-slate-700">الحالة</th>
                    <th className="px-3 py-3 text-sm font-bold text-slate-700">تغيير الصلاحية</th>
                    <th className="px-3 py-3 text-sm font-bold text-slate-700">إعادة كلمة المرور</th>
                    <th className="px-3 py-3 text-sm font-bold text-slate-700">تعطيل / تفعيل</th>
                    <th className="px-3 py-3 text-sm font-bold text-slate-700">حذف</th>
                  </tr>
                </thead>
                <tbody>
                  {users.map((user) => {
                    const isBusy = updatingUserId === user.id
                    const isMainAdmin = user.username === 'admin'

                    return (
                      <tr key={user.id} className="border-b border-slate-100 align-top">
                        <td className="px-3 py-4 text-slate-700">{user.full_name || '-'}</td>
                        <td className="px-3 py-4 text-slate-700">{user.username || '-'}</td>
                        <td className="px-3 py-4 text-slate-700">{user.role}</td>
                        <td className="px-3 py-4">
                          <span
                            className={`inline-flex rounded-full px-3 py-1 text-xs font-bold ${
                              user.is_active
                                ? 'bg-green-100 text-green-700'
                                : 'bg-red-100 text-red-700'
                            }`}
                          >
                            {user.is_active ? 'نشط' : 'معطل'}
                          </span>
                        </td>
                        <td className="px-3 py-4">
                          <RoleTabs
                            value={user.role}
                            onChange={(newRole) => handleRoleChange(user.id, newRole)}
                            disabled={isBusy || isMainAdmin}
                            disabledMessage={
                              isMainAdmin ? 'غير مسموح التعديل على الحساب الرئيسي' : undefined
                            }
                          />
                        </td>
                        <td className="px-3 py-4">
                          <ActionButton
                            label="إعادة التعيين"
                            onClick={() => openResetPasswordModal(user)}
                            disabled={isBusy}
                          />
                        </td>
                        <td className="px-3 py-4">
                          <ActionButton
                            label={user.is_active ? 'تعطيل' : 'تفعيل'}
                            onClick={() => handleToggleStatus(user)}
                            disabled={isBusy || isMainAdmin}
                            variant={user.is_active ? 'active' : 'inactive'}
                          />
                        </td>
                        <td className="px-3 py-4">
                          <ActionButton
                            label="حذف"
                            onClick={() => handleDeleteUser(user)}
                            disabled={isBusy || isMainAdmin}
                            variant="danger"
                          />
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>

      {resetModal.open ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
          <div className="w-full max-w-md rounded-[28px] bg-white p-6 shadow-2xl">
            <div className="mb-5 text-right">
              <h3 className="text-2xl font-black text-slate-900">إعادة تعيين كلمة المرور</h3>
              <p className="mt-1 text-sm text-slate-500">المستخدم: {resetModal.username}</p>
            </div>

            <div className="space-y-4">
              <div>
                <label className="mb-2 block text-sm font-bold text-slate-700">
                  كلمة المرور الجديدة
                </label>
                <input
                  type="password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="6 أحرف أو أكثر"
                  className="h-14 w-full rounded-2xl border border-slate-300 bg-white px-4 text-right outline-none focus:border-slate-500"
                  autoComplete="new-password"
                />
              </div>

              <div>
                <label className="mb-2 block text-sm font-bold text-slate-700">
                  تأكيد كلمة المرور الجديدة
                </label>
                <input
                  type="password"
                  value={confirmNewPassword}
                  onChange={(e) => setConfirmNewPassword(e.target.value)}
                  placeholder="أعد كتابة كلمة المرور"
                  className="h-14 w-full rounded-2xl border border-slate-300 bg-white px-4 text-right outline-none focus:border-slate-500"
                  autoComplete="new-password"
                />
              </div>
            </div>

            <div className="mt-6 flex justify-end gap-3">
              <ActionButton label="إلغاء" onClick={closeResetModal} />

              <button
                type="button"
                onClick={handleConfirmResetPassword}
                disabled={updatingUserId === resetModal.userId}
                className="h-12 rounded-2xl bg-slate-950 px-5 text-sm font-bold text-white disabled:opacity-60"
              >
                حفظ كلمة المرور
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </main>
  )
}