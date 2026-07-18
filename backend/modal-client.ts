import { getModalEndpoint } from './config';

/**
 * Client for the Modal compute plane that handles firmware build,
 * simulation, and analysis jobs.
 */

export interface BuildRequest {
  files: Record<string, string>;
  boardId: string;
}

export interface BuildResponse {
  success: boolean;
  elfPath?: string;
  log: string;
  elapsedMs: number;
}

export interface SimulateRequest {
  elfPath: string;
  boardId: string;
  acceptanceCriteria: Array<{
    name: string;
    register: string;
    expect: string;
    byTime: number;
  }>;
  timeoutMs: number;
}

export interface SimulateResponse {
  success: boolean;
  traceLog: string;
  elapsedMs: number;
}

export interface AnalyzeRequest {
  traceLog: string;
  acceptanceCriteria: Array<{
    name: string;
    register: string;
    expect: string;
    byTime: number;
  }>;
}

export interface AnalyzeResponse {
  status: 'passed' | 'failed';
  rootCause?: {
    time: number;
    type: string;
    source: string;
    register: string;
    value: string;
    detail: string;
    label: string;
    lane: string;
  };
  chain?: Array<{
    id: string;
    label: string;
    lane: string;
    taxonomy: string;
    time: number;
    register: string;
    value: string;
    detail: string;
  }>;
  rootCauseText?: string;
}

class ModalClient {
  private getEndpoint(): string {
    const endpoint = getModalEndpoint();
    if (!endpoint) {
      throw new Error('MODAL_ENDPOINT not configured');
    }
    return endpoint;
  }

  async build(request: BuildRequest): Promise<BuildResponse> {
    const response = await fetch(`${this.getEndpoint()}/build`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(request),
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Build failed (${response.status}): ${text}`);
    }

    return response.json() as Promise<BuildResponse>;
  }

  async simulate(request: SimulateRequest): Promise<SimulateResponse> {
    const response = await fetch(`${this.getEndpoint()}/simulate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(request),
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Simulation failed (${response.status}): ${text}`);
    }

    return response.json() as Promise<SimulateResponse>;
  }

  async analyze(request: AnalyzeRequest): Promise<AnalyzeResponse> {
    const response = await fetch(`${this.getEndpoint()}/analyze`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(request),
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Analysis failed (${response.status}): ${text}`);
    }

    return response.json() as Promise<AnalyzeResponse>;
  }
}

// Singleton client
export const modalClient = new ModalClient();
