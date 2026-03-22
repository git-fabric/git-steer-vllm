# git-steer-vllm

Next-generation GitHub autonomy engine with vLLM-powered intelligence. Built on the battle-tested git-steer OG codebase, enhanced with a local inference model for autonomous decision-making.

## What's Different from the OG

git-steer-vllm extends the original git-steer with:

- **vLLM Intelligence** — A `qwen2.5-coder:7b` model (via Ollama Modelfile) trained on git-steer's architecture, providing code-aware inference for tool selection, issue triage, and remediation planning
- **Web Dashboard** — Fastify API + React frontend for CVE tracking, repo status, SBOM, and VEX management
- **Full OG Tool Suite** — All 60+ MCP tools from the original: repo management, branch ops, security scanning, Actions control, fabric integration

## Architecture

```
┌─────────────────────────────────────────┐
│  Claude Desktop / MCP Client            │
└────────────┬────────────────────────────┘
             │ stdio (JSON-RPC)
┌────────────▼────────────────────────────┐
│  git-steer-vllm MCP Server              │
│  ├── src/mcp/         — tool registry   │
│  ├── src/github/      — Octokit client  │
│  ├── src/fabric/      — fabric adapter  │
│  ├── src/state/       — JSONL state mgr │
│  ├── src/core/        — keychain, setup │
│  └── src/web/         — Fastify API     │
├─────────────────────────────────────────┤
│  Modelfile (qwen2.5-coder:7b)          │
│  — git-steer-Ops intelligence agent     │
│  — Architecture-aware code inference    │
└─────────────────────────────────────────┘
         │                    │
    GitHub API           State Repo
   (App auth)       (ry-ops/git-steer-state)
```

## Quick Start

```bash
# Install dependencies
npm install

# Build TypeScript
npm run build

# Run MCP server (stdio mode)
npx git-steer serve

# Run web dashboard
node bin/web.js
```

## Modelfile (vLLM)

The `Modelfile` defines the git-steer-Ops inference model:

```bash
# Create the model in Ollama
ollama create git-steer-ops -f Modelfile

# Test it
ollama run git-steer-ops "How does git-steer handle rate limits?"
```

Base model: `qwen2.5-coder:7b` with temperature 0.15, 4096 context window.

## MCP Tools

### Repository Management
`repo_list`, `repo_create`, `repo_archive`, `repo_delete`, `repo_settings`, `repo_read_file`, `repo_list_files`, `repo_commit`

### Branch Operations
`branch_list`, `branch_protect`, `branch_reap`

### Security
`security_alerts`, `security_dismiss`, `security_digest`, `security_scan`, `security_fix_pr`, `security_sweep`, `security_enforce`

### GitHub Actions
`actions_workflows`, `actions_trigger`, `actions_secrets`

### CVE / Vulnerability
`fabric_cve_scan`, `fabric_cve_triage`, `fabric_cve_enrich`, `fabric_cve_queue`, `fabric_cve_stats`, `fabric_cve_compact`

### Ops & Monitoring
`ops_metrics`, `oomkill_detect`, `oomkill_remediate`, `cert_check`, `cert_renew`

### Pull Requests
`pr_dedup_check`, `pr_dedup_create`, `code_review`, `code_quality_sweep`

### Configuration
`config_show`, `config_add_repo`, `config_remove_repo`, `steer_status`, `steer_sync`, `steer_logs`

### Fabric Integration
`fabric_git_*` — Full git operations via the fabric adapter (list repos, branches, commits, files, create PRs, etc.)

## Development

```bash
npm run dev      # Development mode (tsx)
npm run lint     # ESLint
npm test         # Vitest
npm run build    # TypeScript compile
```

## License

MIT
