import { describe, it, expect } from 'vitest';
import { parseSexpr, type SNode } from './sexpr';

describe('parseSexpr', () => {
  it('parses a flat list of atoms', () => {
    expect(parseSexpr('(a b c)')).toEqual(['a', 'b', 'c']);
  });

  it('parses nested lists', () => {
    expect(parseSexpr('(a (b c) d)')).toEqual(['a', ['b', 'c'], 'd']);
  });

  it('F1: keeps parens and spaces inside quoted strings', () => {
    expect(parseSexpr('(name "a (b) c")')).toEqual(['name', 'a (b) c']);
  });

  it('F1: handles escaped quotes inside strings', () => {
    expect(parseSexpr('(v "a\\"b")')).toEqual(['v', 'a"b']);
  });

  it('throws on unbalanced parens', () => {
    expect(() => parseSexpr('(a (b)')).toThrow(/unbalanced/i);
  });

  it('returns the first top-level form only', () => {
    const node = parseSexpr('(export (version "E"))') as SNode[];
    expect(node[0]).toBe('export');
  });
});
