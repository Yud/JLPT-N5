// Fish Audio TTS proof-of-concept (src/components/TextToSpeech.vue): sends
// text to POST /api/tts/fish and plays back the returned MP3. Successful
// responses are cached in a module-scope Map keyed by text, so replaying the
// same sentence doesn't re-hit the (metered) API — this is intentionally
// just an in-memory cache, not localStorage/IndexedDB, so it clears itself
// on every page refresh until there's a real storage story (R2, like
// media_assets) behind this endpoint.
const cache = new Map() // text -> Blob

export function useFishSpeech() {
  async function speak(text, rate = 1) {
    if (!text || typeof Audio === 'undefined') return

    let blob = cache.get(text)
    if (!blob) {
      const res = await fetch('/api/tts/fish', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text }),
      })
      if (!res.ok) throw new Error((await res.text().catch(() => '')) || `Fish Audio request failed (${res.status})`)
      blob = await res.blob()
      cache.set(text, blob)
    }

    const objectUrl = URL.createObjectURL(blob)
    const audio = new Audio(objectUrl)
    audio.playbackRate = rate // the MP3 itself is unaffected — same cached blob at any speed
    audio.addEventListener('ended', () => URL.revokeObjectURL(objectUrl), { once: true })
    await audio.play()
  }

  return { speak }
}
