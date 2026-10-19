// 从 models.dev 生成 panel/model-labs.json：CommandCode 模型 id → 厂商 lab。
// lab 取 models.dev 中 commandcode provider 各模型的 canonical_model_id 前缀，
// 与模型图标路径 /logos/labs/{lab}.svg 对应。
// 由 build 的 prebuild 自动调用；拉取或解析失败时保留现有文件并正常退出，不阻断构建。
import { readFile, writeFile } from "node:fs/promises"
import path from "node:path"
import { fileURLToPath } from "node:url"

const API_URL = "https://models.dev/api.json"
const PROVIDER = "commandcode"
const OUTPUT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "panel", "model-labs.json")

async function buildTable() {
  const response = await fetch(API_URL)
  if (!response.ok) throw new Error(`models.dev returned HTTP ${response.status}`)
  const catalog = await response.json()

  const provider = catalog?.[PROVIDER]
  if (!provider?.models || typeof provider.models !== "object") {
    throw new Error(`Provider "${PROVIDER}" was not found in models.dev`)
  }

  /** @type {Record<string, string>} */
  const labs = {}
  for (const [id, model] of Object.entries(provider.models)) {
    const canonical = typeof model?.canonical_model_id === "string" ? model.canonical_model_id : ""
    const slash = canonical.indexOf("/")
    if (slash > 0) labs[id] = canonical.slice(0, slash)
  }
  if (!Object.keys(labs).length) throw new Error("No model→lab entries were found")
  return `${JSON.stringify(Object.fromEntries(Object.entries(labs).sort(([a], [b]) => a.localeCompare(b))), null, 2)}\n`
}

let next
try {
  next = await buildTable()
} catch (error) {
  console.warn(`[gen-model-labs] 跳过更新，保留现有映射表：${error instanceof Error ? error.message : String(error)}`)
  process.exit(0)
}

let current = ""
try {
  current = await readFile(OUTPUT, "utf8")
} catch {
  // 文件不存在时直接写入。
}
if (current === next) {
  console.log("[gen-model-labs] 映射表已是最新，无需改动")
} else {
  await writeFile(OUTPUT, next, "utf8")
  console.log(`[gen-model-labs] 已写入 ${Object.keys(JSON.parse(next)).length} 条 model→lab 映射`)
}
