import { useState } from 'react';
import { FolderGit2, Lock, Unlock } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { gitApi } from '../lib/api';
import { firestoreRepo } from '../lib/firestoreRepo';
import { Link, useRouter } from '../lib/router';
import { isValidBranchOrTagName, isValidRepoSlug, slugifyRepoName } from '../lib/validation';

export function NewRepoPage() {
  const { firebaseUser, profile } = useAuth();
  const { pushToast } = useToast();
  const { navigate } = useRouter();

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [visibility, setVisibility] = useState<'public' | 'private'>('public');
  const [defaultBranch, setDefaultBranch] = useState('main');
  const [initReadme, setInitReadme] = useState(true);
  const [gitignoreTemplate, setGitignoreTemplate] = useState('Node');
  const [licenseTemplate, setLicenseTemplate] = useState('MIT');
  const [topicsInput, setTopicsInput] = useState('');
  const [website, setWebsite] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  if (!firebaseUser || !profile) {
    return (
      <div className="max-w-xl mx-auto px-6 py-16 text-center">
        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0D111A] p-8">
          <FolderGit2 className="w-8 h-8 text-blue-500 mx-auto" />
          <h1 className="mt-4 text-xl font-bold text-slate-900 dark:text-slate-100">Sign in to create a repository</h1>
          <p className="mt-2 text-sm text-slate-600 dark:text-slate-400">
            Repositories initialize a real bare Git repository on the server and require a verified developer account.
          </p>
          <Link
            to="/login"
            className="mt-6 inline-block px-5 py-2.5 rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-500"
          >
            Sign in with Google
          </Link>
        </div>
      </div>
    );
  }

  const slug = slugifyRepoName(name);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');
    if (!isValidRepoSlug(slug)) {
      setErrorMsg('Repository name must produce a valid lowercase slug (letters, numbers, hyphens, dots).');
      return;
    }
    if (!isValidBranchOrTagName(defaultBranch)) {
      setErrorMsg('Invalid default branch name.');
      return;
    }

    setSubmitting(true);
    try {
      const repoId = `repo_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
      const topics = topicsInput
        .split(',')
        .map((t) => t.trim().toLowerCase())
        .filter(Boolean)
        .slice(0, 10);

      await gitApi.initRepo({
        repoId,
        ownerUsername: profile.username,
        name: name.trim(),
        slug,
        description: description.trim(),
        visibility,
        defaultBranch: defaultBranch.trim(),
        initReadme,
        gitignoreTemplate,
        licenseTemplate,
        topics,
      });

      await firestoreRepo.createRepository({
        id: repoId,
        ownerId: firebaseUser.uid,
        ownerUsername: profile.username,
        name: name.trim(),
        slug,
        fullName: `${profile.username}/${slug}`,
        description: description.trim(),
        visibility,
        defaultBranch: defaultBranch.trim(),
        topics,
        website: website.trim(),
        license: licenseTemplate === 'None' ? '' : licenseTemplate,
        primaryLanguage: gitignoreTemplate === 'Python' ? 'Python' : gitignoreTemplate === 'Rust' ? 'Rust' : gitignoreTemplate === 'Go' ? 'Go' : 'TypeScript',
        isTemplate: false,
        sizeBytes: 0,
      });

      await firestoreRepo.logActivity({
        actorId: firebaseUser.uid,
        actorUsername: profile.username,
        type: 'repo_created',
        repoId,
        repoFullName: `${profile.username}/${slug}`,
        summary: `initialized ${visibility} repository ${profile.username}/${slug}`,
        visibility,
      });

      pushToast({ type: 'success', title: 'Repository created', message: `${profile.username}/${slug} is ready.` });
      navigate(`/repo/${profile.username}/${slug}`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to create repository.';
      setErrorMsg(msg);
      pushToast({ type: 'error', title: 'Creation failed', message: msg });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="max-w-2xl mx-auto px-6 py-10">
      <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0D111A] p-8">
        <h1 className="font-display text-2xl font-bold text-slate-950 dark:text-white">Create a new repository</h1>
        <p className="mt-1.5 text-sm text-slate-600 dark:text-slate-400">
          Initializes a real bare Git repository on disk with Smart HTTP transport and Firestore collaboration tracking.
        </p>

        {errorMsg && (
          <div role="alert" className="mt-5 rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-xs text-red-600 dark:text-red-300">
            {errorMsg}
          </div>
        )}

        <form onSubmit={handleSubmit} className="mt-6 space-y-5">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1.5">Owner</label>
              <input
                type="text"
                readOnly
                value={`@${profile.username}`}
                className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-100 dark:bg-slate-900 text-sm text-slate-600 dark:text-slate-300"
              />
            </div>
            <div className="sm:col-span-2">
              <label htmlFor="repo-name" className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                Repository Name
              </label>
              <input
                id="repo-name"
                type="text"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="orbital-engine"
                className="w-full px-3.5 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#07090F] text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              {slug && <p className="mt-1 text-xs font-mono text-slate-500">Slug: {profile.username}/{slug}</p>}
            </div>
          </div>

          <div>
            <label htmlFor="repo-desc" className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5">
              Description (optional)
            </label>
            <input
              id="repo-desc"
              type="text"
              maxLength={500}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Short summary of what this repository builds..."
              className="w-full px-3.5 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#07090F] text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <fieldset className="space-y-2.5">
            <legend className="text-xs font-medium text-slate-700 dark:text-slate-300">Visibility</legend>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => setVisibility('public')}
                className={`p-3.5 rounded-lg border text-left transition-colors ${
                  visibility === 'public'
                    ? 'border-blue-500 bg-blue-500/10'
                    : 'border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700'
                }`}
              >
                <div className="flex items-center gap-2 text-sm font-medium text-slate-900 dark:text-slate-100">
                  <Unlock className="w-4 h-4 text-blue-500" />
                  <span>Public</span>
                </div>
                <p className="mt-1 text-xs text-slate-500">Anyone can browse code and clone over HTTP.</p>
              </button>
              <button
                type="button"
                onClick={() => setVisibility('private')}
                className={`p-3.5 rounded-lg border text-left transition-colors ${
                  visibility === 'private'
                    ? 'border-blue-500 bg-blue-500/10'
                    : 'border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700'
                }`}
              >
                <div className="flex items-center gap-2 text-sm font-medium text-slate-900 dark:text-slate-100">
                  <Lock className="w-4 h-4 text-violet-500" />
                  <span>Private</span>
                </div>
                <p className="mt-1 text-xs text-slate-500">Only you and authorized collaborators can read or clone.</p>
              </button>
            </div>
          </fieldset>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label htmlFor="default-branch" className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                Default Branch
              </label>
              <input
                id="default-branch"
                type="text"
                value={defaultBranch}
                onChange={(e) => setDefaultBranch(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#07090F] text-sm font-mono"
              />
            </div>
            <div>
              <label htmlFor="gitignore-tpl" className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                .gitignore Template
              </label>
              <select
                id="gitignore-tpl"
                value={gitignoreTemplate}
                onChange={(e) => setGitignoreTemplate(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#07090F] text-sm"
              >
                <option value="Node">Node / TypeScript</option>
                <option value="Python">Python</option>
                <option value="Rust">Rust</option>
                <option value="Go">Go</option>
                <option value="None">None</option>
              </select>
            </div>
            <div>
              <label htmlFor="license-tpl" className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                License
              </label>
              <select
                id="license-tpl"
                value={licenseTemplate}
                onChange={(e) => setLicenseTemplate(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#07090F] text-sm"
              >
                <option value="MIT">MIT</option>
                <option value="Apache-2.0">Apache-2.0</option>
                <option value="GPL-3.0">GPL-3.0</option>
                <option value="None">None</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label htmlFor="repo-topics" className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                Topics (comma-separated)
              </label>
              <input
                id="repo-topics"
                type="text"
                value={topicsInput}
                onChange={(e) => setTopicsInput(e.target.value)}
                placeholder="typescript, git, devtools"
                className="w-full px-3.5 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#07090F] text-sm"
              />
            </div>
            <div>
              <label htmlFor="repo-website" className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                Website URL (optional)
              </label>
              <input
                id="repo-website"
                type="url"
                value={website}
                onChange={(e) => setWebsite(e.target.value)}
                placeholder="https://example.com"
                className="w-full px-3.5 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#07090F] text-sm"
              />
            </div>
          </div>

          <label className="flex items-center gap-2.5 text-sm text-slate-700 dark:text-slate-300">
            <input
              type="checkbox"
              checked={initReadme}
              onChange={(e) => setInitReadme(e.target.checked)}
              className="rounded border-slate-300 dark:border-slate-700"
            />
            <span>Initialize repository with README.md</span>
          </label>

          <div className="pt-2 flex justify-end gap-3">
            <Link
              to="/dashboard"
              className="px-4 py-2.5 rounded-lg border border-slate-300 dark:border-slate-700 text-sm font-medium text-slate-700 dark:text-slate-300"
            >
              Cancel
            </Link>
            <button
              type="submit"
              disabled={submitting}
              className="px-5 py-2.5 rounded-lg bg-blue-600 text-white text-sm font-semibold hover:bg-blue-500 disabled:opacity-50 transition-colors"
            >
              {submitting ? 'Initializing Git Repository...' : 'Create Repository'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
