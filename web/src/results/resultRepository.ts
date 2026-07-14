import type { ProteinFactorySubmissionAttempt } from './appsScriptMapper'
import { isValidCheckpointEnvelopeV4 } from './localResultSaver'
import type { CheckpointEnvelopeV4, FinalGamePayload } from '../types'
// @ts-expect-error The shared server validator is authored as checked JavaScript.
import { isValidAttempt } from '../../api/attempt.js'

const databaseName = 'pirate-protein-factory-results-v2'
const databaseVersion = 1
const recordStore = 'records'
const queueRecordKey = 'submission-queue'
const checkpointRecordKey = 'checkpoint'
const resultsRecordKey = 'results'

const legacyQueueKey = 'pirate-protein-factory:submission-queue-v1'
const fallbackQueueKey = 'pirate-protein-factory:submission-queue-v2'
const legacyCheckpointKey = 'pirate-protein-factory:last-checkpoint'
const legacyResultKey = 'pirate-protein-factory:last-payload'
const legacyHistoryKey = 'pirate-protein-factory:payload-history'
const fallbackStateKey = 'pirate-protein-factory:repository-v2:authoritative-state'
const fallbackStateSchemaVersion = 'protein-factory-repository-fallback-v1' as const
const indexedDbOperationTimeoutMs = 2_000
const maxResults = 30
const repositoryRecordKeys = [queueRecordKey, checkpointRecordKey, resultsRecordKey] as const

type RepositoryRecordKey = typeof repositoryRecordKeys[number]
type RepositoryState = Partial<Record<RepositoryRecordKey, unknown>>

export type PersistenceDurability = 'indexeddb' | 'local-storage' | 'memory-only'

export interface PersistedSubmissionItem {
  attempt: ProteinFactorySubmissionAttempt
  attemptId: string
  createdAt: string
  durability: PersistenceDurability
  error?: string
  lastAttemptAt?: string
  lastHttpStatus?: number
  nextRetryAt?: string
  retryCount: number
  status: string
  updatedAt: string
}

export interface RecoverySnapshot {
  checkpoint: CheckpointEnvelopeV4 | null
  queue: PersistedSubmissionItem[]
  results: FinalGamePayload[]
}

export interface ResultRepository {
  readonly durability: PersistenceDurability
  clearCheckpoint(): Promise<void>
  getCheckpoint(): Promise<CheckpointEnvelopeV4 | null>
  getQueue(): Promise<PersistedSubmissionItem[]>
  getResults(): Promise<FinalGamePayload[]>
  initialize(): Promise<void>
  putCheckpoint(checkpoint: CheckpointEnvelopeV4): Promise<void>
  putQueue(items: PersistedSubmissionItem[]): Promise<void>
  putResult(result: FinalGamePayload): Promise<void>
  replaceRecoverySnapshot(snapshot: RecoverySnapshot): Promise<void>
}

export class BrowserResultRepository implements ResultRepository {
  private database: IDBDatabase | null = null
  private initializationPromise: Promise<void> | null = null
  private memory = new Map<string, unknown>()
  private storage: Storage | null = null
  durability: PersistenceDurability = 'memory-only'

  initialize(): Promise<void> {
    if (!this.initializationPromise) this.initializationPromise = this.initializeRepository()
    return this.initializationPromise
  }

  private async initializeRepository(): Promise<void> {
    this.storage = usableLocalStorage()
    const fallbackState = readAuthoritativeFallbackState(this.storage)

    if (fallbackState) {
      this.replaceMemory(fallbackState)
      let database: IDBDatabase | null = null
      try {
        database = await openDatabase()
        await replaceDatabaseState(database, this.memoryState())
        try {
          this.storage?.removeItem(fallbackStateKey)
        } catch {
          database.close()
          this.durability = 'local-storage'
          await this.migrateLegacyRecords()
          return
        }
        this.database = database
        this.durability = 'indexeddb'
      } catch {
        database?.close()
        this.database = null
        this.durability = 'local-storage'
      }
    } else {
      try {
        this.database = await openDatabase()
        this.replaceMemory(await readDatabaseState(this.database))
        this.durability = 'indexeddb'
      } catch {
        this.database?.close()
        this.database = null
        this.replaceMemory(readFallbackState(this.storage))
        this.durability = this.storage ? 'local-storage' : 'memory-only'
      }
    }

    await this.migrateLegacyRecords()
  }

