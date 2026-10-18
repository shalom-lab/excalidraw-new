import { Excalidraw, useHandleLibrary } from '@excalidraw/excalidraw'
import type {
  BinaryFiles,
  ExcalidrawImperativeAPI,
} from '@excalidraw/excalidraw/types'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import '@excalidraw/excalidraw/index.css'

import { ConfirmDialog } from './components/ConfirmDialog'
import { ImportLibraryModal } from './components/ImportLibraryModal'
import { OpenModal } from './components/OpenModal'
import { SaveModal } from './components/SaveModal'
import { SettingsModal } from './components/SettingsModal'
import {
  IconCloudSave,
  IconImportFile,
  IconLibrary,
  IconNew,
  IconOpen,
  IconSave,
  IconSettings,
} from './components/ToolbarIcons'
import {
  clearDraft,
  draftHasContent,
  loadDraft,
  saveDraft,
} from './draft/storage'
import { diagramPath, getFile, putFile } from './github/client'
import { isConfigured, loadSettings } from './github/storage'
import {
  DEFAULT_FOLDER,
  friendlyGithubError,
  type GithubContentItem,
  type GithubSettings,
} from './github/types'
import {
  buildLibrariesBrowseUrl,
  fetchLibraryBlob,
  getAppReturnUrl,
  isAllowedLibraryUrl,
  normalizeLibraryUrl,
} from './library/fetchLibrary'
import { libraryAdapter } from './library/storage'
import './App.css'

/** Debounce for local auto-draft writes (ms). */
const DRAFT_DEBOUNCE_MS = 600

interface DiagramDoc {
  type: 'excalidraw'
  version: number
  source?: string
  elements: unknown[]
  appState?: Record<string, unknown>
  files?: BinaryFiles
}

function emptyDoc(): DiagramDoc {
  return {
    type: 'excalidraw',
    version: 2,
    source: 'excalidraw-byok',
    elements: [],
    appState: { viewBackgroundColor: '#ffffff' },
    files: {},
  }
}

function stripAppState(appState: Record<string, unknown> | undefined) {
  if (!appState) return {}
  // Drop ephemeral UI state that Excalidraw docs recommend omitting on save
  const {
    collaborators: _c,
    // keep the rest for round-trip fidelity
    ...rest
  } = appState
  return rest
}


/** Parse a local Excalidraw export / GitHub diagram JSON into DiagramDoc. */
function parseDiagramJson(text: string): DiagramDoc {
  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  } catch {
    throw new Error('无法解析 JSON：文件内容不是合法 JSON')
  }
  if (Array.isArray(parsed)) {
    return {
      type: 'excalidraw',
      version: 2,
      source: 'excalidraw-byok',
      elements: parsed,
      appState: { viewBackgroundColor: '#ffffff' },
      files: {},
    }
  }
  if (
    parsed &&
    typeof parsed === 'object' &&
    Array.isArray((parsed as DiagramDoc).elements)
  ) {
    const doc = parsed as DiagramDoc
    return {
      type: 'excalidraw',
      version: doc.version ?? 2,
      source: doc.source ?? 'excalidraw-byok',
      elements: doc.elements ?? [],
      appState: doc.appState ?? { viewBackgroundColor: '#ffffff' },
      files: doc.files ?? {},
    }
  }
  throw new Error('文件不是有效的 Excalidraw 绘图（缺少 elements）')
}

function nameFromImportFile(filename: string): string {
  return filename
    .replace(/\.excalidraw\.json$/i, '')
    .replace(/\.excalidraw$/i, '')
    .replace(/\.json$/i, '')
    .trim() || 'untitled'
}

