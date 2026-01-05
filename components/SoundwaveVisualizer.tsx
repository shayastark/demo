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
  
  // History of amplitude values for scrolling effect
  const waveHistoryRef = useRef<number[]>([])
  const maxHistoryLength = 200 // Number of points in the waveform
  
  // Time offset for animated fallback
  const timeOffsetRef = useRef(0)

  // Listen for frequency data from global audio player
  useEffect(() => {
    const handleFrequency = (e: CustomEvent<{ frequencyData: number[] | null }>) => {
      setFrequencyData(e.detail.frequencyData)
    }

    window.addEventListener('hubba-audio-frequency', handleFrequency as EventListener)
    return () => window.removeEventListener('hubba-audio-frequency', handleFrequency as EventListener)
  }, [])

  // Initialize wave history
  useEffect(() => {
    if (waveHistoryRef.current.length === 0) {
      waveHistoryRef.current = Array(maxHistoryLength).fill(0)
    }
  }, [])

  // Animation loop
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const width = canvas.width
    const height = canvas.height
    const centerY = height / 2
    const maxAmplitude = height * 0.4 // Max wave height from center

    const draw = () => {
      // Clear canvas
      ctx.clearRect(0, 0, width, height)

      if (isPlaying) {
        let newAmplitude: number

        if (frequencyData && frequencyData.length > 0) {
          // Calculate average amplitude from frequency data
          const sum = frequencyData.reduce((acc, val) => acc + val, 0)
          const avg = sum / frequencyData.length
          newAmplitude = (avg / 255) * maxAmplitude
          
          // Add some variation based on bass frequencies for more dynamic feel
          const bassSum = frequencyData.slice(0, 10).reduce((acc, val) => acc + val, 0)
          const bassAvg = bassSum / 10
          newAmplitude = Math.max(newAmplitude, (bassAvg / 255) * maxAmplitude * 1.2)
        } else {
          // Animated fallback - smooth wave pattern
          timeOffsetRef.current += 0.08
          const baseWave = Math.sin(timeOffsetRef.current) * 0.3
          const secondWave = Math.sin(timeOffsetRef.current * 1.5) * 0.2
          const thirdWave = Math.sin(timeOffsetRef.current * 2.3) * 0.15
          newAmplitude = (0.3 + baseWave + secondWave + thirdWave) * maxAmplitude
        }

        // Add new amplitude to history (at the end/right side)
        waveHistoryRef.current.push(newAmplitude)
        
        // Remove oldest amplitude (from the beginning/left side) if over limit
        if (waveHistoryRef.current.length > maxHistoryLength) {
          waveHistoryRef.current.shift()
        }
      }

      // Draw the scrolling waveform
      const history = waveHistoryRef.current
      const pointSpacing = width / (maxHistoryLength - 1)

      // Create gradient for the fill
      const gradient = ctx.createLinearGradient(0, 0, width, 0)
      gradient.addColorStop(0, 'rgba(57, 255, 20, 0.1)') // Faded on left (older)
      gradient.addColorStop(0.5, 'rgba(57, 255, 20, 0.4)')
      gradient.addColorStop(1, 'rgba(57, 255, 20, 0.8)') // Bright on right (newer)

      // Draw top half (mirrored waveform going up)
      ctx.beginPath()
      ctx.moveTo(0, centerY)
      
      for (let i = 0; i < history.length; i++) {
        const x = i * pointSpacing
        const amplitude = history[i] || 0
        const y = centerY - amplitude
        
        if (i === 0) {
          ctx.lineTo(x, y)
        } else {
          // Smooth curve using quadratic bezier
          const prevX = (i - 1) * pointSpacing
          const cpX = (prevX + x) / 2
          ctx.quadraticCurveTo(prevX, centerY - (history[i - 1] || 0), cpX, (centerY - (history[i - 1] || 0) + y) / 2)
        }
      }
      
      // Complete the top path back to center for fill
      ctx.lineTo(width, centerY)
      ctx.closePath()
      ctx.fillStyle = gradient
      ctx.fill()

      // Draw bottom half (mirrored waveform going down)
      ctx.beginPath()
      ctx.moveTo(0, centerY)
      
      for (let i = 0; i < history.length; i++) {
        const x = i * pointSpacing
        const amplitude = history[i] || 0
        const y = centerY + amplitude
        
        if (i === 0) {
          ctx.lineTo(x, y)
        } else {
          const prevX = (i - 1) * pointSpacing
          const cpX = (prevX + x) / 2
          ctx.quadraticCurveTo(prevX, centerY + (history[i - 1] || 0), cpX, (centerY + (history[i - 1] || 0) + y) / 2)
        }
      }
      
      ctx.lineTo(width, centerY)
      ctx.closePath()
      ctx.fillStyle = gradient
      ctx.fill()

      // Draw the waveform outline for more definition
      const lineGradient = ctx.createLinearGradient(0, 0, width, 0)
      lineGradient.addColorStop(0, 'rgba(57, 255, 20, 0.2)')
      lineGradient.addColorStop(0.5, 'rgba(57, 255, 20, 0.6)')
      lineGradient.addColorStop(1, 'rgba(57, 255, 20, 1)')

      // Top line
      ctx.beginPath()
      ctx.moveTo(0, centerY)
      for (let i = 0; i < history.length; i++) {
        const x = i * pointSpacing
        const amplitude = history[i] || 0
        const y = centerY - amplitude
        
        if (i === 0) {
          ctx.lineTo(x, y)
        } else {
          const prevX = (i - 1) * pointSpacing
          const cpX = (prevX + x) / 2
          ctx.quadraticCurveTo(prevX, centerY - (history[i - 1] || 0), cpX, (centerY - (history[i - 1] || 0) + y) / 2)
        }
      }
      ctx.strokeStyle = lineGradient
      ctx.lineWidth = 2
      ctx.stroke()

      // Bottom line
      ctx.beginPath()
      ctx.moveTo(0, centerY)
      for (let i = 0; i < history.length; i++) {
        const x = i * pointSpacing
        const amplitude = history[i] || 0
        const y = centerY + amplitude
        
        if (i === 0) {
          ctx.lineTo(x, y)
        } else {
          const prevX = (i - 1) * pointSpacing
          const cpX = (prevX + x) / 2
          ctx.quadraticCurveTo(prevX, centerY + (history[i - 1] || 0), cpX, (centerY + (history[i - 1] || 0) + y) / 2)
        }
      }
      ctx.strokeStyle = lineGradient
      ctx.lineWidth = 2
      ctx.stroke()

      // Draw center line
      ctx.beginPath()
      ctx.moveTo(0, centerY)
      ctx.lineTo(width, centerY)
      ctx.strokeStyle = 'rgba(57, 255, 20, 0.3)'
      ctx.lineWidth = 1
      ctx.stroke()

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
        width={400}
        height={80}
        className="rounded-lg"
        style={{
          width: '100%',
          maxWidth: '400px',
          height: '80px',
          background: 'linear-gradient(180deg, rgba(0,0,0,0.5) 0%, rgba(0,0,0,0.3) 100%)',
          border: '1px solid rgba(57, 255, 20, 0.2)',
        }}
      />
    </div>
  )
}
