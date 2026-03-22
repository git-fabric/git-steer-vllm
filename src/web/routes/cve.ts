/**
 * CVE scanning routes with scan lifecycle tracking
 *
 * POST /api/cve/scan                    — trigger CVE scan for a repo
 * GET  /api/cve/results/:owner/:repo    — get scan results
 * POST /api/cve/triage/:cveId           — triage a CVE
 * POST /api/cve/fix                     — create a fix PR (single)
 * POST /api/cve/merge                   — merge a Dependabot PR
 * POST /api/cve/fix-all                 — create fix PRs for ALL fixable CVEs
 * POST /api/cve/verify                  — verify fixes (body-based)
 * POST /api/cve/verify/:owner/:repo     — re-scan after fixes, compare to previous
 * GET  /api/cve/queue                   — get pending CVE queue
 * GET  /api/scans/recent                — recent scans across all repos
 * GET  /api/scans/:scanId               — single scan details
 * GET  /api/trends/:owner/:repo         — severity trend data
 * GET  /api/autoscan/:owner/:repo       — get auto-scan config
 * POST /api/autoscan/:owner/:repo       — set auto-scan schedule
 */

import crypto from 'crypto';
import type { FastifyInstance } from 'fastify';
import type { WebServerConfig } from '../server.js';
import type { SecurityAlert } from '../github-token.js';
import { getRedis, KEYS } from '../redis.js';

// ── Scan lifecycle types ──────────────────────────────────────────────

export interface ScanRecord {
  scan_id: string;
  repo: string;
  status: 'queued' | 'scanning' | 'complete' | 'fixes_applied' | 'verified' | 'failed';
  started_at: string;
  completed_at?: string;
  alert_count: number;
  critical: number;
  high: number;
  medium: number;
  low: number;
  fixes_created: number;
  fixes_merged: number;
  fixes_verified: number;
  fixes_failed: number;
}


// ── Helpers ───────────────────────────────────────────────────────────

/** Translate raw GitHub API errors into human-readable messages */
function humanizeError(err: any): string {
  const msg = err?.message ?? String(err);
  if (msg.includes('Reference already exists')) return 'A previous fix attempt left a stale branch. Retrying with cleanup.';
  if (msg.includes('Merge conflict')) return 'The fix has a merge conflict with the default branch. Manual resolution needed.';
  if (msg.includes('Required status check')) return 'PR can\'t be merged — required CI checks haven\'t passed yet.';
  if (msg.includes('rate limit')) return 'GitHub API rate limit reached. Try again in a few minutes.';
  if (msg.includes('not found') || msg.includes('Not Found')) return 'Repository or resource not found. Check permissions.';
  if (msg.includes('403')) return 'Permission denied. The GitHub token may not have write access to this repo.';
  if (msg.includes('Package') && msg.includes('not found')) return 'Package not found in package.json. The vulnerability may be in a transitive dependency.';
  return msg;
}

function emptyScanRecord(repo: string): ScanRecord {
  return {
    scan_id: crypto.randomUUID(),
    repo,
    status: 'scanning',
    started_at: new Date().toISOString(),
    alert_count: 0,
    critical: 0,
    high: 0,
    medium: 0,
    low: 0,
    fixes_created: 0,
    fixes_merged: 0,
    fixes_verified: 0,
    fixes_failed: 0,
  };
}

function countSeverities(alerts: SecurityAlert[]): Pick<ScanRecord, 'critical' | 'high' | 'medium' | 'low'> {
  const counts = { critical: 0, high: 0, medium: 0, low: 0 };
  for (const a of alerts) {
    const sev = (a.severity ?? '').toLowerCase() as keyof typeof counts;
    if (sev in counts) counts[sev]++;
  }
  return counts;
}

/** Persist scan record to Redis with history tracking. */
async function saveScanRecord(scan: ScanRecord): Promise<void> {
  try {
    const redis = await getRedis();
    const json = JSON.stringify(scan);
    await redis.set(KEYS.scan(scan.scan_id), json);
    await redis.set(KEYS.scanLatest(scan.repo), json);
    // Push to per-repo scan history list (most recent first)
    await redis.lPush(KEYS.scanHistory(scan.repo), json);
    // Trim to keep last 100 scans per repo
    await redis.lTrim(KEYS.scanHistory(scan.repo), 0, 99);
  } catch (err) {
    console.warn('[redis] Failed to save scan record:', (err as Error).message);
  }
}

