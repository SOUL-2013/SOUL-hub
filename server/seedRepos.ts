import { deployStaticSiteFromGit } from './deployService.ts';
import { commitFiles, createBranch, createTag, initBareRepo, repoExistsOnDisk } from './gitService.ts';
import { getRepoManifest, upsertRepoManifest } from './patService.ts';

export interface ShowcaseRepoMeta {
  id: string;
  ownerId: string;
  ownerUsername: string;
  name: string;
  slug: string;
  fullName: string;
  description: string;
  visibility: 'public';
  defaultBranch: string;
  topics: string[];
  license: string;
  primaryLanguage: string;
  starsCount: number;
  forksCount: number;
  watchersCount: number;
  openIssuesCount: number;
  liveUrl?: string;
}

export const SHOWCASE_REPOS: ShowcaseRepoMeta[] = [
  {
    id: 'showcase-orbit-ui',
    ownerId: 'soul-labs-system',
    ownerUsername: 'soul-labs',
    name: 'orbit-ui',
    slug: 'orbit-ui',
    fullName: 'soul-labs/orbit-ui',
    description: 'Zero-dependency accessible design primitives and dark-first engineering tokens for SOUL HUB applications.',
    visibility: 'public',
    defaultBranch: 'main',
    topics: ['typescript', 'design-system', 'accessibility', 'css'],
    license: 'MIT',
    primaryLanguage: 'TypeScript',
    starsCount: 42,
    forksCount: 7,
    watchersCount: 12,
    openIssuesCount: 2,
  },
  {
    id: 'showcase-hyperion-git',
    ownerId: 'soul-labs-system',
    ownerUsername: 'soul-labs',
    name: 'hyperion-git',
    slug: 'hyperion-git',
    fullName: 'soul-labs/hyperion-git',
    description: 'Stateless Git Smart HTTP transport router and packfile stream inspector written in Node.js.',
    visibility: 'public',
    defaultBranch: 'main',
    topics: ['git', 'http-protocol', 'nodejs', 'devtools'],
    license: 'Apache-2.0',
    primaryLanguage: 'TypeScript',
    starsCount: 29,
    forksCount: 4,
    watchersCount: 9,
    openIssuesCount: 1,
  },
  {
    id: 'showcase-quantum-docs',
    ownerId: 'soul-labs-system',
    ownerUsername: 'soul-labs',
    name: 'quantum-docs',
    slug: 'quantum-docs',
    fullName: 'soul-labs/quantum-docs',
    description: 'Static documentation starter site pre-deployed through the SOUL HUB static publishing pipeline.',
    visibility: 'public',
    defaultBranch: 'main',
    topics: ['documentation', 'static-site', 'html', 'css'],
    license: 'MIT',
    primaryLanguage: 'HTML',
    starsCount: 18,
    forksCount: 5,
    watchersCount: 6,
    openIssuesCount: 0,
    liveUrl: '/sites/soul-labs/quantum-docs/',
  },
];

