import { createAnthropic } from '@ai-sdk/anthropic';
import { createOpenAI } from '@ai-sdk/openai';
import { getLLMConfig } from '../config';
import type { LanguageModel } from 'ai';

/**
 * LLM provider factory.
 *
 * Returns a configured language model based on the LLM_PROVIDER env var.
 * Defaults to Anthropic Claude Sonnet. Supports OpenAI GPT-4.1 as fallback.
 *
 * The provider is instantiated once and cached as a singleton.
 */

let cachedModel: LanguageModel | null = null;

export function getLLMProvider(): LanguageModel {
  if (cachedModel) return cachedModel;

  const config = getLLMConfig();

  switch (config.provider) {
    case 'anthropic': {
      if (!config.anthropicApiKey) {
        throw new Error('ANTHROPIC_API_KEY is required when LLM_PROVIDER=anthropic');
      }
      const anthropic = createAnthropic({ apiKey: config.anthropicApiKey });
      cachedModel = anthropic('claude-sonnet-4-20250514');
      break;
    }
    case 'openai': {
      if (!config.openaiApiKey) {
        throw new Error('OPENAI_API_KEY is required when LLM_PROVIDER=openai');
      }
      const openai = createOpenAI({ apiKey: config.openaiApiKey });
      cachedModel = openai('gpt-4.1');
      break;
    }
    default:
      throw new Error(`Unsupported LLM_PROVIDER: ${config.provider}`);
  }

  return cachedModel;
}

/**
 * Reset the cached model (for testing).
 */
export function resetLLMProvider(): void {
  cachedModel = null;
}

/**
 * Get the configured provider name (for logging/telemetry).
 */
export function getProviderName(): string {
  return getLLMConfig().provider;
}