  async getQueue(): Promise<PersistedSubmissionItem[]> {
    await this.initialize()
    const value = await this.readRecord(queueRecordKey)
    if (Array.isArray(value)) return value.filter(isPersistedSubmissionItem).map(clone)
    return []
  }

  async putQueue(items: PersistedSubmissionItem[]): Promise<void> {
    await this.initialize()
    const snapshot = items.map(clone)
    await this.writeRecord(queueRecordKey, snapshot)
    this.mirror(fallbackQueueKey, { items: snapshot, schemaVersion: 'submission-queue-v2' })
  }

  async getCheckpoint(): Promise<CheckpointEnvelopeV4 | null> {
    await this.initialize()
    const value = await this.readRecord(checkpointRecordKey)
    return isCheckpointEnvelope(value) ? clone(value) : null
  }

  async putCheckpoint(checkpoint: CheckpointEnvelopeV4): Promise<void> {
    await this.initialize()
    if (!isValidCheckpointEnvelopeV4(checkpoint)) throw new Error('Checkpoint does not match a reachable Protein Factory state.')
    await this.writeRecord(checkpointRecordKey, clone(checkpoint))
    this.mirror(legacyCheckpointKey, checkpoint)
  }

  async clearCheckpoint(): Promise<void> {
    await this.initialize()
    await this.deleteRecord(checkpointRecordKey)
    try {
      this.getStorage()?.removeItem(legacyCheckpointKey)
    } catch {
      // IndexedDB remains authoritative when the compatibility mirror is unavailable.
    }
  }

  async getResults(): Promise<FinalGamePayload[]> {
    await this.initialize()
    const value = await this.readRecord(resultsRecordKey)
    return Array.isArray(value) ? value.filter(isFinalResult).map(clone) : []
  }

  async putResult(result: FinalGamePayload): Promise<void> {
    const existing = await this.getResults()
    const previous = existing.find((item) => item.attemptId === result.attemptId)
    const next = previous
      ? existing
      : [clone(result), ...existing].slice(0, maxResults)
    await this.writeRecord(resultsRecordKey, next)
    this.mirror(legacyResultKey, previous ?? result)
    this.mirror(legacyHistoryKey, next)
  }

  async replaceRecoverySnapshot(snapshot: RecoverySnapshot): Promise<void> {
    await this.initialize()
    if ((snapshot.checkpoint !== null && !isValidCheckpointEnvelopeV4(snapshot.checkpoint)) ||
      !snapshot.queue.every(isPersistedSubmissionItem) || !snapshot.results.every(isFinalResult)) {
      throw new Error('Recovery snapshot contains invalid records.')
    }
    const next: RepositoryState = {
      [queueRecordKey]: limitQueueHistory(snapshot.queue).map(clone),
      [resultsRecordKey]: snapshot.results.map(clone).slice(0, maxResults),
    }
    if (snapshot.checkpoint) next[checkpointRecordKey] = clone(snapshot.checkpoint)
    await this.replaceState(next)
    this.mirror(fallbackQueueKey, { items: next[queueRecordKey], schemaVersion: 'submission-queue-v2' })
    this.mirror(legacyHistoryKey, next[resultsRecordKey])
    if (snapshot.checkpoint) this.mirror(legacyCheckpointKey, snapshot.checkpoint)
    else {
      try { this.getStorage()?.removeItem(legacyCheckpointKey) } catch { /* Compatibility mirror only. */ }
    }
  }

