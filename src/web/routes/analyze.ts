/**
 * AI-powered CVE dependency analysis routes.
 *
 * Uses Ollama (qwen2.5-coder:7b by default) to trace dependency chains,
 * identify fix approaches, and recommend actions. The AI does NOT judge
 * CVE severity — NIST scores are authoritative. The AI helps understand
 * HOW to fix, not WHETHER to fix.
 *
 * Results are cached in Redis for 7 days.
 */

import type { FastifyInstance } from 'fastify';
import type { WebServerConfig } from '../server.js';
import { getRedis, KEYS } from '../redis.js';

const ANALYSIS_TTL = 7 * 24 * 60 * 60; // 7 days

interface AnalysisResult {
  dependency_type: 'direct' | 'transitive' | 'unknown';
  dependency_chain: string;
  recommended_action: 'fix_direct' | 'fix_ecosystem' | 'vex_with_justification' | 'needs_discussion';
  fix_command: string | null;
  parent_package: string | null;
  source_usage: string;
  reasoning: string;
  vex_option: string | null;
  cross_repo_conflict: string | null;
}

export async function registerAnalyzeRoutes(app: FastifyInstance, config: WebServerConfig): Promise<void> {
  const { github } = config;
  const ollamaUrl = process.env.OLLAMA_URL;
  const ollamaModel = process.env.OLLAMA_MODEL ?? 'qwen2.5-coder:7b';

  app.post('/api/cve/analyze', async (req, reply) => {
    const { owner, repo, alertNumber, force } = req.body as any;
    if (!owner || !repo || !alertNumber) {
      return reply.status(400).send({ error: 'owner, repo, and alertNumber required' });
    }

    // 1. Check cache
    const cacheKey = `gitsteer:analysis:${owner}:${repo}:${alertNumber}`;
    if (!force) {
      try {
        const redis = await getRedis();
        const cached = await redis.get(cacheKey);
        if (cached) return reply.send({ ...JSON.parse(cached), cached: true });
      } catch { /* proceed without cache */ }
    }

    if (!ollamaUrl) {
      return reply.status(503).send({ error: 'OLLAMA_URL not configured — AI analysis unavailable' });
    }

    const gh = github as any;
    const octokit = gh.getOctokit ? gh.getOctokit() : gh.octokit;

    try {
      // 2. Get alert details
      const { data: alert } = await octokit.rest.dependabot.getAlert({
        owner,
        repo,
        alert_number: alertNumber,
      });
      const pkg = alert.security_vulnerability?.package?.name ?? 'unknown';
      const ecosystem = alert.security_vulnerability?.package?.ecosystem ?? 'unknown';
      const severity = alert.security_vulnerability?.severity ?? 'unknown';
      const vulnRange = alert.security_vulnerability?.vulnerable_version_range ?? '';
      const fixVersion = alert.security_vulnerability?.first_patched_version?.identifier ?? null;
      const description = alert.security_advisory?.description ?? '';
      const manifestPath = alert.dependency?.manifest_path ?? '';

      // 3. Get manifest content
      let manifestContent = '';
      try {
        const { data } = await octokit.rest.repos.getContent({ owner, repo, path: manifestPath });
        if (!Array.isArray(data) && 'content' in data) {
          manifestContent = Buffer.from(data.content, 'base64').toString('utf-8').slice(0, 5000);
        }
      } catch { /* manifest not found */ }

      // 4. Get lock file excerpt for the vulnerable package
      let lockExcerpt = '';
      const lockFiles = ['uv.lock', 'package-lock.json', 'go.sum', 'pnpm-lock.yaml', 'yarn.lock'];
      for (const lf of lockFiles) {
        try {
          const { data } = await octokit.rest.repos.getContent({ owner, repo, path: lf });
          if (!Array.isArray(data) && 'content' in data) {
            const content = Buffer.from(data.content, 'base64').toString('utf-8');
            const lines = content.split('\n');
            const idx = lines.findIndex((l: string) => l.toLowerCase().includes(pkg.toLowerCase()));
            if (idx >= 0) {
              lockExcerpt = lines.slice(Math.max(0, idx - 3), idx + 10).join('\n');
              break;
            }
          }
        } catch { continue; }
      }

      // 5. Search source for imports of the vulnerable package
      let importGrep = '';
      try {
        const { data } = await octokit.rest.search.code({
          q: `${pkg} repo:${owner}/${repo}`,
          per_page: 5,
        });
        importGrep = data.items
          .map((i: any) => `${i.path}: ${i.text_matches?.[0]?.fragment ?? ''}`)
          .join('\n');
      } catch { /* code search may fail */ }

      // 6. Query cross-repo history for this CVE and package
      let crossRepoContext = '';
      try {
        const redis = await getRedis();
        // Search for analyses of the same package across all repos
        const allKeys = await redis.keys('gitsteer:analysis:*');
        const priorAnalyses: any[] = [];
        const priorVex: any[] = [];

        for (const key of allKeys) {
          // Skip the current repo's alert
          if (key === cacheKey) continue;
          const raw = await redis.get(key);
          if (!raw) continue;
          const prior = JSON.parse(raw);
          if (prior.package === pkg || prior.cve_id === alert.security_advisory?.cve_id) {
            priorAnalyses.push({
              repo: prior.repo || key.split(':').slice(2, 4).join('/'),
              action: prior.analysis?.recommended_action,
              severity: prior.severity,
              reasoning: prior.analysis?.reasoning?.slice(0, 100),
            });
          }
        }

        // Check VEX entries for this package
        const vexKeys = await redis.keys('gitsteer:vex:*');
        for (const key of vexKeys) {
          const raw = await redis.get(key);
          if (!raw) continue;
          const vex = JSON.parse(raw);
          if (vex.cve_id?.includes(pkg) || key.includes(pkg.toLowerCase())) {
            priorVex.push({
              repo: key.split(':').slice(2, 4).join('/'),
              status: vex.status,
              justification: vex.justification,
            });
          }
        }

        if (priorAnalyses.length > 0) {
          crossRepoContext += `\nPRIOR ANALYSES of ${pkg} across other repos:\n`;
          for (const p of priorAnalyses) {
            crossRepoContext += `  - ${p.repo}: ${p.action} (${p.severity}) — ${p.reasoning}\n`;
          }
        }

        if (priorVex.length > 0) {
          crossRepoContext += `\nEXISTING VEX DECISIONS for ${pkg}:\n`;
          for (const v of priorVex) {
            crossRepoContext += `  - ${v.repo}: ${v.status} (${v.justification})\n`;
          }
          crossRepoContext += `\nWARNING: If this CVE severity is HIGH or CRITICAL but the package was previously VEX'd as low-risk in another repo, flag this inconsistency in your reasoning.\n`;
        }
      } catch { /* cross-repo query failed, proceed without */ }

      // 7. Build prompt — AI analyzes dependency chain and fix path, NOT severity
      const prompt = `You are a dependency analyst for git-steer. Your job is to trace how a vulnerable package entered a project and recommend the best fix approach.

IMPORTANT RULES:
- Do NOT judge the severity — NIST already scored this CVE as ${severity.toUpperCase()}.
- Do NOT say a CVE is "not vulnerable" or "not exploitable" — that is not your call.
- DO trace the dependency chain: is it direct (in manifest) or transitive (only in lock file)?
- DO recommend the specific command to fix it based on the ecosystem.
- DO identify if a VEX entry would be appropriate for LOW severity issues where the fix requires significant effort.

CVE: ${alert.security_advisory?.cve_id ?? 'N/A'}
NIST Severity: ${severity.toUpperCase()} (this is authoritative — do not override)
Package: ${pkg}
Ecosystem: ${ecosystem}
Vulnerable range: ${vulnRange}
Fix version: ${fixVersion ?? 'none available'}
Manifest path: ${manifestPath}

Repository: ${owner}/${repo}

Manifest content (dependency declarations):
${manifestContent.slice(0, 3000) || 'not available'}

Lock file entry for ${pkg}:
${lockExcerpt || 'not found in lock file'}

Source code that references ${pkg}:
${importGrep || 'no direct imports found in source'}

Answer these questions:
1. Is ${pkg} a direct dependency (listed in the manifest) or transitive (only appears in the lock file)?
2. If transitive, what parent package pulls it in?
3. What is the exact command to fix this in the ${ecosystem} ecosystem?
4. For LOW severity with no direct import: would a VEX entry be reasonable while waiting for an upstream fix?
5. If there are prior analyses or VEX decisions from other repos, are they consistent with this repo's situation?
${crossRepoContext}
Respond with ONLY valid JSON:
{
  "dependency_type": "direct" | "transitive" | "unknown",
  "dependency_chain": "package → parent → grandparent (trace how it entered the project)",
  "recommended_action": "fix_direct" | "fix_ecosystem" | "vex_with_justification" | "needs_discussion",
  "fix_command": "the exact command to run, or null if no automated fix",
  "parent_package": "the parent that pulls in the vulnerable package, or null if direct",
  "source_usage": "describe how the project uses this package based on the source grep results",
  "reasoning": "plain English explanation of your recommendation",
  "vex_option": "if a VEX entry is reasonable, explain why. null if fix is straightforward",
  "cross_repo_conflict": "description of any inconsistency with prior VEX decisions from other repos, or null if no conflict"
}`;

      // 8. Call Ollama
      const ollamaRes = await fetch(`${ollamaUrl}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: ollamaModel,
          messages: [{ role: 'user', content: prompt }],
          stream: false,
          options: { num_predict: 1024 },
        }),
      });

      if (!ollamaRes.ok) {
        return reply.status(502).send({ error: `Ollama returned ${ollamaRes.status}` });
      }

      const ollamaData = (await ollamaRes.json()) as any;
      const rawText = ollamaData.message?.content ?? '';

      // 9. Parse response — strip markdown fences if present
      let analysis: AnalysisResult;
      try {
        const cleaned = rawText.replace(/```json?\n?/g, '').replace(/```/g, '').trim();
        const jsonStart = cleaned.indexOf('{');
        const jsonEnd = cleaned.lastIndexOf('}');
        analysis = JSON.parse(cleaned.slice(jsonStart, jsonEnd + 1));
      } catch {
        analysis = {
          dependency_type: 'unknown',
          dependency_chain: 'unable to determine',
          recommended_action: 'needs_discussion',
          fix_command: null,
          parent_package: null,
          source_usage: 'AI analysis returned unparseable response',
          reasoning: rawText.slice(0, 300),
          vex_option: null,
          cross_repo_conflict: null,
        };
      }

      const result = {
        alertNumber,
        cve_id: alert.security_advisory?.cve_id,
        package: pkg,
        ecosystem,
        severity,
        fixVersion,
        analysis,
        analyzed_at: new Date().toISOString(),
      };

      // 10. Cache in Redis (7-day TTL) and index by package for cross-repo queries
      try {
        const redis = await getRedis();
        await redis.set(cacheKey, JSON.stringify(result), { EX: ANALYSIS_TTL });
        // Also index by package for cross-repo queries
        const pkgKey = `gitsteer:pkg-analysis:${pkg.toLowerCase()}:${owner}:${repo}`;
        await redis.set(pkgKey, JSON.stringify(result), { EX: ANALYSIS_TTL });
      } catch { /* non-fatal */ }

      return reply.send(result);
    } catch (err: any) {
      return reply.status(500).send({ error: err.message });
    }
  });

  // Batch analyze — lists all alerts for a repo, ready for per-alert analysis
  app.post('/api/cve/analyze-all', async (req, reply) => {
    const { owner, repo } = req.body as any;
    if (!owner || !repo) return reply.status(400).send({ error: 'owner and repo required' });

    const gh = github as any;
    const alerts = await gh.getSecurityAlertsDetailed(owner, repo);

    return reply.send({
      total: alerts.length,
      message: `${alerts.length} alerts ready for analysis. Use /api/cve/analyze per alert for AI-powered recommendations.`,
      alerts: alerts.map((a: any) => ({
        alertNumber: a.alertNumber,
        package: a.package,
        severity: a.severity,
        cve: a.cve,
      })),
    });
  });
}
