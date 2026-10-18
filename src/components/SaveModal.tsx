import { useEffect, useState } from 'react'

interface Props {
  open: boolean
  defaultName: string
  folder: string
  onClose: () => void
  onSave: (filename: string) => void
}

export function SaveModal({ open, defaultName, folder, onClose, onSave }: Props) {
  const [name, setName] = useState(defaultName)

  useEffect(() => {
    if (open) setName(defaultName)
  }, [open, defaultName])

  if (!open) return null

  const submit = (e: React.FormEvent) => {
    e.preventDefault()
    const trimmed = name.trim().replace(/[/\\]/g, '-')
    if (!trimmed) return
    onSave(trimmed)
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal narrow" onClick={(e) => e.stopPropagation()}>
        <header className="modal-header">
          <h2>保存到云端</h2>
          <button type="button" className="icon-btn" onClick={onClose} aria-label="关闭">
            ×
          </button>
        </header>

        <form onSubmit={submit}>
          <label className="field">
            <span>文件名（将保存到 {folder || '/'}/）</span>
            <input
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="my-diagram"
            />
          </label>
          <p className="hint">
            若未带扩展名，将自动使用 <code>.excalidraw.json</code>
          </p>
          <footer className="modal-footer">
            <div className="spacer" />
            <button type="button" className="btn" onClick={onClose}>
              取消
            </button>
            <button type="submit" className="btn primary">
              保存
            </button>
          </footer>
        </form>
      </div>
    </div>
  )
}
