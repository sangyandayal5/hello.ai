import { NextRequest, NextResponse } from 'next/server'
import { testGeminiConfiguration } from '@/lib/test-gemini-config'

/**
 * Test endpoint to verify Gemini API configuration
 *
 * Usage:
 * 1. Start your dev server: npm run dev
 * 2. Visit: http://localhost:3000/api/test/gemini-config
 * 3. Check the response and server logs
 *
 * This endpoint tests:
 * - Gemini API key presence and validity
 * - Google Cloud credentials (if configured)
 * - Text-to-Speech API (if configured)
 */
export async function GET(req: NextRequest) {
  try {
    const results = await testGeminiConfiguration()

    return NextResponse.json({
      success: results.geminiApiKey && results.geminiConnection,
      results,
      message:
        results.geminiApiKey && results.geminiConnection
          ? 'Configuration is valid! Check server logs for details.'
          : 'Configuration has errors. Check server logs for details.',
    })
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    )
  }
}
