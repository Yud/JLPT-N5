// GET /api/media/:mediaAssetId
// Streams one imported deck's audio/image asset back from R2. Behind the
// same Cloudflare Access gate as everything else — media is never served
// from a public bucket/domain (specs/003-anki-deck-import, research.md §4).

import * as mediaAssetsRepo from '../../../shared/repos/mediaAssetsRepo.js'

export async function onRequestGet(context) {
  const { mediaAssetId } = context.params
  const asset = await mediaAssetsRepo.getContentType(context.env.DB, mediaAssetId)
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
