import { useRef, useCallback, useMemo } from 'react';
import { DiffEditor, type DiffEditorProps } from '@monaco-editor/react';
import type { editor } from 'monaco-editor';
import { diffAriaLabel } from './AccessibilityHelpers';

export interface DiffViewerProps {
  original: string;
  modified: string;
  filename?: string;
  readOnly?: boolean;
  language?: string;
}

/**
 * Monaco-based side-by-side diff viewer.
 * Replaces the inline diff rendering in PatchReview.
 */
export function DiffViewer({
  original,
  modified,
  filename = 'src/main.c',
  readOnly = true,
  language = 'c',
}: DiffViewerProps) {
  const diffEditorRef = useRef<editor.IStandaloneDiffEditor | null>(null);

  const handleMount: DiffEditorProps['onMount'] = useCallback(
    (diffEditor: editor.IStandaloneDiffEditor, monaco: typeof import('monaco-editor')) => {
      diffEditorRef.current = diffEditor;

      // Define dark theme for diff editor
      monaco.editor.defineTheme('traceloop-diff-dark', {
        base: 'vs-dark',
        inherit: true,
        rules: [
          { token: 'keyword', foreground: 'c084fc', fontStyle: 'bold' },
          { token: 'comment', foreground: '6b7280', fontStyle: 'italic' },
          { token: 'string', foreground: '4ade80' },
          { token: 'number', foreground: 'fbbf24' },
          { token: 'preprocessor', foreground: 'f87171' },
          { token: 'type', foreground: '60a5fa' },
          { token: 'function', foreground: '22d3ee' },
        ],
        colors: {
          'editor.background': '#0f172a',
          'editor.foreground': '#e2e8f0',
          'editorLineNumber.foreground': '#475569',
          'editorLineNumber.activeForeground': '#94a3b8',
          'diffEditor.insertedTextBackground': '#22c55e20',
          'diffEditor.removedTextBackground': '#ef444420',
          'diffEditor.insertedLineBackground': '#22c55e10',
          'diffEditor.removedLineBackground': '#ef444410',
          'editorGutter.background': '#0f172a',
        },
      });
      monaco.editor.setTheme('traceloop-diff-dark');
    },
    []
  );

  // Compute diff statistics
  const stats = useMemo(() => {
    const origLines = original.split('\n');
    const modLines = modified.split('\n');

    let additions = 0;
    let deletions = 0;

    // Simple line-by-line comparison for summary
    const maxLen = Math.max(origLines.length, modLines.length);
    for (let i = 0; i < maxLen; i++) {
      const origLine = origLines[i];
      const modLine = modLines[i];
      if (origLine === undefined) {
        additions++;
      } else if (modLine === undefined) {
        deletions++;
      } else if (origLine !== modLine) {
        additions++;
        deletions++;
      }
    }

    return { additions, deletions };
  }, [original, modified]);

  const diffOptions: editor.IDiffEditorConstructionOptions = useMemo(
    () => ({
      readOnly,
      minimap: { enabled: false },
      lineNumbers: 'on' as const,
      scrollBeyondLastLine: false,
      fontSize: 13,
      fontFamily: '"JetBrains Mono", "Fira Code", "Cascadia Code", Menlo, monospace',
      lineHeight: 20,
      renderSideBySide: true,
      renderOverviewRuler: false,
      hideCursorInOverviewRuler: true,
      overviewRulerBorder: false,
      overviewRulerLanes: 0,
      automaticLayout: true,
      padding: { top: 8, bottom: 8 },
      scrollbar: {
        verticalScrollbarSize: 8,
        horizontalScrollbarSize: 8,
      },
      renderMarginRevertIcon: false,
    }),
    [readOnly]
  );

  return (
    <div
      className="diff-viewer-root"
      role="region"
      aria-label={diffAriaLabel(filename, stats.additions, stats.deletions)}
    >
      <div className="diff-summary-bar">
        <span className="diff-filename">{filename}</span>
        <span className="diff-stats">
          <i className="plus">+{stats.additions}</i>
          <i className="minus">-{stats.deletions}</i>
        </span>
        <span className="diff-file-count">1 file changed</span>
      </div>
      <div className="diff-editor-container">
        <DiffEditor
          height="100%"
          language={language}
          original={original}
          modified={modified}
          theme="traceloop-diff-dark"
          onMount={handleMount}
          options={diffOptions}
        />
      </div>
    </div>
  );
}
