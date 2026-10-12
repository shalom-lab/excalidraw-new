import { DEFAULT_SETTINGS, type GithubSettings } from './types'

const STORAGE_KEY = 'excalidraw-byok-github-settings'

export function loadSettings(): GithubSettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return { ...DEFAULT_SETTINGS }
    const parsed = JSON.parse(raw) as Partial<GithubSettings>
    return {
      ...DEFAULT_SETTINGS,
      ...parsed,
      // never leave undefined fields
      pat: parsed.pat ?? '',
      owner: parsed.owner ?? '',
      repo: parsed.repo ?? '',
      branch: parsed.branch || 'main',
      folder: parsed.folder || 'diagrams',
    }
  } catch {
    return { ...DEFAULT_SETTINGS }
  }
}

export function saveSettings(settings: GithubSettings): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(settings))
}

export function clearSettings(): void {
  localStorage.removeItem(STORAGE_KEY)
}

export function isConfigured(settings: GithubSettings): boolean {
  return Boolean(
    settings.pat.trim() &&
      settings.owner.trim() &&
      settings.repo.trim() &&
      settings.branch.trim(),
  )
}
