import type { FirmwareJobRunner, FirmwareJobRequest, FirmwareJobResult } from './firmware-job';

/**
 * Triggers a firmware job via CI (GitHub Actions workflow dispatch).
 *
 * This runner dispatches a workflow that builds the firmware and runs Renode
 * in a CI environment, then polls for completion and downloads the artifacts.
 * Useful when the compute needs exceed what a local machine can provide,
 * but Modal is not available or desired.
 */
export class CIRunner implements FirmwareJobRunner {
  private readonly token: string;

  constructor(
    private readonly repo: string,
    private readonly workflowId: string,
    private readonly ref: string = 'main',
    private readonly pollInterval: number = 5000,
    private readonly timeout: number = 600_000, // 10 minutes default
  ) {
    const token = process.env.GITHUB_TOKEN;
    if (!token) {
      throw new Error('CIRunner requires GITHUB_TOKEN environment variable');
    }
    this.token = token;
  }

  async run(req: FirmwareJobRequest): Promise<FirmwareJobResult> {
    // Base64-encode the firmware files for the workflow input
    const encodedFiles: Record<string, string> = {};
    for (const [path, content] of Object.entries(req.files)) {
      encodedFiles[path] = Buffer.from(content, 'utf-8').toString('base64');
    }

    // Dispatch the workflow
    const dispatchUrl = `https://api.github.com/repos/${this.repo}/actions/workflows/${this.workflowId}/dispatches`;
    const dispatchRes = await fetch(dispatchUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.token}`,
        'Accept': 'application/vnd.github+json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        ref: this.ref,
        inputs: {
          board: req.board,
          files: JSON.stringify(encodedFiles),
        },
      }),
    });

    if (!dispatchRes.ok) {
      const body = await dispatchRes.text();
      throw new Error(`Workflow dispatch failed: HTTP ${dispatchRes.status} — ${body}`);
    }

    // Poll for the workflow run
    const runId = await this.pollForRun();
    if (!runId) {
      throw new Error(`Timed out waiting for workflow run to appear (timeout: ${this.timeout}ms)`);
    }

    // Wait for the run to complete
    const conclusion = await this.waitForCompletion(runId);

    // Download artifacts (build log + trace log)
    const buildLog = await this.downloadArtifact(runId, 'build-log');
    const traceLog = conclusion === 'success'
      ? await this.downloadArtifact(runId, 'trace-log')
      : undefined;

    if (conclusion !== 'success') {
      return {
        build: { ok: false, log: buildLog ?? `Workflow completed with conclusion: ${conclusion}` },
      };
    }

    return {
      build: { ok: true, log: buildLog ?? '' },
      trace: traceLog !== undefined ? { log: traceLog } : undefined,
    };
  }

  /** Poll the workflow runs list to find the one we just dispatched. */
  private async pollForRun(): Promise<number | null> {
    const deadline = Date.now() + this.timeout;
    const runsUrl = `https://api.github.com/repos/${this.repo}/actions/workflows/${this.workflowId}/runs?per_page=5&event=workflow_dispatch`;

    while (Date.now() < deadline) {
      const res = await fetch(runsUrl, {
        headers: {
          'Authorization': `Bearer ${this.token}`,
          'Accept': 'application/vnd.github+json',
        },
      });
      if (res.ok) {
        const data = await res.json() as { workflow_runs: Array<{ id: number; status: string }> };
        const run = data.workflow_runs.find((r) => r.status === 'in_progress' || r.status === 'queued');
        if (run) return run.id;
      }
      await new Promise((resolve) => setTimeout(resolve, this.pollInterval));
    }
    return null;
  }

  /** Wait for a workflow run to complete. Returns the conclusion. */
  private async waitForCompletion(runId: number): Promise<string> {
    const deadline = Date.now() + this.timeout;
    const url = `https://api.github.com/repos/${this.repo}/actions/runs/${runId}`;

    while (Date.now() < deadline) {
      const res = await fetch(url, {
        headers: {
          'Authorization': `Bearer ${this.token}`,
          'Accept': 'application/vnd.github+json',
        },
      });
      if (res.ok) {
        const data = await res.json() as { status: string; conclusion: string | null };
        if (data.status === 'completed') {
          return data.conclusion ?? 'failure';
        }
      }
      await new Promise((resolve) => setTimeout(resolve, this.pollInterval));
    }
    throw new Error(`Workflow run ${runId} timed out after ${this.timeout}ms`);
  }

  /** Download a named artifact from a workflow run. Returns text content or null. */
  private async downloadArtifact(runId: number, name: string): Promise<string | null> {
    const listUrl = `https://api.github.com/repos/${this.repo}/actions/runs/${runId}/artifacts`;
    const listRes = await fetch(listUrl, {
      headers: {
        'Authorization': `Bearer ${this.token}`,
        'Accept': 'application/vnd.github+json',
      },
    });
    if (!listRes.ok) return null;

    const listData = await listRes.json() as {
      artifacts: Array<{ name: string; id: number; archive_download_url: string }>;
    };
    const artifact = listData.artifacts.find((a) => a.name === name);
    if (!artifact) return null;

    // Download the artifact zip (GitHub returns a zip)
    const dlRes = await fetch(artifact.archive_download_url, {
      headers: {
        'Authorization': `Bearer ${this.token}`,
        'Accept': 'application/vnd.github+json',
      },
    });
    if (!dlRes.ok) return null;

    // For simplicity, return the raw text. In production, this would unzip.
    // The CI workflow should upload artifacts as plain text files.
    return await dlRes.text();
  }
}
