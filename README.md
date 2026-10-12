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

## BYOK 设置

1. 点击工具栏 **设置**
2. 粘贴 GitHub PAT，填写 `owner` / `repo` / `branch` / `folder`（默认 `diagrams`）
3. **测试连接** → **保存**
4. **清除本地设置** 可立刻删掉 `localStorage` 中的 PAT

### PAT 权限（Scopes）

| Token 类型 | 需要的权限 |
| --- | --- |
| Fine-grained | Repository → **Contents: Read and write**；选中目标仓库 |
| Classic | 勾选 **`repo`**（私有仓）；仅公有仓可试 `public_repo` |

不要把 PAT 提交进 git。本项目 `.gitignore` 已忽略常见密钥文件；设置 UI 也只写 `localStorage`。

## 功能

- **新建**：本地空白画布，无需 GitHub
- **打开**：列出 `folder` 下的 `.excalidraw.json` / `.excalidraw` / `.json`，读取 Contents API
- **保存 / 另存为**：`PUT` Contents API（有 `sha` 则更新，否则创建；另存为若文件已存在会自动带 `sha` 覆盖）
- **删除**：在打开列表里删除仓库中的文件
- **错误提示**：401 / 403 / 404 / 409 / 422 中文说明

画布在未配置 GitHub 时也可正常使用；只有打开/保存需要 PAT。

## 仓库文件布局示例

```text
your-repo/
└── diagrams/                    # 设置里的 folder path
    ├── architecture.excalidraw.json
    └── sprint-board.excalidraw.json
```

文件内容为标准 Excalidraw JSON（`type` / `version` / `elements` / `appState` / `files`）。

## API 与 CORS

默认 **浏览器直连** `https://api.github.com`（GitHub 支持 CORS + `Authorization`）。

若遇网络/CORS 问题，开发服务器已带最小代理：

- 前端自动回退到 `/api/github/*`
- Vite 代理见 `vite.config.ts` → `https://api.github.com`

## 项目结构

```text
excalidraw-byok/
├── src/
│   ├── App.tsx                 # 画布 + 工具栏 + 打开/保存流程
│   ├── components/
│   │   ├── SettingsModal.tsx   # BYOK 设置
│   │   ├── OpenModal.tsx       # 列出/打开/删除
│   │   └── SaveModal.tsx       # 另存为文件名
│   └── github/
│       ├── client.ts           # Contents API 封装
│       ├── storage.ts          # localStorage
│       └── types.ts
├── vite.config.ts              # 可选 GitHub 代理
└── package.json
```

## 安全说明

- PAT **仅**存在于你的浏览器 `localStorage`（键名 `excalidraw-byok-github-settings`）
- 清设置或清站点数据即可移除密钥
- 请使用最小权限、可随时撤销的 token
