import type { ProteinFactoryAttemptV3 } from './appsScriptMapper'

const queueStorageKey = 'pirate-protein-factory:submission-queue-v1'
const queueSchemaVersion = 'submission-queue-v1'
const maxQueueItems = 30

export type SubmissionStatus =
  | 'local-draft'
  | 'saving'
  | 'submitted'
  | 'waiting-for-connection'
  | 'failed'

export interface SubmissionQueueItem {
  attempt: ProteinFactoryAttemptV3
  error?: string
  retryCount: number
  status: SubmissionStatus
  updatedAt: string
}

interface SubmissionQueueEnvelope {
  items: SubmissionQueueItem[]
  schemaVersion: typeof queueSchemaVersion
}

export interface SubmissionQueueOptions {
  endpoint?: string
  fetcher?: typeof fetch
  isOnline?: () => boolean
  onStatusChange?: (item: SubmissionQueueItem) => void
  storage?: Storage
}

let activeRetry: Promise<SubmissionQueueItem[]> | null = null

export function queueSubmission(
  attempt: ProteinFactoryAttemptV3,
  storage = getBrowserStorage(),
): SubmissionQueueItem {
  const existing = readSubmissionQueue(storage).find((item) => item.attempt.attemptId === attempt.attemptId)
  if (existing?.status === 'submitted') {
    return existing
  }

  const item: SubmissionQueueItem = {
    attempt,
    retryCount: existing?.retryCount ?? 0,
    status: 'local-draft',
    updatedAt: new Date().toISOString(),
  }
  writeQueueItem(item, storage)
  return item
}

export function readSubmissionQueue(storage = getBrowserStorage()): SubmissionQueueItem[] {
  try {
    const raw = storage.getItem(queueStorageKey)
    if (!raw) {
      return []
    }

    const parsed: unknown = JSON.parse(raw)
    if (!isRecord(parsed) || parsed.schemaVersion !== queueSchemaVersion || !Array.isArray(parsed.items)) {
      return []
    }

    return parsed.items.filter(isQueueItem)
  } catch {
    return []
  }
}

export function retryPendingSubmissions(options: SubmissionQueueOptions = {}): Promise<SubmissionQueueItem[]> {
  if (activeRetry) {
    return activeRetry
  }

  activeRetry = retryPendingSubmissionsInternal(options).finally(() => {
    activeRetry = null
  })
  return activeRetry
}

async function retryPendingSubmissionsInternal(
  options: SubmissionQueueOptions,
): Promise<SubmissionQueueItem[]> {
  const storage = options.storage ?? getBrowserStorage()
  const isOnline = options.isOnline ?? getOnlineStatus
  const candidates = readSubmissionQueue(storage).filter((item) => item.status !== 'submitted')

  if (!isOnline()) {
    return candidates.map((item) => updateStatus(item, 'waiting-for-connection', storage, options))
  }

  const results: SubmissionQueueItem[] = []
  for (const item of candidates) {
    const savingItem = updateStatus(item, 'saving', storage, options)
    try {
      const response = await (options.fetcher ?? fetch)(options.endpoint ?? '/api/attempt', {
        body: JSON.stringify({ attempt: savingItem.attempt }),
        headers: { 'Content-Type': 'application/json' },
        method: 'POST',
      })
      const responseBody = await readResponseBody(response)
      if (!response.ok || responseBody.ok !== true) {
        const message = typeof responseBody.error === 'string' ? responseBody.error : `Submission failed (${response.status}).`
        results.push(updateStatus(savingItem, 'failed', storage, options, message))
        continue
      }

      results.push(updateStatus(savingItem, 'submitted', storage, options))
    } catch (error) {
      const message = error instanceof Error ? error.message : 'The submission request could not connect.'
      results.push(updateStatus(savingItem, 'waiting-for-connection', storage, options, message))
    }
  }

  return results
}

function updateStatus(
  item: SubmissionQueueItem,
  status: SubmissionStatus,
  storage: Storage,
  options: SubmissionQueueOptions,
  error?: string,
): SubmissionQueueItem {
  const nextItem: SubmissionQueueItem = {
    ...item,
    error,
    retryCount: status === 'saving' ? item.retryCount + 1 : item.retryCount,
    status,
    updatedAt: new Date().toISOString(),
  }
  writeQueueItem(nextItem, storage)
  options.onStatusChange?.(nextItem)
  return nextItem
}

function writeQueueItem(item: SubmissionQueueItem, storage: Storage): void {
  const items = readSubmissionQueue(storage).filter(
    (existing) => existing.attempt.attemptId !== item.attempt.attemptId,
  )
  const envelope: SubmissionQueueEnvelope = {
    items: [item, ...items].slice(0, maxQueueItems),
    schemaVersion: queueSchemaVersion,
  }
  storage.setItem(queueStorageKey, JSON.stringify(envelope))
}

async function readResponseBody(response: Response): Promise<Record<string, unknown>> {
  try {
    const parsed: unknown = await response.json()
    return isRecord(parsed) ? parsed : {}
  } catch {
    return {}
  }
}

function getBrowserStorage(): Storage {
  if (typeof window === 'undefined') {
    throw new Error('Submission storage is only available in the browser.')
  }
  return window.localStorage
}

function getOnlineStatus(): boolean {
  return typeof navigator === 'undefined' || navigator.onLine
}

function isQueueItem(value: unknown): value is SubmissionQueueItem {
  return (
    isRecord(value) &&
    isRecord(value.attempt) &&
    typeof value.attempt.attemptId === 'string' &&
    typeof value.attempt.schemaVersion === 'string' &&
    typeof value.retryCount === 'number' &&
    typeof value.updatedAt === 'string' &&
    ['local-draft', 'saving', 'submitted', 'waiting-for-connection', 'failed'].includes(String(value.status))
  )
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
