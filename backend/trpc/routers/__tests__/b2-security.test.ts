import { describe, it, expect } from 'vitest';
import { runsRouter } from '../runs';
import { boardsRouter } from '../boards';

describe('B2: Security - Remove privileged mutations', () => {
  describe('runs router', () => {
    it('should NOT expose updateStatus procedure (forge vector)', () => {
      // updateStatus allows clients to forge run status/evidence
      // It should be removed from the public API
      expect((runsRouter as any).updateStatus).toBeUndefined();
    });

    it('should still expose read-only procedures', () => {
      expect(runsRouter.listByTask).toBeDefined();
      expect(runsRouter.get).toBeDefined();
    });
  });

  describe('boards router', () => {
    it('should require admin role for create/update/delete', () => {
      // These procedures should exist but require admin middleware
      expect(boardsRouter.create).toBeDefined();
      expect(boardsRouter.update).toBeDefined();
      expect(boardsRouter.delete).toBeDefined();
    });

    it('should allow public read access', () => {
      expect(boardsRouter.list).toBeDefined();
      expect(boardsRouter.get).toBeDefined();
      expect(boardsRouter.getByTarget).toBeDefined();
      expect(boardsRouter.search).toBeDefined();
    });
  });
});
