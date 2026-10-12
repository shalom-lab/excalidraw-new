import type { BinaryFiles } from '@excalidraw/excalidraw/types'

/** localStorage key for the auto-draft scene (preferred backend). */
export const DRAFT_LS_KEY = 'excalidraw-byok-draft'

const IDB_NAME = 'excalidraw-byok'
const IDB_VERSION = 1
const IDB_STORE = 'draft'
const IDB_KEY = 'scene'

/** Soft size hint before preferring IndexedDB (~4 MiB; LS quota is often ~5 MiB). */
const LS_SOFT_LIMIT = 4 * 1024 * 1024

export type DraftScene = {
  version: 1
  savedAt: number
  /** Which backend last wrote this payload (informational). */
  backend: 'localStorage' | 'indexedDB'
  path: string | null
  name: string
  sha: string | null
  elements: unknown[]
  appState: Record<string, unknown>
  files: BinaryFiles
}

function hasSceneContent(draft: DraftScene): boolean {
  const elements = draft.elements ?? []
  const files = draft.files ?? {}
  return elements.length > 0 || Object.keys(files).length > 0
}

export function draftHasContent(draft: DraftScene | null | undefined): boolean {
  return Boolean(draft && hasSceneContent(draft))
}

function openIdb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(IDB_NAME, IDB_VERSION)
    req.onerror = () => reject(req.error ?? new Error('indexedDB open failed'))
    req.onupgradeneeded = () => {
      const db = req.result
      if (!db.objectStoreNames.contains(IDB_STORE)) {
        db.createObjectStore(IDB_STORE)
      }
    }
    req.onsuccess = () => resolve(req.result)
  })
}

async function idbGet(): Promise<DraftScene | null> {
  try {
    const db = await openIdb()
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(IDB_STORE, 'readonly')
      const store = tx.objectStore(IDB_STORE)
      const req = store.get(IDB_KEY)
      req.onerror = () => reject(req.error ?? new Error('indexedDB get failed'))
      req.onsuccess = () => {
        const value = req.result as DraftScene | undefined
        resolve(value && value.version === 1 ? value : null)
      }
      tx.oncomplete = () => db.close()
    })
  } catch {
    return null
  }
}

async function idbSet(draft: DraftScene): Promise<void> {
  const db = await openIdb()
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(IDB_STORE, 'readwrite')
    const store = tx.objectStore(IDB_STORE)
    const req = store.put(draft, IDB_KEY)
    req.onerror = () => reject(req.error ?? new Error('indexedDB put failed'))
    tx.oncomplete = () => {
      db.close()
      resolve()
    }
    tx.onerror = () => reject(tx.error ?? new Error('indexedDB tx failed'))
  })
}

async function idbClear(): Promise<void> {
  try {
    const db = await openIdb()
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(IDB_STORE, 'readwrite')
      const store = tx.objectStore(IDB_STORE)
      const req = store.delete(IDB_KEY)
      req.onerror = () => reject(req.error ?? new Error('indexedDB delete failed'))
      tx.oncomplete = () => {
        db.close()
        resolve()
      }
      tx.onerror = () => reject(tx.error ?? new Error('indexedDB tx failed'))
    })
  } catch {
    // ignore
  }
}

function readLocalStorage(): DraftScene | null {
  try {
    const raw = localStorage.getItem(DRAFT_LS_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as DraftScene
    if (!parsed || parsed.version !== 1 || !Array.isArray(parsed.elements)) {
      return null
    }
    return parsed
  } catch {
    return null
  }
}

function writeLocalStorage(draft: DraftScene): boolean {
  try {
    const raw = JSON.stringify(draft)
    if (raw.length > LS_SOFT_LIMIT) {
      return false
    }
    localStorage.setItem(DRAFT_LS_KEY, raw)
    return true
  } catch {
    // QuotaExceededError or private mode
    return false
  }
}

function removeLocalStorage(): void {
  try {
    localStorage.removeItem(DRAFT_LS_KEY)
  } catch {
    // ignore
  }
}

/**
 * Load the latest auto-draft. Prefers localStorage; falls back to IndexedDB.
 */
export async function loadDraft(): Promise<DraftScene | null> {
  const fromLs = readLocalStorage()
  if (fromLs) return fromLs
  return idbGet()
}

export type SaveDraftInput = {
  path: string | null
  name: string
  sha: string | null
  elements: unknown[]
  appState: Record<string, unknown>
  files: BinaryFiles
}

/**
 * Persist a draft. Prefers localStorage; uses IndexedDB only when the scene
 * is too large for LS (or LS write fails). Clears the other backend so only
 * one copy remains.
 */
export async function saveDraft(input: SaveDraftInput): Promise<void> {
  const draft: DraftScene = {
    version: 1,
    savedAt: Date.now(),
    backend: 'localStorage',
    path: input.path,
    name: input.name || 'untitled',
    sha: input.sha,
    elements: input.elements,
    appState: input.appState,
    files: input.files ?? {},
  }

  if (!hasSceneContent(draft)) {
    await clearDraft()
    return
  }

  if (writeLocalStorage(draft)) {
    await idbClear()
    return
  }

  const idbDraft: DraftScene = { ...draft, backend: 'indexedDB' }
  await idbSet(idbDraft)
  removeLocalStorage()
}

/** Remove draft from both localStorage and IndexedDB. */
export async function clearDraft(): Promise<void> {
  removeLocalStorage()
  await idbClear()
}
