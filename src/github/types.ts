export interface GithubSettings {
  /** PAT from localStorage key gh-excalidraw-token */
  token: string
  /** owner/name from localStorage key gh-excalidraw-repo */
  repo: string
}

export const DEFAULT_SETTINGS: GithubSettings = {
  token: '',
  repo: '',
}

/** Hardcoded defaults for Contents API (not BYOK keys). */
export const DEFAULT_BRANCH = 'main'
export const DEFAULT_FOLDER = 'diagrams'

export interface ParsedRepo {
  owner: string
  name: string
}

/** Split `owner/name` only when calling GitHub API. */
export function parseRepo(repo: string): ParsedRepo | null {
  const trimmed = repo.trim()
  const slash = trimmed.indexOf('/')
  if (slash <= 0 || slash === trimmed.length - 1) return null
  const owner = trimmed.slice(0, slash).trim()
  const name = trimmed.slice(slash + 1).trim()
  if (!owner || !name || name.includes('/')) return null
  // Reject obvious error / placeholder strings that must never be treated as a repo
  if (looksLikeErrorPlaceholder(owner) || looksLikeErrorPlaceholder(name)) return null
  return { owner, name }
}

/** Values that must never be persisted as token/repo (errors, empties, test junk). */
export function looksLikeErrorPlaceholder(value: string): boolean {
  const v = value.trim()
  if (!v) return true
  if (/^(undefined|null|nan|true|false)$/i.test(v)) return true
  if (/failed to fetch/i.test(v)) return true
  if (/^(error|failed|failure|n\/a|none|test|testing)$/i.test(v)) return true
  if (/api\s*rate\s*limit/i.test(v)) return true
  if (/权限不足|认证失败|未找到|网络请求失败|未配置/.test(v)) return true
  return false
}

export interface GithubContentItem {
  name: string
  path: string
  sha: string
  size: number
  type: 'file' | 'dir' | string
  download_url: string | null
}

export interface GithubFileContent {
  name: string
  path: string
  sha: string
  size: number
  content: string // base64
  encoding: string
}

export class GithubApiError extends Error {
  status: number
  constructor(status: number, message: string) {
    super(message)
    this.name = 'GithubApiError'
    this.status = status
  }
}

function isNetworkFetchError(err: unknown): boolean {
  if (err instanceof TypeError) return true
  if (!(err instanceof Error)) return false
  return /failed to fetch|networkerror|load failed|network request failed/i.test(
    err.message,
  )
}

export function friendlyGithubError(err: unknown): string {
  if (err instanceof GithubApiError) {
    const msg = err.message || ''
    const shaIssue =
      /sha/i.test(msg) ||
      /wasn't supplied/i.test(msg) ||
      /does not match/i.test(msg)
    // status 0 = browser network / CORS (no HTTP response)
    if (err.status === 0 || isNetworkFetchError(err)) {
      return (
        '网络请求失败：无法连接 GitHub API（可能是网络中断、CORS 被拦、' +
        '或浏览器扩展拦截）。请检查网络后重试；并确认设置里已填写有效的 PAT 与仓库。'
      )
    }
    switch (err.status) {
      case 401:
        return '认证失败 (401)：PAT 无效或已过期，请在设置中更新。'
      case 403:
        if (
          /rate limit/i.test(msg) ||
          /secondary rate/i.test(msg) ||
          /API rate limit exceeded/i.test(msg)
        ) {
          return (
            'API 限流 (403)：请求过于频繁，请稍后再试。' +
            '已配置 PAT 时限额更高；也可稍后刷新列表。'
          )
        }
        return (
          '权限不足 (403)：PAT 需要 Contents: Read and write' +
          '（经典 token 勾选 repo），请确认已授权目标仓库。'
        )
      case 404:
        return '未找到 (404)：仓库/分支/路径不存在，或 PAT 无权访问私有仓库。'
      case 409:
        return shaIssue
          ? `冲突 (409)：文件 sha 不匹配（可能已被修改）。请刷新列表后重试。${msg ? ` ${msg}` : ''}`
          : '冲突 (409)：文件已被他人修改，请重新打开后再保存。'
      case 422:
        return shaIssue
          ? `请求无效 (422)：删除/更新需要有效的文件 sha。${msg ? ` ${msg}` : ''} 请刷新列表后重试。`
          : `请求无效 (422)：${msg}`
      default:
        return `GitHub API 错误 (${err.status})：${msg}`
    }
  }
  if (isNetworkFetchError(err)) {
    return (
      '网络请求失败：无法连接 GitHub API（可能是网络中断、CORS 被拦、' +
      '或浏览器扩展拦截）。请检查网络后重试；并确认设置里已填写有效的 PAT 与仓库。'
    )
  }
  if (err instanceof Error) return err.message
  return String(err)
}

/** Mask token for status display — never show full secret. */
export function maskToken(token: string): string {
  const t = token.trim()
  if (!t) return ''
  if (t.length <= 4) return '••••'
  return `••••${t.slice(-4)}`
}
