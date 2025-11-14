'use client'

import { useEffect, useRef } from 'react'

interface Props {
  meetingId: string
}

export const GeminiAudioPlayer = ({ meetingId }: Props) => {
  const audioRef = useRef<HTMLAudioElement | null>(null) 
  const lastPlayedUrlRef = useRef<string | null>(null)
  const isPlayingRef = useRef<boolean>(false)

  useEffect(() => {
    if (!meetingId) return

    if (!audioRef.current) {
      const el = new Audio()
      el.preload = 'auto'
      el.autoplay = true
      el.crossOrigin = 'anonymous'
      el.style.display = 'none'
      document.body.appendChild(el)
      el.addEventListener('playing', () => (isPlayingRef.current = true))
      el.addEventListener('ended', () => (isPlayingRef.current = false))
      el.addEventListener('pause', () => (isPlayingRef.current = false))
      audioRef.current = el
    }

    const audio = audioRef.current 

    const pollInterval = setInterval(async () => {
      try {
        const response = await fetch(`/api/gemini-audio/${meetingId}`)

        if (!response.ok) return

        const data = await response.json()

        if (data.text && !data.audioUrl) {
          console.log(
            '[Gemini Audio Player] Text response (no audio):',
            data.text
          )
        } 

        if (data.audioUrl && data.audioUrl !== lastPlayedUrlRef.current) {
          const srcUrl = `${data.audioUrl}?t=${Date.now()}`
          console.log(`[Gemini Audio Player] Playing new audio: ${srcUrl}`) 
          lastPlayedUrlRef.current = data.audioUrl

          if (audio.src !== srcUrl) {
            if (isPlayingRef.current) {
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
    }, 1500) 

    return () => {
      clearInterval(pollInterval)
      if (audioRef.current) {
        audioRef.current.pause()
        audioRef.current.src = ''
      }
    } 
  }, [meetingId])

  return null
}
