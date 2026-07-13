import type { ProteinFactorySubmissionAttempt } from './appsScriptMapper'
import type { PersistedSubmissionItem, ResultRepository } from './resultRepository'

const maxQueueItems = 30
const retryDelaysMs = [5_000, 15_000, 60_000, 300_000, 900_000] as const

export type SubmissionStatus =
  | 'local-draft'
  | 'queued'
  | 'saving'
  | 'submitted'
  | 'waiting-for-connection'
  | 'retry-scheduled'
  | 'failed-terminal'
  | 'failed'

export interface SubmissionQueueItem extends PersistedSubmissionItem {
  status: SubmissionStatus
}

export interface SubmissionQueueOptions {
  attemptId?: string
  endpoint?: string
  fetcher?: typeof fetch
  force?: boolean
  isOnline?: () => boolean
  now?: () => number
  onStatusChange?: (item: SubmissionQueueItem) => void
  repository: ResultRepository
}

const activeDrains = new WeakMap<ResultRepository, Promise<SubmissionQueueItem[]>>()
const queueMutations = new WeakMap<ResultRepository, Promise<void>>()

export async function queueSubmission(
  attempt: ProteinFactorySubmissionAttempt,
  repository: ResultRepository,
  now = Date.now(),
): Promise<SubmissionQueueItem> {
  return withQueueMutation(repository, async () => {
    await repository.initialize()
    const items = asQueueItems(await repository.getQueue())
    const existing = items.find((item) => item.attemptId === attempt.attemptId)
    if (existing) return existing

    const timestamp = new Date(now).toISOString()
    const item: SubmissionQueueItem = {
      attempt: clone(attempt),
      attemptId: attempt.attemptId,
      createdAt: timestamp,
      durability: repository.durability,
      retryCount: 0,
      status: 'queued',
      updatedAt: timestamp,
    }
    const nextItems = [item, ...items]
    const pending = nextItems.filter((entry) => entry.status !== 'submitted')
    const submitted = nextItems.filter((entry) => entry.status === 'submitted')
      .slice(0, Math.max(0, maxQueueItems - pending.length))
    await repository.putQueue([...pending, ...submitted])
    return item
  })
}

export async function readSubmissionQueue(repository: ResultRepository): Promise<SubmissionQueueItem[]> {
  await repository.initialize()
  return asQueueItems(await repository.getQueue())
}

export function retryPendingSubmissions(options: SubmissionQueueOptions): Promise<SubmissionQueueItem[]> {
  const active = activeDrains.get(options.repository)
  if (active) {
    return active.then(
      () => retryPendingSubmissions(options),
      () => retryPendingSubmissions(options),
    )
  }
  const drain = drainQueue(options).finally(() => activeDrains.delete(options.repository))
  activeDrains.set(options.repository, drain)
  return drain
}

export function retryDelayMs(retryCount: number): number {
  return retryDelaysMs[Math.min(Math.max(retryCount - 1, 0), retryDelaysMs.length - 1)]
}

