import {
  GithubApiError,
  type GithubContentItem,
  type GithubFileContent,
  type GithubSettings,
} from './types'

/**
 * Prefer direct browser → api.github.com (GitHub supports CORS).
 * If that fails with a network/CORS error, fall back to the Vite proxy.
 */
let useProxy = false

function baseUrl(): string {
  return useProxy ? '/api/github' : 'https://api.github.com'
}

async function githubFetch(
  settings: GithubSettings,
  path: string,
  init: RequestInit = {},
): Promise<Response> {
  const url = `${baseUrl()}${path}`
  const headers = new Headers(init.headers)
  headers.set('Accept', 'application/vnd.github+json')
  headers.set('Authorization', `Bearer ${settings.pat.trim()}`)
  headers.set('X-GitHub-Api-Version', '2022-11-28')
  if (init.body && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json')
  }

  let res: Response
  try {
    res = await fetch(url, { ...init, headers })
  } catch (networkErr) {
    // Likely CORS or offline — switch to Vite proxy once and retry
    if (!useProxy) {
      useProxy = true
      return githubFetch(settings, path, init)
    }
    throw networkErr
  }

  // If direct call somehow returns opaque failure, proxy is already on.
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

export function diagramPath(settings: GithubSettings, filename: string): string {
  const folder = normalizeFolder(settings.folder || 'diagrams')
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
  const folder = normalizeFolder(settings.folder || 'diagrams')
  const path = folder
    ? `/repos/${settings.owner}/${settings.repo}/contents/${folder}?ref=${encodeURIComponent(settings.branch)}`
    : `/repos/${settings.owner}/${settings.repo}/contents?ref=${encodeURIComponent(settings.branch)}`

  const res = await githubFetch(settings, path)
  if (res.status === 404) {
    // folder does not exist yet — treat as empty
    return []
  }
  if (!res.ok) await parseError(res)

  const data = (await res.json()) as GithubContentItem[] | GithubContentItem
  if (!Array.isArray(data)) {
    throw new GithubApiError(422, '路径不是目录，请检查 folder 设置')
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
  const apiPath = `/repos/${settings.owner}/${settings.repo}/contents/${path}?ref=${encodeURIComponent(settings.branch)}`
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
  const apiPath = `/repos/${settings.owner}/${settings.repo}/contents/${path}`
  const body: Record<string, string> = {
    message,
    content: encodeUtf8ToBase64(contentText),
    branch: settings.branch,
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
  const apiPath = `/repos/${settings.owner}/${settings.repo}/contents/${path}`
  const res = await githubFetch(settings, apiPath, {
    method: 'DELETE',
    body: JSON.stringify({
      message,
      sha,
      branch: settings.branch,
    }),
  })
  if (!res.ok) await parseError(res)
}

export async function testConnection(settings: GithubSettings): Promise<string> {
  const path = `/repos/${settings.owner}/${settings.repo}`
  const res = await githubFetch(settings, path)
  if (!res.ok) await parseError(res)
  const data = (await res.json()) as { full_name: string; private: boolean }
  return `${data.full_name}${data.private ? ' (private)' : ' (public)'}`
}

export { useProxy }
