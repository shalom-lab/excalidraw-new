import { useEffect, useRef, useState } from 'react'
import { deleteFile, listDiagrams } from '../github/client'
import { isConfigured } from '../github/storage'
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
  /** Paths removed optimistically; drop from reloads until confirmed gone. */
  const pendingGone = useRef<Set<string>>(new Set())

  const load = async (opts?: { quiet?: boolean }) => {
    const gen = ++loadGen.current
    if (!opts?.quiet) setBusy(true)
    setErr(null)
    try {
      if (!isConfigured(settings)) {
        if (gen !== loadGen.current) return
        setErr('未配置 GitHub：请先在设置中填写有效的 PAT 与 owner/repo。')
        setItems([])
        return
      }
      const list = await listDiagrams(settings)
      if (gen !== loadGen.current) return
      // Drop paths we already deleted so a briefly stale Contents listing
      // cannot put them back in the Open modal.
      const gone = pendingGone.current
      const filtered =
        gone.size === 0 ? list : list.filter((i) => !gone.has(i.path))
      for (const path of [...gone]) {
        if (!list.some((i) => i.path === path)) gone.delete(path)
      }
      setItems(filtered)
      setErr(null)
    } catch (e) {
      if (gen !== loadGen.current) return
      setErr(friendlyGithubError(e))
      // Keep prior items on quiet refresh failure; otherwise clear so we never
      // pair an error banner with the "还没有图表文件" empty-state copy.
      if (!opts?.quiet) setItems([])
    } finally {
      if (gen === loadGen.current && !opts?.quiet) setBusy(false)
    }
  }

  useEffect(() => {
    if (open) {
      setPendingDelete(null)
      pendingGone.current.clear()
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
    if (!item.sha?.trim()) {
      setErr(
        '无法删除：缺少文件 sha（GitHub Contents API 删除必须提供 blob sha）。请点「刷新」后重试。',
      )
      return
    }
    setDeleting(item.path)
    setErr(null)
    try {
      await deleteFile(
        settings,
        item.path,
        item.sha,
        `Delete diagram ${item.name}`,
      )
      setPendingDelete(null)
      // Optimistic remove: update the list immediately even if reload is stale.
      pendingGone.current.add(item.path)
      setItems((prev) => prev.filter((i) => i.path !== item.path))
      // Quiet reload syncs with GitHub without flashing "加载中…"
      await load({ quiet: true })
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
        ) : err ? (
          <p className="muted">列表加载失败，请根据上方错误排查后点「刷新」重试。</p>
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
