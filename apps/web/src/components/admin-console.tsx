"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";

type AdminUser = {
  id: string;
  email: string;
  displayName: string | null;
  role: string;
  status: string;
  notes: string | null;
  lastSeenAt: string | null;
  createdAt: string;
  updatedAt: string;
};

type AdminSetting = {
  key: string;
  label: string;
  description: string;
  kind: "text" | "number" | "secret";
  value: string;
  placeholder?: string;
  isSet?: boolean;
};

type AdminMeResponse = {
  user: AdminUser | null;
  isAdmin: boolean;
};

type UsersResponse = {
  users?: AdminUser[];
  user?: AdminUser;
  error?: string;
};

type SettingsResponse = {
  settings?: AdminSetting[];
  error?: string;
};

function formatDateTime(value: string | null) {
  if (!value) {
    return "Never";
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short"
  }).format(date);
}

function formatStatus(value: string) {
  return value.slice(0, 1).toUpperCase() + value.slice(1);
}

export function AdminConsole() {
  const [viewer, setViewer] = useState<AdminUser | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [settings, setSettings] = useState<AdminSetting[]>([]);
  const [userDrafts, setUserDrafts] = useState<Record<string, Partial<AdminUser>>>({});
  const [settingDrafts, setSettingDrafts] = useState<Record<string, string>>({});
  const [newUserDraft, setNewUserDraft] = useState({
    email: "",
    displayName: "",
    role: "member",
    status: "active",
    notes: ""
  });
  const [isLoading, setIsLoading] = useState(true);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [isCreatingUser, setIsCreatingUser] = useState(false);
  const [isSavingSettings, setIsSavingSettings] = useState(false);
  const [message, setMessage] = useState("");
  const [expandedUserId, setExpandedUserId] = useState<string | null>(null);

  const visibleSettings = useMemo(
    () => settings.map((setting) => ({
      ...setting,
      draftValue: settingDrafts[setting.key] ?? setting.value
    })),
    [settings, settingDrafts]
  );

  async function loadAdminData() {
    setIsLoading(true);
    setMessage("");

    const meResponse = await fetch("/api/admin/me", { cache: "no-store" });
    const mePayload = (await meResponse.json().catch(() => ({}))) as AdminMeResponse;
    setViewer(mePayload.user || null);
    setIsAdmin(Boolean(mePayload.isAdmin));

    if (!meResponse.ok || !mePayload.isAdmin) {
      setIsLoading(false);
      return;
    }

    const [usersResponse, settingsResponse] = await Promise.all([
      fetch("/api/admin/users", { cache: "no-store" }),
      fetch("/api/admin/settings", { cache: "no-store" })
    ]);
    const usersPayload = (await usersResponse.json().catch(() => ({}))) as UsersResponse;
    const settingsPayload = (await settingsResponse.json().catch(() => ({}))) as SettingsResponse;

    if (usersPayload.users) {
      setUsers(usersPayload.users);
      setUserDrafts(Object.fromEntries(usersPayload.users.map((user) => [user.id, {
        displayName: user.displayName || "",
        role: user.role,
        status: user.status,
        notes: user.notes || ""
      }])));
    }

    if (settingsPayload.settings) {
      setSettings(settingsPayload.settings);
      setSettingDrafts(Object.fromEntries(settingsPayload.settings.map((setting) => [setting.key, setting.value || ""])));
    }

    setIsLoading(false);
  }

  useEffect(() => {
    loadAdminData().catch((error) => {
      setMessage(error instanceof Error ? error.message : "Could not load admin data.");
      setIsLoading(false);
    });
  }, []);

  async function handleCreateUser(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsCreatingUser(true);
    setMessage("");

    const response = await fetch("/api/admin/users", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(newUserDraft)
    });
    const payload = (await response.json().catch(() => ({}))) as UsersResponse;

    if (!response.ok || !payload.user) {
      setMessage(payload.error || "Could not create user.");
      setIsCreatingUser(false);
      return;
    }

    setUsers((current) => [...current, payload.user as AdminUser].sort((a, b) => a.email.localeCompare(b.email)));
    setUserDrafts((current) => ({
      ...current,
      [payload.user!.id]: {
        displayName: payload.user!.displayName || "",
        role: payload.user!.role,
        status: payload.user!.status,
        notes: payload.user!.notes || ""
      }
    }));
    setNewUserDraft({ email: "", displayName: "", role: "member", status: "active", notes: "" });
    setExpandedUserId(payload.user.id);
    setMessage("User created.");
    setIsCreatingUser(false);
  }

  async function handleSaveUser(user: AdminUser) {
    const draft = userDrafts[user.id] || {};
    setSavingId(user.id);
    setMessage("");

    const response = await fetch(`/api/admin/users/${user.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(draft)
    });
    const payload = (await response.json().catch(() => ({}))) as UsersResponse;

    if (!response.ok || !payload.user) {
      setMessage(payload.error || "Could not update user.");
      setSavingId(null);
      return;
    }

    setUsers((current) => current.map((item) => item.id === payload.user!.id ? payload.user! : item));
    setUserDrafts((current) => ({
      ...current,
      [payload.user!.id]: {
        displayName: payload.user!.displayName || "",
        role: payload.user!.role,
        status: payload.user!.status,
        notes: payload.user!.notes || ""
      }
    }));
    setMessage("User saved.");
    setSavingId(null);
  }

  async function handleSaveSettings(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSavingSettings(true);
    setMessage("");

    const response = await fetch("/api/admin/settings", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(settingDrafts)
    });
    const payload = (await response.json().catch(() => ({}))) as SettingsResponse;

    if (!response.ok || !payload.settings) {
      setMessage(payload.error || "Could not update settings.");
      setIsSavingSettings(false);
      return;
    }

    setSettings(payload.settings);
    setSettingDrafts(Object.fromEntries(payload.settings.map((setting) => [setting.key, setting.value || ""])));
    setMessage("Settings saved to .env.local.");
    setIsSavingSettings(false);
  }

  if (isLoading) {
    return (
      <main className="admin-shell">
        <section className="admin-card">
          <p className="muted-text">Loading admin console...</p>
        </section>
      </main>
    );
  }

  if (!isAdmin) {
    return (
      <main className="admin-shell">
        <section className="admin-card">
          <p className="admin-eyebrow">Admin</p>
          <h1>Access restricted</h1>
          <p className="muted-text">
            {viewer ? `${viewer.email} is signed in but does not have admin access.` : "No signed-in user was detected."}
          </p>
          <a className="admin-link-button" href="/">Back to workspace</a>
        </section>
      </main>
    );
  }

  return (
    <main className="admin-shell">
      <header className="admin-header">
        <div>
          <p className="admin-eyebrow">Admin</p>
          <h1>User Management</h1>
          <p>{viewer ? `Signed in as ${viewer.email}` : "Manage users and runtime parameters."}</p>
        </div>
        <a className="admin-link-button" href="/">Back to workspace</a>
      </header>

      {message ? <div className="admin-message">{message}</div> : null}

      <section className="admin-grid">
        <div className="admin-card">
          <div className="admin-section-header">
            <div>
              <p className="admin-eyebrow">Users</p>
              <h2>Accounts</h2>
              <p>Manage who can use the app and who can change settings.</p>
            </div>
            <span className="admin-count-pill">{users.length} users</span>
          </div>

          <form className="admin-create-user" onSubmit={handleCreateUser}>
            <div className="admin-create-fields">
              <label>
                Email
                <input
                  type="email"
                  placeholder="email@example.com"
                  value={newUserDraft.email}
                  onChange={(event) => setNewUserDraft((current) => ({ ...current, email: event.target.value }))}
                />
              </label>
              <label>
                Name
                <input
                  placeholder="Display name"
                  value={newUserDraft.displayName}
                  onChange={(event) => setNewUserDraft((current) => ({ ...current, displayName: event.target.value }))}
                />
              </label>
              <label>
                Role
                <select
                  value={newUserDraft.role}
                  onChange={(event) => setNewUserDraft((current) => ({ ...current, role: event.target.value }))}
                >
                  <option value="member">Member</option>
                  <option value="admin">Admin</option>
                </select>
              </label>
            </div>
            <button type="submit" disabled={isCreatingUser}>{isCreatingUser ? "Adding..." : "Add User"}</button>
          </form>

          <div className="admin-user-list">
            {users.map((user) => {
              const draft = userDrafts[user.id] || {};
              const isExpanded = expandedUserId === user.id;
              return (
                <article className={`admin-user-row ${isExpanded ? "expanded" : ""}`} key={user.id}>
                  <div className="admin-user-summary">
                    <div>
                      <strong>{user.displayName || user.email}</strong>
                      <small>{user.displayName ? user.email : "No display name"}</small>
                    </div>
                    <div className="admin-user-badges">
                      <span className={`status-pill ${user.status}`}>{formatStatus(user.status)}</span>
                      <span className="role-pill">{formatStatus(user.role)}</span>
                    </div>
                    <small className="admin-user-last-seen">Last seen: {formatDateTime(user.lastSeenAt)}</small>
                    <button
                      type="button"
                      onClick={() => setExpandedUserId((current) => current === user.id ? null : user.id)}
                    >
                      {isExpanded ? "Close" : "Edit"}
                    </button>
                  </div>
                  {isExpanded ? (
                    <>
                      <div className="admin-user-fields">
                        <label>
                          Name
                          <input
                            placeholder="Display name"
                            value={String(draft.displayName ?? "")}
                            onChange={(event) => setUserDrafts((current) => ({
                              ...current,
                              [user.id]: { ...(current[user.id] || {}), displayName: event.target.value }
                            }))}
                          />
                        </label>
                        <label>
                          Role
                          <select
                            value={String(draft.role ?? user.role)}
                            onChange={(event) => setUserDrafts((current) => ({
                              ...current,
                              [user.id]: { ...(current[user.id] || {}), role: event.target.value }
                            }))}
                          >
                            <option value="member">Member</option>
                            <option value="admin">Admin</option>
                          </select>
                        </label>
                        <label>
                          Status
                          <select
                            value={String(draft.status ?? user.status)}
                            onChange={(event) => setUserDrafts((current) => ({
                              ...current,
                              [user.id]: { ...(current[user.id] || {}), status: event.target.value }
                            }))}
                          >
                            <option value="active">Active</option>
                            <option value="disabled">Disabled</option>
                          </select>
                        </label>
                        <label className="admin-notes-field">
                          Notes
                          <textarea
                            placeholder="Notes"
                            rows={3}
                            value={String(draft.notes ?? "")}
                            onChange={(event) => setUserDrafts((current) => ({
                              ...current,
                              [user.id]: { ...(current[user.id] || {}), notes: event.target.value }
                            }))}
                          />
                        </label>
                      </div>
                      <div className="admin-user-footer">
                        <small>Created: {formatDateTime(user.createdAt)}</small>
                        <button type="button" disabled={savingId === user.id} onClick={() => handleSaveUser(user)}>
                          {savingId === user.id ? "Saving..." : "Save Changes"}
                        </button>
                      </div>
                    </>
                  ) : null}
                </article>
              );
            })}
          </div>
        </div>

        <form className="admin-card" onSubmit={handleSaveSettings}>
          <div className="admin-section-header">
            <div>
              <p className="admin-eyebrow">Parameters</p>
              <h2>.env.local</h2>
              <p>Changes are saved to the server environment file.</p>
            </div>
            <button type="submit" disabled={isSavingSettings}>{isSavingSettings ? "Saving..." : "Save Settings"}</button>
          </div>

          <div className="admin-settings-list">
            {visibleSettings.map((setting) => (
              <label className="admin-setting-row" key={setting.key}>
                <span>
                  <strong>{setting.label}</strong>
                  <small>{setting.description}</small>
                  {setting.kind === "secret" && setting.isSet ? <small>Current value is set.</small> : null}
                </span>
                <input
                  type={setting.kind === "number" ? "number" : setting.kind === "secret" ? "password" : "text"}
                  placeholder={setting.placeholder}
                  value={setting.draftValue}
                  onChange={(event) => setSettingDrafts((current) => ({
                    ...current,
                    [setting.key]: event.target.value
                  }))}
                />
              </label>
            ))}
          </div>
        </form>
      </section>
    </main>
  );
}