  private async migrateLegacyRecords(): Promise<void> {
    const storage = this.getStorage()
    if (!storage) return

    if ((await this.readRecord(queueRecordKey)) === undefined) {
      const v2 = readJson(storage, fallbackQueueKey)
      const v1 = readJson(storage, legacyQueueKey)
      const source = isRecord(v2) && Array.isArray(v2.items) ? v2.items : isRecord(v1) && Array.isArray(v1.items) ? v1.items : []
      const migrated = source.filter(isLegacyQueueItem).map(migrateQueueItem)
      if (migrated.length > 0) await this.writeRecord(queueRecordKey, migrated)
    }

    if ((await this.readRecord(checkpointRecordKey)) === undefined) {
      const checkpoint = readJson(storage, legacyCheckpointKey)
      if (isCheckpointEnvelope(checkpoint)) await this.writeRecord(checkpointRecordKey, checkpoint)
    }

    if ((await this.readRecord(resultsRecordKey)) === undefined) {
      const history = readJson(storage, legacyHistoryKey)
      const latest = readJson(storage, legacyResultKey)
      const results = Array.isArray(history) ? history.filter(isFinalResult) : isFinalResult(latest) ? [latest] : []
      if (results.length > 0) await this.writeRecord(resultsRecordKey, results.slice(0, maxResults))
    }
  }

  private async readRecord(key: string): Promise<unknown> {
    return this.memory.get(key)
  }

  private async writeRecord(key: string, value: unknown): Promise<void> {
    const next = this.memoryState()
    next[key as RepositoryRecordKey] = clone(value)
    if (this.database) {
      try {
        const transaction = this.database.transaction(recordStore, 'readwrite')
        transaction.objectStore(recordStore).put(value, key)
        await idbTransaction(transaction)
        this.replaceMemory(next)
        return
      } catch {
        this.replaceMemory(next)
        this.fallBackFromIndexedDb()
        return
      }
    }
    this.persistFallbackState(next)
    this.replaceMemory(next)
  }

  private async deleteRecord(key: string): Promise<void> {
    const next = this.memoryState()
    delete next[key as RepositoryRecordKey]
    if (this.database) {
      try {
        const transaction = this.database.transaction(recordStore, 'readwrite')
        transaction.objectStore(recordStore).delete(key)
        await idbTransaction(transaction)
        this.replaceMemory(next)
        return
      } catch {
        this.replaceMemory(next)
        this.fallBackFromIndexedDb()
        return
      }
    }
    this.persistFallbackState(next)
    this.replaceMemory(next)
  }

  private fallBackFromIndexedDb(): void {
    this.database?.close()
    this.database = null
    this.storage = usableLocalStorage()
    this.persistFallbackState(this.memoryState())
    if (this.durability === 'memory-only') retireStaleDatabase()
  }

  private async replaceState(next: RepositoryState): Promise<void> {
    if (this.database) {
      try {
        await replaceDatabaseState(this.database, next)
        this.replaceMemory(next)
        return
      } catch {
        this.replaceMemory(next)
        this.fallBackFromIndexedDb()
        return
      }
    }
    this.persistFallbackState(next)
    this.replaceMemory(next)
  }

  private persistFallbackState(state: RepositoryState): void {
    if (this.storage) {
      try {
        this.storage.setItem(fallbackStateKey, JSON.stringify({
          records: state,
          schemaVersion: fallbackStateSchemaVersion,
        }))
        this.durability = 'local-storage'
        return
      } catch {
        this.storage = null
      }
    }
    this.durability = 'memory-only'
  }

  private memoryState(): RepositoryState {
    return Object.fromEntries(this.memory.entries()) as RepositoryState
  }

  private replaceMemory(state: RepositoryState): void {
    this.memory.clear()
    for (const key of repositoryRecordKeys) {
      if (state[key] !== undefined) this.memory.set(key, clone(state[key]))
    }
  }

  private getStorage(): Storage | null {
    if (this.storage) return this.storage
    try {
      return typeof window === 'undefined' ? null : window.localStorage
    } catch {
      return null
    }
  }

  private mirror(key: string, value: unknown): void {
    try {
      this.getStorage()?.setItem(key, JSON.stringify(value))
    } catch {
      // Compatibility mirrors are best effort; the selected repository is authoritative.
    }
  }
}

export class MemoryResultRepository implements ResultRepository {
  readonly durability: PersistenceDurability
  private checkpoint: CheckpointEnvelopeV4 | null = null
  private queue: PersistedSubmissionItem[] = []
  private results: FinalGamePayload[] = []

  constructor(durability: PersistenceDurability = 'memory-only') {
    this.durability = durability
  }

