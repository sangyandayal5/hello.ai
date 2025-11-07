import 'server-only'

import { GoogleGenerativeAI } from '@google/generative-ai'
import tts from '@google-cloud/text-to-speech'

/**
 * Test script to verify Gemini API configuration
 * Run this to check if your API keys are set up correctly
 */
export async function testGeminiConfiguration() {
  const results = {
    geminiApiKey: false,
    geminiConnection: false,
    googleCloudKeyfile: false,
    googleCloudProjectId: false,
    textToSpeech: false,
    errors: [] as string[],
  }

  // Test 1: Check Gemini API Key
  console.log('🔍 Testing Gemini API Key...')
  const geminiApiKey =
    process.env.GEMINI_API_KEY || process.env.GOOGLE_GENAI_API_KEY
  if (geminiApiKey) {
    results.geminiApiKey = true
    console.log('✅ Gemini API Key found')

    // Test 2: Test Gemini API Connection
    try {
      const genAI = new GoogleGenerativeAI(geminiApiKey)
      const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash-exp' })
      const result = await model.generateContent(
        'Say "Hello" if you can hear me.'
      )
      const response = await result.response
      const text = response.text()

      if (text) {
        results.geminiConnection = true
        console.log('✅ Gemini API connection successful!')
        console.log(`   Response: ${text.substring(0, 100)}...`)
      } else {
        results.errors.push('Gemini API returned empty response')
        console.log('❌ Gemini API returned empty response')
      }
    } catch (error) {
      results.errors.push(
        `Gemini API error: ${error instanceof Error ? error.message : String(error)}`
      )
      console.log('❌ Gemini API connection failed:', error)
    }
  } else {
    results.errors.push('GEMINI_API_KEY or GOOGLE_GENAI_API_KEY not found')
    console.log('❌ Gemini API Key not found')
  }

  // Test 3: Check Google Cloud Keyfile
  console.log('\n🔍 Testing Google Cloud Keyfile...')
  const keyfile = process.env.GOOGLE_CLOUD_KEYFILE
  if (keyfile) {
    try {
      const fs = await import('fs')
      const path = await import('path')
      const keyfilePath = path.default.resolve(process.cwd(), keyfile)

      console.log(`   Looking for keyfile at: ${keyfilePath}`)

      if (fs.default.existsSync(keyfilePath)) {
        results.googleCloudKeyfile = true
        console.log('✅ Google Cloud Keyfile found and accessible')

        // Try to parse JSON
        try {
          const keyfileContent = JSON.parse(
            fs.default.readFileSync(keyfilePath, 'utf8')
          )
          console.log(
            `   Project ID in keyfile: ${keyfileContent.project_id || 'Not found'}`
          )

          // Check if project ID matches
          if (
            process.env.GOOGLE_CLOUD_PROJECT_ID &&
            keyfileContent.project_id
          ) {
            if (
              process.env.GOOGLE_CLOUD_PROJECT_ID !== keyfileContent.project_id
            ) {
              console.log(`   ⚠️  Warning: Project ID mismatch!`)
              console.log(`      Env: ${process.env.GOOGLE_CLOUD_PROJECT_ID}`)
              console.log(`      Keyfile: ${keyfileContent.project_id}`)
            }
          }
        } catch (parseError) {
          results.errors.push('Keyfile exists but is not valid JSON')
          console.log('⚠️  Keyfile exists but is not valid JSON')
        }
      } else {
        // Try alternative locations
        const path = await import('path')
        const altPaths = [
          path.default.resolve(process.cwd(), keyfile.replace(/^\.\//, '')),
          path.default.resolve(
            process.cwd(),
            'keys',
            path.default.basename(keyfile)
          ),
          path.default.resolve(
            process.cwd(),
            'config',
            path.default.basename(keyfile)
          ),
        ]

        let found = false
        for (const altPath of altPaths) {
          if (fs.default.existsSync(altPath)) {
            console.log(
              `   ✅ Found keyfile at alternative location: ${altPath}`
            )
            const relPath = path.default.relative(process.cwd(), altPath)
            console.log(
              `   💡 Update GOOGLE_CLOUD_KEYFILE to: ./${relPath.replace(/\\/g, '/')}`
            )
            results.googleCloudKeyfile = true
            found = true
            break
          }
        }

        if (!found) {
          results.errors.push(`Keyfile path not found: ${keyfilePath}`)
          console.log(`❌ Keyfile path not found: ${keyfilePath}`)
          console.log(
            `   💡 Make sure the path is correct relative to project root`
          )
          console.log(`   💡 Current working directory: ${process.cwd()}`)
          console.log(
            `   💡 Try: ./google-service-key.json or ./keys/google-service-key.json`
          )
        }
      }
    } catch (error) {
      results.errors.push(
        `Error accessing keyfile: ${error instanceof Error ? error.message : String(error)}`
      )
      console.log('❌ Error accessing keyfile:', error)
    }
  } else {
    console.log(
      '⚠️  GOOGLE_CLOUD_KEYFILE not set (optional for text-only mode)'
    )
  }

  // Test 4: Check Google Cloud Project ID
  console.log('\n🔍 Testing Google Cloud Project ID...')
  const projectId = process.env.GOOGLE_CLOUD_PROJECT_ID
  if (projectId) {
    results.googleCloudProjectId = true
    console.log(`✅ Google Cloud Project ID found: ${projectId}`)
  } else {
    console.log(
      '⚠️  GOOGLE_CLOUD_PROJECT_ID not set (optional for text-only mode)'
    )
  }

  // Test 5: Test Text-to-Speech (if configured)
  if (keyfile && projectId) {
    console.log('\n🔍 Testing Text-to-Speech API...')
    try {
      const ttsClient = new tts.TextToSpeechClient({
        keyFilename: keyfile,
        projectId: projectId,
      })

      // Try a simple request
      const request = {
        input: { text: 'Test' },
        voice: {
          languageCode: 'en-US',
          name: 'en-US-Neural2-F',
        },
        audioConfig: {
          audioEncoding: 'LINEAR16' as const,
          sampleRateHertz: 16000,
        },
      }

      const [response] = await ttsClient.synthesizeSpeech(request)
      if (response.audioContent) {
        results.textToSpeech = true
        console.log('✅ Text-to-Speech API connection successful!')
        console.log(
          `   Generated ${response.audioContent.length} bytes of audio`
        )
      } else {
        results.errors.push('Text-to-Speech API returned empty response')
        console.log('❌ Text-to-Speech API returned empty response')
      }
    } catch (error) {
      results.errors.push(
        `Text-to-Speech API error: ${error instanceof Error ? error.message : String(error)}`
      )
      console.log('❌ Text-to-Speech API connection failed:', error)

      // Check if it's a permission issue
      if (error instanceof Error && error.message.includes('permission')) {
        console.log(
          '   💡 Make sure your service account has "Cloud Text-to-Speech API User" role'
        )
      }
    }
  } else {
    console.log('⚠️  Skipping Text-to-Speech test (not configured)')
  }

  // Summary
  console.log('\n📊 Configuration Summary:')
  console.log('─'.repeat(50))
  console.log(`Gemini API Key:        ${results.geminiApiKey ? '✅' : '❌'}`)
  console.log(
    `Gemini Connection:     ${results.geminiConnection ? '✅' : '❌'}`
  )
  console.log(
    `Cloud Keyfile:        ${results.googleCloudKeyfile ? '✅' : '⚠️  (optional)'}`
  )
  console.log(
    `Cloud Project ID:     ${results.googleCloudProjectId ? '✅' : '⚠️  (optional)'}`
  )
  console.log(
    `Text-to-Speech:       ${results.textToSpeech ? '✅' : '⚠️  (optional)'}`
  )
  console.log('─'.repeat(50))

  if (results.errors.length > 0) {
    console.log('\n❌ Errors found:')
    results.errors.forEach((error) => console.log(`   - ${error}`))
  }

  if (results.geminiApiKey && results.geminiConnection) {
    console.log(
      '\n🎉 Basic configuration is working! Your app can use Gemini API.'
    )
    if (results.textToSpeech) {
      console.log(
        '🎉 Full configuration is working! Audio features are enabled.'
      )
    } else {
      console.log(
        '💡 Text-only mode is active. Add Google Cloud credentials for audio.'
      )
    }
  } else {
    console.log('\n⚠️  Please fix the errors above before testing your app.')
  }

  return results
}
