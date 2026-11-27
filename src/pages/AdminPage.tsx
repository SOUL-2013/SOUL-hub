import { useEffect, useState } from 'react';
import { ShieldAlert } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { firestoreRepo } from '../lib/firestoreRepo';
import type { AuditLogDoc, PrivateUser, ReportDoc } from '../types/domain';

export function AdminPage() {
  const { firebaseUser, isAdmin } = useAuth();
  const { pushToast } = useToast();

  const [banner, setBanner] = useState('');
  const [maintenanceMode, setMaintenanceMode] = useState(false);
  const [maxUserStorageMb, setMaxUserStorageMb] = useState(50);
  const [maxRepoSizeMb, setMaxRepoSizeMb] = useState(50);
  const [users, setUsers] = useState<PrivateUser[]>([]);
  const [reports, setReports] = useState<ReportDoc[]>([]);
  const [auditLogs, setAuditLogs] = useState<AuditLogDoc[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!isAdmin) {
      setLoading(false);
      return;
    }
    const load = async () => {
      setLoading(true);
      try {
        const [cfg, uList, rList, aList] = await Promise.all([
          firestoreRepo.getPlatformConfig(),
          firestoreRepo.listAllPrivateUsersForAdmin(),
          firestoreRepo.listReports(),
          firestoreRepo.listAuditLogs(),
        ]);
        if (cfg) {
          setBanner(cfg.announcementBanner || '');
          setMaintenanceMode(cfg.maintenanceMode);
          setMaxUserStorageMb(cfg.maxUserStorageMb);
          setMaxRepoSizeMb(cfg.maxRepoSizeMb);
        }
        setUsers(uList);
        setReports(rList);
        setAuditLogs(aList);
      } catch (err) {
        pushToast({ type: 'error', title: 'Admin load failed', message: err instanceof Error ? err.message : 'Error' });
      } finally {
        setLoading(false);
      }
    };
    void load();
  }, [isAdmin]);

  if (!isAdmin) {
    return (
      <div className="max-w-xl mx-auto px-6 py-20 text-center space-y-2">
        <ShieldAlert className="w-8 h-8 text-red-500 mx-auto" />
        <h1 className="text-xl font-bold">Administrator Access Required</h1>
        <p className="text-sm text-slate-500">This panel is strictly protected by Firestore security rules for verified platform administrators.</p>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="max-w-6xl mx-auto px-6 py-8 space-y-4">
        <div className="h-32 rounded-xl bg-slate-200 dark:bg-slate-800/50 animate-pulse" />
      </div>
    );
  }

  const handleSaveConfig = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!firebaseUser) return;
    await firestoreRepo.savePlatformConfig({
      announcementBanner: banner.trim(),
      maintenanceMode,
      maxRepoSizeMb,
      maxUserStorageMb,
    });
    await firestoreRepo.writeAuditLog({
      actorId: firebaseUser.uid,
      action: 'update_platform_config',
      targetType: 'platform_config',
      targetId: 'global',
      details: `banner="${banner.trim()}", maintenance=${maintenanceMode}`,
    });
    pushToast({ type: 'success', title: 'Platform config saved' });
  };

  return (
    <div className="max-w-6xl mx-auto px-6 py-8 space-y-8">
      <div>
        <h1 className="text-2xl font-display font-bold text-slate-950 dark:text-white flex items-center gap-2">
          <ShieldAlert className="w-6 h-6 text-violet-500" />
          <span>SOUL HUB Administration</span>
        </h1>
        <p className="text-xs text-slate-500 mt-1">Platform configuration, moderation reports, user suspensions, and audit logs.</p>
      </div>

      <form onSubmit={handleSaveConfig} className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0D111A] p-6 space-y-4">
        <h2 className="text-base font-semibold">Global Platform Config</h2>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="sm:col-span-3">
            <label className="block text-xs font-medium text-slate-500 mb-1">Announcement Banner</label>
            <input
              type="text"
              value={banner}
              onChange={(e) => setBanner(e.target.value)}
              placeholder="Optional global announcement..."
              className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-[#07090F] text-sm"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-500 mb-1">User Storage Quota (MB)</label>
            <input
              type="number"
              min={1}
              value={maxUserStorageMb}
              onChange={(e) => setMaxUserStorageMb(Number(e.target.value))}
              className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-[#07090F] text-sm"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-500 mb-1">Max Repo Size (MB)</label>
            <input
              type="number"
              min={1}
              value={maxRepoSizeMb}
              onChange={(e) => setMaxRepoSizeMb(Number(e.target.value))}
              className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-[#07090F] text-sm"
            />
          </div>
          <label className="flex items-center gap-2 text-xs pt-6">
            <input type="checkbox" checked={maintenanceMode} onChange={(e) => setMaintenanceMode(e.target.checked)} />
            <span>Maintenance mode</span>
          </label>
        </div>
        <button type="submit" className="px-4 py-2 rounded-lg bg-blue-600 text-white text-xs font-medium">
          Save Config
        </button>
      </form>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0D111A] p-6 space-y-3">
          <h2 className="text-base font-semibold">Registered Accounts ({users.length})</h2>
          <div className="divide-y divide-slate-200 dark:divide-slate-800 max-h-80 overflow-y-auto">
            {users.map((u) => (
              <div key={u.uid} className="py-2.5 flex items-center justify-between gap-3 text-xs">
                <div>
                  <p className="font-mono text-slate-900 dark:text-slate-100">{u.email}</p>
                  <p className="text-slate-500">{u.isSuspended ? 'Suspended' : 'Active'}</p>
                </div>
                <button
                  type="button"
                  onClick={async () => {
                    const next = !u.isSuspended;
                    await firestoreRepo.toggleUserSuspended(u.uid, next);
                    setUsers((prev) => prev.map((x) => (x.uid === u.uid ? { ...x, isSuspended: next } : x)));
                  }}
                  className="px-2.5 py-1 rounded border border-slate-300 dark:border-slate-700"
                >
                  {u.isSuspended ? 'Unsuspend' : 'Suspend'}
                </button>
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0D111A] p-6 space-y-3">
          <h2 className="text-base font-semibold">Moderation & Security Reports ({reports.length})</h2>
          <div className="divide-y divide-slate-200 dark:divide-slate-800 max-h-80 overflow-y-auto">
            {reports.length === 0 ? (
              <p className="py-4 text-xs text-slate-500">No open reports.</p>
            ) : (
              reports.map((rep) => (
                <div key={rep.id} className="py-2.5 space-y-1 text-xs">
                  <div className="flex items-center justify-between">
                    <span className="font-mono uppercase text-blue-500">{rep.targetType}</span>
                    <select
                      value={rep.status}
                      onChange={async (e) => {
                        const status = e.target.value as ReportDoc['status'];
                        await firestoreRepo.updateReportStatus(rep.id, status);
                        setReports((prev) => prev.map((r) => (r.id === rep.id ? { ...r, status } : r)));
                      }}
                      className="px-2 py-0.5 rounded border border-slate-300 dark:border-slate-700 bg-transparent"
                    >
                      <option value="open">Open</option>
                      <option value="resolved">Resolved</option>
                      <option value="dismissed">Dismissed</option>
                    </select>
                  </div>
                  <p className="text-slate-600 dark:text-slate-300">{rep.reason}</p>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0D111A] p-6 space-y-3">
        <h2 className="text-base font-semibold">Audit Log ({auditLogs.length})</h2>
        <div className="divide-y divide-slate-200 dark:divide-slate-800 max-h-64 overflow-y-auto text-xs font-mono">
          {auditLogs.length === 0 ? (
            <p className="py-4 text-slate-500 font-sans">No audit log events recorded yet.</p>
          ) : (
            auditLogs.map((log) => (
              <div key={log.id} className="py-2 flex items-center justify-between gap-4">
                <span>{log.action} · {log.targetType}/{log.targetId}</span>
                <span className="text-slate-500 truncate max-w-xs">{log.details}</span>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
