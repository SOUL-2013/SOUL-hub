import { useEffect, useState } from 'react';
import { Building2, Plus, Users } from 'lucide-react';
import { MarkdownView } from '../components/MarkdownView';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { firestoreRepo } from '../lib/firestoreRepo';
import { Link, useRouter } from '../lib/router';
import { slugifyRepoName } from '../lib/validation';
import type { OrganizationDoc, OrgMemberDoc, OrgTeamDoc } from '../types/domain';

export function OrganizationsPage({ slug }: { slug?: string }) {
  const { firebaseUser, profile } = useAuth();
  const { pushToast } = useToast();
  const { navigate } = useRouter();

  const [orgs, setOrgs] = useState<OrganizationDoc[]>([]);
  const [selectedOrg, setSelectedOrg] = useState<OrganizationDoc | null>(null);
  const [members, setMembers] = useState<OrgMemberDoc[]>([]);
  const [teams, setTeams] = useState<OrgTeamDoc[]>([]);
  const [loading, setLoading] = useState(true);

  const [createOpen, setCreateOpen] = useState(false);
  const [orgName, setOrgName] = useState('');
  const [orgDesc, setOrgDesc] = useState('');
  const [teamName, setTeamName] = useState('');
  const [teamPerm, setTeamPerm] = useState<'read' | 'write' | 'admin'>('write');
  const [inviteUsername, setInviteUsername] = useState('');
  const [inviteRole, setInviteRole] = useState<OrgMemberDoc['role']>('developer');
  const [busy, setBusy] = useState(false);

  const loadOrgs = async () => {
    setLoading(true);
    try {
      const list = await firestoreRepo.listOrganizations();
      setOrgs(list);
      if (slug) {
        const match = list.find((o) => o.slug === slug) || null;
        setSelectedOrg(match);
        if (match) {
          const [mems, tms] = await Promise.all([
            firestoreRepo.listOrgMembers(match.id),
            firestoreRepo.listOrgTeams(match.id),
          ]);
          setMembers(mems);
          setTeams(tms);
        }
      } else {
        setSelectedOrg(null);
      }
    } catch (err) {
      pushToast({ type: 'error', title: 'Load failed', message: err instanceof Error ? err.message : 'Unable to load organizations.' });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadOrgs();
  }, [slug]);

  const handleCreateOrg = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!firebaseUser || !profile || !orgName.trim()) return;
    const computedSlug = slugifyRepoName(orgName).replace(/[._]+/g, '-');
    if (computedSlug.length < 2) {
      pushToast({ type: 'error', title: 'Invalid organization name' });
      return;
    }
    setBusy(true);
    try {
      const created = await firestoreRepo.createOrganization({
        slug: computedSlug,
        name: orgName.trim(),
        description: orgDesc.trim(),
        ownerId: firebaseUser.uid,
        ownerUsername: profile.username,
      });
      setOrgs((prev) => [created, ...prev]);
      setCreateOpen(false);
      setOrgName('');
      setOrgDesc('');
      pushToast({ type: 'success', title: 'Organization created', message: created.name });
      navigate(`/orgs/${created.slug}`);
    } catch (err) {
      pushToast({ type: 'error', title: 'Creation failed', message: err instanceof Error ? err.message : 'Error' });
    } finally {
      setBusy(false);
    }
  };

  const handleAddMember = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedOrg || !inviteUsername.trim()) return;
    setBusy(true);
    try {
      const target = await firestoreRepo.getProfileByUsername(inviteUsername.trim().toLowerCase());
      if (!target) {
        pushToast({ type: 'error', title: 'User not found', message: `No user @${inviteUsername.trim()} found.` });
        return;
      }
      await firestoreRepo.addOrgMember(selectedOrg.id, {
        uid: target.uid,
        username: target.username,
        role: inviteRole,
      });
      if (firebaseUser) {
        await firestoreRepo.createNotification({
          userId: target.uid,
          type: 'org_invite',
          title: `Added to organization ${selectedOrg.name}`,
          message: `You were assigned the ${inviteRole} role.`,
          link: `/orgs/${selectedOrg.slug}`,
          actorId: firebaseUser.uid,
        });
      }
      const mems = await firestoreRepo.listOrgMembers(selectedOrg.id);
      setMembers(mems);
      setInviteUsername('');
      pushToast({ type: 'success', title: 'Member added', message: `@${target.username}` });
    } catch (err) {
      pushToast({ type: 'error', title: 'Failed to add member', message: err instanceof Error ? err.message : 'Error' });
    } finally {
      setBusy(false);
    }
  };

  const handleCreateTeam = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedOrg || !teamName.trim()) return;
    setBusy(true);
    try {
      const t = await firestoreRepo.createOrgTeam(selectedOrg.id, {
        name: teamName.trim(),
        description: '',
        permission: teamPerm,
      });
      setTeams((prev) => [...prev, t]);
      setTeamName('');
      pushToast({ type: 'success', title: 'Team created' });
    } catch (err) {
      pushToast({ type: 'error', title: 'Team creation failed', message: err instanceof Error ? err.message : 'Error' });
    } finally {
      setBusy(false);
    }
  };

  if (loading) {
    return (
      <div className="max-w-6xl mx-auto px-6 py-8 space-y-4">
        <div className="h-24 rounded-xl bg-slate-200 dark:bg-slate-800/50 animate-pulse" />
        <div className="h-64 rounded-xl bg-slate-200 dark:bg-slate-800/50 animate-pulse" />
      </div>
    );
  }

  if (slug && selectedOrg) {
    const isOrgAdmin = Boolean(firebaseUser && selectedOrg.ownerId === firebaseUser.uid);
    return (
      <div className="max-w-6xl mx-auto px-6 py-8 space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <Link to="/orgs" className="text-xs text-blue-600 dark:text-blue-400 hover:underline mb-2 inline-block">
              ← All Organizations
            </Link>
            <h1 className="text-2xl font-display font-bold text-slate-950 dark:text-white flex items-center gap-2.5">
              <Building2 className="w-6 h-6 text-blue-500" />
              <span>{selectedOrg.name}</span>
            </h1>
            {selectedOrg.description && <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">{selectedOrg.description}</p>}
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          <div className="lg:col-span-7 space-y-6">
            {selectedOrg.readme && (
              <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0D111A] p-6">
                <MarkdownView content={selectedOrg.readme} />
              </div>
            )}

            <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0D111A] p-6 space-y-4">
              <h2 className="text-base font-semibold">Teams & Repository Access</h2>
              {teams.length === 0 ? (
                <p className="text-xs text-slate-500">No teams configured yet.</p>
              ) : (
                <div className="divide-y divide-slate-200 dark:divide-slate-800">
                  {teams.map((t) => (
                    <div key={t.id} className="py-2.5 flex items-center justify-between text-xs">
                      <span className="font-medium text-slate-900 dark:text-slate-100">{t.name}</span>
                      <span className="font-mono text-slate-500 uppercase">{t.permission}</span>
                    </div>
                  ))}
                </div>
              )}

              {isOrgAdmin && (
                <form onSubmit={handleCreateTeam} className="pt-3 border-t border-slate-200 dark:border-slate-800 flex flex-wrap gap-2">
                  <input
                    type="text"
                    required
                    value={teamName}
                    onChange={(e) => setTeamName(e.target.value)}
                    placeholder="Team name (e.g. core-maintainers)"
                    className="flex-1 px-3 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-[#07090F] text-xs"
                  />
                  <select
                    value={teamPerm}
                    onChange={(e) => setTeamPerm(e.target.value as 'read' | 'write' | 'admin')}
                    className="px-3 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-[#07090F] text-xs"
                  >
                    <option value="read">Read</option>
                    <option value="write">Write</option>
                    <option value="admin">Admin</option>
                  </select>
                  <button type="submit" disabled={busy} className="px-3.5 py-1.5 rounded-lg bg-blue-600 text-white text-xs font-medium">
                    Create Team
                  </button>
                </form>
              )}
            </div>
          </div>

          <div className="lg:col-span-5 space-y-6">
            <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0D111A] p-6 space-y-4">
              <h2 className="text-base font-semibold flex items-center gap-2">
                <Users className="w-4 h-4 text-blue-500" />
                <span>Members ({members.length})</span>
              </h2>
              <div className="divide-y divide-slate-200 dark:divide-slate-800">
                {members.map((m) => (
                  <div key={m.uid} className="py-2.5 flex items-center justify-between text-xs">
                    <Link to={`/u/${m.username}`} className="font-mono text-blue-600 dark:text-blue-400 hover:underline">
                      @{m.username}
                    </Link>
                    <span className="capitalize text-slate-500">{m.role}</span>
                  </div>
                ))}
              </div>

              {isOrgAdmin && (
                <form onSubmit={handleAddMember} className="pt-3 border-t border-slate-200 dark:border-slate-800 space-y-2">
                  <input
                    type="text"
                    required
                    value={inviteUsername}
                    onChange={(e) => setInviteUsername(e.target.value)}
                    placeholder="Username to invite"
                    className="w-full px-3 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-[#07090F] text-xs font-mono"
                  />
                  <div className="flex gap-2">
                    <select
                      value={inviteRole}
                      onChange={(e) => setInviteRole(e.target.value as OrgMemberDoc['role'])}
                      className="flex-1 px-3 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-[#07090F] text-xs"
                    >
                      <option value="developer">Developer</option>
                      <option value="maintainer">Maintainer</option>
                      <option value="admin">Admin</option>
                      <option value="member">Member</option>
                    </select>
                    <button type="submit" disabled={busy} className="px-3.5 py-1.5 rounded-lg bg-blue-600 text-white text-xs font-medium">
                      Add Member
                    </button>
                  </div>
                </form>
              )}
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto px-6 py-8 space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-display font-bold text-slate-950 dark:text-white">Organizations</h1>
          <p className="text-sm text-slate-600 dark:text-slate-400">
            Shared engineering workspaces with teams, role-based access, and multi-repository collaboration.
          </p>
        </div>
        {firebaseUser && (
          <button
            type="button"
            onClick={() => setCreateOpen((v) => !v)}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-blue-600 text-white text-xs font-medium hover:bg-blue-500"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>New Organization</span>
          </button>
        )}
      </div>

      {createOpen && (
        <form onSubmit={handleCreateOrg} className="rounded-xl border border-blue-500/40 bg-white dark:bg-[#0D111A] p-6 space-y-4">
          <h2 className="text-base font-semibold">Create Organization</h2>
          <input
            type="text"
            required
            value={orgName}
            onChange={(e) => setOrgName(e.target.value)}
            placeholder="Organization name (e.g. Orbit Engineering)"
            className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-[#07090F] text-sm"
          />
          <input
            type="text"
            value={orgDesc}
            onChange={(e) => setOrgDesc(e.target.value)}
            placeholder="Short mission statement"
            className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-[#07090F] text-sm"
          />
          <button type="submit" disabled={busy} className="px-4 py-2 rounded-lg bg-blue-600 text-white text-xs font-medium">
            {busy ? 'Creating...' : 'Create Organization'}
          </button>
        </form>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
        {orgs.length === 0 ? (
          <div className="md:col-span-2 lg:col-span-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0D111A] p-10 text-center text-sm text-slate-500">
            No organizations created yet. {firebaseUser ? 'Create the first organization above.' : 'Sign in to create an organization.'}
          </div>
        ) : (
          orgs.map((org) => (
            <Link
              key={org.id}
              to={`/orgs/${org.slug}`}
              className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0D111A] p-5 hover:border-blue-500/50 transition-colors block space-y-2"
            >
              <div className="flex items-center gap-2.5">
                <Building2 className="w-5 h-5 text-blue-500" />
                <h2 className="font-semibold text-slate-950 dark:text-white">{org.name}</h2>
              </div>
              <p className="text-xs font-mono text-slate-400">/{org.slug}</p>
              <p className="text-xs text-slate-600 dark:text-slate-400 line-clamp-2">
                {org.description || 'Engineering workspace on SOUL HUB.'}
              </p>
            </Link>
          ))
        )}
      </div>
    </div>
  );
}
