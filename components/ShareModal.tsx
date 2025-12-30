'use client'

import { useState, useEffect, useRef } from 'react'
import { X, Copy, Check, QrCode, Link2, Download } from 'lucide-react'
import { showToast } from './Toast'

interface ShareModalProps {
  isOpen: boolean
  onClose: () => void
  shareUrl: string
  title: string
}

export default function ShareModal({ isOpen, onClose, shareUrl, title }: ShareModalProps) {
  const [copied, setCopied] = useState(false)
  const [showQR, setShowQR] = useState(false)
  const [isMobile, setIsMobile] = useState(false)
  const modalRef = useRef<HTMLDivElement>(null)

  // Detect mobile
  useEffect(() => {
    const checkMobile = () => setIsMobile(window.innerWidth < 640)
    checkMobile()
    window.addEventListener('resize', checkMobile)
    return () => window.removeEventListener('resize', checkMobile)
  }, [])

  // Reset state when modal opens/closes
  useEffect(() => {
    if (!isOpen) {
      setCopied(false)
      setShowQR(false)
    }
  }, [isOpen])

  // Close on escape key
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    if (isOpen) {
      document.addEventListener('keydown', handleEscape)
      return () => document.removeEventListener('keydown', handleEscape)
    }
  }, [isOpen, onClose])

  const handleCopyLink = async () => {
    try {
      await navigator.clipboard.writeText(shareUrl)
      setCopied(true)
      showToast('Link copied to clipboard!', 'success')
      setTimeout(() => setCopied(false), 2000)
    } catch (error) {
      console.error('Failed to copy:', error)
      showToast('Failed to copy link', 'error')
    }
  }

  const handleShowQR = () => {
    setShowQR(true)
  }

  const handleBackToOptions = () => {
    setShowQR(false)
  }

  const handleDownloadQR = async () => {
    try {
      // Fetch the QR code image
      const response = await fetch(qrCodeUrl)
      const blob = await response.blob()
      
      // Create a download link
      const url = window.URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = `${title.replace(/[^a-z0-9]/gi, '_')}_qr_code.png`
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
      window.URL.revokeObjectURL(url)
      
      showToast('QR code downloaded!', 'success')
    } catch (error) {
      console.error('Failed to download QR code:', error)
      showToast('Failed to download QR code', 'error')
    }
  }

  // Generate QR code URL (moved up so handleDownloadQR can access it)
  const qrCodeUrl = `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(shareUrl)}`

  if (!isOpen) return null

  return (
    <>
      {/* Backdrop */}
      <div 
        onClick={onClose}
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
      
      {/* Modal */}
      <div
        ref={modalRef}
        style={{
          position: 'fixed',
          bottom: isMobile ? 0 : '50%',
          left: isMobile ? 0 : '50%',
          right: isMobile ? 0 : 'auto',
          transform: isMobile ? 'none' : 'translate(-50%, 50%)',
          width: isMobile ? '100%' : '400px',
          maxWidth: '100%',
          backgroundColor: '#111827',
          borderRadius: isMobile ? '16px 16px 0 0' : '16px',
          zIndex: 101,
          overflow: 'hidden',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '16px 20px',
          borderBottom: '1px solid #374151',
        }}>
          <h2 style={{ 
            fontSize: '18px', 
            fontWeight: 600, 
            color: '#fff',
            margin: 0,
          }}>
            {showQR ? 'QR Code' : `Share "${title}"`}
          </h2>
          <button
            onClick={onClose}
            style={{
              width: '32px',
              height: '32px',
              borderRadius: '50%',
              backgroundColor: '#374151',
              border: 'none',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
            className="hover:bg-gray-600 transition"
          >
            <X style={{ width: '18px', height: '18px', color: '#fff' }} />
          </button>
        </div>

        {/* Content */}
        <div style={{ padding: '20px' }}>
          {showQR ? (
            // QR Code View
            <div style={{ textAlign: 'center' }}>
              <div style={{
                backgroundColor: '#fff',
                padding: '20px',
                borderRadius: '12px',
                display: 'inline-block',
                marginBottom: '16px',
              }}>
                <img 
                  src={qrCodeUrl} 
                  alt="QR Code"
                  style={{ width: '200px', height: '200px', display: 'block' }}
                />
              </div>
              <p style={{ 
                fontSize: '14px', 
                color: '#9ca3af', 
                marginBottom: '20px',
                wordBreak: 'break-all',
              }}>
                {shareUrl}
              </p>
              <div style={{ display: 'flex', gap: '12px' }}>
                <button
                  onClick={handleBackToOptions}
                  style={{
                    flex: 1,
                    padding: '14px 20px',
                    backgroundColor: '#374151',
                    color: '#fff',
                    border: 'none',
                    borderRadius: '8px',
                    fontSize: '16px',
                    fontWeight: 500,
                    cursor: 'pointer',
                  }}
                  className="hover:bg-gray-600 transition"
                >
                  Back
                </button>
                <button
                  onClick={handleDownloadQR}
                  style={{
                    flex: 1,
                    padding: '14px 20px',
                    backgroundColor: '#fff',
                    color: '#000',
                    border: 'none',
                    borderRadius: '8px',
                    fontSize: '16px',
                    fontWeight: 500,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '8px',
                  }}
                  className="hover:opacity-90 transition"
                >
                  <Download style={{ width: '18px', height: '18px' }} />
                  Download
                </button>
              </div>
            </div>
          ) : (
            // Share Options View
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {/* Copy Link Button */}
              <button
                onClick={handleCopyLink}
                style={{
                  width: '100%',
                  padding: '16px 20px',
                  backgroundColor: copied ? '#10B981' : '#1f2937',
                  color: '#fff',
                  border: '1px solid #374151',
                  borderRadius: '12px',
                  fontSize: '16px',
                  fontWeight: 500,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '14px',
                  textAlign: 'left',
                }}
                className="hover:bg-gray-700 transition"
              >
                {copied ? (
                  <div style={{
                    width: '44px',
                    height: '44px',
                    backgroundColor: '#10B981',
                    borderRadius: '10px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}>
                    <Check style={{ width: '22px', height: '22px', color: '#fff' }} />
                  </div>
                ) : (
                  <div style={{
                    width: '44px',
                    height: '44px',
                    backgroundColor: '#374151',
                    borderRadius: '10px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}>
                    <Link2 style={{ width: '22px', height: '22px', color: '#39FF14' }} />
                  </div>
                )}
                <div>
                  <div style={{ fontWeight: 600 }}>
                    {copied ? 'Link Copied!' : 'Copy Link'}
                  </div>
                  <div style={{ fontSize: '13px', color: '#9ca3af', marginTop: '2px' }}>
                    {copied ? 'Ready to paste anywhere' : 'Copy share link to clipboard'}
                  </div>
                </div>
              </button>

              {/* QR Code Button */}
              <button
                onClick={handleShowQR}
                style={{
                  width: '100%',
                  padding: '16px 20px',
                  backgroundColor: '#1f2937',
                  color: '#fff',
                  border: '1px solid #374151',
                  borderRadius: '12px',
                  fontSize: '16px',
                  fontWeight: 500,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '14px',
                  textAlign: 'left',
                }}
                className="hover:bg-gray-700 transition"
              >
                <div style={{
                  width: '44px',
                  height: '44px',
                  backgroundColor: '#374151',
                  borderRadius: '10px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}>
                  <QrCode style={{ width: '22px', height: '22px', color: '#39FF14' }} />
                </div>
                <div>
                  <div style={{ fontWeight: 600 }}>QR Code</div>
                  <div style={{ fontSize: '13px', color: '#9ca3af', marginTop: '2px' }}>
                    Generate a scannable QR code
                  </div>
                </div>
              </button>
            </div>
          )}
        </div>
      </div>
    </>
  )
}

