# Excalidraw BYOK（GitHub 自带密钥存储）

轻量 Vite + React 应用，嵌入官方 `@excalidraw/excalidraw`，用你自己的 **GitHub PAT** 把图表存到你的仓库（Contents API）。密钥只放在浏览器 `localStorage`，不会写入代码、不会提交。

A thin Vite + React host for `@excalidraw/excalidraw` with **Bring Your Own Key** GitHub storage. Each diagram is one file via the Contents API. PAT stays in `localStorage` only.

> 未克隆完整 Excalidraw monorepo（体积大、构建重），而是二次开发可嵌入的 npm 包，本地即可跑通 BYOK。

## GitHub Pages

- **Live URL**: https://shalom-lab.github.io/excalidraw-new/
- Vite `base` is set to `/excalidraw-new/` (project site path).
- Deploy via GitHub Actions (`.github/workflows/deploy-pages.yml`) on push to `main`.
- In the repo: **Settings → Pages → Build and deployment → Source: GitHub Actions**.

## 快速开始 / Run

```bash
cd /workspace/excalidraw-byok
npm install
npm run dev
```

浏览器打开终端里提示的地址（默认 `http://localhost:5173`）。

生产构建：

```bash
npm run build
npm run preview
```

## BYOK 设置（localStorage）

密钥与仓库用**扁平、带连字符**的两个键，**不是** JSON blob：

| Key | Value |
| --- | --- |
| `gh-excalidraw-token` | GitHub PAT（BYOK） |
| `gh-excalidraw-repo` | 单个字符串 `owner/name`，例如 `shalom-lab/repo1`（不要拆成两个 key） |

**可 Settings 填写，也可事先写入 localStorage；启动只读不写。**

1. 点击工具栏 **设置**
2. 粘贴 GitHub PAT（密码框），填写仓库 `owner/repo`（单个输入框）
3. **保存**：仅当 token 非空、repo 为有效 `owner/name` 且非错误占位时才 `setItem`；空串 / 校验失败 **不会** 覆盖已有正确值
4. **清除** 会确认后 `removeItem` 两个键

启动时静默 **读取** 上述两个键到 React state（不 `setItem`、不回写），不弹窗打断：

- 已设置：Settings 显示「已保存」（token 仅掩码末 4 位）；功能可直接用，无需先打开 Settings
- 未设置：显示「未设置」；仅在尝试 GitHub API（打开/保存等）时引导到 Settings

切仓库时在 API 调用处再按 `/` 拆分 `owner` / `name`。不要把 PAT 写进仓库、`.env` 或 Actions 给浏览器用。

### PAT 权限（Scopes）

| Token 类型 | 需要的权限 |
| --- | --- |
| Fine-grained | Repository → **Contents: Read and write**；选中目标仓库 |
| Classic | 勾选 **`repo`**（私有仓）；仅公有仓可试 `public_repo` |

不要把 PAT 提交进 git。本项目 `.gitignore` 已忽略常见密钥文件；设置 UI 也只写 `localStorage`。

## 功能

