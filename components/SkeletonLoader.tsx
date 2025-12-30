'use client'

export function ProjectCardSkeleton() {
  return (
    <div className="bg-gray-900 rounded-lg p-4 animate-pulse">
      <div className="w-full h-40 bg-gray-800 rounded-lg mb-4"></div>
      <div className="h-6 bg-gray-800 rounded w-3/4 mb-2"></div>
      <div className="h-4 bg-gray-800 rounded w-1/2"></div>
    </div>
  )
}

export function TrackSkeleton() {
  return (
    <div className="bg-gray-900 rounded-lg p-4 animate-pulse">
      <div className="flex gap-4">
        <div className="w-16 h-16 bg-gray-800 rounded"></div>
        <div className="flex-1">
          <div className="h-5 bg-gray-800 rounded w-1/3 mb-2"></div>
          <div className="h-4 bg-gray-800 rounded w-1/2"></div>
        </div>
      </div>
    </div>
  )
}

export function ProjectDetailSkeleton() {
  return (
    <div className="min-h-screen bg-black">
      <div className="px-4 py-8 max-w-4xl mx-auto">
        <div className="w-full h-56 bg-gray-900 rounded-lg mb-6 animate-pulse"></div>
        <div className="h-10 bg-gray-900 rounded w-2/3 mb-4 animate-pulse"></div>
        <div className="h-6 bg-gray-900 rounded w-1/2 mb-6 animate-pulse"></div>
        <div className="space-y-4">
          {[1, 2, 3].map((i) => (
            <TrackSkeleton key={i} />
          ))}
        </div>
      </div>
    </div>
  )
}

