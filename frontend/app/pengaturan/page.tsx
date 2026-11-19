"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { Inter } from "next/font/google";

const inter = Inter({ subsets: ["latin"], display: "swap" });

/* ───────────── Tipe ───────────── */
type Role = "Super Admin" | "Admin" | "User";
type Account = { id: number; name: string; email: string; role: Role };
type Payment = { id: number; name: string; account_number: string; is_active: boolean };

const AVATAR_COLORS = ["#2F5D80", "#B4573A", "#5B7F4A", "#7A5C9E", "#A8742A", "#3F7F88"];
const MIN_PASSWORD = 8;

const APP_VERSION = "v2.4.1";
const LAST_UPDATE = "12 Oktober 2023";

/* ───────────── API ───────────── */
// Isi NEXT_PUBLIC_API_URL di .env.local, mis. http://localhost:5000
const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001";

// Cari token login di beberapa tempat yang umum. Kalau key login kamu beda,
// tambahkan di daftar TOKEN_KEYS.
const TOKEN_KEYS = ["token", "accessToken", "access_token", "authToken", "jwt", "user"];
function getToken(): string | null {
  if (typeof window === "undefined") return null;
  for (const store of [localStorage, sessionStorage]) {
    for (const key of TOKEN_KEYS) {
      const raw = store.getItem(key);
      if (!raw) continue;
      // nilai bisa berupa token langsung atau JSON seperti {"token":"..."}
      try {
        const parsed = JSON.parse(raw);
        if (typeof parsed === "string") return parsed;
        const t = parsed?.token ?? parsed?.accessToken ?? parsed?.access_token;
        if (typeof t === "string") return t;
      } catch {
        return raw;
      }
    }
  }
  return null;
}

