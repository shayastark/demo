'use client'

import { useState, useEffect } from 'react'
import { usePathname } from 'next/navigation'
import Link from 'next/link'
import { Home, ListMusic, User, X, Play, Trash2 } from 'lucide-react'
import { usePrivy } from '@privy-io/react-auth'

interface QueueItem {
  id: string
  title: string
  projectTitle: string
  audioUrl: string
  addedAt: number
}

export default function BottomTabBar() {
  const pathname = usePathname()
  const { authenticated, ready } = usePrivy()
  const [queue, setQueue] = useState<QueueItem[]>([])
  const [isQueueOpen, setIsQueueOpen] = useState(false)
  const [isMobile, setIsMobile] = useState(false)

  // Detect mobile
  useEffect(() => {
    const checkMobile = () => setIsMobile(window.innerWidth < 768)
    checkMobile()
    window.addEventListener('resize', checkMobile)
    return () => window.removeEventListener('resize', checkMobile)
  }, [])

  // Load queue from localStorage
  useEffect(() => {
    const savedQueue = localStorage.getItem('hubba-queue')
    if (savedQueue) {
      try {
        setQueue(JSON.parse(savedQueue))
      } catch (e) {
        console.error('Failed to parse queue:', e)
      }
    }

    // Listen for queue updates from other components
    const handleQueueUpdate = () => {
      const updated = localStorage.getItem('hubba-queue')
      if (updated) {
        try {
          setQueue(JSON.parse(updated))
        } catch (e) {
          console.error('Failed to parse queue:', e)
        }
      }
    }

    window.addEventListener('hubba-queue-updated', handleQueueUpdate)
    return () => window.removeEventListener('hubba-queue-updated', handleQueueUpdate)
  }, [])

  // Save queue to localStorage
  const saveQueue = (newQueue: QueueItem[]) => {
    setQueue(newQueue)
    localStorage.setItem('hubba-queue', JSON.stringify(newQueue))
    window.dispatchEvent(new Event('hubba-queue-updated'))
  }

  const removeFromQueue = (id: string) => {
    const newQueue = queue.filter(item => item.id !== id)
    saveQueue(newQueue)
  }

  const clearQueue = () => {
    saveQueue([])
    setIsQueueOpen(false)
  }

  // Don't show on auth pages or if not authenticated
  if (!ready || !authenticated) return null
  if (pathname === '/' || pathname?.startsWith('/share/')) return null

  const tabs = [
    { href: '/dashboard', icon: Home, label: 'Home' },
    { href: '#queue', icon: ListMusic, label: 'Queue', onClick: () => setIsQueueOpen(true), badge: queue.length },
    { href: '/account', icon: User, label: 'Account' },
  ]

  const isActive = (href: string) => {
    if (href === '#queue') return isQueueOpen
    if (href === '/dashboard') return pathname === '/dashboard' || pathname?.startsWith('/dashboard/')
    return pathname === href
  }

  return (
    <>
      {/* Bottom Tab Bar */}
      <nav
        style={{
          position: 'fixed',
          bottom: 0,
          left: 0,
          right: 0,
          height: '70px',
          backgroundColor: '#111827',
          borderTop: '1px solid #374151',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-around',
          zIndex: 50,
          paddingBottom: 'env(safe-area-inset-bottom)',
        }}
      >
        {tabs.map((tab) => {
          const Icon = tab.icon
          const active = isActive(tab.href)

          if (tab.onClick) {
            return (
              <button
                key={tab.href}
                onClick={tab.onClick}
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flex: 1,
                  height: '100%',
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                  position: 'relative',
                }}
              >
                <div style={{ position: 'relative' }}>
                  <Icon
                    style={{
                      width: '24px',
                      height: '24px',
                      color: active ? '#39FF14' : '#9ca3af',
                      transition: 'color 0.2s',
                    }}
                  />
                  {tab.badge && tab.badge > 0 && (
                    <div
                      style={{
                        position: 'absolute',
                        top: '-6px',
                        right: '-10px',
                        backgroundColor: '#39FF14',
                        color: '#000',
                        fontSize: '10px',
                        fontWeight: 700,
                        minWidth: '18px',
                        height: '18px',
                        borderRadius: '9px',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        padding: '0 4px',
                      }}
                    >
                      {tab.badge > 99 ? '99+' : tab.badge}
                    </div>
                  )}
                </div>
                <span
                  style={{
                    fontSize: '11px',
                    marginTop: '4px',
                    color: active ? '#39FF14' : '#9ca3af',
                    fontWeight: active ? 600 : 400,
                    transition: 'color 0.2s',
                  }}
                >
                  {tab.label}
                </span>
              </button>
            )
          }

          return (
            <Link
              key={tab.href}
              href={tab.href}
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                flex: 1,
                height: '100%',
                textDecoration: 'none',
              }}
            >
              <Icon
                style={{
                  width: '24px',
                  height: '24px',
                  color: active ? '#39FF14' : '#9ca3af',
                  transition: 'color 0.2s',
                }}
              />
              <span
                style={{
                  fontSize: '11px',
                  marginTop: '4px',
                  color: active ? '#39FF14' : '#9ca3af',
                  fontWeight: active ? 600 : 400,
                  transition: 'color 0.2s',
                }}
              >
                {tab.label}
              </span>
            </Link>
          )
        })}
      </nav>

      {/* Queue Modal */}
      {isQueueOpen && (
        <>
          {/* Backdrop */}
          <div
            onClick={() => setIsQueueOpen(false)}
            style={{
              position: 'fixed',
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              backgroundColor: 'rgba(0, 0, 0, 0.7)',
              zIndex: 100,
            }}
          />

          {/* Queue Panel */}
          <div
            style={{
              position: 'fixed',
              bottom: isMobile ? '70px' : '50%', // Account for tab bar on mobile
              left: isMobile ? 0 : '50%',
              right: isMobile ? 0 : 'auto',
              transform: isMobile ? 'none' : 'translate(-50%, 50%)',
              width: isMobile ? '100%' : '450px',
              maxWidth: '100%',
              maxHeight: isMobile ? 'calc(100vh - 140px)' : '600px', // Leave room for tab bar + some top space
              backgroundColor: '#111827',
              borderRadius: isMobile ? '16px 16px 0 0' : '16px',
              zIndex: 101,
              overflow: 'hidden',
              display: 'flex',
              flexDirection: 'column',
            }}
          >
            {/* Header */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '16px 20px',
                borderBottom: '1px solid #374151',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <ListMusic style={{ width: '24px', height: '24px', color: '#39FF14' }} />
                <h2 style={{ fontSize: '18px', fontWeight: 600, color: '#fff', margin: 0 }}>
                  Queue
                </h2>
                {queue.length > 0 && (
                  <span style={{ fontSize: '14px', color: '#9ca3af' }}>
                    ({queue.length} {queue.length === 1 ? 'track' : 'tracks'})
                  </span>
                )}
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                {queue.length > 0 && (
                  <button
                    onClick={clearQueue}
                    style={{
                      padding: '8px 12px',
                      backgroundColor: 'transparent',
                      color: '#ef4444',
                      border: '1px solid #ef4444',
                      borderRadius: '8px',
                      fontSize: '12px',
                      cursor: 'pointer',
                    }}
                  >
                    Clear All
                  </button>
                )}
                <button
                  onClick={() => setIsQueueOpen(false)}
                  style={{
                    width: '36px',
                    height: '36px',
                    borderRadius: '50%',
                    backgroundColor: '#374151',
                    border: 'none',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <X style={{ width: '20px', height: '20px', color: '#fff' }} />
                </button>
              </div>
            </div>

            {/* Queue Content */}
            <div style={{ flex: 1, overflowY: 'auto', padding: '12px' }}>
              {queue.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '40px 20px' }}>
                  <ListMusic style={{ width: '48px', height: '48px', color: '#4b5563', margin: '0 auto 16px' }} />
                  <p style={{ color: '#9ca3af', fontSize: '16px', marginBottom: '8px' }}>
                    Your queue is empty
                  </p>
                  <p style={{ color: '#6b7280', fontSize: '14px' }}>
                    Add tracks from the three-dot menu
                  </p>
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  {queue.map((item, index) => (
                    <div
                      key={item.id}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        padding: '12px 16px',
                        backgroundColor: '#1f2937',
                        borderRadius: '12px',
                        gap: '12px',
                      }}
                    >
                      <span style={{ color: '#6b7280', fontSize: '14px', minWidth: '24px' }}>
                        {index + 1}
                      </span>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ color: '#fff', fontSize: '14px', fontWeight: 500, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                          {item.title}
                        </div>
                        <div style={{ color: '#9ca3af', fontSize: '12px', marginTop: '2px' }}>
                          {item.projectTitle}
                        </div>
                      </div>
                      <button
                        onClick={() => removeFromQueue(item.id)}
                        style={{
                          width: '32px',
                          height: '32px',
                          borderRadius: '50%',
                          backgroundColor: 'transparent',
                          border: 'none',
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                        }}
                        className="hover:bg-gray-700"
                      >
                        <Trash2 style={{ width: '16px', height: '16px', color: '#9ca3af' }} />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Footer with play button */}
            {queue.length > 0 && (
              <div style={{ padding: '16px', borderTop: '1px solid #374151' }}>
                <button
                  onClick={() => {
                    // TODO: Implement play queue functionality
                    setIsQueueOpen(false)
                  }}
                  style={{
                    width: '100%',
                    padding: '14px',
                    backgroundColor: '#39FF14',
                    color: '#000',
                    border: 'none',
                    borderRadius: '12px',
                    fontSize: '16px',
                    fontWeight: 600,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '8px',
                  }}
                >
                  <Play style={{ width: '20px', height: '20px' }} />
                  Play Queue
                </button>
              </div>
            )}
          </div>
        </>
      )}

      {/* Spacer to prevent content from being hidden behind tab bar */}
      <div style={{ height: '70px' }} />
    </>
  )
}

// Helper function to add items to queue (can be imported by other components)
export function addToQueue(item: { id: string; title: string; projectTitle: string; audioUrl: string }) {
  const savedQueue = localStorage.getItem('hubba-queue')
  let queue: QueueItem[] = []
  
  if (savedQueue) {
    try {
      queue = JSON.parse(savedQueue)
    } catch (e) {
      console.error('Failed to parse queue:', e)
    }
  }

  // Check if already in queue
  if (queue.some(q => q.id === item.id)) {
    return false // Already in queue
  }

  queue.push({
    ...item,
    addedAt: Date.now(),
  })

  localStorage.setItem('hubba-queue', JSON.stringify(queue))
  window.dispatchEvent(new Event('hubba-queue-updated'))
  return true
}

