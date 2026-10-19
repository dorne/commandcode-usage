import { connectHost, HostRequestError } from "@openchamber/sdk"
import { applyHostReady } from "@openchamber/sdk/ui"
import modelLabs from "./model-labs.json"

type WindowUsage = {
  label: string
  used: number
  limit: number
  remaining: number
  percent: number
  resetsAt?: string
}
type Usage = {
  plan?: string
  status?: string
  periodEnd?: string
  monthlyResetsAt?: string
  monthlyRemaining?: number
  monthlyLimit?: number
  purchased?: number
  summary?: UsageSummary
  byModel?: ModelUsageGroup
  windows: WindowUsage[]
}
type UsageSummary = {
    totalTokens?: number
    totalTokensIn?: number
    totalTokensOut?: number
    totalCount?: number
    averageCost?: number
}
type ModelUsage = {
  model: string
  requests?: number
  requestsFailed?: number
  tokensIn?: number
  tokensOut?: number
  tokensTotal?: number
  credits?: number
}
type ModelUsageGroup = {
  models: ModelUsage[]
  window?: {
    from?: string
    to?: string
    periodBasis?: string
  }
}
type UsageLogEntry = {
  id?: string
  createdAt?: string
  tokensIn?: number
  tokensOut?: number
  durationTotal?: number
  model?: string
  mode?: string
  status?: string
  message?: string
  cost?: number
  traceId?: string
}
type Language = "en" | "zh-CN"
const DEFAULT_REFRESH_INTERVAL_MINUTES = 5
const MIN_REFRESH_INTERVAL_MINUTES = 1
const MAX_REFRESH_INTERVAL_MINUTES = 60
const DEFAULT_LOG_PAGE_SIZE = 10
const MIN_LOG_PAGE_SIZE = 1
const MAX_LOG_PAGE_SIZE = 50

const messages = {
  en: {
    pasteHelp: "Paste the Cookie request header copied from CommandCode’s usage page. It is stored in this extension’s OpenChamber data and removed when the extension is uninstalled.",
    cookieLabel: "CommandCode Cookie",
    refresh: "Refresh",
    refreshing: "Refreshing…",
    settings: "Settings",
    save: "Save",
    saving: "Saving…",
    back: "Back",
    sensitive: "Sensitive credential: never share this Cookie in chat or screenshots. It is stored until this extension is uninstalled.",
    plan: "Plan",
    credits: "Credits",
    monthlyRemaining: "monthly credits remaining",
    usedThisMonth: "Used this month",
    allowanceUnknown: "Monthly allowance is not verified for this plan; showing balance without estimating a percentage.",
    topUp: "Top-up credits",
    used: "Used",
    remaining: "Remaining",
    usedPercent: (percent: number, reset?: string) => `${percent}% used${reset ? ` · resets ${reset}` : ""}`,
    noLimits: "No usage limits were returned by CommandCode.",
    pasteCookie: "Paste your CommandCode Cookie header to continue.",
    checking: "Checking credits and plan with CommandCode…",
    localError: (status: number) => `Local service returned HTTP ${status}`,
    expiredCookie: "Cookie was rejected or expired. Copy a fresh Cookie header from CommandCode and try again.",
    invalidCookie: "No valid CommandCode session Cookie was found. Paste the Cookie request header.",
    rateLimited: "CommandCode rate limited this request. Please wait before refreshing.",
    timeout: "The request to CommandCode timed out. Please try again.",
    serviceError: "Could not read CommandCode usage. Check your connection and try again.",
    fiveHour: "5-hour",
    weekly: "Weekly",
    language: "Language",
    english: "English",
    chinese: "简体中文",
    updated: "Updated",
    summary: "Usage summary",
    totalTokens: "Total tokens",
    tokenDetails: "Token details",
    tokenBreakdown: (input: string, output: string) => `Input ${input} · Output ${output}`,
    totalRuns: "Total runs",
    averageCost: "Avg. cost / run",
    textSize: "Text size",
    decreaseTextSize: "Decrease text size",
    increaseTextSize: "Increase text size",
    refreshInterval: "Auto-refresh",
    refreshIntervalMinutes: (minutes: number) => `${minutes} min`,
    decreaseRefreshInterval: "Decrease auto-refresh interval",
    increaseRefreshInterval: "Increase auto-refresh interval",
    summaryUnavailable: "Usage summary is unavailable.",
    byModel: "Usage breakdown",
    usageOverview: "Usage overview",
    modelRequests: "requests",
    modelFailed: (count: number) => `${count} failed`,
    modelCredits: "Credits spent",
    modelTokens: "tokens",
    modelInput: "In",
    modelOutput: "Out",
    modelTotal: "Total",
    modelSpend: "Spend",
    modelSpendShare: "of usage",
    modelWindow: "Window",
    byModelUnavailable: "Usage breakdown is unavailable.",
    log: "Activity",
    logEmpty: "No requests have been recorded yet.",
    logLoading: "Loading…",
    logMore: "Scroll to load more",
    logLoadFailed: "Could not load more. Check your connection and try again.",
    logPageSize: "Activity page size",
    logPageSizeHint: (min: number, max: number, fallback: number) => `Activity entries requested per page (${min}–${max}, default ${fallback}).`,
    retry: "Retry",
    modelIcons: "Model icons",
    updateModelIcons: "Update model icons",
    updatingModelIcons: "Updating…",
    modelIconsHint: "Fetch the latest model → provider mapping from models.dev so models added after this version still get logos.",
    modelIconsNeverUpdated: "Not updated yet",
    modelIconsFailed: "Could not update model icons. Check your connection and try again.",
    timing: "Duration",
    mode: "Mode",
    status: "Status",
    traceId: "Trace ID",
    statusPending: "Pending",
    statusInProgress: "Running",
    statusCompleted: "Completed",
    statusFailed: "Failed",
  },
  "zh-CN": {
    pasteHelp: "粘贴从 CommandCode 用量页面复制的 Cookie 请求头。Cookie 会保存在 OpenChamber 的此插件数据中，卸载插件时自动删除。",
    cookieLabel: "CommandCode Cookie",
    refresh: "刷新",
    refreshing: "刷新中…",
    settings: "设置",
    save: "保存",
    saving: "保存中…",
    back: "返回",
    sensitive: "敏感凭据：请勿在聊天或截图中分享此 Cookie。Cookie 会保留至卸载此插件时删除。",
    plan: "套餐",
    credits: "额度",
    monthlyRemaining: "月度剩余额度",
    usedThisMonth: "本月已用",
    allowanceUnknown: "无法确认此套餐的月度总额度，仅显示余额，不估算使用百分比。",
    topUp: "加购额度",
    used: "已用",
    remaining: "剩余",
    usedPercent: (percent: number, reset?: string) => `已使用 ${percent}%${reset ? ` · 重置时间：${reset}` : ""}`,
    noLimits: "CommandCode 未返回用量限额数据。",
    pasteCookie: "请粘贴 CommandCode Cookie 请求头以继续。",
    checking: "正在查询 CommandCode 额度和套餐…",
    localError: (status: number) => `本地服务返回 HTTP ${status}`,
    expiredCookie: "Cookie 已失效或被拒绝。请从 CommandCode 重新复制 Cookie 请求头后再试。",
    invalidCookie: "未找到有效的 CommandCode 会话 Cookie，请粘贴 Cookie 请求头。",
    rateLimited: "CommandCode 限制了请求频率，请稍后再刷新。",
    timeout: "请求 CommandCode 超时，请重试。",
    serviceError: "无法读取 CommandCode 用量，请检查网络后重试。",
    fiveHour: "5 小时",
    weekly: "每周",
    language: "语言",
    english: "English",
    chinese: "简体中文",
    updated: "更新时间",
    summary: "用量汇总",
    totalTokens: "Token 总数",
    tokenDetails: "Token 明细",
    tokenBreakdown: (input: string, output: string) => `输入 ${input} · 输出 ${output}`,
    totalRuns: "运行总次数",
    averageCost: "平均每次成本",
    textSize: "字号",
    decreaseTextSize: "缩小字号",
    increaseTextSize: "放大字号",
    refreshInterval: "自动刷新",
    refreshIntervalMinutes: (minutes: number) => `${minutes} 分钟`,
    decreaseRefreshInterval: "缩短自动刷新间隔",
    increaseRefreshInterval: "延长自动刷新间隔",
    summaryUnavailable: "暂时无法获取用量汇总。",
    byModel: "用量明细",
    usageOverview: "用量总览",
    modelRequests: "次请求",
    modelFailed: (count: number) => `${count} 次失败`,
    modelCredits: "消耗额度",
    modelTokens: "Token",
    modelInput: "输入",
    modelOutput: "输出",
    modelTotal: "总计",
    modelSpend: "支出",
    modelSpendShare: "占比",
    modelWindow: "统计区间",
    byModelUnavailable: "暂时无法获取用量明细。",
    log: "活动记录",
    logEmpty: "还没有记录到任何请求。",
    logLoading: "正在加载…",
    logMore: "上滑加载更多",
    logLoadFailed: "加载更多失败，请检查网络后重试。",
    logPageSize: "活动记录每页数量",
    logPageSizeHint: (min: number, max: number, fallback: number) => `活动记录每次请求获取的条数，范围 ${min}–${max}，默认 ${fallback}。`,
    retry: "重试",
    modelIcons: "模型图标",
    updateModelIcons: "更新模型图标",
    updatingModelIcons: "更新中…",
    modelIconsHint: "从 models.dev 获取最新的模型到厂商映射，让此版本之后新增的模型也有图标。",
    modelIconsNeverUpdated: "尚未更新",
    modelIconsFailed: "更新模型图标失败，请检查网络后重试。",
    timing: "耗时",
    mode: "模式",
    status: "状态",
    traceId: "追踪 ID",
    statusPending: "等待中",
    statusInProgress: "进行中",
    statusCompleted: "已完成",
    statusFailed: "失败",
  },
} satisfies Record<Language, Record<string, string | ((...args: never[]) => string)>>

