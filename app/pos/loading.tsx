export default function PosLoading() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-100 px-4 text-right text-slate-900">
      <div className="w-full max-w-sm rounded-[28px] border border-slate-200 bg-white p-6 text-center shadow-sm">
        <div className="mx-auto mb-4 h-10 w-10 animate-pulse rounded-2xl bg-slate-950" />
        <h1 className="text-xl font-black text-slate-950">جاري فتح نقطة البيع</h1>
        <p className="mt-2 text-sm font-bold text-slate-500">
          يتم تجهيز جلسة AFEX POS...
        </p>
      </div>
    </main>
  )
}
