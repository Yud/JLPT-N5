// GET /api/media/:mediaAssetId
// Streams one imported deck's audio/image asset back from R2. Behind the
// same Cloudflare Access gate as everything else — media is never served
// from a public bucket/domain (specs/003-anki-deck-import, research.md §4).

export async function onRequestGet(context) {
  const email = context.request.headers.get('Cf-Access-Authenticated-User-Email')
  if (!email) return new Response('Unauthorized', { status: 401 })

  const { mediaAssetId } = context.params
  const asset = await context.env.DB
    .prepare('SELECT content_type FROM media_assets WHERE id = ?')
    .bind(mediaAssetId)
    .first()
  if (!asset) return new Response('Not found', { status: 404 })

  const object = await context.env.MEDIA.get(mediaAssetId)
  if (!object) return new Response('Not found', { status: 404 })

  return new Response(object.body, {
    headers: {
      'Content-Type': asset.content_type,
      // Immutable: re-import replaces changed media under a fresh asset id
      // rather than overwriting this one (data-model.md).
      'Cache-Control': 'public, max-age=31536000, immutable',
    },
  })
}
