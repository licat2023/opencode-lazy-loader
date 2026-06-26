import { promises as fs } from 'fs'
import { join } from 'path'
import * as yaml from 'js-yaml'
import type { McpServerConfig } from './types.js'
import { debugLog } from './utils/debug.js'

/**
 * Load MCP config from mcp.json file in skill directory
 */
async function loadMcpJsonFromDir(
  skillDir: string
): Promise<Record<string, McpServerConfig> | undefined> {
  const mcpJsonPath = join(skillDir, 'mcp.json')
  
  try {
    const content = await fs.readFile(mcpJsonPath, 'utf-8')
    const parsed = JSON.parse(content) as Record<string, unknown>

    // Support { mcpServers: { ... } } format
    if (parsed && typeof parsed === 'object' && 'mcpServers' in parsed && parsed.mcpServers) {
      return parsed.mcpServers as Record<string, McpServerConfig>
    }

    // Support { mcp: { ... } } format (OpenCode config style)
    if (parsed && typeof parsed === 'object' && 'mcp' in parsed && parsed.mcp) {
      return parsed.mcp as Record<string, McpServerConfig>
    }

    // Support direct { serverName: { command: ... } } format
    if (parsed && typeof parsed === 'object' && !('mcpServers' in parsed) && !('mcp' in parsed)) {
      const hasCommandField = Object.values(parsed).some(
        (v) => v && typeof v === 'object' && 'command' in (v as Record<string, unknown>)
      )
      if (hasCommandField) {
        return parsed as unknown as Record<string, McpServerConfig>
      }
    }
  } catch (e) {
    debugLog(`loadMcpJsonFromDir(${skillDir}): ${e}`)
    return undefined
  }

  return undefined
}

/**
 * Extract MCP config from YAML frontmatter of a markdown string.
 */
function parseMcpFromFrontmatter(
  content: string
): Record<string, McpServerConfig> | undefined {
  const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---/)
  if (!match) return undefined
  try {
    const parsed = yaml.load(match[1]) as { mcp?: Record<string, McpServerConfig> } | undefined
    if (parsed && typeof parsed === 'object' && 'mcp' in parsed && parsed.mcp) {
      return parsed.mcp
    }
  } catch (e) {
    debugLog(`parseMcpFromFrontmatter: ${e}`)
  }
  return undefined
}

/**
 * Load MCP config from a skill directory.
 * Checks mcp.json first, then falls back to SKILL.md frontmatter.
 */
export async function loadMcpConfigFromSkillDir(
  skillDir: string
): Promise<Record<string, McpServerConfig> | undefined> {
  const jsonConfig = await loadMcpJsonFromDir(skillDir)
  if (jsonConfig) return jsonConfig

  const skillMdPath = join(skillDir, 'SKILL.md')
  try {
    const content = await fs.readFile(skillMdPath, 'utf-8')
    return parseMcpFromFrontmatter(content)
  } catch {
    return undefined
  }
}
