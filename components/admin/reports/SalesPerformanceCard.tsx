'use client'

import { formatCurrency } from '@/lib/orders/format'

type SalesChartDatum = {
  key: string
  label: string
  displayValue: string
  barClassName: string
  heightPercentage: number
}

type SalesPerformanceCardProps = {
  totalSales: number
  totalOrders: number
  averageOrderValue: number
  salesChartData: SalesChartDatum[]
}

export default function SalesPerformanceCard({
  totalSales,
  totalOrders,
  averageOrderValue,
  salesChartData,
}: SalesPerformanceCardProps) {
  return (
    <div className="rounded-2xl border border-slate-100 bg-white p-7 shadow-sm">
      <div className="mb-6 text-right">
        <h2 className="text-lg font-semibold text-slate-900">أداء المبيعات</h2>
        <p className="mt-1 text-sm text-slate-500">
          نظرة مركزة على أهم أرقام الأداء خلال الفترة الحالية
        </p>
      </div>

      {totalSales > 0 ? (
        <div className="space-y-4 rounded-2xl border border-slate-100 bg-slate-50 px-5 py-4 text-right">
          <div className="flex items-start justify-between gap-4">
            <span className="rounded-full bg-gray-100 px-2 py-1 text-xs text-gray-600">
              {totalOrders} طلب
            </span>
            <div>
              <p className="text-sm text-gray-500">إجمالي المبيعات</p>
              <div className="mt-2 flex items-end justify-end gap-2">
                <span className="text-sm font-medium text-gray-400">ر.س</span>
                <span className="text-5xl font-bold tracking-tight text-black">
                  {Number(totalSales.toFixed(0)).toString()}
                </span>
              </div>
              <p className="mt-1 text-xs text-gray-400">إجمالي الفترة الحالية</p>
            </div>
          </div>

          <div className="grid grid-cols-1 items-center gap-6 xl:grid-cols-[2fr_1fr]">
            <div className="rounded-2xl border border-slate-100 bg-white px-4 py-4">
              <div className="flex h-40 items-end justify-center gap-6">
                {salesChartData.map((item) => (
                  <div
                    key={item.key}
                    className="flex h-full flex-col items-center justify-end gap-2"
                  >
                    <div className="text-xs text-gray-500">
                      {item.displayValue}
                    </div>
                    <div className="flex h-32 items-end">
                      <div
                        className={`w-12 rounded-t-2xl ${item.barClassName}`}
                        style={{ height: `${item.heightPercentage}%` }}
                      />
                    </div>
                    <div className="text-center text-sm text-gray-600">
                      {item.label}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="rounded-2xl border border-slate-100 bg-white px-4 py-4">
              <div className="space-y-3">
                <div className="flex items-center justify-between border-b border-gray-100 pb-3">
                  <p className="text-sm text-gray-500">عدد الطلبات</p>
                  <p className="text-base font-semibold text-gray-900">
                    {totalOrders} طلب
                  </p>
                </div>
                <div className="flex items-center justify-between">
                  <p className="text-sm text-gray-500">متوسط قيمة الطلب</p>
                  <p className="text-base font-semibold text-gray-900">
                    {formatCurrency(averageOrderValue)}
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      ) : (
        <div className="flex h-[320px] items-center justify-center rounded-2xl border border-dashed border-slate-200 bg-slate-50 text-sm text-slate-400">
          لا توجد بيانات حالياً
        </div>
      )}
    </div>
  )
}
