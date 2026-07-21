'use client'

import {
  createContext,
  startTransition,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react'

type PosTabletFrameProps = {
  children: React.ReactNode
  isLoginPage?: boolean
}

type PosTabletMode = 'portrait' | 'landscape'

const POS_TABLET_MODE_STORAGE_KEY = 'pos-tablet-frame-mode'
const PosTabletFrameContext = createContext<{
  mode: PosTabletMode
  toggleMode: () => void
} | null>(null)

export function usePosTabletFrame() {
  return useContext(PosTabletFrameContext)
}

export function PosTabletFrame({
  children,
  isLoginPage = false,
}: PosTabletFrameProps) {
  const [mode, setMode] = useState<PosTabletMode>('landscape')
  const [hydrated, setHydrated] = useState(false)

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      const storedMode = window.localStorage.getItem(POS_TABLET_MODE_STORAGE_KEY)

      startTransition(() => {
        if (storedMode === 'portrait' || storedMode === 'landscape') {
          setMode(storedMode)
        }

        setHydrated(true)
      })
    }, 0)

    return () => window.clearTimeout(timeoutId)
  }, [])

  useEffect(() => {
    if (!hydrated) {
      return
    }

    window.localStorage.setItem(POS_TABLET_MODE_STORAGE_KEY, mode)
  }, [hydrated, mode])

  const frameWidthClass =
    hydrated && mode === 'landscape' ? 'xl:w-[1194px]' : 'xl:w-[834px]'

  const desktopScreenHeightClass =
    hydrated && mode === 'landscape' ? 'xl:h-[834px]' : 'xl:h-[1194px]'

  const contextValue = useMemo(
    () => ({
      mode,
      toggleMode: () =>
        setMode((currentMode) =>
          currentMode === 'portrait' ? 'landscape' : 'portrait'
        ),
    }),
    [mode]
  )

  return (
    <PosTabletFrameContext.Provider value={contextValue}>
      <div className="pos-tablet-frame-root h-full min-h-0 w-full xl:flex xl:h-[100dvh] xl:w-screen xl:items-center xl:justify-center xl:overflow-hidden xl:bg-black">
        <div
          className={`pos-tablet-frame-shell h-full min-h-0 w-full xl:relative xl:shrink-0 xl:transition-all xl:duration-200 xl:ease-out ${frameWidthClass} ${desktopScreenHeightClass} ${
            hydrated
              ? 'xl:opacity-100 xl:transition-opacity xl:duration-150'
              : 'xl:opacity-0'
          }`}
        >
          <div
            className="pos-tablet-device relative h-full w-full overflow-hidden xl:rounded-[24px] xl:border xl:border-black/30 xl:bg-black xl:p-[2px] xl:shadow-[0_30px_100px_rgba(0,0,0,0.65)] xl:ring-1 xl:ring-white/10 xl:transition-all xl:duration-200 xl:ease-out"
          >
            <span
              aria-hidden="true"
              className="pointer-events-none absolute inset-y-[14%] left-[1px] hidden w-[3px] rounded-full bg-white/12 xl:block"
            />
            <div
              className="pos-tablet-screen h-full w-full overflow-hidden xl:rounded-[20px] xl:bg-white xl:transition-all xl:duration-200 xl:ease-out"
            >
              <div
                className={`h-full min-h-0 w-full overflow-hidden transition-all duration-200 ease-out ${
                  isLoginPage ? 'min-h-[100dvh] xl:min-h-0' : ''
                }`}
              >
                {children}
              </div>
            </div>
          </div>
        </div>
      </div>
    </PosTabletFrameContext.Provider>
  )
}
