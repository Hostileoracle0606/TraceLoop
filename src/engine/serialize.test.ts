import { describe, it, expect } from 'vitest';
import { analyze } from './analyze';
import { toDashboardRun } from './serialize';
import { timer2WrongPinTrace, greenLedAssertion } from '../fixtures/timer2-wrong-pin';

const meta = {
  id: 'RUN-1042',
  commit: '8c47a1d',
  board: 'STM32F4 Discovery',
  branch: 'agent/timer2-led',
};

describe('toDashboardRun', () => {
  it('serializes the view-model into the dashboard event map, mapping taxonomy to the UI kind vocabulary', () => {
    const vm = analyze(timer2WrongPinTrace, greenLedAssertion);
    const data = toDashboardRun(vm, meta);

    // Events are keyed e1..eN with the dashboard's field shape.
    expect(data.events.e4?.register).toBe('GPIOG_ODR[13]');
    expect(data.events.e4?.kind).toBe('observed');
    expect(data.events.e5?.kind).toBe('derived');
    // Our 'violated' taxonomy must serialize to the UI's 'failed'.
    expect(data.events.e6?.kind).toBe('failed');

    // Run header passes through, with a UI-shaped status.
    expect(data.run.commit).toBe('8c47a1d');
    expect(data.run.board).toBe('STM32F4 Discovery');
    expect(data.run.status).toBe('fail');
  });
});
