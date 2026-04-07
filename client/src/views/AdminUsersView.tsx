import { useCallback, useEffect, useMemo, useState } from 'react';
import type { UserRole } from '../auth/AuthContext';
import { useAuth } from '../auth/AuthContext';
import { apiGet, apiPatch, apiPost } from '../utils/api';
import './AdminUsersView.css';

type AccessScope = 'all' | 'standard' | 'projects';

interface ManagedUser {
  id: number;
  username: string;
  role: UserRole;
  accessScope: AccessScope;
  createdAt?: string | null;
  updatedAt?: string | null;
}

interface CreateUserFormState {
  username: string;
  password: string;
  role: UserRole;
  accessScope: AccessScope;
}

const ROLE_OPTIONS: Array<{ value: UserRole; label: string; description: string }> = [
  { value: 'admin', label: 'Admin', description: 'Plný přístup včetně správy uživatelů' },
  { value: 'manager', label: 'Manager', description: 'Rozšířený interní přístup bez admin sekce' },
  { value: 'employee', label: 'Employee', description: 'Standardní interní uživatel' },
  { value: 'salesman', label: 'Salesman', description: 'Omezený pracovní režim' },
  { value: 'viewer', label: 'Viewer', description: 'Pouze pro čtení' },
];

const ACCESS_SCOPE_OPTIONS: Array<{ value: AccessScope; label: string; description: string }> = [
  { value: 'all', label: 'Obojí', description: 'Normální systém i Projekty' },
  { value: 'standard', label: 'Standard', description: 'Jen normální zakázky a subjekty' },
  { value: 'projects', label: 'Projekty', description: 'Jen Projekty zakázky a subjekty' },
];

