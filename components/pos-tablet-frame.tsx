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
      <div className="pos-tablet-frame-mobile h-full min-h-0 w-full xl:hidden">
        <div className="h-full min-h-0 w-full">
          <div className={`h-full min-h-0 w-full overflow-hidden ${isLoginPage ? 'min-h-[100dvh]' : ''}`}>
            {children}
          </div>
        </div>
      </div>

      <div className="pos-tablet-frame-desktop hidden h-[100dvh] w-screen overflow-hidden bg-black xl:flex xl:items-center xl:justify-center">
        <div
          className={`pos-tablet-frame-shell relative shrink-0 transition-all duration-200 ease-out ${frameWidthClass} ${desktopScreenHeightClass} ${
            hydrated ? 'opacity-100 transition-opacity duration-150' : 'opacity-0'
          }`}
        >
          <div
            className="pos-tablet-device relative h-full overflow-hidden rounded-[24px] border border-black/30 bg-black p-[2px] shadow-[0_30px_100px_rgba(0,0,0,0.65)] ring-1 ring-white/10 transition-all duration-200 ease-out"
          >
            <span
              aria-hidden="true"
              className="pointer-events-none absolute inset-y-[14%] left-[1px] hidden w-[3px] rounded-full bg-white/12 xl:block"
            />
            <div
              className="pos-tablet-screen h-full w-full overflow-hidden rounded-[20px] bg-white transition-all duration-200 ease-out"
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
