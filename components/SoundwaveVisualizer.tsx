'use client'

import { useEffect, useRef, useState } from 'react'

interface SoundwaveVisualizerProps {
  isPlaying: boolean
  // audioElement prop is kept for backwards compatibility but not used anymore
  audioElement?: HTMLAudioElement | null
}

export default function SoundwaveVisualizer({ isPlaying }: SoundwaveVisualizerProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const animationRef = useRef<number | null>(null)
  const [frequencyData, setFrequencyData] = useState<number[] | null>(null)
  
  // Random heights for animated fallback effect
  const randomHeightsRef = useRef<number[]>(Array(32).fill(0).map(() => Math.random()))

  // Listen for frequency data from global audio player
  useEffect(() => {
    const handleFrequency = (e: CustomEvent<{ frequencyData: number[] | null }>) => {
      setFrequencyData(e.detail.frequencyData)
    }

    window.addEventListener('hubba-audio-frequency', handleFrequency as EventListener)
    return () => window.removeEventListener('hubba-audio-frequency', handleFrequency as EventListener)
  }, [])

  // Animation loop
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const barCount = 32
    const barWidth = (canvas.width / barCount) - 2
    const maxBarHeight = canvas.height * 0.85

    const draw = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height)

      if (isPlaying && frequencyData && frequencyData.length > 0) {
        // Real audio visualization from global player
        const step = Math.max(1, Math.floor(frequencyData.length / barCount))
        
        for (let i = 0; i < barCount; i++) {
          const dataIndex = Math.min(i * step, frequencyData.length - 1)
          const value = frequencyData[dataIndex] || 0
          const barHeight = Math.max(4, (value / 255) * maxBarHeight)
          const x = i * (barWidth + 2)
          const y = (canvas.height - barHeight) / 2

          // Gradient from neon green to teal
          const gradient = ctx.createLinearGradient(0, y, 0, y + barHeight)
          gradient.addColorStop(0, '#39FF14')
          gradient.addColorStop(0.5, '#00D9FF')
          gradient.addColorStop(1, '#39FF14')

          ctx.fillStyle = gradient
          ctx.fillRect(x, y, barWidth, barHeight)
        }
      } else if (isPlaying) {
        // Animated fallback bars when playing but no frequency data available
        for (let i = 0; i < barCount; i++) {
          // Animate random heights smoothly
          const targetHeight = 0.2 + Math.random() * 0.6
          randomHeightsRef.current[i] += (targetHeight - randomHeightsRef.current[i]) * 0.15
          
          const barHeight = Math.max(4, randomHeightsRef.current[i] * maxBarHeight)
          const x = i * (barWidth + 2)
          const y = (canvas.height - barHeight) / 2

          const gradient = ctx.createLinearGradient(0, y, 0, y + barHeight)
          gradient.addColorStop(0, '#39FF14')
          gradient.addColorStop(0.5, '#00D9FF')
          gradient.addColorStop(1, '#39FF14')

          ctx.fillStyle = gradient
          ctx.fillRect(x, y, barWidth, barHeight)
        }
      } else {
        // Static idle bars when paused
        for (let i = 0; i < barCount; i++) {
          const barHeight = 4
          const x = i * (barWidth + 2)
          const y = (canvas.height - barHeight) / 2

          ctx.fillStyle = '#444'
          ctx.fillRect(x, y, barWidth, barHeight)
        }
      }

      animationRef.current = requestAnimationFrame(draw)
    }

    draw()

    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current)
      }
    }
  }, [isPlaying, frequencyData])

  return (
    <div className="w-full flex items-center justify-center px-4 py-2">
      <canvas
        ref={canvasRef}
        width={320}
        height={60}
        className="rounded-lg"
        style={{
          width: '100%',
          maxWidth: '320px',
          height: '60px',
          background: 'linear-gradient(180deg, rgba(0,0,0,0.4) 0%, rgba(0,0,0,0.2) 100%)',
          border: '1px solid rgba(57, 255, 20, 0.2)',
        }}
      />
    </div>
  )
}
