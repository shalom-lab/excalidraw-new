import {
  DEFAULT_BRANCH,
  DEFAULT_FOLDER,
  GithubApiError,
  parseRepo,
  type GithubContentItem,
  type GithubFileContent,
  type GithubSettings,
  type ParsedRepo,
} from './types'

/**
 * Prefer direct browser → api.github.com (GitHub supports CORS).
 * If that fails with a network/CORS error, fall back to the Vite proxy.
 */
let useProxy = false

function baseUrl(): string {
  return useProxy ? '/api/github' : 'https://api.github.com'
}

function requireRepo(settings: GithubSettings): ParsedRepo {
  const parsed = parseRepo(settings.repo)
  if (!parsed) {
    throw new GithubApiError(422, '仓库格式无效或未配置，请使用 owner/repo')
  }
  return parsed
}

function requireToken(settings: GithubSettings): string {
  const token = settings.token.trim()
  if (!token) {
    throw new GithubApiError(401, '未配置 GitHub PAT，请先在设置中填写')
  }
  return token
}

function toNetworkError(cause: unknown): GithubApiError {
  const detail =
    cause instanceof Error && cause.message ? cause.message : 'Failed to fetch'
  return new GithubApiError(0, detail)
}

async function githubFetch(
  settings: GithubSettings,
  path: string,
  init: RequestInit = {},
): Promise<Response> {
  const token = requireToken(settings)
  const url = `${baseUrl()}${path}`
  const headers = new Headers(init.headers)
  headers.set('Accept', 'application/vnd.github+json')
  headers.set('Authorization', `Bearer ${token}`)
  headers.set('X-GitHub-Api-Version', '2022-11-28')
  // Avoid stale Contents listings after mutate (delete/save): browser may
  // otherwise reuse a cached GET and the Open modal keeps showing deleted files.
  headers.set('Cache-Control', 'no-cache')
  if (init.body && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json')
  }

  let res: Response
  try {
    res = await fetch(url, { ...init, headers, cache: 'no-store' })
  } catch (networkErr) {
    // Vite /api/github proxy exists only in `vite dev`. Never flip permanently
    // on static hosts (GitHub Pages) — that path 404s and poisoned later calls.
    if (!useProxy && import.meta.env.DEV) {
      useProxy = true
      try {
        return await githubFetch(settings, path, init)
      } catch {
        useProxy = false
        throw toNetworkError(networkErr)
      }
    }
    throw toNetworkError(networkErr)
  }

  return res
}

async function parseError(res: Response): Promise<never> {
  let message = res.statusText || 'Unknown error'
  try {
    const body = (await res.json()) as { message?: string }
    if (body.message) message = body.message
  } catch {
    // ignore
  }
  if (res.status === 403) {
    const remaining = res.headers.get('X-RateLimit-Remaining')
    if (
      remaining === '0' ||
      /rate limit/i.test(message) ||
      /secondary rate/i.test(message)
    ) {
      throw new GithubApiError(403, 'API rate limit exceeded')
    }
  }
  throw new GithubApiError(res.status, message)
}

function encodeUtf8ToBase64(text: string): string {
  const bytes = new TextEncoder().encode(text)
  let binary = ''
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]!)
  }
  return btoa(binary)
}

function decodeBase64ToUtf8(b64: string): string {
  const binary = atob(b64.replace(/\n/g, ''))
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i)
  }
  return new TextDecoder().decode(bytes)
}

function normalizeFolder(folder: string): string {
  return folder.replace(/^\/+|\/+$/g, '')
}

export function diagramPath(_settings: GithubSettings, filename: string): string {
  const folder = normalizeFolder(DEFAULT_FOLDER)
  const name = filename.endsWith('.excalidraw.json')
    ? filename
    : filename.endsWith('.excalidraw')
      ? `${filename}.json`
      : `${filename}.excalidraw.json`
  return folder ? `${folder}/${name}` : name
}

