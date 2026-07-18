import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, rm, writeFile, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { FirmwareJobRunner, FirmwareJobRequest, FirmwareJobResult } from './firmware-job';

const execFileAsync = promisify(execFile);

/**
 * Runs firmware build + Renode simulation in a local Docker container.
 *
 * This is an alternative to ModalFirmwareJobRunner for local development
 * or air-gapped environments where Modal is unavailable.
 */
export class DockerRunner implements FirmwareJobRunner {
  constructor(
    private readonly imageName: string = 'traceloop/firmware-job',
    private readonly timeout: number = 360_000, // 6 minutes default
  ) {}

  async run(req: FirmwareJobRequest): Promise<FirmwareJobResult> {
    const workdir = await mkdtemp(join(tmpdir(), 'traceloop-docker-'));

    try {
      // Write firmware source files into the temp workspace
      for (const [relpath, content] of Object.entries(req.files)) {
        const filepath = join(workdir, relpath);
        await mkdir(join(filepath, '..'), { recursive: true });
        await writeFile(filepath, content, 'utf-8');
      }

      // Run west build inside Docker
      const buildCmd = [
        'docker', 'run', '--rm',
        '-v', `${workdir}:/workspace`,
        this.imageName,
        'west', 'build', '-b', req.board, '-d', '/workspace/build', '/workspace',
      ];

      let buildLog: string;
      try {
        const { stdout, stderr } = await execFileAsync(buildCmd[0], buildCmd.slice(1), {
          timeout: this.timeout,
          maxBuffer: 10 * 1024 * 1024,
        });
        buildLog = stdout + '\n' + stderr;
      } catch (err: unknown) {
        const error = err as NodeJS.ErrnoException & { stdout?: string; stderr?: string; killed?: boolean };
        if (error.killed) {
          return {
            build: { ok: false, log: `Build timed out after ${this.timeout}ms` },
          };
        }
        buildLog = (error.stdout ?? '') + '\n' + (error.stderr ?? '') + '\n' + (error.message ?? '');
        return { build: { ok: false, log: buildLog } };
      }

      // Build succeeded — run Renode simulation inside Docker
      const renodeCmd = [
        'docker', 'run', '--rm',
        '-v', `${workdir}:/workspace`,
        this.imageName,
        'renode', '--console', '--disable-xwt', '/workspace/trace.resc',
      ];

      let traceLog: string;
      try {
        const { stdout, stderr } = await execFileAsync(renodeCmd[0], renodeCmd.slice(1), {
          timeout: 60_000, // 1-minute sim timeout
          maxBuffer: 10 * 1024 * 1024,
        });
        traceLog = stdout + '\n' + stderr;
      } catch (err: unknown) {
        const error = err as NodeJS.ErrnoException & { stdout?: string; stderr?: string; killed?: boolean };
        if (error.killed) {
          traceLog = 'Renode simulation timed out after 60 seconds';
        } else {
          traceLog = (error.stdout ?? '') + '\n' + (error.stderr ?? '') + '\n' + (error.message ?? '');
        }
      }

      return {
        build: { ok: true, log: buildLog },
        trace: { log: traceLog },
      };
    } finally {
      // Clean up temp directory
      await rm(workdir, { recursive: true, force: true });
    }
  }
}