/** Record trend data point for the repo. */
async function recordTrend(scan: ScanRecord): Promise<void> {
  try {
    const redis = await getRedis();
    const point = JSON.stringify({
      scan_id: scan.scan_id,
      ts: scan.completed_at ?? scan.started_at,
      alert_count: scan.alert_count,
      critical: scan.critical,
      high: scan.high,
      medium: scan.medium,
      low: scan.low,
    });
    const score = new Date(scan.completed_at ?? scan.started_at).getTime();
    await redis.zAdd(KEYS.trend(scan.repo), { score, value: point });
    // Keep last 365 data points
    const total = await redis.zCard(KEYS.trend(scan.repo));
    if (total > 365) {
      await redis.zRemRangeByRank(KEYS.trend(scan.repo), 0, total - 366);
    }
  } catch (err) {
    console.warn('[redis] Failed to record trend:', (err as Error).message);
  }
}


// ── Route registration ────────────────────────────────────────────────

export async function registerCveRoutes(app: FastifyInstance, config: WebServerConfig): Promise<void> {
  const { github, state, gateway } = config;

  // Helper: safely add audit entry
  const audit = (entry: Record<string, unknown>) => {
    if (typeof state?.addAuditEntry === 'function') {
      try { state.addAuditEntry(entry as any); } catch { /* stub */ }
    }
  };

  // ── Scan with lifecycle tracking ────────────────────────────────────

  app.post<{
    Body: { owner?: string; repo?: string; severity?: string; dryRun?: boolean };
  }>('/api/cve/scan', async (req, reply) => {
    const { owner, repo, severity, dryRun } = req.body;

    if (!owner || !repo) {
      return reply.status(400).send({ error: 'owner and repo are required' });
    }

    const fullName = `${owner}/${repo}`;
    const scan = emptyScanRecord(fullName);

    // Persist initial scanning state
    await saveScanRecord(scan);

    // If gateway is available, use fabric CVE scan
    if (gateway?.available) {
      try {
        const routeResult = await gateway.router.route('cve_scan', {
          repos: [fullName],
          severity_threshold: (severity ?? 'HIGH').toUpperCase(),
          dry_run: dryRun ?? false,
        });
        const result = typeof routeResult.result === 'string'
          ? JSON.parse(routeResult.result)
          : routeResult.result;

        // Update scan record on completion
        const alerts: SecurityAlert[] = result.alerts ?? result.vulnerabilities ?? [];
        scan.status = 'complete';
        scan.completed_at = new Date().toISOString();
        scan.alert_count = alerts.length;
        Object.assign(scan, countSeverities(alerts));
        await saveScanRecord(scan);
        await recordTrend(scan);

        audit({ action: 'web_cve_scan', repo: fullName, result: 'success', scan_id: scan.scan_id, details: { source: 'gateway' } });
        return reply.send({ ...result, scan_id: scan.scan_id });
      } catch {
        // Fall through to REST
      }
    }

    // Fallback: Dependabot REST via TokenGitHubClient
    try {
      const alerts: SecurityAlert[] = await (github as any).getSecurityAlertsDetailed(owner, repo);
      const severityOrder = ['critical', 'high', 'medium', 'low'];
      const minSevIndex = (severity ?? 'all') === 'all'
        ? 4
        : severityOrder.indexOf((severity ?? 'high').toLowerCase());

      const filtered = alerts.filter((a) => {
        const idx = severityOrder.indexOf(a.severity?.toLowerCase());
        return idx >= 0 && idx <= minSevIndex;
      });

      // Complete scan record
      scan.status = 'complete';
      scan.completed_at = new Date().toISOString();
      scan.alert_count = filtered.length;
      Object.assign(scan, countSeverities(filtered));
      await saveScanRecord(scan);
      await recordTrend(scan);

      audit({ action: 'web_cve_scan', repo: fullName, result: 'success', scan_id: scan.scan_id, details: { source: 'dependabot', count: filtered.length } });

      return reply.send({
        repo: fullName,
        scan_id: scan.scan_id,
        source: 'dependabot',
        totalAlerts: filtered.length,
        alerts: filtered,
      });
    } catch (err: any) {
      // Mark scan as failed
      scan.status = 'failed';
      scan.completed_at = new Date().toISOString();
      await saveScanRecord(scan);

      return reply.status(500).send({
        error: `Scan failed: ${err.message}`,
        repo: fullName,
        scan_id: scan.scan_id,
      });
    }
  });

  // ── Get scan results for a repo ─────────────────────────────────────

  app.get<{
    Params: { owner: string; repo: string };
  }>('/api/cve/results/:owner/:repo', async (req, reply) => {
    const { owner, repo } = req.params;

    try {
      const alerts = await (github as any).getSecurityAlertsDetailed(owner, repo);
      return reply.send({
        repo: `${owner}/${repo}`,
        totalAlerts: alerts.length,
        alerts,
      });
    } catch (err: any) {
      return reply.status(500).send({
        error: `Failed to fetch results: ${err.message}`,
        repo: `${owner}/${repo}`,
      });
    }
  });

  // ── Recent scans across all repos ───────────────────────────────────

  app.get<{
    Querystring: { limit?: string };
  }>('/api/scans/recent', async (req, reply) => {
    const limit = Math.min(parseInt(req.query.limit ?? '10', 10) || 10, 100);

    try {
      const redis = await getRedis();
      const keys: string[] = [];
      for await (const key of redis.scanIterator({ MATCH: 'gitsteer:scans:*', COUNT: 100 })) {
        if (Array.isArray(key)) {
          keys.push(...key);
        } else {
          keys.push(key);
        }
      }

      const allScans: ScanRecord[] = [];
      for (const key of keys) {
        const items = await redis.lRange(key, 0, 4); // Last 5 per repo
        for (const raw of items) {
          try { allScans.push(JSON.parse(raw)); } catch { /* skip corrupt */ }
        }
      }

      // Sort by started_at descending
      allScans.sort((a, b) => b.started_at.localeCompare(a.started_at));

      return reply.send({
        count: Math.min(allScans.length, limit),
        scans: allScans.slice(0, limit),
      });
    } catch (err: any) {
      return reply.status(500).send({ error: `Failed to fetch recent scans: ${err.message}` });
    }
  });

  // ── Get single scan by ID ──────────────────────────────────────────

  app.get<{
    Params: { scanId: string };
  }>('/api/scans/:scanId', async (req, reply) => {
    const { scanId } = req.params;

    try {
      const redis = await getRedis();
      const raw = await redis.get(KEYS.scan(scanId));

      if (!raw) {
        return reply.status(404).send({ error: 'Scan not found', scan_id: scanId });
      }

      return reply.send(JSON.parse(raw));
    } catch (err: any) {
      return reply.status(500).send({ error: `Failed to fetch scan: ${err.message}` });
    }
  });

  // ── Triage ──────────────────────────────────────────────────────────

  app.post<{
    Params: { cveId: string };
    Body: { action: 'confirm' | 'dismiss' | 'fix'; reason?: string; owner?: string; repo?: string };
  }>('/api/cve/triage/:cveId', async (req, reply) => {
    const { cveId } = req.params;
    const { action, reason } = req.body;

    if (!action || !['confirm', 'dismiss', 'fix'].includes(action)) {
      return reply.status(400).send({ error: 'action must be: confirm, dismiss, or fix' });
    }

    if (gateway?.available) {
      try {
        const routeResult = await gateway.router.route('cve_triage', { cve_id: cveId, action, reason });
        const result = typeof routeResult.result === 'string' ? JSON.parse(routeResult.result) : routeResult.result;
        return reply.send(result);
      } catch (err: any) {
        return reply.status(500).send({ error: err.message, cveId });
      }
    }

    return reply.status(501).send({
      error: 'CVE triage requires the fabric gateway for full functionality',
      cveId,
      suggestion: 'Use the git-steer MCP security_dismiss tool with the alert number',
    });
  });

  // ── Fix (single) — delegates to Dependabot ────────────────────────

  app.post<{
    Body: { owner: string; repo: string; alertNumber?: number; cveId?: string };
  }>('/api/cve/fix', async (req, reply) => {
    const { owner, repo, alertNumber, cveId } = req.body;

    if (!owner || !repo || !alertNumber) {
      return reply.status(400).send({ error: 'owner, repo, and alertNumber are required' });
    }

    const gh = github as any;
    const octokit = gh.getOctokit ? gh.getOctokit() : gh.octokit;

    try {
      // Check if alert exists and has a fix
      const { data: alert } = await octokit.rest.dependabot.getAlert({
        owner, repo, alert_number: alertNumber,
      });

      if (!alert.security_vulnerability?.first_patched_version) {
        return reply.send({
          error: 'no_fix_available',
          message: `No patched version available for ${alert.security_vulnerability?.package?.name}`,
          alertNumber,
        });
      }

      audit({
        action: 'web_cve_fix',
        repo: `${owner}/${repo}`,
        result: 'delegated',
        details: { alertNumber, package: alert.security_vulnerability?.package?.name, cveId },
      });

      // Search for Dependabot PR for this package
      let prInfo = null;
      try {
        const { data: pulls } = await octokit.rest.pulls.list({
          owner, repo, state: 'open', per_page: 30,
        });
        const dependabotPr = pulls.find((p: any) =>
          p.user?.login === 'dependabot[bot]' &&
          (p.title.toLowerCase().includes(alert.security_vulnerability?.package?.name?.toLowerCase() ?? ''))
        );
        if (dependabotPr) {
          prInfo = {
            prNumber: dependabotPr.number,
            prUrl: dependabotPr.html_url,
            prTitle: dependabotPr.title,
            prState: dependabotPr.state,
            mergeable: dependabotPr.mergeable,
          };
        }
      } catch { /* non-fatal */ }

      return reply.send({
        status: 'fix_available',
        package: alert.security_vulnerability?.package?.name,
        ecosystem: alert.security_vulnerability?.package?.ecosystem,
        currentVersion: alert.security_vulnerability?.vulnerable_version_range,
        fixVersion: alert.security_vulnerability?.first_patched_version?.identifier,
        alertUrl: alert.html_url,
        message: `Upgrade ${alert.security_vulnerability?.package?.name} to ${alert.security_vulnerability?.first_patched_version?.identifier}`,
        dependabotUrl: `https://github.com/${owner}/${repo}/security/dependabot/${alertNumber}`,
        pr: prInfo,
      });
    } catch (err: any) {
      return reply.status(500).send({ error: humanizeError(err) });
    }
  });

  // ── Merge a Dependabot PR ─────────────────────────────────────────

  app.post<{
    Body: { owner?: string; repo?: string; prNumber?: number };
  }>('/api/cve/merge', async (req, reply) => {
    const { owner, repo, prNumber } = req.body as { owner?: string; repo?: string; prNumber?: number };
    if (!owner || !repo || !prNumber) {
      return reply.status(400).send({ error: 'owner, repo, and prNumber are required' });
    }

    const gh = (github as any);
    const octokit = gh.getOctokit ? gh.getOctokit() : gh.octokit;

    try {
      // Get PR status first
      const { data: pr } = await octokit.rest.pulls.get({ owner, repo, pull_number: prNumber });

      if (pr.state !== 'open') {
        return reply.send({ merged: pr.merged, status: pr.state, message: `PR #${prNumber} is ${pr.state}` });
      }

      // Merge the PR
      await octokit.rest.pulls.merge({
        owner, repo,
        pull_number: prNumber,
        merge_method: 'squash',
      });

      audit({
        action: 'web_cve_merge',
        repo: `${owner}/${repo}`,
        result: 'success',
        details: { prNumber, prUrl: pr.html_url },
      });

      return reply.send({
        merged: true,
        prNumber,
        prUrl: pr.html_url,
        message: `PR #${prNumber} merged successfully`,
      });
    } catch (err: any) {
      const msg = err.message ?? String(err);
      if (msg.includes('405')) return reply.status(409).send({ error: 'PR cannot be merged — check for merge conflicts or required checks' });
      if (msg.includes('404')) return reply.status(404).send({ error: 'PR not found' });
      return reply.status(500).send({ error: msg });
    }
  });

  // ── Fix All — report fixable alerts with Dependabot links ──────────

  app.post<{
    Body: { owner: string; repo: string };
  }>('/api/cve/fix-all', async (req, reply) => {
    const { owner, repo } = req.body;

    if (!owner || !repo) {
      return reply.status(400).send({ error: 'owner and repo are required' });
    }

    const gh = github as any;

    try {
      const alerts: SecurityAlert[] = await gh.getSecurityAlertsDetailed(owner, repo);
      const fixable = alerts.filter((a: any) => a.fixVersion);
      const noFix = alerts.filter((a: any) => !a.fixVersion);

      audit({
        action: 'web_cve_fix_all',
        repo: `${owner}/${repo}`,
        result: 'delegated',
        details: { total: alerts.length, fixable: fixable.length, no_fix: noFix.length },
      });

      return reply.send({
        total: alerts.length,
        fixable: fixable.length,
        no_fix: noFix.length,
        fixed: 0,
        failed: 0,
        fixes: fixable.map((a: any) => ({
          alertNumber: a.alertNumber,
          package: a.package,
          ecosystem: a.ecosystem,
          severity: a.severity,
          cve: a.cve,
          currentVersion: a.currentVersion,
          fixVersion: a.fixVersion,
          dependabotUrl: `https://github.com/${owner}/${repo}/security/dependabot/${a.alertNumber}`,
        })),
        message: fixable.length > 0
          ? `${fixable.length} vulnerabilities have fixes available. Enable Dependabot security updates on this repo to auto-create PRs, or fix each manually.`
          : 'No fixes available for the current vulnerabilities.',
        enableDependabotUrl: `https://github.com/${owner}/${repo}/settings/security_analysis`,
      });
    } catch (err: any) {
      return reply.status(500).send({ error: humanizeError(err) });
    }
  });

  // ── Verify (body-based, existing endpoint) ──────────────────────────

  app.post<{
    Body: { owner: string; repo: string };
  }>('/api/cve/verify', async (req, reply) => {
    const { owner, repo } = req.body;

    if (!owner || !repo) {
      return reply.status(400).send({ error: 'owner and repo are required' });
    }

    const gh = github as any;

    try {
      const currentAlerts: SecurityAlert[] = await gh.getSecurityAlertsDetailed(owner, repo);
      return reply.send({
        repo: `${owner}/${repo}`,
        totalAlerts: currentAlerts.length,
        alerts: currentAlerts,
      });
    } catch (err: any) {
      return reply.status(500).send({ error: err.message });
    }
  });

  // ── Verify (param-based with Redis tracking) ───────────────────────

  app.post<{
    Params: { owner: string; repo: string };
  }>('/api/cve/verify/:owner/:repo', async (req, reply) => {
    const { owner, repo } = req.params;
    const fullName = `${owner}/${repo}`;
    const gh = github as any;

    try {
      // Get previous scan for comparison
      let previousScan: ScanRecord | null = null;
      try {
        const redis = await getRedis();
        const raw = await redis.get(KEYS.scanLatest(fullName));
        if (raw) previousScan = JSON.parse(raw);
      } catch { /* no previous scan */ }

      // Run fresh scan
      const alerts: SecurityAlert[] = await gh.getSecurityAlertsDetailed(owner, repo);
      const sevCounts = countSeverities(alerts);

      const verifyScan = emptyScanRecord(fullName);
      verifyScan.status = 'verified';
      verifyScan.completed_at = new Date().toISOString();
      verifyScan.alert_count = alerts.length;
      Object.assign(verifyScan, sevCounts);

      // Compare with previous
      if (previousScan) {
        verifyScan.fixes_verified = Math.max(0, previousScan.alert_count - alerts.length);
        verifyScan.fixes_failed = Math.max(0, alerts.length - (previousScan.alert_count - previousScan.fixes_created));
      }

      await saveScanRecord(verifyScan);
      await recordTrend(verifyScan);

      // If all clear, generate a stub SBOM snapshot
      let sbomGenerated = false;
      if (alerts.length === 0) {
        try {
          const redis = await getRedis();
          const sbomSnapshot = {
            repo: fullName,
            generated_at: new Date().toISOString(),
            tool: 'git-steer-verify',
            note: 'Auto-generated after clean verification scan',
            packages: [],
            total: 0,
          };
          await redis.set(KEYS.sbom(fullName), JSON.stringify(sbomSnapshot));
          sbomGenerated = true;
        } catch { /* non-fatal */ }
      }

      audit({ action: 'web_cve_verify', repo: fullName, result: 'success', scan_id: verifyScan.scan_id });

      return reply.send({
        repo: fullName,
        scan_id: verifyScan.scan_id,
        status: verifyScan.status,
        current: {
          alert_count: alerts.length,
          ...sevCounts,
        },
        previous: previousScan ? {
          scan_id: previousScan.scan_id,
          alert_count: previousScan.alert_count,
          critical: previousScan.critical,
          high: previousScan.high,
          medium: previousScan.medium,
          low: previousScan.low,
        } : null,
        delta: previousScan ? {
          resolved: Math.max(0, previousScan.alert_count - alerts.length),
          new: Math.max(0, alerts.length - previousScan.alert_count),
        } : null,
        sbom_generated: sbomGenerated,
      });
    } catch (err: any) {
      return reply.status(500).send({ error: `Verification failed: ${err.message}`, repo: fullName });
    }
  });

  // ── Queue ───────────────────────────────────────────────────────────

  app.get<{
    Querystring: { status?: string; severity?: string; repo?: string; limit?: string };
  }>('/api/cve/queue', async (_req, reply) => {
    if (gateway?.available) {
      try {
        const routeResult = await gateway.router.route('cve_queue_list', { status: 'pending', limit: 50 });
        const result = typeof routeResult.result === 'string' ? JSON.parse(routeResult.result) : routeResult.result;
        return reply.send(result);
      } catch { /* fall through */ }
    }

    return reply.send({ source: 'none', count: 0, queue: [], note: 'Scan a repo to populate the queue' });
  });

  // ── Trends ──────────────────────────────────────────────────────────

  app.get<{
    Params: { owner: string; repo: string };
    Querystring: { days?: string };
  }>('/api/trends/:owner/:repo', async (req, reply) => {
    const { owner, repo } = req.params;
    const fullName = `${owner}/${repo}`;
    const days = Math.min(parseInt(req.query.days ?? '90', 10) || 90, 365);
    const since = Date.now() - days * 24 * 60 * 60 * 1000;

    try {
      const redis = await getRedis();
      const raw = await redis.zRangeByScore(KEYS.trend(fullName), since, '+inf');

      const points = raw.map((r) => {
        try { return JSON.parse(r); } catch { return null; }
      }).filter(Boolean);

      return reply.send({
        repo: fullName,
        days,
        count: points.length,
        points,
      });
    } catch (err: any) {
      return reply.status(500).send({ error: `Failed to fetch trends: ${err.message}` });
    }
  });

  // ── Auto-scan config ────────────────────────────────────────────────

  app.get<{
    Params: { owner: string; repo: string };
  }>('/api/autoscan/:owner/:repo', async (req, reply) => {
    const { owner, repo } = req.params;
    const fullName = `${owner}/${repo}`;

    try {
      const redis = await getRedis();
      const raw = await redis.get(KEYS.autoScan(fullName));

      if (!raw) {
        return reply.send({
          repo: fullName,
          schedule: 'off',
          configured: false,
        });
      }

      return reply.send(JSON.parse(raw));
    } catch (err: any) {
      return reply.status(500).send({ error: `Failed to fetch auto-scan config: ${err.message}` });
    }
  });

  app.post<{
    Params: { owner: string; repo: string };
    Body: { schedule: 'daily' | 'weekly' | 'off'; severity?: string };
  }>('/api/autoscan/:owner/:repo', async (req, reply) => {
    const { owner, repo } = req.params;
    const { schedule, severity } = req.body;
    const fullName = `${owner}/${repo}`;

    if (!schedule || !['daily', 'weekly', 'off'].includes(schedule)) {
      return reply.status(400).send({ error: 'schedule must be: daily, weekly, or off' });
    }

    try {
      const redis = await getRedis();
      const configObj = {
        repo: fullName,
        schedule,
        severity: severity ?? 'high',
        configured: schedule !== 'off',
        updated_at: new Date().toISOString(),
      };

      if (schedule === 'off') {
        await redis.del(KEYS.autoScan(fullName));
      } else {
        await redis.set(KEYS.autoScan(fullName), JSON.stringify(configObj));
      }

      return reply.send(configObj);
    } catch (err: any) {
      return reply.status(500).send({ error: `Failed to save auto-scan config: ${err.message}` });
    }
  });
}
