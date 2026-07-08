'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { AdminDarkSelect } from '@/components/admin-dark-select'
import { AdminInput } from '@/components/admin-input'
import { AdminAlert, AdminGlassSection, AdminLoadingState } from '@/components/admin-ui'
import { FeatureDisabledState } from '@/components/feature-disabled-state'
import { useSystemSettings } from '@/hooks/use-system-settings'
import {
  type AdminBranchRecord,
  requiresAssignedBranch,
} from '@/lib/admin/branches'
import {
  createEmptyAdminUserPayload,
  isValidAdminPosPin,
  isPrimaryAdminUsername,
} from '@/lib/admin/users'
import { resolveAuthScopeType } from '@/lib/auth-profile'
import { AppRole, usePageAccess } from '@/hooks/use-page-access'

type ProfileRow = {
  id: string
  tenant_id?: string | null
  full_name: string | null
  username: string | null
  contact_email?: string | null
  role: AppRole
  is_active: boolean
  branch_id: string | null
  account_type?: 'profile' | 'pos_profile'
  has_pos_pin?: boolean
  pos_pin?: string | null
  created_by_name?: string | null
  created_by_username?: string | null
  created_at?: string
  updated_at?: string
}

type ResetPasswordModalState = {
  open: boolean
  userId: string
  username: string
}

type DeleteUserModalState = {
  open: boolean
  user: ProfileRow | null
}

type EditUserDrawerState = {
  open: boolean
  user: ProfileRow | null
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
  admin: 'مدير',
  manager: 'مدير',
  employee: 'موظف',
  cashier: 'كاشير',
}

const EMAIL_LOGIN_ROLES = new Set<AppRole>(['admin', 'manager', 'employee'])
const USER_FORM_ROLE_VALUES: AppRole[] = ['admin', 'employee', 'cashier']

function getRoleDisplayLabel(role: AppRole | string) {
  return ROLE_DISPLAY_LABELS[role as AppRole] || 'غير معروف'
}

function getRoleBadgeClassName(role: AppRole | string) {
  if (role === 'admin' || role === 'manager') {
    return 'border-emerald-300/25 bg-emerald-400/10 text-emerald-100 shadow-[0_0_18px_rgba(16,185,129,0.1)]'
  }

  if (role === 'employee') {
    return 'border-cyan-300/25 bg-cyan-400/10 text-cyan-100 shadow-[0_0_18px_rgba(34,211,238,0.1)]'
  }

  if (role === 'cashier') {
    return 'border-amber-300/25 bg-amber-400/10 text-amber-100 shadow-[0_0_18px_rgba(245,158,11,0.1)]'
  }

  return 'border-slate-400/20 bg-slate-400/10 text-slate-300'
}

function isEmailLoginRole(role: AppRole | '') {
  return Boolean(role && EMAIL_LOGIN_ROLES.has(role))
}

function isValidEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim())
}

function mergeDuplicateUserRows(users: ProfileRow[]) {
  const usersById = new Map<string, ProfileRow>()

  for (const user of users) {
    const existingUser = usersById.get(user.id)

    if (!existingUser) {
      usersById.set(user.id, user)
      continue
    }

    const primaryUser =
      user.account_type === 'profile' && existingUser.account_type !== 'profile'
        ? user
        : existingUser
    const secondaryUser = primaryUser === user ? existingUser : user

    usersById.set(user.id, {
      ...primaryUser,
      username: primaryUser.username || secondaryUser.username,
      tenant_id: primaryUser.tenant_id || secondaryUser.tenant_id,
      branch_id: primaryUser.branch_id || secondaryUser.branch_id,
      full_name: primaryUser.full_name || secondaryUser.full_name,
      is_active: primaryUser.is_active,
      created_by_name:
        primaryUser.created_by_name || secondaryUser.created_by_name,
      created_by_username:
        primaryUser.created_by_username || secondaryUser.created_by_username,
      created_at: primaryUser.created_at || secondaryUser.created_at,
      updated_at: primaryUser.updated_at || secondaryUser.updated_at,
      has_pos_pin: Boolean(primaryUser.has_pos_pin || secondaryUser.has_pos_pin),
      pos_pin: primaryUser.pos_pin || secondaryUser.pos_pin || null,
    })
  }

  return Array.from(usersById.values())
}

const DRAWER_INPUT_CLASS =
  'h-14 w-full rounded-[18px] !border !border-[#263447] !bg-[#0b1422]/90 py-0 text-right text-sm font-bold !text-slate-100 !shadow-none !outline-none transition placeholder:!text-slate-500 hover:!border-cyan-300/25 hover:!bg-[#0d1828] focus:!border-cyan-300/50 focus:!bg-[#0d1828] focus:!ring-2 focus:!ring-cyan-300/10 !pl-4 !pr-[56px]'

const DRAWER_INPUT_LTR_CLASS =
  'h-14 w-full rounded-[18px] !border !border-[#263447] !bg-[#0b1422]/90 py-0 text-right text-sm font-bold !text-slate-100 !shadow-none !outline-none transition placeholder:!text-slate-500 hover:!border-cyan-300/25 hover:!bg-[#0d1828] focus:!border-cyan-300/50 focus:!bg-[#0d1828] focus:!ring-2 focus:!ring-cyan-300/10 !pl-4 !pr-[56px]'

const BRANCH_PRIMARY_BUTTON_TYPOGRAPHY =
  'font-sans text-sm font-black leading-5 tracking-normal antialiased !text-slate-950'

function StyledDropdown({
  value,
  options,
  onChange,
  disabled = false,
  title,
  placeholder = 'اختر',
  variant = 'default',
}: {
  value: string
  options: DropdownOption[]
  onChange: (value: string) => void
  disabled?: boolean
  title?: string
  placeholder?: string
  variant?: 'default' | 'drawer'
}) {
  const drawerPlaceholderClass =
    variant === 'drawer' && !value ? '[&>span:last-child]:!text-slate-500' : ''

  return (
    <AdminDarkSelect
      value={value}
      options={options}
      onChange={onChange}
      disabled={disabled}
      placeholder={placeholder}
      ariaLabel={title || placeholder}
      triggerClassName={
        variant === 'drawer'
          ? `h-14 flex-row-reverse rounded-[18px] !border-[#263447] !bg-[#0b1422]/90 text-right text-sm font-bold !text-slate-100 !shadow-none hover:!border-cyan-300/25 hover:!bg-[#0d1828] focus:!border-cyan-300/50 focus:!ring-cyan-300/10 [&>span:first-child]:!text-slate-300 [&>span:last-child]:!text-right ${drawerPlaceholderClass} !pl-4 !pr-[56px]`
          : 'h-11 rounded-xl border-white/10 bg-white/[0.045] px-3 text-sm text-white hover:border-cyan-300/35 hover:bg-cyan-300/10 focus:border-cyan-300/50 focus:ring-cyan-300/15'
      }
      menuClassName="border-cyan-300/20 bg-[#07111f]"
    />
  )
}

