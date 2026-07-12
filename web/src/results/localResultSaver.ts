import type { FinalGamePayload } from '../types'

const storageKey = 'pirate-protein-factory:last-payload'
const historyStorageKey = 'pirate-protein-factory:payload-history'
const checkpointStorageKey = 'pirate-protein-factory:last-checkpoint'
const maxHistoryItems = 30

export interface LocalSaveResult {
  error?: string
  ok: boolean
}

export function saveLocalResult(payload: FinalGamePayload): LocalSaveResult {
  try {
    window.localStorage.setItem(storageKey, JSON.stringify(payload))
    window.localStorage.setItem(historyStorageKey, JSON.stringify(upsertHistory(payload)))
    return { ok: true }
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : 'Local storage failed.',
    }
  }
}

export function saveLocalCheckpoint(payload: unknown): LocalSaveResult {
  try {
    window.localStorage.setItem(checkpointStorageKey, JSON.stringify(payload))
    return { ok: true }
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : 'Local checkpoint failed.',
    }
  }
}

export function readLocalResult(): FinalGamePayload | null {
  try {
    const raw = window.localStorage.getItem(storageKey)
    return raw ? (JSON.parse(raw) as FinalGamePayload) : null
  } catch {
    return null
  }
}

export function readLocalResultHistory(): FinalGamePayload[] {
  try {
    const raw = window.localStorage.getItem(historyStorageKey)
    return raw ? (JSON.parse(raw) as FinalGamePayload[]) : []
  } catch {
    return []
  }
}

function upsertHistory(payload: FinalGamePayload): FinalGamePayload[] {
  const history = readLocalResultHistory().filter((item) => item.attemptId !== payload.attemptId)
  return [payload, ...history].slice(0, maxHistoryItems)
}
