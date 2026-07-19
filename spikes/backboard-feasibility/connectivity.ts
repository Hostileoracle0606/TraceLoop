import { BackboardClient } from '../../backend/agent/adapters/backboard/client';
import { ENDPOINTS } from '../../backend/agent/adapters/backboard/endpoints';
import { AgentProviderError } from '../../backend/agent/errors';

const DEFAULT_BASE_URL = 'https://app.backboard.io/api';

interface ModelSummary {
  name?: string;
  provider?: string;
}

interface ModelsResponse {
  models: ModelSummary[];
  total: number;
}

function failureHint(errorClass: AgentProviderError['errorClass']): string {
  switch (errorClass) {
    case 'provider-auth':
      return 'The API key was rejected; rotate it and update BACKBOARD_API_KEY.';
    case 'provider-timeout':
    case 'provider-unavailable':
      return 'Check network access and BACKBOARD_BASE_URL, then retry.';
    case 'provider-rate-limited':
      return 'Backboard rate-limited the check; retry shortly.';
    default:
      return 'Check the Backboard configuration and retry.';
  }
}

async function main(): Promise<void> {
  const apiKey = process.env.BACKBOARD_API_KEY?.trim();
  if (!apiKey) {
    console.error('Backboard connection not checked: BACKBOARD_API_KEY is missing from the local environment.');
    process.exitCode = 1;
    return;
  }

  const baseUrl = process.env.BACKBOARD_BASE_URL?.trim() || DEFAULT_BASE_URL;
  const query = new URLSearchParams({
    model_type: 'llm',
    supports_tools: 'true',
    limit: '1',
  });
  const client = new BackboardClient({ baseUrl, apiKey });

  try {
    const response = await client.get<ModelsResponse>(`${ENDPOINTS.models}?${query}`);
    if (!Array.isArray(response.models) || typeof response.total !== 'number') {
      throw new AgentProviderError(
        'provider-malformed-response',
        'Backboard returned an unexpected models response',
      );
    }

    const sample = response.models[0];
    const sampleLabel = sample?.provider && sample?.name
      ? ` Sample tool-capable model: ${sample.provider}/${sample.name}.`
      : '';
    console.log(`Backboard connection OK. Authenticated; ${response.total} tool-capable LLM models available.${sampleLabel}`);
  } catch (error) {
    const providerError = error instanceof AgentProviderError
      ? error
      : new AgentProviderError('provider-unavailable', 'Backboard connection failed', error);
    console.error(`Backboard connection failed (${providerError.errorClass}). ${failureHint(providerError.errorClass)}`);
    process.exitCode = 1;
  }
}

await main();
