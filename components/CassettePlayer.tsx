'use client'

import { useEffect, useState, useRef } from 'react'

interface CassettePlayerProps {
  coverImageUrl?: string | null
  isPlaying: boolean
  title: string
}

export default function CassettePlayer({ coverImageUrl, isPlaying, title }: CassettePlayerProps) {
  const [glowIntensity, setGlowIntensity] = useState(0.15)
  const animationRef = useRef<number | null>(null)
  const timeRef = useRef(0)

  // Listen for frequency data and create pulsing glow
  useEffect(() => {
    let frequencyData: number[] | null = null

    const handleFrequency = (e: CustomEvent<{ frequencyData: number[] | null }>) => {
      frequencyData = e.detail.frequencyData
    }

    window.addEventListener('demo-audio-frequency', handleFrequency as EventListener)

    const animate = () => {
      if (isPlaying) {
        let targetIntensity: number

        if (frequencyData && frequencyData.length > 0) {
          // Use bass frequencies for the pulse
          const bassSum = frequencyData.slice(0, 20).reduce((acc, val) => acc + val, 0)
          const bassAvg = bassSum / 20
          targetIntensity = 0.1 + (bassAvg / 255) * 0.4
        } else {
          // Smooth breathing animation fallback
          timeRef.current += 0.03
          targetIntensity = 0.15 + Math.sin(timeRef.current) * 0.1
        }

        // Smooth transition
        setGlowIntensity(prev => prev + (targetIntensity - prev) * 0.15)
      } else {
        // Fade out when paused
        setGlowIntensity(prev => prev * 0.95)
      }

      animationRef.current = requestAnimationFrame(animate)
    }

    animate()

    return () => {
      window.removeEventListener('demo-audio-frequency', handleFrequency as EventListener)
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current)
      }
    }
  }, [isPlaying])

  return (
    <div className="relative w-full max-w-md mx-auto mb-6">
      {/* Dynamic pulsing glow effect - warm green tint */}
      <div 
        className="absolute inset-0 rounded-2xl pointer-events-none"
        style={{
          background: `radial-gradient(ellipse at center, rgba(57, 255, 20, ${glowIntensity}) 0%, rgba(100, 200, 100, ${glowIntensity * 0.3}) 40%, transparent 70%)`,
          filter: 'blur(30px)',
          transform: 'scale(1.2)',
          opacity: isPlaying ? 1 : 0,
          transition: 'opacity 0.5s ease',
        }}
      />
      
      {/* Cassette Tape Body - Vintage charcoal look */}
      <div 
        className={`relative transition-all duration-300`}
        style={{
          width: '320px',
          height: '210px',
          margin: '0 auto',
          background: 'linear-gradient(180deg, #4a4a4a 0%, #3a3a3a 20%, #2d2d2d 80%, #252525 100%)',
          borderRadius: '12px',
          border: '2px solid #555',
          boxShadow: isPlaying 
            ? '0 8px 32px rgba(0, 0, 0, 0.7), 0 0 40px rgba(57, 255, 20, 0.15), inset 0 1px 0 rgba(255, 255, 255, 0.15), inset 0 -2px 8px rgba(0,0,0,0.3)'
            : '0 8px 32px rgba(0, 0, 0, 0.7), inset 0 1px 0 rgba(255, 255, 255, 0.15), inset 0 -2px 8px rgba(0,0,0,0.3)',
          position: 'relative',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          padding: '16px',
          boxSizing: 'border-box',
        }}
      >
        {/* Subtle wear texture overlay */}
        <div style={{
          position: 'absolute',
          inset: 0,
          borderRadius: '10px',
          background: 'repeating-linear-gradient(90deg, transparent, transparent 2px, rgba(0,0,0,0.03) 2px, rgba(0,0,0,0.03) 4px)',
          pointerEvents: 'none',
        }} />

        {/* Top edge highlight */}
        <div style={{
          position: 'absolute',
          top: 0,
          left: '20px',
          right: '20px',
          height: '1px',
          background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.25), transparent)',
        }} />

        {/* Corner screws with metallic look */}
        {[
          { top: '8px', left: '8px' },
          { top: '8px', right: '8px' },
          { bottom: '8px', left: '8px' },
          { bottom: '8px', right: '8px' },
        ].map((pos, i) => (
          <div 
            key={i}
            style={{
              position: 'absolute',
              ...pos,
              width: '10px',
              height: '10px',
              borderRadius: '50%',
              background: 'linear-gradient(135deg, #6a6a6a 0%, #4a4a4a 50%, #3a3a3a 100%)',
              boxShadow: 'inset 0 1px 2px rgba(255,255,255,0.3), inset 0 -1px 2px rgba(0,0,0,0.4), 0 1px 2px rgba(0,0,0,0.3)',
            }}
          >
            {/* Screw slot */}
            <div style={{
              position: 'absolute',
              top: '50%',
              left: '50%',
              transform: 'translate(-50%, -50%)',
              width: '6px',
              height: '1.5px',
              backgroundColor: '#2a2a2a',
              borderRadius: '0.5px',
            }} />
          </div>
        ))}

        {/* Label/Cover Art Area - Notebook paper style when no image */}
        <div 
          style={{
            width: '272px',
            height: '110px',
            marginBottom: '10px',
            background: coverImageUrl 
              ? 'transparent' 
              : 'linear-gradient(180deg, #f5f5f0 0%, #e8e8e0 100%)',
            borderRadius: '4px',
            overflow: 'hidden',
            border: '1px solid #555',
            boxShadow: 'inset 0 2px 6px rgba(0,0,0,0.2)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0,
            position: 'relative',
          }}
        >
          {coverImageUrl ? (
            <img
              src={coverImageUrl}
              alt={title}
              style={{
                width: '100%',
                height: '100%',
                objectFit: 'cover',
              }}
            />
          ) : (
            <>
              {/* Lined paper effect */}
              <div style={{
                position: 'absolute',
                inset: 0,
                backgroundImage: 'repeating-linear-gradient(transparent, transparent 11px, #d0d0d0 11px, #d0d0d0 12px)',
                backgroundPosition: '0 8px',
                opacity: 0.5,
              }} />
              {/* Red margin line */}
              <div style={{
                position: 'absolute',
                left: '24px',
                top: 0,
                bottom: 0,
                width: '1px',
                backgroundColor: '#e8b4b4',
                opacity: 0.6,
              }} />
              {/* Label content */}
              <div style={{ 
                textAlign: 'center', 
                padding: '16px',
                position: 'relative',
                zIndex: 1,
              }}>
                <div style={{ 
                  fontFamily: "'Courier New', Courier, monospace",
                  fontSize: '28px', 
                  fontWeight: '700',
                  color: '#2a2a2a',
                  letterSpacing: '2px',
                  marginBottom: '4px',
                  textShadow: '1px 1px 0 rgba(255,255,255,0.5)',
                }}>DEMO</div>
                <div style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '8px',
                  color: '#555',
                  fontSize: '14px',
                }}>
                  <span style={{ color: '#c44' }}>♥</span>
                  <span style={{ fontFamily: "'Courier New', monospace", fontSize: '11px' }}>♪ ♫</span>
                </div>
              </div>
            </>
          )}
        </div>

        {/* Tape Window Section - Darker, more authentic look */}
        <div 
          style={{
            width: '272px',
            height: '48px',
            background: 'linear-gradient(180deg, #1a1a1a 0%, #252525 50%, #1a1a1a 100%)',
            borderRadius: '6px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '0 10px',
            border: '1px solid #444',
            boxShadow: 'inset 0 2px 8px rgba(0,0,0,0.7)',
            flexShrink: 0,
          }}
        >
          {/* Left Reel */}
          <div style={{
            width: '40px',
            height: '40px',
            borderRadius: '50%',
            background: 'linear-gradient(180deg, #2a2a2a 0%, #1a1a1a 100%)',
            border: '2px solid #3a3a3a',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            boxShadow: 'inset 0 4px 8px rgba(0,0,0,0.6)',
            flexShrink: 0,
          }}>
            <div
              className={isPlaying ? 'animate-spin-reel' : ''}
              style={{
                width: '32px',
                height: '32px',
                borderRadius: '50%',
                background: `conic-gradient(from 0deg, #3d2817 0deg, #5c3d24 60deg, #3d2817 120deg, #5c3d24 180deg, #3d2817 240deg, #5c3d24 300deg, #3d2817 360deg)`,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                boxShadow: isPlaying 
                  ? '0 0 12px rgba(57, 255, 20, 0.3), inset 0 0 4px rgba(0,0,0,0.4)'
                  : 'inset 0 0 4px rgba(0,0,0,0.4)',
                position: 'relative',
              }}
            >
              {/* Reel spokes */}
              {[0, 45, 90, 135].map((deg) => (
                <div 
                  key={deg}
                  style={{
                    position: 'absolute',
                    width: '100%',
                    height: '2px',
                    background: 'linear-gradient(90deg, transparent 0%, #7a5530 30%, #7a5530 70%, transparent 100%)',
                    transform: `rotate(${deg}deg)`,
                  }}
                />
              ))}
              {/* Center hub - green when playing */}
              <div style={{
                width: '10px',
                height: '10px',
                borderRadius: '50%',
                background: isPlaying 
                  ? 'linear-gradient(135deg, #39FF14 0%, #2dd10f 100%)'
                  : 'linear-gradient(135deg, #e0e0e0 0%, #a0a0a0 50%, #808080 100%)',
                boxShadow: isPlaying 
                  ? '0 0 8px rgba(57, 255, 20, 0.8), inset 0 1px 1px rgba(255,255,255,0.5)'
                  : '0 1px 2px rgba(0,0,0,0.4), inset 0 1px 1px rgba(255,255,255,0.5)',
                transition: 'all 0.3s ease',
              }} />
            </div>
          </div>

          {/* Center - Tape path with window */}
          <div style={{
            flex: 1,
            height: '18px',
            margin: '0 10px',
            background: 'linear-gradient(180deg, #0f0f0f 0%, #1a1a1a 50%, #0f0f0f 100%)',
            borderRadius: '4px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            boxShadow: 'inset 0 2px 4px rgba(0,0,0,0.5)',
            position: 'relative',
            overflow: 'hidden',
          }}>
            {/* Tape strip */}
            <div style={{
              width: '100%',
              height: '4px',
              background: 'linear-gradient(90deg, transparent, #4a3020, #5c3d24, #4a3020, transparent)',
              boxShadow: isPlaying ? '0 0 8px rgba(57, 255, 20, 0.15)' : 'none',
            }} />
            {/* Tape guides */}
            <div style={{ position: 'absolute', left: '6px', width: '2px', height: '10px', backgroundColor: '#333', borderRadius: '1px' }} />
            <div style={{ position: 'absolute', right: '6px', width: '2px', height: '10px', backgroundColor: '#333', borderRadius: '1px' }} />
          </div>

          {/* Right Reel */}
          <div style={{
            width: '40px',
            height: '40px',
            borderRadius: '50%',
            background: 'linear-gradient(180deg, #2a2a2a 0%, #1a1a1a 100%)',
            border: '2px solid #3a3a3a',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            boxShadow: 'inset 0 4px 8px rgba(0,0,0,0.6)',
            flexShrink: 0,
          }}>
            <div
              className={isPlaying ? 'animate-spin-reel' : ''}
              style={{
                width: '32px',
                height: '32px',
                borderRadius: '50%',
                background: `conic-gradient(from 45deg, #3d2817 0deg, #5c3d24 60deg, #3d2817 120deg, #5c3d24 180deg, #3d2817 240deg, #5c3d24 300deg, #3d2817 360deg)`,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                boxShadow: isPlaying 
                  ? '0 0 12px rgba(57, 255, 20, 0.3), inset 0 0 4px rgba(0,0,0,0.4)'
                  : 'inset 0 0 4px rgba(0,0,0,0.4)',
                position: 'relative',
              }}
            >
              {/* Reel spokes */}
              {[0, 45, 90, 135].map((deg) => (
                <div 
                  key={deg}
                  style={{
                    position: 'absolute',
                    width: '100%',
                    height: '2px',
                    background: 'linear-gradient(90deg, transparent 0%, #7a5530 30%, #7a5530 70%, transparent 100%)',
                    transform: `rotate(${deg}deg)`,
                  }}
                />
              ))}
              {/* Center hub - green when playing */}
              <div style={{
                width: '10px',
                height: '10px',
                borderRadius: '50%',
                background: isPlaying 
                  ? 'linear-gradient(135deg, #39FF14 0%, #2dd10f 100%)'
                  : 'linear-gradient(135deg, #e0e0e0 0%, #a0a0a0 50%, #808080 100%)',
                boxShadow: isPlaying 
                  ? '0 0 8px rgba(57, 255, 20, 0.8), inset 0 1px 1px rgba(255,255,255,0.5)'
                  : '0 1px 2px rgba(0,0,0,0.4), inset 0 1px 1px rgba(255,255,255,0.5)',
                transition: 'all 0.3s ease',
              }} />
            </div>
          </div>
        </div>

        {/* Status LED and label */}
        <div 
          style={{
            position: 'absolute',
            bottom: '6px',
            left: '50%',
            transform: 'translateX(-50%)',
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            padding: '3px 10px',
            background: 'rgba(0, 0, 0, 0.8)',
            borderRadius: '10px',
            border: '1px solid #444',
          }}
        >
          {/* LED indicator */}
          <div style={{
            width: '5px',
            height: '5px',
            borderRadius: '50%',
            backgroundColor: isPlaying ? '#39FF14' : '#555',
            boxShadow: isPlaying ? '0 0 6px #39FF14, 0 0 12px rgba(57, 255, 20, 0.5)' : 'none',
            transition: 'all 0.3s ease',
          }} />
          <span style={{
            fontSize: '9px',
            fontWeight: '600',
            color: isPlaying ? '#39FF14' : '#777',
            fontFamily: 'var(--font-outfit), monospace',
            letterSpacing: '0.5px',
            textTransform: 'uppercase',
            textShadow: isPlaying ? '0 0 10px rgba(57, 255, 20, 0.5)' : 'none',
            transition: 'all 0.3s ease',
          }}>
            {isPlaying ? 'Playing' : 'Paused'}
          </span>
        </div>
      </div>
    </div>
  )
}
