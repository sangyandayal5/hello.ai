import { db } from '@/db'
import { agents, meetings, user } from '@/db/schema'
import { inngest } from '@/inngest/client'
import { StreamTranscriptItem } from '@/modules/meetings/types'
import { eq, inArray } from 'drizzle-orm'
import JSONL from 'jsonl-parse-stringify'
import { GoogleGenerativeAI } from '@google/generative-ai'

const SYSTEM_PROMPT = `
You are an expert summarizer. You write readable, concise, simple content. You are given a transcript of a meeting and you need to summarize it.

Use the following markdown structure for every output:

### Overview
Provide a detailed, engaging summary of the session's content. Focus on major features, user workflows, and any key takeaways. Write in a narrative style, using full sentences. Highlight unique or powerful aspects of the product, platform, or discussion.

### Notes
Break down key content into thematic sections with timestamp ranges. Each section should summarize key points, actions, or demos in bullet format.

Example:
#### Section Name
- Main point or demo shown here
- Another key insight or interaction
- Follow-up tool or explanation provided

#### Next Section
- Feature X automatically does Y
- Mention of integration with Z
`.trim()

async function summarizeWithGemini(transcriptText: string): Promise<string> {
  const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_GENAI_API_KEY

  if (!apiKey) {
    throw new Error(
      'GEMINI_API_KEY or GOOGLE_GENAI_API_KEY environment variable is required'
    )
  }

  const genAI = new GoogleGenerativeAI(apiKey)

  const prompt = `${SYSTEM_PROMPT}\n\nSummarize the following transcript:\n\n${transcriptText}`

  const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash-exp' })

  const result = await model.generateContent(prompt)
  const response = await result.response
  const text = response.text()

  if (!text) {
    throw new Error('Gemini API returned empty response')
  }

  return text
}

export const meetingsProcessing = inngest.createFunction(
  { id: 'meetings/processing' },
  { event: 'meetings/processing' },
  async ({ event, step }) => {
    const response = await step.run('fetch-transcript', async () => {
      return fetch(event.data.transcriptUrl).then((res) => res.text())
    })

    const transcript = await step.run('parse-transcript', async () => {
      return JSONL.parse<StreamTranscriptItem>(response)
    })

    const transcriptWithSpeakers = await step.run('add-speakers', async () => {
      const speakerIds = [...new Set(transcript.map((item) => item.speaker_id))]

      const userSpeakers = await db
        .select()
        .from(user)
        .where(inArray(user.id, speakerIds))
        .then((users) =>
          users.map((user) => ({
            ...user,
          }))
        )

      const agentSpeakers = await db
        .select()
        .from(agents)
        .where(inArray(agents.id, speakerIds))
        .then((agents) =>
          agents.map((agent) => ({
            ...agent,
          }))
        )

      const speakers = [...userSpeakers, ...agentSpeakers]

      return transcript.map((item) => {
        const speaker = speakers.find(
          (speaker) => speaker.id === item.speaker_id
        )

        if (!speaker) {
          return {
            ...item,
            user: {
              name: 'Unknown',
            },
          }
        }

        return {
          ...item,
          user: {
            name: speaker.name || 'Unknown',
          },
        }
      })
    })

    const summary = await step.run('generate-summary', async () => {
      const transcriptText =
        'Summarize the following transcript: ' +
        JSON.stringify(transcriptWithSpeakers)

      try {
        console.log(`[Inngest] Starting summary generation...`)
        console.log(
          `[Inngest] Transcript length: ${transcriptText.length} characters`
        )

        const summaryText = await summarizeWithGemini(transcriptText)

        if (!summaryText || summaryText.trim().length === 0) {
          throw new Error('Gemini returned empty summary')
        }

        console.log(
          `[Inngest] Generated summary length: ${summaryText.length} characters`
        )
        console.log(
          `[Inngest] Summary preview: ${summaryText.substring(0, 200)}...`
        )

        return summaryText
      } catch (error) {
        console.error('[Inngest] Error generating summary:', error)
        throw error
      }
    })

    console.log(
      `[Inngest] Summary value after generation: ${summary ? 'exists' : 'null'}`
    )
    console.log(`[Inngest] Summary length: ${summary ? summary.length : 0}`)

    const savedResult = await step.run('save-summary', async () => {
      // Ensure summary is available
      if (!summary || summary.trim().length === 0) {
        const errorMsg = 'Summary is null or empty, cannot save'
        console.error(`[Inngest] ${errorMsg}`)
        console.error(`[Inngest] Summary type: ${typeof summary}`)
        console.error(`[Inngest] Summary value: ${summary}`)
        throw new Error(errorMsg)
      }

      console.log(
        `[Inngest] Saving summary for meeting ${event.data.meetingId}`
      )
      console.log(`[Inngest] Summary preview: ${summary.substring(0, 100)}...`)

      try {
        const result = await db
          .update(meetings)
          .set({
            summary: summary,
            status: 'completed',
          })
          .where(eq(meetings.id, event.data.meetingId))
          .returning()

        if (!result || result.length === 0) {
          throw new Error(`Failed to update meeting ${event.data.meetingId}`)
        }

        console.log(
          `[Inngest] Summary saved successfully for meeting ${event.data.meetingId}`
        )
        console.log(
          `[Inngest] Saved summary length: ${result[0].summary?.length || 0}`
        )
        return result[0]
      } catch (dbError) {
        console.error('[Inngest] Database error saving summary:', dbError)
        throw dbError
      }
    })

    return savedResult
  }
)
