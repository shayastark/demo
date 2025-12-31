'use client'

import { useEffect, useRef, useCallback, useState } from 'react'

interface SoundwaveVisualizerProps {
  audioElement: HTMLAudioElement | null
  isPlaying: boolean
}

export default function SoundwaveVisualizer({ audioElement, isPlaying }: SoundwaveVisualizerProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const animationRef = useRef<number | null>(null)
  const analyserRef = useRef<AnalyserNode | null>(null)
  const audioContextRef = useRef<AudioContext | null>(null)
  const [hasAnalyser, setHasAnalyser] = useState(false)
  const initAttemptedRef = useRef(false)

  // Initialize audio context when audio element is available and playing
  const initializeAudioContext = useCallback(() => {
    if (!audioElement || initAttemptedRef.current) return
    
    initAttemptedRef.current = true

    try {
      // Check if already initialized
      if ((audioElement as any)._audioContext) {
        audioContextRef.current = (audioElement as any)._audioContext
        analyserRef.current = (audioElement as any)._analyser
        setHasAnalyser(true)
        return
      }

      const AudioContext = window.AudioContext || (window as any).webkitAudioContext
      if (!AudioContext) {
        console.warn('Web Audio API not supported')
        return
      }

      const audioContext = new AudioContext()
      audioContextRef.current = audioContext

      const analyser = audioContext.createAnalyser()
      analyser.fftSize = 64
      analyser.smoothingTimeConstant = 0.85
      analyserRef.current = analyser

      const source = audioContext.createMediaElementSource(audioElement)
      source.connect(analyser)
      analyser.connect(audioContext.destination)

      // Store references on the audio element
      ;(audioElement as any)._audioContext = audioContext
      ;(audioElement as any)._analyser = analyser

      setHasAnalyser(true)
    } catch (error) {
      console.warn('Could not initialize audio visualizer:', error)
      // Continue without visualization
    }
  }, [audioElement])

  // Try to initialize when playing starts
  useEffect(() => {
    if (isPlaying && audioElement && !initAttemptedRef.current) {
      // Resume audio context if suspended
      if (audioContextRef.current?.state === 'suspended') {
        audioContextRef.current.resume()
      }
      initializeAudioContext()
    }
  }, [isPlaying, audioElement, initializeAudioContext])

  // Random heights for animated effect when no analyser
  const randomHeightsRef = useRef<number[]>(Array(32).fill(0).map(() => Math.random()))

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

      if (isPlaying && hasAnalyser && analyserRef.current) {
        // Real audio visualization
        const bufferLength = analyserRef.current.frequencyBinCount
        const dataArray = new Uint8Array(bufferLength)
        analyserRef.current.getByteFrequencyData(dataArray)

        // Map frequency data to our bar count
        const step = Math.floor(bufferLength / barCount)
        
        for (let i = 0; i < barCount; i++) {
          const dataIndex = i * step
          const value = dataArray[dataIndex] || 0
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
        // Animated bars when playing but no analyser available
        for (let i = 0; i < barCount; i++) {
          // Animate random heights
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
  }, [isPlaying, hasAnalyser])

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
