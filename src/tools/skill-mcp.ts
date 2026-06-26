import { tool, type ToolDefinition } from '@opencode-ai/plugin/tool'
import type { McpServerConfig } from '../types.js'
import type { SkillMcpManager } from '../skill-mcp-manager.js'
import { debugLog } from '../utils/debug.js'

type ServerEntry = { config: McpServerConfig; skillName: string }

const SKILL_MCP_DESCRIPTION = 
  `Invoke MCP server operations from skill-embedded MCPs. Requires mcp_name plus exactly one of: tool_name, resource_name, or prompt_name.`

interface OperationInfo {
  type: 'tool' | 'resource' | 'prompt'
  name: string
}

/**
 * Validate that exactly one operation parameter is provided
 */
function validateOperationParams(args: {
  tool_name?: string
  resource_name?: string
  prompt_name?: string
}): OperationInfo {
  const operations: OperationInfo[] = []

  if (args.tool_name) {
    operations.push({ type: 'tool', name: args.tool_name })
  }
  if (args.resource_name) {
    operations.push({ type: 'resource', name: args.resource_name })
  }
  if (args.prompt_name) {
    operations.push({ type: 'prompt', name: args.prompt_name })
  }

  if (operations.length === 0) {
    throw new Error(
      `Missing operation. Exactly one of tool_name, resource_name, or prompt_name must be specified.\n\n` +
      `Examples:\n` +
      `  skill_mcp(mcp_name="sqlite", tool_name="query", arguments='{"sql": "SELECT * FROM users"}')\n` +
      `  skill_mcp(mcp_name="memory", resource_name="memory://notes")\n` +
      `  skill_mcp(mcp_name="helper", prompt_name="summarize", arguments='{"text": "..."}')`
    )
  }

  if (operations.length > 1) {
    const provided = [
      args.tool_name && `tool_name="${args.tool_name}"`,
      args.resource_name && `resource_name="${args.resource_name}"`,
      args.prompt_name && `prompt_name="${args.prompt_name}"`
    ].filter(Boolean).join(', ')

    throw new Error(
      `Multiple operations specified. Exactly one of tool_name, resource_name, or prompt_name must be provided.\n\n` +
      `Received: ${provided}\n\n` +
      `Use separate calls for each operation.`
    )
  }

  return operations[0]
}

/**
 * Format available MCPs for error message
 */
function formatAvailableMcps(serverMap: Map<string, ServerEntry>): string {
  if (serverMap.size === 0) return '  (none found)'
  return Array.from(serverMap.entries())
    .map(([name, entry]) => `  - "${name}" from skill "${entry.skillName}"`)
    .join('\n')
}

/**
 * Parse JSON arguments string
 */
function parseArguments(argsJson?: string): Record<string, unknown> {
  if (!argsJson) {
    return {}
  }

  try {
    const parsed = JSON.parse(argsJson)
    if (typeof parsed !== 'object' || parsed === null) {
      throw new Error('Arguments must be a JSON object')
    }
    return parsed as Record<string, unknown>
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error)
    throw new Error(
      `Invalid arguments JSON: ${errorMessage}\n\n` +
      `Expected a valid JSON object, e.g.: '{"key": "value"}'\n` +
      `Received: ${argsJson}`
    )
  }
}

/**
 * Apply grep filter to output
 */
function applyGrepFilter(output: string, pattern?: string): string {
  if (!pattern) {
    return output
  }

  try {
    const regex = new RegExp(pattern, 'i')
    const lines = output.split('\n')
    const filtered = lines.filter((line) => regex.test(line))
    return filtered.length > 0
      ? filtered.join('\n')
      : `[grep] No lines matched pattern: ${pattern}`
  } catch (e) {
    debugLog(`applyGrepFilter: invalid regex "${pattern}": ${e}`)
    return output
  }
}

export interface CreateSkillMcpToolOptions {
  manager: SkillMcpManager
  getServerMap: () => Map<string, ServerEntry>
  getSessionID: () => string
}

/**
 * Create the skill_mcp tool
 */
export function createSkillMcpTool(options: CreateSkillMcpToolOptions): ToolDefinition {
  const { manager, getServerMap, getSessionID } = options

  return tool({
    description: SKILL_MCP_DESCRIPTION,
    args: {
      mcp_name: tool.schema.string().describe('Name of the MCP server from skill config'),
      tool_name: tool.schema.string().optional().describe('MCP tool to call'),
      resource_name: tool.schema.string().optional().describe('MCP resource URI to read'),
      prompt_name: tool.schema.string().optional().describe('MCP prompt to get'),
      arguments: tool.schema.string().optional().describe('JSON string of arguments'),
      grep: tool.schema.string().optional().describe(
        'Regex pattern to filter output lines (only matching lines returned)'
      )
    },
    async execute(args) {
      const operation = validateOperationParams(args)
      const serverMap = getServerMap()
      const entry = serverMap.get(args.mcp_name)

      if (!entry) {
        throw new Error(
          `MCP server "${args.mcp_name}" not found.\n\n` +
          `Available MCP servers:\n` +
          formatAvailableMcps(serverMap) + '\n\n' +
          `Hint: Load the skill first using the 'skill' tool, then call skill_mcp.`
        )
      }

      const info = {
        serverName: args.mcp_name,
        skillName: entry.skillName,
        sessionID: getSessionID()
      }

      const context = {
        config: entry.config,
        skillName: entry.skillName
      }

      const parsedArgs = parseArguments(args.arguments)
      let output: string

      switch (operation.type) {
        case 'tool': {
          const result = await manager.callTool(info, context, operation.name, parsedArgs)
          output = JSON.stringify(result, null, 2)
          break
        }
        case 'resource': {
          const result = await manager.readResource(info, context, operation.name)
          output = JSON.stringify(result, null, 2)
          break
        }
        case 'prompt': {
          const stringArgs: Record<string, string> = {}
          for (const [key, value] of Object.entries(parsedArgs)) {
            stringArgs[key] = String(value)
          }
          const result = await manager.getPrompt(info, context, operation.name, stringArgs)
          output = JSON.stringify(result, null, 2)
          break
        }
      }

      return applyGrepFilter(output, args.grep)
    }
  })
}
