'use client'

interface CassettePlayerProps {
  coverImageUrl?: string | null
  isPlaying: boolean
  title: string
}

export default function CassettePlayer({ coverImageUrl, isPlaying, title }: CassettePlayerProps) {
  return (
    <div className="relative w-full max-w-xs mx-auto mb-4">
      {/* Cassette Tape */}
      <div 
        className="relative rounded-lg shadow-2xl"
        style={{
          width: '240px',
          height: '160px',
          backgroundColor: '#1e293b', // Dark blue-gray like vintage cassettes
          border: '2px solid #0f172a',
          borderRadius: '8px',
          margin: '0 auto',
          padding: '12px',
          display: 'block'
        }}
      >
        {/* Cassette Label Area - Top portion where cover art goes */}
        <div 
          className="relative mb-2"
          style={{
            width: '100%',
            height: '80px',
            backgroundColor: '#ffffff',
            border: '1px solid #cbd5e1',
            borderRadius: '4px',
            padding: '4px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            boxShadow: 'inset 0 1px 2px rgba(0,0,0,0.1)'
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
                borderRadius: '2px'
              }}
            />
          ) : (
            <div style={{ textAlign: 'center', color: '#64748b' }}>
              <div style={{ fontSize: '24px', marginBottom: '4px' }}>🎵</div>
              <div style={{ fontSize: '10px', fontWeight: 'bold', color: '#39FF14' }}>{title}</div>
            </div>
          )}
        </div>

        {/* Tape Reels Section - Bottom portion with reel windows */}
        <div 
          className="flex justify-between items-center"
          style={{
            width: '100%',
            height: '60px',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            padding: '0 8px'
          }}
        >
          {/* Left Reel Window */}
          <div 
            className="relative"
            style={{
              width: '50px',
              height: '50px',
              borderRadius: '50%',
              backgroundColor: '#0f172a',
              border: '2px solid #334155',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              boxShadow: 'inset 0 2px 4px rgba(0,0,0,0.3)'
            }}
          >
            {/* Spinning Reel */}
            <div
              className={`absolute ${isPlaying ? 'animate-spin-reel' : ''}`}
              style={{
                width: '42px',
                height: '42px',
                borderRadius: '50%',
                backgroundColor: '#451a03', // Brown tape color
                border: '1px solid #78350f',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                position: 'relative'
              }}
            >
              {/* Reel spokes */}
              <div style={{ position: 'absolute', width: '100%', height: '1px', backgroundColor: '#92400e' }}></div>
              <div style={{ position: 'absolute', width: '100%', height: '1px', backgroundColor: '#92400e', transform: 'rotate(90deg)' }}></div>
              <div style={{ position: 'absolute', width: '100%', height: '1px', backgroundColor: '#92400e', transform: 'rotate(45deg)' }}></div>
              <div style={{ position: 'absolute', width: '100%', height: '1px', backgroundColor: '#92400e', transform: 'rotate(-45deg)' }}></div>
              {/* Center hub */}
              <div style={{
                width: '8px',
                height: '8px',
                borderRadius: '50%',
                backgroundColor: '#cbd5e1',
                border: '1px solid #94a3b8'
              }}></div>
            </div>
          </div>

          {/* Center Section - Tape path indicator */}
          <div 
            style={{
              flex: 1,
              height: '4px',
              margin: '0 8px',
              backgroundColor: '#1e293b',
              borderRadius: '2px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}
          >
            <div style={{
              width: '100%',
              height: '2px',
              background: 'linear-gradient(to right, transparent, #451a03, transparent)',
              borderRadius: '1px'
            }}></div>
          </div>

          {/* Right Reel Window */}
          <div 
            className="relative"
            style={{
              width: '50px',
              height: '50px',
              borderRadius: '50%',
              backgroundColor: '#0f172a',
              border: '2px solid #334155',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              boxShadow: 'inset 0 2px 4px rgba(0,0,0,0.3)'
            }}
          >
            {/* Spinning Reel */}
            <div
              className={`absolute ${isPlaying ? 'animate-spin-reel-reverse' : ''}`}
              style={{
                width: '42px',
                height: '42px',
                borderRadius: '50%',
                backgroundColor: '#451a03', // Brown tape color
                border: '1px solid #78350f',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                position: 'relative'
              }}
            >
              {/* Reel spokes */}
              <div style={{ position: 'absolute', width: '100%', height: '1px', backgroundColor: '#92400e' }}></div>
              <div style={{ position: 'absolute', width: '100%', height: '1px', backgroundColor: '#92400e', transform: 'rotate(90deg)' }}></div>
              <div style={{ position: 'absolute', width: '100%', height: '1px', backgroundColor: '#92400e', transform: 'rotate(45deg)' }}></div>
              <div style={{ position: 'absolute', width: '100%', height: '1px', backgroundColor: '#92400e', transform: 'rotate(-45deg)' }}></div>
              {/* Center hub */}
              <div style={{
                width: '8px',
                height: '8px',
                borderRadius: '50%',
                backgroundColor: '#cbd5e1',
                border: '1px solid #94a3b8'
              }}></div>
            </div>
          </div>
        </div>

        {/* Status indicator */}
        <div 
          className="text-center mt-2"
          style={{
            position: 'absolute',
            bottom: '4px',
            left: '50%',
            transform: 'translateX(-50%)',
            fontSize: '9px',
            color: '#39FF14',
            fontWeight: 'bold',
            fontFamily: 'monospace'
          }}
        >
          {isPlaying ? '▶ PLAYING' : '⏸ PAUSED'}
        </div>
      </div>
    </div>
  )
}
