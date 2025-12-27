'use client'

import { useState, useRef, useEffect } from 'react'
import { X } from 'lucide-react'

interface AudioEditorProps {
  src: string
  title: string
  isOpen: boolean
  onClose: () => void
  audioElement: HTMLAudioElement | null
}

export default function AudioEditor({ src, title, isOpen, audioElement, onClose }: AudioEditorProps) {
  const [activeTab, setActiveTab] = useState<'adjust' | 'eq'>('adjust')
  const [speed, setSpeed] = useState(100) // Percentage (100% = normal speed)
  const [pitch, setPitch] = useState(0) // Semitones (0 = no change)
  const [eqBands, setEqBands] = useState([0, 0, 0, 0, 0, 0, 0, 0, 0, 0]) // 10-band EQ values in dB
  const [eqBypass, setEqBypass] = useState(false)
  const audioContextRef = useRef<AudioContext | null>(null)
  const sourceNodeRef = useRef<MediaElementAudioSourceNode | null>(null)
  const gainNodeRef = useRef<GainNode | null>(null)
  const eqNodesRef = useRef<BiquadFilterNode[]>([])

  // Initialize Web Audio API
  useEffect(() => {
    if (!audioElement || !isOpen) return

    try {
      const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)()
      audioContextRef.current = audioContext

      const source = audioContext.createMediaElementSource(audioElement)
      sourceNodeRef.current = source

      // Create gain node for speed/pitch control
      const gainNode = audioContext.createGain()
      gainNodeRef.current = gainNode

      // Create EQ filters (10-band parametric EQ)
      const frequencies = [31, 62, 125, 250, 500, 1000, 2000, 4000, 8000, 16000]
      const eqNodes = frequencies.map(freq => {
        const filter = audioContext.createBiquadFilter()
        filter.type = 'peaking'
        filter.frequency.value = freq
        filter.Q.value = 1
        filter.gain.value = 0
        return filter
      })
      eqNodesRef.current = eqNodes

      // Connect: source -> gain -> EQ chain -> destination
      source.connect(gainNode)
      let currentNode: AudioNode = gainNode
      eqNodes.forEach(node => {
        currentNode.connect(node)
        currentNode = node
      })
      currentNode.connect(audioContext.destination)

      return () => {
        // Cleanup
        source.disconnect()
        gainNode.disconnect()
        eqNodes.forEach(node => node.disconnect())
      }
    } catch (error) {
      console.error('Error initializing audio context:', error)
    }
  }, [audioElement, isOpen])

  // Apply speed and pitch changes
  useEffect(() => {
    if (!audioElement) return
    // Pitch shift: 2^(semitones/12) = playback rate multiplier
    const pitchMultiplier = Math.pow(2, pitch / 12)
    // Combine speed and pitch
    audioElement.playbackRate = (speed / 100) * pitchMultiplier
  }, [pitch, speed, audioElement])

  // Apply EQ changes
  useEffect(() => {
    if (!eqNodesRef.current.length) return
    eqNodesRef.current.forEach((node, index) => {
      node.gain.value = eqBypass ? 0 : eqBands[index]
    })
  }, [eqBands, eqBypass])

  if (!isOpen) return null

  // EQ frequency bands (Hz)
  const eqFrequencies = [31, 62, 125, 250, 500, 1000, 2000, 4000, 8000, 16000]
  const eqLabels = ['31', '62', '125', '250', '500', '1k', '2k', '4k', '8k', '16k']

  return (
    <div className="fixed inset-0 bg-black bg-opacity-90 z-50 flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-800">
        <button
          onClick={onClose}
          className="text-white text-sm font-medium"
        >
          Cancel
        </button>
        <div className="flex-1 text-center">
          <div className="text-white font-semibold text-sm">{title}</div>
        </div>
        <button
          onClick={onClose}
          className="text-white text-sm font-medium"
        >
          Save
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto px-4 py-6">
        {/* Tabs */}
        <div className="flex gap-2 mb-6">
          <button
            onClick={() => setActiveTab('adjust')}
            className={`flex-1 py-2 px-4 rounded-lg text-sm font-medium transition ${
              activeTab === 'adjust'
                ? 'bg-white text-black'
                : 'bg-gray-900 text-white'
            }`}
          >
            Adjust
          </button>
          <button
            onClick={() => setActiveTab('eq')}
            className={`flex-1 py-2 px-4 rounded-lg text-sm font-medium transition ${
              activeTab === 'eq'
                ? 'bg-white text-black'
                : 'bg-gray-900 text-white'
            }`}
          >
            EQ
          </button>
        </div>

        {/* Adjust Tab */}
        {activeTab === 'adjust' && (
          <div className="space-y-6">
            {/* Speed Control */}
            <div>
              <div className="flex items-center justify-between mb-3">
                <label className="text-white text-sm font-medium">Speed</label>
                <span className="text-neon-green text-sm font-mono">{speed}%</span>
              </div>
              <div className="relative">
                <input
                  type="range"
                  min="25"
                  max="200"
                  value={speed}
                  onChange={(e) => setSpeed(Number(e.target.value))}
                  className="w-full h-2 bg-gray-800 rounded-lg appearance-none cursor-pointer accent-neon-green"
                  style={{
                    background: `linear-gradient(to right, #39FF14 0%, #39FF14 ${((speed - 25) / 175) * 100}%, #1f2937 ${((speed - 25) / 175) * 100}%, #1f2937 100%)`
                  }}
                />
                {/* Markers */}
                <div className="absolute top-0 left-0 right-0 h-2 flex justify-between pointer-events-none">
                  {[25, 50, 75, 100, 125, 150, 175, 200].map((value) => (
                    <div
                      key={value}
                      className="w-0.5 h-full bg-white opacity-30"
                      style={{ marginLeft: value === 25 ? '0' : value === 200 ? '0' : 'calc((100% / 7) - 1px)' }}
                    />
                  ))}
                </div>
              </div>
            </div>

            {/* Pitch Control */}
            <div>
              <div className="flex items-center justify-between mb-3">
                <label className="text-white text-sm font-medium">Pitch</label>
                <span className="text-neon-green text-sm font-mono">
                  {pitch > 0 ? '+' : ''}{pitch} st
                </span>
              </div>
              <div className="relative">
                <input
                  type="range"
                  min="-24"
                  max="24"
                  value={pitch}
                  onChange={(e) => setPitch(Number(e.target.value))}
                  className="w-full h-2 bg-gray-800 rounded-lg appearance-none cursor-pointer accent-neon-green"
                  style={{
                    background: `linear-gradient(to right, #1f2937 0%, #1f2937 ${((pitch + 24) / 48) * 100}%, #39FF14 ${((pitch + 24) / 48) * 100}%, #39FF14 100%)`
                  }}
                />
                {/* Markers */}
                <div className="absolute top-0 left-0 right-0 h-2 flex justify-between pointer-events-none">
                  {[-24, -18, -12, -6, 0, 6, 12, 18, 24].map((value) => (
                    <div
                      key={value}
                      className="w-0.5 h-full bg-white opacity-30"
                    />
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* EQ Tab */}
        {activeTab === 'eq' && (
          <div className="space-y-6">
            {/* EQ Header */}
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-white text-sm font-medium">Equalizer</h3>
              <button
                onClick={() => setEqBypass(!eqBypass)}
                className={`px-4 py-1.5 rounded-lg text-xs font-medium transition ${
                  eqBypass
                    ? 'bg-neon-green text-black'
                    : 'bg-gray-800 text-white'
                }`}
              >
                {eqBypass ? 'BYPASS' : 'BYPASS'}
              </button>
            </div>

            {/* EQ Graph */}
            <div className="bg-gray-900 rounded-lg p-4 mb-4" style={{ height: '200px' }}>
              <svg width="100%" height="100%" viewBox="0 0 400 150" className="overflow-visible">
                {/* Grid lines */}
                <line x1="0" y1="75" x2="400" y2="75" stroke="#374151" strokeWidth="1" strokeDasharray="2,2" />
                {[0, 25, 50, 75, 100, 125, 150].map(y => (
                  <line key={y} x1="0" y1={y} x2="400" y2={y} stroke="#1f2937" strokeWidth="0.5" />
                ))}

                {/* EQ Curve */}
                <polyline
                  points={eqBands.map((gain, index) => {
                    const x = (index / (eqBands.length - 1)) * 400
                    const y = 75 - (gain * 2) // Scale: 1dB = 2px, center at 75
                    return `${x},${y}`
                  }).join(' ')}
                  fill="none"
                  stroke="#39FF14"
                  strokeWidth="2"
                />

                {/* Control Points */}
                {eqBands.map((gain, index) => {
                  const x = (index / (eqBands.length - 1)) * 400
                  const y = 75 - (gain * 2)
                  return (
                    <circle
                      key={index}
                      cx={x}
                      cy={y}
                      r="6"
                      fill="#39FF14"
                      stroke="#000"
                      strokeWidth="1"
                      className="cursor-pointer touch-none"
                      onMouseDown={(e) => {
                        e.preventDefault()
                        const startY = e.clientY
                        const startGain = gain
                        const handleMove = (moveEvent: MouseEvent | TouchEvent) => {
                          const clientY = 'touches' in moveEvent ? moveEvent.touches[0].clientY : moveEvent.clientY
                          const deltaY = startY - clientY
                          const newGain = Math.max(-12, Math.min(12, startGain + deltaY / 2))
                          const newBands = [...eqBands]
                          newBands[index] = newGain
                          setEqBands(newBands)
                        }
                        const handleUp = () => {
                          document.removeEventListener('mousemove', handleMove as EventListener)
                          document.removeEventListener('mouseup', handleUp)
                          document.removeEventListener('touchmove', handleMove as EventListener)
                          document.removeEventListener('touchend', handleUp)
                        }
                        document.addEventListener('mousemove', handleMove as EventListener)
                        document.addEventListener('mouseup', handleUp)
                        document.addEventListener('touchmove', handleMove as EventListener, { passive: false })
                        document.addEventListener('touchend', handleUp)
                      }}
                      onTouchStart={(e) => {
                        e.preventDefault()
                        const startY = e.touches[0].clientY
                        const startGain = gain
                        const handleMove = (moveEvent: TouchEvent) => {
                          const clientY = moveEvent.touches[0].clientY
                          const deltaY = startY - clientY
                          const newGain = Math.max(-12, Math.min(12, startGain + deltaY / 2))
                          const newBands = [...eqBands]
                          newBands[index] = newGain
                          setEqBands(newBands)
                        }
                        const handleUp = () => {
                          document.removeEventListener('touchmove', handleMove)
                          document.removeEventListener('touchend', handleUp)
                        }
                        document.addEventListener('touchmove', handleMove, { passive: false })
                        document.addEventListener('touchend', handleUp)
                      }}
                    />
                  )
                })}
              </svg>
            </div>

            {/* EQ Band Sliders */}
            <div className="space-y-3">
              {eqBands.map((gain, index) => (
                <div key={index}>
                  <div className="flex items-center justify-between mb-2">
                    <label className="text-white text-xs">{eqLabels[index]}</label>
                    <span className="text-neon-green text-xs font-mono">
                      {gain > 0 ? '+' : ''}{gain.toFixed(1)} dB
                    </span>
                  </div>
                  <input
                    type="range"
                    min="-12"
                    max="12"
                    step="0.1"
                    value={gain}
                    onChange={(e) => {
                      const newBands = [...eqBands]
                      newBands[index] = Number(e.target.value)
                      setEqBands(newBands)
                    }}
                    className="w-full h-1.5 bg-gray-800 rounded-lg appearance-none cursor-pointer accent-neon-green"
                    style={{
                      background: `linear-gradient(to right, #1f2937 0%, #1f2937 ${((gain + 12) / 24) * 100}%, #39FF14 ${((gain + 12) / 24) * 100}%, #39FF14 100%)`
                    }}
                  />
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

