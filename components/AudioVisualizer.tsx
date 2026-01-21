'use client'

import { useEffect, useRef, useState } from 'react'

interface AudioVisualizerProps {
  isPlaying: boolean
}

export default function AudioVisualizer({ isPlaying }: AudioVisualizerProps) {
  const [frequencyData, setFrequencyData] = useState<number[] | null>(null)
  const animationRef = useRef<number | null>(null)
  const barsRef = useRef<number[]>(Array(24).fill(0))
  const [bars, setBars] = useState<number[]>(Array(24).fill(0))

  // Listen for frequency data from global audio player
  useEffect(() => {
    const handleFrequency = (e: CustomEvent<{ frequencyData: number[] | null }>) => {
      setFrequencyData(e.detail.frequencyData)
    }

    window.addEventListener('demo-audio-frequency', handleFrequency as EventListener)
    return () => window.removeEventListener('demo-audio-frequency', handleFrequency as EventListener)
  }, [])

  // Animation loop for smooth bar transitions
  useEffect(() => {
    const numBars = 24
    const timeOffsetRef = { value: 0 }

    const animate = () => {
      if (isPlaying) {
        const targetBars: number[] = []

        if (frequencyData && frequencyData.length > 0) {
          // Map frequency data to our bars
          const step = Math.floor(frequencyData.length / numBars)
          for (let i = 0; i < numBars; i++) {
            const startIdx = i * step
            const endIdx = Math.min(startIdx + step, frequencyData.length)
            let sum = 0
            for (let j = startIdx; j < endIdx; j++) {
              sum += frequencyData[j]
            }
            const avg = sum / (endIdx - startIdx)
            targetBars.push(avg / 255)
          }
        } else {
          // Animated fallback - smooth wave pattern
          timeOffsetRef.value += 0.05
          for (let i = 0; i < numBars; i++) {
            const wave1 = Math.sin(timeOffsetRef.value + i * 0.3) * 0.3
            const wave2 = Math.sin(timeOffsetRef.value * 1.5 + i * 0.2) * 0.2
            const wave3 = Math.sin(timeOffsetRef.value * 0.7 + i * 0.4) * 0.15
            targetBars.push(0.25 + wave1 + wave2 + wave3)
          }
        }

        // Smooth transition
        const newBars = barsRef.current.map((current, i) => {
          const target = Math.max(0.05, targetBars[i] || 0)
          // Smooth interpolation - faster rise, slower fall
          if (target > current) {
            return current + (target - current) * 0.3
          } else {
            return current + (target - current) * 0.1
          }
        })

        barsRef.current = newBars
        setBars([...newBars])
      } else {
        // When paused, gradually lower bars
        const newBars = barsRef.current.map(current => {
          return Math.max(0.05, current * 0.95)
        })
        barsRef.current = newBars
        setBars([...newBars])
      }

      animationRef.current = requestAnimationFrame(animate)
    }

    animate()

    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current)
      }
    }
  }, [isPlaying, frequencyData])

  return (
    <div className="flex items-end justify-center gap-[3px] h-12 px-4">
      {bars.map((height, i) => (
        <div
          key={i}
          className="rounded-full transition-all duration-75"
          style={{
            width: '4px',
            height: `${Math.max(4, height * 48)}px`,
            background: isPlaying 
              ? `linear-gradient(to top, #39FF14, #00D9FF)`
              : '#374151',
            opacity: isPlaying ? 0.8 + (height * 0.2) : 0.3,
            boxShadow: isPlaying && height > 0.3 
              ? '0 0 8px rgba(57, 255, 20, 0.4)' 
              : 'none',
          }}
        />
      ))}
    </div>
  )
}
