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
      {/* Dynamic pulsing glow effect */}
      <div 
        className="absolute inset-0 rounded-2xl pointer-events-none"
        style={{
          background: `radial-gradient(ellipse at center, rgba(57, 255, 20, ${glowIntensity}) 0%, rgba(0, 217, 255, ${glowIntensity * 0.3}) 40%, transparent 70%)`,
          filter: 'blur(30px)',
          transform: 'scale(1.2)',
          opacity: isPlaying ? 1 : 0,
          transition: 'opacity 0.5s ease',
        }}
      />
      
      {/* Cassette Tape Body */}
      <div 
        className={`relative transition-all duration-300 ${isPlaying ? 'animate-glow-pulse' : ''}`}
        style={{
          width: '320px',
          height: '210px',
          margin: '0 auto',
          background: 'linear-gradient(180deg, #2a2a2a 0%, #1a1a1a 50%, #0f0f0f 100%)',
          borderRadius: '12px',
          border: '2px solid #3a3a3a',
          boxShadow: isPlaying 
            ? '0 8px 32px rgba(0, 0, 0, 0.6), 0 0 40px rgba(57, 255, 20, 0.2), inset 0 1px 0 rgba(255, 255, 255, 0.1)'
            : '0 8px 32px rgba(0, 0, 0, 0.6), inset 0 1px 0 rgba(255, 255, 255, 0.1)',
          position: 'relative',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          padding: '16px',
          boxSizing: 'border-box',
        }}
      >
        {/* Top edge highlight */}
        <div style={{
          position: 'absolute',
          top: 0,
          left: '20px',
          right: '20px',
          height: '1px',
          background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.2), transparent)',
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
              background: 'linear-gradient(135deg, #4a4a4a 0%, #2a2a2a 50%, #1a1a1a 100%)',
              boxShadow: 'inset 0 1px 2px rgba(255,255,255,0.2), inset 0 -1px 2px rgba(0,0,0,0.4), 0 1px 2px rgba(0,0,0,0.3)',
            }}
          >
            {/* Screw slot */}
            <div style={{
              position: 'absolute',
              top: '50%',
              left: '50%',
              transform: 'translate(-50%, -50%)',
              width: '6px',
              height: '1px',
              backgroundColor: '#1a1a1a',
            }} />
          </div>
        ))}

        {/* Label/Cover Art Area */}
        <div 
          style={{
            width: '272px',
            height: '110px',
            marginBottom: '10px',
            background: coverImageUrl 
              ? 'transparent' 
              : 'linear-gradient(135deg, #1a1a1a 0%, #0a0a0a 100%)',
            borderRadius: '6px',
            overflow: 'hidden',
            border: '1px solid #3a3a3a',
            boxShadow: 'inset 0 2px 8px rgba(0,0,0,0.5)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0,
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
            <div style={{ 
              textAlign: 'center', 
              padding: '16px',
            }}>
              <div style={{ 
                fontSize: '32px', 
                marginBottom: '8px',
                filter: 'drop-shadow(0 0 8px rgba(57, 255, 20, 0.5))',
              }}>🎵</div>
              <div style={{ 
                fontSize: '14px', 
                fontWeight: '600',
                color: '#39FF14',
                textShadow: '0 0 10px rgba(57, 255, 20, 0.5)',
                letterSpacing: '0.5px',
              }}>{title}</div>
            </div>
          )}
        </div>

        {/* Tape Window Section */}
        <div 
          style={{
            width: '272px',
            height: '48px',
            background: 'linear-gradient(180deg, #0a0a0a 0%, #151515 50%, #0a0a0a 100%)',
            borderRadius: '8px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '0 12px',
            border: '1px solid #2a2a2a',
            boxShadow: 'inset 0 2px 6px rgba(0,0,0,0.5)',
            flexShrink: 0,
          }}
        >
          {/* Left Reel */}
          <div style={{
            width: '40px',
            height: '40px',
            borderRadius: '50%',
            background: 'linear-gradient(180deg, #1a1a1a 0%, #0a0a0a 100%)',
            border: '2px solid #2a2a2a',
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
              {/* Center hub */}
              <div style={{
                width: '10px',
                height: '10px',
                borderRadius: '50%',
                background: 'linear-gradient(135deg, #e0e0e0 0%, #a0a0a0 50%, #808080 100%)',
                boxShadow: '0 1px 2px rgba(0,0,0,0.4), inset 0 1px 1px rgba(255,255,255,0.5)',
              }} />
            </div>
          </div>

          {/* Center - Tape path with window */}
          <div style={{
            flex: 1,
            height: '18px',
            margin: '0 12px',
            background: 'linear-gradient(180deg, #0a0a0a 0%, #1a1a1a 50%, #0a0a0a 100%)',
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
              boxShadow: isPlaying ? '0 0 8px rgba(57, 255, 20, 0.2)' : 'none',
            }} />
            {/* Tape guides */}
            <div style={{ position: 'absolute', left: '6px', width: '2px', height: '10px', backgroundColor: '#2a2a2a', borderRadius: '1px' }} />
            <div style={{ position: 'absolute', right: '6px', width: '2px', height: '10px', backgroundColor: '#2a2a2a', borderRadius: '1px' }} />
          </div>

          {/* Right Reel */}
          <div style={{
            width: '40px',
            height: '40px',
            borderRadius: '50%',
            background: 'linear-gradient(180deg, #1a1a1a 0%, #0a0a0a 100%)',
            border: '2px solid #2a2a2a',
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
              {/* Center hub */}
              <div style={{
                width: '10px',
                height: '10px',
                borderRadius: '50%',
                background: 'linear-gradient(135deg, #e0e0e0 0%, #a0a0a0 50%, #808080 100%)',
                boxShadow: '0 1px 2px rgba(0,0,0,0.4), inset 0 1px 1px rgba(255,255,255,0.5)',
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
            background: 'rgba(0, 0, 0, 0.7)',
            borderRadius: '10px',
            backdropFilter: 'blur(4px)',
          }}
        >
          {/* LED indicator */}
          <div style={{
            width: '5px',
            height: '5px',
            borderRadius: '50%',
            backgroundColor: isPlaying ? '#39FF14' : '#666',
            boxShadow: isPlaying ? '0 0 6px #39FF14, 0 0 12px rgba(57, 255, 20, 0.5)' : 'none',
            transition: 'all 0.3s ease',
          }} />
          <span style={{
            fontSize: '9px',
            fontWeight: '600',
            color: isPlaying ? '#39FF14' : '#888',
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
