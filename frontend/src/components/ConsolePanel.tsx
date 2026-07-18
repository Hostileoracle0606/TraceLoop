import { useRef, useEffect, useImperativeHandle, forwardRef, useCallback, useMemo } from 'react';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import { WebLinksAddon } from '@xterm/addon-web-links';
import '@xterm/xterm/css/xterm.css';
import { consoleTabAriaLabel } from './AccessibilityHelpers';

export type ConsoleTab = 'compiler' | 'renode' | 'uart' | 'test' | 'trace';

export interface ConsolePanelProps {
  logs: Partial<Record<ConsoleTab, string[]>>;
  activeTab: ConsoleTab;
  onTabChange: (tab: ConsoleTab) => void;
}

export interface ConsolePanelHandle {
  clear: () => void;
  scrollToBottom: () => void;
}

const TAB_LABELS: Record<ConsoleTab, string> = {
  compiler: 'Compiler output',
  renode: 'Renode monitor',
  uart: 'UART output',
  test: 'Test runner',
  trace: 'Trace collection',
};

const TAB_ORDER: ConsoleTab[] = ['compiler', 'renode', 'uart', 'test', 'trace'];

/**
 * xterm.js-based console panel with tabbed output.
 * Replaces the hardcoded <pre> console output in RunProgress.
 */
export const ConsolePanel = forwardRef<ConsolePanelHandle, ConsolePanelProps>(
  function ConsolePanel({ logs, activeTab, onTabChange }, ref) {
    const containerRef = useRef<HTMLDivElement>(null);
    const termRef = useRef<Terminal | null>(null);
    const fitAddonRef = useRef<FitAddon | null>(null);

    // Initialize terminal
    useEffect(() => {
      if (!containerRef.current) return;

      const term = new Terminal({
        theme: {
          background: '#111827', // gray-900
          foreground: '#4ade80', // green-400
          cursor: '#4ade80',
          cursorAccent: '#111827',
          selectionBackground: '#1e3a5f',
          black: '#111827',
          red: '#f87171',
          green: '#4ade80',
          yellow: '#fbbf24',
          blue: '#60a5fa',
          magenta: '#c084fc',
          cyan: '#22d3ee',
          white: '#e5e7eb',
          brightBlack: '#374151',
          brightRed: '#fca5a5',
          brightGreen: '#86efac',
          brightYellow: '#fde68a',
          brightBlue: '#93c5fd',
          brightMagenta: '#d8b4fe',
          brightCyan: '#67e8f9',
          brightWhite: '#f9fafb',
        },
        fontFamily: '"JetBrains Mono", "Fira Code", "Cascadia Code", Menlo, monospace',
        fontSize: 13,
        lineHeight: 1.4,
        cursorBlink: false,
        disableStdin: true,
        scrollback: 5000,
        convertEol: true,
      });

      const fitAddon = new FitAddon();
      const webLinksAddon = new WebLinksAddon();

      term.loadAddon(fitAddon);
      term.loadAddon(webLinksAddon);
      term.open(containerRef.current);

      // Initial fit
      try {
        fitAddon.fit();
      } catch {
        // Container may not be visible yet
      }

      termRef.current = term;
      fitAddonRef.current = fitAddon;

      // Resize observer for auto-fit
      const resizeObserver = new ResizeObserver(() => {
        try {
          fitAddon.fit();
        } catch {
          // Ignore fit errors during resize
        }
      });
      resizeObserver.observe(containerRef.current);

      return () => {
        resizeObserver.disconnect();
        term.dispose();
        termRef.current = null;
        fitAddonRef.current = null;
      };
    }, []);

    // Write log content when tab or logs change
    useEffect(() => {
      const term = termRef.current;
      if (!term) return;

      term.clear();
      const tabLogs = logs[activeTab] ?? [];
      for (const line of tabLogs) {
        term.writeln(line);
      }
      term.writeln('');
    }, [activeTab, logs]);

    // Re-fit on window resize
    useEffect(() => {
      const handleResize = () => {
        try {
          fitAddonRef.current?.fit();
        } catch {
          // Ignore
        }
      };
      window.addEventListener('resize', handleResize);
      return () => window.removeEventListener('resize', handleResize);
    }, []);

    // Imperative handle for external control
    useImperativeHandle(ref, () => ({
      clear: () => {
        termRef.current?.clear();
      },
      scrollToBottom: () => {
        if (termRef.current) {
          termRef.current.scrollToBottom();
        }
      },
    }));

    const handleTabClick = useCallback(
      (tab: ConsoleTab) => {
        onTabChange(tab);
      },
      [onTabChange]
    );

    return (
      <div className="console-panel-root" role="region" aria-label="Console output">
        <div className="console-tabs" role="tablist" aria-label="Console output tabs">
          {TAB_ORDER.map((tab) => (
            <button
              key={tab}
              role="tab"
              aria-selected={activeTab === tab}
              aria-label={consoleTabAriaLabel(TAB_LABELS[tab], activeTab === tab)}
              className={activeTab === tab ? 'active' : ''}
              onClick={() => handleTabClick(tab)}
            >
              {TAB_LABELS[tab]}
            </button>
          ))}
        </div>
        <div
          ref={containerRef}
          className="console-terminal"
          role="log"
          aria-label={`${TAB_LABELS[activeTab]} output`}
          aria-live="polite"
          style={{
            height: '100%',
            minHeight: '200px',
            padding: '4px',
          }}
        />
      </div>
    );
  }
);

/**
 * Default log content matching the hardcoded data from TraceLoop.tsx RunProgress.
 */
export const DEFAULT_CONSOLE_LOGS: Record<ConsoleTab, string[]> = {
  compiler: [
    '[84/84] Linking C executable zephyr/firmware.elf',
    'Memory region         Used Size  Region Size  %age Used',
    'FLASH:                  71424 B          1 MB       6.81%',
    'RAM:                    11872 B        192 KB       6.04%',
    'Build finished: exit code 0',
  ],
  renode: [
    '(monitor) include @platforms/boards/stm32f4_discovery-kit.repl',
    '(machine-0) sysbus LoadELF @firmware.elf',
    '(machine-0) start',
    '1000 us: TIM2 update event',
    '1001 us: NVIC IRQ 28 pending',
  ],
  uart: [
    '[00.000000] TraceLoop firmware boot',
    '[00.000114] Configuring TIM2 for 1 ms period',
    '[00.001004] timer_isr entered',
  ],
  test: [
    '[ PASS ] timer2_initializes',
    '[ PASS ] timer2_irq_fires',
    '[ PASS ] timer_isr_entered',
    '[ FAIL ] green_led_should_turn_on',
    '         Expected: GPIOG pin 12 = 1 by 2000 us',
    '         Actual:   GPIOG pin 12 = 0',
    '         Trace:    RUN-1042.traceloop',
  ],
  trace: [
    'Trace collector armed: functions, interrupts, registers, GPIO',
    'Captured 1,284 events · 91.2 KB',
    'Causal index built: 6 relevant events · confidence 0.99',
  ],
};
