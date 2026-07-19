/**
 * Compute factual scope information from a patch's data.
 * Replaces hardcoded "Low risk" labels with actual change metrics.
 */

export interface PatchInput {
  file: string;
  before: string;
  after: string;
}

export interface PatchScope {
  filesChanged: number;
  linesChanged: number;
  testsUnchanged: boolean;
  scopeString: string;
}

/** Check if a file path looks like a test file. */
function isTestFile(filePath: string): boolean {
  const lower = filePath.toLowerCase();
  // Common test patterns: test files, .robot test specs, files in test dirs
  if (lower.endsWith('.robot')) return true;
  if (lower.includes('/test/') || lower.includes('/tests/')) return true;
  if (lower.startsWith('test/') || lower.startsWith('tests/')) return true;
  if (/test[_-]/.test(lower) || /[_-]test\./.test(lower)) return true;
  if (/\.test\./.test(lower) || /\.spec\./.test(lower)) return true;
  return false;
}

/** Count non-empty lines in a string. */
function countLines(text: string): number {
  if (!text) return 0;
  return text.split('\n').filter(line => line.length > 0).length;
}

export function computePatchScope(patch: PatchInput): PatchScope {
  const filesChanged = 1; // Each patch row represents one file
  const beforeLines = countLines(patch.before);
  const afterLines = countLines(patch.after);
  const linesChanged = beforeLines + afterLines;
  const testsUnchanged = !isTestFile(patch.file);

  const fileWord = filesChanged === 1 ? 'file' : 'files';
  const lineWord = linesChanged === 1 ? 'line' : 'lines';
  const testStatus = testsUnchanged ? 'tests unchanged' : 'tests modified';
  const scopeString = `${filesChanged} ${fileWord} · ${linesChanged} ${lineWord} · ${testStatus}`;

  return { filesChanged, linesChanged, testsUnchanged, scopeString };
}
