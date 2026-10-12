import { DEFAULT_SETTINGS, type GithubSettings } from './types'

/** Flat, hyphenated BYOK keys — mandatory convention. */
export const KEY_TOKEN = 'gh-excalidraw-token'
export const KEY_REPO = 'gh-excalidraw-repo'

/** Legacy JSON blob key — removed on load/save/clear. */
const LEGACY_KEY = 'excalidraw-byok-github-settings'

function removeLegacy(): void {
  try {
    localStorage.removeItem(LEGACY_KEY)
  } catch {
    // ignore
  }
}

/**
 * Silently read both keys from localStorage into settings shape.
 * No modal interrupt — call on App start.
 */
export function loadSettings(): GithubSettings {
  try {
    removeLegacy()
    return {
      token: localStorage.getItem(KEY_TOKEN) ?? '',
      repo: localStorage.getItem(KEY_REPO) ?? '',
    }
  } catch {
    return { ...DEFAULT_SETTINGS }
  }
}

/** save = setItem for each flat key (never a JSON blob of secrets). */
export function saveSettings(settings: GithubSettings): void {
  localStorage.setItem(KEY_TOKEN, settings.token.trim())
  localStorage.setItem(KEY_REPO, settings.repo.trim())
  removeLegacy()
}

/** clear = removeItem for both keys. */
export function clearSettings(): void {
  localStorage.removeItem(KEY_TOKEN)
  localStorage.removeItem(KEY_REPO)
  removeLegacy()
}

export function isConfigured(settings: GithubSettings): boolean {
  return Boolean(settings.token.trim() && settings.repo.trim().includes('/'))
}
