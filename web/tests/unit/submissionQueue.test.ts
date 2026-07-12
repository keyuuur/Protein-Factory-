import { describe, expect, it } from 'vitest'
import { queueSubmission, readSubmissionQueue, retryPendingSubmissions } from '../../src/results/submissionQueue'
import type { ProteinFactoryAttemptV3 } from '../../src/results/appsScriptMapper'

describe('submission queue', () => {
  it('queues once by attempt ID and marks a successful retry submitted', async () => {
    const storage = memoryStorage()
    const attempt = { attemptId: 'pf-test-attempt', schemaVersion: 'protein-factory-attempt-v3' } as ProteinFactoryAttemptV3
    queueSubmission(attempt, storage)
    queueSubmission(attempt, storage)
    expect(readSubmissionQueue(storage)).toHaveLength(1)
    const results = await retryPendingSubmissions({
      fetcher: async () => new Response(JSON.stringify({ ok: true }), { status: 200 }),
      isOnline: () => true,
      storage,
    })
    expect(results[0].status).toBe('submitted')
    expect(readSubmissionQueue(storage)[0].status).toBe('submitted')
  })

  it('keeps an offline attempt waiting on the device', async () => {
    const storage = memoryStorage()
    queueSubmission({ attemptId: 'pf-offline', schemaVersion: 'protein-factory-attempt-v3' } as ProteinFactoryAttemptV3, storage)
    const results = await retryPendingSubmissions({ isOnline: () => false, storage })
    expect(results[0].status).toBe('waiting-for-connection')
  })
})

function memoryStorage(): Storage {
  const values = new Map<string, string>()
  return {
    clear: () => values.clear(),
    getItem: (key) => values.get(key) ?? null,
    key: (index) => [...values.keys()][index] ?? null,
    get length() { return values.size },
    removeItem: (key) => { values.delete(key) },
    setItem: (key, value) => { values.set(key, value) },
  }
}
