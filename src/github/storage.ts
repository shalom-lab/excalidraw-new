import {
  DEFAULT_SETTINGS,
  looksLikeErrorPlaceholder,
  parseRepo,
  type GithubSettings,
} from './types'

/** Flat, hyphenated BYOK keys — mandatory convention. */
export const KEY_TOKEN = 'gh-excalidraw-token'
export const KEY_REPO = 'gh-excalidraw-repo'

/** Legacy JSON blob key — removed only on explicit save/clear (not bootstrap). */
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
 * Bootstrap is read-only — never setItem / removeItem here.
 */
export function loadSettings(): GithubSettings {
  try {
    return {
      token: localStorage.getItem(KEY_TOKEN) ?? '',
      repo: localStorage.getItem(KEY_REPO) ?? '',
    }
  } catch {
    return { ...DEFAULT_SETTINGS }
  }
}

/**
 * True only when token + repo are non-empty, repo parses as owner/name,
 * and neither looks like an error / placeholder string.
 */
export function isValidSettings(settings: GithubSettings): boolean {
  const token = settings.token.trim()
  const repo = settings.repo.trim()
  if (!token || looksLikeErrorPlaceholder(token)) return false
  if (!repo || looksLikeErrorPlaceholder(repo)) return false
  if (!parseRepo(repo)) return false
  return true
}

/**
 * Persist settings only after validation passes.
 * Empty / invalid / error-placeholder values are refused and do not
 * overwrite existing correct localStorage entries.
 * @returns true if both keys were written
 */
export function saveSettings(settings: GithubSettings): boolean {
  const token = settings.token.trim()
  const repo = settings.repo.trim()
  if (!isValidSettings({ token, repo })) {
    return false
  }
  try {
    localStorage.setItem(KEY_TOKEN, token)
    localStorage.setItem(KEY_REPO, repo)
    removeLegacy()
    return true
  } catch {
    return false
  }
}

/** clear = removeItem for both keys. */
export function clearSettings(): void {
  try {
    localStorage.removeItem(KEY_TOKEN)
    localStorage.removeItem(KEY_REPO)
    removeLegacy()
  } catch {
    // ignore
  }
}

export function isConfigured(settings: GithubSettings): boolean {
  return isValidSettings(settings)
}
