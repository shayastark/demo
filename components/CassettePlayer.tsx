'use client'

interface CassettePlayerProps {
  coverImageUrl?: string | null
  isPlaying: boolean
  title: string
}

export default function CassettePlayer({ coverImageUrl, isPlaying, title }: CassettePlayerProps) {
  return (
    <div className="relative w-full max-w-xs mx-auto mb-4">
      {/* Cassette Tape Container */}
      <div className="relative bg-gradient-to-b from-gray-700 to-gray-800 rounded-lg p-3 shadow-xl border-2 border-gray-400">
        {/* Cassette Label Area - Shows cover art */}
        <div className="bg-black rounded-md p-2 mb-2 border-2 border-gray-400 shadow-inner flex justify-center">
          {coverImageUrl ? (
            <div className="aspect-square w-24 h-24 rounded overflow-hidden bg-gray-900 border border-gray-700">
              <img
                src={coverImageUrl}
                alt={title}
                className="w-full h-full object-cover"
              />
            </div>
          ) : (
            <div className="aspect-square w-24 h-24 rounded bg-gradient-to-br from-gray-800 to-gray-900 flex items-center justify-center border border-gray-700">
              <div className="text-center">
                <div className="text-xl mb-0.5">🎵</div>
                <div className="text-[9px] text-neon-green opacity-70 px-1">{title}</div>
              </div>
            </div>
          )}
        </div>

        {/* Tape Reels Container */}
        <div className="flex justify-between items-center px-2 py-1">
          {/* Left Reel */}
          <div className="relative w-12 h-12 flex-shrink-0">
            {/* Outer reel housing */}
            <div className="absolute inset-0 rounded-full bg-gray-600 border-2 border-gray-400 shadow-inner"></div>
            {/* Inner spinning reel */}
            <div
              className={`absolute inset-1 rounded-full bg-gradient-to-br from-gray-400 to-gray-600 transition-all ${
                isPlaying ? 'animate-spin-reel' : ''
              }`}
            >
              {/* Reel Spokes */}
              <div className="absolute inset-0 flex items-center justify-center">
                <div className="w-full h-0.5 bg-gray-400"></div>
                <div className="absolute inset-0 flex items-center justify-center rotate-90">
                  <div className="w-full h-0.5 bg-gray-400"></div>
                </div>
                <div className="absolute inset-0 flex items-center justify-center rotate-45">
                  <div className="w-full h-0.5 bg-gray-400"></div>
                </div>
                <div className="absolute inset-0 flex items-center justify-center -rotate-45">
                  <div className="w-full h-0.5 bg-gray-400"></div>
                </div>
              </div>
              {/* Center Hub */}
              <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-2.5 h-2.5 rounded-full bg-gray-300 border border-gray-500"></div>
            </div>
          </div>

          {/* Center Tape Window */}
          <div className="flex-1 mx-2 h-6 bg-gray-900 rounded border border-gray-600 flex items-center justify-center shadow-inner">
            <div className="w-full h-0.5 bg-gradient-to-r from-transparent via-gray-500 to-transparent"></div>
          </div>

          {/* Right Reel */}
          <div className="relative w-12 h-12 flex-shrink-0">
            {/* Outer reel housing */}
            <div className="absolute inset-0 rounded-full bg-gray-600 border-2 border-gray-400 shadow-inner"></div>
            {/* Inner spinning reel */}
            <div
              className={`absolute inset-1 rounded-full bg-gradient-to-br from-gray-400 to-gray-600 transition-all ${
                isPlaying ? 'animate-spin-reel-reverse' : ''
              }`}
            >
              {/* Reel Spokes */}
              <div className="absolute inset-0 flex items-center justify-center">
                <div className="w-full h-0.5 bg-gray-400"></div>
                <div className="absolute inset-0 flex items-center justify-center rotate-90">
                  <div className="w-full h-0.5 bg-gray-400"></div>
                </div>
                <div className="absolute inset-0 flex items-center justify-center rotate-45">
                  <div className="w-full h-0.5 bg-gray-400"></div>
                </div>
                <div className="absolute inset-0 flex items-center justify-center -rotate-45">
                  <div className="w-full h-0.5 bg-gray-400"></div>
                </div>
              </div>
              {/* Center Hub */}
              <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-2.5 h-2.5 rounded-full bg-gray-300 border border-gray-500"></div>
            </div>
          </div>
        </div>

        {/* Cassette Details */}
        <div className="mt-2 text-center">
          <div className="text-xs font-semibold text-neon-green mb-0.5 truncate px-1">{title}</div>
          <div className="text-[10px] text-neon-green opacity-50">
            {isPlaying ? '▶ PLAYING' : '⏸ PAUSED'}
          </div>
        </div>
      </div>
    </div>
  )
}