  async initialize(): Promise<void> {}
  async getQueue() { return this.queue.map(clone) }
  async putQueue(items: PersistedSubmissionItem[]) { this.queue = items.map(clone) }
  async getCheckpoint() { return this.checkpoint ? clone(this.checkpoint) : null }
  async putCheckpoint(checkpoint: CheckpointEnvelopeV4) { this.checkpoint = clone(checkpoint) }
  async clearCheckpoint() { this.checkpoint = null }
  async getResults() { return this.results.map(clone) }
  async putResult(result: FinalGamePayload) {
    if (!this.results.some((item) => item.attemptId === result.attemptId)) this.results.unshift(clone(result))
    this.results = this.results.slice(0, maxResults)
  }
  async replaceRecoverySnapshot(snapshot: RecoverySnapshot) {
    if ((snapshot.checkpoint !== null && !isValidCheckpointEnvelopeV4(snapshot.checkpoint)) ||
      !snapshot.queue.every(isPersistedSubmissionItem) || !snapshot.results.every(isFinalResult)) {
      throw new Error('Recovery snapshot contains invalid records.')
    }
    this.queue = limitQueueHistory(snapshot.queue.map(clone))
    this.results = snapshot.results.map(clone).slice(0, maxResults)
    this.checkpoint = snapshot.checkpoint ? clone(snapshot.checkpoint) : null
  }
}

function openDatabase(): Promise<IDBDatabase> {
  if (typeof indexedDB === 'undefined') return Promise.reject(new Error('IndexedDB unavailable.'))
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(databaseName, databaseVersion)
    let settled = false
    const timeout = setTimeout(() => {
      if (settled) return
      settled = true
      reject(new Error('IndexedDB open timed out.'))
    }, indexedDbOperationTimeoutMs)
    const fail = (error: Error) => {
      if (settled) return
      settled = true
      clearTimeout(timeout)
      reject(error)
    }
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(recordStore)) request.result.createObjectStore(recordStore)
    }
    request.onsuccess = () => {
      const database = request.result
      if (settled) {
        database.close()
        return
      }
      settled = true
      clearTimeout(timeout)
      resolve(database)
    }
    request.onerror = () => fail(request.error ?? new Error('IndexedDB open failed.'))
    request.onblocked = () => fail(new Error('IndexedDB open blocked.'))
  })
}

function idbRequest<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error ?? new Error('IndexedDB request failed.'))
  })
}

function idbTransaction(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    let settled = false
    const timeout = setTimeout(() => {
      if (settled) return
      settled = true
      try {
        transaction.abort()
      } catch {
        // The transaction may have completed while the timeout callback was queued.
      }
      reject(new Error('IndexedDB transaction timed out.'))
    }, indexedDbOperationTimeoutMs)
    const complete = () => {
      if (settled) return
      settled = true
      clearTimeout(timeout)
      resolve()
    }
    const fail = (error: Error) => {
      if (settled) return
      settled = true
      clearTimeout(timeout)
      reject(error)
    }
    transaction.oncomplete = complete
    transaction.onerror = () => fail(transaction.error ?? new Error('IndexedDB transaction failed.'))
    transaction.onabort = () => fail(transaction.error ?? new Error('IndexedDB transaction aborted.'))
  })
}

async function readDatabaseState(database: IDBDatabase): Promise<RepositoryState> {
  const transaction = database.transaction(recordStore, 'readonly')
  const store = transaction.objectStore(recordStore)
  const requests = repositoryRecordKeys.map(async (key) => [key, await idbRequest(store.get(key))] as const)
  const [entries] = await Promise.all([Promise.all(requests), idbTransaction(transaction)])
  return Object.fromEntries(entries.filter(([, value]) => value !== undefined)) as RepositoryState
}

async function replaceDatabaseState(database: IDBDatabase, state: RepositoryState): Promise<void> {
  const transaction = database.transaction(recordStore, 'readwrite')
  const store = transaction.objectStore(recordStore)
  store.clear()
  for (const key of repositoryRecordKeys) {
    if (state[key] !== undefined) store.put(clone(state[key]), key)
  }
  await idbTransaction(transaction)
}

function usableLocalStorage(): Storage | null {
  if (typeof window === 'undefined') return null
  try {
    const storage = window.localStorage
    const probe = `${fallbackQueueKey}:probe`
    storage.setItem(probe, '1')
    storage.removeItem(probe)
    return storage
  } catch {
    return null
  }
}