- **顶栏**：右侧操作为 icon-only，`title` / `aria-label` 显示完整含义
- **新建**：本地空白画布，无需 GitHub
- **打开**：列出 `diagrams/` 下的 `.excalidraw.json` / `.excalidraw` / `.json`，读取 Contents API
- **保存 / 保存到云端**：`PUT` Contents API（有 `sha` 则更新，否则创建；「保存到云端」若文件已存在会自动带 `sha` 覆盖）
- **导入文件**：从本机选择 `.excalidraw` / `.excalidraw.json` / 含 `elements` 的 JSON，在画布打开并可本地编辑；再保存到云端仍走 GitHub
- **删除**：在打开列表里删除仓库中的文件
- **导入官方库**：从 [libraries.excalidraw.com](https://libraries.excalidraw.com) 一键安装（见下），无需先下载 `.excalidrawlib`，也**不需要** GitHub Token
- **错误提示**：401 / 403（权限 vs 限流）/ 404 / 409 / 422 / 网络·CORS（Failed to fetch）中文说明；打开列表时「真无文件」与「请求失败」分开显示，不会叠在一起
- **本地自动草稿**：画布变更防抖写入浏览器 `localStorage`（过大时回退 IndexedDB）；刷新/关闭不丢未保存内容；成功保存到 GitHub 或「新建」时清除。启动若有草稿会恢复并提示「已从本地草稿恢复」。**不替代** GitHub 保存。

画布在未配置 GitHub 时也可正常使用；只有打开/保存需要 PAT。图表默认写到分支 `main`、目录 `diagrams/`（非 BYOK 键，应用内默认）。

## 仓库文件布局示例

```text
your-repo/
└── diagrams/
    ├── architecture.excalidraw.json
    └── sprint-board.excalidraw.json
```

文件内容为标准 Excalidraw JSON（`type` / `version` / `elements` / `appState` / `files`）。

## API 与 CORS

默认 **浏览器直连** `https://api.github.com`（GitHub 支持 CORS + `Authorization`）。

请求头必须落在 GitHub 的 `Access-Control-Allow-Headers` 内（含 `Authorization`、`X-GitHub-Api-Version` 等）。**不要**自设 `Cache-Control` 等未允许的头——浏览器会在 CORS 预检阶段失败并表现为 `Failed to fetch`（应用内「网络/CORS 失败」），与 401/403/限流无关。防缓存用 `fetch(..., { cache: 'no-store' })` 与查询参数 `_=`。

若遇网络/CORS 问题，**仅开发服务器**有最小代理回退：

- `import.meta.env.DEV` 下直连失败时回退 `/api/github/*`（生产 GitHub Pages 无此代理，避免永久切到 404 路径）
- Vite 代理见 `vite.config.ts` → `https://api.github.com`
- 官方库 CDN：`/api/libraries/*` → `libraries.excalidraw.com`；`/api/github-raw/*` → `raw.githubusercontent.com`（仅开发服务器；生产环境 CDN 已返回 `Access-Control-Allow-Origin: *`）

## 项目结构

```text
excalidraw-byok/
├── src/
│   ├── App.tsx                 # 画布 + 图标工具栏 + 打开/保存/导入文件 + 官方库导入
│   ├── components/
│   │   ├── SettingsModal.tsx   # BYOK 设置（token + owner/repo）
│   │   ├── OpenModal.tsx       # 列出/打开/删除
│   │   ├── SaveModal.tsx       # 保存到云端（文件名）
│   │   └── ImportLibraryModal.tsx  # 打开官方库 / 粘贴 URL 安装
│   ├── draft/
│   │   └── storage.ts          # 本地自动草稿（localStorage / IndexedDB）
│   ├── library/
│   │   ├── fetchLibrary.ts     # 下载 .excalidrawlib + 代理回退 + browse URL
│   │   └── storage.ts          # useHandleLibrary localStorage adapter
│   └── github/
│       ├── client.ts           # Contents API 封装
│       ├── storage.ts          # localStorage：gh-excalidraw-*
│       └── types.ts
├── vite.config.ts              # GitHub / 库 CDN 开发代理
└── package.json
```

## 一键导入官方库（libraries.excalidraw.com）

本应用支持官方「Add to Excalidraw」回流：URL 带 `#addLibrary=<excalidrawlib URL>`（或旧版 `?addLibrary=`）时，会用 `@excalidraw/excalidraw` 的 `useHandleLibrary` 拉取 JSON 并 `updateLibrary({ merge: true })`，再经 adapter 写入 `localStorage`（键 `excalidraw-byok-library`）。

### 推荐用法（侧栏 / 工具栏）

1. 打开左侧 **图库（Library）** → **浏览库 / Libraries**（Excalidraw 内置按钮），或点工具栏 **导入官方库** → **打开官方库目录**。
2. 链接会打开 `https://libraries.excalidraw.com?referrer=<本应用 origin+pathname>&useHash=true&token=<实例 id>&…`。
3. 在目录站点点 **Add to Excalidraw**（对我们的 referrer 会显示为 Add to Excalidraw），浏览器回到本应用并自动安装。
4. `libraryReturnUrl` 已设为当前页（含 GitHub Pages 的 `/excalidraw-new/` 路径），因此不会跳去 excalidraw.com。

Live 示例：https://shalom-lab.github.io/excalidraw-new/

### 若站点默认仍指向 excalidraw.com

直接打开 [libraries.excalidraw.com](https://libraries.excalidraw.com)（没有 `referrer`）时，Add 会跳到 **excalidraw.com**。解决办法：

- **始终从本应用打开目录**（侧栏 Libraries 或工具栏「导入官方库」），这样带有正确 `referrer`；或
- **书签 / 手动深链**：把库地址接到本应用 hash 上，例如：

  ```text
  https://shalom-lab.github.io/excalidraw-new/#addLibrary=https%3A%2F%2Flibraries.excalidraw.com%2Flibraries%2Fjumpingrivers%2Fr.excalidrawlib
  ```

- **粘贴 URL**：工具栏 **导入官方库** → 粘贴 `.excalidrawlib` 直链 → **从 URL 安装**（支持 libraries CDN、GitHub raw / blob、jsDelivr、unpkg）。无需下载文件，无需 GitHub Token。

### 实现要点

| 机制 | 说明 |
| --- | --- |
| `useHandleLibrary` | 监听初始 URL 与 `hashchange`，解析 `#addLibrary` / `?addLibrary` |
| `libraryReturnUrl` | 传给 `<Excalidraw>`，供内置「浏览库」按钮生成 referrer |
| `updateLibrary` | `merge: true`，合并进现有图库并打开图库侧栏 |
| 持久化 | `libraryAdapter` → `localStorage` `excalidraw-byok-library` |
| CORS | 生产直连 CDN；本地开发可回退 Vite `/api/libraries`、`/api/github-raw` |

## 安全说明

- PAT **仅**存在于你的浏览器 `localStorage` 键 `gh-excalidraw-token`
- 仓库路径在 `gh-excalidraw-repo`（`owner/name` 单字符串）
- 清设置或清站点数据即可移除密钥
- 请使用最小权限、可随时撤销的 token
- 从不把密钥写进仓库、`.env` 或 GitHub Actions 供浏览器使用
