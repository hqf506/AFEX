'use client'

type PosSaleStep = 'customer' | 'items' | 'checkout'

const POS_SALE_STEPS: Array<{
  key: PosSaleStep
  number: string
  label: string
  helper: string
}> = [
  { key: 'customer', number: '1', label: 'بيانات العميل', helper: 'بداية البيع' },
  { key: 'items', number: '2', label: 'اختيار العناصر', helper: 'بناء الطلب' },
  { key: 'checkout', number: '3', label: 'الدفع والإغلاق', helper: 'إنهاء الفاتورة' },
]

type PosStepIndicatorProps = {
  currentStep: PosSaleStep
  className?: string
}

export function PosStepIndicator({
  currentStep,
  className = '',
}: PosStepIndicatorProps) {
  const currentIndex = POS_SALE_STEPS.findIndex((step) => step.key === currentStep)

  return (
    <div
      className={`rounded-[24px] bg-slate-50 p-3 ring-1 ring-slate-200 md:p-4 ${className}`}
    >
      <div className="grid gap-2.5 md:grid-cols-3">
        {POS_SALE_STEPS.map((step, index) => {
          const isActive = step.key === currentStep
          const isCompleted = index < currentIndex

          return (
            <div
              key={step.key}
              className={`rounded-2xl px-4 py-3 text-right transition ${
                isActive
                  ? 'bg-slate-950 text-white shadow-sm'
                  : isCompleted
                    ? 'bg-white text-slate-900 ring-1 ring-emerald-200'
                    : 'bg-white text-slate-500 ring-1 ring-slate-200'
              }`}
            >
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p
                    className={`text-xs font-bold ${
                      isActive
                        ? 'text-slate-200'
                        : isCompleted
                          ? 'text-emerald-700'
                          : 'text-slate-400'
                    }`}
                  >
                    {step.helper}
                  </p>
                  <h3 className="mt-1 text-sm font-extrabold md:text-base">
                    {step.label}
                  </h3>
                </div>

                <span
                  className={`inline-flex h-9 w-9 items-center justify-center rounded-full text-sm font-black ${
                    isActive
                      ? 'bg-white text-slate-950'
                      : isCompleted
                        ? 'bg-emerald-100 text-emerald-700'
                        : 'bg-slate-100 text-slate-500'
                  }`}
                >
                  {isCompleted ? '✓' : step.number}
                </span>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
