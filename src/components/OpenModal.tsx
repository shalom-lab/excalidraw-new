import { useEffect, useState } from 'react'
import { deleteFile, listDiagrams } from '../github/client'
import { friendlyGithubError, type GithubContentItem, type GithubSettings } from '../github/types'

interface Props {
  open: boolean
  settings: GithubSettings
  onClose: () => void
  onOpen: (item: GithubContentItem) => void
}

export function OpenModal({ open, settings, onClose, onOpen }: Props) {
  const [items, setItems] = useState<GithubContentItem[]>([])
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [deleting, setDeleting] = useState<string | null>(null)

  const load = async () => {
    setBusy(true)
    setErr(null)
    try {
      const list = await listDiagrams(settings)
      setItems(list)
    } catch (e) {
      setErr(friendlyGithubError(e))
      setItems([])
    } finally {
      setBusy(false)
    }
  }

  useEffect(() => {
    if (open) void load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  if (!open) return null

  const handleDelete = async (item: GithubContentItem) => {
    if (!confirm(`确定删除 GitHub 上的文件？\n${item.path}`)) return
    setDeleting(item.path)
    setErr(null)
    try {
      await deleteFile(settings, item.path, item.sha, `Delete diagram ${item.name}`)
      await load()
    } catch (e) {
      setErr(friendlyGithubError(e))
    } finally {
      setDeleting(null)
    }
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <header className="modal-header">
          <h2>打开图表</h2>
          <button type="button" className="icon-btn" onClick={onClose} aria-label="关闭">
            ×
          </button>
        </header>

        <p className="hint">
          仓库 <code>{settings.owner}/{settings.repo}</code> · 分支{' '}
          <code>{settings.branch}</code> · 目录 <code>{settings.folder || '/'}</code>
        </p>

        {err && <div className="banner error">{err}</div>}

        {busy ? (
          <p className="muted">加载中…</p>
        ) : items.length === 0 ? (
          <p className="muted">该目录下还没有图表文件。保存一张新图即可创建。</p>
        ) : (
          <ul className="file-list">
            {items.map((item) => (
              <li key={item.path}>
                <button
                  type="button"
                  className="file-name"
                  onClick={() => onOpen(item)}
                  title={item.path}
                >
                  {item.name}
                </button>
                <span className="file-meta">{(item.size / 1024).toFixed(1)} KB</span>
                <button
                  type="button"
                  className="btn danger small"
                  disabled={deleting === item.path}
                  onClick={() => void handleDelete(item)}
                >
                  {deleting === item.path ? '…' : '删除'}
                </button>
              </li>
            ))}
          </ul>
        )}

        <footer className="modal-footer">
          <button type="button" className="btn" onClick={() => void load()} disabled={busy}>
            刷新
          </button>
          <div className="spacer" />
          <button type="button" className="btn" onClick={onClose}>
            关闭
          </button>
        </footer>
      </div>
    </div>
  )
}