const formatDateTime = (value?: string | null): string => {
  if (!value) {
    return 'Neznámé';
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return 'Neznámé';
  }

  return new Intl.DateTimeFormat('cs-CZ', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(date);
};

const INITIAL_CREATE_FORM: CreateUserFormState = {
  username: '',
  password: '',
  role: 'employee',
  accessScope: 'all',
};

export default function AdminUsersView() {
  const { user } = useAuth();
  const [users, setUsers] = useState<ManagedUser[]>([]);
  const [draftRoles, setDraftRoles] = useState<Record<number, UserRole>>({});
  const [draftScopes, setDraftScopes] = useState<Record<number, AccessScope>>({});
  const [passwordDrafts, setPasswordDrafts] = useState<Record<number, string>>({});
  const [createForm, setCreateForm] = useState<CreateUserFormState>(INITIAL_CREATE_FORM);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [savingById, setSavingById] = useState<Record<number, boolean>>({});
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const loadUsers = useCallback(async (refresh = false) => {
    if (refresh) {
      setIsRefreshing(true);
    } else {
      setIsLoading(true);
    }

    setError(null);

    try {
      const data = await apiGet<ManagedUser[]>('/users');
      const rows = Array.isArray(data) ? data : [];
      setUsers(rows);
      setDraftRoles(
        rows.reduce<Record<number, UserRole>>((accumulator, row) => {
          accumulator[row.id] = row.role;
          return accumulator;
        }, {})
      );
      setDraftScopes(
        rows.reduce<Record<number, AccessScope>>((accumulator, row) => {
          accumulator[row.id] = row.accessScope;
          return accumulator;
        }, {})
      );
      setPasswordDrafts(
        rows.reduce<Record<number, string>>((accumulator, row) => {
          accumulator[row.id] = '';
          return accumulator;
        }, {})
      );
    } catch (loadError) {
      console.error('Failed to load users:', loadError);
      setError(loadError instanceof Error ? loadError.message : 'Nepodařilo se načíst uživatele.');
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, []);

  useEffect(() => {
    loadUsers();
  }, [loadUsers]);

  const counts = useMemo(() => {
    return users.reduce(
      (accumulator, currentUser) => {
        accumulator.total += 1;
        accumulator[currentUser.accessScope] += 1;
        return accumulator;
      },
      { total: 0, all: 0, standard: 0, projects: 0 }
    );
  }, [users]);

  const handleScopeChange = (userId: number, nextScope: AccessScope) => {
    setDraftScopes((current) => ({
      ...current,
      [userId]: nextScope,
    }));
    setSuccessMessage(null);
  };

  const handleRoleChange = (userId: number, nextRole: UserRole) => {
    setDraftRoles((current) => ({
      ...current,
      [userId]: nextRole,
    }));
    setSuccessMessage(null);
  };

  const handlePasswordDraftChange = (userId: number, nextPassword: string) => {
    setPasswordDrafts((current) => ({
      ...current,
      [userId]: nextPassword,
    }));
    setSuccessMessage(null);
  };

  const handleCreateFormChange = <K extends keyof CreateUserFormState>(field: K, value: CreateUserFormState[K]) => {
    setCreateForm((current) => ({
      ...current,
      [field]: value,
    }));
    setSuccessMessage(null);
  };

  const handleSave = async (managedUser: ManagedUser) => {
    const nextRole = draftRoles[managedUser.id] ?? managedUser.role;
    const nextScope = draftScopes[managedUser.id] ?? managedUser.accessScope;
    if (nextRole === managedUser.role && nextScope === managedUser.accessScope) {
      return;
    }

    setSavingById((current) => ({ ...current, [managedUser.id]: true }));
    setError(null);
    setSuccessMessage(null);

    try {
      const updatedUser = await apiPatch<ManagedUser>(`/users/${managedUser.id}`, {
        role: nextRole,
        accessScope: nextScope,
      });
      setUsers((current) => current.map((entry) => (entry.id === managedUser.id ? updatedUser : entry)));
      setDraftRoles((current) => ({
        ...current,
        [managedUser.id]: updatedUser.role,
      }));
      setDraftScopes((current) => ({
        ...current,
        [managedUser.id]: updatedUser.accessScope,
      }));
      setSuccessMessage(`Uživatel ${managedUser.username} byl upraven.`);
    } catch (saveError) {
      console.error('Failed to update user settings:', saveError);
      setError(saveError instanceof Error ? saveError.message : 'Nepodařilo se uložit změny.');
    } finally {
      setSavingById((current) => ({ ...current, [managedUser.id]: false }));
    }
  };

  const handleCreateUser = async () => {
    const username = createForm.username.trim();
    const password = createForm.password.trim();

    if (!username || !password) {
      setError('U nového uživatele vyplňte uživatelské jméno i heslo.');
      return;
    }

    setIsCreating(true);
    setError(null);
    setSuccessMessage(null);

    try {
      const createdUser = await apiPost<ManagedUser>('/users', {
        username,
        password,
        role: createForm.role,
        accessScope: createForm.accessScope,
      });

      setUsers((current) => [createdUser, ...current]);
      setDraftRoles((current) => ({ ...current, [createdUser.id]: createdUser.role }));
      setDraftScopes((current) => ({ ...current, [createdUser.id]: createdUser.accessScope }));
      setPasswordDrafts((current) => ({ ...current, [createdUser.id]: '' }));
      setCreateForm(INITIAL_CREATE_FORM);
      setSuccessMessage(`Uživatel ${createdUser.username} byl vytvořen.`);
    } catch (createError) {
      console.error('Failed to create user:', createError);
      setError(createError instanceof Error ? createError.message : 'Nepodařilo se vytvořit uživatele.');
    } finally {
      setIsCreating(false);
    }
  };

  const handleResetPassword = async (managedUser: ManagedUser) => {
    const nextPassword = (passwordDrafts[managedUser.id] ?? '').trim();
    if (!nextPassword) {
      setError(`Zadejte nové heslo pro uživatele ${managedUser.username}.`);
      return;
    }

    setSavingById((current) => ({ ...current, [managedUser.id]: true }));
    setError(null);
    setSuccessMessage(null);

    try {
      await apiPatch<ManagedUser>(`/users/${managedUser.id}`, { password: nextPassword });
      setPasswordDrafts((current) => ({
        ...current,
        [managedUser.id]: '',
      }));
      setSuccessMessage(`Heslo uživatele ${managedUser.username} bylo změněno.`);
    } catch (saveError) {
      console.error('Failed to reset password:', saveError);
      setError(saveError instanceof Error ? saveError.message : 'Nepodařilo se změnit heslo.');
    } finally {
      setSavingById((current) => ({ ...current, [managedUser.id]: false }));
    }
  };

  if (user?.role !== 'admin') {
    return (
      <div className="admin-users-view">
        <div className="admin-users-card admin-users-card--narrow">
          <h1>Správa uživatelů</h1>
          <p>Tato sekce je dostupná pouze administrátorům.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="admin-users-view">
      <div className="admin-users-header">
        <div>
          <span className="admin-users-eyebrow">Admin</span>
          <h1>Správa uživatelů</h1>
          <p>Nastavte roli uživatele a určete, jestli vidí standardní systém, Projekty, nebo obojí.</p>
        </div>
        <button
          type="button"
          className="admin-users-refresh"
          onClick={() => loadUsers(true)}
          disabled={isRefreshing}
        >
          {isRefreshing ? 'Obnovuji…' : 'Obnovit'}
        </button>
      </div>

      <div className="admin-users-metrics">
        <div className="admin-users-metric">
          <span className="admin-users-metric-value">{counts.total}</span>
          <span className="admin-users-metric-label">Uživatelů celkem</span>
        </div>
        <div className="admin-users-metric">
          <span className="admin-users-metric-value">{counts.all}</span>
          <span className="admin-users-metric-label">Obojí</span>
        </div>
        <div className="admin-users-metric">
          <span className="admin-users-metric-value">{counts.standard}</span>
          <span className="admin-users-metric-label">Jen standard</span>
        </div>
        <div className="admin-users-metric">
          <span className="admin-users-metric-value">{counts.projects}</span>
          <span className="admin-users-metric-label">Jen Projekty</span>
        </div>
      </div>

      {error && <div className="admin-users-feedback admin-users-feedback--error">{error}</div>}
      {successMessage && <div className="admin-users-feedback admin-users-feedback--success">{successMessage}</div>}

      <div className="admin-users-card">
        <div className="admin-users-create-header">
          <div>
            <h2>Nový uživatel</h2>
            <p>Vytvořte účet a rovnou nastavte jeho roli i přístup do systému.</p>
          </div>
        </div>
        <div className="admin-users-create-grid">
          <label className="admin-users-scope-field">
            <span>Uživatelské jméno</span>
            <input
              type="text"
              value={createForm.username}
              onChange={(event) => handleCreateFormChange('username', event.target.value)}
              placeholder="napr. novak"
              autoComplete="username"
            />
          </label>
          <label className="admin-users-scope-field">
            <span>Počáteční heslo</span>
            <input
              type="password"
              value={createForm.password}
              onChange={(event) => handleCreateFormChange('password', event.target.value)}
              placeholder="Zadejte heslo"
              autoComplete="new-password"
            />
          </label>
          <label className="admin-users-scope-field">
            <span>Role</span>
            <select
              value={createForm.role}
              onChange={(event) => handleCreateFormChange('role', event.target.value as UserRole)}
            >
              {ROLE_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
          <label className="admin-users-scope-field">
            <span>Přístup</span>
            <select
              value={createForm.accessScope}
              onChange={(event) => handleCreateFormChange('accessScope', event.target.value as AccessScope)}
            >
              {ACCESS_SCOPE_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
        </div>
        <div className="admin-users-create-actions">
          <span className="admin-users-inline-note">
            Uživatel se vytvoří okamžitě a heslo bude uloženo jako nové přihlašovací heslo.
          </span>
          <button
            type="button"
            className="admin-users-save"
            onClick={handleCreateUser}
            disabled={isCreating}
          >
            {isCreating ? 'Vytvářím…' : 'Vytvořit uživatele'}
          </button>
        </div>
      </div>

      <div className="admin-users-card">
        {isLoading ? (
          <div className="admin-users-state">Načítání uživatelů…</div>
        ) : users.length === 0 ? (
          <div className="admin-users-state">Žádní uživatelé nebyli nalezeni.</div>
        ) : (
          <div className="admin-users-table-wrap">
            <table className="admin-users-table">
              <thead>
                <tr>
                  <th>Uživatel</th>
                  <th>Role</th>
                  <th>Přístup</th>
                  <th>Vytvořen</th>
                  <th>Aktualizován</th>
                  <th>Akce</th>
                </tr>
              </thead>
              <tbody>
                {users.map((managedUser) => {
                  const draftRole = draftRoles[managedUser.id] ?? managedUser.role;
                  const draftScope = draftScopes[managedUser.id] ?? managedUser.accessScope;
                  const passwordDraft = passwordDrafts[managedUser.id] ?? '';
                  const isDirty = draftRole !== managedUser.role || draftScope !== managedUser.accessScope;
                  const isSaving = savingById[managedUser.id] === true;
                  const isCurrentUser = managedUser.id === user.id;

                  return (
                    <tr key={managedUser.id}>
                      <td>
                        <div className="admin-users-identity">
                          <strong>{managedUser.username}</strong>
                          {isCurrentUser && <span className="admin-users-self-badge">Vy</span>}
                        </div>
                      </td>
                      <td>
                        <label className="admin-users-scope-field">
                          <select
                            value={draftRole}
                            onChange={(event) => handleRoleChange(managedUser.id, event.target.value as UserRole)}
                            disabled={isSaving || isCurrentUser}
                          >
                            {ROLE_OPTIONS.map((option) => (
                              <option key={option.value} value={option.value}>
                                {option.label}
                              </option>
                            ))}
                          </select>
                          <span>{ROLE_OPTIONS.find((option) => option.value === draftRole)?.description}</span>
                        </label>
                      </td>
                      <td>
                        <label className="admin-users-scope-field">
                          <select
                            value={draftScope}
                            onChange={(event) => handleScopeChange(managedUser.id, event.target.value as AccessScope)}
                            disabled={isSaving || isCurrentUser}
                          >
                            {ACCESS_SCOPE_OPTIONS.map((option) => (
                              <option key={option.value} value={option.value}>
                                {option.label}
                              </option>
                            ))}
                          </select>
                          <span>{ACCESS_SCOPE_OPTIONS.find((option) => option.value === draftScope)?.description}</span>
                        </label>
                      </td>
                      <td>{formatDateTime(managedUser.createdAt)}</td>
                      <td>{formatDateTime(managedUser.updatedAt)}</td>
                      <td>
                        <div className="admin-users-actions-cell">
                          <button
                            type="button"
                            className="admin-users-save"
                            onClick={() => handleSave(managedUser)}
                            disabled={!isDirty || isSaving || isCurrentUser}
                          >
                            {isSaving ? 'Ukládám…' : 'Uložit'}
                          </button>
                          <label className="admin-users-password-field">
                            <span>Nové heslo</span>
                            <input
                              type="password"
                              value={passwordDraft}
                              onChange={(event) => handlePasswordDraftChange(managedUser.id, event.target.value)}
                              placeholder="Změna hesla"
                              autoComplete="new-password"
                              disabled={isSaving}
                            />
                          </label>
                          <button
                            type="button"
                            className="admin-users-save admin-users-save--secondary"
                            onClick={() => handleResetPassword(managedUser)}
                            disabled={!passwordDraft.trim() || isSaving}
                          >
                            {isSaving ? 'Ukládám…' : 'Nastavit heslo'}
                          </button>
                          {isCurrentUser && <div className="admin-users-inline-note">Vlastní roli ani přístup zde nelze měnit.</div>}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}