export default function AdminUsersPage() {
  const access = usePageAccess(['admin'])
  const { loading: accessLoading, allowed, scopeType, branchId: actorBranchId } =
    access
  const { settings: systemSettings, loading: settingsLoading } =
    useSystemSettings(allowed && !accessLoading)
  const isSystemAdmin = scopeType === 'system'

  const [users, setUsers] = useState<ProfileRow[]>([])
  const [branches, setBranches] = useState<AdminBranchRecord[]>([])
  const [loadingUsers, setLoadingUsers] = useState(false)
  const [loadingBranches, setLoadingBranches] = useState(false)
  const [creating, setCreating] = useState(false)
  const [showCreateForm, setShowCreateForm] = useState(false)
  const [savingEdit, setSavingEdit] = useState(false)
  const [updatingUserId, setUpdatingUserId] = useState<string | null>(null)

  const [fullName, setFullName] = useState(emptyForm.fullName)
  const [contactEmail, setContactEmail] = useState(emptyForm.contactEmail)
  const [phone, setPhone] = useState(emptyForm.phone)
  const [posPin, setPosPin] = useState(emptyForm.posPin)
  const [password, setPassword] = useState(emptyForm.password)
  const [confirmPassword, setConfirmPassword] = useState(
    emptyForm.confirmPassword
  )
  const [role, setRole] = useState<AppRole | ''>('')
  const [createBranchId, setCreateBranchId] = useState(emptyForm.branchId)
  const [editFullName, setEditFullName] = useState('')
  const [editUsername, setEditUsername] = useState('')
  const [editContactEmail, setEditContactEmail] = useState('')
  const [editAdminPassword, setEditAdminPassword] = useState('')
  const [editConfirmAdminPassword, setEditConfirmAdminPassword] = useState('')
  const [editRole, setEditRole] = useState<AppRole | ''>('')
  const [editBranchId, setEditBranchId] = useState('')
  const [editPosPin, setEditPosPin] = useState('')
  const [showEditPosPin, setShowEditPosPin] = useState(false)

  const [successMessage, setSuccessMessage] = useState('')
  const [errorMessage, setErrorMessage] = useState('')
  const [searchTerm, setSearchTerm] = useState('')
  const [statusFilter, setStatusFilter] = useState<
    'all' | 'active' | 'inactive'
  >('all')

  const [resetModal, setResetModal] = useState<ResetPasswordModalState>({
    open: false,
    userId: '',
    username: '',
  })
  const [deleteModal, setDeleteModal] = useState<DeleteUserModalState>({
    open: false,
    user: null,
  })
  const [editDrawer, setEditDrawer] = useState<EditUserDrawerState>({
    open: false,
    user: null,
  })
  const [newPassword, setNewPassword] = useState('')
  const [confirmNewPassword, setConfirmNewPassword] = useState('')
  const pinInputRefs = useRef<Array<HTMLInputElement | null>>([])

  const resetForm = useCallback(() => {
    setFullName('')
    setContactEmail('')
    setPhone('')
    setPosPin('')
    setPassword('')
    setConfirmPassword('')
    setRole('')
    setCreateBranchId(isSystemAdmin ? '' : actorBranchId || '')
  }, [actorBranchId, isSystemAdmin])

  function generateRandomPin() {
    return String(Math.floor(1000 + Math.random() * 9000))
  }

  function generateInternalPosUsername() {
    const randomPart = Math.random().toString(36).slice(2, 8)
    return `pos_${Date.now().toString(36)}_${randomPart}`
  }

  function openCreateDrawer() {
    resetForm()
    setShowCreateForm(true)
  }

  function openEditDrawer(user: ProfileRow) {
    setSuccessMessage('')
    setErrorMessage('')
    setEditFullName(user.full_name || '')
    setEditUsername(user.username || '')
    setEditContactEmail(user.contact_email || '')
    setEditAdminPassword('')
    setEditConfirmAdminPassword('')
    setEditRole(user.role)
    setEditBranchId(user.branch_id || '')
    setEditPosPin(user.pos_pin || '')
    setShowEditPosPin(false)
    setEditDrawer({
      open: true,
      user,
    })
  }

  function closeEditDrawer() {
    setEditDrawer({
      open: false,
      user: null,
    })
    setEditFullName('')
    setEditUsername('')
    setEditContactEmail('')
    setEditAdminPassword('')
    setEditConfirmAdminPassword('')
    setEditRole('')
    setEditBranchId('')
    setEditPosPin('')
    setShowEditPosPin(false)
  }

  function handleCreateRoleChange(nextRole: string) {
    setRole(nextRole as AppRole)

    if (!isEmailLoginRole(nextRole as AppRole)) {
      setContactEmail('')
      setPassword('')
      setConfirmPassword('')
    }

    if (nextRole && !posPin) {
      setPosPin(generateRandomPin())
    }
  }

  function handleEditRoleChange(nextRole: string) {
    const nextAppRole = nextRole as AppRole

    setEditRole(nextAppRole)

    if (!isEmailLoginRole(nextAppRole)) {
      setEditContactEmail('')
      setEditAdminPassword('')
      setEditConfirmAdminPassword('')
    }
  }

  function handleGenerateNewPin() {
    setPosPin(generateRandomPin())
  }

  function updatePinDigit(index: number, value: string) {
    const digit = value.replace(/\D/g, '').slice(-1)
    const nextDigits = posPin.padEnd(4, '').slice(0, 4).split('')
    nextDigits[index] = digit
    setPosPin(nextDigits.join('').slice(0, 4))

    if (digit && index < 3) {
      pinInputRefs.current[index + 1]?.focus()
    }
  }

  function handlePinKeyDown(
    index: number,
    event: React.KeyboardEvent<HTMLInputElement>
  ) {
    if (event.key === 'Backspace' && !posPin[index] && index > 0) {
      pinInputRefs.current[index - 1]?.focus()
    }
  }

  function handlePinPaste(event: React.ClipboardEvent<HTMLInputElement>) {
    event.preventDefault()
    const pastedPin = event.clipboardData
      .getData('text')
      .replace(/\D/g, '')
      .slice(0, 4)

    if (pastedPin) {
      setPosPin(pastedPin)
      pinInputRefs.current[Math.min(pastedPin.length, 4) - 1]?.focus()
    }
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

  function closeDeleteModal() {
    setDeleteModal({
      open: false,
      user: null,
    })
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

      const nextUsers = mergeDuplicateUserRows((result.users || []) as ProfileRow[])
      setUsers(nextUsers)
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
      const timer = window.setTimeout(() => {
        void Promise.all([loadUsers(), loadBranches()])
        resetForm()
      }, 0)

      return () => window.clearTimeout(timer)
    }
  }, [accessLoading, allowed, resetForm])

  const branchIdForCreate = isSystemAdmin ? createBranchId : actorBranchId || ''
  const createRequiresBranch = role ? requiresAssignedBranch(role) : false

  const canSubmitCreate = useMemo(() => {
    if (
      !fullName.trim() ||
      !role ||
      (createRequiresBranch && !branchIdForCreate) ||
      !isValidAdminPosPin(posPin)
    ) {
      return false
    }

    if (isEmailLoginRole(role)) {
      const normalizedEmail = contactEmail.trim()
      const normalizedPassword = password.trim()
      const normalizedConfirmPassword = confirmPassword.trim()

      return (
        isValidEmail(normalizedEmail) &&
        normalizedPassword.length >= 6 &&
        normalizedPassword === normalizedConfirmPassword
      )
    }

    return true
  }, [
    branchIdForCreate,
    confirmPassword,
    contactEmail,
    createRequiresBranch,
    fullName,
    password,
    posPin,
    role,
  ])

  const activeUsersCount = useMemo(
    () => users.filter((user) => user.is_active).length,
    [users]
  )

  const inactiveUsersCount = users.length - activeUsersCount
  const normalizedSearchTerm = searchTerm.trim().toLowerCase()
  const filteredUsers = useMemo(
    () =>
      users.filter((user) => {
        if (statusFilter === 'active' && !user.is_active) return false
        if (statusFilter === 'inactive' && user.is_active) return false
        if (!normalizedSearchTerm) return true

        const searchableValues = [
          user.full_name,
          user.username,
          getRoleDisplayLabel(user.role),
          getBranchName(branches, user.branch_id),
        ]

        return searchableValues.some((value) =>
          String(value || '').toLowerCase().includes(normalizedSearchTerm)
        )
      }),
    [branches, normalizedSearchTerm, statusFilter, users]
  )

  const roleOptions = useMemo(
    () =>
      USER_FORM_ROLE_VALUES.map((roleValue) => ({
        label: getRoleDisplayLabel(roleValue),
        value: roleValue,
      })),
    []
  )
  const editRoleOptions = roleOptions

  const shouldShowEditEmail = isEmailLoginRole(editRole)

  async function handleCreateUser(e: React.FormEvent) {
    e.preventDefault()

    try {
      setCreating(true)
      setSuccessMessage('')
      setErrorMessage('')

      if (!fullName.trim()) {
        throw new Error('يرجى كتابة الاسم')
      }

      const normalizedPosPin = posPin.trim()

      if (!isValidAdminPosPin(normalizedPosPin)) {
        throw new Error('POS PIN يجب أن يتكون من 4 أرقام')
      }

      if (!role) {
        throw new Error('يرجى اختيار الوظيفة')
      }

      if (requiresAssignedBranch(role) && !branchIdForCreate) {
        throw new Error('يرجى اختيار فرع لهذا المستخدم')
      }

      const normalizedEmail = contactEmail.trim().toLowerCase()
      const normalizedPassword = password.trim()
      const normalizedConfirmPassword = confirmPassword.trim()

      if (isEmailLoginRole(role)) {
        if (!normalizedEmail) {
          throw new Error('البريد الإلكتروني مطلوب لحسابات المدير والإداري')
        }

        if (!isValidEmail(normalizedEmail)) {
          throw new Error('صيغة البريد الإلكتروني غير صحيحة')
        }

        if (normalizedPassword.length < 6) {
          throw new Error('كلمة المرور يجب أن تكون 6 أحرف أو أكثر')
        }

        if (normalizedPassword !== normalizedConfirmPassword) {
          throw new Error('تأكيد كلمة المرور غير مطابق')
        }
      }

      const generatedUsername = generateInternalPosUsername()

      const response = await fetch('/api/admin/create-user', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          username: generatedUsername,
          full_name: fullName,
          contact_email: isEmailLoginRole(role) ? normalizedEmail : null,
          phone: phone.trim() || null,
          password: isEmailLoginRole(role) ? normalizedPassword : '',
          password_confirmation: isEmailLoginRole(role)
            ? normalizedConfirmPassword
            : '',
          pos_pin: normalizedPosPin,
          role,
          branch_id: branchIdForCreate || null,
        }),
      })

      const result = await response.json()

      if (!response.ok) {
        throw new Error(result?.details || result?.error || 'فشل إنشاء المستخدم')
      }

      setSuccessMessage('تم إنشاء المستخدم بنجاح')
      resetForm()
      setShowCreateForm(false)
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

  async function handleSaveEditUser(e: React.FormEvent) {
    e.preventDefault()

    const user = editDrawer.user

    if (!user || !editRole) return

    const nextBranchId = isSystemAdmin ? editBranchId : actorBranchId || ''
    const isEditingEmailLoginUser = isEmailLoginRole(editRole)
    const isConvertingPosToEmailLogin =
      user.account_type === 'pos_profile' && isEditingEmailLoginUser

    try {
      setSavingEdit(true)
      setUpdatingUserId(user.id)
      setSuccessMessage('')
      setErrorMessage('')

      if (requiresAssignedBranch(editRole) && !nextBranchId) {
        throw new Error('يجب اختيار فرع لهذا المستخدم')
      }

      const nextUsername =
        editUsername.trim() ||
        user.username ||
        (editRole === 'cashier' ? generateInternalPosUsername() : '')

      if (!nextUsername) {
        throw new Error('اسم المستخدم مطلوب')
      }

      const normalizedEditEmail = editContactEmail.trim().toLowerCase()
      const normalizedEditAdminPassword = editAdminPassword.trim()
      const normalizedEditConfirmAdminPassword =
        editConfirmAdminPassword.trim()
      const normalizedEditPosPin = editPosPin.trim()

      if (normalizedEditPosPin && !isValidAdminPosPin(normalizedEditPosPin)) {
        throw new Error('POS PIN يجب أن يتكون من 4 أرقام')
      }

      if (!user.has_pos_pin && !normalizedEditPosPin) {
        throw new Error('POS PIN مطلوب لهذا المستخدم')
      }

      if (isEditingEmailLoginUser) {
        if (!isEmailLoginRole(editRole)) {
          throw new Error('حسابات لوحة التحكم يجب أن تكون مدير أو إداري')
        }

        if (!normalizedEditEmail) {
          throw new Error('البريد الإلكتروني مطلوب لحسابات المدير والإداري')
        }

        if (!isValidEmail(normalizedEditEmail)) {
          throw new Error('صيغة البريد الإلكتروني غير صحيحة')
        }

        if (isConvertingPosToEmailLogin && !normalizedEditAdminPassword) {
          throw new Error('كلمة مرور لوحة التحكم مطلوبة عند تحويل أمين الصندوق')
        }

        if (
          normalizedEditAdminPassword &&
          normalizedEditAdminPassword.length < 6
        ) {
          throw new Error('كلمة مرور لوحة التحكم يجب أن تكون 6 أحرف أو أكثر')
        }

        if (
          normalizedEditAdminPassword &&
          !normalizedEditConfirmAdminPassword
        ) {
          throw new Error('تأكيد كلمة مرور لوحة التحكم مطلوب')
        }

        if (
          normalizedEditAdminPassword &&
          normalizedEditAdminPassword !== normalizedEditConfirmAdminPassword
        ) {
          throw new Error('تأكيد كلمة مرور لوحة التحكم غير مطابق')
        }
      }

      const response = await fetch('/api/admin/update-pos-user', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          userId: user.id,
          username: nextUsername,
          full_name: editFullName,
          contact_email: isEditingEmailLoginUser ? normalizedEditEmail : null,
          admin_password: isEditingEmailLoginUser
            ? normalizedEditAdminPassword
            : '',
          admin_password_confirmation: isEditingEmailLoginUser
            ? normalizedEditConfirmAdminPassword
            : '',
          role: editRole,
          branch_id: nextBranchId,
          pos_pin: normalizedEditPosPin || null,
        }),
      })

      const result = await response.json()

      if (!response.ok) {
        throw new Error(
          result?.details || result?.error || 'تعذر تحديث مستخدم POS'
        )
      }

      closeEditDrawer()
      setSuccessMessage('تم تحديث المستخدم بنجاح')
      await loadUsers()
    } catch (error) {
      console.error('Edit user error:', error)
      setErrorMessage(
        error instanceof Error ? error.message : 'تعذر تحديث المستخدم'
      )
    } finally {
      setSavingEdit(false)
      setUpdatingUserId(null)
    }
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

  function openDeleteModal(user: ProfileRow) {
    setDeleteModal({
      open: true,
      user,
    })
  }

  async function handleConfirmDeleteUser() {
    const user = deleteModal.user

    if (!user) return

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

      if (!response.ok) {
        throw new Error('فشل حذف المستخدم')
      }

      setSuccessMessage('تم حذف المستخدم بنجاح')
      closeDeleteModal()
      await loadUsers()
    } catch (error) {
      console.error('Delete user error:', error)
      setErrorMessage('فشل حذف المستخدم')
    } finally {
      setUpdatingUserId(null)
    }
  }

  if (accessLoading) {
    return (
      <div className="min-h-full bg-[#030714] p-4 text-white md:p-6">
        <AdminLoadingState className="rounded-3xl" />
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

  if (!settingsLoading && systemSettings?.enable_users === false) {
    return (
      <FeatureDisabledState
        title="ميزة المستخدمين غير مفعلة"
        message="تم تعطيل إدارة المستخدمين من إعدادات النظام."
      />
    )
  }

  return (
    <div className="relative min-h-screen overflow-hidden bg-[#030714] text-white [&_.border-slate-100]:border-white/10 [&_.border-slate-200]:border-white/10 [&_.bg-slate-50]:bg-white/[0.045] [&_.bg-white]:bg-white/[0.045] [&_.divide-slate-100]:divide-white/10 [&_.field-input]:border-cyan-300/15 [&_.field-input]:bg-white/[0.045] [&_.field-input]:text-white [&_.field-input]:placeholder:text-slate-500 [&_.field-input]:focus:border-cyan-300/50 [&_.field-input]:focus:bg-white/[0.07] [&_.text-slate-950]:text-white [&_.text-slate-900]:text-white [&_.text-slate-700]:text-slate-200 [&_.text-slate-600]:text-slate-300 [&_.text-slate-500]:text-slate-400">
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute right-[-12rem] top-[-10rem] h-[34rem] w-[34rem] rounded-full bg-cyan-400/16 blur-[130px]" />
        <div className="absolute left-[-16rem] top-[16rem] h-[36rem] w-[36rem] rounded-full bg-emerald-400/10 blur-[140px]" />
        <div className="absolute bottom-[-16rem] right-[20%] h-[34rem] w-[34rem] rounded-full bg-blue-500/10 blur-[150px]" />
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(34,211,238,0.09),transparent_34%),linear-gradient(rgba(255,255,255,0.03)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.024)_1px,transparent_1px)] bg-[size:auto,72px_72px,72px_72px] opacity-80" />
      </div>

      <div className="relative z-10 mx-auto max-w-7xl space-y-5 px-3 py-4 sm:px-4 lg:px-6">
        <header className="overflow-hidden rounded-[28px] border border-cyan-300/15 bg-white/[0.055] p-5 text-right shadow-[0_24px_90px_rgba(0,0,0,0.32)] backdrop-blur-xl md:p-6">
          <div className="flex flex-col gap-5 md:flex-row md:items-center md:justify-between">
            <div className="flex items-center gap-4">
              <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl border border-cyan-300/20 bg-cyan-300/10 text-cyan-200 shadow-[0_0_28px_rgba(34,211,238,0.14)]">
                <svg
                  viewBox="0 0 24 24"
                  className="h-7 w-7"
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
              <div>
                <p className="text-xs font-black uppercase tracking-[0.24em] text-cyan-300/80">
                  مستخدمو AFEX
                </p>
                <h1 className="mt-2 text-3xl font-black text-white">
                  إدارة المستخدمين
                </h1>
                <p className="mt-2 max-w-2xl text-sm font-medium leading-6 text-slate-300">
                  إدارة حسابات مستخدمي نظام نقاط البيع
                </p>
              </div>
            </div>

            <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
              <button
                type="button"
                onClick={openCreateDrawer}
                className={`inline-flex h-12 items-center justify-center rounded-2xl bg-gradient-to-l from-cyan-300 to-emerald-300 px-5 shadow-[0_0_34px_rgba(34,211,238,0.22)] transition hover:scale-[1.01] active:scale-[0.98] ${BRANCH_PRIMARY_BUTTON_TYPOGRAPHY}`}
              >
                إنشاء مستخدم جديد
              </button>
            </div>
          </div>
        </header>

        {successMessage ? (
          <AdminAlert tone="success">{successMessage}</AdminAlert>
        ) : null}

        {errorMessage ? (
          <AdminAlert tone="error">{errorMessage}</AdminAlert>
        ) : null}

        <div className="space-y-4">
          {showCreateForm ? (
          <div className="fixed inset-0 z-40 bg-slate-950/60 backdrop-blur-[2px]">
            <div className="absolute inset-y-0 right-0 flex w-full justify-end">
          <form
            id="create-user-form"
            onSubmit={handleCreateUser}
            className="animate-[users-drawer-in_420ms_cubic-bezier(0.16,1,0.3,1)] h-full w-full max-w-xl overflow-y-auto border-l border-cyan-300/15 bg-[radial-gradient(circle_at_50%_8%,rgba(34,211,238,0.12),transparent_34%),linear-gradient(180deg,#07111d_0%,#050b16_100%)] p-7 text-right shadow-[0_24px_90px_rgba(0,0,0,0.45)] sm:p-8"
          >
            <div className="mb-8 flex items-start justify-between gap-4">
                <div className="pt-3">
                  <span className="inline-flex rounded-full border border-cyan-300/20 bg-cyan-300/10 px-3 py-1 text-xs font-black tracking-[0.18em] text-cyan-200">
                    مستخدم جديد
                  </span>
                  <h2 className="mt-4 text-3xl font-black text-white">
                    إنشاء مستخدم جديد
                  </h2>
                  <p className="mt-2 text-sm font-medium leading-6 text-slate-400">
                    نموذج مختصر لإضافة موظف POS وربطه بالفرع.
                  </p>
                </div>

                  <button
                    type="button"
                    onClick={() => {
                      resetForm()
                      setShowCreateForm(false)
                    }}
                    disabled={creating}
                    className="inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-full border border-white/10 bg-white/[0.045] text-2xl font-light text-slate-200 shadow-[0_16px_45px_rgba(0,0,0,0.28)] transition hover:bg-white/[0.07] hover:text-white disabled:cursor-not-allowed disabled:opacity-50"
                    aria-label="إغلاق"
                  >
                    ×
                  </button>
            </div>

            <div className="mb-9 flex justify-center">
              <div className="flex h-24 w-24 items-center justify-center rounded-full bg-gradient-to-br from-emerald-300 to-cyan-300 text-slate-950 shadow-[0_0_50px_rgba(45,212,191,0.28)]">
                <svg
                  viewBox="0 0 24 24"
                  className="h-16 w-16"
                  fill="currentColor"
                  aria-hidden="true"
                >
                  <circle cx="12" cy="8" r="4" />
                  <path d="M4 20a8 8 0 0 1 16 0" />
                </svg>
              </div>
            </div>

            <div className="space-y-6">
              <div>
                <label className="mb-2 block text-xs font-black text-slate-300">
                  الاسم
                </label>
                <div className="relative">
                  <AdminInput
                    type="text"
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    placeholder="إجباري"
                    className={DRAWER_INPUT_CLASS}
                    autoComplete="off"
                    dir="rtl"
                  />
                  <span className="pointer-events-none absolute right-[18px] top-1/2 -translate-y-1/2 text-slate-300">
                    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8">
                      <path d="M20 21a8 8 0 0 0-16 0" />
                      <circle cx="12" cy="7" r="4" />
                    </svg>
                  </span>
                </div>
              </div>

              {isEmailLoginRole(role) ? (
                <>
                  <div>
                    <label className="mb-2 block text-xs font-black text-slate-300">
                      البريد الإلكتروني
                    </label>
                    <div className="relative">
                      <AdminInput
                        type="email"
                        value={contactEmail}
                        onChange={(e) => setContactEmail(e.target.value)}
                        placeholder="إجباري"
                        className={DRAWER_INPUT_LTR_CLASS}
                        autoComplete="email"
                        dir="rtl"
                      />
                      <span className="pointer-events-none absolute right-[18px] top-1/2 -translate-y-1/2 text-slate-300">
                        <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8">
                          <path d="M4 6h16v12H4z" />
                          <path d="m4 7 8 6 8-6" />
                        </svg>
                      </span>
                    </div>
                  </div>

                  <div>
                      <label className="mb-2 block text-xs font-black text-slate-300">
                      كلمة مرور لوحة التحكم
                    </label>
                    <div className="relative">
                      <AdminInput
                        type="password"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        placeholder="6 أحرف أو أكثر"
                        className={DRAWER_INPUT_LTR_CLASS}
                        autoComplete="new-password"
                        dir="rtl"
                      />
                      <span className="pointer-events-none absolute right-[18px] top-1/2 -translate-y-1/2 text-slate-300">
                        <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8">
                          <path d="M12 17v-4" />
                          <path d="M8 9V7a4 4 0 0 1 8 0v2" />
                          <path d="M6 9h12v12H6z" />
                        </svg>
                      </span>
                    </div>
                  </div>

                  <div>
                    <label className="mb-2 block text-xs font-black text-slate-300">
                      تأكيد كلمة مرور لوحة التحكم
                    </label>
                    <div className="relative">
                      <AdminInput
                        type="password"
                        value={confirmPassword}
                        onChange={(e) => setConfirmPassword(e.target.value)}
                        placeholder="إجباري"
                        className={DRAWER_INPUT_LTR_CLASS}
                        autoComplete="new-password"
                        dir="rtl"
                      />
                      <span className="pointer-events-none absolute right-[18px] top-1/2 -translate-y-1/2 text-slate-300">
                        <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8">
                          <path d="m9 12 2 2 4-4" />
                          <path d="M6 9h12v12H6z" />
                          <path d="M8 9V7a4 4 0 0 1 8 0v2" />
                        </svg>
                      </span>
                    </div>
                  </div>
                </>
              ) : null}

              <div>
                <label className="mb-2 block text-xs font-black text-slate-300">
                  رقم الجوال
                </label>
                <div className="relative">
                  <AdminInput
                    type="tel"
                    inputMode="tel"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    placeholder="اختياري"
                    className={DRAWER_INPUT_LTR_CLASS}
                    autoComplete="tel"
                    dir="rtl"
                  />
                  <span className="pointer-events-none absolute right-[18px] top-1/2 -translate-y-1/2 text-slate-300">
                    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8">
                      <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.8 19.8 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.12 4.2 2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.12.9.33 1.77.63 2.61a2 2 0 0 1-.45 2.11L8 9.73a16 16 0 0 0 6.27 6.27l1.29-1.29a2 2 0 0 1 2.11-.45c.84.3 1.71.51 2.61.63A2 2 0 0 1 22 16.92z" />
                    </svg>
                  </span>
                </div>
              </div>

              <div>
                <label className="mb-2 block text-xs font-black text-slate-300">
                  الوظيفة
                </label>
                <div className="relative">
                  <StyledDropdown
                    value={role}
                    onChange={handleCreateRoleChange}
                    placeholder="إجباري"
                    options={roleOptions}
                    variant="drawer"
                  />
                  <span className="pointer-events-none absolute right-[18px] top-1/2 -translate-y-1/2 text-slate-300">
                    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8">
                      <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
                      <circle cx="9" cy="7" r="4" />
                      <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
                      <path d="M16 3.13a4 4 0 0 1 0 7.75" />
                    </svg>
                  </span>
                </div>
              </div>

              <div className="border-y border-white/10 py-6">
                {role ? (
                  <div>
                    <div className="mb-5 flex items-center justify-between gap-4">
                      <span className="text-sm font-black text-slate-300">
                        POS PIN
                      </span>
                      <span className="inline-flex h-8 w-8 items-center justify-center text-slate-300">
                        <svg viewBox="0 0 24 24" className="h-6 w-6" fill="currentColor">
                          <path d="M17 9V7a5 5 0 0 0-10 0v2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8a2 2 0 0 0-2-2h-1Zm-8 0V7a3 3 0 0 1 6 0v2H9Z" />
                        </svg>
                      </span>
                    </div>
                    <div dir="ltr" className="mx-auto grid max-w-xs grid-cols-4 gap-7">
                      {[0, 1, 2, 3].map((index) => (
                        <input
                          key={index}
                          ref={(element) => {
                            pinInputRefs.current[index] = element
                          }}
                          type="text"
                          inputMode="numeric"
                          pattern="[0-9]*"
                          maxLength={1}
                          value={posPin[index] || ''}
                          onChange={(event) => updatePinDigit(index, event.target.value)}
                          onKeyDown={(event) => handlePinKeyDown(index, event)}
                          onPaste={handlePinPaste}
                          aria-label={`POS PIN digit ${index + 1}`}
                          className="h-12 border-0 border-b border-slate-400/70 bg-transparent text-center text-2xl font-medium text-white outline-none transition focus:border-cyan-300"
                        />
                      ))}
                    </div>
                    <button
                      type="button"
                      onClick={handleGenerateNewPin}
                      disabled={creating}
                      className="mx-auto mt-7 flex items-center justify-center gap-2 text-sm font-black text-cyan-300 transition hover:text-cyan-200 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      <span className="text-xl">↻</span>
                      توليد PIN جديد
                    </button>
                  </div>
                ) : (
                  <p className="text-center text-sm font-bold text-slate-400">
                    سيتم إظهار POS PIN بعد اختيار الوظيفة
                  </p>
                )}
              </div>

              <div>
                <label className="mb-2 block text-xs font-black text-slate-300">
                  الفرع
                </label>

                {isSystemAdmin ? (
                  <div className="relative">
                    <StyledDropdown
                      value={createBranchId}
                      onChange={setCreateBranchId}
                      disabled={loadingBranches}
                      variant="drawer"
                      placeholder={
                        role && !requiresAssignedBranch(role)
                          ? 'اختياري'
                          : 'إجباري'
                      }
                      options={[
                        {
                          label:
                            !requiresAssignedBranch(role || '')
                              ? 'بدون فرع (نطاق النظام / POS اختياري)'
                              : 'إجباري',
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
                    <span className="pointer-events-none absolute right-[18px] top-1/2 -translate-y-1/2 text-slate-300">
                      <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8">
                        <path d="M3 21h18" />
                        <path d="M5 21V7l8-4v18" />
                        <path d="M19 21V11l-6-4" />
                      </svg>
                    </span>
                  </div>
                ) : (
                  <div className="relative">
                    <div className="flex min-h-14 items-center rounded-[18px] border border-[#263447] bg-[#0b1422]/90 py-0 text-right text-sm font-bold text-slate-200 pl-4 pr-[56px]">
                      {getBranchName(branches, actorBranchId)}
                    </div>
                    <span className="pointer-events-none absolute right-[18px] top-1/2 -translate-y-1/2 text-slate-300">
                      <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8">
                        <path d="M3 21h18" />
                        <path d="M5 21V7l8-4v18" />
                        <path d="M19 21V11l-6-4" />
                      </svg>
                    </span>
                  </div>
                )}

                {role && requiresAssignedBranch(role) && !branchIdForCreate ? (
                  <p className="mt-2 text-xs font-bold text-amber-300">
                    يجب اختيار فرع لهذا المستخدم قبل الإنشاء.
                  </p>
                ) : null}
              </div>

              <div className="mt-7 flex flex-col-reverse gap-2 border-t border-white/10 pt-4 sm:flex-row sm:justify-end">
                <button
                  type="button"
                  onClick={() => {
                    resetForm()
                    setShowCreateForm(false)
                  }}
                  disabled={creating}
                  className="inline-flex h-12 items-center justify-center rounded-2xl border border-white/10 bg-white/[0.045] px-5 text-sm font-black text-slate-200 transition hover:bg-white/[0.07] disabled:cursor-not-allowed disabled:opacity-50"
                >
                  إلغاء
                </button>

                <button
                  type="submit"
                  disabled={!canSubmitCreate || creating}
                  className={`inline-flex h-12 items-center justify-center rounded-2xl bg-gradient-to-l from-cyan-300 to-emerald-300 px-5 shadow-[0_0_35px_rgba(34,211,238,0.22)] transition hover:scale-[1.01] disabled:cursor-not-allowed disabled:opacity-60 ${BRANCH_PRIMARY_BUTTON_TYPOGRAPHY}`}
                >
                  {creating ? 'جارٍ الإنشاء...' : 'إنشاء المستخدم'}
                </button>
              </div>
            </div>
          </form>
            </div>
          </div>
          ) : null}

          {editDrawer.open && editDrawer.user ? (
            <div className="fixed inset-0 z-40 bg-slate-950/60 backdrop-blur-[2px]">
              <div className="absolute inset-y-0 right-0 flex w-full justify-end">
                <form
                  id="edit-user-form"
                  onSubmit={handleSaveEditUser}
                  className="animate-[users-drawer-in_420ms_cubic-bezier(0.16,1,0.3,1)] h-full w-full max-w-xl overflow-y-auto border-l border-cyan-300/15 bg-[radial-gradient(circle_at_50%_8%,rgba(34,211,238,0.12),transparent_34%),linear-gradient(180deg,#07111d_0%,#050b16_100%)] p-7 text-right shadow-[0_24px_90px_rgba(0,0,0,0.45)] sm:p-8"
                >
                  <div className="mb-8 flex items-start justify-between gap-4">
                    <div className="pt-3">
                      <span className="inline-flex rounded-full border border-cyan-300/20 bg-cyan-300/10 px-3 py-1 text-xs font-black tracking-[0.18em] text-cyan-200">
                        تعديل المستخدم
                      </span>
                      <h2 className="mt-4 text-3xl font-black text-white">
                        تعديل المستخدم
                      </h2>
                      <p className="mt-2 text-sm font-medium leading-6 text-slate-400">
                        تحديث بيانات الحساب والصلاحيات بدون تغيير PIN.
                      </p>
                    </div>

                    <button
                      type="button"
                      onClick={closeEditDrawer}
                      disabled={savingEdit}
                      className="inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-full border border-white/10 bg-white/[0.045] text-2xl font-light text-slate-200 shadow-[0_16px_45px_rgba(0,0,0,0.28)] transition hover:bg-white/[0.07] hover:text-white disabled:cursor-not-allowed disabled:opacity-50"
                      aria-label="إغلاق"
                    >
                      ×
                    </button>
                  </div>

                  <div className="space-y-6">
                    <div>
                      <label className="mb-2 block text-xs font-black text-slate-300">
                        الاسم
                      </label>
                      <div className="relative">
                        <AdminInput
                          type="text"
                          value={editFullName}
                          onChange={(e) => setEditFullName(e.target.value)}
                          className={DRAWER_INPUT_CLASS}
                          autoComplete="off"
                          dir="rtl"
                        />
                        <span className="pointer-events-none absolute right-[18px] top-1/2 -translate-y-1/2 text-slate-300">
                          <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8">
                            <path d="M20 21a8 8 0 0 0-16 0" />
                            <circle cx="12" cy="7" r="4" />
                          </svg>
                        </span>
                      </div>
                    </div>

                    <div>
                      <label className="mb-2 block text-xs font-black text-slate-300">
                        اسم المستخدم
                      </label>
                      <div className="relative">
                        <AdminInput
                          type="text"
                          value={editUsername}
                          readOnly
                          disabled
                          className={`${DRAWER_INPUT_LTR_CLASS} cursor-not-allowed opacity-60 disabled:!border-[#263447] disabled:!bg-[#0b1422]/90 disabled:!text-slate-300 disabled:!opacity-60 disabled:cursor-not-allowed`}
                          autoComplete="off"
                          dir="rtl"
                        />
                        <span className="pointer-events-none absolute right-[18px] top-1/2 -translate-y-1/2 text-slate-300">
                          <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8">
                            <path d="M20 21a8 8 0 0 0-16 0" />
                            <circle cx="12" cy="7" r="4" />
                          </svg>
                        </span>
                      </div>
                    </div>

                    {shouldShowEditEmail ? (
                      <>
                        <div>
                          <label className="mb-2 block text-xs font-black text-slate-300">
                            البريد الإلكتروني
                          </label>
                          <div className="relative">
                            <AdminInput
                              type="email"
                              value={editContactEmail}
                              onChange={(e) => setEditContactEmail(e.target.value)}
                              placeholder="إجباري"
                              className={DRAWER_INPUT_LTR_CLASS}
                              autoComplete="email"
                              dir="rtl"
                            />
                            <span className="pointer-events-none absolute right-[18px] top-1/2 -translate-y-1/2 text-slate-300">
                              <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8">
                                <path d="M4 6h16v12H4z" />
                                <path d="m4 7 8 6 8-6" />
                              </svg>
                            </span>
                          </div>
                        </div>

                        <div>
                          <label className="mb-2 block text-xs font-black text-slate-300">
                            كلمة مرور لوحة التحكم
                          </label>
                          <div className="relative">
                            <AdminInput
                              type="password"
                              value={editAdminPassword}
                              onChange={(e) => setEditAdminPassword(e.target.value)}
                              placeholder="اتركها فارغة إذا لا تريد تغييرها"
                              className={DRAWER_INPUT_LTR_CLASS}
                              autoComplete="new-password"
                              dir="rtl"
                            />
                            <span className="pointer-events-none absolute right-[18px] top-1/2 -translate-y-1/2 text-slate-300">
                              <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8">
                                <path d="M12 17v-4" />
                                <path d="M8 9V7a4 4 0 0 1 8 0v2" />
                                <path d="M6 9h12v12H6z" />
                              </svg>
                            </span>
                          </div>
                        </div>

                        <div>
                          <label className="mb-2 block text-xs font-black text-slate-300">
                            تأكيد كلمة مرور لوحة التحكم
                          </label>
                          <div className="relative">
                            <AdminInput
                              type="password"
                              value={editConfirmAdminPassword}
                              onChange={(e) =>
                                setEditConfirmAdminPassword(e.target.value)
                              }
                              placeholder="مطلوب عند تغيير كلمة المرور"
                              className={DRAWER_INPUT_LTR_CLASS}
                              autoComplete="new-password"
                              dir="rtl"
                            />
                            <span className="pointer-events-none absolute right-[18px] top-1/2 -translate-y-1/2 text-slate-300">
                              <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8">
                                <path d="m9 12 2 2 4-4" />
                                <path d="M6 9h12v12H6z" />
                                <path d="M8 9V7a4 4 0 0 1 8 0v2" />
                              </svg>
                            </span>
                          </div>
                        </div>
                      </>
                    ) : null}

                    <div>
                      <label className="mb-2 block text-xs font-black text-slate-300">
                        الوظيفة
                      </label>
                      <div className="relative">
                        <StyledDropdown
                          value={editRole}
                          onChange={handleEditRoleChange}
                          placeholder="إجباري"
                          options={editRoleOptions}
                          variant="drawer"
                        />
                        <span className="pointer-events-none absolute right-[18px] top-1/2 -translate-y-1/2 text-slate-300">
                          <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8">
                            <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
                            <circle cx="9" cy="7" r="4" />
                            <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
                            <path d="M16 3.13a4 4 0 0 1 0 7.75" />
                          </svg>
                        </span>
                      </div>
                    </div>

                    <div>
                      <label className="mb-2 block text-xs font-black text-slate-300">
                        الفرع
                      </label>

                      {isSystemAdmin ? (
                        <div className="relative">
                          <StyledDropdown
                            value={editBranchId}
                            onChange={setEditBranchId}
                            disabled={loadingBranches}
                            variant="drawer"
                            placeholder={
                              editRole && !requiresAssignedBranch(editRole)
                                ? 'اختياري'
                                : 'إجباري'
                            }
                            options={[
                              {
                                label:
                                  !requiresAssignedBranch(editRole || '')
                                    ? 'بدون فرع'
                                    : 'إجباري',
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
                          <span className="pointer-events-none absolute right-[18px] top-1/2 -translate-y-1/2 text-slate-300">
                            <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8">
                              <path d="M3 21h18" />
                              <path d="M5 21V7l8-4v18" />
                              <path d="M19 21V11l-6-4" />
                            </svg>
                          </span>
                        </div>
                      ) : (
                        <div className="relative">
                          <div className="flex min-h-14 items-center rounded-[18px] border border-[#263447] bg-[#0b1422]/90 py-0 text-right text-sm font-bold text-slate-200 pl-4 pr-[56px]">
                            {getBranchName(branches, actorBranchId)}
                          </div>
                          <span className="pointer-events-none absolute right-[18px] top-1/2 -translate-y-1/2 text-slate-300">
                            <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8">
                              <path d="M3 21h18" />
                              <path d="M5 21V7l8-4v18" />
                              <path d="M19 21V11l-6-4" />
                            </svg>
                          </span>
                        </div>
                      )}
                    </div>

                    <div className="rounded-[20px] border border-emerald-300/15 bg-[linear-gradient(135deg,rgba(6,17,31,0.96),rgba(11,20,34,0.92))] p-4 shadow-[0_18px_55px_rgba(0,0,0,0.18)]">
                      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                        <div className="flex min-w-0 flex-1 items-center gap-3 text-right">
                          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-emerald-300/20 bg-emerald-300/10 text-emerald-100">
                            <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8">
                              <path d="M12 17v-4" />
                              <path d="M8 9V7a4 4 0 0 1 8 0v2" />
                              <path d="M6 9h12v12H6z" />
                            </svg>
                          </span>
                          <div className="min-w-0">
                            <p className="text-sm font-black text-slate-100">
                              POS PIN
                            </p>
                            <p className="mt-1 text-xs font-bold text-slate-500">
                              {editDrawer.user.has_pos_pin
                                ? editDrawer.user.pos_pin
                                  ? 'يمكنك تعديل PIN الحالي مباشرة'
                                  : 'أدخل PIN جديد لعرضه لاحقًا'
                                : 'لا يوجد PIN'}
                            </p>
                          </div>
                        </div>

                        <div className="relative sm:w-[220px]">
                          <input
                            dir="ltr"
                            inputMode="numeric"
                            pattern="[0-9]*"
                            maxLength={4}
                            type={showEditPosPin ? 'text' : 'password'}
                            value={editPosPin}
                            onChange={(event) =>
                              setEditPosPin(
                                event.target.value.replace(/\D/g, '').slice(0, 4)
                              )
                            }
                            placeholder="أدخل PIN جديد"
                            className="h-12 w-full rounded-2xl border border-emerald-300/15 bg-black/20 py-0 pl-12 pr-4 text-center font-mono text-lg font-black tracking-[0.3em] text-emerald-100 outline-none transition placeholder:font-sans placeholder:text-sm placeholder:font-bold placeholder:tracking-normal placeholder:text-slate-500 hover:border-emerald-300/30 focus:border-emerald-300/55 focus:ring-2 focus:ring-emerald-300/15"
                          />
                          <button
                            type="button"
                            onClick={() => setShowEditPosPin((current) => !current)}
                            className="absolute left-2 top-1/2 inline-flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-xl border border-white/10 bg-white/[0.055] text-slate-200 transition hover:bg-white/[0.085]"
                            aria-label={showEditPosPin ? 'إخفاء POS PIN' : 'إظهار POS PIN'}
                            title={showEditPosPin ? 'إخفاء POS PIN' : 'إظهار POS PIN'}
                          >
                            <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8">
                              {showEditPosPin ? (
                                <>
                                  <path d="M3 3l18 18" />
                                  <path d="M10.6 10.6a2 2 0 0 0 2.8 2.8" />
                                  <path d="M9.9 4.2A10.9 10.9 0 0 1 12 4c5 0 8.5 4.5 9.6 6.2a3 3 0 0 1 0 3.6 19 19 0 0 1-2.2 2.7" />
                                  <path d="M6.4 6.4a18.6 18.6 0 0 0-4 3.8 3 3 0 0 0 0 3.6C3.5 15.5 7 20 12 20a10.8 10.8 0 0 0 4.1-.8" />
                                </>
                              ) : (
                                <>
                                  <path d="M2.4 10.2a3 3 0 0 0 0 3.6C3.5 15.5 7 20 12 20s8.5-4.5 9.6-6.2a3 3 0 0 0 0-3.6C20.5 8.5 17 4 12 4s-8.5 4.5-9.6 6.2Z" />
                                  <circle cx="12" cy="12" r="3" />
                                </>
                              )}
                            </svg>
                          </button>
                        </div>
                      </div>
                    </div>

                    <div className="mt-7 flex flex-col-reverse gap-2 border-t border-white/10 pt-4 sm:flex-row sm:justify-end">
                      <button
                        type="button"
                        onClick={closeEditDrawer}
                        disabled={savingEdit}
                        className="inline-flex h-12 items-center justify-center rounded-2xl border border-white/10 bg-white/[0.045] px-5 text-sm font-black text-slate-200 transition hover:bg-white/[0.07] disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        إلغاء
                      </button>

                      <button
                        type="submit"
                        disabled={
                          savingEdit ||
                          !editFullName.trim() ||
                          !editRole ||
                          (shouldShowEditEmail &&
                            (!editContactEmail.trim() ||
                              !isValidEmail(editContactEmail) ||
                              (editDrawer.user.account_type === 'pos_profile' &&
                                !editAdminPassword.trim()) ||
                              (editAdminPassword.trim().length > 0 &&
                                (editAdminPassword.trim().length < 6 ||
                                  !editConfirmAdminPassword.trim() ||
                                  editAdminPassword.trim() !==
                                    editConfirmAdminPassword.trim())))) ||
                          (!!editPosPin.trim() &&
                            !isValidAdminPosPin(editPosPin.trim())) ||
                          (!editDrawer.user.has_pos_pin && !editPosPin.trim())
                        }
                        className={`inline-flex h-12 items-center justify-center rounded-2xl bg-gradient-to-l from-cyan-300 to-emerald-300 px-5 shadow-[0_0_35px_rgba(34,211,238,0.22)] transition hover:scale-[1.01] disabled:cursor-not-allowed disabled:opacity-60 ${BRANCH_PRIMARY_BUTTON_TYPOGRAPHY}`}
                      >
                        {savingEdit ? 'جارٍ الحفظ...' : 'حفظ التغييرات'}
                      </button>
                    </div>
                  </div>
                </form>
              </div>
            </div>
          ) : null}

          <AdminGlassSection>
            <div className="mb-6 flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
              <div className="text-right">
                <p className="text-xs font-black uppercase tracking-[0.24em] text-cyan-300/80">
                  قائمة المستخدمين
                </p>
                <h2 className="mt-2 text-2xl font-black text-white">
                  المستخدمون الحاليون
                </h2>
                <p className="mt-1 text-sm text-slate-400">
                  قائمة مستخدمي نقاط البيع داخل النظام
                </p>
              </div>

              <button
                type="button"
                onClick={loadUsers}
                className="inline-flex h-11 items-center justify-center rounded-2xl border border-cyan-300/20 bg-cyan-300/10 px-4 text-sm font-black text-cyan-100 transition hover:bg-cyan-300/15"
              >
                تحديث
              </button>
            </div>

            <div className="mb-5 rounded-2xl border border-cyan-300/10 bg-[#07111d]/80 p-3 shadow-[0_0_40px_rgba(0,255,255,0.05)]">
              <div className="grid gap-3 lg:grid-cols-[1fr_auto] lg:items-center">
                <label className="relative block">
                  <input
                    type="search"
                    value={searchTerm}
                    onChange={(event) => setSearchTerm(event.target.value)}
                    placeholder="ابحث عن اسم أو اسم مستخدم..."
                    className="h-12 w-full rounded-2xl border border-cyan-300/15 bg-white/[0.045] py-0 pl-4 pr-12 text-right text-sm font-bold text-white outline-none transition placeholder:text-slate-500 hover:border-cyan-300/30 focus:border-cyan-300/55 focus:bg-white/[0.07] focus:ring-2 focus:ring-cyan-300/15"
                  />
                  <span className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-slate-400">
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
                      <circle cx="11" cy="11" r="7" />
                      <path d="m20 20-3.5-3.5" />
                    </svg>
                  </span>
                </label>

                <div className="flex flex-wrap justify-end gap-2">
                  {[
                    { label: `الكل ${users.length}`, value: 'all' as const },
                    {
                      label: `نشط ${activeUsersCount}`,
                      value: 'active' as const,
                    },
                    {
                      label: `معطل ${inactiveUsersCount}`,
                      value: 'inactive' as const,
                    },
                  ].map((filter) => (
                    <button
                      key={filter.value}
                      type="button"
                      onClick={() => setStatusFilter(filter.value)}
                      className={`h-10 rounded-2xl border px-4 text-xs font-black transition ${
                        statusFilter === filter.value
                          ? 'border-cyan-300/30 bg-cyan-300/15 text-cyan-100'
                          : 'border-white/10 bg-white/[0.045] text-slate-300 hover:bg-white/[0.07]'
                      }`}
                    >
                      {filter.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div className="bg-transparent">
              {loadingUsers ? (
                <p className="rounded-2xl border border-cyan-300/12 bg-white/[0.045] p-4 text-sm text-slate-400 shadow-sm">
                  جارٍ تحميل المستخدمين...
                </p>
              ) : filteredUsers.length === 0 ? (
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
                    {users.length === 0
                      ? 'لا يوجد مستخدمون حتى الآن.'
                      : 'لا توجد نتائج مطابقة'}
                  </h3>
                  <p className="mt-1 text-sm text-slate-400">
                    {users.length === 0
                      ? 'ابدأ بإضافة أول مستخدم للفريق من نموذج الإنشاء.'
                      : 'جرّب تعديل البحث أو حالة المستخدم لعرض نتائج أخرى.'}
                  </p>
                  {users.length === 0 ? (
                    <button
                      type="button"
                      onClick={openCreateDrawer}
                      className={`mt-4 inline-flex h-10 items-center justify-center rounded-xl bg-gradient-to-l from-cyan-300 to-emerald-300 px-4 ${BRANCH_PRIMARY_BUTTON_TYPOGRAPHY}`}
                    >
                      إضافة مستخدم
                    </button>
                  ) : null}
                </div>
              ) : (
                <div className="overflow-x-auto rounded-2xl border border-white/10 bg-[#06111f]/65">
                  <table className="w-full min-w-[980px] table-fixed text-right">
                    <colgroup>
                      <col className="w-[24%]" />
                      <col className="w-[20%]" />
                      <col className="w-[15%]" />
                      <col className="w-[17%]" />
                      <col className="w-[10%]" />
                      <col className="w-[14%]" />
                    </colgroup>
                    <thead className="bg-[#091424]">
                      <tr className="text-xs font-black uppercase tracking-[0.16em] text-slate-400">
                        <th className="px-3 py-4">الاسم</th>
                        <th className="px-3 py-4">اسم المستخدم</th>
                        <th className="px-3 py-4">الوظيفة</th>
                        <th className="px-3 py-4">الفرع</th>
                        <th className="px-3 py-4">الحالة</th>
                        <th className="px-3 py-4">الإجراءات</th>
                      </tr>
                    </thead>

                    <tbody>
                      {filteredUsers.map((user) => {
                        const isBusy = updatingUserId === user.id
                        const isMainAdmin = isPrimaryAdminUsername(user.username)
                        const scopeLabel =
                          resolveAuthScopeType(user.role, user.branch_id) === 'system'
                            ? 'نظام'
                            : 'فرع'

                        return (
                          <tr
                            key={`${user.account_type || 'user'}-${user.id}`}
                            className="border-b border-white/[0.08] bg-slate-500/[0.045] align-middle transition hover:bg-slate-500/[0.075] last:border-b-0"
                          >
                            <td className="px-3 py-4">
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

                            <td className="px-3 py-4">
                              <p className="truncate text-sm font-black text-slate-200">
                                {user.username || '-'}
                              </p>
                              {isMainAdmin ? (
                                <p className="mt-1 text-xs font-bold text-cyan-300/75">
                                  الحساب الرئيسي
                                </p>
                              ) : null}
                            </td>

                            <td className="px-3 py-4">
                              <span
                                className={`inline-flex max-w-full rounded-full border px-3 py-1 text-xs font-black ${getRoleBadgeClassName(user.role)}`}
                              >
                                {getRoleDisplayLabel(user.role)}
                              </span>
                            </td>

                            <td className="px-3 py-4">
                              <span className="block truncate text-sm font-bold text-slate-200">
                                {getBranchName(branches, user.branch_id)}
                              </span>
                            </td>

                            <td className="px-3 py-4">
                              <span
                                className={`inline-flex rounded-full border px-3 py-1 text-xs font-black ${
                                  user.is_active
                                    ? 'border-emerald-300/25 bg-emerald-400/10 text-emerald-100'
                                    : 'border-rose-300/25 bg-rose-500/10 text-rose-100'
                                }`}
                              >
                                {user.is_active ? 'نشط' : 'غير نشط'}
                              </span>
                            </td>

                            <td className="px-3 py-4">
                              <div className="flex items-center gap-2">
                                <button
                                  type="button"
                                  onClick={() => openEditDrawer(user)}
                                  disabled={
                                    isBusy ||
                                    isMainAdmin ||
                                    !user.account_type
                                  }
                                  className="inline-flex h-10 min-w-0 flex-1 items-center justify-center rounded-xl border border-cyan-300/20 bg-cyan-300/10 px-2 text-xs font-black text-cyan-100 transition hover:bg-cyan-300/15 disabled:cursor-not-allowed disabled:opacity-50"
                                >
                                  تعديل
                                </button>

                                <button
                                  type="button"
                                  onClick={() => openDeleteModal(user)}
                                  disabled={isBusy || isMainAdmin}
                                  className="inline-flex h-10 min-w-0 flex-1 items-center justify-center rounded-xl border border-red-300/20 bg-red-500/10 px-2 text-xs font-black text-red-100 transition hover:bg-red-500/15 disabled:cursor-not-allowed disabled:opacity-50"
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
          </AdminGlassSection>

        </div>
      </div>

      {resetModal.open ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 px-4 backdrop-blur-sm">
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
                  className="h-14 !border-cyan-300/15 !bg-white/[0.045] text-right text-sm font-bold !text-white !shadow-none placeholder:!text-slate-500 focus:!border-cyan-300/55 focus:!bg-white/[0.07] focus:!ring-2 focus:!ring-cyan-300/15"
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
                  className="h-14 !border-cyan-300/15 !bg-white/[0.045] text-right text-sm font-bold !text-white !shadow-none placeholder:!text-slate-500 focus:!border-cyan-300/55 focus:!bg-white/[0.07] focus:!ring-2 focus:!ring-cyan-300/15"
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
                className={`h-12 rounded-2xl bg-gradient-to-l from-cyan-300 to-emerald-300 px-5 shadow-[0_0_28px_rgba(34,211,238,0.2)] disabled:opacity-60 ${BRANCH_PRIMARY_BUTTON_TYPOGRAPHY}`}
              >
                حفظ كلمة المرور
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {deleteModal.open && deleteModal.user ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 px-4 backdrop-blur-sm">
          <div
            dir="rtl"
            className="w-full max-w-md rounded-[28px] border border-rose-300/20 bg-[#07111f] p-6 text-right shadow-[0_30px_110px_rgba(0,0,0,0.55)]"
          >
            <div className="mb-5">
              <div className="mb-4 inline-flex h-12 w-12 items-center justify-center rounded-2xl border border-rose-300/20 bg-rose-500/10 text-rose-100">
                حذف
              </div>
              <h3 className="text-2xl font-black text-white">تأكيد حذف المستخدم</h3>
              <p className="mt-3 text-sm leading-7 text-slate-300">
                هل أنت متأكد من حذف المستخدم{' '}
                <span className="font-black text-white">
                  {deleteModal.user.username || deleteModal.user.full_name || 'هذا المستخدم'}
                </span>
                ؟
              </p>
            </div>

            <div className="mt-6 flex justify-end gap-3">
              <button
                type="button"
                onClick={closeDeleteModal}
                disabled={updatingUserId === deleteModal.user.id}
                className="h-12 rounded-2xl border border-white/10 bg-white/[0.045] px-5 text-sm font-bold text-slate-200 transition hover:bg-white/[0.075] disabled:cursor-not-allowed disabled:opacity-60"
              >
                إلغاء
              </button>

              <button
                type="button"
                onClick={handleConfirmDeleteUser}
                disabled={updatingUserId === deleteModal.user.id}
                className="h-12 rounded-2xl border border-rose-300/25 bg-rose-500/15 px-5 text-sm font-black text-rose-100 shadow-[0_0_28px_rgba(244,63,94,0.16)] transition hover:bg-rose-500/20 disabled:cursor-not-allowed disabled:opacity-60"
              >
                تأكيد الحذف
              </button>
            </div>
          </div>
        </div>
      ) : null}

      <style jsx global>{`
        @keyframes users-drawer-in {
          from {
            opacity: 0;
            transform: translate3d(100%, 0, 0);
          }

          to {
            opacity: 1;
            transform: translate3d(0, 0, 0);
          }
        }
      `}</style>
    </div>
  )
}
