import { useEffect, useState } from 'react';
import { Award, Building2, Globe, MapPin, ShieldAlert, Star, UserMinus, UserPlus } from 'lucide-react';
import { MarkdownView } from '../components/MarkdownView';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { gitApi } from '../lib/api';
import { firestoreRepo } from '../lib/firestoreRepo';
import { Link } from '../lib/router';
import type { PublicProfile, RepositoryDoc } from '../types/domain';

export function ProfilePage({ username, subtab = 'overview' }: { username: string; subtab?: 'overview' | 'followers' | 'following' }) {
  const { firebaseUser, profile: myProfile, privateUser, refreshProfile } = useAuth();
  const { pushToast } = useToast();
  const [targetProfile, setTargetProfile] = useState<PublicProfile | null>(null);
  const [repos, setRepos] = useState<RepositoryDoc[]>([]);
  const [following, setFollowing] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    async function load() {
      setLoading(true);
      try {
        if (username === 'soul-labs') {
          setTargetProfile({
            uid: 'soul-labs-system',
            username: 'soul-labs',
            displayName: 'Soumadip Orbit Universal Labs',
            bio: 'Official engineering organization building SOUL HUB and open developer infrastructure.',
            avatarUrl: '/src/assets/images/soulhub_avatar_founder_1795710292346.jpg',
            location: 'Global Orbit',
            company: 'SOUL',
            website: 'https://soumadiporbit.dev',
            profileReadme: '## Soumadip Orbit Universal Labs\n\nBuilding transparent, self-contained developer infrastructure where every developer builds the future.',
            isPrivateProfile: false,
            followersCount: 128,
            followingCount: 4,
          });
          const [pubRepos, showcase] = await Promise.all([
            firestoreRepo.listPublicRepositories(20).catch(() => []),
            gitApi.getShowcase().catch(() => ({ repositories: [] })),
          ]);
          const showcaseRepos: RepositoryDoc[] = showcase.repositories.map((s) => ({
            ...s,
            isArchived: false,
            isShowcase: true,
          }));
          const merged = [...showcaseRepos, ...pubRepos.filter((r) => r.ownerUsername === 'soul-labs')];
          if (active) setRepos(merged);
          return;
        }

        const prof = await firestoreRepo.getProfileByUsername(username);
        if (!active) return;
        setTargetProfile(prof);
        if (prof) {
          const userRepos = await firestoreRepo.listUserRepositories(prof.uid).catch(() => []);
          if (!active) return;
          setRepos(userRepos.filter((r) => r.visibility === 'public' || r.ownerId === firebaseUser?.uid));
          if (firebaseUser && firebaseUser.uid !== prof.uid) {
            const isFol = await firestoreRepo.isFollowing(prof.uid, firebaseUser.uid);
            if (active) setFollowing(isFol);
          }
        }
      } finally {
        if (active) setLoading(false);
      }
    }
    void load();
    return () => {
      active = false;
    };
  }, [username, firebaseUser]);

  if (loading) {
    return (
      <div className="max-w-6xl mx-auto px-6 py-10">
        <div className="h-44 rounded-xl bg-slate-200 dark:bg-slate-800/50 animate-pulse" />
      </div>
    );
  }

  if (!targetProfile) {
    return (
      <div className="max-w-3xl mx-auto px-6 py-16 text-center">
        <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100">Developer @{username} not found</h1>
        <p className="mt-2 text-sm text-slate-600 dark:text-slate-400">This profile may be private or does not exist.</p>
        <Link to="/explore" className="mt-6 inline-block px-4 py-2 rounded-lg bg-blue-600 text-white text-sm font-medium">
          Back to Explore
        </Link>
      </div>
    );
  }

  const isMe = firebaseUser?.uid === targetProfile.uid;
  const isBlocked = privateUser?.blockedUserIds?.includes(targetProfile.uid);

  const handleFollowToggle = async () => {
    if (!firebaseUser || !myProfile) {
      pushToast({ type: 'info', title: 'Sign in required', message: 'Sign in to follow developers.' });
      return;
    }
    const next = await firestoreRepo.toggleFollow(targetProfile.uid, firebaseUser.uid);
    setFollowing(next);
    setTargetProfile((prev) =>
      prev ? { ...prev, followersCount: Math.max(0, prev.followersCount + (next ? 1 : -1)) } : prev
    );
    if (next) {
      await firestoreRepo.createNotification({
        userId: targetProfile.uid,
        type: 'follow',
        title: `@${myProfile.username} followed you`,
        link: `/u/${myProfile.username}`,
        actorId: firebaseUser.uid,
      });
    }
  };

  const handleBlockToggle = async () => {
    if (!firebaseUser || !privateUser) return;
    const current = privateUser.blockedUserIds || [];
    const next = isBlocked ? current.filter((id) => id !== targetProfile.uid) : [...current, targetProfile.uid];
    await firestoreRepo.updatePrivateUser(firebaseUser.uid, { blockedUserIds: next });
    await refreshProfile();
    pushToast({
      type: 'info',
      title: isBlocked ? 'User unblocked' : 'User blocked',
      message: `@${targetProfile.username} has been ${isBlocked ? 'removed from' : 'added to'} your block list.`,
    });
  };

  const achievements = [
    repos.length >= 1 ? 'First Repository' : null,
    repos.some((r) => r.starsCount >= 1) ? 'Starred Creator' : null,
    targetProfile.profileReadme ? 'Documented Profile' : null,
  ].filter(Boolean) as string[];

  return (
    <div className="max-w-6xl mx-auto px-6 py-8 space-y-8">
      <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0D111A] overflow-hidden">
        {targetProfile.coverUrl && (
          <img
            src={targetProfile.coverUrl}
            alt="Profile cover"
            referrerPolicy="no-referrer"
            className="w-full h-40 object-cover border-b border-slate-200 dark:border-slate-800"
          />
        )}
        <div className="p-6 flex flex-col md:flex-row md:items-start justify-between gap-6">
          <div className="flex items-start gap-5">
            <div className="w-20 h-20 rounded-xl bg-blue-600/15 text-blue-500 flex items-center justify-center text-2xl font-bold shrink-0 overflow-hidden border border-slate-200 dark:border-slate-800">
              {targetProfile.avatarUrl ? (
                <img
                  src={targetProfile.avatarUrl}
                  alt={targetProfile.displayName}
                  referrerPolicy="no-referrer"
                  className="w-full h-full object-cover"
                />
              ) : (
                targetProfile.username.slice(0, 2).toUpperCase()
              )}
            </div>

            <div>
              <h1 className="font-display text-2xl font-bold text-slate-950 dark:text-white">{targetProfile.displayName}</h1>
              <p className="text-sm text-slate-500 font-mono">@{targetProfile.username}</p>
              {targetProfile.statusText && (
                <p className="mt-1.5 text-xs text-blue-600 dark:text-blue-400">Status: {targetProfile.statusText}</p>
              )}
              {targetProfile.bio && <p className="mt-2.5 text-sm text-slate-700 dark:text-slate-300 max-w-2xl">{targetProfile.bio}</p>}

              <div className="mt-3 flex flex-wrap items-center gap-4 text-xs text-slate-500 dark:text-slate-400">
                {targetProfile.company && (
                  <span className="inline-flex items-center gap-1">
                    <Building2 className="w-3.5 h-3.5" />
                    {targetProfile.company}
                  </span>
                )}
                {targetProfile.location && (
                  <span className="inline-flex items-center gap-1">
                    <MapPin className="w-3.5 h-3.5" />
                    {targetProfile.location}
                  </span>
                )}
                {targetProfile.website && (
                  <a
                    href={targetProfile.website.startsWith('http') ? targetProfile.website : `https://${targetProfile.website}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-blue-600 dark:text-blue-400 hover:underline"
                  >
                    <Globe className="w-3.5 h-3.5" />
                    {targetProfile.website}
                  </a>
                )}
                <Link to={`/u/${targetProfile.username}/followers`} className="hover:text-slate-900 dark:hover:text-white tabular-nums">
                  <strong>{targetProfile.followersCount}</strong> followers
                </Link>
                <Link to={`/u/${targetProfile.username}/following`} className="hover:text-slate-900 dark:hover:text-white tabular-nums">
                  <strong>{targetProfile.followingCount}</strong> following
                </Link>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2.5 shrink-0">
            {isMe ? (
              <Link
                to="/settings/account"
                className="px-4 py-2 rounded-lg border border-slate-300 dark:border-slate-700 text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800"
              >
                Edit Profile
              </Link>
            ) : targetProfile.uid !== 'soul-labs-system' ? (
              <>
                <button
                  type="button"
                  onClick={handleFollowToggle}
                  className={`inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-medium transition-colors ${
                    following
                      ? 'border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800'
                      : 'bg-blue-600 text-white hover:bg-blue-500'
                  }`}
                >
                  {following ? <UserMinus className="w-3.5 h-3.5" /> : <UserPlus className="w-3.5 h-3.5" />}
                  <span>{following ? 'Unfollow' : 'Follow'}</span>
                </button>
                {firebaseUser && (
                  <button
                    type="button"
                    onClick={handleBlockToggle}
                    className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 text-xs text-slate-500 hover:text-red-500"
                  >
                    <ShieldAlert className="w-3.5 h-3.5" />
                    <span>{isBlocked ? 'Unblock' : 'Block'}</span>
                  </button>
                )}
              </>
            ) : null}
          </div>
        </div>
      </div>

      {subtab !== 'overview' ? (
        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0D111A] p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-base font-semibold capitalize">{subtab}</h2>
            <Link to={`/u/${username}`} className="text-xs text-blue-600 dark:text-blue-400 hover:underline">
              Back to profile overview
            </Link>
          </div>
          <p className="text-sm text-slate-600 dark:text-slate-400 tabular-nums">
            Total {subtab}: {subtab === 'followers' ? targetProfile.followersCount : targetProfile.followingCount}.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          <div className="lg:col-span-8 space-y-6">
            {targetProfile.profileReadme && (
              <section className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0D111A] p-6">
                <p className="text-xs font-mono text-slate-400 mb-3">README.md</p>
                <MarkdownView content={targetProfile.profileReadme} />
              </section>
            )}

            <section className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0D111A] p-6">
              <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100 mb-4">
                Repositories ({repos.length})
              </h2>
              {repos.length === 0 ? (
                <p className="text-sm text-slate-500 dark:text-slate-400">No public repositories published yet.</p>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {repos.map((r) => (
                    <Link
                      key={r.id}
                      to={`/repo/${r.ownerUsername}/${r.slug}`}
                      className="rounded-lg border border-slate-200 dark:border-slate-800 p-4 hover:border-blue-500/50 transition-colors"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-sm font-semibold text-slate-900 dark:text-slate-100 truncate">{r.name}</span>
                        <span className="inline-flex items-center gap-1 text-xs text-slate-500 tabular-nums">
                          <Star className="w-3 h-3" />
                          {r.starsCount}
                        </span>
                      </div>
                      {r.description && <p className="mt-1.5 text-xs text-slate-500 dark:text-slate-400 line-clamp-2">{r.description}</p>}
                    </Link>
                  ))}
                </div>
              )}
            </section>
          </div>

          <div className="lg:col-span-4 space-y-6">
            <section className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0D111A] p-6">
              <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100 flex items-center gap-2 mb-3">
                <Award className="w-4 h-4 text-blue-500" />
                <span>Achievements</span>
              </h2>
              {achievements.length === 0 ? (
                <p className="text-xs text-slate-500">Complete your first repository or profile README to earn milestones.</p>
              ) : (
                <ul className="space-y-2 text-xs text-slate-700 dark:text-slate-300">
                  {achievements.map((a) => (
                    <li key={a} className="py-1.5 border-b border-slate-100 dark:border-slate-800/70 last:border-0">
                      {a}
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </div>
        </div>
      )}
    </div>
  );
}