// Fungsi dasar untuk semua endpoint. Header Bearer diambil dari token login.
async function request<T = unknown>(url: string, init: RequestInit = {}): Promise<T> {
  const token = getToken();
  const res = await fetch(`${API_URL}${url}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...init.headers,
    },
  });
  const data = await res.json().catch(() => null);
  if (!res.ok) throw new Error(data?.message ?? "Terjadi kesalahan. Coba lagi.");
  return data as T;
}
const api = <T,>(path: string, init?: RequestInit) => request<T>(`/api/pembayaran/metode${path}`, init);
const apiAkun = <T,>(path: string, init?: RequestInit) => request<T>(`/api/akun${path}`, init);

/* ───────────── Helpers ───────────── */
const initials = (name: string) =>
  name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]?.toUpperCase()).join("");
const colorFor = (name: string) => {
  let h = 0;
  for (const c of name) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return AVATAR_COLORS[h % AVATAR_COLORS.length];
};
// Kode pendek untuk kotak di kiri kartu: "Virtual Account" → "VA", "BCA" → "BCA"
const codeFor = (name: string) => {
  const words = name.trim().split(/\s+/).filter(Boolean);
  return words.length > 1
    ? words.slice(0, 4).map((w) => w[0]).join("").toUpperCase()
    : name.trim().slice(0, 5).toUpperCase();
};
const NOMOR_REK = /^[0-9][0-9\s-]{3,28}[0-9]$/;

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
const IKey = () => <Icon><circle cx="8" cy="15" r="4" /><path d="m11 12 9-9M16 7l3 3M14 9l2 2" /></Icon>;
const IUserMinus = () => <Icon><circle cx="9" cy="8" r="3.5" /><path d="M2.5 20c0-3.5 3-5.5 6.5-5.5s6.5 2 6.5 5.5M17 11h5" /></Icon>;
const IUserPlus = () => <Icon><circle cx="9" cy="8" r="3.5" /><path d="M2.5 20c0-3.5 3-5.5 6.5-5.5s6.5 2 6.5 5.5M19.5 8v6M16.5 11h6" /></Icon>;
const ITrash = () => <Icon><path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3" /></Icon>;
const IPlus = () => <Icon><path d="M12 5v14M5 12h14" /></Icon>;
const ICheck = () => <Icon><path d="m5 12.5 4.5 4.5L19 7.5" /></Icon>;
const IShield = () => <Icon size={22}><path d="M12 3 4.5 6v5.5c0 4.5 3 8 7.5 9.5 4.5-1.5 7.5-5 7.5-9.5V6L12 3Z" /><path d="m9 12 2 2 4-4" /></Icon>;
const IWarn = () => <Icon size={22}><path d="M12 4 2.5 20h19L12 4ZM12 10v4.5M12 17.5h.01" /></Icon>;
const IInbox = () => (
  <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M3 13l3-8h12l3 8v6H3v-6ZM3 13h5l1 3h6l1-3h5" />
  </svg>
);

/* ───────────── Komponen kecil ───────────── */
function Avatar({ name, size = 32 }: { name: string; size?: number }) {
  return (
    <span className="avatar" style={{ width: size, height: size, fontSize: size * 0.38, background: colorFor(name) }} aria-hidden="true">
      {initials(name)}
    </span>
  );
}

function Switch({ checked, onChange, label }: { checked: boolean; onChange: () => void; label: string }) {
  return (
    <button type="button" role="switch" aria-checked={checked} aria-label={label} className={`switch ${checked ? "on" : ""}`} onClick={onChange}>
      <span className="knob" />
    </button>
  );
}

function RolePill({ role }: { role: Role }) {
  return <span className={`role ${role === "Super Admin" ? "super" : role === "Admin" ? "admin" : "user"}`}>{role}</span>;
}

/* ───────────── Dialog ───────────── */
function ConfirmDialog({
  title,
  body,
  confirmLabel,
  danger,
  busy,
  onCancel,
  onConfirm,
}: {
  title: string;
  body: ReactNode;
  confirmLabel: string;
  danger?: boolean;
  busy?: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  useModal(onCancel);
  return (
    <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && onCancel()}>
      <div className="modal" role="alertdialog" aria-modal="true" aria-labelledby="cf-title">
        <div className="modal-body confirm">
          <span className={`info-icon ${danger ? "danger" : ""}`}>{danger ? <IWarn /> : <IShield />}</span>
          <h2 id="cf-title">{title}</h2>
          <p className="sub">{body}</p>
        </div>
        <footer className="modal-foot">
          <button className="btn-ghost" onClick={onCancel} disabled={busy}>Batal</button>
          <button className={danger ? "btn-danger" : "btn-primary"} onClick={onConfirm} disabled={busy} autoFocus>
            {busy ? "Memproses…" : confirmLabel}
          </button>
        </footer>
      </div>
    </div>
  );
}

function PasswordDialog({
  name,
  onCancel,
  onSubmit,
}: {
  name: string;
  onCancel: () => void;
  onSubmit: (password: string) => void;
}) {
  const [pwd, setPwd] = useState("");
  const [confirm, setConfirm] = useState("");
  const [show, setShow] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  useModal(onCancel);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (pwd.length < MIN_PASSWORD) return setErr(`Password minimal ${MIN_PASSWORD} karakter.`);
    if (pwd !== confirm) return setErr("Konfirmasi password tidak cocok.");
    onSubmit(pwd);
  }

  return (
    <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && onCancel()}>
      <form className="modal" role="dialog" aria-modal="true" aria-labelledby="pw-title" onSubmit={submit}>
        <div className="modal-body">
          <h2 id="pw-title">Update Password</h2>
          <p className="sub">Atur password baru untuk <strong>{name}</strong>.</p>

          <div className="field">
            <label className="label" htmlFor="pw-new">Password Baru</label>
            <input
              id="pw-new"
              className="input"
              type={show ? "text" : "password"}
              value={pwd}
              onChange={(e) => (setPwd(e.target.value), setErr(null))}
              autoComplete="new-password"
              autoFocus
            />
          </div>
          <div className="field">
            <label className="label" htmlFor="pw-confirm">Konfirmasi Password</label>
            <input
              id="pw-confirm"
              className="input"
              type={show ? "text" : "password"}
              value={confirm}
              onChange={(e) => (setConfirm(e.target.value), setErr(null))}
              autoComplete="new-password"
              aria-invalid={!!err}
            />
          </div>
          <label className="check">
            <input type="checkbox" checked={show} onChange={(e) => setShow(e.target.checked)} /> Tampilkan password
          </label>
          {err && <p className="err">{err}</p>}
        </div>
        <footer className="modal-foot">
          <button type="button" className="btn-ghost" onClick={onCancel}>Batal</button>
          <button type="submit" className="btn-primary">Simpan Password</button>
        </footer>
      </form>
    </div>
  );
}

function AddPaymentDialog({
  onCancel,
  onSubmit,
}: {
  onCancel: () => void;
  onSubmit: (name: string, accountNumber: string) => Promise<void>;
}) {
  const [name, setName] = useState("");
  const [acc, setAcc] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  useModal(onCancel);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const n = name.trim();
    const a = acc.trim();
    if (n.length < 2) return setErr("Nama metode wajib diisi (minimal 2 karakter).");
    if (!NOMOR_REK.test(a)) return setErr("Nomor rekening tidak valid (5–30 karakter, hanya angka).");
    setBusy(true);
    try {
      await onSubmit(n, a);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Gagal menyimpan.");
      setBusy(false);
    }
  }

  return (
    <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && !busy && onCancel()}>
      <form className="modal" role="dialog" aria-modal="true" aria-labelledby="ap-title" onSubmit={submit}>
        <div className="modal-body">
          <h2 id="ap-title">Tambah Metode Pembayaran</h2>
          <p className="sub">Metode baru langsung aktif dan bisa dipakai pelanggan.</p>

          <div className="field">
            <label className="label" htmlFor="ap-name">Nama Metode</label>
            <input
              id="ap-name"
              className="input"
              value={name}
              maxLength={50}
              placeholder="Contoh: BCA, Mandiri, ShopeePay"
              onChange={(e) => (setName(e.target.value), setErr(null))}
              autoFocus
            />
          </div>
          <div className="field">
            <label className="label" htmlFor="ap-acc">Nomor Rekening</label>
            <input
              id="ap-acc"
              className="input"
              inputMode="numeric"
              value={acc}
              maxLength={30}
              placeholder="Contoh: 1234567890"
              onChange={(e) => (setAcc(e.target.value.replace(/[^0-9\s-]/g, "")), setErr(null))}
              aria-invalid={!!err}
            />
          </div>
          {err && <p className="err" role="alert">{err}</p>}
        </div>
        <footer className="modal-foot">
          <button type="button" className="btn-ghost" onClick={onCancel} disabled={busy}>Batal</button>
          <button type="submit" className="btn-primary" disabled={busy}>{busy ? "Menyimpan…" : "Simpan Metode"}</button>
        </footer>
      </form>
    </div>
  );
}

/* ───────────── Halaman ───────────── */
type Dialog =
  | { kind: "promote" | "demote" | "delete" | "password"; id: number }
  | null;
type PayDialog = { kind: "add" } | { kind: "delete"; id: number } | null;

export default function SettingsPage() {
  const [payments, setPayments] = useState<Payment[]>([]);
  const [payLoading, setPayLoading] = useState(true);
  const [payError, setPayError] = useState<string | null>(null);
  const [payDialog, setPayDialog] = useState<PayDialog>(null);
  const [payBusy, setPayBusy] = useState(false);

  const [accounts, setAccounts] = useState<Account[]>([]);
  const [accLoading, setAccLoading] = useState(true);
  const [accError, setAccError] = useState<string | null>(null);
  const [accBusy, setAccBusy] = useState(false);
  const [tab, setTab] = useState<"admin" | "user">("admin");
  const [dialog, setDialog] = useState<Dialog>(null);

  const [toast, setToast] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  function showToast(msg: string) {
    setToast(msg);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setToast(null), 2800);
  }

  const admins = accounts.filter((a) => a.role !== "User");
  const users = accounts.filter((a) => a.role === "User");
  const target = dialog ? accounts.find((a) => a.id === dialog.id) : undefined;
  const payTarget = payDialog?.kind === "delete" ? payments.find((p) => p.id === payDialog.id) : undefined;

  /* ───── Metode pembayaran ───── */
  const loadPayments = useCallback(async () => {
    setPayLoading(true);
    setPayError(null);
    try {
      const res = await api<{ data: Payment[] }>("");
      setPayments(res.data);
    } catch (e) {
      setPayError(e instanceof Error ? e.message : "Gagal memuat metode pembayaran.");
    } finally {
      setPayLoading(false);
    }
  }, []);

  useEffect(() => {
    loadPayments();
  }, [loadPayments]);

  async function addPayment(name: string, accountNumber: string) {
    const res = await api<{ data: Payment }>("", {
      method: "POST",
      body: JSON.stringify({ name, account_number: accountNumber }),
    });
    setPayments((l) => [...l, res.data]);
    setPayDialog(null);
    showToast(`${res.data.name} ditambahkan dan langsung aktif.`);
  }

  async function togglePayment(p: Payment) {
    const next = !p.is_active;
    // update tampilan dulu, kembalikan jika server menolak
    setPayments((l) => l.map((x) => (x.id === p.id ? { ...x, is_active: next } : x)));
    try {
      await api(`/${p.id}/status`, { method: "PATCH", body: JSON.stringify({ is_active: next }) });
      showToast(`${p.name} ${next ? "diaktifkan" : "dinonaktifkan"}.`);
    } catch (e) {
      setPayments((l) => l.map((x) => (x.id === p.id ? { ...x, is_active: p.is_active } : x)));
      showToast(e instanceof Error ? e.message : "Gagal mengubah status.");
    }
  }

  async function deletePayment(p: Payment) {
    setPayBusy(true);
    try {
      await api(`/${p.id}`, { method: "DELETE" });
      setPayments((l) => l.filter((x) => x.id !== p.id));
      showToast(`${p.name} dihapus.`);
      setPayDialog(null);
    } catch (e) {
      showToast(e instanceof Error ? e.message : "Gagal menghapus.");
    } finally {
      setPayBusy(false);
    }
  }

  /* ───── Akun staff ───── */
  // Data akun diambil dari database lewat GET /api/akun.
  const loadAccounts = useCallback(async () => {
    setAccLoading(true);
    setAccError(null);
    try {
      const res = await apiAkun<{ data: Account[] }>("");
      setAccounts(res.data);
    } catch (e) {
      setAccError(e instanceof Error ? e.message : "Gagal memuat akun.");
    } finally {
      setAccLoading(false);
    }
  }, []);

  useEffect(() => {
    loadAccounts();
  }, [loadAccounts]);

  // Satu jalur untuk dua arah: User → Admin dan Admin → User. Tersimpan di database.
  async function changeRole(id: number, role: "Admin" | "User") {
    const name = target?.name;
    setAccBusy(true);
    try {
      await apiAkun(`/${id}/role`, { method: "PATCH", body: JSON.stringify({ role }) });
      setAccounts((l) => l.map((a) => (a.id === id && a.role !== "Super Admin" ? { ...a, role } : a)));
      showToast(role === "Admin" ? `${name} sekarang menjadi admin.` : `${name} sekarang menjadi user biasa.`);
      setDialog(null);
    } catch (e) {
      showToast(e instanceof Error ? e.message : "Gagal mengubah role.");
    } finally {
      setAccBusy(false);
    }
  }

  // Hapus akun dan ganti password masih mengubah tampilan saja (belum tersambung ke backend).
  function remove(id: number) {
    // TODO: await apiAkun(`/${id}`, { method: "DELETE" })
    setAccounts((l) => l.filter((a) => a.id !== id));
    showToast(`Akun ${target?.name} dihapus.`);
    setDialog(null);
  }
  function changePassword(_password: string) {
    // TODO: await apiAkun(`/${target.id}/password`, { method: "PATCH", body: JSON.stringify({ password }) })
    showToast(`Password ${target?.name} diperbarui.`);
    setDialog(null);
  }

  return (
    <main className={`page ${inter.className}`}>
      <style>{css}</style>

      <div className="wrap">
        <header className="head">
          <h1>Pengaturan</h1>
          <p className="sub">Kelola pengaturan sistem dan preferensi admin.</p>
        </header>

        <div className="layout">
          {/* ───── Metode pembayaran ───── */}
          <section className="card" aria-labelledby="pay-title">
            <header className="card-head">
              <h2 id="pay-title">Metode Pembayaran</h2>
              <button type="button" className="btn-add" onClick={() => setPayDialog({ kind: "add" })}>
                <IPlus /> Tambah Metode
              </button>
            </header>

            {payLoading ? (
              <div className="pay-grid" aria-busy="true">
                {[0, 1, 2, 3].map((i) => <div key={i} className="pay skeleton" />)}
              </div>
            ) : payError ? (
              <div className="empty">
                <span className="empty-icon danger"><IWarn /></span>
                <h3>Gagal memuat data</h3>
                <p>{payError}</p>
                <button type="button" className="btn-ghost" onClick={loadPayments}>Coba lagi</button>
              </div>
            ) : payments.length === 0 ? (
              <div className="empty">
                <span className="empty-icon"><IInbox /></span>
                <h3>Belum ada metode pembayaran</h3>
                <p>Tambahkan rekening atau e-wallet agar pelanggan bisa membayar.</p>
                <button type="button" className="btn-primary" onClick={() => setPayDialog({ kind: "add" })}>
                  <IPlus /> Tambah Metode
                </button>
              </div>
            ) : (
              <div className="pay-grid">
                {payments.map((p) => (
                  <div key={p.id} className={`pay ${p.is_active ? "" : "off"}`}>
                    <span className="pay-code">{codeFor(p.name)}</span>
                    <div className="pay-text">
                      <span className="name">{p.name}</span>
                      <span className="pay-acc">{p.account_number}</span>
                      <span className={`pay-status ${p.is_active ? "ok" : ""}`}>{p.is_active ? "Aktif" : "Nonaktif"}</span>
                    </div>
                    <Switch
                      checked={p.is_active}
                      onChange={() => togglePayment(p)}
                      label={`${p.name}: ${p.is_active ? "nonaktifkan" : "aktifkan"}`}
                    />
                    <button
                      type="button"
                      className="icon-btn"
                      aria-label={`Hapus ${p.name}`}
                      title="Hapus"
                      onClick={() => setPayDialog({ kind: "delete", id: p.id })}
                    >
                      <ITrash />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </section>

          {/* ───── Informasi sistem ───── */}
          <section className="card" aria-labelledby="sys-title">
            <header className="card-head"><h2 id="sys-title">Informasi Sistem</h2></header>
            <div className="sys">
              <div className="sys-row"><span className="muted">Versi Aplikasi</span><span className="version">{APP_VERSION}</span></div>
              <div className="sys-row"><span className="muted">Pembaruan Terakhir</span><span>{LAST_UPDATE}</span></div>
            </div>
          </section>
        </div>

        {/* ───── Kelola akun staff (paling bawah) ───── */}
        <section className="card" aria-labelledby="acc-title">
          <header className="card-head"><h2 id="acc-title">Kelola Akun Staff</h2></header>

          <div className="acc-tools">
            <div className="segment" role="tablist" aria-label="Jenis akun">
              <button type="button" role="tab" aria-selected={tab === "admin"} className={`seg ${tab === "admin" ? "on" : ""}`} onClick={() => setTab("admin")}>
                Admin <span className="count">{admins.length}</span>
              </button>
              <button type="button" role="tab" aria-selected={tab === "user"} className={`seg ${tab === "user" ? "on" : ""}`} onClick={() => setTab("user")}>
                User <span className="count">{users.length}</span>
              </button>
            </div>
          </div>

          {accLoading ? (
            <div className="empty" aria-busy="true"><p>Memuat akun…</p></div>
          ) : accError ? (
            <div className="empty">
              <span className="empty-icon danger"><IWarn /></span>
              <h3>Gagal memuat akun</h3>
              <p>{accError}</p>
              <button type="button" className="btn-ghost" onClick={loadAccounts}>Coba lagi</button>
            </div>
          ) : tab === "admin" ? (
            admins.length > 0 ? (
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr><th>Nama</th><th>Email</th><th>Role</th><th className="right">Aksi</th></tr>
                  </thead>
                  <tbody>
                    {admins.map((a) => {
                      const locked = a.role === "Super Admin";
                      return (
                        <tr key={a.id}>
                          <td><div className="who"><Avatar name={a.name} /><span className="name">{a.name}</span></div></td>
                          <td className="muted">{a.email}</td>
                          <td><RolePill role={a.role} /></td>
                          <td>
                            <div className="actions">
                              <button className="btn-sm" onClick={() => setDialog({ kind: "password", id: a.id })}><IKey /> Update Password</button>
                              <button
                                className="btn-sm"
                                disabled={locked}
                                title={locked ? "Super Admin tidak bisa diubah menjadi user" : "Ubah menjadi user biasa"}
                                onClick={() => setDialog({ kind: "demote", id: a.id })}
                              >
                                <IUserMinus /> Jadikan User
                              </button>
                              <button className="btn-sm danger" disabled={locked} title={locked ? "Super Admin tidak bisa dihapus" : undefined} onClick={() => setDialog({ kind: "delete", id: a.id })}><ITrash /> Hapus</button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="empty"><span className="empty-icon"><IInbox /></span><h3>Belum ada admin</h3><p>Pilih user di tab User untuk dijadikan admin.</p></div>
            )
          ) : users.length > 0 ? (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr><th>Nama</th><th>Email</th><th>Role</th><th className="right">Aksi</th></tr>
                </thead>
                <tbody>
                  {users.map((u) => (
                    <tr key={u.id}>
                      <td><div className="who"><Avatar name={u.name} /><span className="name">{u.name}</span></div></td>
                      <td className="muted">{u.email}</td>
                      <td><RolePill role={u.role} /></td>
                      <td>
                        <div className="actions">
                          <button className="btn-sm accent" title="Beri akses admin" onClick={() => setDialog({ kind: "promote", id: u.id })}>
                            <IUserPlus /> Jadikan Admin
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="empty"><span className="empty-icon"><IInbox /></span><h3>Belum ada user</h3><p>User yang terdaftar akan muncul di sini.</p></div>
          )}
        </section>
      </div>

      {/* Dialog metode pembayaran */}
      {payDialog?.kind === "add" && (
        <AddPaymentDialog onCancel={() => setPayDialog(null)} onSubmit={addPayment} />
      )}
      {payDialog?.kind === "delete" && payTarget && (
        <ConfirmDialog
          title="Hapus metode pembayaran?"
          body={<><strong>{payTarget.name}</strong> ({payTarget.account_number}) akan dihapus permanen dan tidak muncul lagi di pilihan pembayaran.</>}
          confirmLabel="Ya, Hapus"
          danger
          busy={payBusy}
          onCancel={() => setPayDialog(null)}
          onConfirm={() => deletePayment(payTarget)}
        />
      )}

      {/* Dialog akun staff */}
      {dialog?.kind === "promote" && target && (
        <ConfirmDialog
          title="Jadikan admin?"
          body={<><strong>{target.name}</strong> akan mendapatkan akses admin ke dashboard.</>}
          confirmLabel="Ya, Jadikan Admin"
          busy={accBusy}
          onCancel={() => setDialog(null)}
          onConfirm={() => changeRole(target.id, "Admin")}
        />
      )}
      {dialog?.kind === "demote" && target && (
        <ConfirmDialog
          title="Jadikan user biasa?"
          body={<><strong>{target.name}</strong> akan kembali menjadi user biasa dan kehilangan akses admin.</>}
          confirmLabel="Ya, Jadikan User"
          danger
          busy={accBusy}
          onCancel={() => setDialog(null)}
          onConfirm={() => changeRole(target.id, "User")}
        />
      )}
      {dialog?.kind === "delete" && target && (
        <ConfirmDialog
          title="Hapus akun?"
          body={<>Akun <strong>{target.name}</strong> ({target.email}) akan dihapus permanen dan tidak dapat dikembalikan.</>}
          confirmLabel="Ya, Hapus"
          danger
          onCancel={() => setDialog(null)}
          onConfirm={() => remove(target.id)}
        />
      )}
      {dialog?.kind === "password" && target && (
        <PasswordDialog name={target.name} onCancel={() => setDialog(null)} onSubmit={changePassword} />
      )}
      {toast && <div className="toast" role="status"><ICheck /> {toast}</div>}
    </main>
  );
}

/* ───────────── Styles ───────────── */
const css = `
:root {
  --bg: #FCF6F1; --card: #FFFFFF; --ink: #17202A; --muted: #6A7380; --line: #EADFD4;
  --head: #E6DACD; --soft: #FBF0E6; --hover: #FBF8F4; --tile: #F6E9DC;
  --accent: #2F5D80; --accent-hover: #244A68; --accent-ink: #FFFFFF; --accent-soft: #E6EEF5;
  --danger: #C4372D; --danger-hover: #A92E25; --danger-soft: #FCEBE9;
  --field: #FFFFFF; --overlay: rgba(23,32,42,.5); --off: #C9CED6;
  --shadow: 0 1px 2px rgba(23,32,42,.04), 0 6px 20px rgba(23,32,42,.05);
}
:root[data-theme="dark"] {
  --bg: #121316; --card: #1B1C20; --ink: #F1EEEA; --muted: #9CA3AE; --line: #2E3037;
  --head: #26282E; --soft: #24262B; --hover: #212328; --tile: #2B2D33;
  --accent: #8EC1EC; --accent-hover: #A8D1F2; --accent-ink: #10202D; --accent-soft: #1F3547;
  --danger: #EE7A70; --danger-hover: #F59A92; --danger-soft: #3A2220;
  --field: #14151A; --overlay: rgba(0,0,0,.65); --off: #3A3D45;
  --shadow: 0 1px 2px rgba(0,0,0,.3), 0 6px 20px rgba(0,0,0,.3);
}
* { box-sizing: border-box; margin: 0; padding: 0; }
html, body { background: var(--bg); color: var(--ink); -webkit-font-smoothing: antialiased; }
button { font: inherit; color: inherit; }
a { color: inherit; text-decoration: none; }

.page { min-height: 100vh; }
.wrap { max-width: 1240px; margin: 0 auto; padding: 32px 24px 64px; display: flex; flex-direction: column; gap: 24px; }
.card { background: var(--card); border: 1px solid var(--line); border-radius: 14px; box-shadow: var(--shadow); overflow: hidden; }
.card-head { display: flex; justify-content: space-between; align-items: center; gap: 12px; padding: 14px 20px; background: var(--head); min-height: 56px; }
.icon { fill: none; stroke: currentColor; stroke-width: 1.7; stroke-linecap: round; stroke-linejoin: round; flex-shrink: 0; }

h1 { font-size: 28px; font-weight: 700; letter-spacing: -0.025em; line-height: 1.15; }
h2 { font-size: 15px; font-weight: 650; letter-spacing: -0.01em; }
h3 { font-size: 16px; font-weight: 650; }
.sub { font-size: 13.5px; color: var(--muted); margin-top: 6px; line-height: 1.5; }
.sub strong { color: var(--ink); }
.muted { color: var(--muted); }
.name { font-weight: 600; font-size: 13.5px; }
.right { text-align: right; }

.layout { display: grid; grid-template-columns: minmax(0, 1fr) 340px; gap: 24px; align-items: start; }

/* buttons */
.btn-primary, .btn-ghost, .btn-danger { display: inline-flex; align-items: center; justify-content: center; gap: 8px; height: 40px; padding: 0 18px; font-size: 13.5px; font-weight: 600; border-radius: 10px; cursor: pointer; border: 1px solid transparent; transition: background .15s, border-color .15s; white-space: nowrap; }
.btn-primary { background: var(--accent); color: var(--accent-ink); }
.btn-primary:hover:not(:disabled) { background: var(--accent-hover); }
.btn-danger { background: var(--danger); color: #fff; }
.btn-danger:hover:not(:disabled) { background: var(--danger-hover); }
.btn-ghost { background: var(--card); border-color: var(--line); }
.btn-ghost:hover:not(:disabled) { background: var(--hover); border-color: var(--muted); }
.btn-add { display: inline-flex; align-items: center; gap: 6px; height: 34px; padding: 0 14px; font-size: 13px; font-weight: 600; border-radius: 9px; cursor: pointer; border: 0; background: var(--accent); color: var(--accent-ink); transition: background .15s; white-space: nowrap; }
.btn-add:hover { background: var(--accent-hover); }
.btn-sm { display: inline-flex; align-items: center; gap: 6px; height: 32px; padding: 0 10px; font-size: 12.5px; font-weight: 600; background: var(--card); border: 1px solid var(--line); border-radius: 8px; cursor: pointer; white-space: nowrap; transition: background .15s, border-color .15s, color .15s; }
.btn-sm:hover:not(:disabled) { background: var(--hover); border-color: var(--muted); }
.btn-sm.accent { color: var(--accent); background: var(--accent-soft); border-color: transparent; }
.btn-sm.accent:hover:not(:disabled) { background: var(--accent); color: var(--accent-ink); border-color: var(--accent); }
.btn-sm.danger { color: var(--danger); }
.btn-sm.danger:hover:not(:disabled) { background: var(--danger-soft); border-color: var(--danger); }
.icon-btn { display: grid; place-items: center; width: 32px; height: 32px; flex-shrink: 0; border: 1px solid transparent; border-radius: 8px; background: transparent; color: var(--muted); cursor: pointer; transition: background .15s, color .15s, border-color .15s; }
.icon-btn:hover { background: var(--danger-soft); color: var(--danger); border-color: var(--danger); }
button:focus-visible, input:focus-visible, a:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
button:disabled { opacity: .45; cursor: not-allowed; }

/* switch */
.switch { position: relative; width: 42px; height: 24px; flex-shrink: 0; border: 0; border-radius: 999px; background: var(--off); cursor: pointer; transition: background .15s; }
.switch.on { background: var(--accent); }
.knob { position: absolute; top: 3px; left: 3px; width: 18px; height: 18px; border-radius: 50%; background: #fff; box-shadow: 0 1px 2px rgba(0,0,0,.25); transition: transform .15s; }
.switch.on .knob { transform: translateX(18px); }

/* payments */
.pay-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 14px; padding: 20px; }
.pay { display: flex; align-items: center; gap: 12px; padding: 12px 14px; border: 1px solid var(--line); border-radius: 10px; }
.pay.off .pay-code, .pay.off .name, .pay.off .pay-acc { opacity: .6; }
.pay.skeleton { height: 74px; background: var(--soft); border-color: transparent; animation: pulse 1.2s ease-in-out infinite; }
.pay-code { width: 40px; height: 40px; flex-shrink: 0; display: grid; place-items: center; border-radius: 8px; background: var(--tile); font-size: 9.5px; font-weight: 700; letter-spacing: .02em; }
.pay-text { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 2px; }
.pay-text .name { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.pay-acc { font-size: 12px; color: var(--muted); font-variant-numeric: tabular-nums; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.pay-status { font-size: 10.5px; font-weight: 700; letter-spacing: .05em; text-transform: uppercase; color: var(--muted); }
.pay-status.ok { color: var(--accent); }

/* system info */
.sys { padding: 20px; display: flex; flex-direction: column; gap: 14px; font-size: 13.5px; }
.sys-row { display: flex; justify-content: space-between; align-items: center; }
.version { padding: 3px 10px; font-size: 12.5px; font-weight: 700; border-radius: 6px; background: var(--accent-soft); color: var(--accent); }

/* accounts */
.acc-tools { padding: 16px 20px; border-bottom: 1px solid var(--line); }
.segment { display: inline-grid; grid-template-columns: 1fr 1fr; gap: 4px; padding: 4px; background: var(--soft); border-radius: 12px; }
.seg { display: inline-flex; align-items: center; justify-content: center; gap: 8px; height: 36px; padding: 0 22px; border: 0; border-radius: 9px; background: transparent; font-size: 13px; font-weight: 600; color: var(--muted); cursor: pointer; transition: background .15s, color .15s, box-shadow .15s; }
.seg:hover { color: var(--ink); }
.seg.on { background: var(--card); color: var(--accent); box-shadow: 0 1px 3px rgba(23,32,42,.12); }
.count { min-width: 20px; padding: 1px 6px; font-size: 11.5px; border-radius: 999px; background: var(--line); color: var(--muted); }
.seg.on .count { background: var(--accent-soft); color: var(--accent); }

.table-wrap { overflow-x: auto; }
table { width: 100%; border-collapse: collapse; min-width: 720px; font-size: 13.5px; }
th { text-align: left; font-size: 11.5px; font-weight: 600; letter-spacing: .04em; text-transform: uppercase; color: var(--muted); padding: 12px 20px; background: var(--soft); white-space: nowrap; }
th.right { text-align: right; }
td { padding: 14px 20px; border-bottom: 1px solid var(--line); vertical-align: middle; }
tbody tr:hover { background: var(--hover); }
tbody tr:last-child td { border-bottom: 0; }
.who { display: flex; align-items: center; gap: 10px; }
.avatar { display: grid; place-items: center; border-radius: 50%; color: #fff; font-weight: 600; flex-shrink: 0; }
.actions { display: flex; justify-content: flex-end; gap: 8px; flex-wrap: wrap; }

.role { display: inline-block; padding: 3px 10px; font-size: 11.5px; font-weight: 700; border-radius: 6px; white-space: nowrap; }
.role.super { background: var(--accent-soft); color: var(--accent); }
.role.admin { background: #F6E2C2; color: #8A5A12; }
.role.user { background: var(--soft); color: var(--muted); }
:root[data-theme="dark"] .role.admin { background: #3A2F1A; color: #E7BE7A; }

.empty { display: flex; flex-direction: column; align-items: center; text-align: center; padding: 48px 24px 56px; gap: 8px; }
.empty-icon { width: 72px; height: 72px; border-radius: 50%; display: grid; place-items: center; background: var(--accent-soft); color: var(--accent); margin-bottom: 10px; }
.empty-icon.danger { background: var(--danger-soft); color: var(--danger); }
.empty p { max-width: 340px; font-size: 13.5px; color: var(--muted); line-height: 1.6; margin-bottom: 8px; }

/* form */
.field { display: flex; flex-direction: column; gap: 6px; }
.label { font-size: 13px; font-weight: 600; }
.input { width: 100%; padding: 10px 12px; font: inherit; font-size: 13.5px; line-height: 1.5; color: var(--ink); background: var(--field); border: 1px solid var(--line); border-radius: 10px; transition: border-color .15s, box-shadow .15s; }
.input::placeholder { color: var(--muted); opacity: .7; }
.input:focus { outline: 0; border-color: var(--accent); box-shadow: 0 0 0 3px var(--accent-soft); }
.input[aria-invalid="true"] { border-color: var(--danger); }
.check { display: inline-flex; align-items: center; gap: 8px; font-size: 12.5px; color: var(--muted); cursor: pointer; }
.check input { accent-color: var(--accent); }
.err { font-size: 12px; color: var(--danger); font-weight: 500; }

/* modal */
.overlay { position: fixed; inset: 0; z-index: 50; background: var(--overlay); backdrop-filter: blur(4px); display: grid; place-items: center; padding: 16px; animation: fade .15s ease; }
.modal { width: 100%; max-width: 440px; background: var(--card); border: 1px solid var(--line); border-radius: 16px; box-shadow: 0 24px 64px rgba(0,0,0,.28); overflow: hidden; animation: pop .18s ease; }
.modal-body { padding: 22px 24px; display: flex; flex-direction: column; gap: 14px; }
.modal-body .sub { margin-top: 0; }
.modal-body.confirm { align-items: center; text-align: center; padding-top: 28px; gap: 10px; }
.modal-foot { display: flex; justify-content: flex-end; gap: 10px; padding: 16px 24px; border-top: 1px solid var(--line); background: var(--soft); }
.info-icon { width: 48px; height: 48px; border-radius: 50%; display: grid; place-items: center; background: var(--accent-soft); color: var(--accent); }
.info-icon.danger { background: var(--danger-soft); color: var(--danger); }

.toast { position: fixed; left: 50%; bottom: 28px; transform: translateX(-50%); z-index: 80; display: flex; align-items: center; gap: 8px; background: var(--ink); color: var(--bg); font-size: 13.5px; font-weight: 500; padding: 11px 18px; border-radius: 12px; box-shadow: 0 10px 30px rgba(0,0,0,.25); animation: fade .2s ease; max-width: calc(100vw - 32px); }

@keyframes fade { from { opacity: 0 } to { opacity: 1 } }
@keyframes pop { from { opacity: 0; transform: translateY(8px) scale(.98) } to { opacity: 1; transform: none } }
@keyframes pulse { 50% { opacity: .55 } }

@media (max-width: 1040px) { .layout { grid-template-columns: 1fr; } }
@media (max-width: 640px) {
  .wrap { padding: 20px 16px 48px; }
  h1 { font-size: 24px; }
  .pay-grid { grid-template-columns: 1fr; padding: 16px; }
  .segment { display: grid; width: 100%; }
}
@media (prefers-reduced-motion: reduce) { * { transition: none !important; animation: none !important; } }
`;