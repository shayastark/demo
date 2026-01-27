'use client'

import { useEffect, useRef } from 'react'

interface DecorativeCassetteProps {
  size?: 'sm' | 'md' | 'lg'
}

export default function DecorativeCassette({ size = 'md' }: DecorativeCassetteProps) {
  const leftReelRef = useRef<HTMLDivElement>(null)
  const rightReelRef = useRef<HTMLDivElement>(null)
  
  const scale = size === 'sm' ? 0.6 : size === 'lg' ? 1.2 : 1

  useEffect(() => {
    let rotation = 0
    let animationId: number

    const animate = () => {
      rotation += 1.5 // Spin speed
      
      if (leftReelRef.current) {
        leftReelRef.current.style.transform = `rotate(${rotation}deg)`
      }
      if (rightReelRef.current) {
        rightReelRef.current.style.transform = `rotate(${rotation}deg)`
      }
      
      animationId = requestAnimationFrame(animate)
    }
    
    animate()
    
    return () => {
      cancelAnimationFrame(animationId)
    }
  }, [])

  return (
    <div 
      className="relative"
      style={{
        width: '280px',
        height: '180px',
        transform: `scale(${scale})`,
        transformOrigin: 'center center',
        overflow: 'visible',
        flexShrink: 0,
      }}
    >
      {/* Ambient glow - centered precisely */}
      <div 
        className="pointer-events-none"
        style={{
          position: 'absolute',
          top: '50%',
          left: '50%',
          transform: 'translate(-50%, -50%)',
          width: '420px',
          height: '270px',
          background: 'radial-gradient(ellipse at center, rgba(57, 255, 20, 0.15) 0%, transparent 70%)',
          filter: 'blur(40px)',
        }}
      />
      
      {/* Cassette Body */}
      <div
        style={{
          width: '280px',
          height: '180px',
          background: 'linear-gradient(180deg, #2a2a2a 0%, #1a1a1a 50%, #0f0f0f 100%)',
          borderRadius: '10px',
          border: '2px solid #3a3a3a',
          boxShadow: '0 8px 32px rgba(0, 0, 0, 0.6), 0 0 60px rgba(57, 255, 20, 0.1), inset 0 1px 0 rgba(255, 255, 255, 0.1)',
          position: 'relative',
          padding: '14px',
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

        {/* Corner screws */}
        {[
          { top: '6px', left: '6px' },
          { top: '6px', right: '6px' },
          { bottom: '6px', left: '6px' },
          { bottom: '6px', right: '6px' },
        ].map((pos, i) => (
          <div 
            key={i}
            style={{
              position: 'absolute',
              ...pos,
              width: '8px',
              height: '8px',
              borderRadius: '50%',
              background: 'linear-gradient(135deg, #4a4a4a 0%, #2a2a2a 50%, #1a1a1a 100%)',
              boxShadow: 'inset 0 1px 2px rgba(255,255,255,0.2), inset 0 -1px 2px rgba(0,0,0,0.4)',
            }}
          >
            <div style={{
              position: 'absolute',
              top: '50%',
              left: '50%',
              transform: 'translate(-50%, -50%)',
              width: '5px',
              height: '1px',
              backgroundColor: '#1a1a1a',
            }} />
          </div>
        ))}

        {/* Label area with "DEMO" branding */}
        <div 
          style={{
            width: '100%',
            height: '90px',
            background: 'linear-gradient(135deg, #111 0%, #0a0a0a 100%)',
            borderRadius: '6px',
            border: '1px solid #333',
            boxShadow: 'inset 0 2px 8px rgba(0,0,0,0.5)',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            position: 'relative',
            overflow: 'hidden',
          }}
        >
          {/* Diagonal lines pattern */}
          <div style={{
            position: 'absolute',
            inset: 0,
            backgroundImage: 'repeating-linear-gradient(45deg, transparent, transparent 10px, rgba(57, 255, 20, 0.03) 10px, rgba(57, 255, 20, 0.03) 11px)',
          }} />
          
          {/* Demo text */}
          <div 
            style={{
              fontFamily: 'var(--font-outfit), system-ui, sans-serif',
              fontSize: '28px',
              fontWeight: 800,
              letterSpacing: '6px',
              background: 'linear-gradient(180deg, #39FF14 0%, #00D9FF 100%)',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
              textShadow: '0 0 30px rgba(57, 255, 20, 0.5)',
            }}
          >
            DEMO
          </div>
          <div style={{
            fontSize: '9px',
            letterSpacing: '2px',
            color: '#555',
            marginTop: '4px',
            fontWeight: 500,
          }}>
            SHARE YOUR MUSIC
          </div>
        </div>

        {/* Tape window */}
        <div 
          style={{
            width: '100%',
            height: '50px',
            marginTop: '10px',
            background: 'linear-gradient(180deg, rgba(20, 20, 20, 0.95) 0%, rgba(10, 10, 10, 0.98) 100%)',
            borderRadius: '6px',
            border: '1px solid #333',
            position: 'relative',
            overflow: 'hidden',
          }}
        >
          {/* Reflection */}
          <div style={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            height: '50%',
            background: 'linear-gradient(180deg, rgba(255,255,255,0.05) 0%, transparent 100%)',
            borderRadius: '6px 6px 0 0',
            pointerEvents: 'none',
          }} />

          {/* Left Reel - positioned absolutely for precise alignment */}
          <div 
            ref={leftReelRef}
            style={{
              position: 'absolute',
              left: '38px',
              top: '50%',
              marginTop: '-18px',
              width: '36px',
              height: '36px',
              borderRadius: '50%',
              background: 'linear-gradient(135deg, #2a2a2a 0%, #1a1a1a 50%, #0f0f0f 100%)',
              border: '2px solid #3a3a3a',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              boxShadow: '0 2px 8px rgba(0,0,0,0.4)',
            }}
          >
            {/* Spokes */}
            {[0, 60, 120, 180, 240, 300].map((deg) => (
              <div
                key={deg}
                style={{
                  position: 'absolute',
                  width: '2px',
                  height: '14px',
                  backgroundColor: '#444',
                  transform: `rotate(${deg}deg)`,
                  transformOrigin: 'center center',
                }}
              />
            ))}
            {/* Center hub */}
            <div style={{
              width: '10px',
              height: '10px',
              borderRadius: '50%',
              background: 'linear-gradient(135deg, #39FF14 0%, #00D9FF 100%)',
              boxShadow: '0 0 10px rgba(57, 255, 20, 0.5)',
            }} />
          </div>

          {/* Tape line */}
          <div style={{
            position: 'absolute',
            left: '80px',
            right: '80px',
            top: '50%',
            marginTop: '-2px',
            height: '4px',
            background: 'linear-gradient(90deg, #1a1a1a, #2a2a2a, #1a1a1a)',
            borderRadius: '2px',
          }}>
            {/* Tape shine */}
            <div style={{
              position: 'absolute',
              top: 0,
              left: '20%',
              width: '30%',
              height: '1px',
              background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.1), transparent)',
            }} />
          </div>

          {/* Right Reel - positioned absolutely for precise alignment */}
          <div 
            ref={rightReelRef}
            style={{
              position: 'absolute',
              right: '38px',
              top: '50%',
              marginTop: '-18px',
              width: '36px',
              height: '36px',
              borderRadius: '50%',
              background: 'linear-gradient(135deg, #2a2a2a 0%, #1a1a1a 50%, #0f0f0f 100%)',
              border: '2px solid #3a3a3a',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              boxShadow: '0 2px 8px rgba(0,0,0,0.4)',
            }}
          >
            {/* Spokes */}
            {[0, 60, 120, 180, 240, 300].map((deg) => (
              <div
                key={deg}
                style={{
                  position: 'absolute',
                  width: '2px',
                  height: '14px',
                  backgroundColor: '#444',
                  transform: `rotate(${deg}deg)`,
                  transformOrigin: 'center center',
                }}
              />
            ))}
            {/* Center hub */}
            <div style={{
              width: '10px',
              height: '10px',
              borderRadius: '50%',
              background: 'linear-gradient(135deg, #39FF14 0%, #00D9FF 100%)',
              boxShadow: '0 0 10px rgba(57, 255, 20, 0.5)',
            }} />
          </div>
        </div>
      </div>
    </div>
  )
}
