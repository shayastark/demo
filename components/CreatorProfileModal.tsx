'use client'

import { useState, useEffect } from 'react'
import { X, Mail, Globe, Instagram, ExternalLink } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import Image from 'next/image'

interface CreatorProfile {
  id: string
  username: string | null
  email: string | null
  avatar_url: string | null
  bio: string | null
  contact_email: string | null
  website: string | null
  instagram: string | null
}

interface CreatorProfileModalProps {
  isOpen: boolean
  onClose: () => void
  creatorId: string
}

export default function CreatorProfileModal({ isOpen, onClose, creatorId }: CreatorProfileModalProps) {
  const [creator, setCreator] = useState<CreatorProfile | null>(null)
  const [loading, setLoading] = useState(true)
  const [projectCount, setProjectCount] = useState(0)

  useEffect(() => {
    if (!isOpen || !creatorId) return

    const loadCreator = async () => {
      setLoading(true)
      try {
        // Fetch creator profile
        const { data: userData, error: userError } = await supabase
          .from('users')
          .select('id, username, email, avatar_url, bio, contact_email, website, instagram')
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
      } catch (error) {
        console.error('Error loading creator profile:', error)
      } finally {
        setLoading(false)
      }
    }

    loadCreator()
  }, [isOpen, creatorId])

  if (!isOpen) return null

  const displayName = creator?.username || creator?.email?.split('@')[0] || 'Creator'

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
          width: '100%',
          maxWidth: '480px',
          maxHeight: '90vh',
          backgroundColor: '#111827',
          borderRadius: '16px',
          zIndex: 9999,
          overflow: 'hidden',
        }}
      >
        {/* Header */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '16px 20px',
          borderBottom: '1px solid #374151',
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
        <div style={{ padding: '24px', overflowY: 'auto', maxHeight: 'calc(90vh - 60px)' }}>
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

