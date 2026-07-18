import { describe, it, expect, beforeEach, vi } from 'vitest';

// Mock the AI SDK before importing functions
vi.mock('ai', () => ({
  generateText: vi.fn(),
  generateObject: vi.fn(),
}));

// Mock the provider
vi.mock('../provider', () => ({
  getLLMProvider: vi.fn(() => ({ modelId: 'test-model' })),
}));

import { generateText, generateObject } from 'ai';
import { clarifyIntent, generatePlan, editSource, proposePatchLLM } from '../functions';

const mockGenerateText = vi.mocked(generateText);
const mockGenerateObject = vi.mocked(generateObject);

describe('LLM Functions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('clarifyIntent', () => {
    it('returns null when intent is clear (NO_CLARIFICATION_NEEDED)', async () => {
      mockGenerateText.mockResolvedValue({ text: 'NO_CLARIFICATION_NEEDED' } as any);

      const result = await clarifyIntent(
        'Blink the green LED every 500ms',
        { 'src/main.c': 'int main() { return 0; }' }
      );

      expect(result).toBeNull();
      expect(mockGenerateText).toHaveBeenCalledTimes(1);
    });

    it('returns questions when intent is ambiguous', async () => {
      mockGenerateText.mockResolvedValue({
        text: '- Which LED should blink?\n- What is the desired blink frequency?',
      } as any);

      const result = await clarifyIntent(
        'Make the LED blink',
        { 'src/main.c': 'int main() { return 0; }' }
      );

      expect(result).not.toBeNull();
      expect(result!.questions).toHaveLength(2);
      expect(result!.questions[0]).toContain('Which LED');
      expect(result!.questions[1]).toContain('blink frequency');
    });

    it('returns raw text as single question if no question marks found', async () => {
      mockGenerateText.mockResolvedValue({
        text: 'The intent is unclear about which peripheral to use',
      } as any);

      const result = await clarifyIntent(
        'Do the thing',
        {}
      );

      expect(result).not.toBeNull();
      expect(result!.questions).toHaveLength(1);
      expect(result!.questions[0]).toContain('unclear');
    });
  });

  describe('generatePlan', () => {
    it('returns a structured plan with steps', async () => {
      const mockPlan = {
        steps: [
          { file: 'src/main.c', action: 'modify', description: 'Add timer callback' },
          { file: 'src/led.c', action: 'create', description: 'LED control module' },
        ],
        summary: 'Add timer-based LED blinking',
      };

      mockGenerateObject.mockResolvedValue({ object: mockPlan } as any);

      const result = await generatePlan(
        'Blink the green LED every 500ms',
        { 'src/main.c': 'int main() { return 0; }' },
        { name: 'stm32f4_disco', mcu: 'STM32F407VG', architecture: 'arm' },
        [{ name: 'green_led_blink', register: 'GPIOG_ODR[12]', expect: '1', byTime: 500000 }]
      );

      expect(result).toEqual(mockPlan);
      expect(result.steps).toHaveLength(2);
      expect(mockGenerateObject).toHaveBeenCalledTimes(1);
    });
  });

  describe('editSource', () => {
    it('returns operations and summary from JSON response', async () => {
      const mockResponse = {
        operations: [
          {
            type: 'edit' as const,
            path: 'src/main.c',
            search: 'return 0;',
            replace: 'init_timer();\n  return 0;',
          },
        ],
        summary: 'Plan executed successfully',
      };

      mockGenerateObject.mockResolvedValue({ object: mockResponse } as any);

      const result = await editSource(
        {
          steps: [{ file: 'src/main.c', action: 'modify', description: 'Add timer init' }],
          summary: 'Add timer initialization',
        },
        { 'src/main.c': 'int main() { return 0; }' }
      );

      expect(result.summary).toBe('Plan executed successfully');
      expect(result.operations).toHaveLength(1);
      expect(result.operations[0]!.type).toBe('edit');
    });

    it('passes root cause context when provided', async () => {
      mockGenerateObject.mockResolvedValue({
        object: { operations: [], summary: 'Fixed' },
      } as any);

      const rootCause = {
        time: 100,
        type: 'gpio-write',
        source: 'timer_isr',
        register: 'GPIOG_ODR[13]',
        value: '1',
        detail: 'Wrote to wrong LED pin',
        label: 'GPIO write',
        lane: 'GPIO pin 13',
      };

      await editSource(
        { steps: [], summary: 'Fix LED' },
        { 'src/main.c': '' },
        rootCause
      );

      // Verify the prompt includes root cause context
      const callArgs = mockGenerateObject.mock.calls[0]![0] as any;
      expect(callArgs.prompt).toContain('GPIOG_ODR[13]');
      expect(callArgs.prompt).toContain('Wrote to wrong LED pin');
    });
  });

  describe('proposePatchLLM', () => {
    it('returns a structured patch proposal', async () => {
      const mockPatch = {
        file: 'src/main.c',
        before: 'gpio_pin_set_dt(&orange_led, 1)',
        after: 'gpio_pin_set_dt(&green_led, 1)',
        summary: 'Write to green LED instead of orange LED',
        confidence: 0.95,
      };

      mockGenerateObject.mockResolvedValue({ object: mockPatch } as any);

      const result = await proposePatchLLM(
        {
          time: 100,
          type: 'gpio-write',
          source: 'timer_isr',
          register: 'GPIOG_ODR[13]',
          value: '1',
          detail: 'Wrote to wrong LED pin',
          label: 'GPIO write',
          lane: 'GPIO pin 13',
        },
        { 'src/main.c': 'gpio_pin_set_dt(&orange_led, 1);' },
        { name: 'green_led_on', register: 'GPIOG_ODR[12]', expect: '1', byTime: 500000 }
      );

      expect(result).toEqual(mockPatch);
      expect(result.confidence).toBeGreaterThan(0);
      expect(result.confidence).toBeLessThanOrEqual(1);
      expect(mockGenerateObject).toHaveBeenCalledTimes(1);
    });

    it('includes root cause and assertion in the prompt', async () => {
      mockGenerateObject.mockResolvedValue({
        object: { file: 'src/patch.c', before: '', after: '', summary: '', confidence: 0.5 },
      } as any);

      await proposePatchLLM(
        {
          time: 200,
          type: 'gpio-write',
          source: 'handler',
          register: 'GPIOA_ODR[5]',
          value: '0',
          detail: 'Pin was cleared instead of set',
          label: 'GPIO write',
          lane: 'GPIO pin 5',
        },
        { 'src/main.c': 'gpio_pin_set(PORT_A, 5, 0);' },
        { name: 'pin_high', register: 'GPIOA_ODR[5]', expect: '1', byTime: 1000 }
      );

      const callArgs = mockGenerateObject.mock.calls[0]![0] as any;
      expect(callArgs.prompt).toContain('GPIOA_ODR[5]');
      expect(callArgs.prompt).toContain('pin_high');
    });
  });
});
