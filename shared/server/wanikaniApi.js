// Minimal WaniKani API v2 client for the Pages Functions that talk to
// WaniKani server-side (the API key is a Pages secret and never reaches the
// browser). Callers pass the key in; this module holds no config of its own.

export const API_BASE = 'https://api.wanikani.com/v2'

export async function wkFetch(apiKey, url) {
  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Wanikani-Revision': '20170710',
    },
  })
  if (!res.ok) throw new Error(`WaniKani API request failed (${res.status} ${res.statusText}): ${url}`)
  return res.json()
}

/** Follows `pages.next_url` until exhausted, returning every page's `data` concatenated. */
export async function fetchAllPages(apiKey, startUrl) {
  const results = []
  let url = startUrl
  while (url) {
    const page = await wkFetch(apiKey, url)
    results.push(...page.data)
    url = page.pages?.next_url ?? null
  }
  return results
}