const host = connectHost()
const root = document.querySelector<HTMLElement>("#root")!
let cookie = ""
let loading = false
let refreshTimer: ReturnType<typeof setTimeout> | undefined
let nextRefreshAt = 0
let suspendedForPageHide = false
let generation = 0
let language: Language = "en"
let currentUsage: Usage | undefined
let lastUpdatedAt: Date | undefined
let restoring = true
let hostLanguage: Language = "en"
let savedLanguage: Language | undefined
let settingsOpen = false
let showingByModel = false
let logOpen = false
let logEntries: UsageLogEntry[] | undefined
let logNextCursor: string | undefined
let logLoading = false
let logError = ""
// 分页加载失败后暂停自动加载，避免网络恢复前反复触发，等待手动重试。
let logLoadFailed = false
let draftCookie = ""
let draftLanguage: Language = "en"
let fontScale = 1
let refreshIntervalMinutes = DEFAULT_REFRESH_INTERVAL_MINUTES
let logPageSize = DEFAULT_LOG_PAGE_SIZE

function showView(next: "overview" | "model" | "log") {
  showingByModel = next === "model"
  logOpen = next === "log"
}

function normalizeLanguage(value: unknown): Language {
  return typeof value === "string" && value.trim().toLowerCase().replaceAll("_", "-") === "zh-cn" ? "zh-CN" : "en"
}

function t<K extends keyof typeof messages.en>(key: K): (typeof messages.en)[K] {
  return messages[language][key]
}

function setFontScale(value: number) {
  fontScale = Math.max(0.8, Math.min(1.5, Math.round(value * 20) / 20))
  root.style.setProperty("--text-scale", String(fontScale))
  void host.storage.set("fontScale", fontScale).catch(() => {})
  const percentage = root.querySelector<HTMLElement>(".text-size-value")
  if (percentage) percentage.textContent = `${Math.round(fontScale * 100)}%`
  const decrease = root.querySelector<HTMLButtonElement>(".text-size-decrease")
  const increase = root.querySelector<HTMLButtonElement>(".text-size-increase")
  if (decrease) decrease.disabled = fontScale <= 0.8
  if (increase) increase.disabled = fontScale >= 1.5
}

function textSizeControl() {
  const control = el("div", "text-size-control")
  control.setAttribute("role", "group")
  control.setAttribute("aria-label", t("textSize"))
  const decrease = el("button", "text-size-button text-size-decrease", "A−")
  decrease.type = "button"
  decrease.title = t("decreaseTextSize")
  decrease.setAttribute("aria-label", t("decreaseTextSize"))
  decrease.disabled = fontScale <= 0.8
  decrease.addEventListener("click", () => setFontScale(fontScale - 0.05))
  const value = el("span", "text-size-value", `${Math.round(fontScale * 100)}%`)
  const increase = el("button", "text-size-button text-size-increase", "A+")
  increase.type = "button"
  increase.title = t("increaseTextSize")
  increase.setAttribute("aria-label", t("increaseTextSize"))
  increase.disabled = fontScale >= 1.5
  increase.addEventListener("click", () => setFontScale(fontScale + 0.05))
  control.append(decrease, value, increase)
  return control
}

function textSizeField() {
  const field = el("div", "setting-row")
  field.append(el("span", "setting-label", t("textSize")), textSizeControl())
  return field
}

function setRefreshIntervalMinutes(value: number) {
  refreshIntervalMinutes = Math.max(
    MIN_REFRESH_INTERVAL_MINUTES,
    Math.min(MAX_REFRESH_INTERVAL_MINUTES, Math.round(value)),
  )
  void host.storage.set("refreshIntervalMinutes", refreshIntervalMinutes).catch(() => {})
  const display = root.querySelector<HTMLElement>(".refresh-interval-value")
  if (display) display.textContent = t("refreshIntervalMinutes")(refreshIntervalMinutes)
  const decrease = root.querySelector<HTMLButtonElement>(".refresh-interval-decrease")
  const increase = root.querySelector<HTMLButtonElement>(".refresh-interval-increase")
  if (decrease) decrease.disabled = refreshIntervalMinutes <= MIN_REFRESH_INTERVAL_MINUTES
  if (increase) increase.disabled = refreshIntervalMinutes >= MAX_REFRESH_INTERVAL_MINUTES
  scheduleRefresh()
}

function stopRefreshTimer() {
  if (refreshTimer) clearTimeout(refreshTimer)
  refreshTimer = undefined
  nextRefreshAt = 0
}

function scheduleRefresh() {
  stopRefreshTimer()
  if (!cookie || !currentUsage || settingsOpen || logOpen) return
  nextRefreshAt = Date.now() + refreshIntervalMinutes * 60 * 1000
  refreshTimer = setTimeout(() => {
    refreshTimer = undefined
    void load()
  }, Math.max(0, nextRefreshAt - Date.now()))
}

function refreshIfDue() {
  if (document.visibilityState === "hidden" || !nextRefreshAt || Date.now() < nextRefreshAt) return
  void load()
}

function resumeAfterPageShow() {
  if (!suspendedForPageHide) {
    refreshIfDue()
    return
  }
  suspendedForPageHide = false
  loading = false
  void host.storage.get("cookie").then((storedCookie) => {
    if (typeof storedCookie !== "string" || !storedCookie.trim()) return
    cookie = storedCookie
    if (!settingsOpen && !logOpen) void load()
  }).catch(() => {
    if (!settingsOpen && !logOpen) scheduleRefresh()
  })
}

function refreshIntervalField() {
  const field = el("div", "setting-row")
  const control = el("div", "text-size-control refresh-interval-control")
  control.setAttribute("role", "group")
  control.setAttribute("aria-label", t("refreshInterval"))
  const decrease = el("button", "text-size-button refresh-interval-decrease", "−")
  decrease.type = "button"
  decrease.title = t("decreaseRefreshInterval")
  decrease.setAttribute("aria-label", t("decreaseRefreshInterval"))
  decrease.disabled = refreshIntervalMinutes <= MIN_REFRESH_INTERVAL_MINUTES
  decrease.addEventListener("click", () => setRefreshIntervalMinutes(refreshIntervalMinutes - 1))
  const value = el("span", "text-size-value refresh-interval-value", t("refreshIntervalMinutes")(refreshIntervalMinutes))
  const increase = el("button", "text-size-button refresh-interval-increase", "+")
  increase.type = "button"
  increase.title = t("increaseRefreshInterval")
  increase.setAttribute("aria-label", t("increaseRefreshInterval"))
  increase.disabled = refreshIntervalMinutes >= MAX_REFRESH_INTERVAL_MINUTES
  increase.addEventListener("click", () => setRefreshIntervalMinutes(refreshIntervalMinutes + 1))
  control.append(decrease, value, increase)
  field.append(el("span", "setting-label", t("refreshInterval")), control)
  return field
}