export async function listDiagrams(
  settings: GithubSettings,
): Promise<GithubContentItem[]> {
  const { owner, name } = requireRepo(settings)
  requireToken(settings)
  const folder = normalizeFolder(DEFAULT_FOLDER)
  // Cache-bust query so intermediaries cannot reuse a pre-delete directory listing.
  const bust = `_=${Date.now()}`
  const path = folder
    ? `/repos/${owner}/${name}/contents/${folder}?ref=${encodeURIComponent(DEFAULT_BRANCH)}&${bust}`
    : `/repos/${owner}/${name}/contents?ref=${encodeURIComponent(DEFAULT_BRANCH)}&${bust}`

  const res = await githubFetch(settings, path)
  if (res.status === 404) {
    // Missing diagrams folder (or empty never-created path) is not an error —
    // first save creates the path via Contents API. Only surface 404 when the
    // repo itself is missing / inaccessible.
    const repoRes = await githubFetch(settings, `/repos/${owner}/${name}`)
    if (repoRes.status === 404) {
      await parseError(repoRes)
    }
    if (!repoRes.ok) await parseError(repoRes)
    return []
  }
  if (!res.ok) await parseError(res)

  const data = (await res.json()) as GithubContentItem[] | GithubContentItem
  if (!Array.isArray(data)) {
    throw new GithubApiError(422, '路径不是目录')
  }

  return data
    .filter(
      (item) =>
        item.type === 'file' &&
        (item.name.endsWith('.excalidraw.json') ||
          item.name.endsWith('.excalidraw') ||
          item.name.endsWith('.json')),
    )
    .sort((a, b) => a.name.localeCompare(b.name))
}

export async function getFile(
  settings: GithubSettings,
  path: string,
): Promise<{ sha: string; text: string }> {
  const { owner, name } = requireRepo(settings)
  const apiPath = `/repos/${owner}/${name}/contents/${path}?ref=${encodeURIComponent(DEFAULT_BRANCH)}`
  const res = await githubFetch(settings, apiPath)
  if (!res.ok) await parseError(res)
  const data = (await res.json()) as GithubFileContent
  if (data.encoding !== 'base64' || typeof data.content !== 'string') {
    throw new GithubApiError(422, '无法解码文件内容')
  }
  return { sha: data.sha, text: decodeBase64ToUtf8(data.content) }
}

export async function putFile(
  settings: GithubSettings,
  path: string,
  contentText: string,
  message: string,
  sha?: string,
): Promise<{ sha: string; path: string }> {
  const { owner, name } = requireRepo(settings)
  const apiPath = `/repos/${owner}/${name}/contents/${path}`
  const body: Record<string, string> = {
    message,
    content: encodeUtf8ToBase64(contentText),
    branch: DEFAULT_BRANCH,
  }
  if (sha) body.sha = sha

  const res = await githubFetch(settings, apiPath, {
    method: 'PUT',
    body: JSON.stringify(body),
  })
  if (!res.ok) await parseError(res)
  const data = (await res.json()) as {
    content: { sha: string; path: string }
  }
  return { sha: data.content.sha, path: data.content.path }
}

export async function deleteFile(
  settings: GithubSettings,
  path: string,
  sha: string,
  message: string,
): Promise<void> {
  const trimmedSha = sha?.trim() ?? ''
  if (!trimmedSha) {
    // GitHub Contents DELETE requires the blob sha; without it the API returns
    // 422 ("sha wasn't supplied"). Fail loudly here so the Open modal can show it.
    throw new GithubApiError(
      422,
      "sha wasn't supplied — GitHub Contents delete requires the file blob sha; refresh the list and try again",
    )
  }
  const { owner, name } = requireRepo(settings)
  const apiPath = `/repos/${owner}/${name}/contents/${path}`
  const res = await githubFetch(settings, apiPath, {
    method: 'DELETE',
    body: JSON.stringify({
      message,
      sha: trimmedSha,
      branch: DEFAULT_BRANCH,
    }),
  })
  if (!res.ok) await parseError(res)
}

export { useProxy }
