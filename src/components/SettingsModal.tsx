import { useEffect, useState } from 'react'
import { testConnection } from '../github/client'
import {
  clearSettings,
  isConfigured,
  KEY_REPO,
  KEY_TOKEN,
  saveSettings,
} from '../github/storage'
import {
  DEFAULT_SETTINGS,
  friendlyGithubError,
  maskToken,
  type GithubSettings,
} from '../github/types'

interface Props {
  open: boolean
  initial: GithubSettings
  onClose: () => void
  onSaved: (settings: GithubSettings) => void
}

export function SettingsModal({ open, initial, onClose, onSaved }: Props) {
  const [tokenInput, setTokenInput] = useState('')
  const [repoInput, setRepoInput] = useState('')
  const [saved, setSaved] = useState<GithubSettings>(initial)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)
  const [err, setErr] = useState<string | null>(null)

  useEffect(() => {
    if (open) {
      setSaved(initial)
      setRepoInput(initial.repo)
      // Never prefill full secret into the password field
      setTokenInput('')
      setMsg(null)
      setErr(null)
    }
  }, [open, initial])

  if (!open) return null

  const tokenStatus = saved.token.trim()
    ? `已保存 ${maskToken(saved.token)}`
    : '未设置'
  const repoStatus = saved.repo.trim() ? `已保存 ${saved.repo}` : '未设置'

  const handleSave = () => {
    const next: GithubSettings = {
      // Keep existing token if password field left blank (re-save repo only)
      token: tokenInput.trim() || saved.token,
      repo: repoInput.trim(),
    }
    if (!next.token.trim()) {
      setErr('请填写 GitHub PAT')
      setMsg(null)
      return
    }
    if (!next.repo.includes('/')) {
      setErr('仓库请填写 owner/repo 格式')
      setMsg(null)
      return
    }
    saveSettings(next)
    setSaved(next)
    setTokenInput('')
    onSaved(next)
    setMsg('已保存到浏览器 localStorage（不会提交到仓库）')
    setErr(null)
  }

  const handleClear = () => {
    if (!confirm('确定清除本地 PAT 与仓库设置？')) return
    clearSettings()
    const empty = { ...DEFAULT_SETTINGS }
    setSaved(empty)
    setTokenInput('')
    setRepoInput('')
    onSaved(empty)
    setMsg('已清除本地设置')
    setErr(null)
  }

  const handleTest = async () => {
    setBusy(true)
    setMsg(null)
    setErr(null)
    try {
      const candidate: GithubSettings = {
        token: tokenInput.trim() || saved.token,
        repo: repoInput.trim() || saved.repo,
      }
      if (!isConfigured(candidate)) {
        throw new Error('请先填写 PAT 与 owner/repo')
      }
      const name = await testConnection(candidate)
      setMsg(`连接成功：${name}`)
    } catch (e) {
      setErr(friendlyGithubError(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <header className="modal-header">
          <h2>GitHub BYOK 设置</h2>
          <button type="button" className="icon-btn" onClick={onClose} aria-label="关闭">
            ×
          </button>
        </header>

        <p className="hint">
          PAT 与仓库仅保存在本机 <code>localStorage</code>（
          <code>{KEY_TOKEN}</code> / <code>{KEY_REPO}</code>
          ），不会写入任何代码或提交。需要权限：
          <strong>Contents: Read and write</strong>（经典 token 勾选 <code>repo</code>
          ）。可 Settings 填写，也可事先写入 localStorage；启动会自动读。
        </p>

        <label className="field">
          <span>
            GitHub PAT <span className="status-pill">{tokenStatus}</span>
          </span>
          <input
            type="password"
            autoComplete="off"
            spellCheck={false}
            placeholder={
              saved.token
                ? `已保存 ${maskToken(saved.token)} — 留空保持不变，或粘贴新 PAT`
                : 'ghp_… 或 github_pat_…'
            }
            value={tokenInput}
            onChange={(e) => setTokenInput(e.target.value)}
          />
        </label>

        <label className="field">
          <span>
            仓库 <span className="status-pill">{repoStatus}</span>
          </span>
          <input
            placeholder="owner/repo"
            spellCheck={false}
            value={repoInput}
            onChange={(e) => setRepoInput(e.target.value.trim())}
          />
        </label>

        {msg && <div className="banner success">{msg}</div>}
        {err && <div className="banner error">{err}</div>}

        <footer className="modal-footer">
          <button type="button" className="btn danger" onClick={handleClear}>
            清除
          </button>
          <div className="spacer" />
          <button type="button" className="btn" disabled={busy} onClick={() => void handleTest()}>
            {busy ? '测试中…' : '测试连接'}
          </button>
          <button type="button" className="btn primary" onClick={handleSave}>
            保存
          </button>
        </footer>
      </div>
    </div>
  )
}
