export const MAX_FILE_UPLOAD_BYTES = 5 * 1024 * 1024; // 5 MB per file
export const DEFAULT_USER_QUOTA_BYTES = 50 * 1024 * 1024; // 50 MB per user free tier

const VALID_ID_RE = /^[a-zA-Z0-9_-]{1,128}$/;
const VALID_USERNAME_RE = /^[a-z0-9][a-z0-9-]{1,30}[a-z0-9]$/;
const VALID_REPO_SLUG_RE = /^[a-z0-9][a-z0-9._-]{0,78}[a-z0-9]?$/;

export function isValidId(id: string): boolean {
  return typeof id === 'string' && VALID_ID_RE.test(id);
}

export function isValidUsername(username: string): boolean {
  return typeof username === 'string' && username.length >= 3 && username.length <= 32 && VALID_USERNAME_RE.test(username);
}

export function isValidRepoSlug(slug: string): boolean {
  if (typeof slug !== 'string' || slug.length < 1 || slug.length > 80) return false;
  if (slug.includes('..') || slug.endsWith('.git')) return false;
  return VALID_REPO_SLUG_RE.test(slug);
}

export function slugifyRepoName(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
}

export function sanitizeRelativeRepoPath(inputPath: string): string | null {
  if (typeof inputPath !== 'string') return null;
  const normalized = inputPath.replace(/\\/g, '/').replace(/^\/+|\/+$/g, '');
  if (!normalized || normalized.length > 400) return null;
  if (normalized.includes('\0')) return null;
  const parts = normalized.split('/');
  for (const part of parts) {
    if (!part || part === '.' || part === '..' || part === '.git') {
      return null;
    }
  }
  return parts.join('/');
}

export function isValidBranchOrTagName(ref: string): boolean {
  if (typeof ref !== 'string' || ref.length < 1 || ref.length > 80) return false;
  if (ref.startsWith('-') || ref.startsWith('/') || ref.endsWith('/') || ref.endsWith('.lock')) return false;
  if (/[\s~^:?*[\]\\]/.test(ref) || ref.includes('..') || ref.includes('@{')) return false;
  return /^[a-zA-Z0-9._/-]+$/.test(ref);
}

const EXTENSION_LANGUAGE_MAP: Record<string, string> = {
  html: 'HTML',
  htm: 'HTML',
  css: 'CSS',
  scss: 'CSS',
  js: 'JavaScript',
  mjs: 'JavaScript',
  cjs: 'JavaScript',
  jsx: 'JavaScript',
  ts: 'TypeScript',
  tsx: 'TypeScript',
  py: 'Python',
  c: 'C',
  h: 'C',
  cpp: 'C++',
  cc: 'C++',
  cxx: 'C++',
  hpp: 'C++',
  java: 'Java',
  kt: 'Kotlin',
  kts: 'Kotlin',
  rs: 'Rust',
  go: 'Go',
  php: 'PHP',
  rb: 'Ruby',
  swift: 'Swift',
  sql: 'SQL',
  json: 'JSON',
  yaml: 'YAML',
  yml: 'YAML',
  md: 'Markdown',
  mdx: 'Markdown',
  sh: 'Shell',
  bash: 'Shell',
  zsh: 'Shell',
  xml: 'XML',
  svg: 'XML',
  csv: 'CSV',
};

export function detectLanguageFromFilename(filename: string): string {
  const base = filename.split('/').pop()?.toLowerCase() ?? '';
  if (base === 'dockerfile') return 'Shell';
  if (base === 'makefile') return 'Shell';
  const ext = base.includes('.') ? base.split('.').pop() ?? '' : '';
  return EXTENSION_LANGUAGE_MAP[ext] ?? 'Text';
}

export function getHighlightLanguage(filename: string): string {
  const lang = detectLanguageFromFilename(filename);
  const map: Record<string, string> = {
    HTML: 'xml',
    CSS: 'css',
    JavaScript: 'javascript',
    TypeScript: 'typescript',
    Python: 'python',
    C: 'c',
    'C++': 'cpp',
    Java: 'java',
    Kotlin: 'kotlin',
    Rust: 'rust',
    Go: 'go',
    PHP: 'php',
    Ruby: 'ruby',
    Swift: 'swift',
    SQL: 'sql',
    JSON: 'json',
    YAML: 'yaml',
    Markdown: 'markdown',
    Shell: 'bash',
    XML: 'xml',
    CSV: 'plaintext',
    Text: 'plaintext',
  };
  return map[lang] ?? 'plaintext';
}

export function getMonacoLanguage(filename: string): string {
  const lang = detectLanguageFromFilename(filename);
  const map: Record<string, string> = {
    HTML: 'html',
    CSS: 'css',
    JavaScript: 'javascript',
    TypeScript: 'typescript',
    Python: 'python',
    C: 'c',
    'C++': 'cpp',
    Java: 'java',
    Kotlin: 'kotlin',
    Rust: 'rust',
    Go: 'go',
    PHP: 'php',
    Ruby: 'ruby',
    Swift: 'swift',
    SQL: 'sql',
    JSON: 'json',
    YAML: 'yaml',
    Markdown: 'markdown',
    Shell: 'shell',
    XML: 'xml',
    CSV: 'plaintext',
    Text: 'plaintext',
  };
  return map[lang] ?? 'plaintext';
}

