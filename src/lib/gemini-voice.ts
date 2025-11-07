import 'server-only'

import { GoogleGenerativeAI } from '@google/generative-ai'
import speech from '@google-cloud/speech'
import tts from '@google-cloud/text-to-speech'
import { Call } from '@stream-io/node-sdk'
import { writeFile, mkdir } from 'fs/promises'
import { join } from 'path'
import { existsSync } from 'fs'

// Initialize clients
let speechClient: speech.SpeechClient | null = null
let ttsClient: tts.TextToSpeechClient | null = null
let geminiClient: GoogleGenerativeAI | null = null

function getSpeechClient() {
  if (!speechClient) {
    speechClient = new speech.SpeechClient({
      keyFilename: process.env.GOOGLE_CLOUD_KEYFILE,
      projectId: process.env.GOOGLE_CLOUD_PROJECT_ID,
    })
  }
  return speechClient
}

function getTTSClient() {
  // TTS is optional - only needed if you want to convert text to audio
  // If not configured, responses will be text-only
  if (
    !process.env.GOOGLE_CLOUD_KEYFILE &&
    !process.env.GOOGLE_CLOUD_PROJECT_ID
  ) {
    return null
  }
  if (!ttsClient) {
    ttsClient = new tts.TextToSpeechClient({
      keyFilename: process.env.GOOGLE_CLOUD_KEYFILE,
      projectId: process.env.GOOGLE_CLOUD_PROJECT_ID,
    })
  }
  return ttsClient
}

function getGeminiClient() {
  const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_GENAI_API_KEY
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY or GOOGLE_GENAI_API_KEY is required')
  }
  if (!geminiClient) {
    geminiClient = new GoogleGenerativeAI(apiKey)
  }
  return geminiClient
}

interface GeminiVoiceSession {
  call: Call
  agentUserId: string
  instructions: string
  conversationHistory: Array<{ role: string; content: string }>
  isProcessing: boolean
  audioResponses: Array<{ text: string; audioUrl: string; timestamp: Date }>
}

// Audio storage directory
const AUDIO_STORAGE_DIR = join(process.cwd(), 'public', 'audio-responses')

async function ensureAudioDir() {
  if (!existsSync(AUDIO_STORAGE_DIR)) {
    await mkdir(AUDIO_STORAGE_DIR, { recursive: true })
  }
}

export class GeminiVoiceService {
  private sessions: Map<string, GeminiVoiceSession> = new Map()

  /**
   * Start a Gemini-powered voice session for a Stream Video call
   * This uses multiple Google APIs working together:
   * 1. Stream Video transcription (already enabled) → provides text
   * 2. Gemini API → processes text and generates responses
   * 3. Google Cloud Text-to-Speech → converts text to audio
   * 4. Stream Video → streams audio back to participants
   */
  async startSession(
    call: Call,
    agentUserId: string,
    instructions: string
  ): Promise<void> {
    const sessionId = call.id

    // Store session
    this.sessions.set(sessionId, {
      call,
      agentUserId,
      instructions,
      conversationHistory: [],
      isProcessing: false,
      audioResponses: [],
    })

    // Set up transcription listener
    // Stream Video will send transcription events via webhook
    // We'll process them in the webhook handler
    console.log(`[Gemini Voice] Session started for call ${sessionId}`)
  }

