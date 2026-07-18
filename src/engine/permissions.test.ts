import { describe, it, expect } from 'vitest';
import {
  checkPermission,
  isActionPermitted,
  checkResourceLimits,
  isProtectedFile,
  DEFAULT_RESOURCE_CONTROLS,
  type PermissionProfile,
} from './permissions';

describe('permission contract', () => {
  describe('checkPermission', () => {
    describe('review mode', () => {
      const profile: PermissionProfile = 'review';

      it('requires approval for write-source', () => {
        const result = checkPermission(profile, 'write-source');
        expect(result.allowed).toBe(false);
        if (!result.allowed) {
          expect(result.requiresApproval).toBe(true);
          expect(result.reason).toContain('Review mode');
        }
      });

      it('requires approval for apply-patch', () => {
        const result = checkPermission(profile, 'apply-patch');
        expect(result.allowed).toBe(false);
        if (!result.allowed) {
          expect(result.requiresApproval).toBe(true);
        }
      });

      it('requires approval for modify-tests', () => {
        const result = checkPermission(profile, 'modify-tests');
        expect(result.allowed).toBe(false);
        if (!result.allowed) {
          expect(result.requiresApproval).toBe(true);
        }
      });

      it('requires approval for commit-push-deploy', () => {
        const result = checkPermission(profile, 'commit-push-deploy');
        expect(result.allowed).toBe(false);
        if (!result.allowed) {
          expect(result.requiresApproval).toBe(true);
        }
      });
    });

    describe('guided mode', () => {
      const profile: PermissionProfile = 'guided';

      it('requires approval for write-source at checkpoints', () => {
        const result = checkPermission(profile, 'write-source');
        expect(result.allowed).toBe(false);
        if (!result.allowed) {
          expect(result.requiresApproval).toBe(true);
          expect(result.reason).toContain('Guided mode');
        }
      });

      it('requires approval for apply-patch at checkpoint', () => {
        const result = checkPermission(profile, 'apply-patch');
        expect(result.allowed).toBe(false);
        if (!result.allowed) {
          expect(result.requiresApproval).toBe(true);
        }
      });

      it('requires approval for modify-tests', () => {
        const result = checkPermission(profile, 'modify-tests');
        expect(result.allowed).toBe(false);
        if (!result.allowed) {
          expect(result.requiresApproval).toBe(true);
        }
      });

      it('requires approval for commit-push-deploy', () => {
        const result = checkPermission(profile, 'commit-push-deploy');
        expect(result.allowed).toBe(false);
        if (!result.allowed) {
          expect(result.requiresApproval).toBe(true);
        }
      });
    });

    describe('autonomous mode', () => {
      const profile: PermissionProfile = 'autonomous';

      it('auto-allows write-source within isolated workspace', () => {
        const result = checkPermission(profile, 'write-source');
        expect(result.allowed).toBe(true);
      });

      it('auto-allows apply-patch if pre-authorized', () => {
        const result = checkPermission(profile, 'apply-patch');
        expect(result.allowed).toBe(true);
      });

      it('never silently modifies tests — requires explicit approval', () => {
        const result = checkPermission(profile, 'modify-tests');
        expect(result.allowed).toBe(false);
        if (!result.allowed) {
          expect(result.requiresApproval).toBe(true);
          expect(result.reason).toContain('protected');
        }
      });

      it('commit-push-deploy requires separate permission', () => {
        const result = checkPermission(profile, 'commit-push-deploy');
        expect(result.allowed).toBe(false);
        if (!result.allowed) {
          expect(result.requiresApproval).toBe(true);
          expect(result.reason).toContain('separate permission');
        }
      });
    });
  });

  describe('isActionPermitted', () => {
    it('allows read-files in any state and profile', () => {
      const result = isActionPermitted('building', 'review', 'read-files');
      expect(result.allowed).toBe(true);
    });

    it('allows build-firmware in building state (always allowed)', () => {
      const result = isActionPermitted('building', 'review', 'build-firmware');
      expect(result.allowed).toBe(true);
    });

    it('allows simulate-firmware in simulating state (always allowed)', () => {
      const result = isActionPermitted('simulating', 'review', 'simulate-firmware');
      expect(result.allowed).toBe(true);
    });

    it('allows analyze-trace in analyzing state (always allowed)', () => {
      const result = isActionPermitted('analyzing', 'review', 'analyze-trace');
      expect(result.allowed).toBe(true);
    });

    it('rejects write-source in building state (not allowed in this state)', () => {
      const result = isActionPermitted('building', 'autonomous', 'write-source');
      expect(result.allowed).toBe(false);
      if (!result.allowed) {
        expect(result.reason).toContain('not allowed in state');
        expect(result.requiresApproval).toBe(false);
      }
    });

    it('requires approval for write-source in editing state with review profile', () => {
      const result = isActionPermitted('editing', 'review', 'write-source');
      expect(result.allowed).toBe(false);
      if (!result.allowed) {
        expect(result.requiresApproval).toBe(true);
      }
    });

    it('allows write-source in editing state with autonomous profile', () => {
      const result = isActionPermitted('editing', 'autonomous', 'write-source');
      expect(result.allowed).toBe(true);
    });

    it('rejects build-firmware in editing state (not allowed)', () => {
      const result = isActionPermitted('editing', 'autonomous', 'build-firmware');
      expect(result.allowed).toBe(false);
      if (!result.allowed) {
        expect(result.requiresApproval).toBe(false);
      }
    });
  });

  describe('checkResourceLimits', () => {
    it('returns not exceeded when within all limits', () => {
      const result = checkResourceLimits(DEFAULT_RESOURCE_CONTROLS, {
        iterations: 3,
        elapsedMs: 10 * 60 * 1000, // 10 min
        costUsd: 2.5,
      });
      expect(result.exceeded).toBe(false);
    });

    it('returns exceeded when iteration limit hit', () => {
      const result = checkResourceLimits(DEFAULT_RESOURCE_CONTROLS, {
        iterations: 5,
        elapsedMs: 10 * 60 * 1000,
        costUsd: 2.5,
      });
      expect(result.exceeded).toBe(true);
      expect(result.reason).toContain('Iteration limit');
    });

    it('returns exceeded when time limit hit', () => {
      const result = checkResourceLimits(DEFAULT_RESOURCE_CONTROLS, {
        iterations: 3,
        elapsedMs: 30 * 60 * 1000, // 30 min
        costUsd: 2.5,
      });
      expect(result.exceeded).toBe(true);
      expect(result.reason).toContain('Time limit');
    });

    it('returns exceeded when cost limit hit', () => {
      const result = checkResourceLimits(DEFAULT_RESOURCE_CONTROLS, {
        iterations: 3,
        elapsedMs: 10 * 60 * 1000,
        costUsd: 5.0,
      });
      expect(result.exceeded).toBe(true);
      expect(result.reason).toContain('Cost limit');
    });

    it('works with custom resource controls', () => {
      const custom = { maxIterations: 2, maxTimeMs: 60_000, maxCostUsd: 1 };
      const result = checkResourceLimits(custom, {
        iterations: 2,
        elapsedMs: 30_000,
        costUsd: 0.5,
      });
      expect(result.exceeded).toBe(true);
      expect(result.reason).toContain('Iteration limit');
    });
  });

  describe('isProtectedFile', () => {
    it('identifies test files as protected', () => {
      expect(isProtectedFile('src/test/main.test.ts')).toBe(true);
      expect(isProtectedFile('tests/unit.test.ts')).toBe(true);
      expect(isProtectedFile('__tests__/helper.spec.ts')).toBe(true);
      expect(isProtectedFile('src/myTest.ts')).toBe(true);
      expect(isProtectedFile('src/spec.ts')).toBe(true);
    });

    it('does not flag non-test files as protected', () => {
      expect(isProtectedFile('src/main.c')).toBe(false);
      expect(isProtectedFile('src/engine/analyze.ts')).toBe(false);
      expect(isProtectedFile('CMakeLists.txt')).toBe(false);
      expect(isProtectedFile('prj.conf')).toBe(false);
    });
  });

  describe('default resource controls', () => {
    it('has sensible defaults', () => {
      expect(DEFAULT_RESOURCE_CONTROLS.maxIterations).toBe(5);
      expect(DEFAULT_RESOURCE_CONTROLS.maxTimeMs).toBe(30 * 60 * 1000);
      expect(DEFAULT_RESOURCE_CONTROLS.maxCostUsd).toBe(5);
    });
  });
});
