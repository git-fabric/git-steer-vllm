/**
 * AI-powered CVE analysis routes.
 *
 * Uses Ollama (qwen2.5-coder:7b by default) to analyze Dependabot alerts,
 * determine exploitability, and recommend actions (fix, VEX, escalate).
 * Results are cached in Redis for 7 days.
 */

import type { FastifyInstance } from 'fastify';
import type { WebServerConfig } from '../server.js';
import { getRedis, KEYS } from '../redis.js';

const ANALYSIS_TTL = 7 * 24 * 60 * 60; // 7 days

interface AnalysisResult {
  action: 'fix' | 'fix_ecosystem' | 'vex_permanent' | 'vex_temporary' | 'escalate';
  reason: string;
  command: string | null;
  vex_justification: string | null;
  vex_detail: string | null;
  confidence: number;
  exploitable: boolean;
  dependency_chain: string;
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

      // 6. Build prompt
      const prompt = `You are a security analyst for git-steer. Analyze this CVE and recommend an action.

CVE: ${alert.security_advisory?.cve_id ?? 'N/A'}
Severity: ${severity}
Package: ${pkg}
Ecosystem: ${ecosystem}
Vulnerable range: ${vulnRange}
Fix version: ${fixVersion ?? 'none available'}
Manifest path: ${manifestPath}
Description: ${description.slice(0, 2000)}

Repository: ${owner}/${repo}
Manifest content:
${manifestContent.slice(0, 3000)}

Lock file entry for ${pkg}:
${lockExcerpt || 'not found in lock file'}

Source code references to ${pkg}:
${importGrep || 'no direct imports found'}

Is this a direct dependency (listed in the manifest) or transitive (only in lock file)?
Is the vulnerable code path reachable in this project?
What is the recommended action?

Respond with ONLY valid JSON:
{
  "action": "fix" | "fix_ecosystem" | "vex_permanent" | "vex_temporary" | "escalate",
  "reason": "plain English explanation",
  "command": "exact command to run if fix_ecosystem, null otherwise",
  "vex_justification": "component_not_present" | "vulnerable_code_not_reachable" | "vulnerable_code_cannot_be_controlled_by_adversary" | "inline_mitigations_already_exist" | null,
  "vex_detail": "explanation for VEX, null if not VEX",
  "confidence": 0.0 to 1.0,
  "exploitable": true | false,
  "dependency_chain": "how this package got into the project"
}`;

      // 7. Call Ollama
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

      // 8. Parse response — strip markdown fences if present
      let analysis: AnalysisResult;
      try {
        const cleaned = rawText.replace(/```json?\n?/g, '').replace(/```/g, '').trim();
        const jsonStart = cleaned.indexOf('{');
        const jsonEnd = cleaned.lastIndexOf('}');
        analysis = JSON.parse(cleaned.slice(jsonStart, jsonEnd + 1));
      } catch {
        analysis = {
          action: 'escalate',
          reason: `AI analysis returned unparseable response: ${rawText.slice(0, 200)}`,
          command: null,
          vex_justification: null,
          vex_detail: null,
          confidence: 0,
          exploitable: true,
          dependency_chain: 'unknown',
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

      // 9. Cache in Redis (7-day TTL)
      try {
        const redis = await getRedis();
        await redis.set(cacheKey, JSON.stringify(result), { EX: ANALYSIS_TTL });
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
