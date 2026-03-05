'use client'

import { PrivyProvider } from '@privy-io/react-auth'
import { useEffect } from 'react'

export default function PrivyProviderWrapper({
  children,
}: {
  children: React.ReactNode
}) {
  const privyAppId = process.env.NEXT_PUBLIC_PRIVY_APP_ID || ''
  const PRIVY_ROOT_SELECTOR = '[id*="privy"], [class*="privy"], [data-privy-portal], [data-privy-root]'

  // Debug logging (only once, not in render)
  useEffect(() => {
    if (privyAppId && typeof window !== 'undefined') {
      console.log('PrivyProviderWrapper: Initializing with App ID', privyAppId.substring(0, 10) + '...')
    }
  }, [privyAppId])

  // Suppress WalletConnect double initialization warning
  // This is a known harmless warning from Privy's internal WalletConnect setup
  useEffect(() => {
    if (typeof window === 'undefined') return
    
    const originalWarn = console.warn
    console.warn = (...args: any[]) => {
      const message = args.join(' ')
      if (message.includes('WalletConnect Core is already initialized')) {
        return
      }
      originalWarn.apply(console, args)
    }
    
    return () => {
      console.warn = originalWarn
    }
  }, [])

  // Add comprehensive error handler for script loading failures
  useEffect(() => {
    if (typeof window === 'undefined') return
    
    const handleError = (event: ErrorEvent) => {
      if (event.filename?.includes('embedded-wallets') || 
          event.message?.includes('embedded-wallets') ||
          event.error?.message?.includes('embedded-wallets')) {
        console.warn('Embedded wallets script error caught and suppressed:', event.message)
        event.stopPropagation()
        event.stopImmediatePropagation()
        return true
      }
      
      if (event.message?.includes('authenticate') || 
          event.message?.includes('session') ||
          event.filename?.includes('privy.io')) {
        console.warn('Privy authentication error caught:', event.message)
        return false
      }
      
      return false
    }
    
    const handleUnhandledRejection = (event: PromiseRejectionEvent) => {
      if (event.reason?.message?.includes('embedded-wallets') ||
          event.reason?.toString()?.includes('embedded-wallets')) {
        console.warn('Embedded wallets promise rejection caught and suppressed')
        event.preventDefault()
        return true
      }
      
      if (event.reason?.message?.includes('authenticate') ||
          event.reason?.message?.includes('422') ||
          event.reason?.toString()?.includes('authenticate')) {
        console.warn('Privy authentication promise rejection caught:', event.reason)
        return false
      }
      
      return false
    }
    
    window.addEventListener('error', handleError, true)
    window.addEventListener('unhandledrejection', handleUnhandledRejection)
    
    return () => {
      window.removeEventListener('error', handleError, true)
      window.removeEventListener('unhandledrejection', handleUnhandledRejection)
    }
  }, [])

  // iOS/Safari guardrail: some fixed full-screen overlays can intercept all taps over Privy dialogs.
  useEffect(() => {
    if (typeof window === 'undefined' || typeof document === 'undefined') return

    const patchedElements = new Map<HTMLElement, string>()

    const isPrivyRelated = (element: Element | null): boolean => {
      if (!element) return false
      if (element.matches(PRIVY_ROOT_SELECTOR)) return true
      return !!element.closest(PRIVY_ROOT_SELECTOR)
    }

    const parseZIndex = (value: string): number => {
      const parsed = Number.parseInt(value, 10)
      return Number.isFinite(parsed) ? parsed : 0
    }

    const restorePatchedElements = () => {
      patchedElements.forEach((pointerValue, element) => {
        element.style.pointerEvents = pointerValue
      })
      patchedElements.clear()
    }

    const applyPointerEventGuard = () => {
      const dialogs = Array.from(
        document.querySelectorAll<HTMLElement>('[role="dialog"], [aria-modal="true"]')
      ).filter((dialog) => isPrivyRelated(dialog))

      if (dialogs.length === 0) {
        restorePatchedElements()
        return
      }

      dialogs.forEach((dialog) => {
        dialog.style.pointerEvents = 'auto'
      })

      const viewportWidth = window.innerWidth
      const viewportHeight = window.innerHeight
      const fullScreenDivs = Array.from(document.querySelectorAll<HTMLElement>('div')).filter((div) => {
        const style = window.getComputedStyle(div)
        if (style.position !== 'fixed') return false
        if (style.pointerEvents === 'none') return false
        if (parseZIndex(style.zIndex) < 1000) return false

        const rect = div.getBoundingClientRect()
        const coversViewport =
          rect.width >= viewportWidth * 0.95 &&
          rect.height >= viewportHeight * 0.95 &&
          rect.top <= 1 &&
          rect.left <= 1
        if (!coversViewport) return false

        // Keep actual modal content interactive; we only neutralize blockers.
        if (dialogs.some((dialog) => div === dialog || div.contains(dialog))) return false

        // Prefer privy-related blockers; fallback to any high z-index fullscreen blocker while modal is open.
        return isPrivyRelated(div) || isPrivyRelated(div.parentElement)
      })

      const activeSet = new Set(fullScreenDivs)

      patchedElements.forEach((_pointerValue, element) => {
        if (!activeSet.has(element)) {
          element.style.pointerEvents = patchedElements.get(element) || ''
          patchedElements.delete(element)
        }
      })

      fullScreenDivs.forEach((div) => {
        if (!patchedElements.has(div)) {
          patchedElements.set(div, div.style.pointerEvents)
        }
        div.style.pointerEvents = 'none'
      })
    }

    const observer = new MutationObserver(() => {
      applyPointerEventGuard()
    })
    observer.observe(document.body, { childList: true, subtree: true, attributes: true })

    applyPointerEventGuard()

    return () => {
      observer.disconnect()
      restorePatchedElements()
    }
  }, [])

  // If no app ID, show error message (after all hooks have been called)
  if (!privyAppId) {
    return (
      <div className="min-h-screen bg-black text-white flex items-center justify-center px-4">
        <div className="text-center max-w-md">
          <h1 className="text-2xl font-bold mb-4 text-red-400">Configuration Error</h1>
          <p className="text-neon-green mb-4 opacity-90">
            Privy App ID is missing. Please set NEXT_PUBLIC_PRIVY_APP_ID in your environment variables.
          </p>
        </div>
      </div>
    )
  }

  return (
    <PrivyProvider
      appId={privyAppId}
      config={{
        loginMethods: ['email', 'wallet', 'sms'],
        appearance: {
          theme: 'light',
          accentColor: '#000000',
        },
        embeddedWallets: {
          ethereum: {
            createOnLogin: 'users-without-wallets',
          },
        },
      }}
    >
      {children}
    </PrivyProvider>
  )
}

