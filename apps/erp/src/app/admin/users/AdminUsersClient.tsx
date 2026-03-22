'use client';

import { useEffect, useMemo, useState } from 'react';

type AdminUserRow = {
  id: string;
  username: string;
  email: string | null;
  displayName: string;
  role: 'ADMIN' | 'STAFF';
  isActive: boolean;
  forcePasswordChange: boolean;
  createdAt: string;
  updatedAt: string;
  pendingReset: {
    id: string;
    createdAt: string;
    expiresAt: string;
  } | null;
};

type PendingRequestRow = {
  id: string;
  username: string;
  email: string | null;
  displayName: string;
  status: 'PENDING' | 'APPROVED' | 'REJECTED';
  createdAt: string;
};

const emptyCreateForm = {
  displayName: '',
  username: '',
  email: '',
  password: '',
  role: 'STAFF' as 'ADMIN' | 'STAFF',
};

export default function AdminUsersClient() {
  const [users, setUsers] = useState<AdminUserRow[]>([]);
  const [pendingRequests, setPendingRequests] = useState<PendingRequestRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [createForm, setCreateForm] = useState(emptyCreateForm);
  const [working, setWorking] = useState<string | null>(null);
  const [resetLink, setResetLink] = useState<{ username: string; url: string; expiresAt: string } | null>(null);

  async function loadUsers() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/admin/users').then((response) => response.json());
      if (!res.success) {
        throw new Error(res.error?.message || 'Unable to load access data');
      }
      setUsers(res.data.users);
      setPendingRequests(res.data.pendingRequests);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to load access data');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadUsers();
  }, []);

  const stats = useMemo(() => {
    const active = users.filter((user) => user.isActive).length;
    const owners = users.filter((user) => user.role === 'ADMIN').length;
    const pendingResets = users.filter((user) => user.pendingReset).length;
    const forcedPasswordChange = users.filter((user) => user.forcePasswordChange).length;
    return { active, owners, pendingResets, forcedPasswordChange, pendingRequests: pendingRequests.length };
  }, [users, pendingRequests]);

  async function createUser(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setWorking('create-user');
    setError(null);
    setMessage(null);

    try {
      const res = await fetch('/api/admin/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(createForm),
      }).then((response) => response.json());

      if (!res.success) {
        throw new Error(res.error?.message || 'Unable to create account');
      }

      setCreateForm(emptyCreateForm);
      setMessage(res.message || 'Account created');
      await loadUsers();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to create account');
    } finally {
      setWorking(null);
    }
  }

  async function patchUser(user: AdminUserRow, updates: Record<string, unknown>) {
    setWorking(user.id);
    setError(null);
    setMessage(null);

    try {
      const res = await fetch(`/api/admin/users/${user.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates),
      }).then((response) => response.json());

      if (!res.success) {
        throw new Error(res.error?.message || 'Unable to update account');
      }

      setMessage(res.message || `Updated ${user.username}`);
      await loadUsers();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to update account');
    } finally {
      setWorking(null);
    }
  }

  async function issueReset(user: AdminUserRow) {
    setWorking(`reset:${user.id}`);
    setError(null);
    setMessage(null);
    setResetLink(null);

    try {
      const res = await fetch(`/api/admin/users/${user.id}/reset-password`, {
        method: 'POST',
      }).then((response) => response.json());

      if (!res.success) {
        throw new Error(res.error?.message || 'Unable to create reset link');
      }

      setResetLink({
        username: user.username,
        url: res.data.resetUrl,
        expiresAt: res.data.expiresAt,
      });
      setMessage(res.message || 'Reset link issued');
      await loadUsers();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to create reset link');
    } finally {
      setWorking(null);
    }
  }

  async function revokeReset(user: AdminUserRow) {
    setWorking(`revoke:${user.id}`);
    setError(null);
    setMessage(null);
    setResetLink(null);

    try {
      const res = await fetch(`/api/admin/users/${user.id}/reset-password`, {
        method: 'DELETE',
      }).then((response) => response.json());

      if (!res.success) {
        throw new Error(res.error?.message || 'Unable to revoke reset link');
      }

      setMessage(res.message || 'Reset link revoked');
      await loadUsers();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to revoke reset link');
    } finally {
      setWorking(null);
    }
  }

  async function approveRequest(request: PendingRequestRow) {
    setWorking(`approve:${request.id}`);
    setError(null);
    setMessage(null);

    try {
      const res = await fetch(`/api/admin/registration-requests/${request.id}/approve`, {
        method: 'POST',
      }).then((response) => response.json());

      if (!res.success) {
        throw new Error(res.error?.message || 'Unable to approve request');
      }

      setMessage(res.message || `Approved ${request.username}`);
      await loadUsers();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to approve request');
    } finally {
      setWorking(null);
    }
  }

  async function rejectRequest(request: PendingRequestRow) {
    setWorking(`reject:${request.id}`);
    setError(null);
    setMessage(null);

    const reason = window.prompt('Optional rejection reason', '');

    try {
      const res = await fetch(`/api/admin/registration-requests/${request.id}/reject`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason: reason || undefined }),
      }).then((response) => response.json());

      if (!res.success) {
        throw new Error(res.error?.message || 'Unable to reject request');
      }

      setMessage(res.message || `Rejected ${request.username}`);
      await loadUsers();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to reject request');
    } finally {
      setWorking(null);
    }
  }

  if (loading) {
    return (
      <main className="space-y-6">
        <div className="relative overflow-hidden rounded-xl bg-gradient-to-br from-primary-container to-primary px-6 py-5 shadow-lg">
          <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,_rgba(255,255,255,0.15),_transparent_60%)]" />
          <div className="relative flex items-center justify-between gap-4">
            <div>
              <h1 className="text-base font-semibold text-on-primary">Owner and Staff Access</h1>
              <p className="text-xs text-on-primary/80 mt-0.5">Loading access control data.</p>
            </div>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="space-y-6">
      <div className="relative overflow-hidden rounded-xl bg-gradient-to-br from-primary-container to-primary px-6 py-5 shadow-lg">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,_rgba(255,255,255,0.15),_transparent_60%)]" />
        <div className="relative flex items-center justify-between gap-4">
          <div>
            <h1 className="text-base font-semibold text-on-primary">Owner and Staff Access</h1>
            <p className="text-xs text-on-primary/80 mt-0.5">Approve staff registrations, create accounts directly, and manage credential state.</p>
          </div>
          <div className="flex items-center gap-3">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-surface-container px-2.5 py-0.5 text-xs font-semibold text-on-surface">{stats.active} active</span>
            <span className="inline-flex items-center gap-1.5 rounded-full bg-surface-container px-2.5 py-0.5 text-xs font-semibold text-on-surface">{stats.owners} owners</span>
            <span className="inline-flex items-center gap-1.5 rounded-full bg-surface-container px-2.5 py-0.5 text-xs font-semibold text-on-surface">{stats.pendingRequests} pending</span>
            <span className="inline-flex items-center gap-1.5 rounded-full bg-surface-container px-2.5 py-0.5 text-xs font-semibold text-on-surface">{stats.pendingResets} resets</span>
            <span className="inline-flex items-center gap-1.5 rounded-full bg-surface-container px-2.5 py-0.5 text-xs font-semibold text-on-surface">{stats.forcedPasswordChange} must change pw</span>
          </div>
        </div>
      </div>

      {message ? <div className="rounded-lg border border-emerald-500/30 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">{message}</div> : null}
      {error ? <div className="rounded-lg border border-red-500/30 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div> : null}

      {resetLink ? (
        <div className="bg-surface-container-lowest rounded-xl border border-outline-variant/10 p-5">
          <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
            <div>
              <div className="text-sm font-semibold text-on-surface">Reset Link Issued for {resetLink.username}</div>
              <div className="text-sm text-on-surface-variant">Expires {new Date(resetLink.expiresAt).toLocaleString('en-GB')}</div>
            </div>
            <button type="button" className="inline-flex items-center gap-2 rounded-lg border border-emerald-500 bg-emerald-500 text-white px-4 py-2 text-sm font-semibold shadow-sm transition-colors hover:bg-emerald-600" onClick={() => navigator.clipboard.writeText(resetLink.url)}>
              Copy Reset Link
            </button>
          </div>
          <div className="mt-3 rounded-3xl border border-primary-container bg-primary-container/60 px-4 py-3 text-sm text-on-surface">{resetLink.url}</div>
        </div>
      ) : null}

      {pendingRequests.length > 0 ? (
        <div className="relative overflow-hidden rounded-xl bg-gradient-to-br from-primary-container to-primary shadow-lg">
          <div className="border-b border-outline-variant/50 px-6 py-4">
            <h2 className="text-base font-semibold text-on-primary">Pending Staff Registration</h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="border-b border-outline-variant">
                  <th className="px-4 py-3 text-left font-medium text-on-surface">Applicant</th>
                  <th className="px-4 py-3 text-left font-medium text-on-surface">Requested At</th>
                  <th className="px-4 py-3 text-left font-medium text-on-surface">Decision</th>
                </tr>
              </thead>
              <tbody>
                {pendingRequests.map((request) => (
                  <tr key={request.id} className="border-b border-outline-variant/50">
                    <td className="px-4 py-3">
                      <div className="font-medium text-on-surface">{request.displayName}</div>
                      <div className="text-xs text-on-surface-variant">{request.username}{request.email ? ` | ${request.email}` : ''}</div>
                    </td>
                    <td className="px-4 py-3 text-on-surface-variant">{new Date(request.createdAt).toLocaleString('en-GB')}</td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap gap-2">
                        <button type="button" className="inline-flex items-center gap-2 rounded-lg border border-emerald-500 bg-emerald-500 text-white px-4 py-2 text-sm font-semibold shadow-sm transition-colors hover:bg-emerald-600" onClick={() => void approveRequest(request)} disabled={working === `approve:${request.id}`}>
                          {working === `approve:${request.id}` ? 'Approving...' : 'Approve'}
                        </button>
                        <button type="button" className="inline-flex items-center gap-2 rounded-lg border border-outline bg-surface-container-lowest px-4 py-2 text-sm font-medium text-on-surface shadow-sm transition-colors hover:bg-surface-container" onClick={() => void rejectRequest(request)} disabled={working === `reject:${request.id}`}>
                          {working === `reject:${request.id}` ? 'Rejecting...' : 'Reject'}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}

      <div className="grid gap-6 xl:grid-cols-[420px_minmax(0,1fr)]">
        <div className="relative overflow-hidden rounded-xl bg-gradient-to-br from-primary-container to-primary shadow-lg">
          <div className="border-b border-outline-variant/50 px-6 py-4">
            <h2 className="text-base font-semibold text-on-primary">Owner-Created Account</h2>
          </div>
          <form className="grid gap-4 p-4" onSubmit={createUser}>
            <div>
              <label className="mb-2 block text-sm font-medium text-on-surface">Display Name</label>
              <input className="w-full rounded-lg border border-outline bg-surface-container-lowest px-3 py-2 text-sm text-on-surface" value={createForm.displayName} onChange={(e) => setCreateForm((prev) => ({ ...prev, displayName: e.target.value }))} placeholder="Operations Staff" />
            </div>
            <div>
              <label className="mb-2 block text-sm font-medium text-on-surface">Username</label>
              <input className="w-full rounded-lg border border-outline bg-surface-container-lowest px-3 py-2 text-sm text-on-surface" value={createForm.username} onChange={(e) => setCreateForm((prev) => ({ ...prev, username: e.target.value }))} placeholder="ops.staff" />
            </div>
            <div>
              <label className="mb-2 block text-sm font-medium text-on-surface">Email</label>
              <input className="w-full rounded-lg border border-outline bg-surface-container-lowest px-3 py-2 text-sm text-on-surface" value={createForm.email} onChange={(e) => setCreateForm((prev) => ({ ...prev, email: e.target.value }))} placeholder="staff@example.com" />
            </div>
            <div>
              <label className="mb-2 block text-sm font-medium text-on-surface">Role</label>
              <select className="w-full rounded-lg border border-outline bg-surface-container-lowest px-3 py-2 text-sm text-on-surface" value={createForm.role} onChange={(e) => setCreateForm((prev) => ({ ...prev, role: e.target.value as 'ADMIN' | 'STAFF' }))}>
                <option value="STAFF">Staff</option>
                <option value="ADMIN">Owner</option>
              </select>
            </div>
            <div>
              <label className="mb-2 block text-sm font-medium text-on-surface">Temporary Password</label>
              <input className="w-full rounded-lg border border-outline bg-surface-container-lowest px-3 py-2 text-sm text-on-surface" type="password" value={createForm.password} onChange={(e) => setCreateForm((prev) => ({ ...prev, password: e.target.value }))} placeholder="Minimum 8 characters" />
            </div>
            <div className="rounded-3xl border border-primary-container bg-primary-container px-4 py-3 text-sm text-on-surface">
              Newly created accounts are forced to change this temporary password on first sign-in.
            </div>
            <button className="inline-flex items-center gap-2 rounded-lg border border-emerald-500 bg-emerald-500 text-white px-4 py-2 text-sm font-semibold shadow-sm transition-colors hover:bg-emerald-600" disabled={working === 'create-user'}>
              {working === 'create-user' ? 'Creating...' : 'Create Account'}
            </button>
          </form>
        </div>

        <div className="relative overflow-hidden rounded-xl bg-gradient-to-br from-primary-container to-primary shadow-lg">
          <div className="border-b border-outline-variant/50 px-6 py-4">
            <h2 className="text-base font-semibold text-on-primary">Approved Accounts</h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="border-b border-outline-variant">
                  <th className="px-4 py-3 text-left font-medium text-on-surface">User</th>
                  <th className="px-4 py-3 text-left font-medium text-on-surface">Role</th>
                  <th className="px-4 py-3 text-left font-medium text-on-surface">Status</th>
                  <th className="px-4 py-3 text-left font-medium text-on-surface">Password State</th>
                  <th className="px-4 py-3 text-left font-medium text-on-surface">Reset</th>
                  <th className="px-4 py-3 text-left font-medium text-on-surface">Actions</th>
                </tr>
              </thead>
              <tbody>
                {users.map((user) => (
                  <tr key={user.id} className="border-b border-outline-variant/50">
                    <td className="px-4 py-3">
                      <div className="font-medium text-on-surface">{user.displayName}</div>
                      <div className="text-xs text-on-surface-variant">{user.username}{user.email ? ` | ${user.email}` : ''}</div>
                    </td>
                    <td className="px-4 py-3">
                      <select className="w-full rounded-lg border border-outline bg-surface-container-lowest px-3 py-2 text-sm text-on-surface" value={user.role} onChange={(e) => void patchUser(user, { role: e.target.value })} disabled={working === user.id}>
                        <option value="ADMIN">Owner</option>
                        <option value="STAFF">Staff</option>
                      </select>
                    </td>
                    <td className="px-4 py-3">
                      <button type="button" className={`inline-flex items-center gap-2 rounded-lg border ${user.isActive ? 'border-outline bg-surface-container-lowest px-4 py-2 text-sm font-medium text-on-surface shadow-sm transition-colors hover:bg-surface-container' : 'border-outline bg-surface-container-lowest px-4 py-2 text-sm font-medium text-on-surface shadow-sm transition-colors hover:bg-surface-container'}`} onClick={() => void patchUser(user, { isActive: !user.isActive })} disabled={working === user.id}>
                        {user.isActive ? 'Active' : 'Inactive'}
                      </button>
                    </td>
                    <td className="px-4 py-3">
                      <div className={`inline-flex items-center gap-1.5 rounded-full bg-surface-container px-2.5 py-0.5 text-xs font-semibold text-on-surface ${user.forcePasswordChange ? 'bg-amber-100 text-amber-700' : ''}`}>
                        {user.forcePasswordChange ? 'Temporary password' : 'Up to date'}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      {user.pendingReset ? (
                        <div className="text-xs text-on-surface-variant">Pending until {new Date(user.pendingReset.expiresAt).toLocaleString('en-GB')}</div>
                      ) : (
                        <div className="text-xs text-outline-variant">No active reset link</div>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap gap-2">
                        <button
                          type="button"
                          className="inline-flex items-center gap-2 rounded-lg border border-outline bg-surface-container-lowest px-4 py-2 text-sm font-medium text-on-surface shadow-sm transition-colors hover:bg-surface-container"
                          onClick={() => {
                            const nextName = window.prompt('Update display name', user.displayName);
                            if (nextName && nextName !== user.displayName) {
                              void patchUser(user, { displayName: nextName });
                            }
                          }}
                          disabled={working === user.id}
                        >
                          Rename
                        </button>
                        <button
                          type="button"
                          className="inline-flex items-center gap-2 rounded-lg border border-outline bg-surface-container-lowest px-4 py-2 text-sm font-medium text-on-surface shadow-sm transition-colors hover:bg-surface-container"
                          onClick={() => {
                            const nextPassword = window.prompt('Set a new temporary password (min 8 chars)');
                            if (nextPassword && nextPassword.length >= 8) {
                              void patchUser(user, { password: nextPassword });
                            }
                          }}
                          disabled={working === user.id}
                        >
                          Set Temp Password
                        </button>
                        <button type="button" className="inline-flex items-center gap-2 rounded-lg border border-emerald-500 bg-emerald-500 text-white px-4 py-2 text-sm font-semibold shadow-sm transition-colors hover:bg-emerald-600" onClick={() => void issueReset(user)} disabled={working === `reset:${user.id}`}>
                          {working === `reset:${user.id}` ? 'Issuing...' : 'Issue Reset Link'}
                        </button>
                        {user.pendingReset ? (
                          <button type="button" className="inline-flex items-center gap-2 rounded-lg border border-outline bg-surface-container-lowest px-4 py-2 text-sm font-medium text-on-surface shadow-sm transition-colors hover:bg-surface-container" onClick={() => void revokeReset(user)} disabled={working === `revoke:${user.id}`}>
                            {working === `revoke:${user.id}` ? 'Revoking...' : 'Revoke Reset'}
                          </button>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </main>
  );
}
