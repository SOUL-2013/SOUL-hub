import { useEffect, useState } from 'react';
import {
  Download,
  ExternalLink,
  Info,
  Monitor,
  Play,
  RefreshCw,
  Rocket,
  RotateCcw,
  Shield,
  Smartphone,
  Tag,
  Trash2,
} from 'lucide-react';
import { MarkdownView } from '../../components/MarkdownView';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { gitApi, type GitBranchInfo, type GitCommitInfo, type GitTagInfo } from '../../lib/api';
import { firestoreRepo } from '../../lib/firestoreRepo';
import { useRouter } from '../../lib/router';
import { formatBytes, parseWorkflowYamlSummary } from '../../lib/validation';
import type { DeploymentDoc, ReleaseDoc, RepositoryDoc, WorkflowRunDoc } from '../../types/domain';

const DEFAULT_WORKFLOW_YAML = `name: SOUL CI Pipeline
on:
  push:
  pull_request:
jobs:
  lint-and-test:
    runs-on: soul-runner-linux
    steps:
      - uses: checkout@v1
      - run: npm test
`;

export function RepoAutomationDeployTab({
  repo,
  mode,
  branches,
  tags,
  commits,
  langStats,
  protectedBranches,
  isOwner,
  onReload,
}: {
  repo: RepositoryDoc;
  mode: 'automation' | 'releases' | 'security' | 'settings';
  branches: GitBranchInfo[];
  tags: GitTagInfo[];
  commits: GitCommitInfo[];
  langStats: { totalBytes: number; languages: Array<{ language: string; bytes: number; percentage: number }> };
  protectedBranches: string[];
  isOwner: boolean;
  onReload: () => void;
}) {
  const { firebaseUser, profile } = useAuth();
  const { pushToast } = useToast();
  const { navigate } = useRouter();

  // Automation & Deployments
  const [deployments, setDeployments] = useState<DeploymentDoc[]>([]);
  const [workflowRuns, setWorkflowRuns] = useState<WorkflowRunDoc[]>([]);
  const [workflowYaml, setWorkflowYaml] = useState(DEFAULT_WORKFLOW_YAML);
  const [deployBranch, setDeployBranch] = useState(repo.defaultBranch || 'main');
  const [outputDir, setOutputDir] = useState('/');
  const [deployLog, setDeployLog] = useState('');
  const [previewViewport, setPreviewViewport] = useState<'desktop' | 'mobile'>('desktop');
  const [previewKey, setPreviewKey] = useState(0);

  // Releases
  const [releases, setReleases] = useState<ReleaseDoc[]>([]);
  const [relTag, setRelTag] = useState('v1.0.0');
  const [relTitle, setRelTitle] = useState('');
  const [relBody, setRelBody] = useState('');
  const [relPrerelease, setRelPrerelease] = useState(false);

  // Security & Advisories
  const [advisoryText, setAdvisoryText] = useState('');

  // Settings
  const [repoName, setRepoName] = useState(repo.name);
  const [repoDesc, setRepoDesc] = useState(repo.description || '');
  const [repoVisibility, setRepoVisibility] = useState<'public' | 'private'>(repo.visibility);
  const [repoWebsite, setRepoWebsite] = useState(repo.website || '');
  const [transferUsername, setTransferUsername] = useState('');
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);
  const [deleteSlugConfirm, setDeleteSlugConfirm] = useState('');

  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setRepoName(repo.name);
    setRepoDesc(repo.description || '');
    setRepoVisibility(repo.visibility);
    setRepoWebsite(repo.website || '');
  }, [repo]);

  useEffect(() => {
    if (repo.isShowcase) return;
    const uid = firebaseUser?.uid;
    if (mode === 'automation') {
      Promise.all([
        firestoreRepo.listDeployments(repo.id, repo.visibility, uid),
        firestoreRepo.listWorkflowRuns(repo.id, repo.visibility, uid),
      ])
        .then(([deps, runs]) => {
          setDeployments(deps);
          setWorkflowRuns(runs);
        })
        .catch(() => {});
    } else if (mode === 'releases') {
      firestoreRepo
        .listReleases(repo.id, repo.visibility, uid)
        .then(setReleases)
        .catch(() => {});
    }
  }, [repo.id, mode, firebaseUser?.uid]);

  // -------------------------------------------------------
  // AUTOMATION & STATIC DEPLOYMENT
  // -------------------------------------------------------
  if (mode === 'automation') {
    const parsed = parseWorkflowYamlSummary(workflowYaml);

    const handleSaveWorkflow = async () => {
      if (!isOwner || repo.isShowcase || !firebaseUser) return;
      if (!parsed.valid) {
        pushToast({ type: 'error', title: 'Invalid Workflow YAML', message: parsed.error || 'Check workflow syntax.' });
        return;
      }
      setBusy(true);
      try {
        await gitApi.commitFiles(repo.ownerUsername, repo.slug, {
          branch: deployBranch,
          message: `Configure ${parsed.name} workflow`,
          files: [
            {
              action: 'upsert',
              path: '.soulhub/workflows/ci.yml',
              contentBase64: btoa(unescape(encodeURIComponent(workflowYaml))),
            },
          ],
        });
        const run = await firestoreRepo.createWorkflowRun(repo, {
          workflowName: parsed.name,
          trigger: 'manual',
          branch: deployBranch,
          status: 'queued_external_runner',
          summary: `Validated jobs [${parsed.jobs.join(', ')}]. Awaiting external isolated runner.`,
          authorId: firebaseUser.uid,
        });
        setWorkflowRuns((prev) => [run, ...prev]);
        pushToast({ type: 'success', title: 'Workflow saved to Git', message: '.soulhub/workflows/ci.yml committed' });
      } catch (err) {
        pushToast({ type: 'error', title: 'Workflow save failed', message: err instanceof Error ? err.message : 'Error' });
      } finally {
        setBusy(false);
      }
    };

    const handleDeployStatic = async (e: React.FormEvent) => {
      e.preventDefault();
      if (!isOwner || !firebaseUser || !profile) return;
      setBusy(true);
      try {
        const res = await gitApi.deploySite(repo.ownerUsername, repo.slug, deployBranch, outputDir.trim() || '/');
        setDeployLog(res.buildLogs);
        if (!repo.isShowcase) {
          await firestoreRepo.recordDeployment(repo, {
            deploymentId: res.deploymentId,
            branch: deployBranch,
            outputDir: outputDir.trim() || '/',
            commitSha: res.commitSha,
            status: res.status,
            url: res.previewUrl,
            buildLogs: res.buildLogs,
            authorId: firebaseUser.uid,
          });
          await firestoreRepo.logActivity({
            actorId: firebaseUser.uid,
            actorUsername: profile.username,
            type: 'repo_deployed',
            repoId: repo.id,
            repoFullName: repo.fullName,
            summary: `Deployed ${repo.fullName} (${deployBranch}) to ${res.url}`,
            visibility: repo.visibility,
          });
          const updated = await firestoreRepo.listDeployments(repo.id, repo.visibility, firebaseUser.uid);
          setDeployments(updated);
        }
        pushToast({ type: 'success', title: 'Static site deployed', message: `Live at ${res.url}` });
      } catch (err) {
        pushToast({ type: 'error', title: 'Deployment failed', message: err instanceof Error ? err.message : 'Error' });
      } finally {
        setBusy(false);
      }
    };

    const handleRollback = async (dep: DeploymentDoc) => {
      setBusy(true);
      try {
        const res = await gitApi.rollbackSite(repo.ownerUsername, repo.slug, dep.id);
        await firestoreRepo.updateDeploymentStatus(repo.id, dep.id, 'live');
        pushToast({ type: 'success', title: 'Rolled back deployment', message: `Active site restored at ${res.url}` });
        const updated = await firestoreRepo.listDeployments(repo.id, repo.visibility, firebaseUser?.uid);
        setDeployments(updated);
      } catch (err) {
        pushToast({ type: 'error', title: 'Rollback failed', message: err instanceof Error ? err.message : 'Error' });
      } finally {
        setBusy(false);
      }
    };

    return (
      <div className="space-y-8">
        {/* Static Site Deployment Engine */}
        <section className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0D111A] p-6 space-y-5">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <h2 className="text-base font-semibold text-slate-950 dark:text-white flex items-center gap-2">
                <Rocket className="w-4 h-4 text-blue-500" />
                <span>Static Website Deployment</span>
              </h2>
              <p className="text-xs text-slate-500 mt-1">
                Extracts HTML/CSS/JS assets directly from your Git repository branch and serves them on{' '}
                <code className="font-mono">/sites/{repo.ownerUsername}/{repo.slug}/</code> (20 MB limit).
              </p>
            </div>
            {repo.liveUrl && (
              <a
                href={repo.liveUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-600 text-white text-xs font-medium hover:bg-emerald-500"
              >
                <ExternalLink className="w-3.5 h-3.5" />
                <span>Open Live Site</span>
              </a>
            )}
          </div>

          {isOwner && !repo.isShowcase ? (
            <form onSubmit={handleDeployStatic} className="grid grid-cols-1 md:grid-cols-3 gap-3 items-end">
              <div>
                <label className="block text-xs font-medium text-slate-500 mb-1">Source Branch</label>
                <select
                  value={deployBranch}
                  onChange={(e) => setDeployBranch(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-[#07090F] text-xs font-mono"
                >
                  {branches.map((b) => (
                    <option key={b.name} value={b.name}>{b.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-500 mb-1">Output Directory</label>
                <input
                  type="text"
                  value={outputDir}
                  onChange={(e) => setOutputDir(e.target.value)}
                  placeholder="/ or /dist or /public"
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-[#07090F] text-xs font-mono"
                />
              </div>
              <button
                type="submit"
                disabled={busy}
                className="px-4 py-2 rounded-lg bg-blue-600 text-white text-xs font-medium hover:bg-blue-500 disabled:opacity-50"
              >
                {busy ? 'Deploying...' : 'Deploy Static Site'}
              </button>
            </form>
          ) : (
            <p className="text-xs text-slate-500">
              {repo.isShowcase
                ? 'Showcase site deployment is pre-published. Fork this repository to deploy your own branches.'
                : 'Only repository owners and maintainers can trigger deployments.'}
            </p>
          )}

          {deployLog && (
            <pre className="p-4 rounded-lg bg-slate-950 text-slate-200 text-xs font-mono overflow-x-auto whitespace-pre-wrap">
              {deployLog}
            </pre>
          )}

          {deployments.length > 0 && (
            <div className="divide-y divide-slate-200 dark:divide-slate-800 border-t border-slate-200 dark:border-slate-800 pt-3">
              {deployments.map((d) => (
                <div key={d.id} className="py-3 flex flex-wrap items-center justify-between gap-3 text-xs">
                  <div>
                    <p className="font-medium text-slate-900 dark:text-slate-100">
                      <span className="font-mono">{d.branch}</span> ({d.outputDir}) ·{' '}
                      <span className="font-mono text-slate-400">{d.commitSha.slice(0, 7)}</span>
                    </p>
                    <a href={d.url} target="_blank" rel="noopener noreferrer" className="text-blue-500 hover:underline">
                      {d.url}
                    </a>
                  </div>
                  {isOwner && (
                    <button
                      type="button"
                      onClick={() => void handleRollback(d)}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800"
                    >
                      <RotateCcw className="w-3.5 h-3.5" />
                      <span>Rollback to release</span>
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
          {(repo.liveUrl || deployments.find((d) => d.status === 'live')) && (
            <div className="rounded-xl border border-slate-200 dark:border-slate-800 overflow-hidden bg-slate-50 dark:bg-[#07090F]">
              <div className="px-3.5 py-2.5 border-b border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-2 bg-white dark:bg-[#0B0F18]">
                <div className="flex items-center gap-2 min-w-0">
                  <span className="w-2 h-2 rounded-full bg-emerald-500 shrink-0" />
                  <span className="text-xs font-mono text-slate-600 dark:text-slate-300 truncate">
                    {repo.liveUrl || deployments.find((d) => d.status === 'live')?.url}
                  </span>
                </div>
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => setPreviewViewport('desktop')}
                    aria-label="Desktop preview"
                    className={`p-1.5 rounded-md text-xs ${
                      previewViewport === 'desktop'
                        ? 'bg-blue-600 text-white'
                        : 'text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800'
                    }`}
                  >
                    <Monitor className="w-3.5 h-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => setPreviewViewport('mobile')}
                    aria-label="Mobile preview"
                    className={`p-1.5 rounded-md text-xs ${
                      previewViewport === 'mobile'
                        ? 'bg-blue-600 text-white'
                        : 'text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800'
                    }`}
                  >
                    <Smartphone className="w-3.5 h-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => setPreviewKey((k) => k + 1)}
                    aria-label="Reload preview"
                    className="p-1.5 rounded-md text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"
                  >
                    <RefreshCw className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
              <div className="p-4 flex justify-center bg-slate-100 dark:bg-[#05070B]">
                <iframe
                  key={previewKey}
                  title="Deployed site live browser preview"
                  src={repo.liveUrl || deployments.find((d) => d.status === 'live')?.url}
                  className={`bg-white rounded-lg border border-slate-200 dark:border-slate-800 transition-all ${
                    previewViewport === 'mobile' ? 'w-[390px] h-[520px]' : 'w-full h-[460px]'
                  }`}
                />
              </div>
            </div>
          )}
        </section>

        {/* CI/CD Workflow Configuration */}
        <section className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0D111A] p-6 space-y-4">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <h2 className="text-base font-semibold text-slate-950 dark:text-white">CI/CD Workflow Pipelines</h2>
              <p className="text-xs text-slate-500 mt-1">
                Define <code className="font-mono">.soulhub/workflows/ci.yml</code> and validate pipeline jobs.
              </p>
            </div>
            {isOwner && !repo.isShowcase && (
              <button
                type="button"
                disabled={busy}
                onClick={() => void handleSaveWorkflow()}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-blue-600 text-white text-xs font-medium hover:bg-blue-500"
              >
                <Play className="w-3.5 h-3.5" />
                <span>Validate & Commit Workflow</span>
              </button>
            )}
          </div>

          <div className="rounded-lg border border-blue-500/30 bg-blue-500/8 p-3.5 flex items-start gap-2.5 text-xs text-slate-600 dark:text-slate-300">
            <Info className="w-4 h-4 text-blue-500 shrink-0 mt-0.5" />
            <span>
              <strong>Runner Transparency:</strong> Google AI Studio preview runs inside a single application container without isolated Docker-in-Docker sandboxes. SOUL HUB validates and commits real YAML pipeline definitions and queues run records for external runners rather than faking arbitrary shell container execution.
            </span>
          </div>

          <textarea
            rows={10}
            value={workflowYaml}
            onChange={(e) => setWorkflowYaml(e.target.value)}
            readOnly={!isOwner || repo.isShowcase}
            className="w-full px-4 py-3 rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-[#07090F] font-mono text-xs leading-5"
          />

          <div className="text-xs text-slate-500">
            {parsed.valid ? (
              <span>
                Parsed workflow: <strong className="text-slate-800 dark:text-slate-200">{parsed.name}</strong> · Triggers:{' '}
                {parsed.triggers.join(', ')} · Jobs: {parsed.jobs.join(', ')}
              </span>
            ) : (
              <span className="text-red-500">{parsed.error}</span>
            )}
          </div>

          {workflowRuns.length > 0 && (
            <div className="divide-y divide-slate-200 dark:divide-slate-800 border-t border-slate-200 dark:border-slate-800 pt-3">
              {workflowRuns.map((run) => (
                <div key={run.id} className="py-2.5 flex items-center justify-between gap-4 text-xs">
                  <div>
                    <p className="font-medium text-slate-900 dark:text-slate-100">{run.workflowName}</p>
                    <p className="text-slate-500">{run.summary}</p>
                  </div>
                  <span className="font-mono text-amber-500">{run.status}</span>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    );
  }

  // -------------------------------------------------------
  // RELEASES & TAGS
  // -------------------------------------------------------
  if (mode === 'releases') {
    const handlePublishRelease = async (e: React.FormEvent) => {
      e.preventDefault();
      if (!isOwner || !firebaseUser || !profile || repo.isShowcase) return;
      if (!relTag.trim() || !relTitle.trim()) return;
      setBusy(true);
      try {
        await gitApi.createTag(repo.ownerUsername, repo.slug, relTag.trim(), repo.defaultBranch || 'main', relTitle.trim());
        const created = await firestoreRepo.createRelease(repo, {
          tagName: relTag.trim(),
          title: relTitle.trim(),
          body: relBody.trim(),
          isDraft: false,
          isPrerelease: relPrerelease,
          authorId: firebaseUser.uid,
          authorUsername: profile.username,
        });
        await firestoreRepo.logActivity({
          actorId: firebaseUser.uid,
          actorUsername: profile.username,
          type: 'release_published',
          repoId: repo.id,
          repoFullName: repo.fullName,
          summary: `Published release ${relTag.trim()} on ${repo.fullName}`,
          visibility: repo.visibility,
        });
        setReleases((prev) => [created, ...prev]);
        setRelTitle('');
        setRelBody('');
        onReload();
        pushToast({ type: 'success', title: 'Release published', message: relTag.trim() });
      } catch (err) {
        pushToast({ type: 'error', title: 'Release failed', message: err instanceof Error ? err.message : 'Error' });
      } finally {
        setBusy(false);
      }
    };

    return (
      <div className="space-y-6">
        {isOwner && !repo.isShowcase && (
          <form onSubmit={handlePublishRelease} className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0D111A] p-6 space-y-4">
            <h2 className="text-base font-semibold">Draft & Publish New Release</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <input
                type="text"
                required
                value={relTag}
                onChange={(e) => setRelTag(e.target.value)}
                placeholder="Tag version (e.g. v1.0.0)"
                className="px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-[#07090F] text-xs font-mono"
              />
              <input
                type="text"
                required
                value={relTitle}
                onChange={(e) => setRelTitle(e.target.value)}
                placeholder="Release title"
                className="px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-[#07090F] text-sm"
              />
            </div>
            <textarea
              rows={4}
              value={relBody}
              onChange={(e) => setRelBody(e.target.value)}
              placeholder="Release notes (Markdown supported)..."
              className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-[#07090F] text-sm"
            />
            <div className="flex items-center justify-between">
              <label className="inline-flex items-center gap-2 text-xs text-slate-500">
                <input type="checkbox" checked={relPrerelease} onChange={(e) => setRelPrerelease(e.target.checked)} />
                <span>This is a pre-release</span>
              </label>
              <button type="submit" disabled={busy} className="px-4 py-2 rounded-lg bg-blue-600 text-white text-xs font-medium">
                {busy ? 'Publishing...' : 'Publish Release'}
              </button>
            </div>
          </form>
        )}

        <div className="space-y-4">
          {releases.length === 0 && tags.length === 0 ? (
            <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0D111A] p-8 text-center text-sm text-slate-500">
              No releases or Git tags published yet.
            </div>
          ) : (
            <>
              {releases.map((rel) => (
                <div key={rel.id} className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0D111A] p-6 space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <h3 className="text-lg font-bold text-slate-950 dark:text-white">{rel.title}</h3>
                      <p className="text-xs text-slate-500 font-mono">
                        {rel.tagName} · @{rel.authorUsername}{rel.isPrerelease ? ' · pre-release' : ''}
                      </p>
                    </div>
                    <a
                      href={`/api/git/${encodeURIComponent(repo.ownerUsername)}/${encodeURIComponent(repo.slug)}/archive/${encodeURIComponent(rel.tagName)}.zip`}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 text-xs font-medium"
                    >
                      <Download className="w-3.5 h-3.5" />
                      <span>Source ZIP ({rel.tagName})</span>
                    </a>
                  </div>
                  {rel.body && <MarkdownView content={rel.body} />}
                </div>
              ))}
              {tags.map((t) => (
                <div key={t.name} className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0D111A] p-4 flex items-center justify-between text-xs">
                  <div className="flex items-center gap-2 font-mono">
                    <Tag className="w-3.5 h-3.5 text-blue-500" />
                    <span className="font-semibold">{t.name}</span>
                    <span className="text-slate-400">{t.sha.slice(0, 7)}</span>
                  </div>
                  <a
                    href={`/api/git/${encodeURIComponent(repo.ownerUsername)}/${encodeURIComponent(repo.slug)}/archive/${encodeURIComponent(t.name)}.zip`}
                    className="text-blue-600 dark:text-blue-400 hover:underline"
                  >
                    Download ZIP
                  </a>
                </div>
              ))}
            </>
          )}
        </div>
      </div>
    );
  }

  // -------------------------------------------------------
  // SECURITY & INSIGHTS
  // -------------------------------------------------------
  if (mode === 'security') {
    const toggleProtectedBranch = async (branchName: string) => {
      if (!isOwner) return;
      const next = protectedBranches.includes(branchName)
        ? protectedBranches.filter((b) => b !== branchName)
        : [...protectedBranches, branchName];
      try {
        await gitApi.updateManifest(repo.ownerUsername, repo.slug, { protectedBranches: next });
        onReload();
        pushToast({ type: 'success', title: 'Branch protection updated', message: `${branchName} updated` });
      } catch (err) {
        pushToast({ type: 'error', title: 'Update failed', message: err instanceof Error ? err.message : 'Error' });
      }
    };

    const handleSubmitAdvisory = async (e: React.FormEvent) => {
      e.preventDefault();
      if (!firebaseUser || !advisoryText.trim()) return;
      setBusy(true);
      try {
        await firestoreRepo.createReport({
          reporterId: firebaseUser.uid,
          targetType: 'security_advisory',
          targetId: repo.id,
          reason: advisoryText.trim(),
        });
        setAdvisoryText('');
        pushToast({ type: 'success', title: 'Security advisory submitted', message: 'Platform maintainers will review your report.' });
      } catch (err) {
        pushToast({ type: 'error', title: 'Submission failed', message: err instanceof Error ? err.message : 'Error' });
      } finally {
        setBusy(false);
      }
    };

    return (
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0D111A] p-6 space-y-4">
          <h2 className="text-base font-semibold flex items-center gap-2">
            <Shield className="w-4 h-4 text-blue-500" />
            <span>Branch Protection & Policy</span>
          </h2>
          <p className="text-xs text-slate-500">
            Protected branches block direct deletion and require explicit pull request merges.
          </p>
          <div className="divide-y divide-slate-200 dark:divide-slate-800">
            {branches.map((b) => {
              const isProt = protectedBranches.includes(b.name);
              return (
                <div key={b.name} className="py-3 flex items-center justify-between text-xs">
                  <span className="font-mono font-medium">{b.name}</span>
                  {isOwner && !repo.isShowcase ? (
                    <button
                      type="button"
                      onClick={() => void toggleProtectedBranch(b.name)}
                      className={`px-3 py-1 rounded border font-medium ${
                        isProt
                          ? 'border-emerald-500/40 text-emerald-600 dark:text-emerald-400'
                          : 'border-slate-300 dark:border-slate-700 text-slate-500'
                      }`}
                    >
                      {isProt ? 'Protected' : 'Unprotected'}
                    </button>
                  ) : (
                    <span className="text-slate-400">{isProt ? 'Protected' : 'Standard'}</span>
                  )}
                </div>
              );
            })}
          </div>

          <div className="pt-4 border-t border-slate-200 dark:border-slate-800 space-y-2 text-xs">
            <h3 className="font-semibold text-slate-900 dark:text-slate-100">Repository Insights</h3>
            <p className="text-slate-500 tabular-nums">
              Total tracked source size: {formatBytes(langStats.totalBytes)} · Recent commits analyzed: {commits.length}
            </p>
            <div className="space-y-1.5 pt-1">
              {langStats.languages.map((l) => (
                <div key={l.language} className="flex items-center gap-3">
                  <span className="w-24 truncate text-slate-600 dark:text-slate-300">{l.language}</span>
                  <div className="flex-1 h-2 rounded-full bg-slate-200 dark:bg-slate-800 overflow-hidden">
                    <div className="h-full bg-blue-500" style={{ width: `${l.percentage}%` }} />
                  </div>
                  <span className="w-12 text-right font-mono text-slate-400 tabular-nums">{l.percentage}%</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0D111A] p-6 space-y-4">
          <h2 className="text-base font-semibold">Report Security Vulnerability</h2>
          <p className="text-xs text-slate-500">
            Privately report dependency risks, leaked credentials, or vulnerabilities for {repo.fullName}.
          </p>
          <form onSubmit={handleSubmitAdvisory} className="space-y-3">
            <textarea
              rows={5}
              required
              minLength={5}
              value={advisoryText}
              onChange={(e) => setAdvisoryText(e.target.value)}
              placeholder="Describe the security finding, affected path, and reproduction steps..."
              className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-[#07090F] text-sm"
            />
            <button
              type="submit"
              disabled={busy || !firebaseUser}
              className="px-4 py-2 rounded-lg bg-blue-600 text-white text-xs font-medium disabled:opacity-50"
            >
              {firebaseUser ? 'Submit Security Report' : 'Sign in to report'}
            </button>
          </form>
        </div>
      </div>
    );
  }

  // -------------------------------------------------------
  // REPOSITORY SETTINGS (OWNER ONLY)
  // -------------------------------------------------------
  const handleSaveSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isOwner || repo.isShowcase) return;
    setBusy(true);
    try {
      await firestoreRepo.updateRepository(repo.id, {
        name: repoName.trim(),
        description: repoDesc.trim(),
        visibility: repoVisibility,
        website: repoWebsite.trim(),
      });
      await gitApi.updateManifest(repo.ownerUsername, repo.slug, { visibility: repoVisibility });
      onReload();
      pushToast({ type: 'success', title: 'Repository settings saved' });
    } catch (err) {
      pushToast({ type: 'error', title: 'Save failed', message: err instanceof Error ? err.message : 'Error' });
    } finally {
      setBusy(false);
    }
  };

  const handleToggleArchive = async () => {
    if (!isOwner || repo.isShowcase) return;
    await firestoreRepo.updateRepository(repo.id, { isArchived: !repo.isArchived });
    onReload();
    pushToast({ type: 'success', title: repo.isArchived ? 'Repository unarchived' : 'Repository archived' });
  };

  const handleTransferOwnership = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isOwner || !transferUsername.trim() || repo.isShowcase) return;
    setBusy(true);
    try {
      const targetProfile = await firestoreRepo.getProfileByUsername(transferUsername.trim().toLowerCase());
      if (!targetProfile) {
        pushToast({ type: 'error', title: 'User not found', message: `No user @${transferUsername.trim()} exists.` });
        return;
      }
      await firestoreRepo.updateRepository(repo.id, {
        ownerId: targetProfile.uid,
        ownerUsername: targetProfile.username,
        fullName: `${targetProfile.username}/${repo.slug}`,
      });
      pushToast({ type: 'success', title: 'Ownership transferred', message: `Transferred metadata to @${targetProfile.username}` });
      navigate(`/repo/${targetProfile.username}/${repo.slug}`);
    } catch (err) {
      pushToast({ type: 'error', title: 'Transfer failed', message: err instanceof Error ? err.message : 'Error' });
    } finally {
      setBusy(false);
    }
  };

  const handleDeleteRepo = async () => {
    if (!isOwner || deleteSlugConfirm !== repo.slug || repo.isShowcase) return;
    setBusy(true);
    try {
      await gitApi.deleteRepo(repo.ownerUsername, repo.slug);
      await firestoreRepo.deleteRepository(repo.id);
      pushToast({ type: 'success', title: 'Repository deleted' });
      navigate('/dashboard');
    } catch (err) {
      pushToast({ type: 'error', title: 'Delete failed', message: err instanceof Error ? err.message : 'Error' });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="max-w-3xl space-y-6">
      <form onSubmit={handleSaveSettings} className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0D111A] p-6 space-y-4">
        <h2 className="text-base font-semibold">General Settings</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-medium text-slate-500 mb-1">Display Name</label>
            <input
              type="text"
              required
              value={repoName}
              onChange={(e) => setRepoName(e.target.value)}
              className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-[#07090F] text-sm"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-500 mb-1">Visibility</label>
            <select
              value={repoVisibility}
              onChange={(e) => setRepoVisibility(e.target.value as 'public' | 'private')}
              className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-[#07090F] text-sm"
            >
              <option value="public">Public</option>
              <option value="private">Private</option>
            </select>
          </div>
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-500 mb-1">Description</label>
          <input
            type="text"
            value={repoDesc}
            onChange={(e) => setRepoDesc(e.target.value)}
            className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-[#07090F] text-sm"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-500 mb-1">Website URL</label>
          <input
            type="url"
            value={repoWebsite}
            onChange={(e) => setRepoWebsite(e.target.value)}
            placeholder="https://..."
            className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-[#07090F] text-sm"
          />
        </div>
        <button type="submit" disabled={busy} className="px-4 py-2 rounded-lg bg-blue-600 text-white text-xs font-medium">
          Save Settings
        </button>
      </form>

      <div className="rounded-xl border border-red-500/30 bg-white dark:bg-[#0D111A] p-6 space-y-5">
        <h2 className="text-base font-semibold text-red-600 dark:text-red-400">Danger Zone</h2>

        <div className="flex flex-wrap items-center justify-between gap-4 pb-4 border-b border-slate-200 dark:border-slate-800">
          <div>
            <p className="text-sm font-medium">{repo.isArchived ? 'Unarchive repository' : 'Archive this repository'}</p>
            <p className="text-xs text-slate-500">Archived repositories remain readable but reject new browser commits.</p>
          </div>
          <button
            type="button"
            onClick={() => void handleToggleArchive()}
            className="px-3.5 py-2 rounded-lg border border-slate-300 dark:border-slate-700 text-xs font-medium"
          >
            {repo.isArchived ? 'Unarchive' : 'Archive'}
          </button>
        </div>

        <form onSubmit={handleTransferOwnership} className="flex flex-wrap items-end gap-3 pb-4 border-b border-slate-200 dark:border-slate-800">
          <div className="flex-1 min-w-[200px]">
            <label className="block text-xs font-medium text-slate-500 mb-1">Transfer ownership to username</label>
            <input
              type="text"
              value={transferUsername}
              onChange={(e) => setTransferUsername(e.target.value)}
              placeholder="target-username"
              className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-[#07090F] text-xs font-mono"
            />
          </div>
          <button type="submit" disabled={busy} className="px-3.5 py-2 rounded-lg border border-amber-500/40 text-amber-600 dark:text-amber-400 text-xs font-medium">
            Transfer Ownership
          </button>
        </form>

        <div className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <p className="text-sm font-medium text-red-600 dark:text-red-400">Delete this repository</p>
              <p className="text-xs text-slate-500">Permanently removes the Git bare repository on disk and Firestore metadata.</p>
            </div>
            <button
              type="button"
              onClick={() => setConfirmDeleteOpen((v) => !v)}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-red-600 text-white text-xs font-medium hover:bg-red-500"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>Delete Repository</span>
            </button>
          </div>
          {confirmDeleteOpen && (
            <div className="p-4 rounded-lg bg-red-500/10 border border-red-500/30 space-y-3">
              <p className="text-xs">
                Type <code className="font-mono font-bold">{repo.slug}</code> to confirm permanent deletion:
              </p>
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  value={deleteSlugConfirm}
                  onChange={(e) => setDeleteSlugConfirm(e.target.value)}
                  className="flex-1 px-3 py-1.5 rounded border border-red-500/40 bg-white dark:bg-[#07090F] text-xs font-mono"
                />
                <button
                  type="button"
                  disabled={deleteSlugConfirm !== repo.slug || busy}
                  onClick={() => void handleDeleteRepo()}
                  className="px-4 py-1.5 rounded bg-red-600 text-white text-xs font-medium disabled:opacity-40"
                >
                  Confirm Delete
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
