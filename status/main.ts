// Work Status 区块：紧凑（一行配额）与明细（三行读数）两种布局，由面板设置切换。
// 数据与面板同源（本地 service 的 /usage），结果连同时间戳写入插件存储：
// 展开/折叠本区块不会强制请求接口，只有到了面板设置的刷新间隔到点才取数；
// 表头「刷新」按钮是唯一的手动取数入口。
// 语言严格跟随面板设置里保存的 language，不使用浏览器语言，避免刷新时闪动。
import { connectHost } from "@openchamber/sdk"
import { applyHostReady } from "@openchamber/sdk/ui"

type WindowUsage = {
  label: string
  used: number
  limit: number
  remaining: number
  percent: number
  resetsAt?: string
}

type StatusUsage = {
  monthlyRemaining?: number
  monthlyLimit?: number
  monthlyResetsAt?: string
  periodEnd?: string
  summary?: { totalTokens?: number; totalTokensIn?: number; totalTokensOut?: number; totalCount?: number }
  windows: WindowUsage[]
}

type Language = "en" | "zh-CN"
type Layout = "detail" | "compact"
type ViewState = "loading" | "ready" | "empty" | "error" | "nocookie"

const DEFAULT_REFRESH_MINUTES = 5
const MIN_REFRESH_MINUTES = 1
const MAX_REFRESH_MINUTES = 60
const DEFAULT_LAYOUT: Layout = "detail"
const CACHE_KEY = "statusCache"

const messages = {
  en: {
    fiveHour: "5h",
    weekly: "Weekly",
    monthly: "Monthly",
    tokens: "Tokens",
    runs: "Runs",
    used: "Used",
    resets: "resets",
    left: "left",
    refresh: "Refresh",
    loading: "Reading quotas…",
    nocookie: "No Cookie configured",
    error: "Could not read quotas",
    empty: "No quota data returned",
    monthlyUnknown: "Monthly allowance is not verified",
    unknown: "n/a",
  },
  "zh-CN": {
    fiveHour: "5 小时",
    weekly: "每周",
    monthly: "每月",
    tokens: "Token",
    runs: "次数",
    used: "已用",
    resets: "重置",
    left: "剩余",
    refresh: "刷新",
    loading: "正在读取配额…",
    nocookie: "未配置 Cookie",
    error: "读取配额失败",
    empty: "未返回配额数据",
    monthlyUnknown: "无法确认月度总额度",
    unknown: "暂无",
  },
} as const

const host = connectHost()
const root = document.getElementById("root")!

let language: Language = "en"
let layout: Layout = DEFAULT_LAYOUT
let viewState: ViewState = "loading"
let usage: StatusUsage | null = null
let errorDetail = ""
let refreshMinutes = DEFAULT_REFRESH_MINUTES
let mounted = false
let loading = false
let timer = 0
let lastSavedAt = 0
let statusControls = false
let settingsReady = false
let hostLocale: string | null = null

function t() {
  return messages[language]
}

function el<K extends keyof HTMLElementTagNameMap>(tag: K, className?: string, text?: string) {
  const node = document.createElement(tag)
  if (className) node.className = className
  if (text !== undefined) node.textContent = text
  return node
}

