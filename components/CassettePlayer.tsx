'use client'

interface CassettePlayerProps {
  coverImageUrl?: string | null
  isPlaying: boolean
  title: string
}

export default function CassettePlayer({ coverImageUrl, isPlaying, title }: CassettePlayerProps) {
  return (
    <div className="relative w-full max-w-sm mx-auto mb-4">
      {/* Cassette Tape */}
      <div 
        className="relative shadow-2xl"
        style={{
          width: '280px',
          height: '180px',
          backgroundColor: 'rgba(226, 232, 240, 0.15)', // Slightly transparent like clear plastic
          border: '3px solid #475569',
          borderRadius: '8px',
          margin: '0 auto',
          padding: '10px',
          display: 'block',
          backdropFilter: 'blur(2px)',
          boxShadow: '0 6px 12px rgba(0, 0, 0, 0.4), inset 0 1px 0 rgba(255, 255, 255, 0.2), inset 0 -1px 0 rgba(0, 0, 0, 0.2)',
          position: 'relative'
        }}
      >
        {/* Corner Screws */}
        <div style={{ position: 'absolute', top: '4px', left: '4px', width: '6px', height: '6px', borderRadius: '50%', backgroundColor: '#cbd5e1', boxShadow: 'inset 0 1px 2px rgba(0,0,0,0.3)' }}></div>
        <div style={{ position: 'absolute', top: '4px', right: '4px', width: '6px', height: '6px', borderRadius: '50%', backgroundColor: '#cbd5e1', boxShadow: 'inset 0 1px 2px rgba(0,0,0,0.3)' }}></div>
        <div style={{ position: 'absolute', bottom: '4px', left: '4px', width: '6px', height: '6px', borderRadius: '50%', backgroundColor: '#cbd5e1', boxShadow: 'inset 0 1px 2px rgba(0,0,0,0.3)' }}></div>
        <div style={{ position: 'absolute', bottom: '4px', right: '4px', width: '6px', height: '6px', borderRadius: '50%', backgroundColor: '#cbd5e1', boxShadow: 'inset 0 1px 2px rgba(0,0,0,0.3)' }}></div>

        {/* Cover Art - Takes up majority of cassette with even margins */}
        <div 
          className="relative"
          style={{
            width: 'calc(100% - 20px)',
            height: '120px',
            margin: '0 auto 8px auto',
            backgroundColor: '#ffffff',
            border: '1.5px solid #e2e8f0',
            borderRadius: '3px',
            padding: '3px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            boxShadow: 'inset 0 2px 4px rgba(0,0,0,0.1), 0 1px 0 rgba(255,255,255,0.5)',
            overflow: 'hidden'
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
            <div style={{ textAlign: 'center', color: '#64748b', width: '100%', height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
              <div style={{ fontSize: '36px', marginBottom: '8px' }}>🎵</div>
              <div style={{ fontSize: '13px', fontWeight: 'bold', color: '#39FF14' }}>{title}</div>
            </div>
          )}
        </div>

        {/* Tape Reels Section - Bottom portion with reel windows */}
        <div 
          className="flex justify-between items-center"
          style={{
            width: 'calc(100% - 20px)',
            height: '42px',
            margin: '0 auto',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            padding: '0 16px'
          }}
        >
          {/* Left Reel Window */}
          <div 
            className="relative"
            style={{
              width: '40px',
              height: '40px',
              borderRadius: '50%',
              backgroundColor: '#0f172a',
              border: '2.5px solid #475569',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              boxShadow: 'inset 0 3px 6px rgba(0,0,0,0.4), 0 1px 2px rgba(0,0,0,0.2)'
            }}
          >
            {/* Spinning Reel */}
            <div
              className={`absolute ${isPlaying ? 'animate-spin-reel' : ''}`}
              style={{
                width: '32px',
                height: '32px',
                borderRadius: '50%',
                backgroundColor: '#451a03', // Brown tape color
                border: '1.5px solid #78350f',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                position: 'relative',
                boxShadow: 'inset 0 1px 2px rgba(0,0,0,0.2)'
              }}
            >
              {/* Reel spokes */}
              <div style={{ position: 'absolute', width: '100%', height: '1.5px', backgroundColor: '#92400e' }}></div>
              <div style={{ position: 'absolute', width: '100%', height: '1.5px', backgroundColor: '#92400e', transform: 'rotate(90deg)' }}></div>
              <div style={{ position: 'absolute', width: '100%', height: '1.5px', backgroundColor: '#92400e', transform: 'rotate(45deg)' }}></div>
              <div style={{ position: 'absolute', width: '100%', height: '1.5px', backgroundColor: '#92400e', transform: 'rotate(-45deg)' }}></div>
              {/* Center hub */}
              <div style={{
                width: '8px',
                height: '8px',
                borderRadius: '50%',
                backgroundColor: '#e2e8f0',
                border: '1.5px solid #cbd5e1',
                boxShadow: 'inset 0 1px 2px rgba(0,0,0,0.2)'
              }}></div>
            </div>
          </div>

          {/* Center Section - Tape path indicator */}
          <div 
            style={{
              flex: 1,
              height: '4px',
              margin: '0 12px',
              backgroundColor: '#1e293b',
              borderRadius: '2px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              boxShadow: 'inset 0 1px 2px rgba(0,0,0,0.3)'
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
              width: '40px',
              height: '40px',
              borderRadius: '50%',
              backgroundColor: '#0f172a',
              border: '2.5px solid #475569',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              boxShadow: 'inset 0 3px 6px rgba(0,0,0,0.4), 0 1px 2px rgba(0,0,0,0.2)'
            }}
          >
            {/* Spinning Reel - Same direction as left */}
            <div
              className={`absolute ${isPlaying ? 'animate-spin-reel' : ''}`}
              style={{
                width: '32px',
                height: '32px',
                borderRadius: '50%',
                backgroundColor: '#451a03', // Brown tape color
                border: '1.5px solid #78350f',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                position: 'relative',
                boxShadow: 'inset 0 1px 2px rgba(0,0,0,0.2)'
              }}
            >
              {/* Reel spokes */}
              <div style={{ position: 'absolute', width: '100%', height: '1.5px', backgroundColor: '#92400e' }}></div>
              <div style={{ position: 'absolute', width: '100%', height: '1.5px', backgroundColor: '#92400e', transform: 'rotate(90deg)' }}></div>
              <div style={{ position: 'absolute', width: '100%', height: '1.5px', backgroundColor: '#92400e', transform: 'rotate(45deg)' }}></div>
              <div style={{ position: 'absolute', width: '100%', height: '1.5px', backgroundColor: '#92400e', transform: 'rotate(-45deg)' }}></div>
              {/* Center hub */}
              <div style={{
                width: '8px',
                height: '8px',
                borderRadius: '50%',
                backgroundColor: '#e2e8f0',
                border: '1.5px solid #cbd5e1',
                boxShadow: 'inset 0 1px 2px rgba(0,0,0,0.2)'
              }}></div>
            </div>
          </div>
        </div>

        {/* Status indicator */}
        <div 
          className="text-center"
          style={{
            position: 'absolute',
            bottom: '6px',
            left: '50%',
            transform: 'translateX(-50%)',
            fontSize: '9px',
            color: '#39FF14',
            fontWeight: 'bold',
            fontFamily: 'monospace',
            backgroundColor: 'rgba(0, 0, 0, 0.7)',
            padding: '3px 8px',
            borderRadius: '3px',
            letterSpacing: '0.5px'
          }}
        >
          {isPlaying ? '▶ PLAYING' : '⏸ PAUSED'}
        </div>
      </div>
    </div>
  )
}
