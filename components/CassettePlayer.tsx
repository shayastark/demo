'use client'

interface CassettePlayerProps {
  coverImageUrl?: string | null
  isPlaying: boolean
  title: string
}

export default function CassettePlayer({ coverImageUrl, isPlaying, title }: CassettePlayerProps) {
  return (
    <div className="relative w-full max-w-md mx-auto mb-4" style={{ minHeight: '220px', display: 'block', visibility: 'visible' }}>
      {/* Cassette Player Device */}
      <div 
        className="relative rounded-lg p-5 shadow-2xl border-4" 
        style={{ 
          backgroundColor: '#9ca3af',
          borderColor: '#d1d5db',
          minHeight: '200px',
          display: 'block'
        }}
      >
        {/* Player Top Section */}
        <div className="mb-3" style={{ display: 'block', height: '20px' }}>
          <div className="h-1 bg-gray-600 rounded mb-2" style={{ backgroundColor: '#4b5563' }}></div>
          <div className="flex gap-2 justify-center">
            <div className="w-2 h-2 rounded-full" style={{ backgroundColor: '#6b7280' }}></div>
            <div className="w-2 h-2 rounded-full" style={{ backgroundColor: '#6b7280' }}></div>
          </div>
        </div>

        {/* Cassette Tape Slot - Where the cassette is inserted */}
        <div 
          className="rounded-lg p-4 border-2 shadow-inner mb-3" 
          style={{ 
            backgroundColor: '#1f2937',
            borderColor: '#9ca3af',
            minHeight: '120px',
            display: 'block'
          }}
        >
          {/* The Cassette Tape */}
          <div 
            className="relative rounded-lg p-2.5 border-2" 
            style={{ 
              backgroundColor: '#6b7280',
              borderColor: '#d1d5db',
              minHeight: '100px',
              display: 'block'
            }}
          >
            {/* Cassette Label Window - Shows cover art */}
            <div 
              className="bg-black rounded-sm p-1.5 mb-2 border flex justify-center" 
              style={{ 
                borderColor: '#9ca3af',
                display: 'flex',
                minHeight: '70px'
              }}
            >
              {coverImageUrl ? (
                <div className="aspect-square w-16 h-16 rounded overflow-hidden bg-gray-900 border border-gray-700">
                  <img
                    src={coverImageUrl}
                    alt={title}
                    className="w-full h-full object-cover"
                    style={{ display: 'block' }}
                  />
                </div>
              ) : (
                <div className="aspect-square w-16 h-16 rounded bg-gradient-to-br from-gray-800 to-gray-900 flex items-center justify-center border border-gray-700">
                  <div className="text-center">
                    <div className="text-lg mb-0.5">🎵</div>
                    <div className="text-[8px] text-neon-green opacity-70 px-1">{title}</div>
                  </div>
                </div>
              )}
            </div>

            {/* Tape Reels on the Cassette */}
            <div className="flex justify-between items-center px-1.5 py-1" style={{ display: 'flex', minHeight: '40px' }}>
              {/* Left Reel */}
              <div className="relative w-10 h-10 flex-shrink-0" style={{ width: '40px', height: '40px' }}>
                <div 
                  className="absolute inset-0 rounded-full border-2 shadow-inner" 
                  style={{ 
                    backgroundColor: '#6b7280',
                    borderColor: '#9ca3af'
                  }}
                ></div>
                <div
                  className={`absolute inset-0.5 rounded-full ${
                    isPlaying ? 'animate-spin-reel' : ''
                  }`}
                  style={{ 
                    backgroundColor: '#9ca3af',
                    width: '36px',
                    height: '36px'
                  }}
                >
                  <div className="absolute inset-0 flex items-center justify-center">
                    <div className="w-full h-0.5" style={{ backgroundColor: '#d1d5db' }}></div>
                    <div className="absolute inset-0 flex items-center justify-center rotate-90">
                      <div className="w-full h-0.5" style={{ backgroundColor: '#d1d5db' }}></div>
                    </div>
                    <div className="absolute inset-0 flex items-center justify-center rotate-45">
                      <div className="w-full h-0.5" style={{ backgroundColor: '#d1d5db' }}></div>
                    </div>
                    <div className="absolute inset-0 flex items-center justify-center -rotate-45">
                      <div className="w-full h-0.5" style={{ backgroundColor: '#d1d5db' }}></div>
                    </div>
                  </div>
                  <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-2 h-2 rounded-full" style={{ backgroundColor: '#e5e7eb', border: '1px solid #9ca3af' }}></div>
                </div>
              </div>

              {/* Center Tape Window */}
              <div 
                className="flex-1 mx-1.5 h-5 bg-gray-900 rounded border flex items-center justify-center shadow-inner" 
                style={{ 
                  backgroundColor: '#111827',
                  borderColor: '#6b7280',
                  minHeight: '20px'
                }}
              >
                <div className="w-full h-0.5" style={{ background: 'linear-gradient(to right, transparent, #6b7280, transparent)' }}></div>
              </div>

              {/* Right Reel */}
              <div className="relative w-10 h-10 flex-shrink-0" style={{ width: '40px', height: '40px' }}>
                <div 
                  className="absolute inset-0 rounded-full border-2 shadow-inner" 
                  style={{ 
                    backgroundColor: '#6b7280',
                    borderColor: '#9ca3af'
                  }}
                ></div>
                <div
                  className={`absolute inset-0.5 rounded-full ${
                    isPlaying ? 'animate-spin-reel-reverse' : ''
                  }`}
                  style={{ 
                    backgroundColor: '#9ca3af',
                    width: '36px',
                    height: '36px'
                  }}
                >
                  <div className="absolute inset-0 flex items-center justify-center">
                    <div className="w-full h-0.5" style={{ backgroundColor: '#d1d5db' }}></div>
                    <div className="absolute inset-0 flex items-center justify-center rotate-90">
                      <div className="w-full h-0.5" style={{ backgroundColor: '#d1d5db' }}></div>
                    </div>
                    <div className="absolute inset-0 flex items-center justify-center rotate-45">
                      <div className="w-full h-0.5" style={{ backgroundColor: '#d1d5db' }}></div>
                    </div>
                    <div className="absolute inset-0 flex items-center justify-center -rotate-45">
                      <div className="w-full h-0.5" style={{ backgroundColor: '#d1d5db' }}></div>
                    </div>
                  </div>
                  <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-2 h-2 rounded-full" style={{ backgroundColor: '#e5e7eb', border: '1px solid #9ca3af' }}></div>
                </div>
              </div>
            </div>

            {/* Cassette Bottom Label */}
            <div className="mt-1.5 text-center" style={{ display: 'block' }}>
              <div className="text-[10px] font-semibold text-neon-green truncate px-1">{title}</div>
            </div>
          </div>
        </div>

        {/* Player Controls Area */}
        <div className="flex items-center justify-center gap-3 mb-2" style={{ display: 'flex', minHeight: '30px' }}>
          <div className="w-3 h-3 rounded-full border" style={{ backgroundColor: '#9ca3af', borderColor: '#6b7280' }}></div>
          <div className="w-8 h-8 rounded-full border-2 flex items-center justify-center" style={{ backgroundColor: '#4b5563', borderColor: '#6b7280' }}>
            <div className="w-4 h-4 rounded-full" style={{ backgroundColor: '#6b7280' }}></div>
          </div>
          <div className="w-3 h-3 rounded-full border" style={{ backgroundColor: '#9ca3af', borderColor: '#6b7280' }}></div>
        </div>

        {/* Status Display */}
        <div className="text-center" style={{ display: 'block' }}>
          <div className="text-[10px] text-neon-green opacity-70 font-mono">
            {isPlaying ? '▶ PLAYING' : '⏸ PAUSED'}
          </div>
        </div>
      </div>
    </div>
  )
}
