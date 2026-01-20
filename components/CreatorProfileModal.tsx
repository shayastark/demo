'use client'

import { useState, useEffect } from 'react'
import { X, Mail, Globe, Instagram, ExternalLink, Heart, Loader2, EyeOff, CreditCard, Wallet } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import Image from 'next/image'
import { showToast } from '@/components/Toast'
import { usePrivy } from '@privy-io/react-auth'
import dynamic from 'next/dynamic'

// Dynamically import CryptoTipButton to avoid SSR issues
const CryptoTipButton = dynamic(() => import('@/components/CryptoTipButton'), {
  ssr: false,
  loading: () => (
    <button
      disabled
      style={{
        width: '100%',
        padding: '12px',
        borderRadius: '8px',
        border: 'none',
        backgroundColor: '#39FF14',
        color: '#000',
        fontSize: '14px',
        fontWeight: 600,
        opacity: 0.5,
      }}
    >
      Loading...
    </button>
  ),
})

interface CreatorProfile {
  id: string
  username: string | null
  email: string | null
  avatar_url: string | null
  bio: string | null
  contact_email: string | null
  website: string | null
  instagram: string | null
  stripe_onboarding_complete: boolean | null
  wallet_address: string | null
}

interface CreatorProfileModalProps {
  isOpen: boolean
  onClose: () => void
  creatorId: string
}