  /**
   * Process transcribed text and generate audio response
   * This is called when we receive transcription from Stream Video
   */
  async processTranscription(
    callId: string,
    transcriptionText: string,
    speakerId: string
  ): Promise<void> {
    const session = this.sessions.get(callId)
    if (!session || session.isProcessing) {
      return
    }

    // Skip if it's the agent speaking
    if (speakerId === session.agentUserId) {
      return
    }

    session.isProcessing = true

    try {
      console.log('[Gemini Voice] Incoming transcript:', transcriptionText)
      // Step 1: Add user message to conversation history
      session.conversationHistory.push({
        role: 'user',
        content: transcriptionText,
      })

      // Step 2: Generate response using Gemini
      const geminiResponse = await this.generateGeminiResponse(
        session.instructions,
        session.conversationHistory
      )

      // Step 3: Add assistant response to history
      session.conversationHistory.push({
        role: 'assistant',
        content: geminiResponse,
      })

      // Step 4: Convert text to speech (optional)
      console.log(
        '[Gemini Voice] TTS request text:',
        geminiResponse.slice(0, 120)
      )
      const audioBuffer = await this.textToSpeech(geminiResponse)
      console.log(
        '[Gemini Voice] TTS response buffer bytes:',
        audioBuffer ? audioBuffer.length : 0
      )

      // Step 5: Store audio response for client-side playback
      if (audioBuffer) {
        try {
          await ensureAudioDir()

          // Save audio file
          const audioFileName = `${callId}-${Date.now()}.wav`
          const audioPath = join(AUDIO_STORAGE_DIR, audioFileName)
          await writeFile(audioPath, audioBuffer)

          const audioUrl = `/audio-responses/${audioFileName}`

          // Store in session for tracking
          session.audioResponses.push({
            text: geminiResponse,
            audioUrl,
            timestamp: new Date(),
          })

          // Audio is saved, client will poll API endpoint to get it
          // No need to send via Stream Video message (simpler approach)

          console.log(
            `[Gemini Voice] Generated and saved audio response: ${audioUrl} (${audioBuffer.length} bytes)`
          )
        } catch (saveError) {
          console.error('[Gemini Voice] Error saving audio:', saveError)
          // Fallback: log text response
          console.log(`[Gemini Voice] Response (text-only): ${geminiResponse}`)
        }
      } else {
        // No TTS configured - store text response for client-side TTS or display
        try {
          session.audioResponses.push({
            text: geminiResponse,
            audioUrl: '', // No audio URL - text only
            timestamp: new Date(),
          })
          console.log(
            `[Gemini Voice] Stored text response (no TTS): ${geminiResponse.substring(0, 50)}...`
          )
        } catch (error) {
          console.error('[Gemini Voice] Error storing text response:', error)
        }
      }

      console.log(
        `[Gemini Voice] Processed transcription for call ${callId}: ${transcriptionText.substring(0, 50)}...`
      )
    } catch (error) {
      console.error('[Gemini Voice] Error processing transcription:', error)
    } finally {
      session.isProcessing = false
    }
  }

  /**
   * Generate response using Gemini API
   */
  private async generateGeminiResponse(
    instructions: string,
    history: Array<{ role: string; content: string }>
  ): Promise<string> {
    const genAI = getGeminiClient()
    const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash-exp' })

    // Build conversation context
    const systemPrompt = `${instructions}\n\nYou are having a conversation. Respond naturally and concisely.`

    // Format history for Gemini
    const conversationParts = history.map((msg) => {
      return `${msg.role === 'user' ? 'User' : 'Assistant'}: ${msg.content}`
    })

    const prompt = `${systemPrompt}\n\nConversation:\n${conversationParts.join('\n\n')}\n\nAssistant:`

    console.log('[Gemini Voice] Generating response with Gemini...')
    const result = await model.generateContent(prompt)
    const response = await result.response
    const text = response.text()
    console.log(
      '[Gemini Voice] Gemini response text:',
      (text || '').slice(0, 120)
    )

    return text || 'I apologize, but I could not generate a response.'
  }

  /**
   * Convert text to speech using Google Cloud Text-to-Speech
   * Returns null if TTS is not configured
   */
  private async textToSpeech(text: string): Promise<Buffer | null> {
    const client = getTTSClient()
    if (!client) {
      console.log(
        '[Gemini Voice] TTS not configured - skipping audio generation'
      )
      return null
    }

    const request: tts.protos.google.cloud.texttospeech.v1.ISynthesizeSpeechRequest =
      {
        input: { text },
        voice: {
          languageCode: 'en-US',
          name: 'en-US-Neural2-F', // Natural female voice
          ssmlGender: 'FEMALE' as const,
        },
        audioConfig: {
          audioEncoding: 'LINEAR16' as const,
          sampleRateHertz: 16000,
        },
      }

    const [response] = await client.synthesizeSpeech(request)

    if (!response.audioContent) {
      throw new Error('Failed to generate audio from text')
    }

    return Buffer.from(response.audioContent)
  }

  /**
   * Get latest audio response URL for a call
   */
  getLatestAudioResponse(callId: string): string | null {
    const session = this.sessions.get(callId)
    if (!session || session.audioResponses.length === 0) {
      return null
    }
    const latest = session.audioResponses[session.audioResponses.length - 1]
    return latest.audioUrl
  }

  /**
   * Get all audio responses for a call
   */
  getAudioResponses(
    callId: string
  ): Array<{ text: string; audioUrl: string; timestamp: Date }> {
    const session = this.sessions.get(callId)
    return session?.audioResponses || []
  }

  /**
   * End a voice session
   */
  async endSession(callId: string): Promise<void> {
    this.sessions.delete(callId)
    console.log(`[Gemini Voice] Session ended for call ${callId}`)
  }

  /**
   * Check if session exists
   */
  hasSession(callId: string): boolean {
    return this.sessions.has(callId)
  }
}

// Singleton instance
export const geminiVoiceService = new GeminiVoiceService()
