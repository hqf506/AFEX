export function RouteLoadingState() {
  return (
    <div dir="rtl" className="min-w-0 animate-pulse space-y-4" aria-label="جارٍ تحميل الصفحة" role="status">
      <div className="h-20 rounded-[24px] border border-cyan-300/10 bg-[#07111f]/85" />
      <div className="grid min-w-0 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }).map((_, index) => (
          <div key={index} className="h-24 rounded-[22px] border border-white/[0.06] bg-white/[0.035]" />
        ))}
      </div>
      <div className="h-64 rounded-[26px] border border-white/[0.06] bg-[#07111f]/75" />
    </div>
  )
}