function clampLogPageSize(value: unknown) {
  const numeric = typeof value === "number" ? value : Number(value)
  if (!Number.isFinite(numeric)) return DEFAULT_LOG_PAGE_SIZE
  return Math.max(MIN_LOG_PAGE_SIZE, Math.min(MAX_LOG_PAGE_SIZE, Math.round(numeric)))
}

function setLogPageSize(value: unknown, persist = true) {
  logPageSize = clampLogPageSize(value)
  if (persist) void host.storage.set("logPageSize", logPageSize).catch(() => {})
  const input = root.querySelector<HTMLInputElement>(".page-size-input")
  if (input && input.value !== String(logPageSize)) input.value = String(logPageSize)
}

// 手动填写每次请求日志接口获取的条数；输入过程中只在合法范围内即时保存，失焦时统一纠正。
function logPageSizeField() {
  const block = el("div", "setting-block")
  const field = el("div", "setting-row")
  const input = document.createElement("input")
  input.type = "number"
  input.className = "number-input page-size-input"
  input.inputMode = "numeric"
  input.min = String(MIN_LOG_PAGE_SIZE)
  input.max = String(MAX_LOG_PAGE_SIZE)
  input.step = "1"
  input.value = String(logPageSize)
  input.setAttribute("aria-label", t("logPageSize"))
  input.title = t("logPageSizeHint")(MIN_LOG_PAGE_SIZE, MAX_LOG_PAGE_SIZE, DEFAULT_LOG_PAGE_SIZE)
  input.addEventListener("input", () => {
    const value = Number(input.value)
    if (input.value.trim() && Number.isFinite(value) && value >= MIN_LOG_PAGE_SIZE && value <= MAX_LOG_PAGE_SIZE) {
      setLogPageSize(value, false)
    }
  })
  input.addEventListener("change", () => setLogPageSize(input.value.trim() ? Number(input.value) : DEFAULT_LOG_PAGE_SIZE))
  input.addEventListener("blur", () => { input.value = String(logPageSize) })
  const control = el("div", "number-field")
  control.append(input)
  field.append(el("span", "setting-label", t("logPageSize")), control)
  block.append(field, el("p", "caption setting-hint", t("logPageSizeHint")(MIN_LOG_PAGE_SIZE, MAX_LOG_PAGE_SIZE, DEFAULT_LOG_PAGE_SIZE)))
  return block
}

// 设置页：从 models.dev 手动更新运行时映射表，让此版本之后新增的模型也能显示图标。
function modelIconsField() {
  const block = el("div", "setting-block")
  const field = el("div", "setting-row")
  const button = el("button", "secondary update-model-icons", t("updateModelIcons"))
  button.type = "button"
  const status = el("p", "caption setting-hint model-icons-status", modelIconsStatus())
  button.addEventListener("click", () => { void updateModelIcons(button, status) })
  field.append(el("span", "setting-label", t("modelIcons")), button)
  block.append(field, el("p", "caption setting-hint", t("modelIconsHint")), status)
  return block
}

function modelIconsStatus() {
  const updatedAt = modelLabsUpdatedAt ? dateLabel(modelLabsUpdatedAt) : undefined
  return updatedAt ? `${t("updated")}: ${updatedAt}` : t("modelIconsNeverUpdated")
}

async function updateModelIcons(button: HTMLButtonElement, status: HTMLElement) {
  if (button.disabled) return
  const original = button.textContent ?? t("updateModelIcons")
  button.disabled = true
  button.textContent = t("updatingModelIcons")
  status.classList.remove("is-error")
  status.textContent = t("updatingModelIcons")
  try {
    const result = await host.serviceRequest({ method: "POST", path: "/model-labs", body: "{}" })
    const payload = JSON.parse(result.body) as { map?: Record<string, string>; updatedAt?: string }
    if (result.status < 200 || result.status >= 300 || !payload?.map || !Object.keys(payload.map).length) {
      throw new Error(t("localError")(result.status))
    }
    runtimeModelLabs = payload.map
    modelLabsUpdatedAt = payload.updatedAt ?? new Date().toISOString()
    await host.storage.set(MODEL_LABS_STORAGE_KEY, { map: runtimeModelLabs, updatedAt: modelLabsUpdatedAt }).catch(() => {})
    // 映射可能变化，清掉图标缓存让新的 lab 图标在下次渲染时重新获取。
    logoSvgCache.clear()
    logoHosts.clear()
    status.textContent = modelIconsStatus()
  } catch {
    status.classList.add("is-error")
    status.textContent = t("modelIconsFailed")
  } finally {
    button.disabled = false
    button.textContent = original
  }
}

function el<K extends keyof HTMLElementTagNameMap>(tag: K, className?: string, value?: string) {
  const node = document.createElement(tag)
  if (className) node.className = className
  if (value !== undefined) node.textContent = value
  return node
}