export default function App() {
  const apiRef = useRef<ExcalidrawImperativeAPI | null>(null)
  const [excalidrawAPI, setExcalidrawAPI] =
    useState<ExcalidrawImperativeAPI | null>(null)
  const [settings, setSettings] = useState<GithubSettings>(() => loadSettings())
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [openOpen, setOpenOpen] = useState(false)
  const [saveAsOpen, setSaveAsOpen] = useState(false)
  const [importLibOpen, setImportLibOpen] = useState(false)
  const [newConfirmOpen, setNewConfirmOpen] = useState(false)

  const [currentPath, setCurrentPath] = useState<string | null>(null)
  const [currentSha, setCurrentSha] = useState<string | null>(null)
  const [currentName, setCurrentName] = useState<string>('untitled')
  const [toast, setToast] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [editingTitle, setEditingTitle] = useState(false)
  const [titleDraft, setTitleDraft] = useState('')
  const titleInputRef = useRef<HTMLInputElement | null>(null)
  const importFileRef = useRef<HTMLInputElement | null>(null)
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const draftTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const metaRef = useRef({
    path: null as string | null,
    name: 'untitled',
    sha: null as string | null,
  })

  // Force remount when loading a new scene so initialData applies cleanly
  const [sceneKey, setSceneKey] = useState(0)
  const [initialData, setInitialData] = useState<DiagramDoc>(() => emptyDoc())
  const [bootDone, setBootDone] = useState(false)

  const configured = useMemo(() => isConfigured(settings), [settings])

  useEffect(() => {
    metaRef.current = {
      path: currentPath,
      name: currentName,
      sha: currentSha,
    }
  }, [currentPath, currentName, currentSha])

  const showToast = useCallback((message: string, ms = 2800) => {
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current)
    setToast(message)
    toastTimerRef.current = setTimeout(() => {
      setToast(null)
      toastTimerRef.current = null
    }, ms)
  }, [])

  const clearLocalDraft = useCallback(() => {
    if (draftTimerRef.current) {
      clearTimeout(draftTimerRef.current)
      draftTimerRef.current = null
    }
    void clearDraft()
  }, [])

  useEffect(() => {
    return () => {
      if (toastTimerRef.current) clearTimeout(toastTimerRef.current)
      if (draftTimerRef.current) clearTimeout(draftTimerRef.current)
    }
  }, [])

  // Restore local auto-draft before mounting the canvas (refresh/close safety net).
  // Does not replace GitHub save — only a browser-local backup.
  useEffect(() => {
    let cancelled = false
    void (async () => {
      try {
        const draft = await loadDraft()
        if (cancelled) return
        if (draftHasContent(draft) && draft) {
          setInitialData({
            type: 'excalidraw',
            version: 2,
            source: 'excalidraw-byok',
            elements: draft.elements ?? [],
            appState: {
              viewBackgroundColor: '#ffffff',
              ...(draft.appState ?? {}),
              collaborators: undefined,
            },
            files: draft.files ?? {},
          })
          setCurrentPath(draft.path)
          setCurrentSha(draft.sha)
          setCurrentName(draft.name || 'untitled')
          showToast('已从本地草稿恢复')
        }
      } catch {
        // ignore corrupt draft
      } finally {
        if (!cancelled) setBootDone(true)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [showToast])

  useEffect(() => {
    if (editingTitle) {
      titleInputRef.current?.focus()
      titleInputRef.current?.select()
    }
  }, [editingTitle])

  const commitTitle = useCallback(() => {
    const next = titleDraft.trim() || 'untitled'
    setCurrentName(next)
    setEditingTitle(false)
  }, [titleDraft])

  const startEditTitle = useCallback(() => {
    setTitleDraft(currentName || 'untitled')
    setEditingTitle(true)
  }, [currentName])

  const libraryReturnUrl = useMemo(() => {
    if (typeof window === 'undefined') return undefined
    return getAppReturnUrl()
  }, [])

  const setApi = useCallback((api: ExcalidrawImperativeAPI) => {
    apiRef.current = api
    setExcalidrawAPI(api)
  }, [])

  // Official #addLibrary hash/query install + localStorage persistence
  useHandleLibrary({
    excalidrawAPI,
    adapter: libraryAdapter,
    validateLibraryUrl: isAllowedLibraryUrl,
  })

  const readScene = useCallback((): DiagramDoc => {
    const api = apiRef.current
    if (!api) return emptyDoc()
    const elements = api.getSceneElements()
    const appState = api.getAppState() as unknown as Record<string, unknown>
    const files = api.getFiles()
    return {
      type: 'excalidraw',
      version: 2,
      source: 'excalidraw-byok',
      elements: elements as unknown[],
      appState: stripAppState(appState),
      files,
    }
  }, [])

  const applyScene = useCallback((doc: DiagramDoc, path: string | null, sha: string | null) => {
    setInitialData({
      type: 'excalidraw',
      version: doc.version ?? 2,
      source: doc.source ?? 'excalidraw-byok',
      elements: doc.elements ?? [],
      appState: {
        viewBackgroundColor: '#ffffff',
        ...(doc.appState ?? {}),
        collaborators: undefined,
      },
      files: doc.files ?? {},
    })
    setCurrentPath(path)
    setCurrentSha(sha)
    if (path) {
      const base = path.split('/').pop() || 'diagram'
      setCurrentName(base.replace(/\.excalidraw\.json$/i, '').replace(/\.excalidraw$/i, ''))
    }
    setSceneKey((k) => k + 1)
  }, [])

  const handleSceneChange = useCallback(
    (
      elements: readonly unknown[],
      appState: Record<string, unknown>,
      files: BinaryFiles,
    ) => {
      if (draftTimerRef.current) clearTimeout(draftTimerRef.current)
      draftTimerRef.current = setTimeout(() => {
        draftTimerRef.current = null
        const meta = metaRef.current
        void saveDraft({
          path: meta.path,
          name: meta.name,
          sha: meta.sha,
          elements: elements as unknown[],
          appState: stripAppState(appState),
          files,
        })
      }, DRAFT_DEBOUNCE_MS)
    },
    [],
  )

  const doNewCanvas = () => {
    setNewConfirmOpen(false)
    clearLocalDraft()
    applyScene(emptyDoc(), null, null)
    setCurrentName('untitled')
    setError(null)
    showToast('已新建空白画布')
  }

  const handleNew = () => {
    // Confirm only when a GitHub file is open — use in-app dialog, never window.confirm
    if (currentPath) {
      setNewConfirmOpen(true)
      return
    }
    doNewCanvas()
  }

  const handleOpenItem = async (item: GithubContentItem) => {
    setBusy(true)
    setError(null)
    setOpenOpen(false)
    try {
      const { sha, text } = await getFile(settings, item.path)
      const doc = parseDiagramJson(text)
      // Opening a GitHub file replaces the canvas; drop the previous local draft.
      clearLocalDraft()
      applyScene(doc, item.path, sha)
      showToast(`已打开 ${item.path}`)
    } catch (e) {
      setError(friendlyGithubError(e))
    } finally {
      setBusy(false)
    }
  }

  const handleImportFile = (file: File | null) => {
    if (!file) return
    setBusy(true)
    setError(null)
    const reader = new FileReader()
    reader.onload = () => {
      try {
        const text = typeof reader.result === 'string' ? reader.result : ''
        const doc = parseDiagramJson(text)
        // Local import: editable on canvas; not linked to a GitHub path until save.
        clearLocalDraft()
        applyScene(doc, null, null)
        setCurrentName(nameFromImportFile(file.name))
        showToast(`已导入 ${file.name}（本地可编辑，保存到云端走 GitHub）`)
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e)
        setError(`导入失败：${msg}`)
      } finally {
        setBusy(false)
        if (importFileRef.current) importFileRef.current.value = ''
      }
    }
    reader.onerror = () => {
      setError('导入失败：无法读取文件')
      setBusy(false)
      if (importFileRef.current) importFileRef.current.value = ''
    }
    reader.readAsText(file)
  }

  const doSave = async (filenameOrPath: string, isSaveAs: boolean) => {
    if (!configured) {
      setSettingsOpen(true)
      setError('请先配置 GitHub PAT 与仓库')
      return
    }
    setBusy(true)
    setError(null)
    try {
      const doc = readScene()
      const text = JSON.stringify(doc, null, 2)
      const path =
        !isSaveAs && currentPath
          ? currentPath
          : diagramPath(settings, filenameOrPath)

      const result = await putFile(
        settings,
        path,
        text,
        currentSha && !isSaveAs
          ? `Update diagram ${path}`
          : `Save diagram ${path}`,
        !isSaveAs ? currentSha ?? undefined : undefined,
      )

      // If save-as to existing name without sha, GitHub may 422; caller handles.
      setCurrentPath(result.path)
      setCurrentSha(result.sha)
      const base = result.path.split('/').pop() || filenameOrPath
      setCurrentName(base.replace(/\.excalidraw\.json$/i, '').replace(/\.excalidraw$/i, ''))
      // GitHub now has the canonical copy — clear browser draft.
      clearLocalDraft()
      showToast(`已保存 ${result.path}`)
      setSaveAsOpen(false)
    } catch (e) {
      // If save-as hit "sha required" because file exists, retry with sha
      const msg = friendlyGithubError(e)
      if (isSaveAs && msg.includes('422')) {
        try {
          const path = diagramPath(settings, filenameOrPath)
          const existing = await getFile(settings, path)
          const doc = readScene()
          const text = JSON.stringify(doc, null, 2)
          const result = await putFile(
            settings,
            path,
            text,
            `Update diagram ${path}`,
            existing.sha,
          )
          setCurrentPath(result.path)
          setCurrentSha(result.sha)
          setCurrentName(
            result.path
              .split('/')
              .pop()!
              .replace(/\.excalidraw\.json$/i, '')
              .replace(/\.excalidraw$/i, ''),
          )
          clearLocalDraft()
          showToast(`已覆盖保存 ${result.path}`)
          setSaveAsOpen(false)
          setError(null)
          return
        } catch (e2) {
          setError(friendlyGithubError(e2))
          return
        }
      }
      setError(msg)
    } finally {
      setBusy(false)
    }
  }

  const handleSave = () => {
    if (!configured) {
      setSettingsOpen(true)
      setError('请先配置 GitHub PAT 与仓库')
      return
    }
    if (currentPath) {
      void doSave(currentPath, false)
    } else {
      setSaveAsOpen(true)
    }
  }

  const openOfficialLibraries = useCallback(() => {
    const returnUrl = getAppReturnUrl()
    const href = buildLibrariesBrowseUrl({
      returnUrl,
      token: apiRef.current?.id,
    })
    window.open(href, '_excalidraw_libraries')
    showToast(
      '已打开官方库目录；在站点点击 Add 后会带着 #addLibrary 回到本应用并自动安装',
    )
    setImportLibOpen(false)
  }, [showToast])

  const installLibraryFromUrl = useCallback(async (rawUrl: string) => {
    const api = apiRef.current
    if (!api) {
      throw new Error('画布尚未就绪，请稍后再试')
    }
    const url = normalizeLibraryUrl(rawUrl)
    if (!isAllowedLibraryUrl(url)) {
      throw new Error('不允许的库地址（仅支持 excalidraw / GitHub raw / jsDelivr / unpkg）')
    }
    setBusy(true)
    setError(null)
    try {
      const blob = await fetchLibraryBlob(url)
      await api.updateLibrary({
        libraryItems: blob,
        merge: true,
        prompt: false,
        openLibraryMenu: true,
        defaultStatus: 'published',
      })
      showToast(`已导入官方库：${url}`)
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      setError(`导入库失败：${msg}`)
      throw e instanceof Error ? e : new Error(msg)
    } finally {
      setBusy(false)
    }
  }, [showToast])

  return (
    <div className="app">
      <header className="toolbar">
        <div className="brand">
          <strong>Excalidraw</strong>
        </div>
        <div className="toolbar-title">
          {editingTitle ? (
            <input
              ref={titleInputRef}
              className="title-input"
              value={titleDraft}
              aria-label="图表标题"
              onChange={(e) => setTitleDraft(e.target.value)}
              onBlur={commitTitle}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault()
                  commitTitle()
                } else if (e.key === 'Escape') {
                  e.preventDefault()
                  setEditingTitle(false)
                }
              }}
            />
          ) : (
            <button
              type="button"
              className="file-badge title-btn"
              title={
                currentPath
                  ? `${currentPath}（点击重命名）`
                  : '点击重命名'
              }
              onClick={startEditTitle}
            >
              {currentName || 'untitled'}
            </button>
          )}
        </div>
        <div className="actions">
          <input
            ref={importFileRef}
            type="file"
            accept=".excalidraw,.excalidraw.json,.json,application/json"
            className="sr-only"
            aria-hidden="true"
            tabIndex={-1}
            onChange={(e) => {
              const file = e.target.files?.[0] ?? null
              handleImportFile(file)
            }}
          />
          <button
            type="button"
            className="btn icon-only"
            onClick={handleNew}
            disabled={busy}
            title="新建"
            aria-label="新建"
          >
            <IconNew />
          </button>
          <button
            type="button"
            className="btn icon-only"
            disabled={busy}
            onClick={() => {
              if (!configured) {
                setSettingsOpen(true)
                setError('请先配置 GitHub PAT 与仓库（Settings）')
                return
              }
              setOpenOpen(true)
            }}
            title={configured ? '从 GitHub 打开' : '请先配置 GitHub'}
            aria-label={configured ? '从 GitHub 打开' : '请先配置 GitHub'}
          >
            <IconOpen />
          </button>
          <button
            type="button"
            className="btn icon-only"
            disabled={busy}
            onClick={() => importFileRef.current?.click()}
            title="导入文件（.excalidraw / .excalidraw.json / JSON）"
            aria-label="导入文件"
          >
            <IconImportFile />
          </button>
          <button
            type="button"
            className="btn primary icon-only"
            disabled={busy}
            onClick={handleSave}
            title={busy ? '处理中…' : '保存'}
            aria-label={busy ? '处理中' : '保存'}
          >
            <IconSave />
          </button>
          <button
            type="button"
            className="btn icon-only"
            disabled={busy}
            onClick={() => {
              if (!configured) {
                setSettingsOpen(true)
                setError('请先配置 GitHub PAT 与仓库（Settings）')
                return
              }
              setSaveAsOpen(true)
            }}
            title="保存到云端"
            aria-label="保存到云端"
          >
            <IconCloudSave />
          </button>
          <button
            type="button"
            className="btn icon-only"
            disabled={busy}
            onClick={() => setImportLibOpen(true)}
            title="导入官方库：从 libraries.excalidraw.com 一键导入，或粘贴 .excalidrawlib URL"
            aria-label="导入官方库"
          >
            <IconLibrary />
          </button>
          <button
            type="button"
            className="btn icon-only"
            onClick={() => setSettingsOpen(true)}
            title={configured ? '设置（已保存）' : '设置（未设置）'}
            aria-label={configured ? '设置（已保存）' : '设置（未设置）'}
          >
            <IconSettings />
          </button>
        </div>
      </header>

      {error && (
        <div className="toast toast-error" role="alert">
          <span>{error}</span>
          <button type="button" className="linkish" onClick={() => setError(null)}>
            关闭
          </button>
        </div>
      )}
      {!error && toast && (
        <div className="toast toast-info" role="status">
          {toast}
        </div>
      )}

      <div className="canvas">
        {bootDone ? (
          <Excalidraw
            key={sceneKey}
            excalidrawAPI={setApi}
            initialData={{
              elements: initialData.elements as never,
              appState: initialData.appState as never,
              files: initialData.files,
              scrollToContent: true,
            }}
            onChange={(elements, appState, files) => {
              handleSceneChange(
                elements,
                appState as unknown as Record<string, unknown>,
                files,
              )
            }}
            langCode="zh-CN"
            libraryReturnUrl={libraryReturnUrl}
          />
        ) : (
          <div className="boot-placeholder" aria-busy="true">
            加载中…
          </div>
        )}
      </div>

      <ConfirmDialog
        open={newConfirmOpen}
        title="确认新建"
        danger
        confirmLabel="新建"
        onCancel={() => setNewConfirmOpen(false)}
        onConfirm={doNewCanvas}
      >
        <p>
          新建将清空当前画布（未保存的修改会丢失）。
          {currentPath ? (
            <>
              <br />
              当前文件：<code>{currentPath}</code>
            </>
          ) : null}
        </p>
      </ConfirmDialog>

      <SettingsModal
        open={settingsOpen}
        initial={settings}
        onClose={() => setSettingsOpen(false)}
        onSaved={(s) => {
          setSettings(s)
          showToast(
            isConfigured(s)
              ? `已配置 ${s.repo}`
              : '设置已更新（尚未完整配置）',
          )
        }}
      />

      <OpenModal
        open={openOpen}
        settings={settings}
        onClose={() => setOpenOpen(false)}
        onOpen={(item) => void handleOpenItem(item)}
      />

      <SaveModal
        open={saveAsOpen}
        defaultName={currentName || 'untitled'}
        folder={DEFAULT_FOLDER}
        onClose={() => setSaveAsOpen(false)}
        onSave={(filename) => void doSave(filename, true)}
      />

      <ImportLibraryModal
        open={importLibOpen}
        onClose={() => setImportLibOpen(false)}
        onBrowseOfficial={openOfficialLibraries}
        onInstallUrl={installLibraryFromUrl}
        excalidrawId={excalidrawAPI?.id ?? null}
      />
    </div>
  )
}
