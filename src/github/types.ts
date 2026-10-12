export interface GithubSettings {
  pat: string
  owner: string
  repo: string
  branch: string
  folder: string
}

export const DEFAULT_SETTINGS: GithubSettings = {
  pat: '',
  owner: '',
  repo: '',
  branch: 'main',
  folder: 'diagrams',
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

export function friendlyGithubError(err: unknown): string {
  if (err instanceof GithubApiError) {
    switch (err.status) {
      case 401:
        return '认证失败 (401)：PAT 无效或已过期，请在设置中更新。'
      case 403:
        return '权限不足 (403)：PAT 需要 contents:write 权限，或触发了 API 限流。'
      case 404:
        return '未找到 (404)：仓库/分支/路径不存在，或 PAT 无权访问私有仓库。'
      case 409:
        return '冲突 (409)：文件已被他人修改，请重新打开后再保存。'
      case 422:
        return `请求无效 (422)：${err.message}`
      default:
        return `GitHub API 错误 (${err.status})：${err.message}`
    }
  }
  if (err instanceof Error) return err.message
  return String(err)
}
