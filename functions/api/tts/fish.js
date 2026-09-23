// POST /api/tts/fish
// POC (see src/composables/useFishSpeech.js): proxies text to Fish Audio's
// TTS API (https://docs.fish.audio/features/text-to-speech) and streams the
// resulting MP3 straight back — never buffered in full here, since a Worker
// invocation has a tight memory budget. No R2/D1 storage yet; the browser is
// the only cache for now.

const FISH_API_URL = 'https://api.fish.audio/v1/tts'
// A generic Japanese voice from Fish Audio's Voice Library — not a secret,
// so it's the fallback whenever FISH_VOICE_REFERENCE_ID isn't set (also the
// literal value in .github/prod.template.yaml).
const DEFAULT_VOICE_REFERENCE_ID = '297a6fd278df47c3b9da9bfdf55ac89a'

export async function onRequestPost(context) {
  const apiKey = context.env.FISH_API_KEY
  if (!apiKey) return new Response('FISH_API_KEY is not configured on this deployment', { status: 500 })

  const referenceId = context.env.FISH_VOICE_REFERENCE_ID || DEFAULT_VOICE_REFERENCE_ID

  let text
  try {
    ;({ text } = await context.request.json())
  } catch {
    return new Response('Invalid JSON body', { status: 400 })
  }
  if (!text || !text.trim()) return new Response('text is required', { status: 400 })

  const fishRes = await fetch(FISH_API_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      // Free tier for this POC — no TTFA/DPA guarantees, fine since nothing
      // here is real-time. Override on the deployment if that changes.
      model: context.env.FISH_MODEL || 's2.1-pro-free',
    },
    body: JSON.stringify({ text, reference_id: referenceId, format: 'mp3' }),
  })

  if (!fishRes.ok) {
    const detail = await fishRes.text().catch(() => '')
    return new Response(`Fish Audio request failed (${fishRes.status}): ${detail}`, { status: 502 })
  }

  return new Response(fishRes.body, { headers: { 'Content-Type': 'audio/mpeg' } })
}