export default function CreatorProfileModal({ isOpen, onClose, creatorId }: CreatorProfileModalProps) {
  const { user, authenticated } = usePrivy()
  const [creator, setCreator] = useState<CreatorProfile | null>(null)
  const [loading, setLoading] = useState(true)
  const [projectCount, setProjectCount] = useState(0)
  const [tipperUsername, setTipperUsername] = useState<string | null>(null)
  
  // Tip state
  const [showTipOptions, setShowTipOptions] = useState(false)
  const [selectedTip, setSelectedTip] = useState<number | null>(null)
  const [customTip, setCustomTip] = useState('')
  const [tipMessage, setTipMessage] = useState('')
  const [processingTip, setProcessingTip] = useState(false)
  const [sendAnonymously, setSendAnonymously] = useState(false)
  const [paymentMethod, setPaymentMethod] = useState<'card' | 'crypto'>('card')

  const TIP_AMOUNTS = [
    { value: 100, label: '$1' },
    { value: 500, label: '$5' },
    { value: 2000, label: '$20' },
    { value: 10000, label: '$100' },
  ]

  useEffect(() => {
    if (!isOpen || !creatorId) return

    const loadCreator = async () => {
      setLoading(true)
      try {
        // Fetch creator profile including wallet_address
        const { data: userData, error: userError } = await supabase
          .from('users')
          .select('id, username, email, avatar_url, bio, contact_email, website, instagram, stripe_onboarding_complete, wallet_address')
          .eq('id', creatorId)
          .single()

        if (userError) throw userError
        setCreator(userData)

        // Fetch project count
        const { count, error: countError } = await supabase
          .from('projects')
          .select('id', { count: 'exact', head: true })
          .eq('creator_id', creatorId)
          .eq('sharing_enabled', true)

        if (!countError) {
          setProjectCount(count || 0)
        }

        // Fetch current user's username for tipping
        if (authenticated && user?.id) {
          const { data: tipperData } = await supabase
            .from('users')
            .select('username')
            .eq('privy_id', user.id)
            .single()
          
          if (tipperData?.username) {
            setTipperUsername(tipperData.username)
          }
        }
      } catch (error) {
        console.error('Error loading creator profile:', error)
      } finally {
        setLoading(false)
      }
    }

    loadCreator()
  }, [isOpen, creatorId, authenticated, user?.id])

  // Reset tip state when modal closes
  useEffect(() => {
    if (!isOpen) {
      setShowTipOptions(false)
      setSelectedTip(null)
      setCustomTip('')
      setTipMessage('')
      setSendAnonymously(false)
      setPaymentMethod('card')
    }
  }, [isOpen])

  const handleSendTip = async () => {
    const amount = selectedTip || (customTip ? Math.round(parseFloat(customTip) * 100) : 0)
    
    if (!amount || amount < 100) {
      showToast('Please enter a valid tip amount (minimum $1)', 'error')
      return
    }

    if (amount > 50000) {
      showToast('Maximum tip amount is $500', 'error')
      return
    }

    setProcessingTip(true)
    try {
      const response = await fetch('/api/stripe/tip', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          creatorId: creator?.id,
          amount,
          message: tipMessage,
          tipperUsername: sendAnonymously ? null : tipperUsername,
        }),
      })

      const data = await response.json()

      if (response.ok && data.url) {
        window.location.href = data.url
      } else {
        showToast(data.error || 'Failed to process tip', 'error')
      }
    } catch (error) {
      console.error('Error sending tip:', error)
      showToast('Failed to process tip', 'error')
    } finally {
      setProcessingTip(false)
    }
  }

  // Get the tip amount in dollars for Daimo
  const getTipAmountDollars = () => {
    const amount = selectedTip || (customTip ? Math.round(parseFloat(customTip) * 100) : 0)
    return (amount / 100).toFixed(2)
  }

  // Check if tip amount is valid
  const isTipValid = () => {
    const amount = selectedTip || (customTip ? Math.round(parseFloat(customTip) * 100) : 0)
    return amount >= 100 && amount <= 50000
  }

  if (!isOpen) return null

  const displayName = creator?.username || creator?.email?.split('@')[0] || 'Creator'
  
  // Check which payment methods are available
  const hasStripe = creator?.stripe_onboarding_complete
  const hasCrypto = creator?.wallet_address
  const canTip = hasStripe || hasCrypto

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
          backgroundColor: 'rgba(0, 0, 0, 0.8)',
          zIndex: 9998,
        }}
      />

      {/* Modal */}
      <div
        style={{
          position: 'fixed',
          top: '50%',
          left: '50%',
          transform: 'translate(-50%, -50%)',
          width: 'calc(100% - 32px)',
          maxWidth: '480px',
          maxHeight: '85vh',
          backgroundColor: '#111827',
          borderRadius: '16px',
          zIndex: 9999,
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        {/* Header */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '16px 20px',
          borderBottom: '1px solid #374151',
          flexShrink: 0,
        }}>
          <h2 style={{ fontSize: '18px', fontWeight: 600, color: '#fff' }}>
            Creator Profile
          </h2>
          <button
            onClick={onClose}
            style={{
              width: '32px',
              height: '32px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: '#374151',
              borderRadius: '8px',
              border: 'none',
              cursor: 'pointer',
            }}
          >
            <X style={{ width: '18px', height: '18px', color: '#9ca3af' }} />
          </button>
        </div>

        {/* Content */}
        <div style={{ padding: '24px', overflowY: 'auto', flex: 1 }}>
          {loading ? (
            <div style={{ textAlign: 'center', padding: '40px 0', color: '#39FF14' }}>
              Loading...
            </div>
          ) : creator ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
              {/* Avatar and Name */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                <div
                  style={{
                    width: '80px',
                    height: '80px',
                    borderRadius: '50%',
                    backgroundColor: '#374151',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: '32px',
                    fontWeight: 700,
                    color: '#39FF14',
                    overflow: 'hidden',
                  }}
                >
                  {creator.avatar_url ? (
                    <Image
                      src={creator.avatar_url}
                      alt={displayName}
                      width={80}
                      height={80}
                      style={{ objectFit: 'cover' }}
                    />
                  ) : (
                    displayName.charAt(0).toUpperCase()
                  )}
                </div>
                <div>
                  <h3 style={{ fontSize: '24px', fontWeight: 700, color: '#fff', margin: 0 }}>
                    {displayName}
                  </h3>
                  <p style={{ fontSize: '14px', color: '#9ca3af', margin: '4px 0 0 0' }}>
                    {projectCount} {projectCount === 1 ? 'project' : 'projects'}
                  </p>
                </div>
              </div>

              {/* Bio */}
              {creator.bio && (
                <div>
                  <p style={{ fontSize: '15px', color: '#d1d5db', lineHeight: 1.6, margin: 0 }}>
                    {creator.bio}
                  </p>
                </div>
              )}

              {/* Contact & Links */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                {/* Contact Email */}
                {creator.contact_email && (
                  <a
                    href={`mailto:${creator.contact_email}`}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '12px',
                      padding: '12px 16px',
                      backgroundColor: '#1f2937',
                      borderRadius: '12px',
                      textDecoration: 'none',
                      transition: 'background-color 0.2s',
                    }}
                    className="hover:bg-gray-700"
                  >
                    <div style={{
                      width: '40px',
                      height: '40px',
                      backgroundColor: '#374151',
                      borderRadius: '10px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}>
                      <Mail style={{ width: '20px', height: '20px', color: '#39FF14' }} />
                    </div>
                    <div>
                      <div style={{ fontSize: '14px', fontWeight: 500, color: '#fff' }}>Email</div>
                      <div style={{ fontSize: '13px', color: '#9ca3af' }}>{creator.contact_email}</div>
                    </div>
                  </a>
                )}

                {/* Website */}
                {creator.website && (
                  <a
                    href={creator.website}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '12px',
                      padding: '12px 16px',
                      backgroundColor: '#1f2937',
                      borderRadius: '12px',
                      textDecoration: 'none',
                    }}
                    className="hover:bg-gray-700"
                  >
                    <div style={{
                      width: '40px',
                      height: '40px',
                      backgroundColor: '#374151',
                      borderRadius: '10px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}>
                      <Globe style={{ width: '20px', height: '20px', color: '#39FF14' }} />
                    </div>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: '14px', fontWeight: 500, color: '#fff' }}>Website</div>
                      <div style={{ fontSize: '13px', color: '#9ca3af', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {creator.website.replace(/^https?:\/\//, '')}
                      </div>
                    </div>
                    <ExternalLink style={{ width: '16px', height: '16px', color: '#6b7280' }} />
                  </a>
                )}

                {/* Social Links */}
                {creator.instagram && (
                  <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', marginTop: '8px' }}>
                    <a
                      href={`https://instagram.com/${creator.instagram}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{
                        width: '48px',
                        height: '48px',
                        background: 'linear-gradient(135deg, #833AB4 0%, #FD1D1D 50%, #F77737 100%)',
                        borderRadius: '12px',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                      }}
                      title={`@${creator.instagram}`}
                    >
                      <Instagram style={{ width: '24px', height: '24px', color: '#fff' }} />
                    </a>
                  </div>
                )}
              </div>

              {/* No contact info message */}
              {!creator.contact_email && !creator.website && !creator.instagram && !creator.bio && (
                <div style={{ textAlign: 'center', padding: '20px', color: '#6b7280' }}>
                  <p style={{ margin: 0 }}>This creator hasn&apos;t added their contact info yet.</p>
                </div>
              )}

              {/* Tip Section */}
              {canTip && (
                <div style={{ 
                  borderTop: '1px solid #374151', 
                  paddingTop: '24px',
                  marginTop: '8px',
                }}>
                  {!showTipOptions ? (
                    <button
                      onClick={() => setShowTipOptions(true)}
                      style={{
                        width: '100%',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: '8px',
                        padding: '14px',
                        backgroundColor: '#39FF14',
                        color: '#000',
                        borderRadius: '12px',
                        border: 'none',
                        fontSize: '15px',
                        fontWeight: 600,
                        cursor: 'pointer',
                      }}
                    >
                      <Heart style={{ width: '18px', height: '18px' }} />
                      Send a Tip
                    </button>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                      <h4 style={{ fontSize: '15px', fontWeight: 600, color: '#fff', margin: 0 }}>
                        Support {displayName}
                      </h4>

                      {/* Payment method toggle - only show if both are available */}
                      {hasStripe && hasCrypto && (
                        <div style={{ display: 'flex', gap: '8px' }}>
                          <button
                            onClick={() => setPaymentMethod('card')}
                            style={{
                              flex: 1,
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              gap: '8px',
                              padding: '10px',
                              borderRadius: '8px',
                              border: paymentMethod === 'card' ? '2px solid #39FF14' : '2px solid #374151',
                              backgroundColor: paymentMethod === 'card' ? 'rgba(57, 255, 20, 0.1)' : 'transparent',
                              color: paymentMethod === 'card' ? '#39FF14' : '#9ca3af',
                              fontSize: '14px',
                              fontWeight: 500,
                              cursor: 'pointer',
                            }}
                          >
                            <CreditCard style={{ width: '16px', height: '16px' }} />
                            Card
                          </button>
                          <button
                            onClick={() => setPaymentMethod('crypto')}
                            style={{
                              flex: 1,
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              gap: '8px',
                              padding: '10px',
                              borderRadius: '8px',
                              border: paymentMethod === 'crypto' ? '2px solid #39FF14' : '2px solid #374151',
                              backgroundColor: paymentMethod === 'crypto' ? 'rgba(57, 255, 20, 0.1)' : 'transparent',
                              color: paymentMethod === 'crypto' ? '#39FF14' : '#9ca3af',
                              fontSize: '14px',
                              fontWeight: 500,
                              cursor: 'pointer',
                            }}
                          >
                            <Wallet style={{ width: '16px', height: '16px' }} />
                            Crypto
                          </button>
                        </div>
                      )}
                      
                      {/* Preset amounts */}
                      <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                        {TIP_AMOUNTS.map((tip) => (
                          <button
                            key={tip.value}
                            onClick={() => {
                              setSelectedTip(tip.value)
                              setCustomTip('')
                            }}
                            style={{
                              padding: '10px 20px',
                              borderRadius: '8px',
                              border: selectedTip === tip.value ? '2px solid #39FF14' : '2px solid #374151',
                              backgroundColor: selectedTip === tip.value ? 'rgba(57, 255, 20, 0.1)' : 'transparent',
                              color: selectedTip === tip.value ? '#39FF14' : '#fff',
                              fontSize: '14px',
                              fontWeight: 500,
                              cursor: 'pointer',
                            }}
                          >
                            {tip.label}
                          </button>
                        ))}
                      </div>

                      {/* Custom amount */}
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <span style={{ color: '#9ca3af', fontSize: '14px' }}>or</span>
                        <div style={{ position: 'relative', flex: 1 }}>
                          <span style={{
                            position: 'absolute',
                            left: '12px',
                            top: '50%',
                            transform: 'translateY(-50%)',
                            color: '#9ca3af',
                          }}>$</span>
                          <input
                            type="number"
                            value={customTip}
                            onChange={(e) => {
                              setCustomTip(e.target.value)
                              setSelectedTip(null)
                            }}
                            placeholder="Custom"
                            min="1"
                            max="500"
                            style={{
                              width: '100%',
                              padding: '10px 12px 10px 28px',
                              borderRadius: '8px',
                              border: '2px solid #374151',
                              backgroundColor: 'transparent',
                              color: '#fff',
                              fontSize: '14px',
                            }}
                          />
                        </div>
                      </div>

                      {/* Optional message */}
                      <input
                        type="text"
                        value={tipMessage}
                        onChange={(e) => setTipMessage(e.target.value)}
                        placeholder="Add a message (optional)"
                        maxLength={200}
                        style={{
                          width: '100%',
                          padding: '10px 12px',
                          borderRadius: '8px',
                          border: '2px solid #374151',
                          backgroundColor: 'transparent',
                          color: '#fff',
                          fontSize: '14px',
                        }}
                      />

                      {/* Anonymous toggle */}
                      <button
                        type="button"
                        onClick={() => setSendAnonymously(!sendAnonymously)}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '8px',
                          padding: '0',
                          background: 'none',
                          border: 'none',
                          cursor: 'pointer',
                        }}
                      >
                        <div
                          style={{
                            width: '18px',
                            height: '18px',
                            borderRadius: '4px',
                            border: sendAnonymously ? '2px solid #39FF14' : '2px solid #374151',
                            backgroundColor: sendAnonymously ? 'rgba(57, 255, 20, 0.2)' : 'transparent',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                          }}
                        >
                          {sendAnonymously && (
                            <EyeOff style={{ width: '12px', height: '12px', color: '#39FF14' }} />
                          )}
                        </div>
                        <span style={{ fontSize: '13px', color: sendAnonymously ? '#39FF14' : '#9ca3af' }}>
                          Send anonymously
                        </span>
                      </button>

                      {/* Action buttons */}
                      <div style={{ display: 'flex', gap: '12px' }}>
                        <button
                          onClick={() => setShowTipOptions(false)}
                          style={{
                            flex: 1,
                            padding: '12px',
                            borderRadius: '8px',
                            border: '1px solid #374151',
                            backgroundColor: 'transparent',
                            color: '#9ca3af',
                            fontSize: '14px',
                            cursor: 'pointer',
                          }}
                        >
                          Cancel
                        </button>
                        
                        {/* Stripe payment button */}
                        {paymentMethod === 'card' && hasStripe && (
                          <button
                            onClick={handleSendTip}
                            disabled={processingTip || (!selectedTip && !customTip)}
                            style={{
                              flex: 2,
                              padding: '12px',
                              borderRadius: '8px',
                              border: 'none',
                              backgroundColor: '#39FF14',
                              color: '#000',
                              fontSize: '14px',
                              fontWeight: 600,
                              cursor: processingTip || (!selectedTip && !customTip) ? 'not-allowed' : 'pointer',
                              opacity: processingTip || (!selectedTip && !customTip) ? 0.5 : 1,
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              gap: '8px',
                            }}
                          >
                            {processingTip ? (
                              <>
                                <Loader2 style={{ width: '16px', height: '16px', animation: 'spin 1s linear infinite' }} />
                                Processing...
                              </>
                            ) : (
                              <>
                                <CreditCard style={{ width: '16px', height: '16px' }} />
                                Pay with Card
                              </>
                            )}
                          </button>
                        )}
                        
                        {/* Crypto payment button - only show when crypto selected and valid */}
                        {/* Key forces remount when amount changes (Daimo props are frozen after first render) */}
                        {paymentMethod === 'crypto' && hasCrypto && isTipValid() && (
                          <div style={{ flex: 2 }}>
                            <CryptoTipButton
                              key={`crypto-tip-${getTipAmountDollars()}`}
                              creatorId={creator.id}
                              creatorName={displayName}
                              walletAddress={creator.wallet_address!}
                              amount={getTipAmountDollars()}
                              tipperUsername={sendAnonymously ? null : tipperUsername}
                              message={tipMessage || null}
                              onSuccess={() => {
                                setShowTipOptions(false)
                                setSelectedTip(null)
                                setCustomTip('')
                                setTipMessage('')
                              }}
                            />
                          </div>
                        )}
                        
                        {/* Show disabled crypto button when amount invalid */}
                        {paymentMethod === 'crypto' && hasCrypto && !isTipValid() && (
                          <button
                            disabled
                            style={{
                              flex: 2,
                              padding: '12px',
                              borderRadius: '8px',
                              border: 'none',
                              backgroundColor: '#39FF14',
                              color: '#000',
                              fontSize: '14px',
                              fontWeight: 600,
                              cursor: 'not-allowed',
                              opacity: 0.5,
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              gap: '8px',
                            }}
                          >
                            <Wallet style={{ width: '16px', height: '16px' }} />
                            Pay with Crypto
                          </button>
                        )}

                        {/* Fallback for only stripe */}
                        {!hasStripe && hasCrypto && paymentMethod === 'card' && (
                          <button
                            disabled
                            style={{
                              flex: 2,
                              padding: '12px',
                              borderRadius: '8px',
                              border: 'none',
                              backgroundColor: '#374151',
                              color: '#9ca3af',
                              fontSize: '14px',
                              fontWeight: 600,
                              cursor: 'not-allowed',
                            }}
                          >
                            Card not available
                          </button>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          ) : (
            <div style={{ textAlign: 'center', padding: '40px 0', color: '#6b7280' }}>
              Creator not found
            </div>
          )}
        </div>
      </div>
    </>
  )
}
