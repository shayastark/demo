'use client'

import { useEffect, useRef, useState } from 'react'

interface SoundwaveVisualizerProps {
  audioElement: HTMLAudioElement | null
  isPlaying: boolean
}

export default function SoundwaveVisualizer({ audioElement, isPlaying }: SoundwaveVisualizerProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const animationRef = useRef<number | null>(null)
  const analyserRef = useRef<AnalyserNode | null>(null)
  const audioContextRef = useRef<AudioContext | null>(null)
  const sourceRef = useRef<MediaElementAudioSourceNode | null>(null)
  const [isInitialized, setIsInitialized] = useState(false)

  useEffect(() => {
    if (!audioElement || isInitialized) return

    try {
      // Check if audio element already has a source connected
      if ((audioElement as any)._hasAudioContext) {
        setIsInitialized(true)
        return
      }

      const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)()
      audioContextRef.current = audioContext

      const analyser = audioContext.createAnalyser()
      analyser.fftSize = 128
      analyser.smoothingTimeConstant = 0.8
      analyserRef.current = analyser

      const source = audioContext.createMediaElementSource(audioElement)
      sourceRef.current = source
      source.connect(analyser)
      analyser.connect(audioContext.destination)

      // Mark the audio element as having a context
      ;(audioElement as any)._hasAudioContext = true

      setIsInitialized(true)
    } catch (error) {
      console.error('Error initializing audio context:', error)
      setIsInitialized(true) // Still set to true to prevent re-attempts
    }

    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current)
      }
    }
  }, [audioElement, isInitialized])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const draw = () => {
      const width = canvas.width
      const height = canvas.height

      ctx.clearRect(0, 0, width, height)

      if (analyserRef.current && isPlaying) {
        const bufferLength = analyserRef.current.frequencyBinCount
        const dataArray = new Uint8Array(bufferLength)
        analyserRef.current.getByteFrequencyData(dataArray)

        const barWidth = width / bufferLength
        const barSpacing = 2

        for (let i = 0; i < bufferLength; i++) {
          const barHeight = (dataArray[i] / 255) * height * 0.9
          const x = i * (barWidth + barSpacing)
          const y = (height - barHeight) / 2

          // Create gradient for each bar
          const gradient = ctx.createLinearGradient(0, y, 0, y + barHeight)
          gradient.addColorStop(0, '#39FF14')
          gradient.addColorStop(0.5, '#00D9FF')
          gradient.addColorStop(1, '#39FF14')

          ctx.fillStyle = gradient
          ctx.fillRect(x, y, barWidth, barHeight)
        }
      } else {
        // Draw idle bars when not playing
        const barCount = 32
        const barWidth = width / barCount - 2

        for (let i = 0; i < barCount; i++) {
          const baseHeight = 4
          const x = i * (barWidth + 2)
          const y = (height - baseHeight) / 2

          ctx.fillStyle = '#333'
          ctx.fillRect(x, y, barWidth, baseHeight)
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
  }, [isPlaying])

  return (
    <div className="w-full h-16 flex items-center justify-center px-4">
      <canvas
        ref={canvasRef}
        width={320}
        height={50}
        style={{
          width: '100%',
          maxWidth: '320px',
          height: '50px',
          borderRadius: '8px',
          background: 'rgba(0, 0, 0, 0.3)',
        }}
      />
    </div>
  )
}

