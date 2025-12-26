'use client'

interface CassettePlayerProps {
  coverImageUrl?: string | null
  isPlaying: boolean
  title: string
}

export default function CassettePlayer({ coverImageUrl, isPlaying, title }: CassettePlayerProps) {
  return (
    <div className="relative w-full max-w-sm mx-auto mb-4">
      {/* Cassette Player Device */}
      <div className="relative bg-gradient-to-b from-gray-600 to-gray-800 rounded-lg p-4 shadow-2xl border-2 border-gray-500">
        {/* Player Top Section */}
        <div className="mb-3">
          <div className="h-1 bg-gray-700 rounded mb-2"></div>
          <div className="flex gap-2 justify-center">
            <div className="w-2 h-2 rounded-full bg-gray-400"></div>
            <div className="w-2 h-2 rounded-full bg-gray-400"></div>
          </div>
        </div>

        {/* Cassette Tape Slot - Where the cassette is inserted */}
        <div className="bg-gray-900 rounded-lg p-3 border-2 border-gray-600 shadow-inner mb-3">
          {/* The Cassette Tape */}
          <div className="relative bg-gradient-to-b from-gray-700 to-gray-800 rounded-lg p-2 border-2 border-gray-500">
            {/* Cassette Label Window - Shows cover art */}
            <div className="bg-black rounded-sm p-1.5 mb-2 border border-gray-600 flex justify-center">
              {coverImageUrl ? (
                <div className="aspect-square w-16 h-16 rounded overflow-hidden bg-gray-900 border border-gray-700">
                  <img
                    src={coverImageUrl}
                    alt={title}
                    className="w-full h-full object-cover"
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
            <div className="flex justify-between items-center px-1.5 py-1">
              {/* Left Reel */}
              <div className="relative w-10 h-10 flex-shrink-0">
                <div className="absolute inset-0 rounded-full bg-gray-600 border-2 border-gray-500 shadow-inner"></div>
                <div
                  className={`absolute inset-0.5 rounded-full bg-gradient-to-br from-gray-500 to-gray-700 ${
                    isPlaying ? 'animate-spin-reel' : ''
                  }`}
                >
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
                  <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-2 h-2 rounded-full bg-gray-300 border border-gray-500"></div>
                </div>
              </div>

              {/* Center Tape Window */}
              <div className="flex-1 mx-1.5 h-5 bg-gray-900 rounded border border-gray-600 flex items-center justify-center shadow-inner">
                <div className="w-full h-0.5 bg-gradient-to-r from-transparent via-gray-500 to-transparent"></div>
              </div>

              {/* Right Reel */}
              <div className="relative w-10 h-10 flex-shrink-0">
                <div className="absolute inset-0 rounded-full bg-gray-600 border-2 border-gray-500 shadow-inner"></div>
                <div
                  className={`absolute inset-0.5 rounded-full bg-gradient-to-br from-gray-500 to-gray-700 ${
                    isPlaying ? 'animate-spin-reel-reverse' : ''
                  }`}
                >
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
                  <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-2 h-2 rounded-full bg-gray-300 border border-gray-500"></div>
                </div>
              </div>
            </div>

            {/* Cassette Bottom Label */}
            <div className="mt-1.5 text-center">
              <div className="text-[10px] font-semibold text-neon-green truncate px-1">{title}</div>
            </div>
          </div>
        </div>

        {/* Player Controls Area */}
        <div className="flex items-center justify-center gap-3 mb-2">
          <div className="w-3 h-3 rounded-full bg-gray-400 border border-gray-500"></div>
          <div className="w-8 h-8 rounded-full bg-gray-700 border-2 border-gray-500 flex items-center justify-center">
            <div className="w-4 h-4 rounded-full bg-gray-500"></div>
          </div>
          <div className="w-3 h-3 rounded-full bg-gray-400 border border-gray-500"></div>
        </div>

        {/* Status Display */}
        <div className="text-center">
          <div className="text-[10px] text-neon-green opacity-70 font-mono">
            {isPlaying ? '▶ PLAYING' : '⏸ PAUSED'}
          </div>
        </div>
      </div>
    </div>
  )
}
