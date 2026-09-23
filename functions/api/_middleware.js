// Runs before every /api/* route (Pages Functions convention: a
// _middleware.js file gates its whole directory, recursively) — the single
// place Cloudflare Access is enforced, instead of every route re-parsing
// the header itself. Handlers that need the signed-in user's identity read
// it off context.data.email rather than the header directly.

async function auth(context) {
  const email = context.request.headers.get('Cf-Access-Authenticated-User-Email')
  if (!email) return new Response('Unauthorized', { status: 401 })

  context.data.email = email
  return context.next()
}

// Array form (developers.cloudflare.com/pages/functions/middleware/) so
// each middleware function can keep a name describing what it does, rather
// than every one of them having to be called onRequest.
export const onRequest = [auth]
