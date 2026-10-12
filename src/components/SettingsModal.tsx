import { useEffect, useState } from 'react'
import { testConnection } from '../github/client'
import {
  clearSettings,
  isConfigured,
  saveSettings,
} from '../github/storage'
import {
  DEFAULT_SETTINGS,
  friendlyGithubError,
  type GithubSettings,
} from '../github/types'

interface Props {
  open: boolean
  initial: GithubSettings
  onClose: () => void
  onSaved: (settings: GithubSettings) => void
}

export function SettingsModal({ open, initial, onClose, onSaved }: Props) {
  const [form, setForm] = useState<GithubSettings>(initial)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)
  const [err, setErr] = useState<string | null>(null)

  useEffect(() => {
    if (open) {
      setForm(initial)
      setMsg(null)
      setErr(null)
    }
  }, [open, initial])

  if (!open) return null

  const update = (key: keyof GithubSettings, value: string) => {
    setForm((prev) => ({ ...prev, [key]: value }))
  }

  const handleSave = () => {
    saveSettings(form)
    onSaved(form)
    setMsg('已保存到浏览器 localStorage（不会提交到仓库）')
    setErr(null)
  }

  const handleClear = () => {
    clearSettings()
    const empty = { ...DEFAULT_SETTINGS }
    setForm(empty)
    onSaved(empty)
    setMsg('已清除本地设置')
    setErr(null)
  }

  const handleTest = async () => {
    setBusy(true)
    setMsg(null)
    setErr(null)
    try {
      if (!isConfigured(form)) {
        throw new Error('请先填写 PAT、owner、repo、branch')
      }
      const name = await testConnection(form)
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
          PAT 与仓库信息仅保存在本机 <code>localStorage</code>，不会写入任何代码或提交。
          需要权限：<strong>Contents: Read and write</strong>（经典 token 勾选{' '}
          <code>repo</code>）。
        </p>

        <label className="field">
          <span>GitHub PAT</span>
          <input
            type="password"
            autoComplete="off"
            spellCheck={false}
            placeholder="ghp_… 或 github_pat_…"
            value={form.pat}
            onChange={(e) => update('pat', e.target.value)}
          />
        </label>

        <div className="field-row">
          <label className="field">
            <span>Owner</span>
            <input
              placeholder="username 或 org"
              value={form.owner}
              onChange={(e) => update('owner', e.target.value.trim())}
            />
          </label>
          <label className="field">
            <span>Repo</span>
            <input
              placeholder="my-diagrams"
              value={form.repo}
              onChange={(e) => update('repo', e.target.value.trim())}
            />
          </label>
        </div>

        <div className="field-row">
          <label className="field">
            <span>Branch</span>
            <input
              placeholder="main"
              value={form.branch}
              onChange={(e) => update('branch', e.target.value.trim())}
            />
          </label>
          <label className="field">
            <span>Folder path</span>
            <input
              placeholder="diagrams"
              value={form.folder}
              onChange={(e) => update('folder', e.target.value.trim())}
            />
          </label>
        </div>

        {msg && <div className="banner success">{msg}</div>}
        {err && <div className="banner error">{err}</div>}

        <footer className="modal-footer">
          <button type="button" className="btn danger" onClick={handleClear}>
            清除本地设置
          </button>
          <div className="spacer" />
          <button type="button" className="btn" disabled={busy} onClick={handleTest}>
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
