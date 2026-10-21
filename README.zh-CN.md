# CommandCode Usage

一个轻量级 OpenChamber 扩展，用于查看 CommandCode 用量限额、月度额度及订阅信息，并支持自动刷新和流畅的数字动画。

[English](README.md) | 简体中文

## 功能

- 按 **5 小时、每周、月度** 的顺序显示用量和剩余额度。
- 在会话右侧的 Work Status 状态卡中增加一块 **CommandCode Usage** 读数，可在面板设置中切换两种布局并保存：**紧凑**（一行显示 Token、次数和 5 小时、每周、月度配额）与**明细**（三行读数带进度条）。刷新严格按面板设置的自动刷新间隔执行，并沿用已保存的布局；折叠再展开不会强制取数，只要还没到间隔就直接复用上次读数，重开面板时也是如此；表头提供刷新按钮可手动取数。5 小时窗口缺少重置时间时显示“暂无”。
- 显示 Token 总数、输入/输出 Token 明细、运行总次数和平均每次成本。
- 按消耗额度占比从高到低列出各模型用量，包括 Token 总数及输入/输出明细、请求次数、失败次数和消耗额度。
- 首页提供“活动记录”入口，使用与 Usage breakdown 相同的表格布局列出模型调用记录；默认每次加载 10 条，滚动到底后继续加载。字段包括时间、全部输入、输出 Token、耗时、模型、模式、状态、费用和追踪 ID。
- 在 **用量明细** 和 **活动记录** 的模型名前显示厂商图标。图标来自 models.dev（`/logos/labs/{lab}.svg`），按命名规则匹配（厂商前缀、已知别名、`claude*`/`gpt*`）；解析不到时用 models.dev 的默认图标。
- 可显示订阅套餐及加购额度（接口有返回时）；`Active` 状态不显示。
- 支持手动刷新；面板打开时会自动刷新。可在设置中按 1 分钟步长调整间隔，范围为 1–60 分钟，默认 5 分钟。
- 数字变化时在裁切后的固定高度行框内使用垂直滑动和渐隐效果，进度条平滑过渡；动画遵循系统的减少动态效果设置。
- 可在面板设置中调整界面字体大小、自动刷新间隔和活动记录每页数量，设置会自动保存；字号按 5% 一档在 75%–150% 之间调整并带有复位按钮，默认 100%；活动记录每页数量可选 10、25、50、100，默认 10。
- 首次打开面板时会自动进入设置，方便立即填写 Cookie。
- 支持英文和简体中文界面。
- Cookie、语言、界面字体大小、自动刷新间隔、活动记录每页数量和状态卡布局保存在 OpenChamber 的插件专属存储中，重新打开面板后仍然有效；状态区块还会缓存最近一次读数，未到刷新间隔时可直接显示。

## 环境要求