export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  const idx = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  const val = bytes / Math.pow(1024, idx);
  return `${val >= 10 || idx === 0 ? val.toFixed(0) : val.toFixed(1)} ${units[idx]}`;
}

export function checkStorageQuota(
  currentBytes: number,
  addBytes: number,
  quotaLimitBytes: number = DEFAULT_USER_QUOTA_BYTES
): { allowed: boolean; remainingBytes: number; projectedBytes: number } {
  const safeCurrent = Math.max(0, currentBytes);
  const safeAdd = Math.max(0, addBytes);
  const projectedBytes = safeCurrent + safeAdd;
  return {
    allowed: projectedBytes <= quotaLimitBytes,
    remainingBytes: Math.max(0, quotaLimitBytes - safeCurrent),
    projectedBytes,
  };
}

export interface ParsedWorkflowSummary {
  name: string;
  triggers: string[];
  jobs: string[];
  valid: boolean;
  error?: string;
}

export function parseWorkflowYamlSummary(yamlText: string): ParsedWorkflowSummary {
  if (!yamlText || !yamlText.trim()) {
    return { name: '', triggers: [], jobs: [], valid: false, error: 'Workflow YAML is empty.' };
  }
  const lines = yamlText.split(/\r?\n/);
  let name = 'Unnamed Workflow';
  const triggers: string[] = [];
  const jobs: string[] = [];
  let inOn = false;
  let inJobs = false;

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;

    if (/^name:\s*/i.test(line)) {
      name = line.replace(/^name:\s*/i, '').replace(/^['"]|['"]$/g, '').trim() || 'Unnamed Workflow';
      inOn = false;
      inJobs = false;
      continue;
    }

    if (/^on:\s*(.*)$/.test(line)) {
      inJobs = false;
      const inline = line.replace(/^on:\s*/, '').trim();
      if (inline.startsWith('[') && inline.endsWith(']')) {
        inline
          .slice(1, -1)
          .split(',')
          .map((t) => t.trim())
          .filter(Boolean)
          .forEach((t) => triggers.push(t));
        inOn = false;
      } else if (inline) {
        triggers.push(inline.replace(/:$/, ''));
        inOn = false;
      } else {
        inOn = true;
      }
      continue;
    }

    if (/^jobs:\s*$/.test(line)) {
      inOn = false;
      inJobs = true;
      continue;
    }

    if (/^\S/.test(line)) {
      inOn = false;
      inJobs = false;
      continue;
    }

    if (inOn && /^  [a-zA-Z0-9_-]+:/.test(line)) {
      triggers.push(trimmed.replace(/:.*$/, ''));
    } else if (inJobs && /^  [a-zA-Z0-9_-]+:/.test(line)) {
      jobs.push(trimmed.replace(/:.*$/, ''));
    }
  }

  if (jobs.length === 0) {
    return { name, triggers, jobs, valid: false, error: 'Workflow must define at least one job under "jobs:".' };
  }

  return { name, triggers: triggers.length ? triggers : ['manual'], jobs, valid: true };
}

export function getLicenseTemplate(licenseId: string, authorName: string): string {
  const year = new Date().getFullYear();
  if (licenseId === 'Apache-2.0') {
    return `Apache License\nVersion 2.0, January 2004\nhttp://www.apache.org/licenses/\n\nCopyright ${year} ${authorName}\n\nLicensed under the Apache License, Version 2.0 (the "License");\nyou may not use this file except in compliance with the License.\n`;
  }
  if (licenseId === 'GPL-3.0') {
    return `GNU GENERAL PUBLIC LICENSE\nVersion 3, 29 June 2007\n\nCopyright (C) ${year} ${authorName}\nThis program is free software: you can redistribute it and/or modify it under the terms of the GNU General Public License.\n`;
  }
  return `MIT License\n\nCopyright (c) ${year} ${authorName}\n\nPermission is hereby granted, free of charge, to any person obtaining a copy\nof this software and associated documentation files (the "Software"), to deal\nin the Software without restriction, including without limitation the rights\nto use, copy, modify, merge, publish, distribute, sublicense, and/or sell\ncopies of the Software, and to permit persons to whom the Software is\nfurnished to do so, subject to the following conditions:\n\nThe above copyright notice and this permission notice shall be included in all\ncopies or substantial portions of the Software.\n\nTHE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR\nIMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,\nFITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT.\n`;
}

export function getGitignoreTemplate(templateId: string): string {
  if (templateId === 'Python') {
    return `__pycache__/\n*.py[cod]\n.venv/\nvenv/\n.env\ndist/\nbuild/\n`;
  }
  if (templateId === 'Rust') {
    return `/target\n**/*.rs.bk\nCargo.lock\n`;
  }
  if (templateId === 'Go') {
    return `bin/\n*.exe\n*.test\n*.out\n.env\n`;
  }
  return `node_modules/\ndist/\nbuild/\n.env\n.env.local\n*.log\n.DS_Store\n`;
}
