'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, Key, Shield, UserPlus, Users } from 'lucide-react';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type AdminUser = {
  id: string;
  username: string;
  displayName: string;
  email?: string | null;
  role: string;
  createdAt: string;
  updatedAt: string;
  pendingReset?: {
    id: string;
    createdAt: string;
    expiresAt: string;
  } | null;
  isActive: boolean;
};

type CreateForm = {
  username: string;
  displayName: string;
  email: string;
  password: string;
  role: string;
};

const EMPTY_FORM: CreateForm = {
  username: '',
  displayName: '',
  email: '',
  password: '',
  role: 'STAFF',
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatDate(dateStr: string | null): string {
  if (!dateStr) return '—';
  return new Date(dateStr).toLocaleDateString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

function roleBadgeClass(role: string): string {
  if (role === 'ADMIN' || role === 'OWNER') {
    return 'inline-flex items-center gap-1 rounded-full bg-violet-100 px-2.5 py-0.5 text-xs font-semibold text-violet-700';
  }
  return 'inline-flex items-center gap-1 rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-semibold text-slate-600';
}

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------

export default function AdminUsersSettingsPage() {
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [apiUnavailable, setApiUnavailable] = useState(false);

  // Create form state
  const [form, setForm] = useState<CreateForm>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // ---------------------------------------------------------------------------
  // Load users
  // ---------------------------------------------------------------------------

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    setApiUnavailable(false);
    try {
      const res = await fetch('/api/admin/users?page=1&pageSize=50', {
        cache: 'no-store',
      });
      if (res.status === 404) {
        setApiUnavailable(true);
        setUsers([]);
        return;
      }
      const json = (await res.json()) as {
        success: boolean;
        data?: { users?: AdminUser[] } | AdminUser[];
        error?: { message?: string };
      };
      if (!json.success) {
        throw new Error(json.error?.message ?? 'Unable to load users');
      }
      const payload = json.data;
      if (Array.isArray(payload)) {
        setUsers(payload);
      } else if (payload && Array.isArray((payload as { users?: AdminUser[] }).users)) {
        setUsers((payload as { users: AdminUser[] }).users);
      } else {
        setUsers([]);
      }
    } catch (err) {
      if (err instanceof TypeError) {
        // Network error — treat as unavailable
        setApiUnavailable(true);
        setUsers([]);
      } else {
        setError(err instanceof Error ? err.message : 'Unable to load users');
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  // ---------------------------------------------------------------------------
  // Create user
  // ---------------------------------------------------------------------------

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setFormError(null);
    setSuccessMessage(null);

    if (!form.username.trim()) {
      setFormError('Username is required.');
      return;
    }
    if (!form.displayName.trim()) {
      setFormError('Display name is required.');
      return;
    }
    if (form.password.length < 8) {
      setFormError('Password must be at least 8 characters.');
      return;
    }

    setSaving(true);
    try {
      const res = await fetch('/api/admin/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: form.username.trim(),
          displayName: form.displayName.trim(),
          email: form.email.trim(),
          password: form.password,
          role: form.role,
        }),
      });
      const json = (await res.json()) as {
        success: boolean;
        error?: { message?: string };
      };
      if (!json.success) {
        throw new Error(json.error?.message ?? 'Unable to create user');
      }
      setSuccessMessage(`User "${form.username.trim()}" created successfully.`);
      setForm(EMPTY_FORM);
      await load();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Unable to create user');
    } finally {
      setSaving(false);
    }
  }

  function field(key: keyof CreateForm, value: string) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  return (
    <main className="admin-page">
      {/* Header */}
      <section className="admin-page-header">
        <div className="flex items-center gap-3">
          <Link
            href="/admin/settings"
            className="flex h-9 w-9 items-center justify-center rounded-xl border border-slate-200 bg-white shadow-sm hover:bg-slate-50"
          >
            <ArrowLeft className="h-4 w-4 text-slate-600" />
          </Link>
          <div>
            <h1 className="admin-page-title">Admin Users</h1>
            <p className="admin-page-subtitle">
              Manage administrator accounts, roles, and access control.
            </p>
          </div>
        </div>
        <button onClick={() => void load()} className="admin-button" disabled={loading}>
          {loading ? 'Loading...' : 'Refresh'}
        </button>
      </section>

      {/* Global alerts */}
      {successMessage && (
        <div className="auth-alert auth-alert-success">{successMessage}</div>
      )}
      {error && <div className="auth-alert auth-alert-error">{error}</div>}

      {/* API unavailable notice */}
      {apiUnavailable && (
        <div className="flex items-start gap-3 rounded-2xl border border-amber-200 bg-amber-50 px-5 py-4 text-sm text-amber-800">
          <Shield className="mt-0.5 h-4 w-4 shrink-0" />
          <span>
            User management API not available. You can manage users directly via database or CLI.
            The{' '}
            <code className="rounded bg-amber-100 px-1 font-mono text-xs">
              /api/admin/users
            </code>{' '}
            endpoint returned 404 — implement the route or use a database seed script to manage
            admin accounts.
          </span>
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Users table */}
        <section className="admin-card overflow-hidden lg:col-span-2">
          <div className="admin-card-header">
            <div className="flex items-center gap-2">
              <Users className="h-4 w-4 text-slate-500" />
              <div className="admin-card-title">All Admin Users</div>
            </div>
            <span className="admin-badge">{users.length} users</span>
          </div>

          <div className="overflow-auto">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Username</th>
                  <th>Display Name</th>
                  <th>Role</th>
                  <th>Status</th>
                  <th>Password Reset</th>
                  <th>Updated</th>
                  <th>Created</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  // Loading skeleton rows
                  Array.from({ length: 4 }).map((_, i) => (
                    <tr key={i}>
                      <td>
                        <div className="h-4 w-28 animate-pulse rounded bg-slate-100" />
                      </td>
                      <td>
                        <div className="h-4 w-20 animate-pulse rounded bg-slate-100" />
                      </td>
                      <td>
                        <div className="h-4 w-14 animate-pulse rounded bg-slate-100" />
                      </td>
                      <td>
                        <div className="h-4 w-24 animate-pulse rounded bg-slate-100" />
                      </td>
                      <td>
                        <div className="h-4 w-24 animate-pulse rounded bg-slate-100" />
                      </td>
                      <td>
                        <div className="h-4 w-24 animate-pulse rounded bg-slate-100" />
                      </td>
                      <td>
                        <div className="h-4 w-24 animate-pulse rounded bg-slate-100" />
                      </td>
                    </tr>
                  ))
                ) : users.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="py-10 text-center text-slate-500">
                      {apiUnavailable
                        ? 'Cannot retrieve users — API unavailable.'
                        : 'No admin users found.'}
                    </td>
                  </tr>
                ) : (
                  users.map((user) => (
                    <tr key={user.id}>
                      <td>
                        <div className="flex items-center gap-2">
                          <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-violet-100 text-xs font-bold text-violet-700">
                            {user.username.charAt(0).toUpperCase()}
                          </div>
                          <div>
                            <div className="font-medium text-slate-800">{user.username}</div>
                            {user.email ? (
                              <div className="text-xs text-slate-400">{user.email}</div>
                            ) : null}
                          </div>
                        </div>
                      </td>
                      <td className="text-sm text-slate-600">{user.displayName}</td>
                      <td>
                        <span className={roleBadgeClass(user.role)}>
                          <Shield className="h-3 w-3" />
                          {user.role}
                        </span>
                      </td>
                      <td>
                        {user.isActive ? (
                          <span className="inline-flex rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-semibold text-emerald-700">
                            Active
                          </span>
                        ) : (
                          <span className="inline-flex rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-semibold text-slate-500">
                            Inactive
                          </span>
                      )}
                      </td>
                      <td className="text-sm text-slate-500">
                        {user.pendingReset ? 'Pending' : 'None'}
                      </td>
                      <td className="text-sm text-slate-500">
                        {formatDate(user.updatedAt)}
                      </td>
                      <td className="text-sm text-slate-500">
                        {formatDate(user.createdAt)}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </section>

        {/* Create user form */}
        <section className="admin-card h-fit">
          <div className="admin-card-header">
            <div className="flex items-center gap-2">
              <UserPlus className="h-4 w-4 text-slate-500" />
              <div className="admin-card-title">Create User</div>
            </div>
          </div>

          <form onSubmit={(e) => void handleCreate(e)} className="flex flex-col gap-4 p-4">
            {formError && (
              <div className="auth-alert auth-alert-error">{formError}</div>
            )}

            <div>
              <label className="mb-1.5 block text-sm font-medium text-slate-700">
                Username <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                className="admin-input"
                placeholder="e.g. manager01"
                value={form.username}
                onChange={(e) => field('username', e.target.value)}
                autoComplete="off"
                required
              />
            </div>

            <div>
              <label className="mb-1.5 block text-sm font-medium text-slate-700">
                Display Name <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                className="admin-input"
                placeholder="e.g. Building Manager"
                value={form.displayName}
                onChange={(e) => field('displayName', e.target.value)}
                autoComplete="name"
                required
              />
            </div>

            <div>
              <label className="mb-1.5 block text-sm font-medium text-slate-700">
                Email <span className="text-slate-400 font-normal">(optional)</span>
              </label>
              <input
                type="email"
                className="admin-input"
                placeholder="e.g. manager@example.com"
                value={form.email}
                onChange={(e) => field('email', e.target.value)}
                autoComplete="email"
              />
            </div>

            <div>
              <label className="mb-1.5 block text-sm font-medium text-slate-700">
                Password <span className="text-red-500">*</span>
              </label>
              <div className="relative">
                <Key className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <input
                  type="password"
                  className="admin-input pl-9"
                  placeholder="Min 8 chars"
                  value={form.password}
                  onChange={(e) => field('password', e.target.value)}
                  autoComplete="new-password"
                  required
                  minLength={8}
                />
              </div>
            </div>

            <div>
              <label className="mb-1.5 block text-sm font-medium text-slate-700">
                Role <span className="text-red-500">*</span>
              </label>
              <select
                className="admin-input"
                value={form.role}
                onChange={(e) => field('role', e.target.value)}
              >
                <option value="ADMIN">ADMIN</option>
                <option value="STAFF">STAFF</option>
              </select>
            </div>

            <button
              type="submit"
              className="admin-button admin-button-primary mt-1"
              disabled={saving || apiUnavailable}
            >
              <UserPlus className="h-4 w-4" />
              {saving ? 'Creating...' : 'Create User'}
            </button>

            {apiUnavailable && (
              <p className="text-center text-xs text-slate-400">
                Disabled — API unavailable
              </p>
            )}
          </form>
        </section>
      </div>
    </main>
  );
}
