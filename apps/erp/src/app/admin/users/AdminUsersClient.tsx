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
      <main className="admin-page">
        <section className="admin-page-header">
          <div>
            <h1 className="admin-page-title">Owner and Staff Access</h1>
            <p className="admin-page-subtitle">Loading access control data.</p>
          </div>
        </section>
      </main>
    );
  }

  return (
    <main className="admin-page">
      <section className="admin-page-header">
        <div>
          <h1 className="admin-page-title">Owner and Staff Access</h1>
          <p className="admin-page-subtitle">Approve staff registrations, create accounts directly, and manage credential state.</p>
        </div>
        <div className="admin-toolbar">
          <span className="admin-badge">{stats.active} active accounts</span>
          <span className="admin-badge">{stats.owners} owners</span>
          <span className="admin-badge">{stats.pendingRequests} pending requests</span>
          <span className="admin-badge">{stats.pendingResets} pending resets</span>
          <span className="admin-badge">{stats.forcedPasswordChange} must change password</span>
        </div>
      </section>

      {message ? <div className="auth-alert auth-alert-success">{message}</div> : null}
      {error ? <div className="auth-alert auth-alert-error">{error}</div> : null}

      {resetLink ? (
        <section className="admin-panel cute-surface">
          <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
            <div>
              <div className="text-sm font-semibold text-slate-900">Reset Link Issued for {resetLink.username}</div>
              <div className="text-sm text-slate-500">Expires {new Date(resetLink.expiresAt).toLocaleString('en-GB')}</div>
            </div>
            <button type="button" className="admin-button admin-button-primary" onClick={() => navigator.clipboard.writeText(resetLink.url)}>
              Copy Reset Link
            </button>
          </div>
          <div className="mt-3 rounded-3xl border border-indigo-100 bg-indigo-50/60 px-4 py-3 text-sm text-slate-600">{resetLink.url}</div>
        </section>
      ) : null}

      {pendingRequests.length > 0 ? (
        <section className="admin-card cute-surface">
          <div className="admin-card-header">
            <div className="admin-card-title">Pending Staff Registration</div>
          </div>
          <div className="overflow-x-auto">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Applicant</th>
                  <th>Requested At</th>
                  <th>Decision</th>
                </tr>
              </thead>
              <tbody>
                {pendingRequests.map((request) => (
                  <tr key={request.id}>
                    <td>
                      <div className="font-medium text-slate-900">{request.displayName}</div>
                      <div className="text-xs text-slate-500">{request.username}{request.email ? ` | ${request.email}` : ''}</div>
                    </td>
                    <td>{new Date(request.createdAt).toLocaleString('en-GB')}</td>
                    <td>
                      <div className="flex flex-wrap gap-2">
                        <button type="button" className="admin-button admin-button-primary" onClick={() => void approveRequest(request)} disabled={working === `approve:${request.id}`}>
                          {working === `approve:${request.id}` ? 'Approving...' : 'Approve'}
                        </button>
                        <button type="button" className="admin-button" onClick={() => void rejectRequest(request)} disabled={working === `reject:${request.id}`}>
                          {working === `reject:${request.id}` ? 'Rejecting...' : 'Reject'}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}

      <div className="grid gap-6 xl:grid-cols-[420px_minmax(0,1fr)]">
        <section className="admin-card cute-surface">
          <div className="admin-card-header">
            <div className="admin-card-title">Owner-Created Account</div>
          </div>
          <form className="grid gap-4 p-4" onSubmit={createUser}>
            <div>
              <label className="mb-2 block text-sm font-medium text-slate-700">Display Name</label>
              <input className="admin-input" value={createForm.displayName} onChange={(e) => setCreateForm((prev) => ({ ...prev, displayName: e.target.value }))} placeholder="Operations Staff" />
            </div>
            <div>
              <label className="mb-2 block text-sm font-medium text-slate-700">Username</label>
              <input className="admin-input" value={createForm.username} onChange={(e) => setCreateForm((prev) => ({ ...prev, username: e.target.value }))} placeholder="ops.staff" />
            </div>
            <div>
              <label className="mb-2 block text-sm font-medium text-slate-700">Email</label>
              <input className="admin-input" value={createForm.email} onChange={(e) => setCreateForm((prev) => ({ ...prev, email: e.target.value }))} placeholder="staff@example.com" />
            </div>
            <div>
              <label className="mb-2 block text-sm font-medium text-slate-700">Role</label>
              <select className="admin-select" value={createForm.role} onChange={(e) => setCreateForm((prev) => ({ ...prev, role: e.target.value as 'ADMIN' | 'STAFF' }))}>
                <option value="STAFF">Staff</option>
                <option value="ADMIN">Owner</option>
              </select>
            </div>
            <div>
              <label className="mb-2 block text-sm font-medium text-slate-700">Temporary Password</label>
              <input className="admin-input" type="password" value={createForm.password} onChange={(e) => setCreateForm((prev) => ({ ...prev, password: e.target.value }))} placeholder="Minimum 8 characters" />
            </div>
            <div className="rounded-3xl border border-sky-100 bg-sky-50 px-4 py-3 text-sm text-sky-800">
              Newly created accounts are forced to change this temporary password on first sign-in.
            </div>
            <button className="admin-button admin-button-primary" disabled={working === 'create-user'}>
              {working === 'create-user' ? 'Creating...' : 'Create Account'}
            </button>
          </form>
        </section>

        <section className="admin-card cute-surface">
          <div className="admin-card-header">
            <div className="admin-card-title">Approved Accounts</div>
          </div>
          <div className="overflow-x-auto">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>User</th>
                  <th>Role</th>
                  <th>Status</th>
                  <th>Password State</th>
                  <th>Reset</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {users.map((user) => (
                  <tr key={user.id}>
                    <td>
                      <div className="font-medium text-slate-900">{user.displayName}</div>
                      <div className="text-xs text-slate-500">{user.username}{user.email ? ` | ${user.email}` : ''}</div>
                    </td>
                    <td>
                      <select className="admin-select" value={user.role} onChange={(e) => void patchUser(user, { role: e.target.value })} disabled={working === user.id}>
                        <option value="ADMIN">Owner</option>
                        <option value="STAFF">Staff</option>
                      </select>
                    </td>
                    <td>
                      <button type="button" className={`admin-button ${user.isActive ? '' : 'admin-status-bad'}`} onClick={() => void patchUser(user, { isActive: !user.isActive })} disabled={working === user.id}>
                        {user.isActive ? 'Active' : 'Inactive'}
                      </button>
                    </td>
                    <td>
                      <div className={`admin-badge ${user.forcePasswordChange ? 'admin-status-warn' : ''}`}>
                        {user.forcePasswordChange ? 'Temporary password' : 'Up to date'}
                      </div>
                    </td>
                    <td>
                      {user.pendingReset ? (
                        <div className="text-xs text-slate-500">Pending until {new Date(user.pendingReset.expiresAt).toLocaleString('en-GB')}</div>
                      ) : (
                        <div className="text-xs text-slate-400">No active reset link</div>
                      )}
                    </td>
                    <td>
                      <div className="flex flex-wrap gap-2">
                        <button
                          type="button"
                          className="admin-button"
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
                          className="admin-button"
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
                        <button type="button" className="admin-button admin-button-primary" onClick={() => void issueReset(user)} disabled={working === `reset:${user.id}`}>
                          {working === `reset:${user.id}` ? 'Issuing...' : 'Issue Reset Link'}
                        </button>
                        {user.pendingReset ? (
                          <button type="button" className="admin-button" onClick={() => void revokeReset(user)} disabled={working === `revoke:${user.id}`}>
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
        </section>
      </div>
    </main>
  );
}
