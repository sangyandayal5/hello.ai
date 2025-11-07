'use client'

import { useEffect, useRef, useState } from 'react'
import { useCall } from '@stream-io/video-react-sdk'

interface Props {
  meetingId: string
}

/**
 * Component that listens for Gemini audio responses and plays them automatically
 * Uses API polling to check for new audio responses
 */
export const GeminiAudioPlayer = ({ meetingId }: Props) => {
  const call = useCall()
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const [lastPlayedUrl, setLastPlayedUrl] = useState<string | null>(null)
  const [isPlaying, setIsPlaying] = useState<boolean>(false)

  useEffect(() => {
    if (!meetingId) return

    // Create audio element if it doesn't exist
    if (!audioRef.current) {
      const el = new Audio()
      el.preload = 'auto'
      el.autoplay = true
      el.crossOrigin = 'anonymous'
      el.style.display = 'none'
      document.body.appendChild(el)
      el.addEventListener('playing', () => setIsPlaying(true))
      el.addEventListener('ended', () => setIsPlaying(false))
      el.addEventListener('pause', () => setIsPlaying(false))
      audioRef.current = el
    }

    const audio = audioRef.current

    // Poll API for new audio responses
    const pollInterval = setInterval(async () => {
      try {
        const response = await fetch(`/api/gemini-audio/${meetingId}`)

        if (!response.ok) {
          return
        }

        const data = await response.json()

        if (data.text && !data.audioUrl) {
          console.log(
            '[Gemini Audio Player] Text response (no audio):',
            data.text
          )
        }

        if (data.audioUrl && data.audioUrl !== lastPlayedUrl) {
          // Cache-bust the file URL to avoid stale responses
          const srcUrl = `${data.audioUrl}?t=${Date.now()}`
          console.log(`[Gemini Audio Player] Playing new audio: ${srcUrl}`)
          setLastPlayedUrl(data.audioUrl)

          // Play the audio
          if (audio.src !== srcUrl) {
            if (isPlaying) {
              console.log(
                '[Gemini Audio Player] Currently playing; delaying swap'
              )
              const onEnded = async () => {
                audio.removeEventListener('ended', onEnded)
                audio.src = srcUrl
                try {
                  audio.load()
                  await audio.play()
                } catch (error) {
                  console.error(
                    '[Gemini Audio Player] Error playing audio after end:',
                    error
                  )
                }
              }
              audio.addEventListener('ended', onEnded)
            } else {
              audio.src = srcUrl
              try {
                audio.load()
                await audio.play()
              } catch (error) {
                console.error(
                  '[Gemini Audio Player] Error playing audio (autoplay may be blocked):',
                  error
                )
              }
            }
          }
        }
      } catch (error) {
        console.error('[Gemini Audio Player] Error polling:', error)
      }
    }, 1500) // Slightly slower polling to reduce contention

    // Cleanup
    return () => {
      clearInterval(pollInterval)
      if (audioRef.current) {
        audioRef.current.pause()
        audioRef.current.src = ''
      }
    }
  }, [meetingId, lastPlayedUrl, isPlaying])

  // Render nothing - this is a hidden component
  return null
}
