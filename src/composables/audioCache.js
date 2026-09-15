const CACHE_NAME = 'wanikani-audio-v1'

/**
 * Plays a (typically cross-origin, e.g. WaniKani's audio CDN) URL through
 * the browser's Cache Storage API, so a word replayed later in the same
 * session — or in a future session, since Cache Storage persists like
 * localStorage — is served from disk instead of re-fetching from the CDN.
 * Falls back to plain, uncached playback wherever Cache Storage isn't
 * available (jsdom in tests, older browsers) or the fetch fails (e.g. the
 * CDN doesn't send permissive CORS headers) — audio elements can still
 * play a cross-origin URL directly even when `fetch()` can't read it.
 */
export async function playCachedAudio(url) {
  if (!url || typeof Audio === 'undefined') return

  if (typeof caches !== 'undefined') {
    try {
      const cache = await caches.open(CACHE_NAME)
      let response = await cache.match(url)
      if (!response) {
        response = await fetch(url)
        if (response.ok) await cache.put(url, response.clone())
      }
      const blob = await response.blob()
      const objectUrl = URL.createObjectURL(blob)
      const audio = new Audio(objectUrl)
      audio.addEventListener('ended', () => URL.revokeObjectURL(objectUrl), { once: true })
      await audio.play()
      return
    } catch {
      // Cache Storage unavailable, or the fetch itself failed (e.g. CORS) —
      // fall through to a direct, uncached play of the original URL.
    }
  }

  new Audio(url).play().catch(() => {})
}
