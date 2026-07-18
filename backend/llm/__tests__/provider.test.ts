import { describe, it, expect, beforeEach, vi } from 'vitest';

// Mock the config module before importing provider
vi.mock('../../config', () => ({
  getLLMConfig: vi.fn(),
}));

import { getLLMProvider, resetLLMProvider, getProviderName } from '../provider';
import { getLLMConfig } from '../../config';

const mockGetLLMConfig = vi.mocked(getLLMConfig);

describe('LLM Provider', () => {
  beforeEach(() => {
    resetLLMProvider();
    vi.clearAllMocks();
  });

  describe('getLLMProvider', () => {
    it('creates an Anthropic model when provider is anthropic', () => {
      mockGetLLMConfig.mockReturnValue({
        provider: 'anthropic',
        anthropicApiKey: 'test-anthropic-key',
        openaiApiKey: undefined,
      });

      const model = getLLMProvider();
      expect(model).toBeDefined();
      // The model should be a valid LanguageModel object
      expect(typeof model).toBe('object');
    });

    it('creates an OpenAI model when provider is openai', () => {
      mockGetLLMConfig.mockReturnValue({
        provider: 'openai',
        anthropicApiKey: undefined,
        openaiApiKey: 'test-openai-key',
      });

      const model = getLLMProvider();
      expect(model).toBeDefined();
      expect(typeof model).toBe('object');
    });

    it('throws when anthropic provider has no API key', () => {
      mockGetLLMConfig.mockReturnValue({
        provider: 'anthropic',
        anthropicApiKey: undefined,
        openaiApiKey: undefined,
      });

      expect(() => getLLMProvider()).toThrow('ANTHROPIC_API_KEY is required');
    });

    it('throws when openai provider has no API key', () => {
      mockGetLLMConfig.mockReturnValue({
        provider: 'openai',
        anthropicApiKey: undefined,
        openaiApiKey: undefined,
      });

      expect(() => getLLMProvider()).toThrow('OPENAI_API_KEY is required');
    });

    it('caches the model after first call', () => {
      mockGetLLMConfig.mockReturnValue({
        provider: 'anthropic',
        anthropicApiKey: 'test-key',
        openaiApiKey: undefined,
      });

      const model1 = getLLMProvider();
      const model2 = getLLMProvider();
      expect(model1).toBe(model2);
      // Config should only be read once due to caching
      expect(mockGetLLMConfig).toHaveBeenCalledTimes(1);
    });

    it('creates a new model after reset', () => {
      mockGetLLMConfig.mockReturnValue({
        provider: 'anthropic',
        anthropicApiKey: 'test-key',
        openaiApiKey: undefined,
      });

      const model1 = getLLMProvider();
      resetLLMProvider();

      const model2 = getLLMProvider();
      // Different object after reset
      expect(model1).not.toBe(model2);
      expect(mockGetLLMConfig).toHaveBeenCalledTimes(2);
    });
  });

  describe('getProviderName', () => {
    it('returns the configured provider name', () => {
      mockGetLLMConfig.mockReturnValue({
        provider: 'anthropic',
        anthropicApiKey: 'test-key',
        openaiApiKey: undefined,
      });

      expect(getProviderName()).toBe('anthropic');
    });

    it('returns openai when configured', () => {
      mockGetLLMConfig.mockReturnValue({
        provider: 'openai',
        anthropicApiKey: undefined,
        openaiApiKey: 'test-key',
      });

      expect(getProviderName()).toBe('openai');
    });
  });
});
