import { cn } from '../../lib/utils';
import type { SchematicSummary } from './types';

export function SchematicCanvas({
  schematic,
  frame = 0,
  compact = false,
  building = false,
}: {
  schematic: SchematicSummary;
  frame?: number;
  compact?: boolean;
  building?: boolean;
}) {
  const inputs = schematic.nodes.filter((node) => node.kind === 'sensor' || node.kind === 'peripheral');
  const systemNodes = schematic.nodes.filter((node) => node.kind === 'controller' || node.kind === 'radio' || node.kind === 'service');

  return (
    <div className={cn('schematic-map', compact && 'schematic-map--compact', building && 'is-building')} aria-label={`${schematic.displayName} schematic`}>
      <svg className="schematic-map__nets" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
        <path className="net net--inputs" d="M8 19 V43 H18 M31 19 V43 H38 M57 19 V43 H58 M82 19 V43 H78" />
        <path className="net net--system" d="M7 58 H93 M19 58 V83 H72 M72 58 V83 H91" />
        <path className="net net--bus" d="M8 84 H72" />
        <circle className="net-pulse net-pulse--a" cx="8" cy="19" r=".7" />
        <circle className="net-pulse net-pulse--b" cx="19" cy="58" r=".7" />
        <circle className="net-pulse net-pulse--c" cx="72" cy="83" r=".7" />
      </svg>

      <div className="schematic-map__inputs" style={{ gridTemplateColumns: `repeat(${Math.max(inputs.length, 1)}, minmax(0, 1fr))` }}>
        {inputs.map((node, index) => (
          <span
            className={cn(frame === 0 && 'is-active', frame > 0 && 'is-complete')}
            style={building ? { animationDelay: `${index * 100}ms` } : undefined}
            key={node.id}
          >
            <b className="component-index" aria-hidden="true">{String(index + 1).padStart(2, '0')}</b>
            <small>{node.reference}</small>
            <strong>{node.name}</strong>
            <em>{node.detail}</em>
            <i className="component-indicator" aria-hidden="true" />
          </span>
        ))}
      </div>

      <div className="schematic-map__controllers" style={{ gridTemplateColumns: `repeat(${Math.max(systemNodes.length, 1)}, minmax(0, 1fr))` }}>
        {systemNodes.map((node, index) => {
          const activeFrame = Math.min(index + 1, 2);
          return (
            <span
              className={cn(
                'schematic-node',
                `schematic-node--${node.kind}`,
                frame === activeFrame && 'is-active',
                frame > activeFrame && 'is-complete',
                building && frame < activeFrame && 'is-pending',
              )}
              style={building ? { animationDelay: `${180 + index * 120}ms` } : undefined}
              key={node.id}
            >
              <i className="chip-pins chip-pins--left" aria-hidden="true" />
              <i className="chip-pins chip-pins--right" aria-hidden="true" />
              <small>{node.reference}</small>
              <strong>{node.name}</strong>
              <em>{node.detail}</em>
              {node.firmware && <code>{node.firmware}</code>}
              <b className="package-mark" aria-hidden="true" />
            </span>
          );
        })}
      </div>

      <div className={cn('schematic-map__bus', (frame === 1 || frame === 2) && 'is-active', frame > 2 && 'is-complete')}>
        <i />
        <span>{schematic.buses[0] ?? 'System bus'}</span>
        <i />
      </div>
    </div>
  );
}
