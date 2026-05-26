const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const ROOT = path.resolve(__dirname, '..');

const DOC_BUDGETS = {
  'AGENTS.md': 180,
  'README.md': 220,
  'docs/current-state.md': 180,
  'docs/architecture.md': 150,
  'docs/content-script.md': 150,
  'docs/background-service-worker.md': 150,
  'docs/action-options-ui-and-storage.md': 150,
  'docs/native-host.md': 150,
  'docs/permissions-and-privacy.md': 150,
  'docs/build-release.md': 150,
  'docs/verification.md': 180,
  'docs/future-improvements.md': 150,
  'docs/history.md': 80,
};

const HISTORY_ARCHIVE_BUDGET = 260;
const MARKDOWN_LINK_RE = /\[[^\]]+\]\(([^)]+)\)/g;
const FENCED_BLOCK_RE = /```[\s\S]*?```/g;

function projectPath(relativePath) {
  return path.join(ROOT, relativePath);
}

function read(relativePath) {
  return fs.readFileSync(projectPath(relativePath), 'utf8');
}

function lineCount(relativePath) {
  const text = read(relativePath).trimEnd();
  return text ? text.split(/\r?\n/).length : 0;
}

function withoutFencedBlocks(text) {
  return text.replace(FENCED_BLOCK_RE, '');
}

function walkMarkdownFiles(directory) {
  if (!fs.existsSync(directory)) {
    return [];
  }

  const entries = fs.readdirSync(directory, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...walkMarkdownFiles(entryPath));
    } else if (entry.isFile() && entry.name.endsWith('.md')) {
      files.push(entryPath);
    }
  }

  return files;
}

test('AGENTS.md keeps required sections', () => {
  const agents = read('AGENTS.md');
  const requiredSections = [
    '## Purpose',
    '## Working Rules',
    '## Current System',
    '## Important Docs',
    '## Documentation Ownership',
    '## Documentation Maintenance',
    '## Commands',
    '## Verification Expectations',
    '## Scraper Rules',
    '## Privacy And Security',
    '## GitHub Workflow',
  ];

  const missing = requiredSections.filter((section) => !agents.includes(section));

  assert.deepEqual(missing, []);
});

test('owner docs are registered in AGENTS.md', () => {
  const agents = read('AGENTS.md');
  const expectedDocs = [
    'docs/current-state.md',
    'docs/architecture.md',
    'docs/content-script.md',
    'docs/background-service-worker.md',
    'docs/action-options-ui-and-storage.md',
    'docs/native-host.md',
    'docs/permissions-and-privacy.md',
    'docs/build-release.md',
    'docs/verification.md',
    'docs/future-improvements.md',
    'docs/history.md',
  ];

  const missing = expectedDocs.filter((doc) => !agents.includes(doc));

  assert.deepEqual(missing, []);
});

test('docs stay within line budgets', () => {
  const missing = Object.keys(DOC_BUDGETS).filter(
    (relativePath) => !fs.existsSync(projectPath(relativePath)),
  );
  const oversize = {};

  for (const [relativePath, budget] of Object.entries(DOC_BUDGETS)) {
    if (missing.includes(relativePath)) {
      continue;
    }
    const lines = lineCount(relativePath);
    if (lines > budget) {
      oversize[relativePath] = lines;
    }
  }

  assert.deepEqual({ missing, oversize }, { missing: [], oversize: {} });
});

test('history archives stay scannable', () => {
  const historyDir = projectPath('docs/history');
  const oversize = {};

  for (const filePath of walkMarkdownFiles(historyDir)) {
    const relativePath = path.relative(ROOT, filePath);
    const text = fs.readFileSync(filePath, 'utf8').trimEnd();
    const lines = text ? text.split(/\r?\n/).length : 0;
    if (lines > HISTORY_ARCHIVE_BUDGET) {
      oversize[relativePath] = lines;
    }
  }

  assert.deepEqual(oversize, {});
});

test('current state does not carry history entries', () => {
  const currentState = read('docs/current-state.md');
  const forbiddenPhrases = [
    'Latest Known',
    'Completed on',
    'Implemented on',
    'Verification on',
    'was considered complete',
  ];

  const present = forbiddenPhrases.filter((phrase) => currentState.includes(phrase));

  assert.deepEqual(present, []);
});

test('local markdown links point to existing files', () => {
  const markdownFiles = new Set([
    projectPath('AGENTS.md'),
    projectPath('README.md'),
    ...walkMarkdownFiles(projectPath('docs')),
  ]);
  const missing = [];

  for (const markdownFile of Array.from(markdownFiles).sort()) {
    const text = withoutFencedBlocks(fs.readFileSync(markdownFile, 'utf8'));
    const baseDir = path.dirname(markdownFile);

    for (const match of text.matchAll(MARKDOWN_LINK_RE)) {
      const target = match[1];
      if (/^(https?:|mailto:|chrome:)/.test(target)) {
        continue;
      }

      const targetPath = target.split('#')[0];
      if (!targetPath || !targetPath.endsWith('.md')) {
        continue;
      }

      const relativeTarget = path.resolve(baseDir, targetPath);
      const rootTarget = path.resolve(ROOT, targetPath);
      if (!fs.existsSync(relativeTarget) && !fs.existsSync(rootTarget)) {
        missing.push(`${path.relative(ROOT, markdownFile)} -> ${target}`);
      }
    }
  }

  assert.deepEqual(missing, []);
});
