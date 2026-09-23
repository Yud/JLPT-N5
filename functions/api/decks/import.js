// POST /api/decks/import
// Step 1 of importing an Anki deck: creates a job row and hands back a presigned
// R2 PUT URL for the browser to upload the raw .apkg file directly to — this
// endpoint itself never sees the file's bytes. Direct-to-bucket upload (rather
// than proxying the file through this Function) avoids Cloudflare's ~100MB
// request-body cap entirely and keeps a large upload from ever running inside a
// Worker invocation's own CPU/memory budget. See functions/api/decks/import/
// [jobId]/start.js (called once the direct upload succeeds) for what actually
// kicks off processing, and workflows/anki-import for the Workflow that does it.

import { AwsClient } from 'aws4fetch'
import * as deckImportJobsRepo from '../../../shared/repos/deckImportJobsRepo.js'

export async function onRequestPost(context) {
  const jobId = crypto.randomUUID()
  const r2Key = `raw-imports/${jobId}.apkg`

  await deckImportJobsRepo.create(context.env.DB, { id: jobId, r2Key })

  const r2 = new AwsClient({ accessKeyId: context.env.R2_ACCESS_KEY_ID, secretAccessKey: context.env.R2_SECRET_ACCESS_KEY })
  const url = new URL(`https://${context.env.CF_ACCOUNT_ID}.r2.cloudflarestorage.com/hiragana-media/${r2Key}`)
  url.searchParams.set('X-Amz-Expires', '3600')
  const signed = await r2.sign(new Request(url, { method: 'PUT' }), { aws: { signQuery: true } })

  return Response.json({ jobId, uploadUrl: signed.url })
}
