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
    success: 'bg-green-500',
    error: 'bg-red-500',
    info: 'bg-blue-500',
    warning: 'bg-yellow-500',
  }

  const Icon = icons[toast.type]
  const colorClass = colors[toast.type]

  return (
    <div className="bg-gray-900 border border-gray-700 rounded-lg shadow-lg p-4 mb-3 flex items-start gap-3 min-w-[300px] max-w-[500px] animate-slide-in">
      <div className={`${colorClass} rounded-full p-1 flex-shrink-0 mt-0.5`}>
        <Icon className="w-4 h-4 text-white" />
      </div>
      <div className="flex-1 text-sm text-white">
        {toast.message}
      </div>
      <button
        onClick={() => onRemove(toast.id)}
        className="text-gray-400 hover:text-white flex-shrink-0"
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
    <div className="fixed top-4 right-4 z-[10000] flex flex-col items-end">
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

