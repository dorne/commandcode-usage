import http from "node:http"

const port = Number(process.env.OPENCHAMBER_SERVICE_PORT)
const token = process.env.OPENCHAMBER_SERVICE_TOKEN ?? ""
if (!port || !token) throw new Error("OpenChamber service environment is incomplete")

const API_BASE = "https://api.commandcode.ai"
const WEB_ORIGIN = "https://commandcode.ai"
const USER_AGENT = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/143.0.0.0 Safari/537.36"
const SESSION_COOKIES = new Set([
  "__secure-commandcode_prod_.session_token",
  "__host-commandcode_prod_.session_token",
  "commandcode_prod_.session_token",
])
const FORWARDED_COOKIES = new Set([
  ...SESSION_COOKIES,
  "__secure-commandcode_prod_.session_data",
  "__host-commandcode_prod_.session_data",
  "commandcode_prod_.session_data",
])

const PLANS: Record<string, { label: string; monthly: number; fiveHour: number; weekly: number }> = {
  "individual-go": { label: "Go", monthly: 10, fiveHour: 3, weekly: 6 },
  "individual-goat": { label: "GOAT", monthly: 70, fiveHour: 14, weekly: 35 },
  "individual-pro": { label: "Pro", monthly: 80, fiveHour: 16, weekly: 40 },
  "individual-max": { label: "Max 10x", monthly: 150, fiveHour: 45, weekly: 90 },
  "individual-ultra": { label: "Max 20x", monthly: 300, fiveHour: 90, weekly: 180 },
}

