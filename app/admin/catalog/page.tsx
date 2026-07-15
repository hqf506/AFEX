'use client'

import Link from 'next/link'
import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { AdminDarkSelect } from '@/components/admin-dark-select'
import { AdminInput } from '@/components/admin-input'
import { AdminAlert } from '@/components/admin-ui'
import { usePageAccess } from '@/hooks/use-page-access'
import { getClientCaughtErrorMessage, getClientErrorMessage } from '@/lib/api/client-error'
import {
  canSubmitCatalogForm,
  createEmptyCatalogFormPayload,
  getCatalogItemTypePreset,
  getNextCatalogCode,
  isSystemScopedCatalogAdmin,
  type AdminCatalogFormPayload,
  type AdminCatalogItemRecord,
  type CatalogItemTypePreset,
} from '@/lib/admin/catalog'
import {
  loadClientResource,
  peekClientResource,
} from '@/lib/client-resource-cache'
import { formatCurrency } from '@/lib/orders/format'

type SellByMode = 'unit' | 'weight'
type TaxOption = 'standard' | 'zero'
type PosDisplayMode = 'style' | 'image'
type PosShape = 'square' | 'circle' | 'hexagon' | 'gear'
type BranchRecord = {
  id: string
  code: string
  name: string
  is_active: boolean
}

type BranchCatalogItemRecord = AdminCatalogItemRecord & {
  branch_catalog_item_id?: string | null
  branch_price?: number | null
  branch_is_active?: boolean
  display_order?: number | null
}

type InlinePriceField = 'default_price' | 'cost_price'
type CategoryRecord = {
  id: string
  name: string
  is_active: boolean
  used_count?: number
}

const ITEMS_PER_PAGE = 10
const UNCATEGORIZED_LABEL = 'دون فئة'
const ADMIN_BRANCHES_CACHE_KEY = 'admin-branches'
const ADMIN_CATEGORIES_CACHE_KEY = 'admin-categories'
const ADMIN_SHARED_CACHE_TTL_MS = 60_000

const BRANCH_OPTIONS_FALLBACK = [
  { id: 'main', code: 'main', name: 'الفرع الرئيسي', is_active: true },
  { id: 'leather-fix', code: 'leather-fix', name: 'فرع Leather-Fix', is_active: true },
] satisfies BranchRecord[]

const POS_COLORS = ['#111827', '#0F766E', '#B45309', '#9F1239', '#1D4ED8', '#7C3AED']
const CATALOG_IMAGE_MAX_SIZE_BYTES = 5 * 1024 * 1024
const CATALOG_IMAGE_ALLOWED_EXTENSIONS = ['jpg', 'jpeg', 'png', 'webp']
const POS_SHAPES: Array<{ value: PosShape; label: string }> = [
  { value: 'square', label: 'مربع' },
  { value: 'circle', label: 'دائرة' },
  { value: 'hexagon', label: 'سداسي' },
  { value: 'gear', label: 'دائرة مسننة' },
]

const ITEM_TYPE_OPTION_LABELS: Record<CatalogItemTypePreset, string> = {
  services: 'الخدمات',
  products: 'المنتجات',
  cleaning: 'تنظيف',
  repair: 'إصلاح',
  care: 'عناية',
}

function normalizeBrokenCategoryLabel(value: string) {
  switch (value) {
    case 'تنظيف':
      return 'تنظيف'
    case 'إصلاح':
      return 'إصلاح'
    case 'عناية':
      return 'عناية'
    default:
      return value
  }
}

function getBranchScopedCatalogCacheKey(branchId: string) {
  return `admin-branch-catalog:${branchId}`
}

function getPresetFromCategoryLabel(value: string): CatalogItemTypePreset | null {
  const normalized = normalizeBrokenCategoryLabel(value)

  if (normalized === ITEM_TYPE_OPTION_LABELS.services) return 'services'
  if (normalized === ITEM_TYPE_OPTION_LABELS.products) return 'products'
  if (normalized === ITEM_TYPE_OPTION_LABELS.cleaning) return 'cleaning'
  if (normalized === ITEM_TYPE_OPTION_LABELS.repair) return 'repair'
  if (normalized === ITEM_TYPE_OPTION_LABELS.care) return 'care'

  return null
}

function getDisplayCategoryLabel(item: Pick<AdminCatalogItemRecord, 'item_type' | 'category'>) {
  if (!item.category) return UNCATEGORIZED_LABEL
  return normalizeBrokenCategoryLabel(item.category)
}

function canTrackInventory(itemType: string, isComposite: boolean) {
  return itemType === 'product' || isComposite
}

function calculateProfitMargin(costPrice: number, salePrice: number) {
  if (!Number.isFinite(salePrice) || salePrice <= 0) return '-'
  if (!Number.isFinite(costPrice) || costPrice <= 0) return '-'

  const profitMargin = ((salePrice - costPrice) / salePrice) * 100
  return `${profitMargin.toFixed(2)}%`
}

function getProfitMarginValue(costPrice: number, salePrice: number) {
  if (!Number.isFinite(salePrice) || salePrice <= 0) return 0
  if (!Number.isFinite(costPrice) || costPrice <= 0) return 0
  return ((salePrice - costPrice) / salePrice) * 100
}

function escapeCsvValue(value: string | number | boolean | null | undefined) {
  const stringValue = value == null ? '' : String(value)
  if (stringValue.includes(',') || stringValue.includes('"') || stringValue.includes('\n')) {
    return `"${stringValue.replace(/"/g, '""')}"`
  }
  return stringValue
}

function parseCsvLine(line: string) {
  const values: string[] = []
  let current = ''
  let inQuotes = false

  for (let index = 0; index < line.length; index += 1) {
    const character = line[index]

    if (character === '"') {
      const nextCharacter = line[index + 1]
      if (inQuotes && nextCharacter === '"') {
        current += '"'
        index += 1
      } else {
        inQuotes = !inQuotes
      }
      continue
    }

    if (character === ',' && !inQuotes) {
      values.push(current.trim())
      current = ''
      continue
    }

    current += character
  }

  values.push(current.trim())
  return values
}

function parseCsvContent(content: string) {
  const normalized = content.replace(/^\uFEFF/, '')
  const lines = normalized
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)

  if (lines.length === 0) {
    return []
  }

  const headers = parseCsvLine(lines[0])
  return lines.slice(1).map((line) => {
    const values = parseCsvLine(line)
    return headers.reduce<Record<string, string>>((record, header, index) => {
      record[header] = values[index] ?? ''
      return record
    }, {})
  })
}

function downloadTextFile(content: string, fileName: string, mimeType: string) {
  const blob = new Blob([content], { type: mimeType })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = fileName
  anchor.click()
  URL.revokeObjectURL(url)
}

function normalizeImportedBoolean(value: string) {
  const normalized = value.trim().toLowerCase()
  if (!normalized) return true
  return ['true', '1', 'yes', 'y', 'نعم', 'نشط', 'active'].includes(normalized)
}

function normalizeImportedDisplayMode(value: string): PosDisplayMode {
  return value.trim().toLowerCase() === 'image' ? 'image' : 'style'
}

function getCsvValue(row: Record<string, string>, ...keys: string[]) {
  for (const key of keys) {
    const directValue = row[key]
    if (typeof directValue === 'string' && directValue.trim()) {
      return directValue.trim()
    }

    const normalizedKey = key.trim().toLowerCase()
    const matchedEntry = Object.entries(row).find(
      ([entryKey, entryValue]) =>
        entryKey.trim().toLowerCase() === normalizedKey &&
        typeof entryValue === 'string' &&
        entryValue.trim()
    )

    if (matchedEntry) {
      return matchedEntry[1].trim()
    }
  }

  return ''
}

function normalizeImportedPrice(value: string) {
  const normalized = value.replace(/[^0-9.\-]/g, '').trim()
  if (!normalized) return '0'
  const amount = Number(normalized)
  return Number.isFinite(amount) ? String(amount) : '0'
}

type CatalogRichTextEditorProps = {
  value: string
  onChange: (value: string) => void
  placeholder?: string
}

function normalizeDescriptionHtml(html: string) {
  const normalized = html.trim()
  return normalized === '<br>' || normalized === '<div><br></div>' ? '' : normalized
}


function CatalogRichTextEditor({
  value,
  onChange,
  placeholder = '\u0627\u0643\u062a\u0628 \u0648\u0635\u0641 \u0627\u0644\u0639\u0646\u0635\u0631 \u0647\u0646\u0627...',
}: CatalogRichTextEditorProps) {
  const wrapperRef = useRef<HTMLDivElement | null>(null)
  const editorRef = useRef<HTMLDivElement | null>(null)
  const blurTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const lastHtmlRef = useRef('')
  const selectionRef = useRef<Range | null>(null)
  const [isFocused, setIsFocused] = useState(false)
  const [showLinkDialog, setShowLinkDialog] = useState(false)
  const [linkUrl, setLinkUrl] = useState('')

  const handleFocus = useCallback(() => {
    if (blurTimeoutRef.current) {
      clearTimeout(blurTimeoutRef.current)
      blurTimeoutRef.current = null
    }
    setIsFocused(true)
  }, [])

  const handleBlur = useCallback(() => {
    if (blurTimeoutRef.current) {
      clearTimeout(blurTimeoutRef.current)
    }

    blurTimeoutRef.current = setTimeout(() => {
      const activeElement = document.activeElement
      if (wrapperRef.current?.contains(activeElement)) {
        return
      }
      setIsFocused(false)
    }, 100)
  }, [])

  const handleInput = useCallback(() => {
    const editor = editorRef.current
    if (!editor) return

    const nextHtml = normalizeDescriptionHtml(editor.innerHTML)
    lastHtmlRef.current = nextHtml
    onChange(nextHtml)
  }, [onChange])

  const saveSelection = useCallback(() => {
    const editor = editorRef.current
    const selection = window.getSelection()
    if (!editor || !selection || selection.rangeCount === 0) return

    const range = selection.getRangeAt(0)
    if (!editor.contains(range.commonAncestorContainer)) return

    selectionRef.current = range.cloneRange()
  }, [])

  const restoreSelection = useCallback(() => {
    const selection = window.getSelection()
    const range = selectionRef.current
    if (!selection || !range) return

    selection.removeAllRanges()
    selection.addRange(range)
  }, [])

  const openLinkDialog = useCallback(() => {
    saveSelection()
    setLinkUrl('')
    setShowLinkDialog(true)
  }, [saveSelection])

  const closeLinkDialog = useCallback(() => {
    setShowLinkDialog(false)
    setLinkUrl('')
  }, [])

  const applyLink = useCallback(() => {
    const editor = editorRef.current
    const normalizedLink = linkUrl.trim()
    if (!editor || !normalizedLink) return

    editor.focus()
    restoreSelection()
    document.execCommand('createLink', false, normalizedLink)
    handleInput()
    closeLinkDialog()
  }, [closeLinkDialog, handleInput, linkUrl, restoreSelection])

  const runCommand = useCallback(
    (command: 'bold' | 'italic') => {
      const editor = editorRef.current
      if (!editor) return

      editor.focus()
      restoreSelection()
      document.execCommand(command, false)

      handleInput()
    },
    [handleInput, restoreSelection]
  )

  useEffect(() => {
    const editor = editorRef.current
    const normalizedValue = normalizeDescriptionHtml(value)
    if (!editor || lastHtmlRef.current === normalizedValue) return

    editor.innerHTML = normalizedValue
    lastHtmlRef.current = normalizedValue
  }, [value])

  useEffect(() => {
    return () => {
      if (blurTimeoutRef.current) {
        clearTimeout(blurTimeoutRef.current)
      }
    }
  }, [])

  return (
    <div
      ref={wrapperRef}
      className={`description-editor rounded-2xl border border-cyan-300/15 bg-[#07111f]/80 text-slate-100 transition focus-within:border-cyan-300/45 focus-within:ring-2 focus-within:ring-cyan-300/15 ${
        isFocused ? 'focused' : ''
      }`}
      onFocus={handleFocus}
      onBlur={handleBlur}
    >
      {showLinkDialog ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 px-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-3xl border border-cyan-300/20 bg-[#07111f]/95 p-6 text-right shadow-[0_30px_110px_rgba(0,0,0,0.55)]">
            <div className="space-y-2">
              <h2 className="text-xl font-bold text-white">{'\u0625\u0636\u0627\u0641\u0629 \u0631\u0627\u0628\u0637'}</h2>
              <label className="block text-sm font-medium text-slate-300">
                {'\u0627\u0644\u0631\u0627\u0628\u0637'}
              </label>
              <AdminInput
                type="url"
                value={linkUrl}
                onChange={(event) => setLinkUrl(event.target.value)}
                placeholder="https://example.com"
                autoFocus
              />
            </div>

            <div className="mt-6 flex flex-wrap justify-end gap-3">
              <button
                type="button"
                onClick={applyLink}
                className="inline-flex h-11 items-center rounded-xl bg-gradient-to-l from-cyan-300 to-emerald-300 px-5 text-sm font-black text-slate-950 transition hover:shadow-[0_0_24px_rgba(34,211,238,0.22)]"
              >
                {'\u0625\u0636\u0627\u0641\u0629'}
              </button>
              <button
                type="button"
                onClick={closeLinkDialog}
                className="inline-flex h-11 items-center rounded-xl border border-white/10 bg-white/[0.045] px-5 text-sm font-semibold text-slate-200 transition hover:bg-white/[0.08]"
              >
                {'\u0625\u0644\u063a\u0627\u0621'}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {isFocused ? (
        <div className="description-toolbar flex flex-wrap items-center gap-1 border-b border-cyan-300/10 bg-white/[0.035] px-3 py-2">
          <button
            type="button"
            className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-white/10 bg-white/[0.045] text-sm font-bold text-slate-200 transition hover:bg-cyan-300/10 hover:text-cyan-100"
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => runCommand('bold')}
          >
            B
          </button>
          <button
            type="button"
            className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-white/10 bg-white/[0.045] text-sm italic text-slate-200 transition hover:bg-cyan-300/10 hover:text-cyan-100"
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => runCommand('italic')}
          >
            I
          </button>
          <button
            type="button"
            className="inline-flex h-9 items-center justify-center rounded-lg border border-white/10 bg-white/[0.045] px-3 text-xs font-semibold text-slate-200 transition hover:bg-cyan-300/10 hover:text-cyan-100"
            onMouseDown={(event) => event.preventDefault()}
            onClick={openLinkDialog}
          >
            رابط
          </button>
        </div>
      ) : null}
      <div
        ref={editorRef}
        contentEditable
        dir="rtl"
        suppressContentEditableWarning
        data-placeholder={placeholder}
        className="description-editor__input min-h-[80px] px-3 py-2.5 text-right text-sm text-slate-100 outline-none"
        onInput={handleInput}
        onFocus={saveSelection}
        onKeyUp={saveSelection}
        onMouseUp={saveSelection}
      />
    </div>
  )
}

function inferImportedItemType(category: string, handle: string, explicitType: string) {
  const haystack = `${explicitType} ${category} ${handle}`.toLowerCase()
  const productMarkers = ['product', 'products', 'منتج', 'منتجات']
  const serviceMarkers = ['service', 'services', 'خدمة', 'خدمات']

  if (productMarkers.some((marker) => haystack.includes(marker.toLowerCase()))) {
    return 'product' as const
  }

  if (serviceMarkers.some((marker) => haystack.includes(marker.toLowerCase()))) {
    return 'service' as const
  }

  return 'service' as const
}

function normalizeImportedAvailability(...values: string[]) {
  return values.some((value) => normalizeImportedBoolean(value))
}

function normalizeNumericInput(value: string) {
  const westernized = value
    .replace(/[٠-٩]/g, (digit) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(digit)))
    .replace(/[۰-۹]/g, (digit) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(digit)))
    .replace(/[٫٬]/g, '.')
  const sanitized = westernized.replace(/[^0-9.\-]/g, '').trim()
  const amount = Number(sanitized || '0')
  if (!Number.isFinite(amount) || amount < 0) return 0
  return amount
}

function getCatalogImageExtension(fileName: string) {
  const parts = fileName.split('.')
  return parts.length > 1 ? (parts.at(-1) || '').toLowerCase() : ''
}

