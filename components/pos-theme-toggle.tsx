'use client'

type PosTheme = 'dark' | 'light'

const STORAGE_KEY = 'afex-pos-theme-v1'

function currentTheme(): PosTheme {
  if (typeof document === 'undefined') return 'dark'
  return document.documentElement.dataset.posTheme === 'light' ? 'light' : 'dark'
}

export function PosThemeToggle() {
  const toggleTheme = () => {
    const nextTheme: PosTheme = currentTheme() === 'dark' ? 'light' : 'dark'
    document.documentElement.dataset.posTheme = nextTheme
    document.documentElement.style.colorScheme = nextTheme
    window.localStorage.setItem(STORAGE_KEY, nextTheme)
  }

  return (
    <button
      type="button"
      className="afex-pos-theme-toggle"
      aria-label="التبديل بين الوضع الفاتح والداكن"
      title="تبديل المظهر"
      onClick={toggleTheme}
    >
      <span aria-hidden="true">◐</span>
      <b>المظهر</b>
    </button>
  )
}
