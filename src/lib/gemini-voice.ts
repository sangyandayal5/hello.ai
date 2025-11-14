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

  if (!process.env.GOOGLE_CLOUD_KEYFILE && !process.env.GOOGLE_CLOUD_PROJECT_ID ) {
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

export class GeminiVoiceService {
  private sessions: Map<string, GeminiVoiceSession> = new Map()

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
  }

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
      session.conversationHistory.push({
        role: 'user',
        content: transcriptionText,
      })

      const geminiResponse = await this.generateGeminiResponse(
        session.instructions,
        session.conversationHistory
      )

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

      try {
        const audioFileName = `${callId}-${Date.now()}.wav`
        const audioUrl = `/audio-responses/${audioFileName}`
        session.audioResponses.push({
          text: geminiResponse,
          audioUrl,
          timestamp: new Date(),
        })
      } catch (saveError) {
        console.error('[Gemini Voice] Error saving audio:', saveError)
      }      

   
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
          name: 'en-US-Neural2-F', 
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

  getLatestAudioResponse(callId: string): string | null {
    const session = this.sessions.get(callId)
    if (!session || session.audioResponses.length === 0) {
      return null
    }
    const latest = session.audioResponses[session.audioResponses.length - 1]
    return latest.audioUrl
  }

  getAudioResponses(
    callId: string
  ): Array<{ text: string; audioUrl: string; timestamp: Date }> {
    const session = this.sessions.get(callId)
    return session?.audioResponses || []
  }

  async endSession(callId: string): Promise<void> {
    this.sessions.delete(callId)
    console.log(`[Gemini Voice] Session ended for call ${callId}`)
  }


  hasSession(callId: string): boolean {
    return this.sessions.has(callId)
  }
}

export const geminiVoiceService = new GeminiVoiceService()