type WindowUsage = {
  label: string
  used: number
  limit: number
  remaining: number
  percent: number
  resetsAt?: string
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
type ModelWindow = {
  from?: string
  to?: string
  periodBasis?: string
}
type Usage = {
  plan?: string
  status?: string
  periodEnd?: string
  monthlyResetsAt?: string
  monthlyRemaining?: number
  monthlyLimit?: number
  purchased?: number
  summary?: {
    totalTokens?: number
    totalTokensIn?: number
    totalTokensOut?: number
    totalCount?: number
    averageCost?: number
  }
  byModel?: {
    models: ModelUsage[]
    window?: ModelWindow
  }
  windows: WindowUsage[]
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

function number(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) return value
  if (typeof value === "string" && value.trim() && Number.isFinite(Number(value))) return Number(value)
  return undefined
}

function safeCookie(raw: unknown): string {
  if (typeof raw !== "string" || raw.length > 32_000) return ""
  let text = raw.trim().replace(/^cookie\s*:/i, "").trim()
  if ((text.startsWith("'") && text.endsWith("'")) || (text.startsWith('"') && text.endsWith('"'))) {
    text = text.slice(1, -1).trim()
  }
  const pairs = text.split(";").map((pair) => {
    const separator = pair.indexOf("=")
    if (separator <= 0) return null
    const name = pair.slice(0, separator).trim()
    const value = pair.slice(separator + 1).trim()
    if (!/^[!#$%&'*+.^_`|~0-9A-Za-z-]+$/.test(name) || !value || /[\u0000-\u001f\u007f]/.test(value)) return null
    return { name, value }
  }).filter((pair): pair is { name: string; value: string } => pair !== null)
  if (!pairs.some((pair) => SESSION_COOKIES.has(pair.name.toLowerCase()))) return ""
  return pairs
    .filter((pair) => FORWARDED_COOKIES.has(pair.name.toLowerCase()))
    .map((pair) => `${pair.name}=${pair.value}`)
    .join("; ")
}

function isoDate(value: unknown): string | undefined {
  if (typeof value !== "string" && typeof value !== "number") return undefined
  const raw = String(value).trim()
  if (!raw || raw === "0") return undefined
  const numeric = /^\d+$/.test(raw) ? Number(raw) : undefined
  const date = new Date(numeric === undefined ? raw : numeric > 20_000_000_000 ? numeric : numeric * 1000)
  return Number.isNaN(date.getTime()) ? undefined : date.toISOString()
}

function parseWindow(label: string, value: unknown): WindowUsage | undefined {
  if (!isRecord(value)) return undefined
  const limit = number(value.cap ?? value.limit)
  const used = number(value.used)
  if (limit === undefined || limit <= 0 || used === undefined) return undefined
  const boundedUsed = Math.max(0, used)
  const resetsAt = isoDate(value.resetAt ?? value.reset_at)
  return {
    label,
    used: boundedUsed,
    limit,
    remaining: Math.max(0, limit - boundedUsed),
    percent: Math.max(0, Math.min(100, Math.round(boundedUsed / limit * 100))),
    ...(resetsAt ? { resetsAt } : {}),
  }
}

function parseCredits(body: unknown) {
  if (!isRecord(body) || !isRecord(body.credits)) throw new Error("Credits response had an unexpected shape")
  const credits = body.credits
  const monthlyRemaining = number(credits.monthlyCredits ?? credits.monthly_credits)
  if (monthlyRemaining === undefined || monthlyRemaining < 0) throw new Error("Monthly credits were missing")
  const windowsRaw = (isRecord(credits.windowLimits) ? credits.windowLimits : undefined)
    ?? (isRecord(credits.window_limits) ? credits.window_limits : undefined)
    ?? (isRecord(body.windowLimits) ? body.windowLimits : undefined)
    ?? (isRecord(body.window_limits) ? body.window_limits : undefined)
  return {
    monthlyRemaining,
    monthlyResetsAt: isoDate(credits.monthlyResetAt ?? credits.monthly_reset_at ?? credits.resetAt ?? credits.reset_at),
    purchased: Math.max(0, number(credits.purchasedCredits ?? credits.purchased_credits) ?? 0),
    fiveHour: parseWindow("5-hour", windowsRaw?.fiveHour ?? windowsRaw?.five_hour),
    weekly: parseWindow("Weekly", windowsRaw?.weekly),
  }
}

function parseSubscription(body: unknown) {
  if (!isRecord(body) || body.success !== true || !("data" in body)) throw new Error("Subscription response was unavailable")
  if (body.data === null) return undefined
  if (!isRecord(body.data)) throw new Error("Subscription response had an unexpected shape")
  const planId = typeof body.data.planId === "string" ? body.data.planId : typeof body.data.plan_id === "string" ? body.data.plan_id : undefined
  if (!planId) throw new Error("Subscription plan was missing")
  return {
    planId,
    status: typeof body.data.status === "string" ? body.data.status : undefined,
    periodEnd: isoDate(body.data.currentPeriodEnd ?? body.data.current_period_end),
  }
}

function parseSummary(body: unknown): Usage["summary"] {
  if (!isRecord(body)) return undefined
  const summary = isRecord(body.data) ? body.data : isRecord(body.summary) ? body.summary : body
  const fields = ["totalTokens", "totalTokensIn", "totalTokensOut", "totalCount", "averageCost"] as const
  const result: NonNullable<Usage["summary"]> = {}
  for (const field of fields) {
    const value = number(summary[field])
    if (value !== undefined && value >= 0) result[field] = value
  }
  if (result.totalTokens === undefined && (result.totalTokensIn !== undefined || result.totalTokensOut !== undefined)) {
    result.totalTokens = (result.totalTokensIn ?? 0) + (result.totalTokensOut ?? 0)
  }
  return Object.keys(result).length ? result : undefined
}

function parseByModel(body: unknown): Usage["byModel"] {
  if (!isRecord(body) || !Array.isArray(body.data)) return undefined
  const models: ModelUsage[] = []
  for (const item of body.data) {
    if (!isRecord(item)) continue
    const model = typeof item.model === "string" ? item.model.trim() : ""
    if (!model) continue
    const entry: ModelUsage = { model }
    const requests = number(item.requests)
    if (requests !== undefined) entry.requests = Math.max(0, requests)
    const requestsFailed = number(item.requestsFailed)
    if (requestsFailed !== undefined && requestsFailed > 0) entry.requestsFailed = requestsFailed
    const tokensIn = number(item.tokensIn)
    if (tokensIn !== undefined) entry.tokensIn = Math.max(0, tokensIn)
    const tokensOut = number(item.tokensOut)
    if (tokensOut !== undefined) entry.tokensOut = Math.max(0, tokensOut)
    const tokensTotal = number(item.tokensTotal)
    if (tokensTotal !== undefined) entry.tokensTotal = Math.max(0, tokensTotal)
    else if (tokensIn !== undefined || tokensOut !== undefined) entry.tokensTotal = (tokensIn ?? 0) + (tokensOut ?? 0)
    const credits = number(item.creditsTotal)
    if (credits !== undefined) entry.credits = credits
    models.push(entry)
  }
  if (!models.length) return undefined
  const window = isRecord(body.window) ? body.window : undefined
  const from = isoDate(window?.from)
  const to = isoDate(window?.to)
  const periodBasis = typeof window?.periodBasis === "string" ? window.periodBasis : undefined
  const modelWindow: ModelWindow | undefined = from || to || periodBasis
    ? {
        ...(from ? { from } : {}),
        ...(to ? { to } : {}),
        ...(periodBasis ? { periodBasis } : {}),
      }
    : undefined
  return { models, ...(modelWindow ? { window: modelWindow } : {}) }
}

const ACTIVITY_LIMIT = 10
const MIN_ACTIVITY_LIMIT = 1
const MAX_ACTIVITY_LIMIT = 100
// 与官网一致：这些模式下模型列展示固定名称，而不是实际模型 ID。
const MODE_MODEL_LABELS: Record<string, string> = {
  learning: "taste-1",
  "web-search": "web-search",
  "web-fetch": "web-fetch",
}

function parseLogEntry(item: unknown) {
  if (!isRecord(item)) return undefined
  const meta = isRecord(item.meta) ? item.meta : undefined
  const mode = typeof item.mode === "string" && item.mode.trim() ? item.mode.trim() : "default"
  const entry: {
    id?: string
    createdAt?: string
    tokensIn?: number
    tokensOut?: number
    durationTotal?: number
    model?: string
    mode: string
    status?: string
    message?: string
    cost?: number
    traceId?: string
  } = { mode }
  if (typeof item.id === "string" && item.id) entry.id = item.id
  const createdAt = isoDate(item.createdAt)
  if (createdAt) entry.createdAt = createdAt
  const tokensIn = number(item.tokensIn)
  if (tokensIn !== undefined) entry.tokensIn = Math.max(0, tokensIn)
  const tokensOut = number(item.tokensOut)
  if (tokensOut !== undefined) entry.tokensOut = Math.max(0, tokensOut)
  const durationTotal = number(item.durationTotal)
  if (durationTotal !== undefined) entry.durationTotal = Math.max(0, durationTotal)
  const model = MODE_MODEL_LABELS[mode] ?? (typeof meta?.model === "string" ? meta.model : undefined)
  if (model) entry.model = model
  if (typeof item.status === "string" && item.status) entry.status = item.status
  if (typeof item.message === "string" && item.message) entry.message = item.message
  if (meta) {
    const totalCost = number(meta.totalCost)
    entry.cost = totalCost
      ?? (number(meta.inputCost) ?? 0) + (number(meta.outputCost) ?? 0) + (number(meta.cacheCost) ?? 0)
    if (typeof meta.traceId === "string" && meta.traceId) entry.traceId = meta.traceId
  }
  return entry
}

function parseActivity(body: unknown) {
  if (!isRecord(body) || !Array.isArray(body.usages)) return []
  return body.usages.map(parseLogEntry).filter((entry) => entry !== undefined)
}

async function fetchActivity(rawCookie: unknown, rawCursor: unknown, rawLimit: unknown) {
  const cookie = safeCookie(rawCookie)
  if (!cookie) throw new Error("No valid CommandCode session Cookie was found. Paste the Cookie request header.")
  const cursor = typeof rawCursor === "string" && rawCursor.length <= 2_000 ? rawCursor : ""
  const requested = number(rawLimit)
  const limit = requested === undefined ? ACTIVITY_LIMIT : Math.max(MIN_ACTIVITY_LIMIT, Math.min(MAX_ACTIVITY_LIMIT, Math.round(requested)))
  const query = new URLSearchParams({ limit: String(limit) })
  if (cursor) query.set("cursor", cursor)
  const body = await fetchJson(`/internal/usage?${query}`, cookie, 12_000)
  const entries = parseActivity(body)
  const nextCursor = isRecord(body) && typeof body.nextCursor === "string" && body.nextCursor
    ? body.nextCursor
    : undefined
  return { entries, nextCursor }
}

async function fetchJson(path: string, cookie: string, timeoutMs: number) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const response = await fetch(`${API_BASE}${path}`, {
      method: "GET",
      signal: controller.signal,
      redirect: "error",
      headers: {
        Cookie: cookie,
        Accept: "application/json, text/plain, */*",
        "Accept-Language": "en-US,en;q=0.9",
        "User-Agent": USER_AGENT,
        Origin: WEB_ORIGIN,
        Referer: `${WEB_ORIGIN}/`,
      },
    })
    if (response.status === 401 || response.status === 403) throw new Error("CommandCode rejected the Cookie (401/403)")
    if (response.status === 429) throw new Error("CommandCode rate limited this request (429)")
    if (!response.ok) throw new Error(`CommandCode returned HTTP ${response.status}`)
    return await response.json() as unknown
  } catch (error) {
    if (controller.signal.aborted) throw new Error("CommandCode request timed out")
    throw error
  } finally {
    clearTimeout(timer)
  }
}

async function fetchUsage(rawCookie: unknown): Promise<Usage> {
  const cookie = safeCookie(rawCookie)
  if (!cookie) throw new Error("No valid CommandCode session Cookie was found. Paste the Cookie request header.")

  const [creditsResult, subscriptionResult, summaryResult, byModelResult] = await Promise.allSettled([
    fetchJson("/internal/billing/credits", cookie, 12_000),
    fetchJson("/internal/billing/subscriptions", cookie, 6_000),
    fetchJson("/internal/usage/summary", cookie, 6_000),
    fetchJson("/internal/usage/by-model", cookie, 8_000),
  ])
  if (creditsResult.status === "rejected") {
    throw creditsResult.reason instanceof Error ? creditsResult.reason : new Error("Could not read CommandCode credits")
  }
  const credits = parseCredits(creditsResult.value)
  let subscription: ReturnType<typeof parseSubscription>
  if (subscriptionResult.status === "fulfilled") {
    try {
      subscription = parseSubscription(subscriptionResult.value)
    } catch {
      // 订阅信息是可选数据；结构变化不应丢弃已成功读取的额度。
    }
  }
  const summary = summaryResult.status === "fulfilled" ? parseSummary(summaryResult.value) : undefined
  const byModel = byModelResult.status === "fulfilled" ? parseByModel(byModelResult.value) : undefined
  const plan = subscription ? PLANS[subscription.planId.trim().toLowerCase()] : undefined
  const limits = [credits.fiveHour, credits.weekly].filter((item): item is WindowUsage => item !== undefined)
  const monthlyLimit = plan
    && credits.fiveHour?.limit === plan.fiveHour
    && credits.weekly?.limit === plan.weekly
    && credits.monthlyRemaining <= plan.monthly
    ? plan.monthly
    : undefined
  return {
    ...(plan ? { plan: plan.label } : subscription ? { plan: subscription.planId } : {}),
    ...(subscription?.status ? { status: subscription.status } : {}),
    ...(subscription?.periodEnd ? { periodEnd: subscription.periodEnd } : {}),
    ...(credits.monthlyResetsAt ? { monthlyResetsAt: credits.monthlyResetsAt } : {}),
    monthlyRemaining: credits.monthlyRemaining,
    ...(monthlyLimit ? { monthlyLimit } : {}),
    ...(credits.purchased ? { purchased: credits.purchased } : {}),
    ...(summary ? { summary } : {}),
    ...(byModel ? { byModel } : {}),
    windows: limits,
  }
}

// 模型图标：面板受宿主 CSP 限制无法直连外网，这里代为拉取 models.dev 的 lab logo 并缓存。
// 解析不到 lab 的模型用 "default" 取 models.dev 的默认图标（/logos/default.svg）。
const MODELS_DEV_ORIGIN = "https://models.dev"
const DEFAULT_LAB = "default"
const LOGO_LAB_PATTERN = /^[a-z0-9][a-z0-9._-]{0,63}$/i
const LOGO_MAX_BYTES = 24_000
const LOGO_TIMEOUT_MS = 8_000
const MAX_LOGOS_PER_REQUEST = 24
const logoCache = new Map<string, string>()

async function fetchLogo(lab: string): Promise<string> {
  const cached = logoCache.get(lab)
  if (cached !== undefined) return cached
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), LOGO_TIMEOUT_MS)
  try {
    const logoPath = lab === DEFAULT_LAB ? "logos/default.svg" : `logos/labs/${encodeURIComponent(lab)}.svg`
    const response = await fetch(`${MODELS_DEV_ORIGIN}/${logoPath}`, {
      signal: controller.signal,
      redirect: "error",
      headers: { Accept: "image/svg+xml, text/plain, */*", "User-Agent": USER_AGENT },
    })
    if (!response.ok) return ""
    const svg = await response.text()
    if (!svg || svg.length > LOGO_MAX_BYTES || !svg.includes("<svg")) return ""
    logoCache.set(lab, svg)
    return svg
  } catch {
    return ""
  } finally {
    clearTimeout(timer)
  }
}