function money(value: number) {
  const amount = new Intl.NumberFormat(language === "zh-CN" ? "zh-CN" : "en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value)
  return `$${amount}`
}

function numberFormatter(options: Intl.NumberFormatOptions = {}) {
  return new Intl.NumberFormat(language === "zh-CN" ? "zh-CN" : "en-US", options)
}

function compactNumber(value: number) {
  return numberFormatter({
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(value)
}

function averageCost(value: number) {
  return `$${numberFormatter({
    minimumFractionDigits: 4,
    maximumFractionDigits: 6,
  }).format(value)}`
}

function creditAmount(value: number) {
  return `$${numberFormatter({
    minimumFractionDigits: 2,
    maximumFractionDigits: value < 0.01 ? 6 : value < 1 ? 4 : 2,
  }).format(value)}`
}

function languagePicker(onChange: () => void) {
  const picker = el("div", "setting-row")
  picker.append(el("span", "setting-label", t("language")))
  const select = document.createElement("select")
  select.className = "language-select"
  select.setAttribute("aria-label", t("language"))
  select.disabled = loading
  for (const [value, label] of [["en", t("english")], ["zh-CN", t("chinese")]] as const) {
    const option = document.createElement("option")
    option.value = value
    option.textContent = label
    option.selected = draftLanguage === value
    select.append(option)
  }
  select.addEventListener("change", () => {
    draftLanguage = normalizeLanguage(select.value)
    language = draftLanguage
    onChange()
  })
  picker.append(select)
  return picker
}

function iconButton(icon: "refresh" | "settings" | "chart" | "activity", label: string, className?: string) {
  const button = el("button", `icon-button${className ? ` ${className}` : ""}`)
  button.type = "button"
  button.setAttribute("aria-label", label)
  button.title = label

  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg")
  svg.classList.add(`icon-${icon}`)
  svg.setAttribute("viewBox", "0 0 24 24")
  svg.setAttribute("width", "16")
  svg.setAttribute("height", "16")
  svg.setAttribute("fill", "none")
  svg.setAttribute("stroke", "currentColor")
  svg.setAttribute("stroke-width", "2")
  svg.setAttribute("stroke-linecap", "round")
  svg.setAttribute("stroke-linejoin", "round")
  svg.setAttribute("aria-hidden", "true")

  const paths: Array<[string, Record<string, string>]> = icon === "refresh"
    ? [
        ["path", { d: "M20 11a8.1 8.1 0 0 0-15.5-2M4 4v5h5" }],
        ["path", { d: "M4 13a8.1 8.1 0 0 0 15.5 2M20 20v-5h-5" }],
      ]
    : icon === "settings" ? [
        ["path", { d: "M4 6h16M4 12h16M4 18h16" }],
        ["circle", { cx: "8", cy: "6", r: "2", fill: "var(--oc-background, #fff)" }],
        ["circle", { cx: "16", cy: "12", r: "2", fill: "var(--oc-background, #fff)" }],
        ["circle", { cx: "10", cy: "18", r: "2", fill: "var(--oc-background, #fff)" }],
      ]
    : icon === "activity" ? [
        // 波形自身比其余图标更高更宽，按 0.8 缩放并补偿线宽，使外框与其他图标一致。
        ["path", { d: "M22 12h-2.48a2 2 0 0 0-1.93 1.46l-2.35 8.36a.25.25 0 0 1-.48 0L9.24 2.18a.25.25 0 0 0-.48 0l-2.35 8.36A2 2 0 0 1 4.49 12H2", transform: "translate(2.4 2.4) scale(0.8)", "stroke-width": "2.5" }],
      ]
    : [
        ["path", { d: "M4 19V5M4 19h17" }],
        ["rect", { x: "7", y: "11", width: "3", height: "5", rx: ".5" }],
        ["rect", { x: "12", y: "8", width: "3", height: "8", rx: ".5" }],
        ["rect", { x: "17", y: "4", width: "3", height: "12", rx: ".5" }],
      ]

  for (const [tag, attributes] of paths) {
    const shape = document.createElementNS("http://www.w3.org/2000/svg", tag)
    for (const [name, value] of Object.entries(attributes)) shape.setAttribute(name, value)
    svg.append(shape)
  }
  button.append(svg)
  return button
}

function showLoading() {
  root.replaceChildren()
  const indicator = el("div", "loading-screen")
  indicator.setAttribute("role", "status")
  indicator.setAttribute("aria-label", t("checking"))
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg")
  svg.setAttribute("viewBox", "0 0 24 24")
  svg.setAttribute("width", "28")
  svg.setAttribute("height", "28")
  svg.setAttribute("fill", "none")
  svg.setAttribute("aria-hidden", "true")
  const circle = document.createElementNS("http://www.w3.org/2000/svg", "circle")
  circle.setAttribute("cx", "12")
  circle.setAttribute("cy", "12")
  circle.setAttribute("r", "9")
  circle.setAttribute("stroke", "currentColor")
  circle.setAttribute("stroke-width", "3")
  circle.setAttribute("stroke-dasharray", "42 15")
  svg.append(circle)
  indicator.append(svg)
  root.append(indicator)
}

function showSettings(message?: string, error = false, preserveDraft = false) {
  settingsOpen = true
  if (!preserveDraft) {
    draftCookie = cookie
    draftLanguage = language
  }
  root.replaceChildren()
  const top = el("header", "header")
  const title = el("h1", undefined, t("settings"))
  title.classList.add("settings-title")
  top.append(title)
  root.append(top)
  root.append(el("p", "muted", t("pasteHelp")))

  const label = el("label", "field-label", t("cookieLabel"))
  const input = document.createElement("textarea")
  input.autocomplete = "off"
  input.spellcheck = false
  input.rows = 3
  input.placeholder = "__Secure-commandcode_prod_.session_token=…; …"
  input.value = draftCookie
  input.setAttribute("aria-label", t("cookieLabel"))
  input.addEventListener("input", () => { draftCookie = input.value })
  label.append(input)
  root.append(label)
  root.append(el("p", "caption sensitive-caption", t("sensitive")))
  root.append(languagePicker(() => showSettings(message, error, true)))
  root.append(textSizeField())
  root.append(refreshIntervalField())
  root.append(logPageSizeField())
  root.append(modelIconsField())

  if (message) root.append(el("div", `notice${error ? " error" : ""}`, message))
  const controls = el("div", "controls settings-actions")
  const save = el("button", undefined, t("save"))
  save.addEventListener("click", () => {
    if (save.disabled) return
    save.disabled = true
    save.textContent = t("saving")
    const previousCookie = cookie
    const nextCookie = draftCookie.trim()
    const cookieChanged = nextCookie !== previousCookie
    cookie = nextCookie
    language = draftLanguage
    void host.storage.set("language", language).then(() => {
      savedLanguage = language
      settingsOpen = false
      if (cookieChanged && cookie) void load()
      else if (cookieChanged) {
        currentUsage = undefined
        void host.storage.delete("cookie").catch(() => {})
        stopRefreshTimer()
        showSettings()
      } else if (currentUsage) {
        render(currentUsage)
        scheduleRefresh()
      } else {
        showSettings()
      }
    }).catch(() => {
      showSettings(t("serviceError"), true)
    })
  })
  controls.append(save)
  if (currentUsage) {
    const back = el("button", "secondary", t("back"))
    back.addEventListener("click", () => {
      language = savedLanguage ?? hostLanguage
      render(currentUsage!)
      scheduleRefresh()
    })
    controls.append(back)
  }
  root.append(controls)
}

function row(label: string, value: string, changeKey?: string) {
  const node = el("div", "row")
  const content = el("strong", undefined, value)
  if (changeKey) {
    content.dataset.changeKey = changeKey
    content.dataset.metricText = value
  }
  node.append(el("span", "muted", label), content)
  return node
}

function statCard(label: string, value: string, key: string, detail?: string, detailKey?: string) {
  const card = el("section", "stat-card")
  card.append(el("div", "stat-label", label))
  const amount = el("strong", "stat-value", value)
  amount.dataset.changeKey = key
  amount.dataset.metricText = value
  card.append(amount)
  if (detail) {
    const caption = el("div", "stat-detail", detail)
    if (detailKey) {
      caption.dataset.changeKey = detailKey
      caption.dataset.metricText = detail
    }
    card.append(caption)
  }
  return card
}

function actionButtons() {
  const actions = el("div", "card-actions")
  const refresh = iconButton("refresh", loading ? t("refreshing") : t("refresh"), "refresh-button")
  refresh.disabled = loading
  if (loading) refresh.classList.add("is-loading")
  refresh.addEventListener("click", () => logOpen ? void openLog(true) : void load())
  const byModel = iconButton("chart", showingByModel ? t("usageOverview") : t("byModel"), "view-toggle")
  byModel.setAttribute("aria-pressed", String(showingByModel))
  byModel.classList.toggle("is-active", showingByModel)
  byModel.addEventListener("click", () => {
    showView(showingByModel ? "overview" : "model")
    if (currentUsage) render(currentUsage)
  })
  const activity = iconButton("activity", t("log"), "view-toggle")
  activity.classList.toggle("is-active", logOpen)
  activity.setAttribute("aria-pressed", String(logOpen))
  activity.addEventListener("click", () => {
    if (logOpen) {
      showView("overview")
      if (currentUsage) render(currentUsage)
    } else {
      showView("log")
      void openLog()
    }
  })
  const settings = iconButton("settings", t("settings"), "secondary")
  settings.addEventListener("click", () => {
    stopRefreshTimer()
    showSettings()
  })
  actions.append(refresh, byModel, activity, settings)
  return actions
}

function cardHeading(title: string) {
  const heading = el("div", "card-heading")
  heading.append(el("h2", undefined, title))
  return heading
}

// 滚动区域外的空白也要能滚动，与官网一致。
function forwardWheelTo(section: HTMLElement, list: HTMLElement) {
  section.addEventListener("wheel", (event) => {
    if (Math.abs(event.deltaY) <= Math.abs(event.deltaX) || list.scrollHeight <= list.clientHeight) return
    const scale = event.deltaMode === WheelEvent.DOM_DELTA_LINE ? 16
      : event.deltaMode === WheelEvent.DOM_DELTA_PAGE ? list.clientHeight
        : 1
    list.scrollTop += event.deltaY * scale
    event.preventDefault()
  }, { passive: false })
}

function modelUsageCard(data: Usage) {
  const section = el("section", "card model-card")
  section.append(cardHeading(t("byModel")))
  const group = data.byModel
  if (!group || !group.models.length) {
    section.append(el("p", "summary-unavailable", t("byModelUnavailable")))
    return section
  }

  const totalCredits = group.models.reduce((total, model) => total + Math.max(0, model.credits ?? 0), 0)
  const list = el("div", "model-list")
  list.tabIndex = 0
  list.setAttribute("aria-label", t("byModel"))
  forwardWheelTo(section, list)
  // 按占比（消耗百分比）从高到低排序，无消耗数据的排在后面
  const sortedModels = [...group.models].sort((a, b) => {
    const shareDiff = Math.max(0, b.credits ?? 0) - Math.max(0, a.credits ?? 0)
    if (shareDiff !== 0) return shareDiff
    return (b.requests ?? 0) - (a.requests ?? 0) || a.model.localeCompare(b.model)
  })
  for (const model of sortedModels) {
    const item = el("article", "model-row")
    item.append(modelNameNode(model.model))

    const tokenLine = el("div", "model-token-line")
    if (model.tokensTotal !== undefined) {
      tokenLine.append(el("span", "model-total-token", `${t("modelTotal")} ${compactNumber(model.tokensTotal)}`))
    }
    if (model.tokensIn !== undefined) {
      tokenLine.append(el("span", undefined, `${t("modelInput")} ${compactNumber(model.tokensIn)}`))
    }
    if (model.tokensOut !== undefined) {
      tokenLine.append(el("span", undefined, `${t("modelOutput")} ${compactNumber(model.tokensOut)}`))
    }
    if (tokenLine.childElementCount) item.append(tokenLine)

    const requestLine = el("div", "model-request-line")
    const requestText = model.requests === undefined ? "—" : numberFormatter().format(model.requests)
    const failedText = model.requestsFailed ? ` · ${t("modelFailed")(model.requestsFailed)}` : ""
    requestLine.append(el("span", "model-requests", `${requestText} ${t("modelRequests")}${failedText}`))
    if (model.credits !== undefined) {
      const spend = el("span", "model-spend")
      const credits = el("strong", "model-credits", creditAmount(model.credits))
      credits.title = `${t("modelSpend")}: ${creditAmount(model.credits)}`
      spend.append(credits)
      if (totalCredits > 0) {
        const share = model.credits / totalCredits * 100
        spend.append(el("span", "model-spend-share", `${numberFormatter({ maximumFractionDigits: 1 }).format(share)}% ${t("modelSpendShare")}`))
      }
      requestLine.append(spend)
    }
    item.append(requestLine)
    list.append(item)
  }
  section.append(list)

  if (group.window) {
    const from = dateLabel(group.window.from)
    const to = dateLabel(group.window.to)
    if (from || to) section.append(el("p", "caption", `${t("modelWindow")}: ${from ?? "—"} – ${to ?? "—"}`))
  }
  return section
}

function dateLabel(value?: string) {
  if (!value) return undefined
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? undefined : new Intl.DateTimeFormat(language === "zh-CN" ? "zh-CN" : "en-US", {
    year: "2-digit",
    month: "numeric",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
  }).format(date)
}

function logDuration(value?: number) {
  if (value === undefined || !Number.isFinite(value)) return "—"
  return `${(value / 1000).toFixed(3)}s`
}

function logCost(value?: number) {
  if (value === undefined || !Number.isFinite(value)) return "—"
  const fixed = value.toFixed(4)
  if (value > 0 && Number(fixed) !== value) {
    const decimals = Math.min(Math.ceil(-Math.log10(value)) + 2, 10)
    return `$${value.toFixed(decimals).replace(/0+$/, "")}`
  }
  return `$${fixed}`
}

function logStatusBadge(entry: UsageLogEntry) {
  const status = entry.status ?? "unknown"
  const labels: Record<string, string> = {
    pending: t("statusPending"),
    in_progress: t("statusInProgress"),
    completed: t("statusCompleted"),
    failed: t("statusFailed"),
  }
  const badge = el("span", `chip is-${status.replace(/_/g, "-")}`, labels[status] ?? status.replace(/_/g, " "))
  if (entry.message) badge.title = entry.message
  return badge
}

// 模型图标：models.dev 按厂商 lab 提供 logo（/logos/labs/{lab}.svg），SVG 使用 currentColor。
// model → lab 由 models.dev 的 commandcode provider 生成（scripts/gen-model-labs.mjs）。
const MODEL_LABS: Record<string, string> = modelLabs
// 命名空间前缀与 lab 名称不一致时的别名，用于映射表尚未覆盖的新模型。
const LAB_ALIASES: Record<string, string> = {
  qwen: "alibaba",
  "zai-org": "zhipuai",
  "z-ai": "zhipuai",
  minimaxai: "minimax",
}
// 设置页“更新模型图标”取回的运行时映射，覆盖内置表；解析不到的模型用默认图标。
const DEFAULT_LAB = "default"
const MODEL_LABS_STORAGE_KEY = "modelLabs"
let runtimeModelLabs: Record<string, string> = {}
let modelLabsUpdatedAt: string | undefined

function isStoredModelLabs(value: unknown): value is { map: Record<string, string>; updatedAt?: string } {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false
  const map = (value as { map?: unknown }).map
  return typeof map === "object" && map !== null && !Array.isArray(map)
}
const LOGO_ALLOWED_TAGS = new Set([
  "svg", "g", "path", "circle", "rect", "polygon", "polyline", "ellipse", "line",
  "defs", "clipPath", "linearGradient", "radialGradient", "stop", "title",
])
const LOGO_ALLOWED_ATTRS = new Set([
  "viewBox", "d", "fill", "fill-rule", "clip-rule", "stroke", "stroke-width", "stroke-linecap",
  "stroke-linejoin", "cx", "cy", "r", "rx", "ry", "x", "y", "x1", "y1", "x2", "y2", "points",
  "transform", "opacity", "fill-opacity", "stroke-opacity", "offset", "stop-color", "stop-opacity",
  "gradientUnits", "gradientTransform", "clip-path", "clipPathUnits", "id",
])
// lab → 已净化的内联 SVG 标记；空字符串表示本次会话已确认不可用，不再请求。
const logoSvgCache = new Map<string, string>()
const logoInflight = new Set<string>()
const logoHosts = new Map<string, HTMLElement[]>()
let logoFlushQueued = false

function labForModel(model: string): string | undefined {
  const id = model.trim()
  if (!id) return undefined
  const lower = id.toLowerCase()
  const mapped = runtimeModelLabs[id] ?? runtimeModelLabs[lower] ?? MODEL_LABS[id] ?? MODEL_LABS[lower]
  if (mapped) return mapped
  const slash = id.indexOf("/")
  if (slash > 0) {
    const prefix = id.slice(0, slash).toLowerCase()
    return LAB_ALIASES[prefix] ?? prefix
  }
  if (/^claude/i.test(id)) return "anthropic"
  if (/^gpt/i.test(id)) return "openai"
  return undefined
}

// 只保留白名单标签/属性并去掉固定宽高（交给 CSS 控制），避免把远端标记原样注入。
function sanitizeLogo(markup: string): string {
  let parsed: Document
  try {
    parsed = new DOMParser().parseFromString(markup, "image/svg+xml")
  } catch {
    return ""
  }
  if (parsed.querySelector("parsererror")) return ""
  const source = parsed.documentElement
  if (!source || source.tagName.toLowerCase() !== "svg") return ""
  const clean = document.createElementNS("http://www.w3.org/2000/svg", "svg")
  if (!copyLogoElement(source, clean)) return ""
  if (!clean.getAttribute("viewBox")) {
    const width = Number(source.getAttribute("width"))
    const height = Number(source.getAttribute("height"))
    if (width > 0 && height > 0) clean.setAttribute("viewBox", `0 0 ${width} ${height}`)
  }
  if (!clean.getAttribute("fill")) clean.setAttribute("fill", "currentColor")
  return clean.outerHTML
}

function copyLogoElement(source: Element, target: Element): boolean {
  for (const attribute of Array.from(source.attributes)) {
    if (attribute.name === "width" || attribute.name === "height") continue
    if (!LOGO_ALLOWED_ATTRS.has(attribute.name)) continue
    target.setAttribute(attribute.name, attribute.value)
  }
  for (const child of Array.from(source.childNodes)) {
    if (child.nodeType === Node.TEXT_NODE) {
      target.append(document.createTextNode(child.textContent ?? ""))
      continue
    }
    if (child.nodeType !== Node.ELEMENT_NODE) continue
    const element = child as Element
    if (!LOGO_ALLOWED_TAGS.has(element.tagName)) continue
    const copy = document.createElementNS("http://www.w3.org/2000/svg", element.tagName)
    if (!copyLogoElement(element, copy)) continue
    target.append(copy)
  }
  return true
}

// 面板受宿主 CSP 限制无法直连外网，logo 经本地 service 代理获取（见 service/main.ts 的 /logos）。
// 渲染时先把占位元素登记到 lab，微任务里合并成一次请求，再就地填充。
function mountModelLogo(lab: string, host: HTMLElement) {
  if (logoSvgCache.has(lab)) {
    const markup = logoSvgCache.get(lab)!
    if (markup) host.innerHTML = markup
    return
  }
  const hosts = logoHosts.get(lab)
  if (hosts) hosts.push(host)
  else logoHosts.set(lab, [host])
  if (!logoFlushQueued) {
    logoFlushQueued = true
    queueMicrotask(flushModelLogos)
  }
}

function flushModelLogos() {
  logoFlushQueued = false
  const labs = [...logoHosts.keys()].filter((lab) => !logoSvgCache.has(lab) && !logoInflight.has(lab))
  if (!labs.length) return
  for (const lab of labs) logoInflight.add(lab)
  void host.serviceRequest({
    method: "POST",
    path: "/logos",
    body: JSON.stringify({ labs }),
  }).then((result) => {
    const payload = JSON.parse(result.body) as { logos?: Record<string, string> }
    const logos = payload?.logos ?? {}
    for (const lab of labs) applyModelLogo(lab, logos[lab])
  }).catch(() => {
    for (const lab of labs) applyModelLogo(lab, undefined)
  }).finally(() => {
    for (const lab of labs) logoInflight.delete(lab)
  })
}

function applyModelLogo(lab: string, svg?: string) {
  const markup = svg ? sanitizeLogo(svg) : ""
  logoSvgCache.set(lab, markup)
  const hosts = logoHosts.get(lab)
  if (!hosts) return
  logoHosts.delete(lab)
  if (!markup) return
  for (const node of hosts) {
    if (node.isConnected) node.innerHTML = markup
  }
}

function modelNameNode(model: string) {
  const node = el("div", "model-name")
  const label = model.trim()
  if (label && label !== "—") {
    const lab = labForModel(label) ?? DEFAULT_LAB
    const logo = el("span", "model-logo")
    logo.setAttribute("aria-hidden", "true")
    if (lab !== DEFAULT_LAB) logo.title = lab
    mountModelLogo(lab, logo)
    node.append(logo)
  }
  node.append(el("span", "model-name-text", model))
  return node
}

function logRow(entry: UsageLogEntry) {
  const row = el("article", "model-row")

  // 时间 / 耗时 置于模型名上方，字号与模型名一致但不加粗，Time 与 Duration 结构保持一致
  const timingLine = el("div", "model-token-line log-timing")
  timingLine.append(el("span", "log-value log-time", dateLabel(entry.createdAt) ?? "—"))
  const durationItem = el("span")
  durationItem.append(el("span", "muted", t("timing")), " ", el("span", "log-value", logDuration(entry.durationTotal)))
  timingLine.append(durationItem)
  row.append(timingLine)

  row.append(modelNameNode(entry.model ?? "—"))

  const trace = el("div", "caption", `${t("traceId")} ${entry.traceId ?? "—"}`)
  if (entry.traceId) trace.title = entry.traceId
  row.append(trace)

  // 输入 / 输出 单独一行
  const tokenLine = el("div", "model-token-line")
  tokenLine.append(el("span", undefined, `${t("modelInput")} ${entry.tokensIn === undefined ? "—" : numberFormatter().format(entry.tokensIn)}`))
  tokenLine.append(el("span", undefined, `${t("modelOutput")} ${entry.tokensOut === undefined ? "—" : numberFormatter().format(entry.tokensOut)}`))
  row.append(tokenLine)

  // 模式 / 状态 / 费用 单独一行
  const requestLine = el("div", "model-request-line")
  const meta = el("span", "model-requests", `${t("mode")} ${entry.mode ?? "—"} · ${t("status")} `)
  meta.append(logStatusBadge(entry))
  requestLine.append(meta)
  const spend = el("span", "model-spend")
  spend.append(el("strong", "model-credits", logCost(entry.cost)))
  requestLine.append(spend)
  row.append(requestLine)
  return row
}

function logListScroller() {
  return root.querySelector<HTMLElement>(".model-list")
}

// 列表尾部的状态区：加载中 / 加载失败 / 上滑提示。高度固定，避免状态切换时撑动滚动位置。
function logFooter() {
  const footer = el("div", "log-footer")
  refreshLogFooter(footer)
  return footer
}

function refreshLogFooter(footer: HTMLElement) {
  footer.replaceChildren()
  // 空状态（首次加载 / 无数据）由列表主体呈现文案，尾部不重复。
  if (!logEntries?.length) return
  if (logLoading) {
    const text = el("span", "log-footer-text", t("logLoading"))
    text.setAttribute("role", "status")
    footer.append(text)
    return
  }
  if (logError && logNextCursor) {
    footer.append(el("span", "log-footer-text is-error", logError || t("logLoadFailed")))
    const retry = el("button", "secondary log-retry", t("retry"))
    retry.type = "button"
    retry.addEventListener("click", () => {
      if (logLoading) return
      logLoadFailed = false
      logError = ""
      refreshLogFooter(footer)
      void openLog(false, logNextCursor)
    })
    footer.append(retry)
    return
  }
  if (logNextCursor) footer.append(el("span", "log-footer-text", t("logMore")))
}

// 分页追加时把新行插到尾部状态区之前，不重建整页，滚动位置保持不变。
function appendLogRows(list: HTMLElement, entries: UsageLogEntry[]) {
  const footer = list.querySelector(".log-footer")
  const fragment = document.createDocumentFragment()
  for (const entry of entries) fragment.append(logRow(entry))
  if (footer) list.insertBefore(fragment, footer)
  else list.append(fragment)
}

function logList() {
  const list = el("div", "model-list")
  list.tabIndex = 0
  list.setAttribute("aria-label", t("log"))
  const hasEntries = Boolean(logEntries?.length)
  if (!hasEntries) {
    list.append(el("p", "summary-unavailable", logError || (logLoading ? t("logLoading") : t("logEmpty"))))
  } else {
    for (const entry of logEntries!) list.append(logRow(entry))
  }
  list.append(logFooter())
  return list
}

// 列表尚未填满可视区域时继续补足，填充首屏；每次只追加一页，且串行请求，避免请求风暴。
function maybeAutoFillLog(list: HTMLElement) {
  if (!logOpen || logLoading || logLoadFailed || !logNextCursor) return
  requestAnimationFrame(() => {
    if (!list.isConnected || !logOpen || logLoading || logLoadFailed || !logNextCursor) return
    if (list.scrollHeight - list.clientHeight > 2) return
    void openLog(false, logNextCursor)
  })
}

function logPageCard() {
  const card = el("section", "card model-card")
  card.append(cardHeading(t("log")))
  const list = logList()
  list.addEventListener("scroll", () => {
    if (logLoading || logLoadFailed || !logNextCursor) return
    if (list.scrollHeight - list.scrollTop - list.clientHeight < 120) {
      void openLog(false, logNextCursor)
    }
  })
  card.append(list)
  forwardWheelTo(card, list)
  maybeAutoFillLog(list)
  return card
}

function renderLogPage() {
  if (currentUsage) render(currentUsage)
}

async function openLog(force = false, cursor?: string) {
  if (logLoading) return
  stopRefreshTimer()
  if (!force && !cursor && logEntries) {
    // 重新进入日志页时清掉上次的分页失败状态，滚动即可继续加载。
    logLoadFailed = false
    logError = ""
    renderLogPage()
    return
  }
  const appending = !force && Boolean(cursor) && Boolean(logEntries?.length)
  const list = appending ? logListScroller() : undefined
  const footer = list?.querySelector<HTMLElement>(".log-footer")
  const incremental = Boolean(appending && list && footer)
  let appended: UsageLogEntry[] | undefined

  if (!appending) {
    generation += 1
    loading = false
    logEntries = undefined
    logNextCursor = undefined
  }
  logLoading = true
  logError = ""
  logLoadFailed = false
  if (incremental && footer) refreshLogFooter(footer)
  else renderLogPage()

  try {
    const result = await host.serviceRequest({
      method: "POST",
      path: "/usage-log",
      body: JSON.stringify({ cookie, limit: logPageSize, ...(cursor ? { cursor } : {}) }),
    })
    const payload = JSON.parse(result.body) as { error?: string; entries?: UsageLogEntry[]; nextCursor?: string }
    if (result.status < 200 || result.status >= 300 || !payload.entries) {
      throw new Error(payload.error ?? t("localError")(result.status))
    }
    logEntries = appending ? [...(logEntries ?? []), ...payload.entries] : payload.entries
    logNextCursor = payload.nextCursor || undefined
    if (incremental) appended = payload.entries
  } catch (error) {
    logError = localizedError(error)
    // 追加失败时暂停自动加载并保留已加载内容，等待用户重试。
    logLoadFailed = appending
  } finally {
    logLoading = false
    if (incremental && list && footer && list.isConnected) {
      if (appended) appendLogRows(list, appended)
      refreshLogFooter(footer)
      if (!logLoadFailed) maybeAutoFillLog(list)
    } else if (logOpen) {
      renderLogPage()
      const current = logListScroller()
      if (current) maybeAutoFillLog(current)
    }
  }
}

function localizedError(error: unknown) {
  const message = error instanceof HostRequestError
    ? `${error.code}: ${error.message}`
    : error instanceof Error ? error.message : String(error)
  if (language === "en") return message
  if (/401|403|rejected|unauthorized/i.test(message)) return t("expiredCookie")
  if (/rate limited|429/i.test(message)) return t("rateLimited")
  if (/timed out|timeout/i.test(message)) return t("timeout")
  if (/no valid .*cookie|cookie.*found/i.test(message)) return t("invalidCookie")
  return t("serviceError")
}

function captureMetrics() {
  return new Map([...root.querySelectorAll<HTMLElement>("[data-change-key]")].map((node) => [
    node.dataset.changeKey!,
    { text: node.dataset.metricText ?? node.textContent ?? "", width: node.style.width },
  ]))
}

function transitionNumber(from: string, to: string) {
  const number = el("span", "number-transition")
  number.setAttribute("aria-hidden", "true")
  number.append(el("span", "number-transition-old", from), el("span", "number-transition-new", to))
  requestAnimationFrame(() => {
    // 先让浏览器计算初始位置，再切换状态，确保 CSS transition 可以启动。
    void number.offsetHeight
    number.classList.add("is-transitioning")
  })
  const accessible = el("span", "visually-hidden", to)
  const fragment = document.createDocumentFragment()
  fragment.append(number, accessible)
  return fragment
}

function animateChangedMetrics(previous: ReturnType<typeof captureMetrics>) {
  const changedProgress: Array<{ node: HTMLElement; width: string }> = []
  for (const node of root.querySelectorAll<HTMLElement>("[data-change-key]")) {
    const old = previous.get(node.dataset.changeKey!)
    if (!old) continue
    if (node.classList.contains("progress-fill")) {
      const nextWidth = node.style.width
      if (old.width !== nextWidth) {
        node.style.transition = "none"
        node.style.width = old.width || "0%"
        changedProgress.push({ node, width: nextWidth })
      }
    } else {
      const nextText = node.dataset.metricText ?? node.textContent ?? ""
      if (old.text === nextText) continue
      const numberPattern = /\d[\d,]*(?:\.\d+)?/g
      const oldNumbers = [...old.text.matchAll(numberPattern)]
      const nextNumbers = [...nextText.matchAll(numberPattern)]
      if (!oldNumbers.length || oldNumbers.length !== nextNumbers.length) continue

      node.dataset.metricText = nextText
      node.replaceChildren()
      let cursor = 0
      for (let index = 0; index < nextNumbers.length; index++) {
        const next = nextNumbers[index]
        const start = oldNumbers[index]
        const prefix = nextText.slice(cursor, next.index)
        if (prefix) node.append(document.createTextNode(prefix))
        node.append(transitionNumber(start[0], next[0]))
        cursor = next.index! + next[0].length
      }
      if (cursor < nextText.length) node.append(document.createTextNode(nextText.slice(cursor)))
    }
  }
  if (changedProgress.length) {
    requestAnimationFrame(() => {
      for (const { node, width } of changedProgress) {
        node.style.transition = "width 850ms cubic-bezier(.2,.75,.25,1)"
        node.style.width = width
      }
    })
  }
}

function render(data: Usage, animateChanges = false) {
  if (animateChanges && currentUsage && JSON.stringify(currentUsage) === JSON.stringify(data)) {
    if (!logOpen) setRefreshState(false)
      const updated = root.querySelector<HTMLElement>(".dashboard-updated")
      const updatedAt = lastUpdatedAt ? dateLabel(lastUpdatedAt.toISOString()) : undefined
      if (updated && updatedAt) updated.textContent = `${t("updated")}: ${updatedAt}`
      if (!updated && currentUsage) render(currentUsage)
      return
  }
  settingsOpen = false
  const previousMetrics = animateChanges ? captureMetrics() : new Map()
  // 重建整页时同步恢复日志列表的滚动位置，避免刷新后跳回顶部。
  const previousLogScroll = logOpen ? logListScroller()?.scrollTop : undefined
  currentUsage = data
  root.replaceChildren()
  const cards = el("div", "dashboard")
  cards.classList.toggle("dashboard-model-view", showingByModel || logOpen)
  const actions = actionButtons()
  const strip = el("div", "subscription-strip")
  const metadata = el("div", "subscription-metadata")
  if (data.plan) {
    const plan = el("span", "subscription-plan")
    plan.append(el("span", "muted", `${t("plan")}: `), el("strong", undefined, data.plan.replace(/[_-]+/g, " ")))
    metadata.append(plan)
  }
  if (data.status && data.status.toLowerCase() !== "active") metadata.append(el("span", "subscription-status", data.status))
  strip.append(metadata, actions)
  cards.append(strip)

  if (logOpen) {
    cards.append(logPageCard())
  } else if (showingByModel) {
    cards.append(modelUsageCard(data))
  } else {
    const section = el("section", "card")
    section.append(cardHeading(t("summary")))
    const metrics = el("div", "summary-grid")
    const summary = data.summary ?? {}
    if (summary.totalTokens !== undefined) {
      const detail = summary.totalTokensIn !== undefined || summary.totalTokensOut !== undefined
        ? t("tokenBreakdown")(
            summary.totalTokensIn === undefined ? "—" : compactNumber(summary.totalTokensIn),
            summary.totalTokensOut === undefined ? "—" : compactNumber(summary.totalTokensOut),
          )
        : undefined
      metrics.append(statCard(t("totalTokens"), compactNumber(summary.totalTokens), "summary-total-tokens", detail, "summary-token-breakdown"))
    } else if (summary.totalTokensIn !== undefined || summary.totalTokensOut !== undefined) {
      const detail = t("tokenBreakdown")(
        summary.totalTokensIn === undefined ? "—" : compactNumber(summary.totalTokensIn),
        summary.totalTokensOut === undefined ? "—" : compactNumber(summary.totalTokensOut),
      )
      metrics.append(statCard(t("tokenDetails"), detail, "summary-token-breakdown"))
    }
    if (summary.totalCount !== undefined) {
      const value = numberFormatter().format(summary.totalCount)
      metrics.append(statCard(t("totalRuns"), value, "summary-total-count"))
    }
    if (summary.averageCost !== undefined) {
      metrics.append(statCard(t("averageCost"), averageCost(summary.averageCost), "summary-average-cost"))
    }
    if (metrics.childElementCount) section.append(metrics)
    else section.append(el("p", "summary-unavailable", t("summaryUnavailable")))
    cards.append(section)
  const monthly = data.monthlyRemaining !== undefined ? (() => {
    const section = el("section", "card")
    section.append(cardHeading(t("credits")))
    const balance = el("div", "balance", money(data.monthlyRemaining))
    balance.dataset.changeKey = "monthly-balance"
    balance.dataset.metricText = money(data.monthlyRemaining)
    section.append(balance, el("p", "muted", t("monthlyRemaining")))
    if (data.monthlyLimit !== undefined) {
      const used = Math.max(0, data.monthlyLimit - data.monthlyRemaining)
      const pct = data.monthlyLimit > 0 ? Math.min(100, Math.round(used / data.monthlyLimit * 100)) : 0
      section.append(row(t("usedThisMonth"), `${money(used)} / ${money(data.monthlyLimit)}`, "monthly-used"))
      const progress = el("div", "progress")
      const fill = document.createElement("span")
      fill.className = "progress-fill"
      fill.dataset.changeKey = "monthly-progress"
      fill.style.width = `${pct}%`
      progress.append(fill)
      const resetAt = data.monthlyResetsAt ?? data.periodEnd
      const details = el("p", "caption", t("usedPercent")(pct, resetAt ? dateLabel(resetAt) : undefined))
      details.dataset.changeKey = "monthly-usage-details"
      details.dataset.metricText = details.textContent ?? ""
      section.append(progress, details)
    } else {
      section.append(el("p", "caption", t("allowanceUnknown")))
    }
    if ((data.purchased ?? 0) > 0) section.append(row(t("topUp"), money(data.purchased!), "monthly-top-up"))
    return section
  })() : undefined

  const sortedWindows = [...data.windows].sort((a, b) => {
    const order = (label: string) => label === "5-hour" ? 0 : label === "Weekly" ? 1 : 2
    return order(a.label) - order(b.label)
  })
  const windowCards = el("div", "window-grid")
  for (const usage of sortedWindows) {
    const section = el("section", "card")
    const label = usage.label === "5-hour" ? t("fiveHour") : usage.label === "Weekly" ? t("weekly") : usage.label
    section.append(cardHeading(label))
    const usageKey = usage.label.toLowerCase().replace(/[^a-z0-9]+/g, "-")
    section.append(row(t("used"), `${money(usage.used)} / ${money(usage.limit)}`, `${usageKey}-used`))
    section.append(row(t("remaining"), money(usage.remaining), `${usageKey}-remaining`))
    const progress = el("div", "progress")
    const fill = document.createElement("span")
    fill.className = "progress-fill"
    fill.dataset.changeKey = `${usageKey}-progress`
    fill.style.width = `${usage.percent}%`
    progress.append(fill)
    const usageDetails = el("p", "caption", t("usedPercent")(usage.percent, usage.resetsAt ? dateLabel(usage.resetsAt) ?? "unknown" : undefined))
    usageDetails.dataset.changeKey = `${usageKey}-details`
    usageDetails.dataset.metricText = usageDetails.textContent ?? ""
    section.append(progress, usageDetails)
    windowCards.append(section)
  }
  if (windowCards.childElementCount) cards.append(windowCards)
  if (monthly) cards.append(monthly)
  }

  if (lastUpdatedAt) {
    const updatedAt = dateLabel(lastUpdatedAt.toISOString())
    if (updatedAt) cards.append(el("div", "dashboard-updated", `${t("updated")}: ${updatedAt}`))
  }

  if (!cards.childElementCount) cards.append(el("div", "notice", t("noLimits")))
  root.append(cards)
  if (previousLogScroll !== undefined) {
    const list = logListScroller()
    if (list) list.scrollTop = previousLogScroll
  }
  if (animateChanges) animateChangedMetrics(previousMetrics)
}

function setRefreshState(active: boolean) {
  const refresh = root.querySelector<HTMLButtonElement>(".refresh-button")
  if (!refresh) return
  refresh.disabled = active
  refresh.classList.toggle("is-loading", active)
}

function showRefreshError(message: string) {
  root.querySelector(".refresh-error")?.remove()
  const notice = el("div", "notice error refresh-error", message)
  root.querySelector(".dashboard")?.before(notice)
}

async function load() {
  if (loading) return
  if (!cookie) {
    stopRefreshTimer()
    showSettings(t("pasteCookie"))
    return
  }
  stopRefreshTimer()
  loading = true
  const current = ++generation
  if (!currentUsage) showLoading()
  else setRefreshState(true)
  try {
    await host.storage.set("cookie", cookie)
    const result = await host.serviceRequest({
      method: "POST",
      path: "/usage",
      body: JSON.stringify({ cookie }),
    })
    const payload = JSON.parse(result.body) as { error?: string; usage?: Usage }
    if (result.status < 200 || result.status >= 300 || !payload.usage) {
      throw new Error(payload.error ?? t("localError")(result.status))
    }
    if (current !== generation) return
    loading = false
    lastUpdatedAt = new Date()
    render(payload.usage, true)
    setRefreshState(false)
    scheduleRefresh()
  } catch (error) {
    if (current !== generation) return
    loading = false
    const message = localizedError(error)
    if (/401|403|cookie|unauthorized/i.test(String(error)) || /401|403|cookie|unauthorized/i.test(message)) {
      cookie = ""
      stopRefreshTimer()
      await host.storage.delete("cookie").catch(() => {})
      showSettings(t("expiredCookie"), true)
    } else {
      if (currentUsage) {
        setRefreshState(false)
        showRefreshError(message)
        scheduleRefresh()
      } else {
        showSettings(message, true)
      }
    }
  }
}

host.onReady((ctx) => {
  applyHostReady(ctx, document.documentElement)
  hostLanguage = normalizeLanguage(ctx.settings.language)
  const nextLanguage = savedLanguage ?? hostLanguage
  if (nextLanguage !== language) {
    language = nextLanguage
    if (!savedLanguage) void host.storage.set("language", language)
    if (settingsOpen) showSettings(undefined, false, true)
    else if (logOpen) renderLogPage()
    else if (currentUsage) render(currentUsage)
    else if (!restoring && !loading) showSettings()
  }
})

void Promise.all([
  host.storage.get("language").catch(() => undefined),
  host.storage.get("cookie").catch(() => undefined),
  host.storage.get("fontScale").catch(() => undefined),
  host.storage.get("refreshIntervalMinutes").catch(() => undefined),
  host.storage.get("logPageSize").catch(() => undefined),
  host.storage.get(MODEL_LABS_STORAGE_KEY).catch(() => undefined),
]).then(([storedLanguage, storedCookie, storedFontScale, storedRefreshInterval, storedLogPageSize, storedModelLabs]) => {
  if (typeof storedFontScale === "number" && Number.isFinite(storedFontScale)) {
    fontScale = Math.max(0.8, Math.min(1.5, Math.round(storedFontScale * 20) / 20))
    root.style.setProperty("--text-scale", String(fontScale))
  }
  if (typeof storedRefreshInterval === "number" && Number.isFinite(storedRefreshInterval)) {
    refreshIntervalMinutes = Math.max(
      MIN_REFRESH_INTERVAL_MINUTES,
      Math.min(MAX_REFRESH_INTERVAL_MINUTES, Math.round(storedRefreshInterval)),
    )
  }
  if (storedLogPageSize !== undefined) logPageSize = clampLogPageSize(storedLogPageSize)
  if (isStoredModelLabs(storedModelLabs)) {
    runtimeModelLabs = storedModelLabs.map
    modelLabsUpdatedAt = typeof storedModelLabs.updatedAt === "string" ? storedModelLabs.updatedAt : undefined
  }
  if (typeof storedLanguage === "string") {
    savedLanguage = normalizeLanguage(storedLanguage)
    language = savedLanguage
  } else {
    language = hostLanguage
    void host.storage.set("language", language)
  }
  restoring = false
  if (currentUsage) render(currentUsage)
  if (typeof storedCookie === "string" && storedCookie.trim()) {
    cookie = storedCookie
    void load()
  } else {
    showSettings()
  }
}).catch(() => {
  restoring = false
  showSettings()
})

document.addEventListener("visibilitychange", refreshIfDue)
window.addEventListener("pageshow", resumeAfterPageShow)

window.addEventListener("pagehide", () => {
  suspendedForPageHide = true
  generation += 1
  loading = false
  cookie = ""
  stopRefreshTimer()
})
