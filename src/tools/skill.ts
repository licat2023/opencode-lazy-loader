import type { McpServerConfig } from '../types.js'
import type { SkillMcpManager } from '../skill-mcp-manager.js'

interface McpTool {
  name: string
  description?: string
  inputSchema?: unknown
}

interface McpResource {
  uri: string
}

interface McpPrompt {
  name: string
}

export interface SkillMcpInfo {
  name: string
  mcpConfig: Record<string, McpServerConfig>
}

/**
 * Format MCP capabilities for display
 */
export async function formatMcpCapabilities(
  skill: SkillMcpInfo,
  manager: SkillMcpManager,
  sessionID: string
): Promise<string | null> {
  if (!skill.mcpConfig || Object.keys(skill.mcpConfig).length === 0) {
    return null
  }

  const sections: string[] = ['', '## Available MCP Servers', '']

  for (const [serverName, config] of Object.entries(skill.mcpConfig)) {
    const info = {
      serverName,
      skillName: skill.name,
      sessionID
    }

    const context = {
      config: config as McpServerConfig,
      skillName: skill.name
    }

    sections.push(`### ${serverName}`)
    sections.push('')

    try {
      const [tools, resources, prompts] = await Promise.all([
        manager.listTools(info, context).catch(() => []) as Promise<McpTool[]>,
        manager.listResources(info, context).catch(() => []) as Promise<McpResource[]>,
        manager.listPrompts(info, context).catch(() => []) as Promise<McpPrompt[]>
      ])

      if (tools.length > 0) {
        sections.push('**Tools:**')
        sections.push('')
        for (const t of tools) {
          sections.push(`#### \`${t.name}\``)
          if (t.description) {
            sections.push(t.description)
          }
          sections.push('')
          sections.push('**inputSchema:**')
          sections.push('```json')
          sections.push(JSON.stringify(t.inputSchema, null, 2))
          sections.push('```')
          sections.push('')
        }
      }

      if (resources.length > 0) {
        sections.push(`**Resources**: ${resources.map((r) => r.uri).join(', ')}`)
      }

      if (prompts.length > 0) {
        sections.push(`**Prompts**: ${prompts.map((p) => p.name).join(', ')}`)
      }

      if (tools.length === 0 && resources.length === 0 && prompts.length === 0) {
        sections.push('*No capabilities discovered*')
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      sections.push(`*Failed to connect: ${errorMessage.split('\n')[0]}*`)
    }

    sections.push('')
    sections.push(`Use \`skill_mcp\` tool with \`mcp_name="${serverName}"\` to invoke.`)
    sections.push('')
  }

  return sections.join('\n')
}


