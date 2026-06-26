import type { Plugin } from '@opencode-ai/plugin'
import { readFileSync, existsSync } from 'fs'
import { createSkillMcpManager } from './skill-mcp-manager.js'
import { loadMcpConfigFromSkillDir } from './skill-loader.js'
import { formatMcpCapabilities } from './tools/skill.js'
import { createSkillMcpTool } from './tools/skill-mcp.js'
import type { McpServerConfig } from './types.js'
import { debugLog } from './utils/debug.js'

/**
 * Read plugins from config file directly (sync, fast)
 */
function getPluginsFromConfigFile(): string[] | null {
  const configPath = process.env.OPENCODE_CONFIG
  if (!configPath) {
    debugLog('No OPENCODE_CONFIG env var')
    return null
  }
  
  const homeDir = process.env.HOME || process.env.USERPROFILE || ''
  const expandedPath = configPath.replace(/^~/, homeDir)
  
  if (!existsSync(expandedPath)) {
    debugLog(`Config file not found: ${expandedPath}`)
    return null
  }
  
  try {
    const content = readFileSync(expandedPath, 'utf-8')
    const config = JSON.parse(content)
    debugLog(`Read config from ${expandedPath}, plugins: ${JSON.stringify(config.plugin)}`)
    return config.plugin || null
  } catch (e) {
    debugLog(`Error reading config: ${e}`)
    return null
  }
}

function hasOhMyOpencode(plugins: string[]): boolean {
  return plugins.some(p =>
    p === 'oh-my-opencode' ||
    p === '@code-yeongyu/oh-my-opencode' ||
    p.endsWith('/oh-my-opencode')
  )
}

// Helper to race a promise against a timeout
function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T | null> {
  return Promise.race([
    promise,
    new Promise<null>((resolve) => setTimeout(() => resolve(null), ms))
  ])
}

type ServerEntry = { config: McpServerConfig; skillName: string; skillDir: string }

export const OpenCodeEmbeddedSkillMcp: Plugin = async ({ client }) => {
  debugLog('Plugin initializing...')
  
  // Check for oh-my-opencode conflict
  if (process.env.OPENCODE_LAZY_LOADER_FORCE !== '1') {
    debugLog('Checking for oh-my-opencode conflict...')
    
    // First try reading config file directly (fast, sync)
    const filePlugins = getPluginsFromConfigFile()
    if (filePlugins && hasOhMyOpencode(filePlugins)) {
      debugLog('oh-my-opencode detected in config file, auto-disabling')
      console.log('[opencode-lazy-loader] oh-my-opencode detected in config, auto-disabling to avoid conflicts')
      return {}
    }
    
    // Fallback: try SDK with timeout (in case OPENCODE_CONFIG not set)
    if (!filePlugins) {
      try {
        const result = await withTimeout(client.config.get(), 1000)
        debugLog(`config.get result: ${JSON.stringify(result?.data?.plugin || 'null')}`)
        if (result?.data?.plugin && hasOhMyOpencode(result.data.plugin)) {
          debugLog('oh-my-opencode detected via SDK, auto-disabling')
          console.log('[opencode-lazy-loader] oh-my-opencode detected in config, auto-disabling to avoid conflicts')
          return {}
        }
      } catch (e) {
        debugLog(`Error checking config via SDK: ${e}`)
      }
    }
    
    debugLog('No conflict detected, proceeding...')
  } else {
    debugLog('FORCE mode enabled, skipping conflict check')
  }

  const manager = createSkillMcpManager()
  const serverMap = new Map<string, ServerEntry>()
  let currentSessionID: string | null = null

  return {
    event: async ({ event }) => {
      if (event.type === 'session.created') {
        currentSessionID = event.properties.info.id
      }
      
      if (event.type === 'session.deleted' && currentSessionID) {
        await manager.disconnectSession(currentSessionID)
        serverMap.clear()
        currentSessionID = null
      }
    },

    "tool.execute.after": async (input, output) => {
      if (input.tool !== "skill") return

      const meta = output.metadata as Record<string, unknown> | undefined
      const skillName = meta?.name as string | undefined
      const dir = meta?.dir as string | undefined
      if (!dir || !skillName) return

      const mcpConfig = await loadMcpConfigFromSkillDir(dir)
      if (!mcpConfig || Object.keys(mcpConfig).length === 0) return

      for (const [serverName, config] of Object.entries(mcpConfig)) {
        const cfg = config as McpServerConfig
        serverMap.set(serverName, { config: cfg, skillName, skillDir: dir })
      }

      const mcpInfo = await formatMcpCapabilities(
        { name: skillName, mcpConfig },
        manager,
        currentSessionID || 'unknown'
      )

      if (mcpInfo) {
        output.output = (output.output ?? '') + mcpInfo
      }
    },

    tool: {
      skill_mcp: createSkillMcpTool({
        manager,
        getServerMap: () => serverMap,
        getSessionID: () => currentSessionID || 'unknown'
      })
    }
  }
}

// Default export for plugin loading
export default OpenCodeEmbeddedSkillMcp

// Re-export types for external use
export type { McpServerConfig } from './types.js'
export { createSkillMcpManager } from './skill-mcp-manager.js'
