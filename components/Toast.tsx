'use client'

import { useEffect, useState } from 'react'
import { X, CheckCircle, AlertCircle, Info, AlertTriangle } from 'lucide-react'

export type ToastType = 'success' | 'error' | 'info' | 'warning'

export interface Toast {
  id: string
  message: string
  type: ToastType
  duration?: number
}

interface ToastProps {
  toast: Toast
  onRemove: (id: string) => void
}

function ToastComponent({ toast, onRemove }: ToastProps) {
  useEffect(() => {
    const duration = toast.duration || 3000
    const timer = setTimeout(() => {
      onRemove(toast.id)
    }, duration)

    return () => clearTimeout(timer)
  }, [toast.id, toast.duration, onRemove])

  const icons = {
    success: CheckCircle,
    error: AlertCircle,
    info: Info,
    warning: AlertTriangle,
  }

  const colors = {
    success: 'bg-green-500/15 text-green-300 border border-green-400/30',
    error: 'bg-red-500/15 text-red-300 border border-red-400/30',
    info: 'bg-blue-500/15 text-blue-300 border border-blue-400/30',
    warning: 'bg-yellow-500/15 text-yellow-300 border border-yellow-400/30',
  }

  const labels = {
    success: 'Saved',
    error: 'Problem',
    info: 'Heads up',
    warning: 'Warning',
  }

  const Icon = icons[toast.type]
  const colorClass = colors[toast.type]

  return (
    <div className="ui-feedback-note mb-3 flex min-w-[280px] max-w-[360px] items-start gap-3 animate-slide-in shadow-[0_16px_40px_rgba(0,0,0,0.28)] sm:max-w-[420px]">
      <div className={`${colorClass} mt-0.5 flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full`}>
        <Icon className="w-4 h-4" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-gray-500">
          {labels[toast.type]}
        </p>
        <div className="mt-1 text-sm leading-relaxed text-white">
          {toast.message}
        </div>
      </div>
      <button
        onClick={() => onRemove(toast.id)}
        className="btn-unstyled mt-0.5 inline-flex flex-shrink-0 items-center justify-center rounded-full p-1 text-gray-500 transition hover:bg-white/[0.04] hover:text-white"
      >
        <X className="w-4 h-4" />
      </button>
    </div>
  )
}

export default function ToastContainer() {
  const [toasts, setToasts] = useState<Toast[]>([])

  useEffect(() => {
    // Listen for toast events
    const handleToast = (event: CustomEvent<Omit<Toast, 'id'>>) => {
      const toast: Toast = {
        ...event.detail,
        id: Math.random().toString(36).substring(7),
      }
      setToasts((prev) => [...prev, toast])
    }

    window.addEventListener('toast' as any, handleToast as EventListener)
    return () => {
      window.removeEventListener('toast' as any, handleToast as EventListener)
    }
  }, [])

  const removeToast = (id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id))
  }

  if (toasts.length === 0) return null

  return (
    <div className="fixed right-4 top-4 z-[920] flex flex-col items-end">
      {toasts.map((toast) => (
        <ToastComponent key={toast.id} toast={toast} onRemove={removeToast} />
      ))}
    </div>
  )
}

// Helper function to show toast
export function showToast(message: string, type: ToastType = 'info', duration?: number) {
  const event = new CustomEvent('toast', {
    detail: { message, type, duration },
  })
  window.dispatchEvent(event)
}