function money(value: number) {
  const amount = new Intl.NumberFormat(language === "zh-CN" ? "zh-CN" : "en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value)
  return `$${amount}`
}

function compactNumber(value: number) {
  return new Intl.NumberFormat(language === "zh-CN" ? "zh-CN" : "en-US", {
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(value)
}

function clampRefresh(value: number) {
  return Math.max(MIN_REFRESH_MINUTES, Math.min(MAX_REFRESH_MINUTES, Math.round(value)))
}

function isSameDay(left: Date, right: Date) {
  return left.getFullYear() === right.getFullYear()
    && left.getMonth() === right.getMonth()
    && left.getDate() === right.getDate()
}

function shortReset(value: string | undefined, withTime: boolean) {
  if (!value) return ""
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ""
  const locale = language === "zh-CN" ? "zh-CN" : "en-US"
  const time = new Intl.DateTimeFormat(locale, { hour: "numeric", minute: "2-digit" }).format(date)
  if (withTime && isSameDay(date, new Date())) return time
  const day = new Intl.DateTimeFormat(locale, { month: "numeric", day: "numeric" }).format(date)
  return withTime ? `${day} ${time}` : day
}

function monthlyModel() {
  const remaining = usage?.monthlyRemaining
  if (typeof remaining !== "number") return null
  const limit = usage?.monthlyLimit
  const hasLimit = typeof limit === "number" && limit > 0
  const percent = hasLimit
    ? Math.max(0, Math.min(100, Math.round((limit - remaining) / limit * 100)))
    : undefined
  const used = hasLimit ? Math.max(0, limit - remaining) : undefined
  const reset = shortReset(usage?.monthlyResetsAt ?? usage?.periodEnd, false)
  return { remaining, limit, hasLimit, percent, used, reset }
}

function windowRows() {
  const windows = Array.isArray(usage?.windows) ? usage!.windows : []
  const five = windows.find((item) => item.label === "5-hour")
  const weekly = windows.find((item) => item.label === "Weekly")
  const rows: { label: string; percent: number | null; value: string; sub: string }[] = []
  if (five) {
    const reset = shortReset(five.resetsAt, true)
    rows.push({
      label: t().fiveHour,
      percent: five.percent,
      value: `${five.percent}%`,
      sub: `${t().used} ${money(five.used)} / ${money(five.limit)} · ${reset ? `${reset} ${t().resets}` : `${t().resets} ${t().unknown}`}`,
    })
  }
  if (weekly) {
    const reset = shortReset(weekly.resetsAt, false)
    rows.push({
      label: t().weekly,
      percent: weekly.percent,
      value: `${weekly.percent}%`,
      sub: `${t().used} ${money(weekly.used)} / ${money(weekly.limit)}${reset ? ` · ${reset} ${t().resets}` : ""}`,
    })
  }
  const monthly = monthlyModel()
  if (monthly) {
    if (monthly.hasLimit && monthly.limit !== undefined && monthly.used !== undefined && monthly.percent !== undefined) {
      rows.push({
        label: t().monthly,
        percent: monthly.percent,
        value: `${monthly.percent}%`,
        sub: `${t().used} ${money(monthly.used)} / ${money(monthly.limit)}${monthly.reset ? ` · ${monthly.reset} ${t().resets}` : ""}`,
      })
    } else {
      rows.push({
        label: t().monthly,
        percent: null,
        value: money(monthly.remaining),
        sub: `${t().left} ${money(monthly.remaining)} · ${t().monthlyUnknown}`,
      })
    }
  }
  return rows
}

function usageLine() {
  const summary = usage?.summary
  if (!summary || (summary.totalTokens === undefined && summary.totalCount === undefined)) return null
  const parts: string[] = []
  if (summary.totalTokens !== undefined) {
    const io: string[] = []
    if (summary.totalTokensIn !== undefined) io.push(`in ${compactNumber(summary.totalTokensIn)}`)
    if (summary.totalTokensOut !== undefined) io.push(`out ${compactNumber(summary.totalTokensOut)}`)
    parts.push(`${t().tokens} ${compactNumber(summary.totalTokens)}${io.length ? `(${io.join(", ")})` : ""}`)
  }
  if (summary.totalCount !== undefined) parts.push(`${t().runs} ${new Intl.NumberFormat(language === "zh-CN" ? "zh-CN" : "en-US").format(summary.totalCount)}`)
  return parts.join(" · ")
}

function renderCompact(target: HTMLElement) {
  const rows = windowRows()
  const line = el("div", "qs-line")
  let first = true
  for (const row of rows) {
    if (!first) line.append(el("span", "qs-sep", "·"))
    first = false
    const item = el("span", "qs-item")
    item.title = row.sub
    item.append(el("span", "qs-k", row.label), el("strong", "qs-v", row.value))
    line.append(item)
  }
  if (first) return false

  const resets: string[] = []
  const five = usage?.windows.find((item) => item.label === "5-hour")
  const weekly = usage?.windows.find((item) => item.label === "Weekly")
  const fiveReset = five ? shortReset(five.resetsAt, true) || t().unknown : ""
  const weeklyReset = weekly ? shortReset(weekly.resetsAt, true) : ""
  const monthlyReset = shortReset(usage?.monthlyResetsAt ?? usage?.periodEnd, true)
  if (fiveReset) resets.push(fiveReset)
  if (weeklyReset) resets.push(weeklyReset)
  if (monthlyReset) resets.push(monthlyReset)

  const usageText = usageLine()
  if (usageText) target.append(el("div", "qs-usage", usageText))
  target.append(line)
  if (resets.length) target.append(el("div", "qs-sub", `${t().resets} ${resets.join(" · ")}`))
  return true
}

function renderDetail(target: HTMLElement) {
  const rows = windowRows()
  if (!rows.length) return false
  const usageText = usageLine()
  if (usageText) target.append(el("div", "qd-usage", usageText))
  for (const row of rows) {
    const block = el("div", "qd-row")
    const top = el("div", "qd-top")
    top.append(el("span", "qd-k", row.label), el("strong", "qd-v", row.value))
    block.append(top)
    if (row.percent !== null) {
      const bar = el("div", "qd-bar")
      const fill = el("i")
      fill.style.width = `${row.percent}%`
      bar.append(fill)
      block.append(bar)
    }
    block.append(el("div", "qd-sub", row.sub))
    target.append(block)
  }
  return true
}

function render() {
  root.replaceChildren()

  if (viewState === "loading") {
    root.append(el("p", "qs-hint", t().loading))
    return syncHeight()
  }
  if (viewState === "nocookie") {
    root.append(el("p", "qs-hint", t().nocookie))
    return syncHeight()
  }
  if (viewState === "error") {
    const hint = el("p", "qs-hint", t().error)
    if (errorDetail) hint.title = errorDetail
    root.append(hint)
    return syncHeight()
  }
  if (!usage) {
    root.append(el("p", "qs-hint", t().empty))
    return syncHeight()
  }

  const filled = layout === "detail" ? renderDetail(root) : renderCompact(root)
  if (!filled) {
    viewState = "empty"
    render()
    return
  }
  syncHeight()
}

let heightFrame = 0

function syncHeight() {
  if (heightFrame) cancelAnimationFrame(heightFrame)
  heightFrame = requestAnimationFrame(() => {
    heightFrame = 0
    const height = Math.ceil(root.getBoundingClientRect().height + 10)
    void host.setHeight(height).catch(() => {})
  })
}

// 只存本区块要展示的字段，byModel 之类的大字段不进缓存。
function cacheableUsage(data: StatusUsage): StatusUsage {
  return {
    ...(data.monthlyRemaining !== undefined ? { monthlyRemaining: data.monthlyRemaining } : {}),
    ...(data.monthlyLimit !== undefined ? { monthlyLimit: data.monthlyLimit } : {}),
    ...(data.monthlyResetsAt ? { monthlyResetsAt: data.monthlyResetsAt } : {}),
    ...(data.periodEnd ? { periodEnd: data.periodEnd } : {}),
    ...(data.summary ? { summary: { totalTokens: data.summary.totalTokens, totalTokensIn: data.summary.totalTokensIn, totalTokensOut: data.summary.totalTokensOut, totalCount: data.summary.totalCount } } : {}),
    windows: (Array.isArray(data.windows) ? data.windows : []).map((item) => ({
      label: item.label, used: item.used, limit: item.limit, remaining: item.remaining, percent: item.percent,
      ...(item.resetsAt ? { resetsAt: item.resetsAt } : {}),
    })),
  }
}

function scheduleAt(at: number) {
  if (timer) window.clearTimeout(timer)
  timer = window.setTimeout(() => {
    timer = 0
    void load()
  }, Math.max(0, at - Date.now()))
}

function scheduleNext() {
  scheduleAt(Date.now() + refreshMinutes * 60_000)
}

async function load() {
  if (loading) return
  loading = true
  try {
    // 每次取数前重读面板设置：语言、布局、刷新间隔都以面板存储为准，改设置在面板保存后这里自然跟上。
    const [storedCookie, storedLanguage, storedLayout, storedInterval] = await Promise.all([
      host.storage.get("cookie").catch(() => undefined),
      host.storage.get("language").catch(() => undefined),
      host.storage.get("statusLayout").catch(() => undefined),
      host.storage.get("refreshIntervalMinutes").catch(() => undefined),
    ])
    const previousLanguage = language
    if (storedLanguage === "zh-CN" || storedLanguage === "en") language = storedLanguage
    if (storedLayout === "detail" || storedLayout === "compact") layout = storedLayout
    if (typeof storedInterval === "number" && Number.isFinite(storedInterval)) {
      refreshMinutes = clampRefresh(storedInterval)
    }
    if (language !== previousLanguage) publishControls()
    const cookie = typeof storedCookie === "string" ? storedCookie.trim() : ""
    if (!cookie) {
      usage = null
      viewState = "nocookie"
      render()
      // 未配置 Cookie 时按间隔静默复查存储，面板里保存 Cookie 后无需重启宿主即可恢复。
      scheduleNext()
      return
    }
    const result = await host.serviceRequest({
      method: "POST",
      path: "/usage",
      body: JSON.stringify({ cookie }),
    })
    const payload = JSON.parse(result.body) as { error?: string; usage?: StatusUsage }
    if (result.status < 200 || result.status >= 300 || !payload.usage) {
      throw new Error(payload.error ?? `HTTP ${result.status}`)
    }
    usage = payload.usage
    viewState = "ready"
    errorDetail = ""
    lastSavedAt = Date.now()
    void host.storage.set(CACHE_KEY, { savedAt: lastSavedAt, usage: cacheableUsage(payload.usage) }).catch(() => {})
    render()
    scheduleNext()
  } catch (error) {
    errorDetail = error instanceof Error ? error.message : String(error)
    if (!usage) viewState = "error"
    render()
    scheduleNext()
  } finally {
    loading = false
  }
}

// 面板设置读出来之前不发布表头控件：否则先用默认语言画一次「Refresh」，再被存储里的语言换掉，
// 表头就会闪一下语言。宿主重复推送 ready 时也由这个闸门挡住。
function publishControls() {
  if (!statusControls || !settingsReady) return
  void host.setStatusControls([{ kind: "button", id: "refresh", label: t().refresh }]).catch(() => {
    statusControls = false
  })
}

async function boot() {
  const stored = await Promise.all([
    host.storage.get("language").catch(() => undefined),
    host.storage.get("statusLayout").catch(() => undefined),
    host.storage.get("refreshIntervalMinutes").catch(() => undefined),
    host.storage.get(CACHE_KEY).catch(() => undefined),
  ])
  const [storedLanguage, storedLayout, storedInterval, storedCache] = stored
  // 语言严格按面板设置：存储里有值就用它，否则退回宿主 locale，不看浏览器语言。
  if (storedLanguage === "zh-CN" || storedLanguage === "en") language = storedLanguage
  else if (hostLocale) language = hostLocale.toLowerCase().startsWith("zh") ? "zh-CN" : "en"
  layout = storedLayout === "detail" || storedLayout === "compact" ? storedLayout : DEFAULT_LAYOUT
  if (typeof storedInterval === "number" && Number.isFinite(storedInterval)) {
    refreshMinutes = clampRefresh(storedInterval)
  }
  settingsReady = true
  publishControls()

  // 折叠后再展开不强制取数：缓存还在刷新间隔内就直接渲染，并把定时器排到缓存到期的那一刻。
  const cache = storedCache as { savedAt?: number; usage?: StatusUsage } | undefined
  const savedAt = typeof cache?.savedAt === "number" ? cache.savedAt : 0
  const fresh = cache?.usage && savedAt > 0 && Date.now() - savedAt < refreshMinutes * 60_000
  if (fresh) {
    usage = cache!.usage!
    viewState = "ready"
    lastSavedAt = savedAt
    render()
    scheduleAt(savedAt + refreshMinutes * 60_000)
    return
  }
  viewState = "loading"
  render()
  await load()
}

// 表头「刷新」按钮是唯一的手动取数入口，事件只在这个区块发布过控件后到达，必须同步注册。
host.onStatusControl((event) => {
  if (event.id === "refresh") void load()
})

host.onReady((ctx) => {
  applyHostReady(ctx, document.documentElement)
  statusControls = ctx.features?.statusControls === true
  if (mounted) {
    publishControls()
    return
  }
  mounted = true
  // 宿主 locale 只作为面板未设置语言时的兜底，语言本身以面板存储为准，避免首帧闪动。
  hostLocale = ctx.locale
  void boot()
})

host.onDirectory(() => {
  if (mounted) publishControls()
})

document.addEventListener("visibilitychange", () => {
  if (document.hidden || !mounted) return
  if (Date.now() - lastSavedAt < refreshMinutes * 60_000) return
  void load()
})

// 折叠（宿主把帧隐藏）时停掉计时器，不在不可见时请求；展开后按缓存时间决定是补一次还是等下一个间隔。
// 这里不是"展开即刷新"：只有距离上次取数已超过面板设置的间隔才补，否则只把计时器排到到期时间。
new IntersectionObserver(([entry]) => {
  if (!settingsReady) return
  if (entry.isIntersecting) {
    if (viewState === "ready" && Date.now() - lastSavedAt < refreshMinutes * 60_000) {
      scheduleAt(lastSavedAt + refreshMinutes * 60_000)
      return
    }
    void load()
  } else if (timer) {
    window.clearTimeout(timer)
    timer = 0
  }
}, { threshold: 0 }).observe(root)
