import { useEffect, useRef, useState } from 'react'
import { deleteFile, listDiagrams } from '../github/client'
import {
  DEFAULT_BRANCH,
  DEFAULT_FOLDER,
  friendlyGithubError,
  type GithubContentItem,
  type GithubSettings,
} from '../github/types'

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
  const [pendingDelete, setPendingDelete] = useState<GithubContentItem | null>(
    null,
  )
  const loadGen = useRef(0)

  const load = async () => {
    const gen = ++loadGen.current
    setBusy(true)
    setErr(null)
    try {
      const list = await listDiagrams(settings)
      if (gen !== loadGen.current) return
      setItems(list)
      setErr(null)
    } catch (e) {
      if (gen !== loadGen.current) return
      setErr(friendlyGithubError(e))
      setItems([])
    } finally {
      if (gen === loadGen.current) setBusy(false)
    }
  }

  useEffect(() => {
    if (open) {
      setPendingDelete(null)
      void load()
    } else {
      // Invalidate in-flight loads when the modal closes
      loadGen.current += 1
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  if (!open) return null

  const askDelete = (item: GithubContentItem) => {
    setPendingDelete(item)
  }

  const cancelDelete = () => {
    if (deleting) return
    setPendingDelete(null)
  }

  const confirmDelete = async () => {
    const item = pendingDelete
    if (!item) return
    setDeleting(item.path)
    setErr(null)
    try {
      await deleteFile(settings, item.path, item.sha, `Delete diagram ${item.name}`)
      setPendingDelete(null)
      // load() clears err on success and refreshes the file list
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
          仓库 <code>{settings.repo || '—'}</code> · 分支{' '}
          <code>{DEFAULT_BRANCH}</code> · 目录 <code>{DEFAULT_FOLDER}</code>
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
                  onClick={() => askDelete(item)}
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

      {pendingDelete && (
        <div
          className="modal-backdrop confirm-backdrop"
          onClick={(e) => {
            e.stopPropagation()
            cancelDelete()
          }}
          role="presentation"
        >
          <div
            className="modal narrow confirm-modal"
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="delete-confirm-title"
            onClick={(e) => e.stopPropagation()}
          >
            <header className="modal-header">
              <h2 id="delete-confirm-title">确认删除</h2>
              <button
                type="button"
                className="icon-btn"
                onClick={cancelDelete}
                aria-label="关闭"
                disabled={Boolean(deleting)}
              >
                ×
              </button>
            </header>
            <p className="hint">
              确定删除 GitHub 上的文件？
              <br />
              <code>{pendingDelete.path}</code>
            </p>
            <footer className="modal-footer">
              <div className="spacer" />
              <button
                type="button"
                className="btn"
                onClick={cancelDelete}
                disabled={Boolean(deleting)}
              >
                取消
              </button>
              <button
                type="button"
                className="btn danger"
                onClick={() => void confirmDelete()}
                disabled={Boolean(deleting)}
              >
                {deleting ? '删除中…' : '删除'}
              </button>
            </footer>
          </div>
        </div>
      )}
    </div>
  )
}