function validateCatalogImageFile(file: File | null) {
  if (!file) return 'ملف الصورة مطلوب'
  const extension = getCatalogImageExtension(file.name)

  if (!CATALOG_IMAGE_ALLOWED_EXTENSIONS.includes(extension)) {
    return 'يجب اختيار صورة بامتداد jpg أو jpeg أو png أو webp'
  }

  if (file.size > CATALOG_IMAGE_MAX_SIZE_BYTES) {
    return 'حجم الصورة يجب ألا يتجاوز 5 ميجابايت'
  }

  return null
}

function ToggleRow({
  label,
  checked,
  onChange,
  disabled = false,
}: {
  label: string
  checked: boolean
  onChange: (checked: boolean) => void
  disabled?: boolean
}) {
  return (
    <label
      className={`flex items-center justify-between rounded-xl border border-cyan-300/15 bg-white/[0.035] px-4 py-3 ${
        disabled ? 'cursor-not-allowed opacity-60' : ''
      }`}
    >
      <button
        type="button"
        aria-pressed={checked}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={`relative h-6 w-11 rounded-full transition ${
          checked ? 'bg-emerald-400' : 'bg-slate-600'
        }`}
      >
        <span
          className={`absolute top-0.5 h-5 w-5 rounded-full bg-white transition ${
            checked ? 'right-0.5' : 'right-[22px]'
          }`}
        />
      </button>
      <span className="text-sm font-medium text-slate-200">{label}</span>
    </label>
  )
}

function CatalogPageIcon({ type }: { type: string }) {
  if (type === 'active') {
    return <path d="M20 6 9 17l-5-5" />
  }

  if (type === 'warning') {
    return (
      <>
        <path d="M12 3 2 21h20L12 3Z" />
        <path d="M12 9v5" />
        <path d="M12 17h.01" />
      </>
    )
  }

  if (type === 'value') {
    return (
      <>
        <rect x="4" y="6" width="16" height="12" rx="2" />
        <path d="M8 10h8M8 14h4" />
      </>
    )
  }

  return (
    <>
      <path d="M12 3 4 7l8 4 8-4-8-4Z" />
      <path d="M4 7v10l8 4 8-4V7" />
      <path d="M12 11v10" />
    </>
  )
}

function CatalogMetricCard({
  title,
  value,
  hint,
  icon,
}: {
  title: string
  value: string
  hint: string
  icon: string
}) {
  return (
    <div className="rounded-[24px] border border-cyan-300/15 bg-white/[0.045] p-5 shadow-[0_24px_90px_rgba(0,0,0,0.18)] backdrop-blur">
      <div className="flex items-start justify-between gap-4">
        <div className="flex h-14 w-14 items-center justify-center rounded-2xl border border-cyan-300/20 bg-cyan-300/10 text-cyan-200 shadow-[0_0_30px_rgba(34,211,238,0.12)]">
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
            <CatalogPageIcon type={icon} />
          </svg>
        </div>
        <div className="min-w-0 text-left">
          <p className="text-sm font-bold text-slate-400">{title}</p>
          <p className="mt-2 truncate text-3xl font-black text-white">{value}</p>
          <p className="mt-2 text-xs font-black text-cyan-200">{hint}</p>
        </div>
      </div>
    </div>
  )
}

