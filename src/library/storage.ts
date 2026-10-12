import type { LibraryItems_anyVersion } from '@excalidraw/excalidraw/types'

/**
 * Persistence adapter for `useHandleLibrary`.
 * Keeps installed library items across reloads (localStorage).
 */

/** localStorage key for persisted library items. */
export const LIBRARY_STORAGE_KEY = 'excalidraw-byok-library'

type Stored = {
  libraryItems: LibraryItems_anyVersion
}

function readStored(): Stored | null {
  try {
    const raw = localStorage.getItem(LIBRARY_STORAGE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as Stored
    if (!parsed || !Array.isArray(parsed.libraryItems)) return null
    return parsed
  } catch {
    return null
  }
}

export const libraryAdapter = {
  async load(_metadata: { source: 'load' | 'save' }): Promise<Stored | null> {
    return readStored()
  },
  async save(libraryData: { libraryItems: LibraryItems_anyVersion }): Promise<void> {
    const payload: Stored = {
      libraryItems: libraryData.libraryItems,
    }
    localStorage.setItem(LIBRARY_STORAGE_KEY, JSON.stringify(payload))
  },
}

export function peekLibraryItemCount(): number {
  return readStored()?.libraryItems.length ?? 0
}
