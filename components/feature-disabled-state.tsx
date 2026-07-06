'use client'

type FeatureDisabledStateProps = {
  title: string
  message: string
}

export function FeatureDisabledState({
  title,
  message,
}: FeatureDisabledStateProps) {
  return (
    <div
      dir="rtl"
      className="relative min-h-[60vh] overflow-hidden rounded-[30px] border border-cyan-300/15 bg-[#07111d]/95 p-6 text-white shadow-[0_28px_100px_rgba(0,0,0,0.34)] backdrop-blur-xl"
    >
      <div className="pointer-events-none absolute -right-20 top-0 h-64 w-64 rounded-full bg-cyan-400/10 blur-3xl" />
      <div className="pointer-events-none absolute -left-20 bottom-0 h-72 w-72 rounded-full bg-emerald-400/10 blur-3xl" />
      <div className="relative flex min-h-[48vh] items-center justify-center">
        <div className="max-w-lg text-center">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl border border-cyan-300/25 bg-cyan-300/10 text-cyan-100 shadow-[0_0_34px_rgba(34,211,238,0.14)]">
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="h-7 w-7"
              aria-hidden="true"
            >
              <path d="M12 3 4.5 6.5v5.7c0 4.2 3.1 7.2 7.5 8.8 4.4-1.6 7.5-4.6 7.5-8.8V6.5L12 3Z" />
              <path d="M9 12h6" />
            </svg>
          </div>
          <p className="text-xs font-black tracking-[0.18em] text-cyan-200">
            AFEX SETTINGS
          </p>
          <h2 className="mt-2 text-2xl font-black text-white">{title}</h2>
          <p className="mt-3 text-sm font-bold leading-7 text-slate-300">
            {message}
          </p>
        </div>
      </div>
    </div>
  )
}