async function drainQueue(options: SubmissionQueueOptions): Promise<SubmissionQueueItem[]> {
  const now = options.now ?? Date.now
  const isOnline = options.isOnline ?? getOnlineStatus
  const processed = new Map<string, SubmissionQueueItem>()

  while (true) {
    const queue = await readSubmissionQueue(options.repository)
    const candidate = queue.find((item) =>
      (!options.attemptId || item.attemptId === options.attemptId) &&
      isReady(item, now(), options.force === true) &&
      !processed.has(item.attemptId),
    )
    if (!candidate) return queue

    if (!isOnline()) {
      const waiting = await updateItem(candidate, {
        error: 'No network connection.',
        status: 'waiting-for-connection',
      }, options, now())
      processed.set(waiting.attemptId, waiting)
      continue
    }

    const saving = await updateItem(candidate, {
      error: undefined,
      lastAttemptAt: new Date(now()).toISOString(),
      retryCount: candidate.retryCount + 1,
      status: 'saving',
    }, options, now())

    try {
      const response = await (options.fetcher ?? fetch)(options.endpoint ?? '/api/attempt', {
        body: JSON.stringify({ attempt: saving.attempt }),
        headers: { 'Content-Type': 'application/json' },
        method: 'POST',
      })
      const body = await readResponseBody(response)
      if (response.ok && body.ok === true) {
        const submitted = await updateItem(saving, {
          error: undefined,
          lastHttpStatus: response.status,
          nextRetryAt: undefined,
          status: 'submitted',
        }, options, now())
        processed.set(submitted.attemptId, submitted)
        continue
      }

      const message = typeof body.error === 'string' ? body.error : `Submission failed (${response.status}).`
      const retryable = typeof body.retryable === 'boolean'
        ? body.retryable
        : isRetryableStatus(response.status)
      const failed = await updateItem(saving, {
        error: message,
        lastHttpStatus: response.status,
        nextRetryAt: retryable ? new Date(now() + retryDelayMs(saving.retryCount)).toISOString() : undefined,
        status: retryable ? 'retry-scheduled' : 'failed-terminal',
      }, options, now())
      processed.set(failed.attemptId, failed)
    } catch (error) {
      const failed = await updateItem(saving, {
        error: error instanceof Error ? error.message : 'The submission request could not connect.',
        nextRetryAt: new Date(now() + retryDelayMs(saving.retryCount)).toISOString(),
        status: 'waiting-for-connection',
      }, options, now())
      processed.set(failed.attemptId, failed)
    }
  }
}

async function updateItem(
  item: SubmissionQueueItem,
  changes: Partial<SubmissionQueueItem>,
  options: SubmissionQueueOptions,
  now: number,
): Promise<SubmissionQueueItem> {
  return withQueueMutation(options.repository, async () => {
    const next: SubmissionQueueItem = {
      ...item,
      ...changes,
      attempt: item.attempt,
      attemptId: item.attemptId,
      durability: options.repository.durability,
      updatedAt: new Date(now).toISOString(),
    }
    const queue = await readSubmissionQueue(options.repository)
    await options.repository.putQueue(queue.map((current) => current.attemptId === item.attemptId ? next : current))
    options.onStatusChange?.(clone(next))
    return next
  })
}

async function withQueueMutation<T>(repository: ResultRepository, mutation: () => Promise<T>): Promise<T> {
  const previous = queueMutations.get(repository) ?? Promise.resolve()
  let release = () => {}
  const current = new Promise<void>((resolve) => { release = resolve })
  const chained = previous.then(() => current)
  queueMutations.set(repository, chained)
  await previous
  try {
    return await mutation()
  } finally {
    release()
    if (queueMutations.get(repository) === chained) queueMutations.delete(repository)
  }
}

function isReady(item: SubmissionQueueItem, now: number, force: boolean): boolean {
  if (item.status === 'submitted') return false
  if (force) return true
  if (item.status === 'failed-terminal') return false
  return item.nextRetryAt === undefined || Date.parse(item.nextRetryAt) <= now
}

function isRetryableStatus(status: number): boolean {
  return status === 408 || status === 425 || status === 429 || status >= 500
}

function asQueueItems(items: PersistedSubmissionItem[]): SubmissionQueueItem[] {
  return items.filter((item): item is SubmissionQueueItem =>
    ['local-draft', 'queued', 'saving', 'submitted', 'waiting-for-connection', 'retry-scheduled', 'failed-terminal', 'failed'].includes(item.status),
  )
}

async function readResponseBody(response: Response): Promise<Record<string, unknown>> {
  try {
    const parsed: unknown = await response.json()
    return isRecord(parsed) ? parsed : {}
  } catch {
    return {}
  }
}

function getOnlineStatus(): boolean {
  return typeof navigator === 'undefined' || navigator.onLine
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function clone<T>(value: T): T {
  return typeof structuredClone === 'function' ? structuredClone(value) : JSON.parse(JSON.stringify(value)) as T
}
