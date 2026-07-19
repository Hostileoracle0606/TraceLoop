import { parseSexpr, type SNode } from './sexpr';
import { SchematicParseError, type RawSchematic, type RawPart, type RawNet, type RawNode } from '../types';

function isList(n: SNode): n is SNode[] {
  return Array.isArray(n);
}

/** Find all direct children whose head atom equals `tag`. */
function children(list: SNode[], tag: string): SNode[][] {
  return list.filter((c): c is SNode[] => isList(c) && c[0] === tag);
}

/** Value of a `(key "value")` child, or undefined. */
function prop(list: SNode[], key: string): string | undefined {
  const found = list.find((c): c is SNode[] => isList(c) && c[0] === key);
  return found && typeof found[1] === 'string' ? found[1] : undefined;
}

export function parseKicadNetlist(content: string): RawSchematic {
  if (!content.trim()) throw new SchematicParseError('empty netlist');

  let root: SNode;
  try {
    root = parseSexpr(content);
  } catch (e) {
    throw new SchematicParseError(`not a valid S-expression: ${(e as Error).message}`);
  }
  if (!isList(root) || root[0] !== 'export') {
    throw new SchematicParseError("not a KiCad netlist (missing 'export' root)");
  }

  const componentsBlock = children(root, 'components')[0] ?? [];
  const parts: RawPart[] = children(componentsBlock, 'comp').map((comp) => ({
    refdes: prop(comp, 'ref') ?? '',
    value: prop(comp, 'value'),
    footprint: prop(comp, 'footprint'),
    libId: prop(comp, 'libsource'),
  }));
  const known = new Set(parts.map((p) => p.refdes));
  const dupes = parts.map((p) => p.refdes).filter((r, i, a) => a.indexOf(r) !== i);
  if (dupes.length) throw new SchematicParseError(`duplicate refdes: ${dupes.join(', ')}`);

  const netsBlock = children(root, 'nets')[0] ?? [];
  const nets: RawNet[] = children(netsBlock, 'net').map((net) => {
    const nodes: RawNode[] = children(net, 'node').map((node) => {
      const refdes = prop(node, 'ref') ?? '';
      if (!known.has(refdes)) {
        throw new SchematicParseError(`net node references undeclared component: ${refdes}`);
      }
      return { refdes, pin: prop(node, 'pin') ?? '', pinfunction: prop(node, 'pinfunction') };
    });
    return { name: prop(net, 'name') ?? '', nodes };
  });

  return { parts, nets };
}