async function fetchLogos(rawLabs: unknown) {
  const requested = Array.isArray(rawLabs) ? rawLabs : []
  const labs = [...new Set(requested
    .filter((lab): lab is string => typeof lab === "string" && LOGO_LAB_PATTERN.test(lab.trim()))
    .map((lab) => lab.trim().toLowerCase()))]
    .slice(0, MAX_LOGOS_PER_REQUEST)
  const entries = await Promise.all(labs.map(async (lab) => [lab, await fetchLogo(lab)] as const))
  const logos: Record<string, string> = {}
  for (const [lab, svg] of entries) {
    if (svg) logos[lab] = svg
  }
  return logos
}

function json(res: http.ServerResponse, status: number, body: unknown) {
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" })
  res.end(JSON.stringify(body))
}

const server = http.createServer((req, res) => {
  if (req.headers.authorization !== `Bearer ${token}`) {
    json(res, 401, { error: "Unauthorized local service request" })
    return
  }
  const url = new URL(req.url ?? "/", "http://127.0.0.1")
  if (req.method === "GET" && url.pathname === "/health") {
    json(res, 200, { ok: true })
    return
  }
  if (req.method !== "POST" || (url.pathname !== "/usage" && url.pathname !== "/activity" && url.pathname !== "/logos")) {
    json(res, 404, { error: "Not found" })
    return
  }
  const route = url.pathname
  let body = ""
  req.on("data", (chunk: Buffer) => {
    body += chunk.toString("utf8")
    if (body.length > 40_000) {
      json(res, 413, { error: "Request body is too large" })
      req.destroy()
    }
  })
  req.on("end", () => {
    let input: unknown
    try {
      input = JSON.parse(body)
    } catch {
      json(res, 400, { error: "Invalid JSON request" })
      return
    }
    const cookie = isRecord(input) ? input.cookie : undefined
    const respond = route === "/logos"
      ? fetchLogos(isRecord(input) ? input.labs : undefined).then((logos) => json(res, 200, { logos }))
      : route === "/activity"
        ? fetchActivity(cookie, isRecord(input) ? input.cursor : undefined, isRecord(input) ? input.limit : undefined).then((page) => json(res, 200, page))
        : fetchUsage(cookie).then((usage) => json(res, 200, { usage }))
    void respond
      .catch((error: unknown) => {
        const message = error instanceof Error ? error.message : "Usage request failed"
        const status = /401|403|rejected/i.test(message) ? 401 : /rate limited/i.test(message) ? 429 : 502
        json(res, status, { error: message })
      })
  })
})

server.listen(port, "127.0.0.1")
