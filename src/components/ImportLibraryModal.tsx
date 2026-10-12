import { useEffect, useState } from 'react'
import {
  buildLibrariesBrowseUrl,
  getAppReturnUrl,
  normalizeLibraryUrl,
} from '../library/fetchLibrary'

interface Props {
  open: boolean
  onClose: () => void
  /** Open official directory with referrer so Add lands back here. */
  onBrowseOfficial: () => void
  /** Install from a pasted .excalidrawlib URL. */
  onInstallUrl: (url: string) => Promise<void>
  excalidrawId: string | null
}

export function ImportLibraryModal({
  open,
  onClose,
  onBrowseOfficial,
  onInstallUrl,
  excalidrawId,
}: Props) {
  const [url, setUrl] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [msg, setMsg] = useState<string | null>(null)

  useEffect(() => {
    if (open) {
      setUrl('')
      setErr(null)
      setMsg(null)
      setBusy(false)
    }
  }, [open])

  if (!open) return null

  const returnUrl = getAppReturnUrl()
  const exampleDeepLink = `${returnUrl}#addLibrary=${encodeURIComponent(
    'https://libraries.excalidraw.com/libraries/jumpingrivers/r.excalidrawlib',
  )}`

  const handleInstall = async () => {
    const trimmed = url.trim()
    if (!trimmed) {
      setErr('请粘贴 .excalidrawlib 的 URL')
      return
    }
    setBusy(true)
    setErr(null)
    setMsg(null)
    try {
      await onInstallUrl(normalizeLibraryUrl(trimmed))
      setMsg('已导入到图库（已合并并持久化）')
      setUrl('')
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  const browseHref = buildLibrariesBrowseUrl({
    returnUrl,
    token: excalidrawId ?? undefined,
  })

  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true">
      <div className="modal">
        <div className="modal-header">
          <h2>导入官方库</h2>
          <button type="button" className="icon-btn" onClick={onClose} aria-label="关闭">
            ×
          </button>
        </div>

        <p className="hint">
          官方站点 <code>libraries.excalidraw.com</code> 的「Add」会带着{' '}
          <code>#addLibrary=…</code> 跳回<strong>来源页</strong>（默认是
          excalidraw.com）。从本应用打开目录时会带上{' '}
          <code>referrer</code>，安装后会回到这里并自动合并进图库。
        </p>

        <div className="modal-footer" style={{ marginTop: 0, marginBottom: 12 }}>
          <button
            type="button"
            className="btn primary"
            disabled={busy}
            onClick={onBrowseOfficial}
          >
            打开官方库目录
          </button>
          <a
            className="btn"
            href={browseHref}
            target="_excalidraw_libraries"
            rel="noopener noreferrer"
            style={{ textDecoration: 'none', display: 'inline-flex', alignItems: 'center' }}
          >
            新标签打开
          </a>
        </div>

        <p className="hint">
          若在无 referrer 的页面点了 Add、或想安装任意公开库地址，可在下方粘贴{' '}
          <code>.excalidrawlib</code> URL（无需先下载，无需 GitHub Token）：
        </p>

        <label className="field">
          <span>库文件 URL</span>
          <input
            type="url"
            placeholder="https://libraries.excalidraw.com/libraries/…/….excalidrawlib"
            value={url}
            disabled={busy}
            onChange={(e) => setUrl(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') void handleInstall()
            }}
          />
        </label>

        {err && <div className="banner error">{err}</div>}
        {msg && <div className="banner success">{msg}</div>}

        <div className="modal-footer">
          <button type="button" className="btn primary" disabled={busy} onClick={() => void handleInstall()}>
            {busy ? '导入中…' : '从 URL 安装'}
          </button>
          <span className="spacer" />
          <button type="button" className="btn" onClick={onClose} disabled={busy}>
            关闭
          </button>
        </div>

        <p className="hint" style={{ marginTop: 12, marginBottom: 0 }}>
          也可把书签做成：
          <br />
          <code style={{ wordBreak: 'break-all', fontSize: 11 }}>{exampleDeepLink}</code>
        </p>
      </div>
    </div>
  )
}
