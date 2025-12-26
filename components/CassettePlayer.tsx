'use client'

interface CassettePlayerProps {
  coverImageUrl?: string | null
  isPlaying: boolean
  title: string
}

export default function CassettePlayer({ coverImageUrl, isPlaying, title }: CassettePlayerProps) {
  return (
    <div className="relative w-full max-w-md mx-auto mb-6">
      {/* Cassette Tape Container */}
      <div className="relative bg-gradient-to-b from-gray-800 via-gray-850 to-gray-900 rounded-xl p-6 shadow-2xl border-2 border-gray-600 min-h-[320px]">
        {/* Cassette Label Area - Shows cover art */}
        <div className="bg-black rounded-lg p-3 mb-4 border-2 border-gray-500 shadow-inner">
          {coverImageUrl ? (
            <div className="aspect-square w-full rounded overflow-hidden bg-gray-900 border border-gray-700">
              <img
                src={coverImageUrl}
                alt={title}
                className="w-full h-full object-cover"
              />
            </div>
          ) : (
            <div className="aspect-square w-full rounded bg-gradient-to-br from-gray-800 to-gray-900 flex items-center justify-center border border-gray-700">
              <div className="text-center">
                <div className="text-4xl mb-2">🎵</div>
                <div className="text-xs text-neon-green opacity-70 px-2">{title}</div>
              </div>
            </div>
          )}
        </div>

        {/* Tape Reels Container */}
        <div className="flex justify-between items-center px-4 py-3">
          {/* Left Reel */}
          <div className="relative w-24 h-24 flex-shrink-0">
            {/* Outer reel housing */}
            <div className="absolute inset-0 rounded-full bg-gray-700 border-4 border-gray-500 shadow-inner"></div>
            {/* Inner spinning reel */}
            <div
              className={`absolute inset-2 rounded-full bg-gradient-to-br from-gray-500 to-gray-700 transition-all ${
                isPlaying ? 'animate-spin-reel' : ''
              }`}
            >
              {/* Reel Spokes - more visible */}
              <div className="absolute inset-0 flex items-center justify-center">
                <div className="w-full h-1 bg-gray-400"></div>
                <div className="absolute inset-0 flex items-center justify-center rotate-90">
                  <div className="w-full h-1 bg-gray-400"></div>
                </div>
                <div className="absolute inset-0 flex items-center justify-center rotate-45">
                  <div className="w-full h-1 bg-gray-400"></div>
                </div>
                <div className="absolute inset-0 flex items-center justify-center -rotate-45">
                  <div className="w-full h-1 bg-gray-400"></div>
                </div>
              </div>
              {/* Center Hub */}
              <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-5 h-5 rounded-full bg-gray-300 border-2 border-gray-500"></div>
            </div>
          </div>

          {/* Center Tape Window */}
          <div className="flex-1 mx-4 h-10 bg-gray-900 rounded border-2 border-gray-600 flex items-center justify-center shadow-inner">
            <div className="w-full h-1.5 bg-gradient-to-r from-transparent via-gray-500 to-transparent"></div>
          </div>

          {/* Right Reel */}
          <div className="relative w-24 h-24 flex-shrink-0">
            {/* Outer reel housing */}
            <div className="absolute inset-0 rounded-full bg-gray-700 border-4 border-gray-500 shadow-inner"></div>
            {/* Inner spinning reel */}
            <div
              className={`absolute inset-2 rounded-full bg-gradient-to-br from-gray-500 to-gray-700 transition-all ${
                isPlaying ? 'animate-spin-reel-reverse' : ''
              }`}
            >
              {/* Reel Spokes - more visible */}
              <div className="absolute inset-0 flex items-center justify-center">
                <div className="w-full h-1 bg-gray-400"></div>
                <div className="absolute inset-0 flex items-center justify-center rotate-90">
                  <div className="w-full h-1 bg-gray-400"></div>
                </div>
                <div className="absolute inset-0 flex items-center justify-center rotate-45">
                  <div className="w-full h-1 bg-gray-400"></div>
                </div>
                <div className="absolute inset-0 flex items-center justify-center -rotate-45">
                  <div className="w-full h-1 bg-gray-400"></div>
                </div>
              </div>
              {/* Center Hub */}
              <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-5 h-5 rounded-full bg-gray-300 border-2 border-gray-500"></div>
            </div>
          </div>
        </div>

        {/* Cassette Details */}
        <div className="mt-4 text-center">
          <div className="text-sm font-semibold text-neon-green mb-1">{title}</div>
          <div className="text-xs text-neon-green opacity-50">
            {isPlaying ? '▶ PLAYING' : '⏸ PAUSED'}
          </div>
        </div>
      </div>
    </div>
  )
}

