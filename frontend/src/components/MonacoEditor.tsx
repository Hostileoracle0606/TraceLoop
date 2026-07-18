import { useRef, useEffect, useCallback, useMemo } from 'react';
import Editor, { type OnMount } from '@monaco-editor/react';
import type { editor } from 'monaco-editor';
import { editorAriaLabel } from './AccessibilityHelpers';

export interface MonacoEditorProps {
  value: string;
  language?: string;
  line?: number;
  readOnly?: boolean;
  flaggedLines?: number[];
  onChange?: (value: string) => void;
  filename?: string;
}

/**
 * Monaco-based code editor component.
 * Replaces the hardcoded CodeEditor component in TraceLoop.tsx.
 */
export function MonacoEditor({
  value,
  language = 'c',
  line,
  readOnly = true,
  flaggedLines = [],
  onChange,
  filename = 'main.c',
}: MonacoEditorProps) {
  const editorRef = useRef<editor.IStandaloneCodeEditor | null>(null);
  const decorationsRef = useRef<string[]>([]);

  const handleMount: OnMount = useCallback(
    (editorInstance, monaco) => {
      editorRef.current = editorInstance;

      // Define dark theme matching existing design
      monaco.editor.defineTheme('traceloop-dark', {
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
          'editor.selectionBackground': '#1e3a5f',
          'editor.lineHighlightBackground': '#1e293b',
          'editorCursor.foreground': '#4ade80',
          'editorWhitespace.foreground': '#334155',
          'editorIndentGuide.background': '#1e293b',
          'editorGutter.background': '#0f172a',
        },
      });
      monaco.editor.setTheme('traceloop-dark');

      // Scroll to highlighted line
      if (line) {
        editorInstance.revealLineInCenter(line);
      }
    },
    [line]
  );

  // Update line decorations (highlighted line + flagged lines)
  useEffect(() => {
    const editorInstance = editorRef.current;
    if (!editorInstance) return;

    const model = editorInstance.getModel();
    if (!model) return;

    const newDecorations: editor.IModelDeltaDecoration[] = [];

    // Highlighted/selected line
    if (line && line > 0) {
      newDecorations.push({
        range: {
          startLineNumber: line,
          startColumn: 1,
          endLineNumber: line,
          endColumn: model.getLineMaxColumn(line),
        },
        options: {
          isWholeLine: true,
          className: 'traceloop-selected-line',
          glyphMarginClassName: 'traceloop-selected-gutter',
          linesDecorationsClassName: 'traceloop-selected-marker',
        },
      });
    }

    // Flagged lines (engine markers)
    for (const flaggedLine of flaggedLines) {
      if (flaggedLine > 0 && flaggedLine <= model.getLineCount()) {
        newDecorations.push({
          range: {
            startLineNumber: flaggedLine,
            startColumn: 1,
            endLineNumber: flaggedLine,
            endColumn: model.getLineMaxColumn(flaggedLine),
          },
          options: {
            isWholeLine: flaggedLine === line, // Don't double-highlight if also selected
            className: flaggedLine !== line ? 'traceloop-flagged-line' : undefined,
            glyphMarginClassName: 'traceloop-flagged-gutter',
            glyphMarginHoverMessage: { value: '**Engine marker** — flagged by causal analysis' },
          },
        });
      }
    }

    decorationsRef.current = editorInstance.deltaDecorations(
      decorationsRef.current,
      newDecorations
    );
  }, [line, flaggedLines]);

  // Compute cursor position info for status bar
  const lineCount = useMemo(() => value.split('\n').length, [value]);

  const editorOptions: editor.IStandaloneEditorConstructionOptions = useMemo(
    () => ({
      readOnly,
      minimap: { enabled: false },
      lineNumbers: 'on' as const,
      scrollBeyondLastLine: false,
      fontSize: 13,
      fontFamily: '"JetBrains Mono", "Fira Code", "Cascadia Code", Menlo, monospace',
      lineHeight: 20,
      glyphMargin: true,
      lineDecorationsWidth: 12,
      padding: { top: 8, bottom: 8 },
      renderLineHighlight: 'all' as const,
      wordWrap: 'off' as const,
      automaticLayout: true,
      tabSize: 4,
      insertSpaces: false,
      folding: false,
      contextmenu: false,
      overviewRulerLanes: 0,
      hideCursorInOverviewRuler: true,
      overviewRulerBorder: false,
      scrollbar: {
        verticalScrollbarSize: 8,
        horizontalScrollbarSize: 8,
      },
    }),
    [readOnly]
  );

  return (
    <div
      className="monaco-editor-root"
      aria-label={editorAriaLabel(filename, language, readOnly)}
      role="region"
    >
      <div className="editor-tabs">
        <button className="active">
          <span className="c-file">{language === 'c' ? 'C' : language.charAt(0).toUpperCase()}</span>{' '}
          {filename} <i>●</i>
        </button>
      </div>
      <div className="editor-code">
        <Editor
          height="100%"
          language={language}
          value={value}
          theme="traceloop-dark"
          options={editorOptions}
          onMount={handleMount}
          onChange={(val) => {
            if (onChange && val !== undefined) {
              onChange(val);
            }
          }}
        />
      </div>
      <div className="editor-status">
        <span>{filename}</span>
        <span>{line ? `Ln ${line}, Col 1` : `Ln ${lineCount}`}</span>
        <span>UTF-8</span>
        <span>{language.toUpperCase()}</span>
      </div>
    </div>
  );
}