function readFallbackState(storage: Storage | null): RepositoryState {
  if (!storage) return {}
  return Object.fromEntries(repositoryRecordKeys.flatMap((key) => {
    const value = readJson(storage, `pirate-protein-factory:repository-v2:${key}`)
    return value === undefined ? [] : [[key, value]]
  })) as RepositoryState
}

function readAuthoritativeFallbackState(storage: Storage | null): RepositoryState | null {
  if (!storage) return null
  const value = readJson(storage, fallbackStateKey)
  if (!isRecord(value) || value.schemaVersion !== fallbackStateSchemaVersion || !isRecord(value.records)) return null
  const records = value.records
  return Object.fromEntries(repositoryRecordKeys.flatMap((key) => (
    Object.hasOwn(records, key) ? [[key, clone(records[key])]] : []
  ))) as RepositoryState
}

function retireStaleDatabase(): void {
  if (typeof indexedDB === 'undefined') return
  try {
    indexedDB.deleteDatabase(databaseName)
  } catch {
    // The current tab still keeps the complete memory snapshot.
  }
}

function readJson(storage: Storage, key: string): unknown {
  try {
    const raw = storage.getItem(key)
    return raw === null ? undefined : JSON.parse(raw)
  } catch {
    return undefined
  }
}

function migrateQueueItem(value: Record<string, unknown>): PersistedSubmissionItem {
  const now = typeof value.updatedAt === 'string' ? value.updatedAt : new Date().toISOString()
  const status = value.status === 'submitted' ? 'submitted' : value.status === 'saving' ? 'local-draft' : String(value.status ?? 'local-draft')
  return {
    attempt: clone(value.attempt as ProteinFactorySubmissionAttempt),
    attemptId: (value.attempt as ProteinFactorySubmissionAttempt).attemptId,
    createdAt: now,
    durability: 'local-storage',
    error: typeof value.error === 'string' ? value.error : undefined,
    retryCount: typeof value.retryCount === 'number' ? value.retryCount : 0,
    status,
    updatedAt: now,
  }
}

export function isPersistedSubmissionItem(value: unknown): value is PersistedSubmissionItem {
  return isRecord(value) && isSubmissionAttempt(value.attempt) && value.attemptId === value.attempt.attemptId &&
    isIsoDate(value.createdAt) && isIsoDate(value.updatedAt) &&
    ['indexeddb', 'local-storage', 'memory-only'].includes(String(value.durability)) &&
    Number.isInteger(value.retryCount) && Number(value.retryCount) >= 0 && typeof value.status === 'string' &&
    (value.error === undefined || typeof value.error === 'string') &&
    (value.lastAttemptAt === undefined || isIsoDate(value.lastAttemptAt)) &&
    (value.nextRetryAt === undefined || isIsoDate(value.nextRetryAt)) &&
    (value.lastHttpStatus === undefined || (Number.isInteger(value.lastHttpStatus) && Number(value.lastHttpStatus) >= 100 && Number(value.lastHttpStatus) <= 599))
}

function isLegacyQueueItem(value: unknown): value is Record<string, unknown> {
  return isRecord(value) && isSubmissionAttempt(value.attempt)
}

function isSubmissionAttempt(value: unknown): value is ProteinFactorySubmissionAttempt {
  return isValidAttempt(value)
}

function isCheckpointEnvelope(value: unknown): value is CheckpointEnvelopeV4 {
  return isValidCheckpointEnvelopeV4(value)
}

export function isFinalResult(value: unknown): value is FinalGamePayload {
  return isRecord(value) && value.schemaVersion === 'protein-factory-v4' && isValidAttempt(value)
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isIsoDate(value: unknown): value is string {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value) &&
    Number.isFinite(Date.parse(value)) && new Date(value).toISOString() === value
}

function clone<T>(value: T): T {
  return typeof structuredClone === 'function' ? structuredClone(value) : JSON.parse(JSON.stringify(value)) as T
}

function limitQueueHistory(items: PersistedSubmissionItem[]): PersistedSubmissionItem[] {
  const pending = items.filter((item) => item.status !== 'submitted')
  const submitted = items.filter((item) => item.status === 'submitted')
    .slice(0, Math.max(0, maxResults - pending.length))
  return [...pending, ...submitted]
}
