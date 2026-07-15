'use client'

import { useFormStatus } from 'react-dom'

export function CustomerSaveButton() {
  const { pending } = useFormStatus()

  return (
    <button
      type="submit"
      disabled={pending}
      className="inline-flex h-12 items-center justify-center rounded-2xl bg-gradient-to-l from-cyan-300 to-emerald-300 px-6 text-sm font-black text-slate-950 shadow-[0_0_35px_rgba(34,211,238,0.22)] transition hover:scale-[1.01] disabled:cursor-not-allowed disabled:opacity-60"
    >
      {pending ? 'جارٍ الحفظ...' : 'حفظ'}
    </button>
  )
}
