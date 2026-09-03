'use client'

import { type MouseEvent, useSyncExternalStore } from 'react'

import styles from './pos-theme-toggle.module.css'

type PosTheme = 'dark' | 'light'

const STORAGE_KEY = 'afex-pos-theme-v1'

function currentTheme(): PosTheme {
  if (typeof document === 'undefined') return 'dark'
  return document.documentElement.dataset.posTheme === 'light' ? 'light' : 'dark'
}

function serverTheme(): PosTheme {
  return 'dark'
}

function subscribeToTheme(onThemeChange: () => void) {
  const observer = new MutationObserver(onThemeChange)

  observer.observe(document.documentElement, {
    attributeFilter: ['data-pos-theme'],
    attributes: true,
  })

  return () => observer.disconnect()
}

function MoonIcon() {
  return (
    <svg
      className={styles.moonIcon}
      data-pos-theme-icon="moon"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="1.8"
      aria-hidden="true"
    >
      <path d="M20.5 14.2A8.5 8.5 0 0 1 9.8 3.5a8.5 8.5 0 1 0 10.7 10.7Z" />
    </svg>
  )
}

function SunIcon() {
  return (
    <svg
      className={styles.sunIcon}
      data-pos-theme-icon="sun"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="1.8"
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2M12 20v2M4.93 4.93l1.42 1.42M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.42-1.42M17.66 6.34l1.41-1.41" />
    </svg>
  )
}

export function PosThemeToggle() {
  const theme = useSyncExternalStore(subscribeToTheme, currentTheme, serverTheme)
  const actionLabel = theme === 'light' ? 'تفعيل الوضع الليلي' : 'تفعيل الوضع النهاري'

  const toggleTheme = (event: MouseEvent<HTMLButtonElement>) => {
    event.stopPropagation()

    const nextTheme: PosTheme = currentTheme() === 'dark' ? 'light' : 'dark'
    document.documentElement.dataset.posTheme = nextTheme
    document.documentElement.style.colorScheme = nextTheme
    window.localStorage.setItem(STORAGE_KEY, nextTheme)
  }

  return (
    <button
      type="button"
      className={`afex-pos-theme-toggle ${styles.toggle}`}
      aria-label={actionLabel}
      aria-pressed={theme === 'dark'}
      title={actionLabel}
      data-pos-theme-toggle="model-one"
      onClick={toggleTheme}
    >
      <span className={styles.actionIcon} aria-hidden="true">
        <MoonIcon />
        <SunIcon />
      </span>
    </button>
  )
}
