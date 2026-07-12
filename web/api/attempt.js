const MAX_BODY_BYTES = 250_000

export default async function handler(request, response) {
  if (request.method !== 'POST') {
    response.setHeader('Allow', 'POST')
    return response.status(405).json({ error: 'Method not allowed.', ok: false })
  }

  const appsScriptUrl = process.env.APPS_SCRIPT_WEB_APP_URL
  const writeToken = process.env.RESULTS_WRITE_TOKEN
  if (!appsScriptUrl || !writeToken) {
    return response.status(503).json({ error: 'Teacher submission is not configured.', ok: false })
  }

  const serialized = JSON.stringify(request.body ?? {})
  if (Buffer.byteLength(serialized, 'utf8') > MAX_BODY_BYTES) {
    return response.status(413).json({ error: 'Attempt payload is too large.', ok: false })
  }

  const attempt = request.body?.attempt
  if (!isValidAttempt(attempt)) {
    return response.status(400).json({ error: 'Invalid Protein Factory attempt.', ok: false })
  }

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 12_000)
  try {
    const upstream = await fetch(appsScriptUrl, {
      body: JSON.stringify({ attempt, token: writeToken }),
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      method: 'POST',
      redirect: 'follow',
      signal: controller.signal,
    })
    const result = await upstream.json().catch(() => ({}))
    if (!upstream.ok || result.ok !== true) {
      return response.status(502).json({ error: result.error || 'Teacher storage rejected the attempt.', ok: false })
    }
    return response.status(200).json({ attemptId: attempt.attemptId, duplicate: Boolean(result.duplicate), ok: true })
  } catch (error) {
    const message = error?.name === 'AbortError' ? 'Teacher storage timed out.' : 'Teacher storage could not be reached.'
    return response.status(502).json({ error: message, ok: false })
  } finally {
    clearTimeout(timeout)
  }
}

function isValidAttempt(attempt) {
  return Boolean(
    attempt &&
      attempt.schemaVersion === 'protein-factory-attempt-v3' &&
      typeof attempt.attemptId === 'string' &&
      attempt.attemptId.length >= 8 &&
      typeof attempt.studentName === 'string' &&
      attempt.studentName.trim() &&
      typeof attempt.classPeriod === 'string' &&
      Array.isArray(attempt.stageResults) &&
      attempt.stageResults.length <= 8 &&
      Array.isArray(attempt.transferResults) &&
      attempt.transferResults.length <= 3,
  )
}
