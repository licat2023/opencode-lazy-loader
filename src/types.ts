/**
 * Configuration for an MCP server
 *
 * Command formats:
 * 1. Array format: command: ["npx", "-y", "@some/mcp-server"]
 * 2. String + args: command: "npx", args: ["-y", "@some/mcp-server"]
 *
 * Environment variable formats:
 * 1. Object format (oh-my-opencode): env: { "KEY": "value" }
 * 2. Array format (OpenCode): env: ["KEY=value"]
 * 3. Legacy field name: environment (same formats as env)
 */
export interface McpServerConfig {
  command?: string | string[]
  args?: string[]
  env?: Record<string, string> | string[]
  /** @deprecated Use `env` instead */
  environment?: Record<string, string> | string[]
}

export interface NormalizedCommand {
  command: string
  args: string[]
}

export interface NormalizedEnv {
  env: Record<string, string>
}

/**
 * Information needed to identify an MCP client connection
 */
export interface McpClientInfo {
  sessionID: string
  skillName: string
  serverName: string
}

/**
 * Context for MCP operations
 */
export interface McpContext {
  config: McpServerConfig
  skillName: string
}


