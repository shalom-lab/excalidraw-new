/**
 * Fetch a .excalidrawlib URL with optional Vite-dev proxy fallback
 * (same pattern as the GitHub API proxy).
 *
 * Production (GitHub Pages) relies on CDN CORS
 * (`libraries.excalidraw.com` sends Access-Control-Allow-Origin: *).
 */

const LIBRARIES_ORIGIN = 'https://libraries.excalidraw.com'
const GITHUB_RAW_ORIGIN = 'https://raw.githubusercontent.com'

let preferLibrariesProxy = false
let preferGithubRawProxy = false

function rewriteViaProxy(url: string): string | null {
  try {
    const u = new URL(url)
    if (u.origin === LIBRARIES_ORIGIN) {
      return `/api/libraries${u.pathname}${u.search}`
    }
    if (u.origin === GITHUB_RAW_ORIGIN) {
      return `/api/github-raw${u.pathname}${u.search}`
    }
  } catch {
    // ignore
  }
  return null
}

/**
 * Allowlist for library install URLs (used by useHandleLibrary + paste import).
 * Default package allowlist is only excalidraw.com + one GitHub path;
 * we also accept common CDN / raw hosts.
 */
export function isAllowedLibraryUrl(libraryUrl: string): boolean {
  try {
    const { protocol, hostname, pathname } = new URL(libraryUrl)
    if (protocol !== 'https:' && protocol !== 'http:') return false
    if (/(^|\.)excalidraw\.com$/i.test(hostname)) return true
    if (hostname === 'raw.githubusercontent.com') return true
    if (hostname === 'cdn.jsdelivr.net') return true
    if (hostname === 'unpkg.com') return true
    // github.com blob/raw links (user may paste these)
    if (hostname === 'github.com' && /\/(raw|blob)\//.test(pathname)) return true
    return false
  } catch {
    return false
  }
}

/** Normalize github.com/blob/… → raw.githubusercontent.com/… */
export function normalizeLibraryUrl(input: string): string {
  const trimmed = input.trim()
  try {
    const u = new URL(trimmed)
    if (u.hostname === 'github.com') {
      // https://github.com/owner/repo/blob/branch/path → raw
      const m = u.pathname.match(
        /^\/([^/]+)\/([^/]+)\/(?:blob|raw)\/([^/]+)\/(.+)$/,
      )
      if (m) {
        const [, owner, repo, branch, filePath] = m
        return `https://raw.githubusercontent.com/${owner}/${repo}/${branch}/${filePath}`
      }
    }
    return u.toString()
  } catch {
    return trimmed
  }
}

export async function fetchLibraryBlob(libraryUrl: string): Promise<Blob> {
  const url = normalizeLibraryUrl(libraryUrl)
  if (!isAllowedLibraryUrl(url)) {
    throw new Error(`不允许的库地址：${url}`)
  }

  const tryFetch = async (target: string): Promise<Blob> => {
    const res = await fetch(target)
    if (!res.ok) {
      throw new Error(`下载失败 HTTP ${res.status}`)
    }
    return res.blob()
  }

  const proxyUrl = rewriteViaProxy(url)
  const preferProxy =
    (url.startsWith(LIBRARIES_ORIGIN) && preferLibrariesProxy) ||
    (url.startsWith(GITHUB_RAW_ORIGIN) && preferGithubRawProxy)

  if (preferProxy && proxyUrl) {
    return tryFetch(proxyUrl)
  }

  try {
    return await tryFetch(url)
  } catch (err) {
    if (!proxyUrl) throw err
    // Network/CORS — switch to Vite proxy (dev) and retry
    if (url.startsWith(LIBRARIES_ORIGIN)) preferLibrariesProxy = true
    if (url.startsWith(GITHUB_RAW_ORIGIN)) preferGithubRawProxy = true
    return tryFetch(proxyUrl)
  }
}

/** Build libraries.excalidraw.com URL so "Add" returns to our app via #addLibrary. */
export function buildLibrariesBrowseUrl(opts: {
  returnUrl: string
  token?: string
  theme?: 'light' | 'dark'
}): string {
  const params = new URLSearchParams()
  params.set('target', '_blank')
  params.set('referrer', opts.returnUrl)
  params.set('useHash', 'true')
  if (opts.token) params.set('token', opts.token)
  params.set('theme', opts.theme ?? 'light')
  // Match Excalidraw package VERSIONS.excalidrawLibrary (2)
  params.set('version', '2')
  return `https://libraries.excalidraw.com?${params.toString()}`
}

export function getAppReturnUrl(): string {
  return `${window.location.origin}${window.location.pathname}`
}
