import { Excalidraw, useHandleLibrary } from '@excalidraw/excalidraw'
import type {
  BinaryFiles,
  ExcalidrawImperativeAPI,
} from '@excalidraw/excalidraw/types'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import '@excalidraw/excalidraw/index.css'

import { ImportLibraryModal } from './components/ImportLibraryModal'
import { OpenModal } from './components/OpenModal'
import { SaveModal } from './components/SaveModal'
import { SettingsModal } from './components/SettingsModal'
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

export default function App() {
  const apiRef = useRef<ExcalidrawImperativeAPI | null>(null)
  const [excalidrawAPI, setExcalidrawAPI] =
    useState<ExcalidrawImperativeAPI | null>(null)
  const [settings, setSettings] = useState<GithubSettings>(() => loadSettings())
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [openOpen, setOpenOpen] = useState(false)
  const [saveAsOpen, setSaveAsOpen] = useState(false)
  const [importLibOpen, setImportLibOpen] = useState(false)

  const [currentPath, setCurrentPath] = useState<string | null>(null)
  const [currentSha, setCurrentSha] = useState<string | null>(null)
  const [currentName, setCurrentName] = useState<string>('untitled')
  const [toast, setToast] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [editingTitle, setEditingTitle] = useState(false)
  const [titleDraft, setTitleDraft] = useState('')
  const titleInputRef = useRef<HTMLInputElement | null>(null)
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Force remount when loading a new scene so initialData applies cleanly
  const [sceneKey, setSceneKey] = useState(0)
  const [initialData, setInitialData] = useState<DiagramDoc>(() => emptyDoc())

  const configured = useMemo(() => isConfigured(settings), [settings])

  const showToast = useCallback((message: string, ms = 2800) => {
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current)
    setToast(message)
    toastTimerRef.current = setTimeout(() => {
      setToast(null)
      toastTimerRef.current = null
    }, ms)
  }, [])

  useEffect(() => {
    return () => {
      if (toastTimerRef.current) clearTimeout(toastTimerRef.current)
    }
  }, [])

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

  const handleNew = () => {
    if (
      currentPath &&
      !confirm('新建将清空当前画布（未保存的修改会丢失）。继续？')
    ) {
      return
    }
    applyScene(emptyDoc(), null, null)
    setCurrentName('untitled')
    setError(null)
    showToast('已新建空白画布')
  }

  const handleOpenItem = async (item: GithubContentItem) => {
    setBusy(true)
    setError(null)
    setOpenOpen(false)
    try {
      const { sha, text } = await getFile(settings, item.path)
      const doc = JSON.parse(text) as DiagramDoc
      if (!doc.elements) throw new Error('文件不是有效的 Excalidraw JSON')
      applyScene(doc, item.path, sha)
      showToast(`已打开 ${item.path}`)
    } catch (e) {
      setError(friendlyGithubError(e))
    } finally {
      setBusy(false)
    }
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
          <button type="button" className="btn" onClick={handleNew} disabled={busy}>
            新建
          </button>
          <button
            type="button"
            className="btn"
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
          >
            打开
          </button>
          <button
            type="button"
            className="btn primary"
            disabled={busy}
            onClick={handleSave}
          >
            {busy ? '处理中…' : '保存'}
          </button>
          <button
            type="button"
            className="btn"
            disabled={busy}
            onClick={() => {
              if (!configured) {
                setSettingsOpen(true)
                setError('请先配置 GitHub PAT 与仓库（Settings）')
                return
              }
              setSaveAsOpen(true)
            }}
          >
            另存为
          </button>
          <button
            type="button"
            className="btn"
            disabled={busy}
            onClick={() => setImportLibOpen(true)}
            title="从 libraries.excalidraw.com 一键导入，或粘贴 .excalidrawlib URL"
          >
            导入官方库
          </button>
          <button
            type="button"
            className="btn"
            onClick={() => setSettingsOpen(true)}
            title={configured ? '已保存' : '未设置'}
          >
            设置 · {configured ? '已保存' : '未设置'}
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
        <Excalidraw
          key={sceneKey}
          excalidrawAPI={setApi}
          initialData={{
            elements: initialData.elements as never,
            appState: initialData.appState as never,
            files: initialData.files,
            scrollToContent: true,
          }}
          langCode="zh-CN"
          libraryReturnUrl={libraryReturnUrl}
        />
      </div>

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
