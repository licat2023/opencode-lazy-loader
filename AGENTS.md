# opencode-lazy-loader agent guidelines

ESM TypeScript plugin (`@opencode-ai/plugin`) that discovers skills from the filesystem, loads their MCP server configs, and lazily connects/manages MCP clients per session.

## Commands

| Cmd | What |
|-----|------|
| `npm run build` | `npx tsc` → `dist/` |
| `npm test` | `vitest run` (picks up `src/**/*.test.ts`) |
| `npm run clean` | `rm -rf dist` (PowerShell: works but may warn) |
| `npm run watch` | `npx tsc --watch` |
| `npm pack` | Verify `dist/index.js` is included before publish |
| `npm publish` | Prepack runs `clean && build` automatically |

## Architecture

```
src/
├── index.ts               # Plugin factory, OMO conflict detection, session lifecycle
├── types.ts               # All interfaces (McpServerConfig, LoadedSkill, etc.)
├── skill-loader.ts        # Scan .opencode/skills/ + ~/.config/opencode/skills/
├── skill-mcp-manager.ts   # StdioClientTransport pool per session:skill:server
├── tools/
│   ├── skill.ts           # Load skill body + discover MCP capabilities
│   └── skill-mcp.ts       # Route to tool/resource/prompt on a loaded MCP server
└── utils/
    ├── env-vars.ts        # ${VAR}/${VAR:-default} expansion, normalizeCommand, normalizeEnv
    └── frontmatter.ts     # YAML frontmatter extraction (js-yaml)
```

Plugin entry: default export `OpenCodeEmbeddedSkillMcp`, also named export. Both required for compatibility.

## Non-obvious code facts

### Skill discovery (`skill-loader.ts`)
- Scans **`.opencode/skills/`** (project) and **`~/.config/opencode/skills/`** (global) — **both plural**.
- ⚠️ **Current repo mismatch**: the example skill lives at `.opencode/skill/playwright-example/` (singular) — it is **not discovered** by the code. An agent should be aware of this.
- Project skills override globals by name (Map merge, global first then project).
- Per directory: tries `SKILL.md` → `{dirname}.md` → standalone `.md` files.
- `mcp.json` in skill dir takes priority over YAML frontmatter `mcp:` block.
- `mcp.json` supports `{ mcpServers: {...} }`, `{ mcp: {...} }`, or bare `{ serverName: { command: ... } }`.

### MCP config normalization (`utils/env-vars.ts`)
- `command` accepts **array** (`["npx", "-y", "@pkg"]`) or **string + args** syntax. If array, `args` field is ignored.
- `env` accepts **object** (`{ KEY: "val" }`) or **array** (`["KEY=val"]`). Array splits on first `=`.
- `environment` field deprecated; `env` takes priority when both present.
- Essential vars forwarded to child process: `PATH`, `HOME`, `USER`, `SHELL`, `TERM`, `NODE_ENV`, `TMPDIR`, `LANG`, `LC_ALL`, `npm_config_registry`, `npm_config_cache`.
- Supports both `${VAR}` and `${VAR:-default}`.

### Connection & cleanup
- Connection key format: **`${sessionID}:${skillName}:${serverName}`**.
- Idle cleanup: 60s interval check, 5min timeout. Interval is `unref()`'d (won't keep process alive).
- Session cleanup on `session.deleted` event.
- Retry-once: if `getOrCreateClient` fails for an existing key, it removes the dead entry and retries.
- Process cleanup: `SIGINT`, `SIGTERM`, and **`SIGBREAK`** (Win32 only).

### oh-my-opencode conflict detection (`index.ts`)
- Fast path: reads `$OPENCODE_CONFIG` file directly (sync) to check for `oh-my-opencode` / `@code-yeongyu/oh-my-opencode` / any `/oh-my-opencode` entry.
- Fallback: `client.config.get()` with 1s timeout.
- Override: `OPENCODE_LAZY_LOADER_FORCE=1` skips all conflict checks.

### Debugging
- `OPENCODE_LAZY_LOADER_DEBUG=1` → appends timestamps to `/tmp/opencode-lazy-loader.log`.

### `skill_mcp` tool (`tools/skill-mcp.ts`)
- Requires exactly one of `tool_name`, `resource_name`, `prompt_name` — rejects zero or >1.
- `arguments` is a **JSON string** (not an object), parsed internally.
- `grep` param filters output lines by case-insensitive regex.

## Tests
- Single test file: `src/__tests__/normalize-command.test.ts` covers `normalizeCommand` and `normalizeEnv`.
- Run: `npm test`.