- OpenChamber **1.24.1 或更高版本**。
- 从源码构建时需要安装 [Bun](https://bun.sh/)；安装已构建的 ZIP 不需要 Bun。

## 安装

### 从 ZIP 安装

1. 项目发布 Release 后，从 GitHub Releases 下载 `commandcode-usage.zip`。
2. 在 OpenChamber 中打开 **Settings → Extensions**，选择安装 ZIP。ZIP 根目录必须直接包含 `package.json`，不要把整个项目父目录再套一层压缩进去。
3. 安装时仔细检查插件代码，并按需批准插件的本地服务。
4. 打开 **CommandCode Usage** 面板。首次打开时会自动进入设置；粘贴你自己的 CommandCode `Cookie` 请求头，选择语言后点击“保存”。

### 从本地目录安装

1. 克隆或下载本仓库。
2. 在插件目录运行 `bun install` 和 `bun run build`，生成面板、状态区块及服务所需的 JavaScript。
3. 在 OpenChamber 中打开 **Settings → Extensions**，添加插件目录。
4. 检查插件代码，并按需批准本地服务。
5. 打开插件面板；如果尚未保存 Cookie，会自动进入设置。填写 Cookie 并保存。

## 构建与打包

在插件目录执行：

```sh
bun install
bun run build
```

Windows 用户在 PowerShell 中运行 `./pack-plugin.ps1`，即可在当前目录生成 `commandcode-usage.zip`。压缩包包含安装和运行所需文件及 MIT `LICENSE`，不包含 README、TypeScript 源码或 `node_modules`。打包脚本会检查必需文件和 ZIP 结构；打包前请确保构建已完成，使 `panel/main.js`、`status/main.js` 和 `service/main.js` 为最新版本。

如果 OpenChamber 提示无法解析或安装 ZIP，请确认 ZIP 是从插件目录生成的，且根目录直接包含 `package.json`、`panel/index.html`、`panel/main.js`、`status/index.html`、`status/main.js`、清单中声明的图标以及 `service/main.js`。清单还必须带有有效的版本号。重新构建并生成 ZIP；不要只改扩展名，也不要手动把整个项目目录嵌套进压缩包。

## Cookie 与隐私

Cookie 是可代表你访问已登录 CommandCode 账户的**敏感凭据**。请只使用自己的 Cookie，切勿将其发布到截图、聊天、源代码、问题报告或公开仓库中。

- 插件将 Cookie 保存在 OpenChamber 的插件专属存储空间中；卸载插件时，该插件的存储空间会被删除。
- 本地服务会筛选 Cookie，只转发识别到的 CommandCode 会话字段（`session_token` 和 `session_data`），不会主动记录或持久化该凭据；Cookie 本身仍保存在 OpenChamber 插件专属存储中，直到被修改或插件卸载。
- 用量请求只发送至 `https://api.commandcode.ai`。本地服务仅监听 `127.0.0.1`，并使用 OpenChamber 提供的服务令牌验证请求。
- 为绘制模型图标，本地服务会代面板向 `https://models.dev/logos/...` 请求 SVG 文件（沙箱内的面板无法直接访问网络）。这些请求只携带厂商名称，不包含 Cookie 或用量数据。
- 插件不会将 Cookie 或用量数据发送给本项目维护者，也不集成第三方分析服务。
- 插件本地服务会在 OpenChamber 授予的权限范围内运行。批准前请阅读源码，尤其是在安装他人提供的构建版本时。

## 数据来源与限制

插件目前会请求以下 CommandCode 接口：

- `GET https://api.commandcode.ai/internal/billing/credits`
- `GET https://api.commandcode.ai/internal/billing/subscriptions`
- `GET https://api.commandcode.ai/internal/usage/summary`
- `GET https://api.commandcode.ai/internal/usage/by-model`
- `GET https://api.commandcode.ai/internal/usage?limit=10`（滚动分页时携带 `cursor`；`limit` 默认 10，可在设置中选择 10、25、50、100）
- `GET https://models.dev/logos/labs/{lab}.svg`（模型名前的厂商图标）

这些是**未公开文档的内部接口**，不是稳定的公开 API。CommandCode 可能随时变更或移除接口，因此用量查询可能暂时或永久失效。面板只展示接口实际返回的数据。

接口返回相应数据时，插件会显示月度余额、Token 总数及输入/输出明细、运行次数和平均每次成本。各模型按消耗额度占比从高到低排列，占比相同则依次按请求次数、模型名排序，展示 Token 总数、输入/输出 Token、请求次数、失败次数和消耗额度。只有套餐 ID 和滚动限额与插件内置的套餐目录相匹配时，才会显示月度已用百分比；无法确认总额度时不会推测百分比。月度重置时间优先使用额度接口返回的数据；没有该数据时使用订阅账期结束时间。状态区块在接口未返回 5 小时窗口的重置时间时，用“暂无”占位。

“活动记录”页面从内部 usage 接口分页读取模型调用记录；默认每页 10 条（可在设置中选择 10、25、50、100），滚动到底后加载下一页。各字段仅在接口返回时显示，未返回的值以短横线表示。追踪 ID 仅展示，不会发送到其他服务。

本项目由社区独立维护，与 CommandCode 无隶属、背书或支持关系。使用时请遵守 CommandCode 的相关条款和政策。

## 常见问题

- **OpenChamber 无法解析或安装 ZIP：** 使用仓库提供的打包脚本重新生成压缩包。确认 ZIP 根目录直接包含 `package.json`，清单中有有效的 `version`，并且所有构建产物都存在。
- **无法读取用量：** 检查网络是否可以访问 `api.commandcode.ai`，并确认 Cookie 仍有效。如果 Cookie 被拒绝或已过期，请从 CommandCode 重新复制 Cookie 请求头并在插件设置中更新。
- **修改源码后面板或服务无法启动：** 重新运行 `bun install` 和 `bun run build`，然后重新加载或安装插件，确保 OpenChamber 使用最新构建的 JavaScript。
- **部分额度没有显示或数据不完整：** 内部接口可能发生变化，也可能是 CommandCode 未向当前账户或套餐返回对应字段。
