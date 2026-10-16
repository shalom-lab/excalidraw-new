import type { ReactNode } from 'react'

interface Props {
  open: boolean
  title: string
  children: ReactNode
  confirmLabel?: string
  cancelLabel?: string
  danger?: boolean
  busy?: boolean
  onConfirm: () => void
  onCancel: () => void
}

/** In-app confirm — never use window.alert / confirm / prompt. */
export function ConfirmDialog({
  open,
  title,
  children,
  confirmLabel = '确定',
  cancelLabel = '取消',
  danger = false,
  busy = false,
  onConfirm,
  onCancel,
}: Props) {
  if (!open) return null

  return (
    <div
      className="modal-backdrop confirm-backdrop"
      onClick={(e) => {
        e.stopPropagation()
        if (!busy) onCancel()
      }}
      role="presentation"
    >
      <div
        className="modal narrow confirm-modal"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="app-confirm-title"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="modal-header">
          <h2 id="app-confirm-title">{title}</h2>
          <button
            type="button"
            className="icon-btn"
            onClick={onCancel}
            aria-label="关闭"
            disabled={busy}
          >
            ×
          </button>
        </header>
        <div className="hint">{children}</div>
        <footer className="modal-footer">
          <div className="spacer" />
          <button
            type="button"
            className="btn"
            onClick={onCancel}
            disabled={busy}
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            className={danger ? 'btn danger' : 'btn primary'}
            onClick={onConfirm}
            disabled={busy}
          >
            {busy ? '…' : confirmLabel}
          </button>
        </footer>
      </div>
    </div>
  )
}