export default function AdminCatalogPage() {
  const access = usePageAccess(['admin'])
  const { loading: accessLoading, allowed, scopeType } = access
  const isSystemAdmin =
    scopeType !== null && isSystemScopedCatalogAdmin(scopeType)

  const [items, setItems] = useState<AdminCatalogItemRecord[]>([])
  const [categories, setCategories] = useState<CategoryRecord[]>(
    () => peekClientResource<CategoryRecord[]>(ADMIN_CATEGORIES_CACHE_KEY) || []
  )
  const [branches, setBranches] = useState<BranchRecord[]>(
    () => peekClientResource<BranchRecord[]>(ADMIN_BRANCHES_CACHE_KEY) || []
  )
  const [branchScopedItems, setBranchScopedItems] = useState<BranchCatalogItemRecord[] | null>(
    null
  )
  const [form, setForm] = useState<AdminCatalogFormPayload>(
    createEmptyCatalogFormPayload()
  )
  const [editingItemId, setEditingItemId] = useState<string | null>(null)
  const [editingItem, setEditingItem] = useState<AdminCatalogItemRecord | null>(null)
  const [isEditModalOpen, setIsEditModalOpen] = useState(false)
  const [hasChanges, setHasChanges] = useState(false)
  const [showUnsavedModal, setShowUnsavedModal] = useState(false)
  const [showFormView, setShowFormView] = useState(false)
  const [loadingItems, setLoadingItems] = useState(true)
  const [saving, setSaving] = useState(false)
  const [updatingItemId, setUpdatingItemId] = useState<string | null>(null)
  const [uploadingImageItemId, setUploadingImageItemId] = useState<string | null>(
    null
  )
  const [selectedImageFile, setSelectedImageFile] = useState<File | null>(null)
  const [removedCurrentImagePreview, setRemovedCurrentImagePreview] = useState(false)
  const [showRemoveImageDialog, setShowRemoveImageDialog] = useState(false)
  const [formImageUrl, setFormImageUrl] = useState<string | null>(null)
  const [successMessage, setSuccessMessage] = useState('')
  const [errorMessage, setErrorMessage] = useState('')
  const [searchQuery, setSearchQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'inactive'>('all')
  const [categoryFilter, setCategoryFilter] = useState('all')
  const [branchFilter, setBranchFilter] = useState('all')
  const [nameSort, setNameSort] = useState<'none' | 'desc' | 'asc'>('none')
  const [categorySort, setCategorySort] = useState<'none' | 'desc' | 'asc'>('none')
  const [salePriceSort, setSalePriceSort] = useState<'none' | 'desc' | 'asc'>('none')
  const [costPriceSort, setCostPriceSort] = useState<'none' | 'desc' | 'asc'>('none')
  const [profitSort, setProfitSort] = useState<'none' | 'desc' | 'asc'>('none')
  const [currentPage, setCurrentPage] = useState(1)
  const [catalogTotalCount, setCatalogTotalCount] = useState(0)
  const [branchFilterMessage, setBranchFilterMessage] = useState('')
  const [showImportPanel, setShowImportPanel] = useState(false)
  const [importFile, setImportFile] = useState<File | null>(null)
  const [importing, setImporting] = useState(false)
  const [openFilterMenu, setOpenFilterMenu] = useState<
    null | 'branch' | 'category' | 'status' | 'itemType'
  >(null)
  const [selectedItemIds, setSelectedItemIds] = useState<string[]>([])
  const [isBulkDeleting, setIsBulkDeleting] = useState(false)
  const [bulkDeleteTotal, setBulkDeleteTotal] = useState(0)
  const [bulkDeleteDone, setBulkDeleteDone] = useState(0)
  const [inlinePriceEdit, setInlinePriceEdit] = useState<{
    itemId: string
    field: InlinePriceField
    value: string
  } | null>(null)
  const [updatingCategoryItemId, setUpdatingCategoryItemId] = useState<string | null>(null)
  const [openCategoryMenuItemId, setOpenCategoryMenuItemId] = useState<string | null>(null)

  const [description, setDescription] = useState('')
  const [sellBy, setSellBy] = useState<SellByMode>('unit')
  const [compositeItem, setCompositeItem] = useState(false)
  const [trackInventory, setTrackInventory] = useState(false)
  const [availableInAllBranches, setAvailableInAllBranches] = useState(true)
  const [selectedBranches, setSelectedBranches] = useState<string[]>(
    BRANCH_OPTIONS_FALLBACK.map((branch) => branch.id)
  )
  const [branchPrices, setBranchPrices] = useState<Record<string, string>>({})
  const [taxOption, setTaxOption] = useState<TaxOption>('standard')
  const [posDisplayMode, setPosDisplayMode] = useState<PosDisplayMode>('style')
  const [posColor, setPosColor] = useState(POS_COLORS[0])
  const [posShape, setPosShape] = useState<PosShape>('square')
  const branchOptions = branches.length > 0 ? branches : BRANCH_OPTIONS_FALLBACK
  const itemTypeDropdownRef = useRef<HTMLDivElement | null>(null)
  const tableCategoryDropdownRef = useRef<HTMLDivElement | null>(null)
  const initialEditSnapshotRef = useRef<string | null>(null)
  const catalogRequestIdRef = useRef(0)

  async function loadBranches(force = false) {
    const cachedBranches =
      peekClientResource<BranchRecord[]>(ADMIN_BRANCHES_CACHE_KEY) || []

    if (cachedBranches.length > 0) {
      setBranches(cachedBranches)
    }

    const nextBranches = await loadClientResource(
      ADMIN_BRANCHES_CACHE_KEY,
      async () => {
        const response = await fetch('/api/admin/branches', {
          method: 'GET',
          cache: 'no-store',
        })

        const result = await response.json()

        if (!response.ok) {
          throw new Error(getClientErrorMessage(result, 'تعذر تحميل الفروع حاليًا. تحقق من الاتصال ثم حاول مرة أخرى.'))
        }

        return result.branches || []
      },
      {
        ttlMs: ADMIN_SHARED_CACHE_TTL_MS,
        force,
        logLabel: 'fetch branches',
      }
    )

    setBranches(nextBranches)
  }

  async function loadCategories(force = false) {
    const cachedCategories =
      peekClientResource<CategoryRecord[]>(ADMIN_CATEGORIES_CACHE_KEY) || []

    if (cachedCategories.length > 0) {
      setCategories(cachedCategories)
    }

    const nextCategories = await loadClientResource(
      ADMIN_CATEGORIES_CACHE_KEY,
      async () => {
        const response = await fetch('/api/admin/categories', {
          method: 'GET',
          cache: 'no-store',
        })

        const result = await response.json()

        if (!response.ok) {
          throw new Error(getClientErrorMessage(result, 'تعذر تحميل الفئات حاليًا. تحقق من الاتصال ثم حاول مرة أخرى.'))
        }

        return result.categories || []
      },
      {
        ttlMs: ADMIN_SHARED_CACHE_TTL_MS,
        force,
        logLabel: 'fetch categories',
      }
    )

    setCategories(nextCategories)
  }

  async function loadItems(force = false) {
    try {
      const requestId = catalogRequestIdRef.current + 1
      catalogRequestIdRef.current = requestId
      setLoadingItems(true)
      setErrorMessage('')

      const params = new URLSearchParams({
        page: String(currentPage),
        pageSize: String(ITEMS_PER_PAGE),
      })
      const normalizedSearch = searchQuery.trim()

      if (normalizedSearch) {
        params.set('search', normalizedSearch)
      }

      if (categoryFilter !== 'all') {
        params.set('category', categoryFilter)
      }

      if (statusFilter !== 'all') {
        params.set('status', statusFilter)
      }

      const activeSort =
        profitSort !== 'none'
          ? null
          : salePriceSort !== 'none'
            ? { sort: 'default_price', order: salePriceSort }
            : costPriceSort !== 'none'
              ? { sort: 'cost_price', order: costPriceSort }
              : categorySort !== 'none'
                ? { sort: 'category', order: categorySort }
                : nameSort !== 'none'
                  ? { sort: 'name', order: nameSort }
                  : null

      if (activeSort) {
        params.set('sort', activeSort.sort)
        params.set('order', activeSort.order)
      }

      let endpoint = `/api/admin/catalog?${params.toString()}`

      if (branchFilter !== 'all') {
        params.set('branchId', branchFilter)
        params.set('assignedActive', '1')
        endpoint = `/api/admin/branch-catalog?${params.toString()}`
      }

      const nextItems = await loadClientResource(
        `admin-catalog:${endpoint}`,
        async () => {
          const response = await fetch(endpoint, {
            method: 'GET',
            cache: 'no-store',
          })

          const result = await response.json()

          if (!response.ok) {
            throw new Error(getClientErrorMessage(result, 'تعذر تحميل المنتجات حاليًا. تحقق من الاتصال ثم حاول مرة أخرى.'))
          }

          return {
            items: result.items || [],
            total: Number(result.total) || 0,
          }
        },
        {
          ttlMs: ADMIN_SHARED_CACHE_TTL_MS,
          force,
          logLabel: 'fetch admin catalog',
        }
      )

      if (catalogRequestIdRef.current !== requestId) {
        return
      }

      setItems(nextItems.items)
      setCatalogTotalCount(nextItems.total)
      setBranchScopedItems(null)
      setBranchFilterMessage(
        branchFilter !== 'all' && nextItems.total === 0
          ? 'لا توجد إعدادات فروع مرتبطة بالعناصر بعد'
          : ''
      )
    } catch (error) {
      setErrorMessage(
        getClientCaughtErrorMessage(error, 'تعذر تحميل العناصر')
      )
    } finally {
      setLoadingItems(false)
    }
  }

  const loadBranchScopedItems = useCallback(async (selectedBranchId = branchFilter, force = false) => {
    if (selectedBranchId === 'all') {
      setBranchScopedItems(null)
      setBranchFilterMessage('')
      return
    }

    try {
      const branchCacheKey = getBranchScopedCatalogCacheKey(selectedBranchId)
      const cachedScopedItems =
        peekClientResource<BranchCatalogItemRecord[]>(branchCacheKey) || []

      if (cachedScopedItems.length > 0) {
        setBranchScopedItems(cachedScopedItems)
        setLoadingItems(false)
      } else {
        setLoadingItems(true)
      }

      setBranchFilterMessage('')

      const scopedItems = await loadClientResource(
        branchCacheKey,
        async () => {
          const response = await fetch(
            `/api/admin/branch-catalog?branchId=${encodeURIComponent(selectedBranchId)}`,
            {
              method: 'GET',
              cache: 'no-store',
            }
          )

          const result = await response.json()

          if (!response.ok) {
            throw new Error(getClientErrorMessage(result, 'تعذر تحميل إعدادات المنتجات الخاصة بالفرع. تحقق من الاتصال ثم حاول مرة أخرى.'))
          }

          return ((result.items || []) as BranchCatalogItemRecord[]).filter(
            (item) => item.branch_catalog_item_id && item.branch_is_active
          )
        },
        {
          ttlMs: ADMIN_SHARED_CACHE_TTL_MS,
          force,
          logLabel: `fetch branch catalog (${selectedBranchId})`,
        }
      )

      setBranchScopedItems(scopedItems)

      if (scopedItems.length === 0) {
        setBranchFilterMessage('لا توجد إعدادات فروع مرتبطة بالعناصر بعد')
      }
    } catch (error) {
      setBranchScopedItems([])
      setBranchFilterMessage(
        getClientCaughtErrorMessage(error, 'تعذر تحميل إعدادات العناصر الخاصة بالفرع')
      )
    } finally {
      setLoadingItems(false)
    }
  }, [branchFilter])

  useEffect(() => {
    if (!accessLoading && allowed) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      void Promise.all([loadBranches(), loadCategories()])
    }
  }, [accessLoading, allowed])

  useEffect(() => {
    if (!accessLoading && allowed) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      void loadItems()
    }
  }, [
    accessLoading,
    allowed,
    currentPage,
    searchQuery,
    statusFilter,
    categoryFilter,
    branchFilter,
    nameSort,
    categorySort,
    salePriceSort,
    costPriceSort,
    profitSort,
  ])

  useEffect(() => {
    function handleWindowClick() {
      setOpenFilterMenu(null)
    }

    if (openFilterMenu) {
      window.addEventListener('click', handleWindowClick)
    }

    return () => {
      window.removeEventListener('click', handleWindowClick)
    }
  }, [openFilterMenu])

  useEffect(() => {
    function handleTypeDropdownOutsideClick(event: MouseEvent) {
      if (openFilterMenu !== 'itemType') return

      const target = event.target
      if (
        itemTypeDropdownRef.current &&
        target instanceof Node &&
        !itemTypeDropdownRef.current.contains(target)
      ) {
        setOpenFilterMenu(null)
      }
    }

    document.addEventListener('mousedown', handleTypeDropdownOutsideClick)
    return () => {
      document.removeEventListener('mousedown', handleTypeDropdownOutsideClick)
    }
  }, [openFilterMenu])

  useEffect(() => {
    function handleTableCategoryDropdownOutsideClick(event: MouseEvent) {
      if (!openCategoryMenuItemId) return

      const target = event.target
      if (
        tableCategoryDropdownRef.current &&
        target instanceof Node &&
        !tableCategoryDropdownRef.current.contains(target)
      ) {
        setOpenCategoryMenuItemId(null)
      }
    }

    document.addEventListener('mousedown', handleTableCategoryDropdownOutsideClick)
    return () => {
      document.removeEventListener('mousedown', handleTableCategoryDropdownOutsideClick)
    }
  }, [openCategoryMenuItemId])

  const nextCatalogCode = useMemo(
    () => getNextCatalogCode(items.map((item) => item.code)),
    [items]
  )

  const resolvedForm = useMemo(
    () => ({
      ...form,
      code: editingItemId ? form.code : nextCatalogCode,
    }),
    [editingItemId, form, nextCatalogCode]
  )

  const canSubmit = useMemo(
    () => canSubmitCatalogForm(resolvedForm),
    [resolvedForm]
  )

  const activeItemsCount = useMemo(
    () => items.filter((item) => item.is_active).length,
    [items]
  )

  const inactiveItemsCount = items.length - activeItemsCount
  const lowStockItemsCount = 0
  const totalCatalogValue = useMemo(
    () => items.reduce((sum, item) => sum + Number(item.default_price ?? 0), 0),
    [items]
  )
  const catalogMetricCards = useMemo(
    () => [
      {
        title: 'إجمالي العناصر',
        value: catalogTotalCount.toString(),
        hint: 'عنصر وخدمة',
        icon: 'items',
      },
      {
        title: 'عناصر نشطة',
        value: activeItemsCount.toString(),
        hint: 'جاهزة للبيع',
        icon: 'active',
      },
      {
        title: 'منخفض المخزون',
        value: lowStockItemsCount.toString(),
        hint: 'تتبع المخزون غير مفعل',
        icon: 'warning',
      },
      {
        title: 'إجمالي القيمة',
        value: formatCurrency(totalCatalogValue),
        hint: 'حسب أسعار البيع',
        icon: 'value',
      },
    ],
    [activeItemsCount, catalogTotalCount, totalCatalogValue]
  )
  const categoryOptions = useMemo(
    () =>
      Array.from(
        new Set(
          categories
            .map((category) => normalizeBrokenCategoryLabel(category.name))
            .filter(Boolean)
        )
      ),
    [categories]
  )

  const filteredItems = useMemo(() => {
    const normalizedSearch = searchQuery.trim().toLowerCase()
    const sourceItems = items

    return sourceItems.filter((item) => {
      const matchesSearch =
        !normalizedSearch ||
        item.name.toLowerCase().includes(normalizedSearch) ||
        item.code.toLowerCase().includes(normalizedSearch) ||
        item.category.toLowerCase().includes(normalizedSearch)

      const matchesStatus =
        statusFilter === 'all' ||
        (statusFilter === 'active' ? item.is_active : !item.is_active)

      const matchesCategory =
        categoryFilter === 'all' || item.category === categoryFilter

      const matchesBranch = true

      return matchesSearch && matchesStatus && matchesCategory && matchesBranch
    })
  }, [categoryFilter, items, searchQuery, statusFilter])

  const sortedItems = useMemo(() => {
    const nextItems = [...filteredItems]
    const categoryCount: Record<string, number> = {}

    filteredItems.forEach((item) => {
      const key = getDisplayCategoryLabel(item) || UNCATEGORIZED_LABEL
      categoryCount[key] = (categoryCount[key] || 0) + 1
    })

    if (nameSort === 'desc') {
      nextItems.sort((a, b) => {
        const timeA = new Date(a.created_at).getTime()
        const timeB = new Date(b.created_at).getTime()
        return timeB - timeA
      })
    }

    if (nameSort === 'asc') {
      nextItems.sort((a, b) => {
        const timeA = new Date(a.created_at).getTime()
        const timeB = new Date(b.created_at).getTime()
        return timeA - timeB
      })
    }

    if (categorySort === 'desc') {
      nextItems.sort((a, b) => {
        const countA = categoryCount[getDisplayCategoryLabel(a) || UNCATEGORIZED_LABEL] || 0
        const countB = categoryCount[getDisplayCategoryLabel(b) || UNCATEGORIZED_LABEL] || 0
        return countB - countA
      })
    }

    if (categorySort === 'asc') {
      nextItems.sort((a, b) => {
        const countA = categoryCount[getDisplayCategoryLabel(a) || UNCATEGORIZED_LABEL] || 0
        const countB = categoryCount[getDisplayCategoryLabel(b) || UNCATEGORIZED_LABEL] || 0
        return countA - countB
      })
    }

    if (profitSort === 'desc') {
      nextItems.sort(
        (a, b) =>
          getProfitMarginValue(Number(b.cost_price ?? 0), Number(b.default_price ?? 0)) -
          getProfitMarginValue(Number(a.cost_price ?? 0), Number(a.default_price ?? 0))
      )
    }

    if (profitSort === 'asc') {
      nextItems.sort(
        (a, b) =>
          getProfitMarginValue(Number(a.cost_price ?? 0), Number(a.default_price ?? 0)) -
          getProfitMarginValue(Number(b.cost_price ?? 0), Number(b.default_price ?? 0))
      )
    }

    if (salePriceSort === 'desc') {
      nextItems.sort(
        (a, b) => Number(b.default_price ?? 0) - Number(a.default_price ?? 0)
      )
    }

    if (salePriceSort === 'asc') {
      nextItems.sort(
        (a, b) => Number(a.default_price ?? 0) - Number(b.default_price ?? 0)
      )
    }

    if (costPriceSort === 'desc') {
      nextItems.sort(
        (a, b) => Number(b.cost_price ?? 0) - Number(a.cost_price ?? 0)
      )
    }

    if (costPriceSort === 'asc') {
      nextItems.sort(
        (a, b) => Number(a.cost_price ?? 0) - Number(b.cost_price ?? 0)
      )
    }

    return nextItems
  }, [categorySort, costPriceSort, filteredItems, nameSort, profitSort, salePriceSort])

  const handleNameSort = useCallback(() => {
    setNameSort((current) => {
      if (current === 'none') return 'desc'
      if (current === 'desc') return 'asc'
      return 'none'
    })
  }, [])

  const handleCategorySort = useCallback(() => {
    setCategorySort((current) => {
      if (current === 'none') return 'desc'
      if (current === 'desc') return 'asc'
      return 'none'
    })
  }, [])

  const handleProfitSort = useCallback(() => {
    setProfitSort((current) => {
      if (current === 'none') return 'desc'
      if (current === 'desc') return 'asc'
      return 'none'
    })
  }, [])

  const handleSalePriceSort = useCallback(() => {
    setSalePriceSort((current) => {
      if (current === 'none') return 'desc'
      if (current === 'desc') return 'asc'
      return 'none'
    })
  }, [])

  const handleCostPriceSort = useCallback(() => {
    setCostPriceSort((current) => {
      if (current === 'none') return 'desc'
      if (current === 'desc') return 'asc'
      return 'none'
    })
  }, [])

  const totalPages = Math.max(1, Math.ceil(catalogTotalCount / ITEMS_PER_PAGE))
  const paginatedItems = useMemo(
    () => sortedItems,
    [sortedItems]
  )
  const visiblePageNumbers = useMemo(() => {
    if (totalPages <= 5) {
      return Array.from({ length: totalPages }, (_, index) => index + 1)
    }

    if (currentPage <= 3) {
      return [1, 2, 3, 4, totalPages]
    }

    if (currentPage >= totalPages - 2) {
      return [1, totalPages - 3, totalPages - 2, totalPages - 1, totalPages]
    }

    return [1, currentPage - 1, currentPage, currentPage + 1, totalPages]
  }, [currentPage, totalPages])

  const selectedImagePreviewUrl = useMemo(
    () => (selectedImageFile ? URL.createObjectURL(selectedImageFile) : null),
    [selectedImageFile]
  )
  const posImagePreviewUrl = selectedImagePreviewUrl || formImageUrl || null
  const currentEditSnapshot = useMemo(
    () =>
      JSON.stringify({
        form,
        description,
        sellBy,
        compositeItem,
        trackInventory,
        availableInAllBranches,
        selectedBranches: [...selectedBranches].sort(),
        branchPrices: Object.fromEntries(
          Object.entries(branchPrices).sort(([a], [b]) => a.localeCompare(b))
        ),
        taxOption,
        posDisplayMode,
        posColor,
        posShape,
        formImageUrl: formImageUrl ?? null,
        removedCurrentImagePreview,
        selectedImageFile: selectedImageFile
          ? {
              name: selectedImageFile.name,
              size: selectedImageFile.size,
              lastModified: selectedImageFile.lastModified,
            }
          : null,
      }),
    [
      availableInAllBranches,
      branchPrices,
      compositeItem,
      description,
      form,
      formImageUrl,
      posColor,
      posDisplayMode,
      posShape,
      removedCurrentImagePreview,
      selectedBranches,
      selectedImageFile,
      sellBy,
      taxOption,
      trackInventory,
    ]
  )
  const selectedCategoryLabel = categoryFilter === 'all' ? 'كل التصنيفات' : categoryFilter
  const selectedBranchLabel =
    branchFilter === 'all'
      ? 'كل الفروع'
      : branchOptions.find((branch) => branch.id === branchFilter)?.name || 'كل الفروع'
  const categoryDropdownOptions = useMemo(() => {
    const names = new Set<string>([UNCATEGORIZED_LABEL])

    for (const category of categories) {
      const categoryName = normalizeBrokenCategoryLabel(category.name)
      if (categoryName) {
        names.add(categoryName)
      }
    }

    if (form.category) {
      names.add(normalizeBrokenCategoryLabel(form.category))
    }

    return Array.from(names).map((name) => ({
      value: name,
      label: name,
    }))
  }, [categories, form.category])

  const selectedCategoryValue = form.category || UNCATEGORIZED_LABEL
  const selectedFormCategoryLabel = selectedCategoryValue

  useEffect(() => {
    if (!isEditModalOpen || !initialEditSnapshotRef.current) {
      return
    }

    setHasChanges(currentEditSnapshot !== initialEditSnapshotRef.current)
  }, [currentEditSnapshot, isEditModalOpen])
  const allFilteredSelected =
    paginatedItems.length > 0 &&
    paginatedItems.every((item) => selectedItemIds.includes(item.id))
  const bulkDeleteProgress =
    bulkDeleteTotal > 0 ? Math.min(100, (bulkDeleteDone / bulkDeleteTotal) * 100) : 0

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSelectedItemIds((current) =>
      current.filter((id) => filteredItems.some((item) => item.id === id))
    )
  }, [filteredItems])

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setCurrentPage(1)
  }, [searchQuery, statusFilter, categoryFilter, branchFilter])

  useEffect(() => {
    if (currentPage > totalPages) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setCurrentPage(totalPages)
    }
  }, [currentPage, totalPages])

  useEffect(() => {
    if (!selectedImagePreviewUrl) return

    return () => {
      URL.revokeObjectURL(selectedImagePreviewUrl)
    }
  }, [selectedImagePreviewUrl])

  function resetExtraFields() {
    setDescription('')
    setSellBy('unit')
    setCompositeItem(false)
    setTrackInventory(false)
    setAvailableInAllBranches(true)
    setSelectedBranches(branchOptions.map((branch) => branch.id))
    setBranchPrices({})
    setTaxOption('standard')
    setPosDisplayMode('style')
    setPosColor(POS_COLORS[0])
    setPosShape('square')
    setSelectedImageFile(null)
    setFormImageUrl(null)
    setRemovedCurrentImagePreview(false)
    setShowRemoveImageDialog(false)
  }

  function resetForm() {
    setForm({
      ...createEmptyCatalogFormPayload(),
      category: UNCATEGORIZED_LABEL,
    })
    setEditingItemId(null)
    setEditingItem(null)
    setIsEditModalOpen(false)
    setHasChanges(false)
    setShowUnsavedModal(false)
    initialEditSnapshotRef.current = null
    setShowFormView(false)
    resetExtraFields()
  }

  function requestCloseEditModal() {
    if (isEditModalOpen && hasChanges) {
      setShowUnsavedModal(true)
      return
    }

    resetForm()
  }

  function openCreateForm() {
    setEditingItemId(null)
    setEditingItem(null)
    setIsEditModalOpen(false)
    setHasChanges(false)
    setShowUnsavedModal(false)
    initialEditSnapshotRef.current = null
    setForm({
      ...createEmptyCatalogFormPayload(),
      category: UNCATEGORIZED_LABEL,
    })
    setSuccessMessage('')
    setErrorMessage('')
    setShowFormView(true)
    resetExtraFields()
  }

  function applyCategorySelection(nextCategory: string) {
    setForm((prev) => {
      if (nextCategory === UNCATEGORIZED_LABEL) {
        return {
          ...prev,
          category: UNCATEGORIZED_LABEL,
        }
      }

      const normalizedCategory = normalizeBrokenCategoryLabel(nextCategory)
      const preset = getPresetFromCategoryLabel(normalizedCategory)

      if (!preset) {
        return {
          ...prev,
          category: normalizedCategory,
          itemTypePreset: prev.itemType === 'product' ? 'products' : 'services',
        }
      }

      return {
        ...prev,
        itemType: preset === 'products' ? 'product' : 'service',
        itemTypePreset: preset,
        category: normalizedCategory,
      }
    })
  }

  function startEdit(item: AdminCatalogItemRecord) {
    const safeCostPrice = Number(item.cost_price ?? 0)
    const safeDefaultPrice = Number(item.default_price ?? 0)
    const initialForm = {
      name: item.name,
      code: item.code,
      category: item.category || UNCATEGORIZED_LABEL,
      itemType: item.item_type,
      itemTypePreset: getCatalogItemTypePreset(item.item_type, item.category),
      costPrice: Number.isFinite(safeCostPrice) ? safeCostPrice.toString() : '0',
      defaultPrice: Number.isFinite(safeDefaultPrice) ? safeDefaultPrice.toString() : '0',
    }
    const itemIsComposite = item.is_composite === true
    const itemTracksInventory =
      canTrackInventory(item.item_type, itemIsComposite) &&
      item.track_inventory === true

    setEditingItemId(item.id)
    setEditingItem(item)
    setIsEditModalOpen(true)
    setShowFormView(false)
    setForm(initialForm)
    setDescription('')
    setSellBy('unit')
    setCompositeItem(itemIsComposite)
    setTrackInventory(itemTracksInventory)
    setAvailableInAllBranches(item.is_active)
    setSelectedBranches(branchOptions.map((branch) => branch.id))
    setBranchPrices({})
    setTaxOption('standard')
    setPosDisplayMode(item.pos_display_mode === 'image' ? 'image' : 'style')
    setPosColor(item.pos_color || POS_COLORS[0])
    setPosShape(
      item.pos_shape === 'circle' ||
        item.pos_shape === 'hexagon' ||
        item.pos_shape === 'gear' ||
        item.pos_shape === 'square'
        ? item.pos_shape
        : 'square'
    )
    setSelectedImageFile(null)
    setFormImageUrl(item.image_url ?? null)
    setRemovedCurrentImagePreview(false)
    setShowRemoveImageDialog(false)
    setHasChanges(false)
    setShowUnsavedModal(false)
    initialEditSnapshotRef.current = JSON.stringify({
      form: initialForm,
      description: '',
      sellBy: 'unit',
      compositeItem: itemIsComposite,
      trackInventory: itemTracksInventory,
      availableInAllBranches: item.is_active,
      selectedBranches: [...branchOptions.map((branch) => branch.id)].sort(),
      branchPrices: {},
      taxOption: 'standard',
      posDisplayMode: item.pos_display_mode === 'image' ? 'image' : 'style',
      posColor: item.pos_color || POS_COLORS[0],
      posShape:
        item.pos_shape === 'circle' ||
        item.pos_shape === 'hexagon' ||
        item.pos_shape === 'gear' ||
        item.pos_shape === 'square'
          ? item.pos_shape
          : 'square',
      formImageUrl: item.image_url ?? null,
      removedCurrentImagePreview: false,
      selectedImageFile: null,
    })
    setSuccessMessage('')
    setErrorMessage('')
  }

  function handleConfirmRemoveImage() {
    setSelectedImageFile(null)
    setFormImageUrl(null)
    setRemovedCurrentImagePreview(true)
    setShowRemoveImageDialog(false)
  }

  async function persistRemovedImageReference() {
    const response = await fetch('/api/admin/catalog', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        items: [
          {
            name: resolvedForm.name,
            code: resolvedForm.code,
            category: resolvedForm.category,
            item_type: resolvedForm.itemType,
            default_price: resolvedForm.defaultPrice,
            cost_price: resolvedForm.costPrice,
            image_url: null,
            pos_display_mode: posDisplayMode,
            pos_color: posDisplayMode === 'style' ? posColor : null,
            pos_shape: posDisplayMode === 'style' ? posShape : null,
            is_composite: compositeItem,
            track_inventory:
              canTrackInventory(resolvedForm.itemType, compositeItem) && trackInventory,
            is_active:
              items.find((item) => item.id === editingItemId)?.is_active ?? true,
          },
        ],
      }),
    })

    const result = await response.json()

    if (!response.ok) {
      throw new Error(getClientErrorMessage(result, 'تعذر إزالة صورة المنتج. لم يتم حفظ التغييرات.'))
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()

    try {
      setSaving(true)
      setSuccessMessage('')
      setErrorMessage('')

      const payload = {
        name: resolvedForm.name,
        code: resolvedForm.code,
        category: resolvedForm.category,
        item_type: resolvedForm.itemType,
        cost_price: resolvedForm.costPrice,
        default_price: resolvedForm.defaultPrice,
        image_url: removedCurrentImagePreview && !selectedImageFile ? '' : undefined,
        pos_display_mode: posDisplayMode,
        pos_color: posDisplayMode === 'style' ? posColor : null,
        pos_shape: posDisplayMode === 'style' ? posShape : null,
        is_composite: compositeItem,
        track_inventory:
          canTrackInventory(resolvedForm.itemType, compositeItem) && trackInventory,
        ...(editingItemId
          ? {
              is_active:
                items.find((item) => item.id === editingItemId)?.is_active ?? true,
            }
          : {}),
      }

      const response = await fetch(
        editingItemId ? `/api/admin/catalog/${editingItemId}` : '/api/admin/catalog',
        {
          method: editingItemId ? 'PATCH' : 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(payload),
        }
      )

      const result = await response.json()

      if (!response.ok) {
        throw new Error(getClientErrorMessage(result, 'تعذر حفظ بيانات المنتج. لم يتم حفظ التغييرات.'))
      }

      setSuccessMessage(
        'تم حفظ بيانات المنتج بنجاح.'
      )
      if (editingItemId && removedCurrentImagePreview && !selectedImageFile) {
        await persistRemovedImageReference()
      }
      if (posDisplayMode === 'image' && selectedImageFile && result?.item?.id) {
        await handleImageUpload(result.item.id, selectedImageFile)
      }

      setHasChanges(false)
      resetForm()
      await loadItems(true)
    } catch (error) {
      setErrorMessage(getClientCaughtErrorMessage(error, 'تعذر حفظ بيانات المنتج. لم يتم حفظ التغييرات.'))
    } finally {
      setSaving(false)
    }
  }

  async function handleToggleItem(item: AdminCatalogItemRecord) {
    try {
      setUpdatingItemId(item.id)
      setSuccessMessage('')
      setErrorMessage('')

      const response = await fetch(`/api/admin/catalog/${item.id}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          name: item.name,
          code: item.code,
          category: item.category,
          item_type: item.item_type,
          cost_price: item.cost_price,
          default_price: item.default_price,
          pos_display_mode: item.pos_display_mode,
          pos_color: item.pos_color,
          pos_shape: item.pos_shape,
          is_composite: item.is_composite === true,
          track_inventory:
            canTrackInventory(item.item_type, item.is_composite === true) &&
            item.track_inventory === true,
          is_active: !item.is_active,
        }),
      })

      const result = await response.json()

      if (!response.ok) {
        throw new Error(getClientErrorMessage(result, 'تعذر تحديث حالة المنتج. لم يتم حفظ التغييرات.'))
      }

      setSuccessMessage(
        result?.message ||
          (item.is_active ? 'تم إيقاف العنصر مؤقتًا' : 'تم تفعيل العنصر بنجاح')
      )
      await loadItems(true)
    } catch (error) {
      setErrorMessage(
        getClientCaughtErrorMessage(error, 'تعذر تحديث حالة العنصر')
      )
    } finally {
      setUpdatingItemId(null)
    }
  }

  async function handleImageUpload(
    itemId: string,
    file: File | null
  ) {
    const validationError = validateCatalogImageFile(file)
    if (validationError) {
      throw new Error(validationError)
    }

    try {
      setUploadingImageItemId(itemId)
      setSuccessMessage('')
      setErrorMessage('')

      const uploadFile = file as File
      const formData = new FormData()
      formData.append('itemId', itemId)
      formData.append('file', uploadFile)

      const response = await fetch('/api/admin/catalog/upload-image', {
        method: 'POST',
        body: formData,
      })

      let result: unknown = null

      try {
        result = await response.json()
      } catch {}

      if (!response.ok) {
        throw new Error(
          getClientErrorMessage(
            result,
            'تعذر رفع الصورة. تحقق من الاتصال وحجم الملف ثم حاول مرة أخرى.'
          )
        )
      }

      const successBody =
        result && typeof result === 'object'
          ? (result as { message?: unknown })
          : null
      const successMessage =
        typeof successBody?.message === 'string'
          ? successBody.message
          : 'تم رفع صورة العنصر بنجاح'

      setSuccessMessage(successMessage)
      await loadItems(true)
    } catch (error) {
      setErrorMessage(
        getClientCaughtErrorMessage(error, 'تعذر رفع الصورة. تحقق من الاتصال وحجم الملف ثم حاول مرة أخرى.')
      )
    } finally {
      setUploadingImageItemId(null)
    }
  }

  function toggleBranch(branchId: string) {
    setSelectedBranches((prev) =>
      prev.includes(branchId)
        ? prev.filter((id) => id !== branchId)
        : [...prev, branchId]
    )
  }

  async function handleBulkDelete() {
    if (selectedItemIds.length === 0) return
    await handlePermanentBulkDelete()
    return
    /*

    const confirmed = window.confirm(
      'هل تريد حذف العناصر المحددة؟ لن تظهر هذه العناصر في الكتالوج بعد الحذف.'
    )
    if (!confirmed) return

    try {
      setIsBulkDeleting(true)
      setSaving(true)
      setSuccessMessage('')
      setErrorMessage('')
      setBulkDeleteTotal(selectedItemIds.length)
      setBulkDeleteDone(0)

      let deletedCount = 0
      let failedCount = 0

      for (const itemId of selectedItemIds) {
        const item = items.find((entry) => entry.id === itemId)
        if (!item) {
          failedCount += 1
          setBulkDeleteDone((current) => current + 1)
          continue
        }

        const currentItem = item!

        const response = await fetch(`/api/admin/catalog/${currentItem.id}`, {
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            name: currentItem.name,
            code: currentItem.code,
            category: currentItem.category,
            item_type: currentItem.item_type,
            cost_price: currentItem.cost_price,
            default_price: currentItem.default_price,
            pos_display_mode: currentItem.pos_display_mode,
            pos_color: currentItem.pos_color,
            pos_shape: currentItem.pos_shape,
            is_active: false,
          }),
        })

        await response.json()

        if (!response.ok) {
          failedCount += 1
          setBulkDeleteDone((current) => current + 1)
          continue
        }

        deletedCount += 1
        setBulkDeleteDone((current) => current + 1)
      }

      setSelectedItemIds([])
      if (options?.shouldReload !== false) {
        await loadItems(true)
      }

      setSuccessMessage(
        failedCount > 0
          ? `تم حذف ${deletedCount} عنصر، وفشل حذف ${failedCount} عنصر`
          : 'تم حذف العناصر المحددة بنجاح'
      )
    } catch (error) {
      setErrorMessage(
        getClientCaughtErrorMessage(error, 'تعذر حذف العنصر. لم يتم تنفيذ الحذف.')
      )
    } finally {
      setSaving(false)
      setIsBulkDeleting(false)
      setBulkDeleteTotal(0)
      setBulkDeleteDone(0)
    }
    */
  }

  async function handlePermanentBulkDelete() {
    if (selectedItemIds.length === 0) return

    const confirmed = window.confirm(
      'هل تريد حذف العناصر المحددة نهائيًا؟ لا يمكن التراجع عن هذه العملية. ستبقى الفواتير القديمة محفوظة كسجل تاريخي.'
    )
    if (!confirmed) return

    try {
      setIsBulkDeleting(true)
      setSaving(true)
      setSuccessMessage('')
      setErrorMessage('')
      setBulkDeleteTotal(selectedItemIds.length)
      setBulkDeleteDone(0)

      let deletedCount = 0
      let failedCount = 0
      let invoiceUsedCount = 0

      for (const itemId of selectedItemIds) {
        const item = items.find((entry) => entry.id === itemId)

        if (!item) {
          failedCount += 1
          setBulkDeleteDone((current) => current + 1)
          continue
        }

        const response = await fetch(`/api/admin/catalog/${item.id}`, {
          method: 'DELETE',
        })

        const result = await response.json().catch(() => null)

        if (!response.ok) {
          if (result?.error === 'ITEM_USED_IN_INVOICES') {
            invoiceUsedCount += 1
          }

          failedCount += 1
          setBulkDeleteDone((current) => current + 1)
          continue
        }

        deletedCount += 1
        setBulkDeleteDone((current) => current + 1)
      }

      setSelectedItemIds([])
      await loadItems(true)

      if (failedCount > 0 && deletedCount === 0) {
        setErrorMessage(`تعذر حذف ${failedCount} عنصر. لم يتم تنفيذ الحذف. حاول مرة أخرى.`)
      } else if (failedCount > 0 && invoiceUsedCount === failedCount) {
        setSuccessMessage(
          `تم حذف ${deletedCount} عنصر، وفشل حذف ${invoiceUsedCount} عنصر لأنها مستخدمة في فواتير سابقة`
        )
      } else if (failedCount > 0) {
        setSuccessMessage(`تم حذف ${deletedCount} عنصر، وفشل حذف ${failedCount} عنصر`)
      } else {
        setSuccessMessage('تم حذف العناصر المحددة بنجاح')
      }
    } catch (error) {
      setErrorMessage(
        getClientCaughtErrorMessage(error, 'تعذر حذف العناصر المحددة. لم يتم تنفيذ الحذف.')
      )
    } finally {
      setSaving(false)
      setIsBulkDeleting(false)
      setBulkDeleteTotal(0)
      setBulkDeleteDone(0)
    }
  }

  function toggleItemSelection(itemId: string) {
    setSelectedItemIds((current) =>
      current.includes(itemId)
        ? current.filter((id) => id !== itemId)
        : [...current, itemId]
    )
  }

  function toggleAllFilteredSelection() {
    if (allFilteredSelected) {
      setSelectedItemIds((current) =>
        current.filter((id) => !paginatedItems.some((item) => item.id === id))
      )
      return
    }

    setSelectedItemIds((current) => {
      const next = new Set(current)
      for (const item of paginatedItems) {
        next.add(item.id)
      }
      return Array.from(next)
    })
  }

  function startInlinePriceEdit(item: AdminCatalogItemRecord, field: InlinePriceField) {
    const rawValue = field === 'default_price' ? item.default_price : item.cost_price
    const safeValue = Number(rawValue ?? 0)

    setInlinePriceEdit({
      itemId: item.id,
      field,
      value: Number.isFinite(safeValue) ? String(safeValue) : '0',
    })
  }

  function cancelInlinePriceEdit() {
    setInlinePriceEdit(null)
  }

  function applyItemCategoryLocally(itemId: string, nextCategory: string) {
    setItems((currentItems) =>
      currentItems.map((currentItem) =>
        currentItem.id === itemId
          ? {
              ...currentItem,
              category: nextCategory,
            }
          : currentItem
      )
    )

    setBranchScopedItems((currentItems) =>
      currentItems
        ? currentItems.map((currentItem) =>
            currentItem.id === itemId
              ? {
                  ...currentItem,
                  category: nextCategory,
                }
              : currentItem
          )
        : currentItems
    )
  }

  async function updateItemCategory(item: AdminCatalogItemRecord, nextCategory: string) {
    const previousCategory = item.category

    try {
      setUpdatingCategoryItemId(item.id)
      setSuccessMessage('')
      setErrorMessage('')

      applyItemCategoryLocally(item.id, nextCategory)

      const payload = {
        name: item.name,
        code: item.code,
        category: nextCategory,
        item_type: item.item_type,
        cost_price: Number(item.cost_price ?? 0),
        default_price: Number(item.default_price ?? 0),
        pos_display_mode: item.pos_display_mode,
        pos_color: item.pos_color,
        pos_shape: item.pos_shape,
        is_composite: item.is_composite === true,
        track_inventory:
          canTrackInventory(item.item_type, item.is_composite === true) &&
          item.track_inventory === true,
        is_active: item.is_active,
      }

      const response = await fetch(`/api/admin/catalog/${item.id}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      })

      const result = await response.json()

      if (!response.ok) {
        throw new Error(getClientErrorMessage(result, 'تعذر تحديث فئة المنتج. لم يتم حفظ التغييرات.'))
      }

      applyItemCategoryLocally(item.id, result?.item?.category ?? nextCategory)
      setOpenCategoryMenuItemId(null)
      setSuccessMessage('تم تحديث الفئة بنجاح')
    } catch (error) {
      applyItemCategoryLocally(item.id, previousCategory)
      setErrorMessage(getClientCaughtErrorMessage(error, 'تعذر تحديث الفئة'))
    } finally {
      setUpdatingCategoryItemId(null)
    }
  }

  async function saveInlinePriceEdit(item: AdminCatalogItemRecord) {
    if (!inlinePriceEdit || inlinePriceEdit.itemId !== item.id) return

    try {
      setUpdatingItemId(item.id)
      setSuccessMessage('')
      setErrorMessage('')

      const nextValue = normalizeNumericInput(inlinePriceEdit.value)
      const payload = {
        name: item.name,
        code: item.code,
        category: item.category,
        item_type: item.item_type,
        cost_price:
          inlinePriceEdit.field === 'cost_price' ? nextValue : Number(item.cost_price ?? 0),
        default_price:
          inlinePriceEdit.field === 'default_price'
            ? nextValue
            : Number(item.default_price ?? 0),
        pos_display_mode: item.pos_display_mode,
        pos_color: item.pos_color,
        pos_shape: item.pos_shape,
        is_composite: item.is_composite === true,
        track_inventory:
          canTrackInventory(item.item_type, item.is_composite === true) &&
          item.track_inventory === true,
        is_active: item.is_active,
      }

      const response = await fetch(`/api/admin/catalog/${item.id}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      })

      const result = await response.json()

      if (!response.ok) {
        throw new Error(getClientErrorMessage(result, 'تعذر تحديث السعر. لم يتم حفظ التغييرات.'))
      }

      setInlinePriceEdit(null)
      setSuccessMessage(result?.message || 'تم تحديث السعر بنجاح')
      await loadItems(true)
    } catch (error) {
      setErrorMessage(getClientCaughtErrorMessage(error, 'تعذر تحديث السعر'))
    } finally {
      setUpdatingItemId(null)
    }
  }

  async function handleExportCsv() {
    const header = [
      'name',
      'code',
      'type',
      'category',
      'default_price',
      'cost_price',
      'is_active',
      'pos_display_mode',
      'pos_color',
      'pos_shape',
      'image_url',
    ]

    const params = new URLSearchParams({
      mode: 'export',
      pageSize: '5000',
    })

    if (searchQuery.trim()) {
      params.set('search', searchQuery.trim())
    }

    if (categoryFilter !== 'all') {
      params.set('category', categoryFilter)
    }

    if (statusFilter !== 'all') {
      params.set('status', statusFilter)
    }

    if (branchFilter !== 'all') {
      params.set('branchId', branchFilter)
      params.set('assignedActive', '1')
    }

    const response = await fetch(
      branchFilter === 'all'
        ? `/api/admin/catalog?${params.toString()}`
        : `/api/admin/branch-catalog?${params.toString()}`,
      {
        method: 'GET',
        cache: 'no-store',
      }
    )
    const result = await response.json()

    if (!response.ok) {
      setErrorMessage(getClientErrorMessage(result, 'تعذر تصدير المنتجات حاليًا. حاول مرة أخرى.'))
      return
    }

    const exportItems = (result.items || []) as AdminCatalogItemRecord[]
    const rows = exportItems.map((item) =>
      [
        item.name,
        item.code,
        item.item_type,
        item.category,
        item.default_price,
        item.cost_price,
        item.is_active,
        item.pos_display_mode,
        item.pos_color,
        item.pos_shape,
        item.image_url,
      ]
        .map((value) => escapeCsvValue(value))
        .join(',')
    )

    const today = new Date().toISOString().slice(0, 10)
    downloadTextFile(
      [header.join(','), ...rows].join('\n'),
      `catalog-items-${today}.csv`,
      'text/csv;charset=utf-8'
    )
  }

  function handleDownloadTemplate() {
    const header = [
      'name',
      'code',
      'type',
      'category',
      'default_price',
      'cost_price',
      'is_active',
      'pos_display_mode',
      'pos_color',
      'pos_shape',
      'image_url',
    ]

    const exampleRow = [
      'تنظيف سريع',
      '#0001',
      'service',
      'تنظيف',
      '120',
      '40',
      'true',
      'style',
      '#0F766E',
      'circle',
      '',
    ]

    downloadTextFile(
      [header.join(','), exampleRow.map((value) => escapeCsvValue(value)).join(',')].join(
        '\n'
      ),
      'catalog-items-template.csv',
      'text/csv;charset=utf-8'
    )
  }

  async function handleImportSubmit() {
    if (!importFile) {
      setErrorMessage('اختر ملف CSV أولًا')
      return
    }

    try {
      setImporting(true)
      setSuccessMessage('')
      setErrorMessage('')

      const content = await importFile.text()
      const rows = parseCsvContent(content)

      if (rows.length === 0) {
        throw new Error('ملف CSV فارغ أو غير صالح')
      }

      const payload = rows
        .map((row) => {
          const name = getCsvValue(row, 'name', 'Name')
          if (!name) {
            return null
          }

          const handle = getCsvValue(row, 'Handle')
          const sku = getCsvValue(row, 'SKU', 'code')
          const barcode = getCsvValue(row, 'Barcode')
          const category = getCsvValue(row, 'category', 'Category') || 'دون فئة'
          const explicitType = getCsvValue(row, 'type', 'item_type')
          const availableEskaf = getCsvValue(
            row,
            'Available for sale [إسْاف]',
            'Available for sale [Eskaf]'
          )
          const availableLeatherFix = getCsvValue(
            row,
            'Available for sale [AFEX]'
          )

          return {
            name,
            code: sku || barcode || handle,
            item_type: inferImportedItemType(category, handle, explicitType),
            category,
            default_price: normalizeImportedPrice(
              getCsvValue(row, 'default_price', 'Default price', 'Price')
            ),
            cost_price: normalizeImportedPrice(getCsvValue(row, 'cost_price', 'Cost')),
            is_active: normalizeImportedAvailability(
              getCsvValue(row, 'is_active'),
              availableEskaf,
              availableLeatherFix
            ),
            pos_display_mode: normalizeImportedDisplayMode(
              getCsvValue(row, 'pos_display_mode')
            ),
            pos_color: null,
            pos_shape: null,
            image_url: getCsvValue(row, 'image_url', 'Image URL') || null,
          }
        })
        .filter((item): item is NonNullable<typeof item> => Boolean(item))

      const response = await fetch('/api/admin/catalog', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ items: payload }),
      })

      const result = await response.json()

      if (!response.ok) {
        throw new Error(getClientErrorMessage(result, 'تعذر استيراد المنتجات. لم يتم حفظ العناصر غير المكتملة.'))
      }

      setSuccessMessage(
        typeof result?.inserted === 'number'
          ? `تم إدخال العناصر بنجاح. المضافة: ${result.inserted}، المحدثة: ${result.updated}، الفاشلة: ${result.failed}`
          : 'تم إدخال العناصر بنجاح'
      )
      setShowImportPanel(false)
      setImportFile(null)
      await loadItems(true)
    } catch (error) {
      setErrorMessage(getClientCaughtErrorMessage(error, 'تعذر إدخال العناصر'))
    } finally {
      setImporting(false)
    }
  }

  const removeImageDialog = showRemoveImageDialog ? (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 px-4 backdrop-blur-sm">
      <div className="w-full max-w-md rounded-3xl border border-rose-300/25 bg-[#07111f]/95 p-6 text-right shadow-[0_30px_110px_rgba(0,0,0,0.55)]">
        <div className="space-y-2">
          <h2 className="text-xl font-bold text-white">إزالة الصورة؟</h2>
          <p className="text-sm text-slate-500">
            هل أنت متأكد من إزالة صورة هذا العنصر؟
          </p>
        </div>

        <div className="mt-6 flex flex-wrap justify-end gap-3">
          <button
            type="button"
            onClick={handleConfirmRemoveImage}
            className="inline-flex h-11 items-center rounded-xl border border-rose-300/30 bg-rose-500/15 px-5 text-sm font-black text-rose-100 transition hover:bg-rose-500/25"
          >
            إزالة الصورة
          </button>
          <button
            type="button"
            onClick={() => setShowRemoveImageDialog(false)}
            className="inline-flex h-11 items-center rounded-xl border border-white/10 bg-white/[0.045] px-5 text-sm font-semibold text-slate-200 transition hover:bg-white/[0.08]"
          >
            إلغاء
          </button>
        </div>
      </div>
    </div>
  ) : null

  const catalogFormContent = (
    <form onSubmit={handleSubmit} className="space-y-4">
      <section className="overflow-visible rounded-3xl border border-cyan-300/15 bg-[#07111f]/90 p-6 shadow-[0_24px_90px_rgba(0,0,0,0.24)] md:p-8">
        <div className="space-y-6">
          <input type="hidden" value={form.category} readOnly />

          <div className="flex flex-col gap-6 md:flex-row md:items-end">
            <div className="flex w-full min-h-[56px] flex-col justify-end gap-2">
              <label className="block text-sm font-medium text-slate-700">
                الاسم
              </label>
              <input
                type="text"
                value={form.name}
                onChange={(e) =>
                  setForm((prev) => ({ ...prev, name: e.target.value }))
                }
                placeholder="الاسم"
                className="w-full appearance-none rounded-none border-0 border-b border-cyan-300/20 bg-transparent px-0 py-2 text-right text-xl font-semibold text-white shadow-none outline-none ring-0 placeholder:text-slate-500 focus:border-cyan-300/60 focus:ring-0"
                autoComplete="off"
              />
            </div>

            <div className="flex w-full min-h-[56px] flex-col justify-end gap-2">
              <label className="text-sm text-slate-400">الفئة</label>
              <div
                ref={itemTypeDropdownRef}
                className="relative overflow-visible"
              >
                <button
                  type="button"
                  onClick={(event) => {
                    event.stopPropagation()
                    setOpenFilterMenu((current) =>
                      current === 'itemType' ? null : 'itemType'
                    )
                  }}
                  className="min-h-[40px] w-full border-0 border-b border-cyan-300/20 bg-transparent py-2 pr-0 pl-6 text-right text-base font-medium text-slate-200 focus:border-cyan-300/60 focus:outline-none"
                >
                  <span className="absolute left-0 top-1/2 -translate-y-1/2 pointer-events-none text-slate-500">
                    {'\u25BE'}
                  </span>
                  <span className="block w-full text-right">{selectedFormCategoryLabel}</span>
                </button>
                {openFilterMenu === 'itemType' ? (
                  <div
                    className="absolute right-0 top-full z-50 mt-2 max-h-56 w-full overflow-y-auto rounded-xl border border-cyan-300/20 bg-[#07111f]/95 p-1 shadow-[0_18px_60px_rgba(0,0,0,0.45)] backdrop-blur-xl"
                    onClick={(event) => event.stopPropagation()}
                  >
                    {categoryDropdownOptions.map((option) => (
                      <button
                        key={option.value}
                        type="button"
                        onClick={() => {
                          applyCategorySelection(option.value)
                          setOpenFilterMenu(null)
                        }}
                        className={`block w-full cursor-pointer rounded-lg px-3 py-2 text-right text-sm transition-colors duration-150 ${
                          selectedCategoryValue === option.value
                            ? 'bg-cyan-300/12 font-semibold text-cyan-100'
                            : 'text-slate-300 hover:bg-cyan-300/10 hover:text-cyan-100'
                        }`}
                      >
                        {option.label}
                      </button>
                    ))}
                  </div>
                ) : null}
              </div>
            </div>
          </div>

          <div className="space-y-2">
            <label className="block text-sm font-medium text-slate-700">
                الوصف
            </label>
            <CatalogRichTextEditor
              value={description}
              onChange={setDescription}
              placeholder="اكتب وصف العنصر هنا..."
            />
          </div>

          <div className="space-y-2">
            <label className="block text-sm font-medium text-slate-700">
              يتم البيع بـ
            </label>
            <div className="flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={() => setSellBy('unit')}
                className={`inline-flex h-11 items-center rounded-full border px-5 text-sm font-semibold transition ${
                  sellBy === 'unit'
                    ? 'border-cyan-300/45 bg-cyan-300/15 text-cyan-100 shadow-[0_0_20px_rgba(34,211,238,0.12)]'
                    : 'border-white/10 bg-white/[0.045] text-slate-200 hover:bg-white/[0.08]'
                }`}
              >
                الوحدة
              </button>
              <button
                type="button"
                onClick={() => setSellBy('weight')}
                className={`inline-flex h-11 items-center rounded-full border px-5 text-sm font-semibold transition ${
                  sellBy === 'weight'
                    ? 'border-cyan-300/45 bg-cyan-300/15 text-cyan-100 shadow-[0_0_20px_rgba(34,211,238,0.12)]'
                    : 'border-white/10 bg-white/[0.045] text-slate-200 hover:bg-white/[0.08]'
                }`}
              >
                الوزن أو الحجم
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
            <div className="space-y-2">
              <label className="block text-sm font-medium text-slate-700">
                السعر
              </label>
              <AdminInput
                type="number"
                value={form.defaultPrice}
                onChange={(e) =>
                  setForm((prev) => ({
                    ...prev,
                    defaultPrice: e.target.value,
                  }))
                }
                className="h-12 rounded-none border-0 border-b border-cyan-300/20 bg-transparent px-0 text-right text-sm text-white shadow-none transition focus:border-cyan-300/60"
                min="0"
                step="0.01"
              />
            </div>

            <div className="space-y-2">
              <label className="block text-sm font-medium text-slate-700">
                التكلفة
              </label>
              <AdminInput
                type="number"
                value={form.costPrice}
                onChange={(e) =>
                  setForm((prev) => ({
                    ...prev,
                    costPrice: e.target.value,
                  }))
                }
                className="h-12 rounded-none border-0 border-b border-cyan-300/20 bg-transparent px-0 text-right text-sm text-white shadow-none transition focus:border-cyan-300/60"
                min="0"
                step="0.01"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div className="space-y-1.5">
              <label className="block text-sm font-medium text-slate-700">
                الكود
              </label>
              <AdminInput
                type="text"
                value={resolvedForm.code}
                readOnly
                disabled
                className="h-11 rounded-xl border border-white/10 bg-white/[0.045] px-3 text-left text-sm text-slate-300"
                dir="ltr"
              />
            </div>

            <div className="space-y-1.5">
              <label className="block text-sm font-medium text-slate-700">
                الباركود
              </label>
              <AdminInput
                type="text"
                value={resolvedForm.code}
                readOnly
                disabled
                className="h-11 rounded-xl border border-white/10 bg-white/[0.045] px-3 text-left text-sm text-slate-300"
                dir="ltr"
              />
            </div>
          </div>
        </div>
      </section>

      <section className="rounded-2xl border border-cyan-300/15 bg-[#07111f]/90 p-6 shadow-[0_18px_70px_rgba(0,0,0,0.22)]">
        <div className="space-y-3">
          <h2 className="text-base font-bold text-slate-900">المخزون</h2>
          <ToggleRow
            label="العنصر المركب"
            checked={compositeItem}
            onChange={setCompositeItem}
          />
          <ToggleRow
            label="تتبع المخزون"
            checked={canTrackInventory(resolvedForm.itemType, compositeItem) && trackInventory}
            onChange={setTrackInventory}
            disabled={!canTrackInventory(resolvedForm.itemType, compositeItem)}
          />
        </div>
      </section>

      <section className="rounded-2xl border border-cyan-300/15 bg-[#07111f]/90 p-6 shadow-[0_18px_70px_rgba(0,0,0,0.22)]">
        <div className="flex items-center justify-between">
          <button
            type="button"
            className="inline-flex h-10 items-center rounded-xl border border-cyan-300/20 bg-cyan-300/10 px-4 text-sm font-semibold text-cyan-100 transition hover:bg-cyan-300/15"
          >
            إضافة متغيرات
          </button>
          <h2 className="text-base font-bold text-slate-900">المتغيرات</h2>
        </div>
      </section>

      <section className="rounded-2xl border border-cyan-300/15 bg-[#07111f]/90 p-6 shadow-[0_18px_70px_rgba(0,0,0,0.22)]">
        <div className="space-y-4">
          <h2 className="text-base font-bold text-slate-900">المتاجر / الفروع</h2>

          <label className="flex items-center justify-between rounded-xl border border-cyan-300/15 bg-white/[0.035] px-4 py-3">
            <input
              type="checkbox"
              checked={availableInAllBranches}
              onChange={(e) => setAvailableInAllBranches(e.target.checked)}
              className="h-4 w-4 rounded border-slate-300"
            />
            <span className="text-sm font-medium text-slate-700">
              العنصر متوفر للبيع في كافة الفروع
            </span>
          </label>

          <div className="space-y-3">
            {branchOptions.map((branch) => (
              <div
                key={branch.id}
                className="rounded-xl border border-cyan-300/10 bg-white/[0.035] px-4 py-3"
              >
                <div className="flex items-center justify-between gap-3">
                  <AdminInput
                    type="number"
                    value={branchPrices[branch.id] || ''}
                    onChange={(e) =>
                      setBranchPrices((prev) => ({
                        ...prev,
                        [branch.id]: e.target.value,
                      }))
                    }
                    placeholder="السعر"
                    className="h-10 max-w-[160px] rounded-xl border border-cyan-300/15 bg-white/[0.045] px-3 text-right text-sm text-white"
                    min="0"
                    step="0.01"
                  />
                  <label className="flex items-center gap-3 text-sm font-medium text-slate-700">
                    <span>{branch.name}</span>
                    <input
                      type="checkbox"
                      checked={selectedBranches.includes(branch.id)}
                      onChange={() => toggleBranch(branch.id)}
                      className="h-4 w-4 rounded border-slate-300"
                    />
                  </label>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="rounded-2xl border border-cyan-300/15 bg-[#07111f]/90 p-6 shadow-[0_18px_70px_rgba(0,0,0,0.22)]">
        <div className="space-y-3">
          <h2 className="text-base font-bold text-slate-900">الضرائب</h2>
          <AdminDarkSelect
            value={taxOption}
            onChange={(nextValue) => setTaxOption(nextValue as TaxOption)}
            options={[
              { value: 'standard', label: 'الضريبة الأساسية' },
              { value: 'zero', label: 'بدون ضريبة' },
            ]}
            ariaLabel="الضرائب"
          />
        </div>
      </section>

      <section className="rounded-2xl border border-cyan-300/15 bg-[#07111f]/90 p-6 shadow-[0_18px_70px_rgba(0,0,0,0.22)]">
        <div className="space-y-4">
          <h2 className="text-base font-bold text-slate-900">
            العرض في نقطة البيع POS
          </h2>

          <div className="space-y-2">
            <label className="block text-sm font-medium text-slate-700">
              طريقة العرض
            </label>
            <div className="flex flex-wrap justify-end gap-2">
              <button
                type="button"
                onClick={() => setPosDisplayMode('style')}
                className={`inline-flex h-10 items-center rounded-xl border px-4 text-sm font-semibold transition ${
                  posDisplayMode === 'style'
                    ? 'border-cyan-300/45 bg-cyan-300/15 text-cyan-100 shadow-[0_0_20px_rgba(34,211,238,0.12)]'
                    : 'border-white/10 bg-white/[0.045] text-slate-200 hover:bg-white/[0.08]'
                }`}
              >
                اللون والشكل
              </button>
              <button
                type="button"
                onClick={() => setPosDisplayMode('image')}
                className={`inline-flex h-10 items-center rounded-xl border px-4 text-sm font-semibold transition ${
                  posDisplayMode === 'image'
                    ? 'border-cyan-300/45 bg-cyan-300/15 text-cyan-100 shadow-[0_0_20px_rgba(34,211,238,0.12)]'
                    : 'border-white/10 bg-white/[0.045] text-slate-200 hover:bg-white/[0.08]'
                }`}
              >
                صورة
              </button>
            </div>
          </div>

          {posDisplayMode === 'style' ? (
            <>
              <div className="space-y-2">
                <label className="block text-sm font-medium text-slate-700">
                  اللون
                </label>
                <div className="flex flex-wrap justify-end gap-2">
                  {POS_COLORS.map((color) => (
                    <button
                      key={color}
                      type="button"
                      onClick={() => setPosColor(color)}
                      className={`h-9 w-9 rounded-full border-2 transition ${
                        posColor === color
                          ? 'scale-105 border-cyan-200 shadow-[0_0_18px_rgba(34,211,238,0.28)]'
                          : 'border-white/50 ring-1 ring-white/10'
                      }`}
                      style={{ backgroundColor: color }}
                      aria-label={color}
                    />
                  ))}
                </div>
              </div>

              <div className="space-y-2">
                <label className="block text-sm font-medium text-slate-700">
                  الشكل
                </label>
                <div className="flex flex-wrap justify-end gap-2">
                  {POS_SHAPES.map((shape) => (
                    <button
                      key={shape.value}
                      type="button"
                      onClick={() => setPosShape(shape.value)}
                      className={`inline-flex h-10 items-center rounded-xl border px-4 text-sm font-semibold transition ${
                        posShape === shape.value
                          ? 'border-cyan-300/45 bg-cyan-300/15 text-cyan-100 shadow-[0_0_20px_rgba(34,211,238,0.12)]'
                          : 'border-white/10 bg-white/[0.045] text-slate-200 hover:bg-white/[0.08]'
                      }`}
                    >
                      {shape.label}
                    </button>
                  ))}
                </div>
              </div>
            </>
          ) : null}

          {posDisplayMode === 'image' ? (
            <div className="space-y-3">
              <label className="block text-sm font-medium text-slate-700">
                الصورة
              </label>
              {true ? (
                <div className="flex flex-wrap items-start gap-3">
                  {!posImagePreviewUrl ? (
                    <label className="flex h-11 cursor-pointer items-center justify-center rounded-xl border border-dashed border-cyan-300/20 bg-cyan-300/[0.035] px-3 text-sm text-slate-300 transition hover:bg-cyan-300/[0.055]">
                      <input
                        type="file"
                        accept=".jpg,.jpeg,.png,.webp,image/jpeg,image/png,image/webp"
                        className="hidden"
                        onChange={(e) => {
                          const file = e.target.files?.[0] || null
                          setSelectedImageFile(file)
                          setRemovedCurrentImagePreview(false)
                          e.currentTarget.value = ''
                        }}
                      />
                      {editingItemId && uploadingImageItemId === editingItemId
                        ? 'جارٍ رفع الصورة...'
                        : 'رفع'}
                    </label>
                  ) : null}
                  {posImagePreviewUrl ? (
                    <div className="w-[140px] shrink-0">
                      <div className="aspect-[4/3] w-full overflow-hidden rounded-lg border border-cyan-300/15 bg-white/[0.045]">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img
                            src={posImagePreviewUrl ?? undefined}
                          alt="معاينة صورة العنصر"
                          className="h-full w-full object-cover object-center"
                        />
                      </div>
                      <button
                        type="button"
                        onClick={() => setShowRemoveImageDialog(true)}
                        className="mt-2 inline-flex items-center text-sm font-medium text-slate-500 transition hover:text-red-500"
                        aria-label="إزالة الصورة"
                      >
                        إزالة الصورة
                      </button>
                    </div>
                  ) : null}
                </div>
              ) : (
                <div className="rounded-xl border border-dashed border-cyan-300/20 bg-cyan-300/[0.035] px-4 py-4 text-right text-sm text-slate-400">
                  اختر طريقة العرض أولًا ثم ارفع الصورة.
                </div>
              )}
            </div>
          ) : null}
        </div>
      </section>

      <div className="flex flex-wrap justify-end gap-3">
        <button
          type="submit"
          disabled={!canSubmit || saving}
          className="inline-flex h-11 items-center rounded-xl bg-emerald-600 px-5 text-sm font-semibold text-white transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {saving
            ? editingItemId
              ? 'جارٍ حفظ التعديل...'
              : 'جارٍ إضافة العنصر...'
            : 'حفظ'}
        </button>
        <button
          type="button"
          onClick={isEditModalOpen ? requestCloseEditModal : resetForm}
          className="inline-flex h-11 items-center rounded-xl border border-white/10 bg-white/[0.045] px-5 text-sm font-semibold text-slate-200 transition hover:bg-white/[0.08]"
        >
          إلغاء
        </button>
      </div>
    </form>
  )

  if (accessLoading) {
    return (
      <div className="rounded-[28px] border border-white/10 bg-white/[0.055] p-6 text-slate-200">
        جارٍ التحقق من الصلاحية...
      </div>
    )
  }

  if (!allowed || !isSystemAdmin) {
    return (
      <div className="rounded-[28px] border border-white/10 bg-white/[0.055] p-6 text-right shadow-[0_24px_90px_rgba(0,0,0,0.24)]">
          <h1 className="text-2xl font-black text-white">غير مصرح لك</h1>
          <p className="mt-2 text-slate-400">هذه الصفحة متاحة لمدير النظام فقط.</p>
          <div className="mt-4 flex flex-wrap justify-end gap-3">
            <Link
              href="/admin/settings"
              className="inline-flex items-center rounded-2xl border border-white/10 bg-white/[0.045] px-4 py-2 text-slate-200 transition hover:bg-white/[0.08]"
            >
              العودة إلى الإعدادات
            </Link>
            <Link
              href="/"
              className="inline-flex items-center rounded-2xl bg-cyan-300 px-4 py-2 font-black text-slate-950 transition hover:bg-cyan-200"
            >
              العودة إلى القائمة الرئيسية
            </Link>
          </div>
      </div>
    )
  }

  if (showFormView) {
    return (
      <div className="min-h-full">
        {removeImageDialog}

        <div className="mx-auto max-w-3xl space-y-5">
          <div className="flex items-center justify-between gap-3">
            <Link
              href="/admin/catalog"
              className="inline-flex h-11 items-center rounded-xl border border-white/10 bg-white/[0.045] px-5 text-sm font-semibold text-slate-200 shadow-sm transition hover:bg-white/[0.08]"
            >
              العودة إلى القائمة الرئيسية
            </Link>
            <div className="text-right">
              <h1 className="text-3xl font-black text-white">إضافة عنصر</h1>
              <p className="mt-2 text-sm text-slate-400">أنشئ عنصرًا جديدًا بنفس الحقول الحالية.</p>
            </div>
          </div>

          {successMessage ? (
            <AdminAlert tone="success">{successMessage}</AdminAlert>
          ) : null}

          {errorMessage ? (
            <AdminAlert tone="error">{errorMessage}</AdminAlert>
          ) : null}

          {catalogFormContent}
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-full w-full max-w-full overflow-x-hidden text-white [&_.border-slate-100]:border-white/10 [&_.border-slate-200]:border-white/10 [&_.border-slate-300]:border-white/15 [&_.bg-slate-50]:bg-white/[0.045] [&_.bg-white]:bg-[#07111f]/90 [&_.text-slate-900]:text-white [&_.text-slate-700]:text-slate-200 [&_.text-slate-600]:text-slate-300 [&_.text-slate-500]:text-slate-400">
      {isEditModalOpen ? (
        <>
          <div
            className="fixed inset-0 z-40 bg-black/30 backdrop-blur-sm"
            onClick={requestCloseEditModal}
          />
          <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
            <div className="max-h-[85vh] w-full max-w-[600px] overflow-y-auto rounded-[28px] border border-white/10 bg-[#07111f] p-6 shadow-[0_28px_110px_rgba(0,0,0,0.45)]">
              <div className="mb-6 flex items-center justify-between gap-3">
                <button
                  type="button"
                  onClick={requestCloseEditModal}
                  className="inline-flex h-11 items-center rounded-xl border border-white/10 bg-white/[0.045] px-5 text-sm font-semibold text-slate-200 shadow-sm transition hover:bg-white/[0.08]"
                >
                  إغلاق
                </button>
                <div className="text-right">
                  <h1 className="text-3xl font-black text-white">تعديل العنصر</h1>
                  <p className="mt-2 text-sm text-slate-400">
                    تعديل بيانات {editingItem?.name || 'العنصر'} بنفس النموذج الحالي.
                  </p>
                </div>
              </div>

              {successMessage ? (
                <AdminAlert tone="success" className="mb-4">
                  {successMessage}
                </AdminAlert>
              ) : null}

              {errorMessage ? (
                <AdminAlert tone="error" className="mb-4">
                  {errorMessage}
                </AdminAlert>
              ) : null}

              {catalogFormContent}
            </div>
          </div>
        </>
      ) : null}
      {showUnsavedModal ? (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-950/70 px-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-2xl border border-cyan-300/20 bg-[#07111f]/95 p-6 text-center shadow-[0_30px_110px_rgba(0,0,0,0.55)]">
            <h2 className="mb-2 text-lg font-semibold text-white">تغييرات غير محفوظة</h2>
            <p className="mb-6 text-sm text-slate-500">
              هل أنت متأكد أنك تريد مغادرة هذه الصفحة وتجاهل التغييرات؟
            </p>
            <div className="flex justify-center gap-4">
              <button
                type="button"
                className="font-medium text-emerald-600 transition hover:text-emerald-700"
                onClick={() => {
                  setShowUnsavedModal(false)
                  resetForm()
                }}
              >
                تجاهل التغييرات
              </button>
              <button
                type="button"
                className="text-slate-500 transition hover:text-slate-700"
                onClick={() => setShowUnsavedModal(false)}
              >
                مواصلة التعديل
              </button>
            </div>
          </div>
        </div>
      ) : null}

      <div className="w-full max-w-full space-y-6 overflow-x-hidden">
        <header className="relative overflow-hidden rounded-[30px] border border-white/10 bg-white/[0.045] p-6 shadow-[0_24px_90px_rgba(0,0,0,0.24)] backdrop-blur">
          <div className="pointer-events-none absolute -left-24 -top-24 h-72 w-72 rounded-full bg-cyan-400/15 blur-[90px]" />
          <div className="relative z-10 flex flex-col gap-5 xl:flex-row xl:items-center xl:justify-between">
            <div className="text-right">
              <div className="flex items-center justify-end gap-3">
                <div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-cyan-300/20 bg-cyan-300/10 text-cyan-200">
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
                    <CatalogPageIcon type="items" />
                  </svg>
                </div>
                <div>
                  <h1 className="text-3xl font-black text-white">العناصر</h1>
                  <p className="mt-2 text-sm text-slate-400">
                    إدارة جميع العناصر والخدمات في النظام
                  </p>
                </div>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={() => setShowImportPanel(true)}
                disabled={isBulkDeleting}
                className="inline-flex h-12 items-center rounded-2xl border border-white/10 bg-white/[0.045] px-5 text-sm font-bold text-slate-200 transition hover:bg-white/[0.08]"
              >
                استيراد / تصدير
              </button>
              <button
                type="button"
                onClick={openCreateForm}
                disabled={isBulkDeleting}
                className="inline-flex h-12 items-center gap-2 rounded-2xl bg-gradient-to-l from-cyan-300 to-teal-300 px-6 text-sm font-black text-slate-950 shadow-[0_0_32px_rgba(45,212,191,0.22)] transition hover:scale-[1.01] disabled:cursor-not-allowed disabled:opacity-60"
              >
                <span className="text-lg leading-none">+</span>
                إضافة عنصر جديد
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

        {showRemoveImageDialog ? (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 px-4 backdrop-blur-sm">
            <div className="w-full max-w-md rounded-3xl border border-rose-300/25 bg-[#07111f]/95 p-6 text-right shadow-[0_30px_110px_rgba(0,0,0,0.55)]">
              <div className="space-y-2">
                <h2 className="text-xl font-bold text-white">إزالة الصورة؟</h2>
                <p className="text-sm text-slate-500">
                  هل أنت متأكد من إزالة صورة هذا العنصر؟
                </p>
              </div>

              <div className="mt-6 flex flex-wrap justify-end gap-3">
                <button
                  type="button"
                  onClick={handleConfirmRemoveImage}
                  className="inline-flex h-11 items-center rounded-xl border border-rose-300/30 bg-rose-500/15 px-5 text-sm font-black text-rose-100 transition hover:bg-rose-500/25"
                >
                  إزالة الصورة
                </button>
                <button
                  type="button"
                  onClick={() => setShowRemoveImageDialog(false)}
                  className="inline-flex h-11 items-center rounded-xl border border-white/10 bg-white/[0.045] px-5 text-sm font-semibold text-slate-200 transition hover:bg-white/[0.08]"
                >
                  إلغاء
                </button>
              </div>
            </div>
          </div>
        ) : null}

        {showImportPanel ? (
          <div className="fixed inset-0 z-40 flex items-center justify-center bg-slate-950/70 px-4 backdrop-blur-sm">
            <div className="w-full max-w-xl rounded-3xl border border-cyan-300/20 bg-[#07111f]/95 p-6 text-right shadow-[0_30px_110px_rgba(0,0,0,0.55)]">
              <div className="flex items-start justify-between gap-4">
                <button
                  type="button"
                  onClick={() => {
                    setShowImportPanel(false)
                    setImportFile(null)
                  }}
                  className="hidden h-10 items-center rounded-xl border border-white/10 bg-white/[0.045] px-4 text-sm font-semibold text-slate-200 transition hover:bg-white/[0.08]"
                >
                  إلغاء
                </button>
                <div className="space-y-1">
                  <h2 className="text-xl font-bold text-white">إدخال العناصر</h2>
                </div>
              </div>

              <div className="mt-6 space-y-4">
                <button
                  type="button"
                  onClick={handleDownloadTemplate}
                  className="inline-flex h-10 items-center rounded-xl border border-cyan-300/20 bg-cyan-300/10 px-4 text-sm font-semibold text-cyan-100 transition hover:bg-cyan-300/15"
                >
                  تحميل الملف النموذجي
                </button>

                <label className="flex min-h-36 cursor-pointer flex-col items-center justify-center rounded-2xl border border-dashed border-cyan-300/20 bg-cyan-300/[0.035] px-4 py-6 text-center text-sm text-slate-400 transition hover:bg-cyan-300/[0.055]">
                  <input
                    type="file"
                    accept=".csv,text/csv"
                    className="hidden"
                    onChange={(event) =>
                      setImportFile(event.target.files?.[0] || null)
                    }
                  />
                  <span className="font-semibold text-slate-700">
                    {importFile ? importFile.name : 'اختر ملف CSV لرفعه'}
                  </span>
                  <span className="mt-1 text-xs text-slate-500">
                    الأعمدة المطلوبة: name, code, type, category, default_price, cost_price, is_active, pos_display_mode, pos_color, pos_shape, image_url
                  </span>
                </label>
              </div>

              <div className="mt-6 flex flex-wrap justify-end gap-3">
                <button
                  type="button"
                  onClick={handleImportSubmit}
                  disabled={!importFile || importing}
                  className="inline-flex h-11 items-center rounded-xl bg-gradient-to-l from-cyan-300 to-emerald-300 px-5 text-sm font-black text-slate-950 transition hover:shadow-[0_0_24px_rgba(34,211,238,0.22)] disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {importing ? 'جارٍ الرفع...' : 'رفع'}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setShowImportPanel(false)
                    setImportFile(null)
                  }}
                  className="inline-flex h-11 items-center rounded-xl border border-white/10 bg-white/[0.045] px-5 text-sm font-semibold text-slate-200 transition hover:bg-white/[0.08]"
                >
                  إلغاء
                </button>
              </div>
            </div>
          </div>
        ) : null}

        <section className="grid gap-5 md:grid-cols-2 xl:grid-cols-4">
          {catalogMetricCards.map((card) => (
            <CatalogMetricCard
              key={card.title}
              title={card.title}
              value={card.value}
              hint={card.hint}
              icon={card.icon}
            />
          ))}
        </section>

        <section className="max-w-full space-y-4 overflow-x-hidden">
          <div className="rounded-[28px] border border-cyan-500/15 bg-[#07111d]/80 p-5 shadow-[0_0_40px_rgba(0,255,255,0.05)] backdrop-blur-xl">
            <div className="flex flex-col gap-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">
                  {selectedItemIds.length > 0 ? (
                    <button
                      type="button"
                      onClick={() => void handleBulkDelete()}
                      disabled={saving || isBulkDeleting}
                      className="inline-flex h-11 items-center rounded-2xl border border-red-400/25 bg-red-500/10 px-4 text-sm font-bold text-red-200 transition hover:bg-red-500/15 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {isBulkDeleting ? 'جارٍ الحذف...' : `حذف ${selectedItemIds.length}`}
                    </button>
                  ) : null}
                </div>
                <div className="flex shrink-0 flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setShowImportPanel(true)}
                    disabled={isBulkDeleting}
                    className="inline-flex h-11 items-center rounded-2xl border border-white/10 bg-white/[0.045] px-4 text-sm font-bold text-slate-200 transition hover:bg-white/[0.08]"
                  >
                    استيراد
                  </button>
                  <button
                    type="button"
                    onClick={handleExportCsv}
                    disabled={isBulkDeleting}
                    className="inline-flex h-11 items-center rounded-2xl border border-white/10 bg-white/[0.045] px-4 text-sm font-bold text-slate-200 transition hover:bg-white/[0.08]"
                  >
                    تصدير
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-1 items-center gap-3 rounded-[24px] border border-cyan-500/15 bg-white/[0.035] p-3 md:grid-cols-2 xl:grid-cols-[minmax(320px,1fr)_190px_190px_190px_auto]">
                <AdminInput
                  type="text"
                  value={searchQuery}
                  onChange={(event) => setSearchQuery(event.target.value)}
                  placeholder="ابحث بالاسم أو الكود أو التصنيف"
                  disabled={isBulkDeleting}
                  className="h-12 min-w-0 rounded-2xl !border-cyan-500/15 !bg-[rgba(255,255,255,0.04)] px-5 text-right text-sm font-bold !text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.03)] outline-none !placeholder:text-slate-500 focus:!border-cyan-300/55 focus:!bg-white/[0.06] focus:ring-2 focus:ring-cyan-300/20"
                />
                <div className="relative shrink-0">
                  <button
                    type="button"
                    onClick={(event) => {
                      if (isBulkDeleting) return
                      event.stopPropagation()
                      setOpenFilterMenu((current) =>
                        current === 'branch' ? null : 'branch'
                      )
                    }}
                    disabled={isBulkDeleting}
                    className="flex h-12 min-w-[180px] items-center justify-between rounded-2xl border border-cyan-500/15 bg-[#07111f] px-4 text-sm font-bold text-slate-200 shadow-sm transition hover:border-cyan-300/35 hover:bg-white/[0.055] disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    <span>▾</span>
                    <span>{selectedBranchLabel}</span>
                  </button>

                  {openFilterMenu === 'branch' ? (
                    <div
                      className="absolute right-0 top-full z-20 mt-2 min-w-[180px] rounded-2xl border border-white/10 bg-[#07111f] p-1 shadow-[0_24px_70px_rgba(0,0,0,0.35)]"
                      onClick={(event) => event.stopPropagation()}
                    >
                      <button
                        type="button"
                        onClick={() => {
                          setBranchFilter('all')
                          setOpenFilterMenu(null)
                        }}
                        className={`flex w-full items-center justify-between rounded-lg px-3 py-2 text-right text-sm transition ${
                          branchFilter === 'all'
                            ? 'bg-cyan-300/10 font-semibold text-cyan-100'
                            : 'text-slate-300 hover:bg-white/[0.06] hover:text-white'
                        }`}
                      >
                        <span>{branchFilter === 'all' ? '✓' : ''}</span>
                        <span>كل الفروع</span>
                      </button>
                      {branchOptions.map((branch) => (
                        <button
                          key={branch.id}
                          type="button"
                          onClick={() => {
                            setBranchFilter(branch.id)
                            setOpenFilterMenu(null)
                          }}
                          className={`flex w-full items-center justify-between rounded-lg px-3 py-2 text-right text-sm transition ${
                            branchFilter === branch.id
                              ? 'bg-cyan-300/10 font-semibold text-cyan-100'
                              : 'text-slate-300 hover:bg-white/[0.06] hover:text-white'
                          }`}
                        >
                          <span>{branchFilter === branch.id ? '✓' : ''}</span>
                          <span>{branch.name}</span>
                        </button>
                      ))}
                    </div>
                  ) : null}
                </div>
                <div className="relative shrink-0">
                  <button
                    type="button"
                    onClick={(event) => {
                      if (isBulkDeleting) return
                      event.stopPropagation()
                      setOpenFilterMenu((current) =>
                        current === 'category' ? null : 'category'
                      )
                    }}
                    disabled={isBulkDeleting}
                    className="flex h-12 min-w-[180px] items-center justify-between rounded-2xl border border-cyan-500/15 bg-[#07111f] px-4 text-sm font-bold text-slate-200 shadow-sm transition hover:border-cyan-300/35 hover:bg-white/[0.055] disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    <span>▾</span>
                    <span>{selectedCategoryLabel}</span>
                  </button>

                  {openFilterMenu === 'category' ? (
                    <div
                      className="absolute right-0 top-full z-20 mt-2 min-w-[180px] rounded-2xl border border-white/10 bg-[#07111f] p-1 shadow-[0_24px_70px_rgba(0,0,0,0.35)]"
                      onClick={(event) => event.stopPropagation()}
                    >
                      <button
                        type="button"
                        onClick={() => {
                          setCategoryFilter('all')
                          setOpenFilterMenu(null)
                        }}
                        className={`flex w-full items-center justify-between rounded-lg px-3 py-2 text-right text-sm transition ${
                          categoryFilter === 'all'
                            ? 'bg-cyan-300/10 font-semibold text-cyan-100'
                            : 'text-slate-300 hover:bg-white/[0.06] hover:text-white'
                        }`}
                      >
                        <span>{categoryFilter === 'all' ? '✓' : ''}</span>
                        <span>كل التصنيفات</span>
                      </button>
                      {categoryOptions.map((category) => (
                        <button
                          key={category}
                          type="button"
                          onClick={() => {
                            setCategoryFilter(category)
                            setOpenFilterMenu(null)
                          }}
                          className={`flex w-full items-center justify-between rounded-lg px-3 py-2 text-right text-sm transition ${
                            categoryFilter === category
                              ? 'bg-cyan-300/10 font-semibold text-cyan-100'
                              : 'text-slate-300 hover:bg-white/[0.06] hover:text-white'
                          }`}
                        >
                          <span>{categoryFilter === category ? '✓' : ''}</span>
                          <span>{category}</span>
                        </button>
                      ))}
                    </div>
                  ) : null}
                </div>
                <AdminDarkSelect
                  value={statusFilter}
                  onChange={(value) =>
                    setStatusFilter(value as 'all' | 'active' | 'inactive')
                  }
                  disabled={isBulkDeleting}
                  options={[
                    { value: 'all', label: 'كل الحالات' },
                    { value: 'active', label: 'نشط' },
                    { value: 'inactive', label: 'معطل' },
                  ]}
                  ariaLabel="فلتر الحالة"
                   triggerClassName="h-12 min-w-[180px] rounded-2xl border-cyan-500/15 bg-[#07111f] px-4 text-sm font-bold text-slate-200 shadow-sm hover:border-cyan-300/35 hover:bg-white/[0.055] focus:border-cyan-300/50 focus:ring-cyan-300/15 disabled:cursor-not-allowed disabled:opacity-60"
                  menuClassName="border-white/10 bg-[#07111f]"
                />
                <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">
                  <span className="rounded-full border border-cyan-500/15 bg-cyan-300/5 px-3 py-1.5 text-xs font-semibold text-cyan-100">
                    الكل {catalogTotalCount}
                  </span>
                  <span className="rounded-full border border-emerald-400/20 bg-emerald-500/10 px-3 py-1.5 text-xs font-semibold text-emerald-200">
                    نشط {activeItemsCount}
                  </span>
                  <span className="rounded-full border border-amber-400/20 bg-amber-500/10 px-3 py-1.5 text-xs font-semibold text-amber-200">
                    معطل {inactiveItemsCount}
                  </span>
                </div>
              </div>
            </div>
          </div>

          <div className="flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
            <div className="text-right">
              <h2 className="text-xl font-black text-white">جدول العناصر</h2>
              <p className="mt-1 text-sm text-slate-400">
                الأسعار والتصنيفات والحالة قابلة للتعديل من نفس الجدول
              </p>
            </div>
            <p className="text-left text-sm font-bold text-slate-500">
              عرض {filteredItems.length} من {catalogTotalCount} عنصر
            </p>
          </div>

          <div className="max-w-full overflow-hidden rounded-3xl border border-cyan-500/15 bg-[#07111d]/90 shadow-[0_0_40px_rgba(0,255,255,0.06)] backdrop-blur-xl">
            {isBulkDeleting ? (
              <div className="border-b border-amber-400/20 bg-amber-500/10 px-4 py-3">
                <div className="flex items-center justify-between gap-4 text-sm font-medium text-amber-100">
                  <span>
                    جارٍ حذف العناصر... {bulkDeleteDone} من {bulkDeleteTotal}
                  </span>
                </div>
                <div className="mt-2 h-2 overflow-hidden rounded-full bg-amber-950/50">
                  <div
                    className="h-full rounded-full bg-amber-500 transition-all duration-200"
                    style={{ width: `${bulkDeleteProgress}%` }}
                  />
                </div>
              </div>
            ) : null}
            {loadingItems ? (
              <div className="px-4 py-14 text-center text-sm font-bold text-slate-400">
                جارٍ تحميل العناصر...
              </div>
            ) : filteredItems.length === 0 ? (
              <div className="flex flex-col items-center justify-center bg-[#07111f] px-4 py-16 text-center">
                <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl border border-cyan-300/15 bg-cyan-300/10 text-cyan-200">
                  <svg
                    viewBox="0 0 24 24"
                    className="h-8 w-8"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.8"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    aria-hidden="true"
                  >
                    <CatalogPageIcon type="items" />
                  </svg>
                </div>
                <p className="text-base font-black text-white">
                  {branchFilterMessage || 'لا توجد منتجات في الكتالوج مطابقة للفلاتر الحالية.'}
                </p>
                <p className="mt-2 max-w-md text-sm text-slate-500">
                  جرّب تعديل الفلاتر أو أضف أول عنصر جديد إلى الكتالوج.
                </p>
                <button
                  type="button"
                  onClick={openCreateForm}
                  disabled={isBulkDeleting}
                  className="mt-5 inline-flex h-11 items-center rounded-2xl bg-cyan-300 px-5 text-sm font-black text-slate-950 transition hover:bg-cyan-200 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  إضافة أول عنصر
                </button>
              </div>
            ) : (
              <div className="max-w-full overflow-x-auto overscroll-x-contain">
                <table className="w-full min-w-[1180px] table-fixed border-separate border-spacing-0 text-right">
                  <colgroup>
                    <col className="w-[48px]" />
                    <col className="w-[80px]" />
                    <col className="w-[320px]" />
                    <col className="w-[140px]" />
                    <col className="w-[140px]" />
                    <col className="w-[140px]" />
                    <col className="w-[140px]" />
                    <col className="w-[120px]" />
                    <col className="w-[120px]" />
                    <col className="w-[170px]" />
                  </colgroup>
                  <thead className="sticky top-0 z-10 border-b border-cyan-300/10 bg-[#050d18] text-xs font-black text-white shadow-[0_14px_40px_rgba(0,0,0,0.2)]">
                    <tr>
                      <th className="px-3 py-4 text-center">
                        <div className="flex justify-center">
                          <input
                            type="checkbox"
                            checked={allFilteredSelected}
                            onChange={toggleAllFilteredSelection}
                            disabled={isBulkDeleting}
                            className="h-4 w-4 accent-cyan-300"
                            aria-label="تحديد الكل"
                          />
                        </div>
                      </th>
                      <th className="whitespace-nowrap px-3 py-4 text-center">
                        الصورة
                      </th>
                      <th className="whitespace-nowrap px-4 py-4 text-right">
                        <button
                          type="button"
                          onClick={handleNameSort}
                          className="group inline-flex items-center gap-1 text-right transition hover:text-cyan-100"
                        >
                          <span>اسم العنصر / الباركود</span>
                          <span
                            className={`text-[10px] opacity-70 transition-all ${
                              nameSort === 'none'
                                ? 'opacity-0 text-slate-500 group-hover:opacity-100'
                                : ''
                            } ${nameSort === 'desc' ? 'text-cyan-200 opacity-100' : ''} ${
                              nameSort === 'asc' ? 'rotate-180 text-cyan-200 opacity-100' : ''
                            }`}
                          >
                            ↓
                          </span>
                        </button>
                      </th>
                      <th
                        onClick={handleCategorySort}
                        className="group cursor-pointer select-none whitespace-nowrap px-3 py-4 text-center transition hover:text-cyan-100"
                      >
                        <div className="flex items-center justify-center gap-1">
                          <span>الفئة</span>
                          <span
                            className={`text-[10px] opacity-70 transition-all ${
                              categorySort === 'none'
                                ? 'opacity-0 text-slate-500 group-hover:opacity-100'
                                : ''
                            } ${categorySort === 'desc' ? 'text-cyan-200 opacity-100' : ''} ${
                              categorySort === 'asc' ? 'rotate-180 text-cyan-200 opacity-100' : ''
                            }`}
                          >
                            ↓
                          </span>
                        </div>
                      </th>
                      <th
                        onClick={handleSalePriceSort}
                        className="group cursor-pointer select-none whitespace-nowrap px-3 py-4 text-center transition hover:text-cyan-100"
                      >
                        <div className="flex items-center justify-center gap-1">
                          <span>السعر</span>
                          <span
                            className={`text-[10px] opacity-70 transition-all ${
                              salePriceSort === 'none'
                                ? 'opacity-0 text-slate-500 group-hover:opacity-100'
                                : ''
                            } ${salePriceSort === 'desc' ? 'text-cyan-200 opacity-100' : ''} ${
                              salePriceSort === 'asc' ? 'rotate-180 text-cyan-200 opacity-100' : ''
                            }`}
                          >
                            ↓
                          </span>
                        </div>
                      </th>
                      <th
                        onClick={handleCostPriceSort}
                        className="group cursor-pointer select-none whitespace-nowrap px-3 py-4 text-center transition hover:text-cyan-100"
                      >
                        <div className="flex items-center justify-center gap-1">
                          <span>التكلفة</span>
                          <span
                            className={`text-[10px] opacity-70 transition-all ${
                              costPriceSort === 'none'
                                ? 'opacity-0 text-slate-500 group-hover:opacity-100'
                                : ''
                            } ${costPriceSort === 'desc' ? 'text-cyan-200 opacity-100' : ''} ${
                              costPriceSort === 'asc' ? 'rotate-180 text-cyan-200 opacity-100' : ''
                            }`}
                          >
                            ↓
                          </span>
                        </div>
                      </th>
                      <th
                        onClick={handleProfitSort}
                        className="group cursor-pointer select-none whitespace-nowrap px-3 py-4 text-center transition hover:text-cyan-100"
                      >
                        <div className="flex items-center justify-center gap-1">
                          <span>هامش الربح</span>
                          <span
                            className={`text-[10px] opacity-70 transition-all ${
                              profitSort === 'none'
                                ? 'opacity-0 text-slate-500 group-hover:opacity-100'
                                : ''
                            } ${profitSort === 'desc' ? 'text-cyan-200 opacity-100' : ''} ${
                              profitSort === 'asc' ? 'rotate-180 text-cyan-200 opacity-100' : ''
                            }`}
                          >
                            ↓
                          </span>
                        </div>
                      </th>
                      <th className="whitespace-nowrap px-3 py-4 text-center">المخزون</th>
                      <th className="whitespace-nowrap px-3 py-4 text-center">الحالة</th>
                      <th className="whitespace-nowrap px-3 py-4 text-center">الإجراءات</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/[0.08] text-sm leading-tight text-slate-300">
                    {paginatedItems.map((item) => {
                      const profitMargin = getProfitMarginValue(
                        Number(item.cost_price ?? 0),
                        Number(item.default_price ?? 0)
                      )
                      const profitMarginLabel = calculateProfitMargin(
                        Number(item.cost_price ?? 0),
                        Number(item.default_price ?? 0)
                      )

                      return (
                      <tr
                        key={item.id}
                        className="h-[78px] border-b border-white/[0.08] bg-[#07111d]/70 transition-all duration-200 hover:bg-cyan-500/5 hover:shadow-[inset_-3px_0_0_rgba(34,211,238,0.35)]"
                      >
                        <td className="px-3 py-3 text-center align-middle">
                          <div className="flex justify-center">
                            <input
                              type="checkbox"
                              checked={selectedItemIds.includes(item.id)}
                              onChange={() => toggleItemSelection(item.id)}
                              disabled={isBulkDeleting}
                              className="h-4 w-4 accent-cyan-300"
                              aria-label={`تحديد ${item.name}`}
                            />
                          </div>
                        </td>
                        <td className="whitespace-nowrap px-3 py-3 text-center align-middle">
                          <div className="flex justify-center">
                            {item.image_url ? (
                              <div
                                className="h-14 w-14 shrink-0 rounded-2xl border border-cyan-300/10 bg-cover bg-center bg-no-repeat shadow-[0_10px_28px_rgba(0,0,0,0.18)]"
                                style={{ backgroundImage: `url(${item.image_url})` }}
                                aria-label={item.name}
                              />
                            ) : (
                              <div className="flex h-14 w-14 items-center justify-center rounded-2xl border border-cyan-300/15 bg-cyan-300/10 text-cyan-200">
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
                                  <CatalogPageIcon type="items" />
                                </svg>
                              </div>
                            )}
                          </div>
                        </td>
                        <td className="px-4 py-3 text-right align-middle font-semibold leading-tight">
                          <button
                            type="button"
                            onClick={() => startEdit(item)}
                            disabled={isBulkDeleting}
                            className="block w-full max-w-[330px] cursor-pointer truncate text-right text-base font-black text-white transition hover:text-cyan-100 disabled:cursor-not-allowed disabled:opacity-60"
                          >
                            {item.name}
                          </button>
                          <p className="mt-1 max-w-[260px] truncate text-xs font-bold text-slate-500">
                            {item.code || 'بدون باركود'}
                          </p>
                        </td>
                        <td className="whitespace-nowrap px-3 py-3 text-center align-middle leading-tight">
                          <div
                            ref={openCategoryMenuItemId === item.id ? tableCategoryDropdownRef : null}
                            className="relative"
                          >
                            <button
                              type="button"
                              onClick={() =>
                                setOpenCategoryMenuItemId((current) =>
                                  current === item.id ? null : item.id
                                )
                              }
                              disabled={updatingCategoryItemId === item.id || isBulkDeleting}
                              className="w-full truncate rounded-xl border border-white/[0.08] bg-white/[0.035] px-3 py-2 text-center text-sm font-bold text-slate-200 transition hover:border-cyan-300/20 hover:bg-white/[0.08] disabled:cursor-not-allowed disabled:opacity-60"
                            >
                              {getDisplayCategoryLabel(item)}
                            </button>

                            {openCategoryMenuItemId === item.id ? (
                              <div className="absolute right-0 top-full z-50 mt-2 min-w-[170px] overflow-hidden rounded-2xl border border-white/10 bg-[#07111f] text-right shadow-[0_24px_70px_rgba(0,0,0,0.35)]">
                                {categoryDropdownOptions.map((option) => {
                                  const isSelected =
                                    option.value === getDisplayCategoryLabel(item)

                                  return (
                                    <button
                                      key={option.value}
                                      type="button"
                                      onClick={() => {
                                        if (isSelected) {
                                          setOpenCategoryMenuItemId(null)
                                          return
                                        }

                                        void updateItemCategory(item, option.value)
                                      }}
                                      disabled={updatingCategoryItemId === item.id}
                                      className={`block w-full px-3 py-2 text-right text-sm transition ${
                                        isSelected
                                          ? 'bg-cyan-300/10 text-cyan-100'
                                          : 'text-slate-300 hover:bg-white/[0.06]'
                                      } disabled:cursor-not-allowed disabled:opacity-60`}
                                    >
                                      {option.label}
                                    </button>
                                  )
                                })}
                              </div>
                            ) : null}
                          </div>
                        </td>
                        <td className="whitespace-nowrap px-3 py-3 text-center align-middle">
                          {inlinePriceEdit?.itemId === item.id &&
                          inlinePriceEdit.field === 'default_price' ? (
                            <div className="flex items-center justify-center gap-2">
                              <button
                                type="button"
                                onClick={() => void saveInlinePriceEdit(item)}
                                disabled={updatingItemId === item.id || isBulkDeleting}
                                className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-500/10 text-sm font-bold text-emerald-200 shadow-sm transition hover:bg-emerald-500/15 disabled:cursor-not-allowed disabled:opacity-60"
                              >
                                ✓
                              </button>
                              <button
                                type="button"
                                onClick={cancelInlinePriceEdit}
                                disabled={isBulkDeleting}
                                className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-red-500/10 text-sm font-bold text-red-200 shadow-sm transition hover:bg-red-500/15"
                              >
                                ✕
                              </button>
                              <input
                                type="text"
                                value={inlinePriceEdit.value}
                                onChange={(event) =>
                                  setInlinePriceEdit((current) =>
                                    current
                                      ? {
                                          ...current,
                                          value: event.target.value,
                                        }
                                      : current
                                  )
                                }
                                disabled={isBulkDeleting}
                                className="h-9 w-24 rounded-lg border border-white/10 bg-[#030714] px-2 text-right text-sm text-white shadow-sm outline-none"
                                autoFocus
                              />
                            </div>
                          ) : (
                            <button
                              type="button"
                              onClick={() => startInlinePriceEdit(item, 'default_price')}
                              disabled={isBulkDeleting}
                              className="rounded-xl px-3 py-2 text-base font-black tabular-nums text-white transition hover:bg-white/[0.08]"
                            >
                              {formatCurrency(item.default_price ?? 0)}
                            </button>
                          )}
                        </td>
                        <td className="whitespace-nowrap px-3 py-3 text-center align-middle">
                          {inlinePriceEdit?.itemId === item.id &&
                          inlinePriceEdit.field === 'cost_price' ? (
                            <div className="flex items-center justify-center gap-2">
                              <button
                                type="button"
                                onClick={() => void saveInlinePriceEdit(item)}
                                disabled={updatingItemId === item.id || isBulkDeleting}
                                className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-500/10 text-sm font-bold text-emerald-200 shadow-sm transition hover:bg-emerald-500/15 disabled:cursor-not-allowed disabled:opacity-60"
                              >
                                ✓
                              </button>
                              <button
                                type="button"
                                onClick={cancelInlinePriceEdit}
                                disabled={isBulkDeleting}
                                className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-red-500/10 text-sm font-bold text-red-200 shadow-sm transition hover:bg-red-500/15"
                              >
                                ×
                              </button>
                              <input
                                type="text"
                                value={inlinePriceEdit.value}
                                onChange={(event) =>
                                  setInlinePriceEdit((current) =>
                                    current
                                      ? {
                                          ...current,
                                          value: event.target.value,
                                        }
                                      : current
                                  )
                                }
                                disabled={isBulkDeleting}
                                className="h-9 w-24 rounded-lg border border-white/10 bg-[#030714] px-2 text-right text-sm text-white shadow-sm outline-none"
                                autoFocus
                              />
                            </div>
                          ) : (
                            <button
                              type="button"
                              onClick={() => startInlinePriceEdit(item, 'cost_price')}
                              disabled={isBulkDeleting}
                              className="rounded-xl px-3 py-2 text-sm font-black tabular-nums text-slate-200 transition hover:bg-white/[0.08]"
                            >
                              {formatCurrency(item.cost_price ?? 0)}
                            </button>
                          )}
                        </td>
                        <td className="whitespace-nowrap px-3 py-3 text-center align-middle">
                          <span
                            className={`inline-flex min-w-[74px] items-center justify-center rounded-full border px-3 py-1.5 text-sm font-semibold tabular-nums ${
                              profitMargin > 0
                                ? 'border-emerald-300/20 bg-emerald-400/10 text-emerald-200 shadow-[0_0_22px_rgba(16,185,129,0.1)]'
                                : 'border-slate-500/20 bg-slate-500/10 text-slate-300'
                            }`}
                          >
                            {profitMarginLabel}
                          </span>
                        </td>
                        <td className="whitespace-nowrap px-3 py-3 text-center align-middle leading-tight">
                          <span className="inline-flex max-w-full items-center justify-center rounded-full border border-slate-500/20 bg-slate-500/10 px-3 py-1 text-xs font-black text-slate-300">
                            غير متتبع
                          </span>
                        </td>
                        <td className="whitespace-nowrap px-3 py-3 text-center align-middle">
                          <span
                            className={`inline-flex min-w-[74px] items-center justify-center gap-2 rounded-full border px-3 py-1.5 text-xs font-black leading-tight ${
                              item.is_active
                                ? 'border-emerald-300/25 bg-emerald-400/10 text-emerald-100'
                                : 'border-rose-300/25 bg-rose-500/10 text-rose-100'
                            }`}
                          >
                            <span
                              className={`h-1.5 w-1.5 rounded-full ${
                                item.is_active ? 'bg-emerald-300' : 'bg-rose-300'
                              }`}
                            />
                            {item.is_active ? 'نشط' : 'غير نشط'}
                          </span>
                        </td>
                        <td className="whitespace-nowrap px-3 py-3 text-center align-middle">
                          <div className="flex items-center justify-center gap-2">
                            <button
                              type="button"
                              onClick={() => toggleItemSelection(item.id)}
                              disabled={isBulkDeleting}
                              aria-label="تحديد العنصر للحذف"
                              title="تحديد العنصر للحذف"
                              className={`inline-flex h-9 w-9 items-center justify-center rounded-xl border bg-white/[0.045] transition hover:border-red-400/30 hover:bg-red-500/10 hover:text-red-200 hover:shadow-[0_0_18px_rgba(248,113,113,0.12)] disabled:cursor-not-allowed disabled:opacity-60 ${
                                selectedItemIds.includes(item.id)
                                  ? 'border-red-400/30 text-red-200 shadow-[0_0_18px_rgba(248,113,113,0.12)]'
                                  : 'border-white/10 text-red-300/80'
                              }`}
                            >
                              <svg
                                viewBox="0 0 24 24"
                                className="h-4.5 w-4.5"
                                fill="none"
                                stroke="currentColor"
                                strokeWidth="2"
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                aria-hidden="true"
                              >
                                <path d="M3 6h18" />
                                <path d="M8 6V4h8v2" />
                                <path d="M19 6l-1 14H6L5 6" />
                                <path d="M10 11v5" />
                                <path d="M14 11v5" />
                              </svg>
                            </button>
                            <button
                              type="button"
                              onClick={() => startEdit(item)}
                              disabled={isBulkDeleting}
                              aria-label="تعديل العنصر"
                              title="تعديل العنصر"
                              className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-white/10 bg-white/[0.045] text-sm font-bold text-slate-200 transition hover:border-cyan-300/25 hover:bg-cyan-300/10 hover:text-cyan-100 disabled:cursor-not-allowed disabled:opacity-60"
                            >
                              <svg
                                viewBox="0 0 24 24"
                                className="h-4.5 w-4.5"
                                fill="none"
                                stroke="currentColor"
                                strokeWidth="2"
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                aria-hidden="true"
                              >
                                <path d="M12 20h9" />
                                <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" />
                              </svg>
                            </button>
                            <button
                              type="button"
                              disabled={updatingItemId === item.id || isBulkDeleting}
                              onClick={() => handleToggleItem(item)}
                              aria-pressed={item.is_active}
                              aria-label={item.is_active ? 'إيقاف العنصر' : 'تفعيل العنصر'}
                              title={item.is_active ? 'إيقاف العنصر' : 'تفعيل العنصر'}
                              className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-cyan-300/20 bg-white/[0.045] text-cyan-200 transition hover:border-cyan-300/35 hover:bg-cyan-300/10 hover:text-cyan-100 hover:shadow-[0_0_18px_rgba(34,211,238,0.14)] disabled:cursor-not-allowed disabled:opacity-60"
                            >
                              <svg
                                viewBox="0 0 24 24"
                                className="h-4.5 w-4.5"
                                fill="none"
                                stroke="currentColor"
                                strokeWidth="2"
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                aria-hidden="true"
                              >
                                <path d="M12 2v10" />
                                <path d="M18.4 6.6a8 8 0 1 1-12.8 0" />
                              </svg>
                            </button>
                          </div>
                        </td>
                      </tr>
                      )
                    })}
                  </tbody>
                </table>
                {totalPages > 1 ? (
                  <div className="flex flex-wrap items-center justify-center gap-3 border-t border-cyan-500/10 bg-[#050d18]/35 px-4 py-4 text-sm">
                    <button
                      type="button"
                      onClick={() => setCurrentPage((page) => Math.max(1, page - 1))}
                      disabled={currentPage === 1}
                      className="inline-flex h-10 items-center rounded-xl border border-white/10 bg-white/[0.045] px-4 font-semibold text-slate-200 transition hover:bg-white/[0.08] disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      السابق
                    </button>

                    <div className="flex flex-wrap items-center justify-center gap-2">
                      {visiblePageNumbers.map((pageNumber, index) => {
                        const previousPage = visiblePageNumbers[index - 1]
                        const shouldShowEllipsis =
                          previousPage != null && pageNumber - previousPage > 1

                        return (
                          <Fragment key={pageNumber}>
                            {shouldShowEllipsis ? (
                              <span className="px-1 text-slate-500">...</span>
                            ) : null}
                            <button
                              type="button"
                              onClick={() => setCurrentPage(pageNumber)}
                              className={`inline-flex h-10 min-w-10 items-center justify-center rounded-xl px-3 font-semibold transition ${
                                currentPage === pageNumber
                                  ? 'bg-cyan-300 text-slate-950'
                                  : 'border border-white/10 bg-white/[0.045] text-slate-200 hover:bg-white/[0.08]'
                              }`}
                            >
                              {pageNumber}
                            </button>
                          </Fragment>
                        )
                      })}
                    </div>

                    <button
                      type="button"
                      onClick={() =>
                        setCurrentPage((page) => Math.min(totalPages, page + 1))
                      }
                      disabled={currentPage === totalPages}
                      className="inline-flex h-10 items-center rounded-xl border border-white/10 bg-white/[0.045] px-4 font-semibold text-slate-200 transition hover:bg-white/[0.08] disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      التالي
                    </button>
                  </div>
                ) : null}
              </div>
            )}
          </div>
        </section>
      </div>
      <style jsx global>{`
        .description-editor__input {
          direction: rtl;
          text-align: right;
          line-height: 1.8;
        }

        .description-editor__input:empty::before {
          content: attr(data-placeholder);
          color: #94a3b8;
          pointer-events: none;
        }

        .description-editor__input ul,
        .description-editor__input ol {
          padding-right: 1.25rem;
          padding-left: 0;
        }

        .description-editor__input a {
          color: #2563eb;
          text-decoration: underline;
        }
      `}</style>
    </div>
  )
}
