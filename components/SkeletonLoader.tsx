'use client'

// Base skeleton shimmer animation component
function Shimmer() {
  return (
    <div 
      className="absolute inset-0 -translate-x-full animate-[shimmer_2s_infinite]"
      style={{
        background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.05), transparent)',
      }}
    />
  )
}

// Reusable skeleton block
function SkeletonBlock({ className }: { className?: string }) {
  return (
    <div className={`relative overflow-hidden bg-gray-800 rounded ${className || ''}`}>
      <Shimmer />
    </div>
  )
}

export function ProjectCardSkeleton() {
  return (
    <div className="bg-gray-900 rounded-xl p-4 border border-gray-800">
      <SkeletonBlock className="w-full h-40 rounded-lg mb-4" />
      <SkeletonBlock className="h-5 w-3/4 mb-2" />
      <SkeletonBlock className="h-4 w-1/2" />
    </div>
  )
}

export function TrackSkeleton() {
  return (
    <div className="bg-gray-900 rounded-lg p-4 border border-gray-800">
      <div className="flex gap-4">
        <SkeletonBlock className="w-14 h-14 rounded-lg flex-shrink-0" />
        <div className="flex-1 py-1">
          <SkeletonBlock className="h-5 w-2/3 mb-2" />
          <SkeletonBlock className="h-4 w-1/3" />
        </div>
        <SkeletonBlock className="w-8 h-8 rounded-full flex-shrink-0 self-center" />
      </div>
    </div>
  )
}

export function ProjectDetailSkeleton() {
  return (
    <div className="min-h-screen bg-black">
      <div className="border-b border-gray-800 px-4 py-4">
        <div className="max-w-4xl mx-auto flex justify-between items-center">
          <SkeletonBlock className="h-8 w-24" />
          <SkeletonBlock className="h-8 w-20 rounded-full" />
        </div>
      </div>
      <div className="px-4 py-8 max-w-4xl mx-auto">
        <SkeletonBlock className="w-full h-56 rounded-xl mb-6" />
        <SkeletonBlock className="h-10 w-2/3 mb-4" />
        <SkeletonBlock className="h-5 w-1/2 mb-8" />
        <div className="flex justify-center mb-8">
          <SkeletonBlock className="w-80 h-52 rounded-xl" />
        </div>
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <TrackSkeleton key={i} />
          ))}
        </div>
      </div>
    </div>
  )
}

export function TipsSkeleton() {
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-3 gap-3">
        {[1, 2, 3].map((i) => (
          <div key={i} className="bg-black rounded-lg p-4 border border-gray-800">
            <SkeletonBlock className="h-8 w-16 mx-auto mb-2" />
            <SkeletonBlock className="h-3 w-12 mx-auto" />
          </div>
        ))}
      </div>
      <div className="space-y-2">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="py-3 border-b border-gray-800 last:border-0">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <SkeletonBlock className="h-5 w-14" />
                <SkeletonBlock className="h-4 w-24" />
              </div>
              <SkeletonBlock className="h-3 w-12" />
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

export function AccountSkeleton() {
  return (
    <div className="min-h-screen bg-black">
      <div className="border-b border-gray-800 px-4 py-4">
        <div className="max-w-4xl mx-auto flex justify-between items-center">
          <SkeletonBlock className="h-8 w-24" />
          <div className="flex gap-4">
            <SkeletonBlock className="h-6 w-20" />
            <SkeletonBlock className="h-6 w-16" />
          </div>
        </div>
      </div>
      <div className="px-4 py-8 max-w-4xl mx-auto">
        <SkeletonBlock className="h-9 w-32 mb-6" />
        <div className="bg-gray-900 rounded-xl p-6 border border-gray-800 mb-6">
          <SkeletonBlock className="h-6 w-24 mb-6" />
          <div className="flex items-center gap-6 mb-6">
            <SkeletonBlock className="w-20 h-20 rounded-full" />
            <div className="flex-1">
              <SkeletonBlock className="h-6 w-40 mb-2" />
              <SkeletonBlock className="h-4 w-32" />
            </div>
          </div>
          <div className="space-y-4">
            <SkeletonBlock className="h-10 w-full max-w-md" />
            <SkeletonBlock className="h-10 w-full max-w-md" />
            <SkeletonBlock className="h-20 w-full max-w-md" />
          </div>
        </div>
        <div className="bg-gray-900 rounded-xl p-6 border border-gray-800 mb-6">
          <SkeletonBlock className="h-6 w-32 mb-6" />
          <div className="flex items-center gap-4">
            <SkeletonBlock className="w-12 h-12 rounded-full" />
            <div>
              <SkeletonBlock className="h-5 w-48 mb-2" />
              <SkeletonBlock className="h-4 w-32" />
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

export function DashboardSkeleton() {
  return (
    <div className="min-h-screen bg-black">
      <div className="border-b border-gray-800 px-4 py-4">
        <div className="max-w-7xl mx-auto flex justify-between items-center">
          <SkeletonBlock className="h-8 w-24" />
          <div className="flex gap-4">
            <SkeletonBlock className="h-8 w-28 rounded-full" />
            <SkeletonBlock className="h-8 w-20 rounded-full" />
          </div>
        </div>
      </div>
      <div className="px-4 py-8 max-w-7xl mx-auto">
        <div className="flex justify-between items-center mb-8">
          <SkeletonBlock className="h-10 w-48" />
          <SkeletonBlock className="h-10 w-32 rounded-full" />
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <ProjectCardSkeleton key={i} />
          ))}
        </div>
      </div>
    </div>
  )
}