export async function ensureShowcaseReposSeeded(): Promise<void> {
  // 1. soul-labs/orbit-ui
  if (!repoExistsOnDisk('soul-labs', 'orbit-ui')) {
    await initBareRepo(
      'soul-labs',
      'orbit-ui',
      'main',
      [
        {
          path: 'README.md',
          content: `# Orbit UI\n\nAccessible, dark-first UI primitives built by **Soumadip Orbit Universal Labs (SOUL)**.\n\n## Features\n\n- Strict WCAG AA contrast tokens\n- Keyboard-first command palette & focus rings\n- Zero pill-clutter metadata formatting\n\n\`\`\`ts\nimport { createOrbitTheme } from './src/tokens';\nconst theme = createOrbitTheme('midnight');\n\`\`\`\n`,
        },
        {
          path: 'package.json',
          content: JSON.stringify(
            { name: '@soul-labs/orbit-ui', version: '1.2.0', license: 'MIT', main: 'src/index.ts' },
            null,
            2
          ),
        },
        {
          path: 'src/tokens.ts',
          content: `export interface OrbitThemeTokens {\n  canvas: string;\n  surface: string;\n  border: string;\n  accent: string;\n  textPrimary: string;\n  textMuted: string;\n}\n\nexport function createOrbitTheme(mode: 'midnight' | 'daylight'): OrbitThemeTokens {\n  if (mode === 'daylight') {\n    return {\n      canvas: '#F8FAFC',\n      surface: '#FFFFFF',\n      border: '#E2E8F0',\n      accent: '#2563EB',\n      textPrimary: '#0F172A',\n      textMuted: '#475569',\n    };\n  }\n  return {\n    canvas: '#07090F',\n    surface: '#0E121B',\n    border: '#1E293B',\n    accent: '#3B82F6',\n    textPrimary: '#F1F5F9',\n    textMuted: '#94A3B8',\n  };\n}\n`,
        },
        {
          path: 'src/index.ts',
          content: `export { createOrbitTheme } from './tokens';\nexport type { OrbitThemeTokens } from './tokens';\n`,
        },
        {
          path: '.soulhub/workflows/ci.yml',
          content: `name: Orbit UI Verification\non: [push, pull_request]\njobs:\n  typecheck:\n    runs-on: ubuntu-latest\n    steps:\n      - name: Install dependencies\n        run: npm ci\n      - name: Typecheck\n        run: npm run lint\n`,
        },
      ],
      'Soumadip Orbit Labs',
      'engineering@soumadiporbit.dev'
    );
    await createBranch('soul-labs', 'orbit-ui', 'feat/contrast-tokens', 'main');
    await commitFiles(
      'soul-labs',
      'orbit-ui',
      'feat/contrast-tokens',
      'Add contrast ratio helper to Orbit tokens',
      [
        {
          action: 'upsert',
          path: 'src/contrast.ts',
          contentBase64: Buffer.from(
            `export function meetsAaContrast(ratio: number, isLargeText = false): boolean {\n  return ratio >= (isLargeText ? 3.0 : 4.5);\n}\n`,
            'utf8'
          ).toString('base64'),
        },
      ],
      'Soumadip Orbit Labs',
      'engineering@soumadiporbit.dev'
    );
    await createTag('soul-labs', 'orbit-ui', 'v1.2.0', 'main', 'Orbit UI v1.2.0 stable tokens', 'Soumadip Orbit Labs', 'engineering@soumadiporbit.dev');
  }

  // 2. soul-labs/hyperion-git
  if (!repoExistsOnDisk('soul-labs', 'hyperion-git')) {
    await initBareRepo(
      'soul-labs',
      'hyperion-git',
      'main',
      [
        {
          path: 'README.md',
          content: `# Hyperion Git Engine\n\nStateless Git Smart HTTP transport and object plumbing toolkit powering SOUL HUB.\n\n## Supported Operations\n\n- \`git-upload-pack\` (clone & fetch)\n- \`git-receive-pack\` (authenticated push)\n- 3-way merge conflict detection\n`,
        },
        {
          path: 'src/pktline.ts',
          content: `export function encodePktLine(payload: string): string {\n  const byteLen = Buffer.byteLength(payload, 'utf8') + 4;\n  return byteLen.toString(16).padStart(4, '0') + payload;\n}\n\nexport const FLUSH_PKT = '0000';\n`,
        },
      ],
      'Soumadip Orbit Labs',
      'engineering@soumadiporbit.dev'
    );
    await createTag('soul-labs', 'hyperion-git', 'v0.9.4', 'main', 'Initial Smart HTTP parser', 'Soumadip Orbit Labs', 'engineering@soumadiporbit.dev');
  }

  // 3. soul-labs/quantum-docs (with live deployed static site!)
  if (!repoExistsOnDisk('soul-labs', 'quantum-docs')) {
    await initBareRepo(
      'soul-labs',
      'quantum-docs',
      'main',
      [
        {
          path: 'README.md',
          content: `# Quantum Docs Starter\n\nLive static site hosted directly from this SOUL HUB repository at \`/sites/soul-labs/quantum-docs/\`.\n`,
        },
        {
          path: 'public/index.html',
          content: `<!doctype html>\n<html lang="en">\n<head>\n  <meta charset="utf-8" />\n  <meta name="viewport" content="width=device-width, initial-scale=1" />\n  <title>Quantum Docs — Hosted on SOUL HUB</title>\n  <link rel="stylesheet" href="./styles.css" />\n</head>\n<body>\n  <main class="shell">\n    <p class="eyebrow">SOUL HUB Static Hosting</p>\n    <h1>Quantum Documentation Starter</h1>\n    <p class="lead">This page is built and served directly from commit history in <code>soul-labs/quantum-docs</code> on the <code>main</code> branch.</p>\n    <div class="grid">\n      <article class="card"><h2>Zero External Hosts</h2><p>Published inside the SOUL HUB deployment pipeline with rollback support.</p></article>\n      <article class="card"><h2>Git-Backed</h2><p>Every deployment links to an exact Git commit SHA and branch snapshot.</p></article>\n    </div>\n  </main>\n</body>\n</html>\n`,
        },
        {
          path: 'public/styles.css',
          content: `body { margin: 0; font-family: system-ui, sans-serif; background: #07090f; color: #e2e8f0; }\n.shell { max-width: 820px; margin: 4rem auto; padding: 0 1.5rem; }\n.eyebrow { color: #60a5fa; font-size: 0.85rem; font-weight: 600; letter-spacing: 0.04em; }\nh1 { font-size: 2.25rem; margin: 0.5rem 0 1rem; }\n.lead { color: #94a3b8; line-height: 1.6; }\n.grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(260px, 1fr)); gap: 1rem; margin-top: 2rem; }\n.card { background: #0e121b; border: 1px solid #1e293b; border-radius: 10px; padding: 1.25rem; }\n.card h2 { margin-top: 0; font-size: 1.1rem; }\n.card p { color: #94a3b8; font-size: 0.95rem; margin-bottom: 0; }\ncode { background: #1e293b; padding: 0.15rem 0.4rem; border-radius: 4px; }\n`,
        },
      ],
      'Soumadip Orbit Labs',
      'engineering@soumadiporbit.dev'
    );
    await deployStaticSiteFromGit('soul-labs', 'quantum-docs', 'main', 'public');
  }

  for (const repo of SHOWCASE_REPOS) {
    if (!getRepoManifest(repo.ownerUsername, repo.slug)) {
      upsertRepoManifest({
        repoId: repo.id,
        ownerId: repo.ownerId,
        ownerUsername: repo.ownerUsername,
        slug: repo.slug,
        fullName: repo.fullName,
        visibility: repo.visibility,
        memberIds: [],
        protectedBranches: ['main'],
        defaultBranch: repo.defaultBranch,
        description: repo.description,
        primaryLanguage: repo.primaryLanguage,
        topics: repo.topics,
        updatedAt: new Date().toISOString(),
      });
    }
  }
}
