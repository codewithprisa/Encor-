"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { Inter } from "next/font/google";

const inter = Inter({ subsets: ["latin"], display: "swap" });

/* ───────────── API ───────────── */
const BASE_URL = "http://localhost:3001";
const API = `${BASE_URL}/api/profil`;
const authHeaders = (): Record<string, string> => ({
  "Content-Type": "application/json",
  Authorization: `Bearer ${localStorage.getItem("token") ?? ""}`, // sesuaikan key token kamu
});

/* ───────────── Tipe & data contoh ───────────── */
type Activity = {
  id: string;
  email: string; // akun Gmail yang dipakai login
  at: string; // ISO
  failed: boolean; // percobaan login gagal
  role?: string | null; // "admin" atau "user" (dari backend)
};

type ActTab = "admin" | "user";
type Profile = { name: string; email: string; phone: string };

const MIN_PASSWORD = 8;
const PREVIEW_COUNT = 3;

/* ───────────── Helpers ───────────── */
const fmtWhen = (iso: string) => {
  const d = new Date(iso);
  return {
    date: d.toLocaleDateString("id-ID", { weekday: "long", day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Jakarta" }),
    time: d.toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Jakarta" }).replace(".", ":"),
  };
};
const fmtJoined = (iso: string) =>
  iso
    ? new Date(iso).toLocaleDateString("id-ID", { day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Jakarta" })
    : "-";
const roleLabel = (role: string) => (role === "admin" ? "Admin" : role ? "User" : "");
// Aktivitas tanpa role (mis. email yang tidak terdaftar) dimasukkan ke tab User.
const actTabOf = (a: Activity): ActTab => (a.role === "admin" ? "admin" : "user");

function useModal(onClose: () => void) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [onClose]);
}

/* ───────────── Ikon ───────────── */
function Icon({ children, size = 16 }: { children: ReactNode; size?: number }) {
  return (
    <svg className="icon" width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
      {children}
    </svg>
  );
}
const IUser = () => <Icon size={18}><circle cx="12" cy="8" r="4" /><path d="M4 20c0-4 3.6-6 8-6s8 2 8 6" /></Icon>;
const IShield = ({ size = 18 }: { size?: number }) => <Icon size={size}><path d="M12 3 4.5 6v5.5c0 4.5 3 8 7.5 9.5 4.5-1.5 7.5-5 7.5-9.5V6L12 3Z" /><path d="m9 12 2 2 4-4" /></Icon>;
const IHistory = () => <Icon size={18}><path d="M3.5 12a8.5 8.5 0 1 0 2.6-6.1M3.5 4v4.5H8M12 7.5V12l3 2" /></Icon>;
const ILogout = () => <Icon size={18}><path d="M9 4H5v16h4M16 8l4 4-4 4M20 12H9" /></Icon>;
const IMail = () => <Icon size={18}><rect x="3" y="5" width="18" height="14" rx="2.5" /><path d="m3.5 7 8.5 6 8.5-6" /></Icon>;
const ICheck = () => <Icon><path d="m5 12.5 4.5 4.5L19 7.5" /></Icon>;

/* ───────────── Komponen kecil ───────────── */
function Field({
  id,
  label,
  error,
  children,
}: {
  id: string;
  label: string;
  error?: string;
  children: ReactNode;
}) {
  return (
    <div className="field">
      <label className="label" htmlFor={id}>{label}</label>
      {children}
      {error && <p className="err">{error}</p>}
    </div>
  );
}

function ConfirmLogout({ onCancel, onConfirm }: { onCancel: () => void; onConfirm: () => void }) {
  useModal(onCancel);
  return (
    <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && onCancel()}>
      <div className="modal" role="alertdialog" aria-modal="true" aria-labelledby="lo-title">
        <div className="modal-body confirm">
          <span className="info-icon"><ILogout /></span>
          <h2 id="lo-title">Keluar dari akun?</h2>
          <p className="sub">Kamu perlu login kembali untuk mengakses dashboard.</p>
        </div>
        <footer className="modal-foot">
          <button className="btn-ghost" onClick={onCancel}>Batal</button>
          <button className="btn-primary" onClick={onConfirm} autoFocus>Ya, Keluar</button>
        </footer>
      </div>
    </div>
  );
}

/* ───────────── Halaman ───────────── */
const EMPTY_PROFILE: Profile = { name: "", email: "", phone: "" };

export default function ProfilePage() {
  /* informasi akun */
  const [saved, setSaved] = useState<Profile>(EMPTY_PROFILE);
  const [draft, setDraft] = useState<Profile>(EMPTY_PROFILE);
  const [role, setRole] = useState("");
  const [joinedAt, setJoinedAt] = useState("");
  const [nameErr, setNameErr] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const dirty = draft.name.trim() !== saved.name;

  /* keamanan */
  const [oldPwd, setOldPwd] = useState("");
  const [newPwd, setNewPwd] = useState("");
  const [confirmPwd, setConfirmPwd] = useState("");
  const [pwdErr, setPwdErr] = useState<{ old?: string; next?: string; confirm?: string }>({});
  const [editingPwd, setEditingPwd] = useState(false);

  /* aktivitas login: dua versi (Admin dan User) */
  const [activity, setActivity] = useState<Activity[]>([]);
  const [actTab, setActTab] = useState<ActTab>("admin");
  const [showAll, setShowAll] = useState(false);
  const adminActs = activity.filter((a) => actTabOf(a) === "admin");
  const userActs = activity.filter((a) => actTabOf(a) === "user");
  const current = actTab === "admin" ? adminActs : userActs;
  const visible = showAll ? current : current.slice(0, PREVIEW_COUNT);

  function switchActTab(t: ActTab) {
    setActTab(t);
    setShowAll(false);
  }

  /* lain-lain */
  const [loggingOut, setLoggingOut] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  function showToast(msg: string) {
    setToast(msg);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setToast(null), 2800);
  }

  /* ambil data profil dari backend */
  async function loadProfile() {
    try {
      const res = await fetch(API, { headers: authHeaders() });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "Gagal memuat profil");
      const p: Profile = { name: data.name ?? "", email: data.email ?? "", phone: data.phone ?? "" };
      setSaved(p);
      setDraft(p);
      setRole(data.role ?? "");
      setJoinedAt(data.joinedAt ?? "");
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Gagal memuat profil.");
    }
  }
  async function loadActivity() {
    try {
      const res = await fetch(`${API}/aktivitas`, { headers: authHeaders() });
      const data = await res.json();
      if (res.ok && Array.isArray(data)) setActivity(data);
    } catch {
      /* abaikan: tabel aktivitas tetap kosong */
    }
  }
  useEffect(() => {
    loadProfile();
    loadActivity();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function saveProfile() {
    if (draft.name.trim().length < 3) return setNameErr("Nama minimal 3 karakter.");
    setSaving(true);
    try {
      const res = await fetch(API, {
        method: "PUT",
        headers: authHeaders(),
        body: JSON.stringify({ name: draft.name.trim() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "Gagal menyimpan");
      const next = { ...saved, name: data.name };
      setSaved(next);
      setDraft(next);
      setNameErr(null);
      showToast("Perubahan profil disimpan.");
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Gagal menyimpan profil.");
    } finally {
      setSaving(false);
    }
  }

  async function changePassword() {
    const errs: typeof pwdErr = {};
    if (!oldPwd) errs.old = "Masukkan password lama.";
    if (newPwd.length < MIN_PASSWORD) errs.next = `Password baru minimal ${MIN_PASSWORD} karakter.`;
    else if (newPwd === oldPwd) errs.next = "Password baru tidak boleh sama dengan password lama.";
    if (confirmPwd !== newPwd) errs.confirm = "Konfirmasi password tidak cocok.";
    setPwdErr(errs);
    if (Object.keys(errs).length) return;
    try {
      const res = await fetch(`${API}/password`, {
        method: "PUT",
        headers: authHeaders(),
        body: JSON.stringify({ oldPassword: oldPwd, newPassword: newPwd }),
      });
      const data = await res.json();
      if (!res.ok) {
        if (res.status === 400 && data.field === "old") return setPwdErr({ old: data.message });
        throw new Error(data.message || "Gagal mengubah password");
      }
      closePwdForm();
      showToast("Password berhasil diubah.");
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Gagal mengubah password.");
    }
  }

  function closePwdForm() {
    setOldPwd("");
    setNewPwd("");
    setConfirmPwd("");
    setPwdErr({});
    setEditingPwd(false);
  }

  function logout() {
    // TODO: panggil signOut / API logout kamu
    setLoggingOut(false);
    showToast("Kamu telah keluar.");
  }

  return (
    <main className={`page ${inter.className}`}>
      <style>{css}</style>

      <div className="wrap">
        <header className="head">
          <h1>Profile</h1>
          <p className="sub">Kelola informasi akun dan pengaturan keamanan dashboard Anda.</p>
        </header>

        <div className="layout">
          {/* ───── Kartu profil ───── */}
          <aside className="left">
            <section className="card me" aria-label="Ringkasan profil">
              <h2 className="me-name">{saved.name}</h2>
              <p className="muted small">{saved.email}</p>
              {role && <span className="role">{roleLabel(role)}</span>}
              <div className="me-meta">
                <span className="meta-label">Bergabung sejak</span>
                <span className="meta-value">{fmtJoined(joinedAt)}</span>
              </div>
            </section>

            <button type="button" className="btn-logout" onClick={() => setLoggingOut(true)}>
              <ILogout /> Keluar
            </button>
          </aside>

          {/* ───── Kolom kanan ───── */}
          <div className="main-col">
            {/* Informasi akun */}
            <section className="card pad" aria-labelledby="info-title">
              <h2 className="sec-title" id="info-title"><IUser /> Informasi Akun</h2>
              <Field id="p-name" label="Nama Lengkap" error={nameErr ?? undefined}>
                <input id="p-name" className="input" value={draft.name} aria-invalid={!!nameErr} onChange={(e) => (setDraft({ ...draft, name: e.target.value }), setNameErr(null))} />
              </Field>
              <div className="grid-2">
                <Field id="p-email" label="Email">
                  <input id="p-email" className="input" type="email" value={saved.email} readOnly />
                </Field>
                <Field id="p-phone" label="Nomor HP">
                  <input id="p-phone" className="input" type="tel" value={saved.phone} readOnly />
                </Field>
              </div>
              <p className="hint">Hanya nama yang dapat diubah. Email dan nomor HP bersifat tetap.</p>
              <div className="actions">
                <button className="btn-primary" onClick={saveProfile} disabled={!dirty || saving}>
                  {saving ? "Menyimpan..." : "Simpan Perubahan"}
                </button>
              </div>
            </section>

            {/* Keamanan */}
            <section className="card pad" aria-labelledby="sec-title">
              <h2 className="sec-title" id="sec-title"><IShield /> Keamanan</h2>
              {!editingPwd ? (
                <div className="pwd-row">
                  <p className="muted small">Ubah password secara berkala untuk menjaga keamanan akun Anda.</p>
                  <button className="btn-outline" onClick={() => setEditingPwd(true)}>Ubah Password</button>
                </div>
              ) : (
                <>
                  <Field id="s-old" label="Password Lama" error={pwdErr.old}>
                    <input id="s-old" className="input" type="password" autoComplete="current-password" value={oldPwd} aria-invalid={!!pwdErr.old} autoFocus onChange={(e) => (setOldPwd(e.target.value), setPwdErr((x) => ({ ...x, old: undefined })))} />
                  </Field>
                  <div className="grid-2">
                    <Field id="s-new" label="Password Baru" error={pwdErr.next}>
                      <input id="s-new" className="input" type="password" autoComplete="new-password" value={newPwd} aria-invalid={!!pwdErr.next} onChange={(e) => (setNewPwd(e.target.value), setPwdErr((x) => ({ ...x, next: undefined })))} />
                    </Field>
                    <Field id="s-confirm" label="Konfirmasi Password Baru" error={pwdErr.confirm}>
                      <input id="s-confirm" className="input" type="password" autoComplete="new-password" value={confirmPwd} aria-invalid={!!pwdErr.confirm} onChange={(e) => (setConfirmPwd(e.target.value), setPwdErr((x) => ({ ...x, confirm: undefined })))} />
                    </Field>
                  </div>
                  <div className="actions gap">
                    <button className="btn-ghost" onClick={closePwdForm}>Batal</button>
                    <button className="btn-primary" onClick={changePassword}>Simpan Password</button>
                  </div>
                </>
              )}
            </section>

            {/* Aktivitas login: versi Admin dan User */}
            <section className="card activity" aria-labelledby="act-title">
              <header className="act-head">
                <h2 className="sec-title" id="act-title"><IHistory /> Aktivitas Login</h2>
                <div className="segment" role="tablist" aria-label="Jenis akun">
                  <button
                    type="button"
                    role="tab"
                    aria-selected={actTab === "admin"}
                    className={`seg ${actTab === "admin" ? "on" : ""}`}
                    onClick={() => switchActTab("admin")}
                  >
                    Admin <span className="count">{adminActs.length}</span>
                  </button>
                  <button
                    type="button"
                    role="tab"
                    aria-selected={actTab === "user"}
                    className={`seg ${actTab === "user" ? "on" : ""}`}
                    onClick={() => switchActTab("user")}
                  >
                    User <span className="count">{userActs.length}</span>
                  </button>
                </div>
              </header>

              <div className="table-wrap">
                <table>
                  <thead>
                    <tr><th>Akun Gmail</th><th className="right">Waktu</th></tr>
                  </thead>
                  <tbody>
                    {visible.map((a) => {
                      const { date, time } = fmtWhen(a.at);
                      return (
                        <tr key={a.id}>
                          <td>
                            <div className="device">
                              <span className="device-icon"><IMail /></span>
                              <span className="device-text">
                                <span className="name">{a.email}</span>
                                {a.failed && <span className="fail">Percobaan login gagal</span>}
                              </span>
                            </div>
                          </td>
                          <td className="right nowrap">
                            {date}
                            <br />
                            <span className="muted">{time}</span>
                          </td>
                        </tr>
                      );
                    })}
                    {visible.length === 0 && (
                      <tr>
                        <td colSpan={2} className="center muted">
                          {actTab === "admin" ? "Belum ada aktivitas login admin." : "Belum ada aktivitas login user."}
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>

              {current.length > PREVIEW_COUNT && (
                <footer className="act-foot">
                  <button className="btn-text" onClick={() => setShowAll((v) => !v)}>
                    {showAll ? "Tampilkan lebih sedikit" : `Lihat semua riwayat (${current.length})`}
                  </button>
                </footer>
              )}
            </section>
          </div>
        </div>
      </div>

      {loggingOut && <ConfirmLogout onCancel={() => setLoggingOut(false)} onConfirm={logout} />}
      {toast && <div className="toast" role="status"><ICheck /> {toast}</div>}
    </main>
  );
}

/* ───────────── Styles ───────────── */
const css = `
:root {
  --bg: #FCF6F1; --card: #FFFFFF; --ink: #17202A; --muted: #6A7380; --line: #EADFD4;
  --soft: #F7ECE1; --hover: #FBF8F4;
  --accent: #2F5D80; --accent-hover: #244A68; --accent-ink: #FFFFFF; --accent-soft: #E6EEF5;
  --danger: #C4372D; --danger-soft: #FCEBE9; --ok: #16A34A;
  --field: #FFFFFF; --overlay: rgba(23,32,42,.5);
  --shadow: 0 1px 2px rgba(23,32,42,.04), 0 6px 20px rgba(23,32,42,.05);
}
:root[data-theme="dark"] {
  --bg: #121316; --card: #1B1C20; --ink: #F1EEEA; --muted: #9CA3AE; --line: #2E3037;
  --soft: #24262B; --hover: #212328;
  --accent: #8EC1EC; --accent-hover: #A8D1F2; --accent-ink: #10202D; --accent-soft: #1F3547;
  --danger: #EE7A70; --danger-soft: #3A2220; --ok: #4CC47A;
  --field: #14151A; --overlay: rgba(0,0,0,.65);
  --shadow: 0 1px 2px rgba(0,0,0,.3), 0 6px 20px rgba(0,0,0,.3);
}
* { box-sizing: border-box; margin: 0; padding: 0; }
html, body { background: var(--bg); color: var(--ink); -webkit-font-smoothing: antialiased; }
button { font: inherit; color: inherit; }

.page { min-height: 100vh; }
.wrap { max-width: 1100px; margin: 0 auto; padding: 32px 24px 64px; display: flex; flex-direction: column; gap: 24px; }
.card { background: var(--card); border: 1px solid var(--line); border-radius: 14px; box-shadow: var(--shadow); }
.icon { fill: none; stroke: currentColor; stroke-width: 1.7; stroke-linecap: round; stroke-linejoin: round; flex-shrink: 0; }

h1 { font-size: 32px; font-weight: 800; letter-spacing: -0.03em; line-height: 1.1; }
h2 { font-size: 16px; font-weight: 650; letter-spacing: -0.01em; }
.sub { font-size: 13.5px; color: var(--muted); margin-top: 6px; line-height: 1.5; }
.muted { color: var(--muted); }
.small { font-size: 12px; }
.center { text-align: center; }
.right { text-align: right; }
.nowrap { white-space: nowrap; }
.name { font-weight: 600; font-size: 13.5px; }

.layout { display: grid; grid-template-columns: 300px minmax(0, 1fr); gap: 24px; align-items: start; }
.left { display: flex; flex-direction: column; gap: 16px; }
.main-col { display: flex; flex-direction: column; gap: 20px; min-width: 0; }

/* profile summary */
.me { padding: 24px 22px 0; display: flex; flex-direction: column; align-items: center; text-align: center; gap: 4px; border-top: 3px solid color-mix(in srgb, var(--accent) 35%, var(--line)); overflow: hidden; }
.me-name { font-size: 20px; font-weight: 700; }
.role { margin-top: 8px; padding: 3px 12px; font-size: 11.5px; font-weight: 700; border-radius: 999px; background: var(--accent-soft); color: var(--accent); }
.me-meta { align-self: stretch; display: flex; justify-content: space-between; align-items: center; margin-top: 18px; padding: 14px 0; border-top: 1px solid var(--line); font-size: 12.5px; }
.meta-label { font-size: 11px; font-weight: 700; letter-spacing: .05em; text-transform: uppercase; color: var(--muted); }
.meta-value { font-weight: 600; }

.btn-logout { display: flex; align-items: center; justify-content: center; gap: 8px; height: 44px; font-size: 14px; font-weight: 650; color: var(--danger); background: var(--card); border: 1px solid var(--danger); border-radius: 10px; cursor: pointer; transition: background .15s; }
.btn-logout:hover { background: var(--danger-soft); }

/* sections */
.pad { padding: 22px; display: flex; flex-direction: column; gap: 16px; }
.sec-title { display: flex; align-items: center; gap: 10px; }
.sec-title .icon { color: var(--accent); }
.grid-2 { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }
.field { display: flex; flex-direction: column; gap: 6px; min-width: 0; }
.label { font-size: 11px; font-weight: 700; letter-spacing: .05em; text-transform: uppercase; color: var(--muted); }
.input { width: 100%; height: 40px; padding: 0 12px; font: inherit; font-size: 13.5px; color: var(--ink); background: var(--field); border: 1px solid var(--line); border-radius: 8px; transition: border-color .15s, box-shadow .15s; }
.input:focus { outline: 0; border-color: var(--accent); box-shadow: 0 0 0 3px var(--accent-soft); }
.input[aria-invalid="true"] { border-color: var(--danger); }
.err { font-size: 12px; color: var(--danger); font-weight: 500; }
.actions { display: flex; justify-content: flex-end; margin-top: 4px; }
.actions.gap { gap: 10px; }
.hint { font-size: 12px; color: var(--muted); }
.input[readonly] { background: var(--soft); color: var(--muted); cursor: not-allowed; }
.input[readonly]:focus { border-color: var(--line); box-shadow: none; }
.pwd-row { display: flex; justify-content: space-between; align-items: center; gap: 16px; flex-wrap: wrap; }

/* buttons */
.btn-primary, .btn-ghost, .btn-outline { display: inline-flex; align-items: center; justify-content: center; gap: 8px; height: 40px; padding: 0 20px; font-size: 13.5px; font-weight: 650; border-radius: 8px; cursor: pointer; border: 1px solid transparent; transition: background .15s, border-color .15s; white-space: nowrap; }
.btn-primary { background: var(--accent); color: var(--accent-ink); }
.btn-primary:hover:not(:disabled) { background: var(--accent-hover); }
.btn-outline { background: var(--card); color: var(--accent); border-color: var(--accent); }
.btn-outline:hover:not(:disabled) { background: var(--accent-soft); }
.btn-ghost { background: var(--card); border-color: var(--line); }
.btn-ghost:hover:not(:disabled) { background: var(--hover); border-color: var(--muted); }
.btn-text { background: none; border: 0; color: var(--accent); font-size: 11.5px; font-weight: 700; letter-spacing: .05em; text-transform: uppercase; cursor: pointer; padding: 6px 8px; }
.btn-text:hover { text-decoration: underline; }
button:focus-visible, input:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
button:disabled { opacity: .45; cursor: not-allowed; }

/* activity */
.activity { overflow: hidden; background: var(--soft); }
.act-head { display: flex; justify-content: space-between; align-items: center; gap: 12px; flex-wrap: wrap; padding: 16px 22px; }
.segment { display: inline-grid; grid-template-columns: 1fr 1fr; gap: 4px; padding: 4px; background: var(--card); border: 1px solid var(--line); border-radius: 10px; }
.seg { display: inline-flex; align-items: center; justify-content: center; gap: 8px; height: 32px; padding: 0 18px; border: 0; border-radius: 7px; background: transparent; font-size: 12.5px; font-weight: 600; color: var(--muted); cursor: pointer; transition: background .15s, color .15s; }
.seg:hover { color: var(--ink); }
.seg.on { background: var(--accent-soft); color: var(--accent); }
.count { min-width: 20px; padding: 1px 6px; font-size: 11px; border-radius: 999px; background: var(--line); color: var(--muted); }
.seg.on .count { background: var(--card); color: var(--accent); }
.table-wrap { overflow-x: auto; background: var(--card); }
table { width: 100%; border-collapse: collapse; min-width: 420px; font-size: 13px; }
th { text-align: left; font-size: 11px; font-weight: 700; letter-spacing: .05em; text-transform: uppercase; color: var(--muted); padding: 12px 22px; white-space: nowrap; border-bottom: 1px solid var(--line); background: var(--soft); }
th.right { text-align: right; }
td { padding: 14px 22px; border-bottom: 1px solid var(--line); vertical-align: middle; line-height: 1.5; }
tbody tr:last-child td { border-bottom: 0; }
tbody tr:hover { background: var(--hover); }
.device { display: flex; align-items: center; gap: 12px; }
.device-icon { color: var(--muted); display: grid; }
.device-text { display: flex; flex-direction: column; }
.fail { margin-top: 2px; font-size: 11.5px; font-weight: 600; color: var(--danger); }
.online { font-size: 12px; font-weight: 600; color: var(--ok); }
.act-foot { display: flex; justify-content: center; padding: 10px; background: var(--soft); border-top: 1px solid var(--line); }

/* modal */
.overlay { position: fixed; inset: 0; z-index: 50; background: var(--overlay); backdrop-filter: blur(4px); display: grid; place-items: center; padding: 16px; animation: fade .15s ease; }
.modal { width: 100%; max-width: 400px; background: var(--card); border: 1px solid var(--line); border-radius: 16px; box-shadow: 0 24px 64px rgba(0,0,0,.28); overflow: hidden; animation: pop .18s ease; }
.modal-body { padding: 28px 24px 22px; display: flex; flex-direction: column; align-items: center; text-align: center; gap: 10px; }
.modal-body .sub { margin-top: 0; }
.modal-foot { display: flex; justify-content: flex-end; gap: 10px; padding: 16px 24px; border-top: 1px solid var(--line); background: var(--soft); }
.info-icon { width: 48px; height: 48px; border-radius: 50%; display: grid; place-items: center; background: var(--accent-soft); color: var(--accent); }

.toast { position: fixed; left: 50%; bottom: 28px; transform: translateX(-50%); z-index: 80; display: flex; align-items: center; gap: 8px; background: var(--ink); color: var(--bg); font-size: 13.5px; font-weight: 500; padding: 11px 18px; border-radius: 12px; box-shadow: 0 10px 30px rgba(0,0,0,.25); animation: fade .2s ease; max-width: calc(100vw - 32px); }

@keyframes fade { from { opacity: 0 } to { opacity: 1 } }
@keyframes pop { from { opacity: 0; transform: translateY(8px) scale(.98) } to { opacity: 1; transform: none } }

@media (max-width: 860px) { .layout { grid-template-columns: 1fr; } }
@media (max-width: 640px) {
  .wrap { padding: 20px 16px 48px; }
  h1 { font-size: 26px; }
  .grid-2 { grid-template-columns: 1fr; }
  .pad { padding: 18px; }
  .segment { display: grid; width: 100%; }
}
@media (prefers-reduced-motion: reduce) { * { transition: none !important; animation: none !important; } }
`;