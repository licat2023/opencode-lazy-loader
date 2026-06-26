import { appendFileSync, mkdirSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'

const ENABLED = process.env.OPENCODE_LAZY_LOADER_DEBUG === '1'
const LOG_PATH = join(tmpdir(), 'opencode-lazy-loader.log')

export function debugLog(msg: string): void {
  if (!ENABLED) return
  try { mkdirSync(tmpdir(), { recursive: true }) } catch { }
  const line = `[${new Date().toISOString()}] ${msg}\n`
  appendFileSync(LOG_PATH, line)
}
