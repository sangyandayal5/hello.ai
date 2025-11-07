import 'server-only'

import { NextRequest, NextResponse } from 'next/server'
import { geminiVoiceService } from '@/lib/gemini-voice'

/**
 * API endpoint to get latest audio response for a meeting
 * GET /api/gemini-audio/[meetingId]
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ meetingId: string }> }
) {
  try {
    const { meetingId } = await params

    if (!meetingId) {
      return NextResponse.json({ error: 'Missing meetingId' }, { status: 400 })
    }

    // Get latest audio response from Gemini voice service
    const audioResponses = geminiVoiceService.getAudioResponses(meetingId)

    if (audioResponses.length === 0) {
      return NextResponse.json({ audioUrl: null, text: null })
    }

    // Return the latest audio response
    const latest = audioResponses[audioResponses.length - 1]

    return NextResponse.json({
      audioUrl: latest.audioUrl,
      text: latest.text,
      timestamp: latest.timestamp.toISOString(),
    })
  } catch (error) {
    console.error('[Gemini Audio API] Error:', error)
    return NextResponse.json(
      { error: 'Failed to get audio response' },
      { status: 500 }
    )
  }
}
