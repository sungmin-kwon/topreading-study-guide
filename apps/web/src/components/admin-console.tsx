"use client";

import { FormEvent, useEffect, useState } from "react";
import "./live-workspace.css";
import "./admin-console.css";

type AdminUser = {
  id: string; email: string; displayName: string | null; role: string; status: string;
  createdAt: string;
};
type UserDraft = { displayName: string; role: string; status: string };
type AdminSetting = { key: string; label: string; kind: "select" | "number"; value: string; options?: string[] };
type Notice = { text: string; error?: boolean };
const draftFor = (user: AdminUser): UserDraft => ({ displayName: user.displayName || "", role: user.role, status: user.status });
const emptyUser = { email: "", displayName: "", role: "member" };
class RequestError extends Error {
  constructor(message: string, readonly status: number) { super(message); }
}

async function request<T>(url: string, method = "GET", body?: unknown): Promise<T> {
  const response = await fetch(url, { method, cache: "no-store", ...(body === undefined ? {} : { headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }) });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new RequestError(data.error || "Request failed. Please try again.", response.status);
  return data as T;
}

export function AdminConsole() {
  const [viewer, setViewer] = useState<AdminUser | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [settings, setSettings] = useState<AdminSetting[]>([]);
  const [userDrafts, setUserDrafts] = useState<Record<string, UserDraft>>({});
  const [settingDrafts, setSettingDrafts] = useState<Record<string, string>>({});
  const [newUser, setNewUser] = useState(emptyUser);
  const [adding, setAdding] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadFailed, setLoadFailed] = useState(false);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [section, setSection] = useState<"users" | "settings">("users");
  const [search, setSearch] = useState("");
  const [theme, setTheme] = useState("light");
  const [language, setLanguage] = useState("en");
  const t = (en: string, ko: string) => language === "ko" ? ko : en;
  const errorNotice = (error: unknown) => setNotice({ error: true, text: error instanceof Error && !(error instanceof TypeError) ? error.message : t("Could not connect. Your changes are kept here; try again.", "연결하지 못했습니다. 수정한 내용은 유지됩니다. 다시 시도하세요.") });

  useEffect(() => {
    const storedTheme = localStorage.getItem("topreading-theme") || (matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");
    setTheme(storedTheme); document.documentElement.dataset.theme = storedTheme;
    setLanguage(localStorage.getItem("topreading-ui-language") || (navigator.language.startsWith("ko") ? "ko" : "en"));
  }, []);

  async function load() {
    setLoading(true); setLoadFailed(false); setNotice(null);
    try {
      const me = await request<{ user: AdminUser | null; isAdmin: boolean }>("/api/admin/me");
      setViewer(me.user); setIsAdmin(me.isAdmin);
      if (!me.isAdmin) return;
      const [people, parameters] = await Promise.all([
        request<{ users: AdminUser[] }>("/api/admin/users"), request<{ settings: AdminSetting[] }>("/api/admin/settings")
      ]);
      setUsers(people.users); setSettings(parameters.settings);
      setUserDrafts(Object.fromEntries(people.users.map(user => [user.id, draftFor(user)])));
      setSettingDrafts(Object.fromEntries(parameters.settings.map(setting => [setting.key, setting.value])));
    } catch (error) {
      if (error instanceof RequestError && [401, 403].includes(error.status)) { setIsAdmin(false); setViewer(null); }
      else { setLoadFailed(true); errorNotice(error); }
    }
    finally { setLoading(false); }
  }
  useEffect(() => { void load(); }, []);

  async function createUser(event: FormEvent) {
    event.preventDefault(); if (busy) return;
    setBusy("create"); setNotice(null);
    try {
      const { user } = await request<{ user: AdminUser }>("/api/admin/users", "POST", newUser);
      setUsers(current => [...current, user]);
      setUserDrafts(current => ({ ...current, [user.id]: draftFor(user) }));
      setNewUser(emptyUser); setAdding(false); setSearch("");
      setNotice({ text: t("User added.", "사용자가 추가되었습니다.") });
    } catch (error) { errorNotice(error); }
    finally { setBusy(null); }
  }
  async function saveUser(event: FormEvent, user: AdminUser) {
    event.preventDefault(); if (busy) return;
    setBusy(user.id); setNotice(null);
    try {
      const { user: saved } = await request<{ user: AdminUser }>(`/api/admin/users/${user.id}`, "PATCH", userDrafts[user.id]);
      setUsers(current => current.map(item => item.id === saved.id ? saved : item));
      setUserDrafts(current => ({ ...current, [saved.id]: draftFor(saved) }));
      setNotice({ text: t("User saved.", "사용자 정보가 저장되었습니다.") });
    } catch (error) { errorNotice(error); }
    finally { setBusy(null); }
  }
  function closeUser(user: AdminUser) {
    setUserDrafts(current => ({ ...current, [user.id]: draftFor(user) })); setExpandedId(null); setNotice(null);
  }
  async function removeUser(user: AdminUser) {
    if (busy || !window.confirm(t(`Permanently delete ${user.email}? Their account and library access will be removed. Shared books and guides will remain.`, `${user.email} 계정을 영구 삭제할까요? 계정과 도서관 접근 권한이 삭제됩니다. 공유된 책과 학습지는 유지됩니다.`))) return;
    setBusy(`delete:${user.id}`); setNotice(null);
    try {
      await request(`/api/admin/users/${user.id}`, "DELETE");
      setUsers(current => current.filter(item => item.id !== user.id));
      setUserDrafts(current => { const next = { ...current }; delete next[user.id]; return next; });
      setExpandedId(null); setNotice({ text: t("User deleted.", "사용자가 삭제되었습니다.") });
    } catch (error) { errorNotice(error); }
    finally { setBusy(null); }
  }
  async function saveSettings(event: FormEvent) {
    event.preventDefault(); if (busy) return;
    setBusy("settings"); setNotice(null);
    try {
      const data = await request<{ settings: AdminSetting[] }>("/api/admin/settings", "PATCH", settingDrafts);
      setSettings(data.settings); setSettingDrafts(Object.fromEntries(data.settings.map(setting => [setting.key, setting.value])));
      setNotice({ text: t("Settings saved.", "설정이 저장되었습니다.") });
    } catch (error) { errorNotice(error); }
    finally { setBusy(null); }
  }
  function changeDraft(id: string, key: keyof UserDraft, value: string) {
    setUserDrafts(current => ({ ...current, [id]: { ...current[id], [key]: value } }));
  }
  function settingLabel(setting: AdminSetting) {
    return ({ OPENAI_MODEL: t("Generation model", "생성 모델"), MAX_GENERATION_CHAPTERS: t("Maximum chapters per run", "실행당 최대 챕터 수"), MAX_GENERATION_ITEMS: t("Maximum items per run", "실행당 최대 문항 수") } as Record<string, string>)[setting.key] || setting.label;
  }
  const filteredUsers = users.filter(user => `${user.email} ${user.displayName || ""}`.toLowerCase().includes(search.trim().toLowerCase()))
    .sort((a, b) => Number(b.role === "admin") - Number(a.role === "admin") || a.email.localeCompare(b.email));

  return <main className="reading-shell admin-console">
    <header className="reading-topbar admin-topbar">
      <a className="reading-brand" href="/">TopReading</a><a href="/">{t("Library", "도서관")}</a>
      <div className="reading-preferences">
        <button type="button" className="reading-theme-toggle" aria-label={t("Toggle dark mode", "다크 모드 전환")} aria-pressed={theme === "dark"} onClick={() => {
          const next = theme === "dark" ? "light" : "dark"; setTheme(next); document.documentElement.dataset.theme = next; localStorage.setItem("topreading-theme", next);
        }}>{theme === "dark" ? t("Light", "라이트") : t("Dark", "다크")}</button>
        <select className="reading-language-toggle" aria-label={t("Interface language", "화면 언어")} value={language} onChange={event => { setLanguage(event.target.value); localStorage.setItem("topreading-ui-language", event.target.value); }}><option value="en">English</option><option value="ko">한국어</option></select>
      </div>
    </header>
    <div className="admin-content">
      <h1>{t("Administration", "관리")}</h1>
      {notice && <p className={`admin-feedback ${notice.error ? "error" : ""}`} role={notice.error ? "alert" : "status"}>{notice.text}</p>}
      {loading ? <p role="status">{t("Loading…", "불러오는 중…")}</p> : loadFailed ? <button type="button" onClick={() => void load()}>{t("Retry", "다시 시도")}</button> : !isAdmin ? <div><h2>{t("Access restricted", "접근 제한")}</h2><p>{t("An active administrator account is required.", "활성 관리자 계정이 필요합니다.")}</p><a href="/login">{t("Sign in", "로그인")}</a></div> : <>
        <nav className="admin-sections" aria-label={t("Administration sections", "관리 메뉴")}>
          <button type="button" disabled={Boolean(busy)} aria-current={section === "users" ? "page" : undefined} onClick={() => { setSection("users"); setNotice(null); }}>{t("Users", "사용자")}</button>
          <button type="button" disabled={Boolean(busy)} aria-current={section === "settings" ? "page" : undefined} onClick={() => { setSection("settings"); setNotice(null); }}>{t("Generation settings", "생성 설정")}</button>
        </nav>
        {section === "users" ? <section aria-label={t("Users", "사용자")}>
          <div className="admin-tools">
            <label><span className="visually-hidden">{t("Search users", "사용자 검색")}</span><input type="search" placeholder={t("Search name or email", "이름 또는 이메일 검색")} value={search} onChange={event => setSearch(event.target.value)} /></label>
            <button className="admin-primary" type="button" disabled={Boolean(busy)} aria-expanded={adding} aria-controls="admin-add-user" onClick={() => { setAdding(!adding); setNewUser(emptyUser); setNotice(null); }}>{t("Add user", "사용자 추가")}</button>
          </div>
          {adding && <form id="admin-add-user" className="admin-editor" onSubmit={createUser}>
            <h2>{t("Add user", "사용자 추가")}</h2>
            <p className="admin-hint">{t("Use their Google account email. They can sign in immediately; no invitation email is sent.", "Google 계정 이메일을 입력하세요. 바로 로그인할 수 있으며 초대 이메일은 발송되지 않습니다.")}</p>
            <fieldset disabled={Boolean(busy)} className="admin-fields">
              <label>{t("Email", "이메일")}<input type="email" required value={newUser.email} onChange={event => setNewUser({ ...newUser, email: event.target.value })} /></label>
              <label>{t("Name", "이름")}<input value={newUser.displayName} onChange={event => setNewUser({ ...newUser, displayName: event.target.value })} /></label>
              <label>{t("Role", "역할")}<select value={newUser.role} onChange={event => setNewUser({ ...newUser, role: event.target.value })}><option value="member">{t("Member", "회원")}</option><option value="admin">{t("Admin", "관리자")}</option></select></label>
            </fieldset>
            <div className="admin-actions"><button type="button" disabled={Boolean(busy)} onClick={() => { setAdding(false); setNewUser(emptyUser); }}>{t("Cancel", "취소")}</button><button className="admin-primary" type="submit" disabled={Boolean(busy)}>{busy === "create" ? t("Adding…", "추가 중…") : t("Add", "추가")}</button></div>
          </form>}
          <div className="admin-people">{filteredUsers.map(user => {
            const draft = userDrafts[user.id] || draftFor(user); const own = user.id === viewer?.id; const expanded = expandedId === user.id;
            return <article className="admin-person" key={user.id}>
              <div className="admin-person-summary">
                <div className="admin-person-identity"><h2>{user.displayName || user.email}{own && <small> {t("(you)", "(나)")}</small>}</h2>{user.displayName && <p>{user.email}</p>}</div>
                <span className="admin-person-role">{user.role === "admin" ? t("Admin", "관리자") : t("Member", "회원")}</span>
                <span className={`admin-person-status ${user.status}`}>{user.status === "active" ? t("Active", "활성") : t("Disabled", "비활성")}</span>
                <button type="button" aria-expanded={expanded} aria-controls={`edit-${user.id}`} disabled={Boolean(busy)} onClick={() => {
                  if (expanded) closeUser(user);
                  else { if (expandedId) { const previous = users.find(item => item.id === expandedId); if (previous) closeUser(previous); } setExpandedId(user.id); setNotice(null); }
                }}>{expanded ? t("Close", "닫기") : t("Edit", "수정")}</button>
              </div>
              {expanded && <form id={`edit-${user.id}`} className="admin-editor" onSubmit={event => saveUser(event, user)}>
                <fieldset className="admin-fields" disabled={Boolean(busy)}>
                  <label>{t("Name", "이름")}<input value={draft.displayName} onChange={event => changeDraft(user.id, "displayName", event.target.value)} /></label>
                  <label>{t("Role", "역할")}<select disabled={own} value={draft.role} onChange={event => changeDraft(user.id, "role", event.target.value)}><option value="member">{t("Member", "회원")}</option><option value="admin">{t("Admin", "관리자")}</option></select></label>
                  <label>{t("Status", "상태")}<select disabled={own} value={draft.status} onChange={event => changeDraft(user.id, "status", event.target.value)}><option value="active">{t("Active", "활성")}</option><option value="disabled">{t("Disabled", "비활성")}</option></select></label>
                </fieldset>
                {own ? <p className="admin-hint">{t("Another administrator must change your role or access.", "본인의 역할이나 접근 권한은 다른 관리자가 변경해야 합니다.")}</p> : user.status !== "disabled" && <p className="admin-hint">{t("Disable the account before deleting it.", "계정을 삭제하려면 먼저 비활성화하세요.")}</p>}
                <div className="admin-actions">
                  {!own && <button className="admin-delete" type="button" disabled={Boolean(busy) || user.status !== "disabled"} onClick={() => void removeUser(user)}>{busy === `delete:${user.id}` ? t("Deleting…", "삭제 중…") : t("Delete user", "사용자 삭제")}</button>}
                  <button type="button" disabled={Boolean(busy)} onClick={() => closeUser(user)}>{t("Cancel", "취소")}</button>
                  <button className="admin-primary" type="submit" disabled={Boolean(busy)}>{busy === user.id ? t("Saving…", "저장 중…") : t("Save", "저장")}</button>
                </div>
              </form>}
            </article>;
          })}</div>
          {!filteredUsers.length && <p>{t("No matching users.", "검색 결과가 없습니다.")}</p>}
        </section> : <form className="admin-generation" onSubmit={saveSettings}>
          <p className="admin-hint">{t("Applies to new generation requests.", "새로운 생성 요청에 적용됩니다.")}</p>
          <fieldset disabled={Boolean(busy)}>{settings.map(setting => <label key={setting.key}>
            <span>{settingLabel(setting)}</span>
            {setting.kind === "select" ? <select value={settingDrafts[setting.key] ?? setting.value} onChange={event => setSettingDrafts(current => ({ ...current, [setting.key]: event.target.value }))}>
              {setting.options?.map(model => <option key={model} value={model}>{model === "gpt-6-luna" ? `${model} ${t("(default)", "(기본값)")}` : model}</option>)}
            </select> : <input type="number" min={1} max={setting.key === "MAX_GENERATION_CHAPTERS" ? 500 : 10000} required value={settingDrafts[setting.key] ?? setting.value} onChange={event => setSettingDrafts(current => ({ ...current, [setting.key]: event.target.value }))} />}
          </label>)}</fieldset>
          <div className="admin-actions"><button className="admin-primary" type="submit" disabled={Boolean(busy)}>{busy === "settings" ? t("Saving…", "저장 중…") : t("Save settings", "설정 저장")}</button></div>
        </form>}
      </>}
    </div>
  </main>;
}
