"use client";

import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";
import { Inter } from "next/font/google";

const inter = Inter({ subsets: ["latin"], display: "swap" });

/* ───────────── API ───────────── */
const API = "http://localhost:3001/api/notifikasi";
const authHeaders = (): Record<string, string> => ({
  "Content-Type": "application/json",
  Authorization: `Bearer ${localStorage.getItem("token") ?? ""}`, // sesuaikan key token kamu
});

/* ───────────── Tipe & konstanta ───────────── */
type Channel = "In-App" | "Email" | "SMS/WA";
type Mode = "all" | "selected";
type Status = "Terkirim" | "Gagal";

type AppUser = { id: string; name: string; email: string };

type Notification = {
  id: string;
  title: string;
  message: string;
  channel: Channel;
  mode: Mode;
  recipientNames: string[]; // untuk mode "selected"
  recipients: number;
  status: Status;
  sentAt: string; // ISO
};

const CHANNEL_COLOR: Record<Channel, string> = {
  "In-App": "#3B82C4",
  Email: "#0EA5A4",
  "SMS/WA": "#C08A2B",
};
const STATUS_COLOR: Record<Status, string> = { Terkirim: "#16A34A", Gagal: "#DC4C4C" };
const AVATAR_COLORS = ["#2F5D80", "#B4573A", "#5B7F4A", "#7A5C9E", "#A8742A", "#3F7F88"];
const PAGE_SIZE = 5;
const TITLE_MAX = 80;
const MESSAGE_MAX = 500;

/* ───────────── Helpers ───────────── */
const nf = new Intl.NumberFormat("id-ID");
const initials = (name: string) =>
  name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]?.toUpperCase()).join("");
const colorFor = (name: string) => {
  let h = 0;
  for (const c of name) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return AVATAR_COLORS[h % AVATAR_COLORS.length];
};
const fmt = (iso: string) => {
  const d = new Date(iso);
  return {
    date: d.toLocaleDateString("id-ID", { day: "numeric", month: "short", year: "numeric" }),
    time: d.toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" }).replace(".", ":"),
  };
};
const targetLabel = (n: Notification) =>
  n.mode === "all" ? "Semua User" : n.recipients === 1 ? n.recipientNames[0] ?? "1 User" : `${nf.format(n.recipients)} User terpilih`;

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
function Icon({ children, size = 18 }: { children: ReactNode; size?: number }) {
  return (
    <svg className="icon" width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
      {children}
    </svg>
  );
}
const IBell = ({ size }: { size?: number }) => <Icon size={size}><path d="M6 17V11a6 6 0 0 1 12 0v6l1.5 2h-15L6 17ZM10 21h4" /></Icon>;
const IMail = ({ size }: { size?: number }) => <Icon size={size}><rect x="3" y="5" width="18" height="14" rx="2.5" /><path d="m3.5 7 8.5 6 8.5-6" /></Icon>;
const IChat = ({ size }: { size?: number }) => <Icon size={size}><path d="M4 5h16v11H9l-5 4V5ZM8 10h8M8 13h5" /></Icon>;
const IGlobe = () => <Icon><circle cx="12" cy="12" r="9" /><path d="M3 12h18M12 3c3 3 3 15 0 18M12 3c-3 3-3 15 0 18" /></Icon>;
const IUsers = () => <Icon><circle cx="9" cy="8" r="3.5" /><path d="M2.5 20c0-3.5 3-5.5 6.5-5.5s6.5 2 6.5 5.5M16 4.6a3.5 3.5 0 0 1 0 6.8M18 14.8c2.2.6 3.5 2.4 3.5 5.2" /></Icon>;
const ISearch = () => <Icon size={16}><circle cx="11" cy="11" r="6.5" /><path d="m20 20-4-4" /></Icon>;
const ISend = () => <Icon size={16}><path d="M21 3 10 14M21 3l-7 18-4-7-7-4 18-7Z" /></Icon>;
const IClose = () => <Icon size={14}><path d="M6 6l12 12M18 6 6 18" /></Icon>;
const IPrev = () => <Icon size={14}><path d="m15 5-7 7 7 7" /></Icon>;
const INext = () => <Icon size={14}><path d="m9 5 7 7-7 7" /></Icon>;
const ICheck = () => <Icon size={16}><path d="m5 12.5 4.5 4.5L19 7.5" /></Icon>;
const IDownload = () => <Icon size={16}><path d="M12 4v11M7 11l5 5 5-5M4 20h16" /></Icon>;
const IAlert = () => <Icon size={14}><path d="M12 4 2.5 20h19L12 4ZM12 10v4.5M12 17.5h.01" /></Icon>;
const IInbox = () => (
  <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M3 13l3-8h12l3 8v6H3v-6ZM3 13h5l1 3h6l1-3h5" />
  </svg>
);

function ChannelIcon({ channel, size }: { channel: Channel; size?: number }) {
  return channel === "In-App" ? <IBell size={size} /> : channel === "Email" ? <IMail size={size} /> : <IChat size={size} />;
}

/* ───────────── Komponen kecil ───────────── */
function Pill({ color, children, dot = true }: { color: string; children: ReactNode; dot?: boolean }) {
  return (
    <span className="pill" style={{ "--c": color } as CSSProperties}>
      {dot && <i />}
      {children}
    </span>
  );
}

function Avatar({ name, size = 30 }: { name: string; size?: number }) {
  return (
    <span className="avatar" style={{ width: size, height: size, fontSize: size * 0.38, background: colorFor(name) }} aria-hidden="true">
      {initials(name)}
    </span>
  );
}

function StatCard({ label, value, hint, tone }: { label: string; value: string; hint: ReactNode; tone?: "ok" | "bad" }) {
  return (
    <article className="card stat">
      <p className="stat-label">{label}</p>
      <p className="stat-value">{value}</p>
      <p className={`stat-hint ${tone ?? ""}`}>{hint}</p>
    </article>
  );
}

/* ───────────── Dialog konfirmasi kirim ───────────── */
function ConfirmSend({
  channel,
  title,
  recipients,
  mode,
  sending,
  onCancel,
  onConfirm,
}: {
  channel: Channel;
  title: string;
  recipients: number;
  mode: Mode;
  sending: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  useModal(sending ? () => {} : onCancel);
  return (
    <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && !sending && onCancel()}>
      <div className="modal" role="alertdialog" aria-modal="true" aria-labelledby="cs-title">
        <div className="modal-body confirm">
          <span className="info-icon"><ISend /></span>
          <h2 id="cs-title">Kirim notifikasi sekarang?</h2>
          <p className="sub">
            “{title}” akan dikirim ke{" "}
            <strong>{mode === "all" ? `semua pengguna (${nf.format(recipients)})` : `${nf.format(recipients)} pengguna terpilih`}</strong>{" "}
            melalui <strong>{channel}</strong>. Pengiriman tidak dapat dibatalkan.
          </p>
        </div>
        <footer className="modal-foot">
          <button className="btn-ghost" onClick={onCancel} disabled={sending}>Batal</button>
          <button className="btn-primary" onClick={onConfirm} disabled={sending} autoFocus>
            {sending ? "Mengirim..." : "Ya, Kirim"}
          </button>
        </footer>
      </div>
    </div>
  );
}

/* ───────────── Halaman ───────────── */
type Errors = { users?: string; title?: string; message?: string };

export default function NotificationPage() {
  const [users, setUsers] = useState<AppUser[]>([]);
  const [history, setHistory] = useState<Notification[]>([]);

  /* waktu sekarang: diambil di browser agar tidak memicu error prerender */
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => setNow(Date.now()), []);

  /* form */
  const [mode, setMode] = useState<Mode>("all");
  const channel: Channel = "In-App"; // jenis notifikasi tetap
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [userQuery, setUserQuery] = useState("");
  const [title, setTitle] = useState("");
  const [message, setMessage] = useState("");
  const [errors, setErrors] = useState<Errors>({});
  const [confirming, setConfirming] = useState(false);
  const [sending, setSending] = useState(false);

  /* riwayat */
  const [histFilter, setHistFilter] = useState<"Semua" | Status>("Semua");
  const [page, setPage] = useState(1);

  const [toast, setToast] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  function showToast(msg: string) {
    setToast(msg);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setToast(null), 2800);
  }

  /* ambil data user + riwayat dari backend */
  async function loadAll() {
    try {
      const [u, h] = await Promise.all([
        fetch(`${API}/users`, { headers: authHeaders() }).then((r) => r.json()),
        fetch(API, { headers: authHeaders() }).then((r) => r.json()),
      ]);
      if (Array.isArray(u)) setUsers(u);
      if (Array.isArray(h)) setHistory(h);
    } catch {
      showToast("Gagal memuat data dari server.");
    }
  }
  useEffect(() => {
    loadAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* pencarian user */
  const results = useMemo(() => {
    const q = userQuery.trim().toLowerCase();
    return users.filter((u) => !q || u.name.toLowerCase().includes(q) || u.email.toLowerCase().includes(q));
  }, [userQuery, users]);
  const pickedUsers = users.filter((u) => picked.has(u.id));
  const recipients = mode === "all" ? users.length : pickedUsers.length;

  function toggleUser(id: string) {
    setPicked((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
    setErrors((e) => ({ ...e, users: undefined }));
  }
  function pickAllResults() {
    setPicked((prev) => new Set([...prev, ...results.map((u) => u.id)]));
    setErrors((e) => ({ ...e, users: undefined }));
  }
  const allResultsPicked = results.length > 0 && results.every((u) => picked.has(u.id));

  /* validasi → buka konfirmasi */
  function requestSend() {
    const errs: Errors = {};
    if (mode === "selected" && pickedUsers.length === 0) errs.users = "Pilih minimal 1 user penerima.";
    if (title.trim().length < 3) errs.title = "Judul minimal 3 karakter.";
    if (message.trim().length < 5) errs.message = "Isi pesan minimal 5 karakter.";
    setErrors(errs);
    if (Object.keys(errs).length === 0) setConfirming(true);
  }

  /* Kirim ke backend */
  async function send() {
    setSending(true);
    try {
      const res = await fetch(API, {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify({
          title: title.trim(),
          message: message.trim(),
          channel,
          mode,
          userIds: mode === "selected" ? pickedUsers.map((u) => u.id) : [],
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "Gagal mengirim");

      await loadAll(); // ambil riwayat terbaru dari database
      setTitle("");
      setMessage("");
      setPicked(new Set());
      setUserQuery("");
      setErrors({});
      setHistFilter("Semua");
      setPage(1);
      setConfirming(false);
      showToast(`Notifikasi terkirim ke ${nf.format(data.recipients)} pengguna.`);
    } catch (err) {
      setConfirming(false);
      showToast(err instanceof Error ? err.message : "Gagal mengirim notifikasi.");
    } finally {
      setSending(false);
    }
  }

  /* statistik */
  const stats = useMemo(() => {
    const since = now === null ? null : now - 30 * 86_400_000;
    return {
      delivered: history
        .filter(
          (h) =>
            h.status === "Terkirim" &&
            (since === null || new Date(h.sentAt).getTime() >= since),
        )
        .reduce((s, h) => s + h.recipients, 0),
      total: history.length,
      failed: history.filter((h) => h.status === "Gagal").length,
    };
  }, [history, now]);

  /* riwayat: filter + paginasi */
  const filtered = useMemo(
    () =>
      history
        .filter((h) => histFilter === "Semua" || h.status === histFilter)
        .sort((a, b) => b.sentAt.localeCompare(a.sentAt)),
    [history, histFilter],
  );
  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(page, pageCount);
  const start = (safePage - 1) * PAGE_SIZE;
  const rows = filtered.slice(start, start + PAGE_SIZE);

  /* Ekspor laporan: file Excel (.xls) dengan tampilan rapi */
  function exportReport() {
    const esc = (v: string | number) =>
      String(v).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

    const printedAt = new Date().toLocaleString("id-ID", {
      day: "numeric",
      month: "long",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
    const fileDate = new Date().toISOString().slice(0, 10);

    const totalRecipients = filtered.reduce((s, h) => s + h.recipients, 0);
    const delivered = filtered.filter((h) => h.status === "Terkirim").length;
    const failed = filtered.filter((h) => h.status === "Gagal").length;

    const channelStyle: Record<Channel, string> = {
      "In-App": "background:#E3EEF9;color:#1F5E99;",
      Email: "background:#DDF3F2;color:#0B7A79;",
      "SMS/WA": "background:#F7EBD6;color:#8A5F12;",
    };
    const statusStyle: Record<Status, string> = {
      Terkirim: "background:#DCFCE7;color:#166534;",
      Gagal: "background:#FEE2E2;color:#991B1B;",
    };

    const bodyRows = filtered
      .map((h, i) => {
        const { date, time } = fmt(h.sentAt);
        const zebra = i % 2 === 0 ? "#FFFFFF" : "#F8F5F1";
        return `<tr>
  <td class="c" style="background:${zebra};mso-number-format:'\\@';">${i + 1}</td>
  <td style="background:${zebra};mso-number-format:'\\@';">${esc(date)}</td>
  <td class="c" style="background:${zebra};mso-number-format:'\\@';">${esc(time)}</td>
  <td style="background:${zebra};font-weight:bold;">${esc(h.title)}</td>
  <td style="background:${zebra};">${esc(targetLabel(h))}</td>
  <td class="c" style="${channelStyle[h.channel]}font-weight:bold;">${esc(h.channel)}</td>
  <td class="c" style="background:${zebra};">${h.recipients}</td>
  <td class="c" style="${statusStyle[h.status]}font-weight:bold;">${esc(h.status)}</td>
</tr>`;
      })
      .join("\n");

    const html = `<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel" xmlns="http://www.w3.org/TR/REC-html40">
<head>
<meta charset="utf-8">
<!--[if gte mso 9]><xml><x:ExcelWorkbook><x:ExcelWorksheets><x:ExcelWorksheet>
<x:Name>Riwayat Notifikasi</x:Name>
<x:WorksheetOptions><x:DisplayGridlines>false</x:DisplayGridlines></x:WorksheetOptions>
</x:ExcelWorksheet></x:ExcelWorksheets></x:ExcelWorkbook></xml><![endif]-->
<style>
  table { border-collapse: collapse; font-family: Calibri, Arial, sans-serif; font-size: 11pt; }
  td, th { border: 1px solid #D9D2C9; padding: 6px 10px; vertical-align: middle; }
  .c { text-align: center; }
  .title { font-size: 18pt; font-weight: bold; color: #FFFFFF; background: #2F5D80; border: none; height: 38px; }
  .subtitle { color: #6A7380; font-size: 10pt; border: none; }
  .sum-label { background: #F3EEE8; font-weight: bold; color: #17202A; }
  .sum-value { background: #FFFFFF; font-weight: bold; text-align: center; color: #2F5D80; }
  .head { background: #2F5D80; color: #FFFFFF; font-weight: bold; text-align: center; height: 28px; }
  .blank { border: none; }
</style>
</head>
<body>
<table>
  <colgroup>
    <col width="40"><col width="110"><col width="70"><col width="280"><col width="170"><col width="90"><col width="110"><col width="90">
  </colgroup>
  <tr><td colspan="8" class="title">Laporan Riwayat Notifikasi &amp; Broadcast</td></tr>
  <tr><td colspan="8" class="subtitle">Dicetak: ${esc(printedAt)} &nbsp;|&nbsp; Filter status: ${esc(histFilter)}</td></tr>
  <tr><td colspan="8" class="blank">&nbsp;</td></tr>
  <tr>
    <td colspan="2" class="sum-label">Total Broadcast</td><td class="sum-value">${filtered.length}</td>
    <td class="blank"></td>
    <td colspan="2" class="sum-label">Total Penerima</td><td colspan="2" class="sum-value">${totalRecipients}</td>
  </tr>
  <tr>
    <td colspan="2" class="sum-label">Terkirim</td><td class="sum-value" style="color:#166534;">${delivered}</td>
    <td class="blank"></td>
    <td colspan="2" class="sum-label">Gagal</td><td colspan="2" class="sum-value" style="color:#991B1B;">${failed}</td>
  </tr>
  <tr><td colspan="8" class="blank">&nbsp;</td></tr>
  <tr>
    <th class="head">No</th><th class="head">Tanggal</th><th class="head">Waktu</th><th class="head">Judul</th>
    <th class="head">Target</th><th class="head">Jenis</th><th class="head">Penerima</th><th class="head">Status</th>
  </tr>
${bodyRows}
</table>
</body>
</html>`;

    const blob = new Blob(["\uFEFF" + html], { type: "application/vnd.ms-excel;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `riwayat-notifikasi-${fileDate}.xls`;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  return (
    <main className={`page ${inter.className}`}>
      <style>{css}</style>

      <div className="wrap">
        {/* Header */}
        <header className="head">
          <div>
            <nav className="crumb" aria-label="Breadcrumb">
              <span>Dashboard</span><span aria-hidden="true">/</span><strong>Notifikasi</strong>
            </nav>
            <h1>Notifikasi &amp; Broadcast</h1>
            <p className="sub">Kirimkan pembaruan, promosi, atau peringatan sistem langsung kepada audiens Anda melalui berbagai saluran notifikasi.</p>
          </div>
        </header>

        <div className="layout">
          {/* ───── Form kirim ───── */}
          <section className="card form" aria-label="Form kirim broadcast">
            <h2 className="form-title"><ISend /> Form Kirim Broadcast</h2>

            {/* Target */}
            <div className="field">
              <span className="label" id="target-label">Target Audiens</span>
              <div className="segment" role="radiogroup" aria-labelledby="target-label">
                <button type="button" role="radio" aria-checked={mode === "all"} className={`seg ${mode === "all" ? "on" : ""}`} onClick={() => (setMode("all"), setErrors((e) => ({ ...e, users: undefined })))}>
                  <IGlobe /> Semua User
                </button>
                <button type="button" role="radio" aria-checked={mode === "selected"} className={`seg ${mode === "selected" ? "on" : ""}`} onClick={() => setMode("selected")}>
                  <IUsers /> Pilih User
                </button>
              </div>

              {mode === "all" ? (
                <p className="note">Notifikasi akan dikirim ke seluruh <strong>{nf.format(users.length)}</strong> pengguna terdaftar.</p>
              ) : (
                <div className="picker">
                  <label className="search">
                    <ISearch />
                    <input
                      type="search"
                      placeholder="Cari nama atau email user..."
                      value={userQuery}
                      onChange={(e) => setUserQuery(e.target.value)}
                      aria-label="Cari user"
                    />
                  </label>

                  {pickedUsers.length > 0 && (
                    <div className="chips" aria-label="User terpilih">
                      {pickedUsers.map((u) => (
                        <span key={u.id} className="chip">
                          {u.name}
                          <button type="button" onClick={() => toggleUser(u.id)} aria-label={`Hapus ${u.name}`}><IClose /></button>
                        </span>
                      ))}
                    </div>
                  )}

                  <div className="picker-bar">
                    <span className="muted small">
                      {results.length} hasil · {pickedUsers.length} dipilih
                    </span>
                    <span className="picker-links">
                      {!allResultsPicked && results.length > 0 && (
                        <button type="button" className="btn-text" onClick={pickAllResults}>
                          {userQuery.trim() ? "Pilih semua hasil" : "Pilih semua"}
                        </button>
                      )}
                      {pickedUsers.length > 0 && (
                        <button type="button" className="btn-text muted-link" onClick={() => setPicked(new Set())}>Kosongkan</button>
                      )}
                    </span>
                  </div>

                  <ul className="user-list" role="listbox" aria-multiselectable="true" aria-label="Hasil pencarian user">
                    {results.map((u) => {
                      const on = picked.has(u.id);
                      return (
                        <li key={u.id} role="option" aria-selected={on}>
                          <button type="button" className={`user-row ${on ? "on" : ""}`} onClick={() => toggleUser(u.id)}>
                            <input type="checkbox" className="cb" checked={on} readOnly tabIndex={-1} aria-hidden="true" />
                            <Avatar name={u.name} />
                            <span className="user-text">
                              <span className="name">{u.name}</span>
                              <span className="muted small">{u.email}</span>
                            </span>
                          </button>
                        </li>
                      );
                    })}
                    {results.length === 0 && (
                      <li className="no-result">
                        {userQuery.trim() ? `Tidak ada user yang cocok dengan “${userQuery.trim()}”.` : "Belum ada user."}
                      </li>
                    )}
                  </ul>
                </div>
              )}
              {errors.users && <p className="err">{errors.users}</p>}
            </div>

            {/* Judul & isi */}
            <div className="field">
              <div className="label-row">
                <label className="label" htmlFor="n-title">Judul Notifikasi</label>
                <span className="hint">{title.length}/{TITLE_MAX}</span>
              </div>
              <input
                id="n-title"
                className="input"
                value={title}
                maxLength={TITLE_MAX}
                onChange={(e) => (setTitle(e.target.value), setErrors((er) => ({ ...er, title: undefined })))}
                placeholder="Masukkan judul yang menarik..."
                aria-invalid={!!errors.title}
              />
              {errors.title && <p className="err">{errors.title}</p>}
            </div>

            <div className="field">
              <div className="label-row">
                <label className="label" htmlFor="n-msg">Isi Pesan</label>
                <span className="hint">{message.length}/{MESSAGE_MAX}</span>
              </div>
              <textarea
                id="n-msg"
                rows={5}
                value={message}
                maxLength={MESSAGE_MAX}
                onChange={(e) => (setMessage(e.target.value), setErrors((er) => ({ ...er, message: undefined })))}
                placeholder="Tuliskan detail pesan Anda di sini..."
                aria-invalid={!!errors.message}
              />
              {errors.message && <p className="err">{errors.message}</p>}
            </div>

            <button className="btn-primary send" onClick={requestSend}>
              Kirim Sekarang <ISend />
            </button>
            <p className="hint center">
              Dikirim ke {nf.format(recipients)} pengguna via {channel}
            </p>
          </section>

          {/* ───── Statistik + riwayat ───── */}
          <div className="right-col">
            <section className="stats" aria-label="Ringkasan">
              <StatCard label="Terkirim (30 Hari)" value={nf.format(stats.delivered)} hint="Total penerima" />
              <StatCard label="Total Broadcast" value={nf.format(stats.total)} hint="Seluruh riwayat" />
              <StatCard
                label="Gagal Terkirim"
                value={nf.format(stats.failed)}
                tone={stats.failed ? "bad" : undefined}
                hint={
                  stats.failed ? (
                    <button className="inline-link" onClick={() => (setHistFilter("Gagal"), setPage(1))}>
                      <IAlert /> Cek log kegagalan
                    </button>
                  ) : (
                    "Tidak ada kegagalan"
                  )
                }
              />
            </section>

            <section className="card list">
              <div className="list-head">
                <h2>Riwayat Notifikasi</h2>
                <div className="list-tools">
                  <select value={histFilter} onChange={(e) => (setHistFilter(e.target.value as "Semua" | Status), setPage(1))} aria-label="Filter status">
                    <option value="Semua">Semua status</option>
                    <option>Terkirim</option>
                    <option>Gagal</option>
                  </select>
                  <button className="btn-text export" onClick={exportReport} disabled={filtered.length === 0}>
                    <IDownload /> Ekspor Laporan
                  </button>
                </div>
              </div>

              {rows.length > 0 ? (
                <>
                  <div className="table-wrap">
                    <table>
                      <thead>
                        <tr>
                          <th>Tanggal &amp; Waktu</th>
                          <th>Judul</th>
                          <th>Target</th>
                          <th>Jenis</th>
                          <th>Status</th>
                        </tr>
                      </thead>
                      <tbody>
                        {rows.map((h) => {
                          const { date, time } = fmt(h.sentAt);
                          return (
                            <tr key={h.id}>
                              <td className="nowrap">
                                {date}
                                <br />
                                <span className="muted small">{time}</span>
                              </td>
                              <td className="title-cell">{h.title}</td>
                              <td title={h.mode === "selected" ? h.recipientNames.join(", ") : undefined}>
                                {targetLabel(h)}
                                <br />
                                <span className="muted small">{nf.format(h.recipients)} penerima</span>
                              </td>
                              <td>
                                <Pill color={CHANNEL_COLOR[h.channel]} dot={false}>
                                  <ChannelIcon channel={h.channel} size={13} /> {h.channel}
                                </Pill>
                              </td>
                              <td><Pill color={STATUS_COLOR[h.status]}>{h.status}</Pill></td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>

                  <footer className="foot">
                    <span>
                      Menampilkan {start + 1}–{start + rows.length} dari {nf.format(filtered.length)} riwayat
                    </span>
                    <nav className="pager" aria-label="Paginasi">
                      <button className="pg" disabled={safePage === 1} onClick={() => setPage(safePage - 1)} aria-label="Sebelumnya"><IPrev /></button>
                      {Array.from({ length: pageCount }, (_, i) => i + 1).map((p) => (
                        <button key={p} className={`pg ${p === safePage ? "active" : ""}`} onClick={() => setPage(p)} aria-current={p === safePage ? "page" : undefined}>{p}</button>
                      ))}
                      <button className="pg" disabled={safePage === pageCount} onClick={() => setPage(safePage + 1)} aria-label="Berikutnya"><INext /></button>
                    </nav>
                  </footer>
                </>
              ) : (
                <div className="empty">
                  <span className="empty-icon"><IInbox /></span>
                  <h3>{histFilter === "Semua" ? "Belum ada riwayat" : "Tidak ada riwayat"}</h3>
                  <p>{histFilter === "Semua" ? "Notifikasi yang kamu kirim akan tercatat di sini." : "Tidak ada notifikasi dengan status ini."}</p>
                  {histFilter !== "Semua" && <button className="btn-ghost" onClick={() => setHistFilter("Semua")}>Tampilkan semua</button>}
                </div>
              )}
            </section>
          </div>
        </div>
      </div>

      {confirming && (
        <ConfirmSend
          channel={channel}
          title={title.trim()}
          recipients={recipients}
          mode={mode}
          sending={sending}
          onCancel={() => setConfirming(false)}
          onConfirm={send}
        />
      )}
      {toast && <div className="toast" role="status"><ICheck /> {toast}</div>}
    </main>
  );
}

/* ───────────── Styles ───────────── */
const css = `
:root {
  --bg: #F8F5F1; --card: #FFFFFF; --ink: #17202A; --muted: #6A7380; --line: #E7E1DA;
  --soft: #F3EEE8; --hover: #FBF9F6;
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
.wrap { max-width: 1240px; margin: 0 auto; padding: 32px 24px 64px; display: flex; flex-direction: column; gap: 24px; }
.card { background: var(--card); border: 1px solid var(--line); border-radius: 14px; box-shadow: var(--shadow); }
.icon { fill: none; stroke: currentColor; stroke-width: 1.7; stroke-linecap: round; stroke-linejoin: round; flex-shrink: 0; }

/* header */
.head { display: flex; justify-content: space-between; align-items: flex-start; gap: 20px; flex-wrap: wrap; }
.head > div:first-child { max-width: 620px; }
.crumb { display: flex; gap: 8px; font-size: 12px; color: var(--muted); margin-bottom: 10px; }
.crumb strong { color: var(--accent); font-weight: 600; }
h1 { font-size: 30px; font-weight: 700; letter-spacing: -0.025em; line-height: 1.15; }
h2 { font-size: 16px; font-weight: 650; letter-spacing: -0.01em; }
h3 { font-size: 16px; font-weight: 650; }
.sub { font-size: 13.5px; color: var(--muted); margin-top: 6px; line-height: 1.5; }
.muted { color: var(--muted); }
.small { font-size: 12px; }
.nowrap { white-space: nowrap; }
.center { text-align: center; }

.quota { display: flex; align-items: center; gap: 28px; padding: 14px 16px 14px 20px; }
.quota-value { font-size: 22px; font-weight: 700; letter-spacing: -0.02em; margin-top: 2px; color: var(--accent); }
.quota-icon { width: 42px; height: 42px; border-radius: 10px; display: grid; place-items: center; background: var(--accent-soft); color: var(--accent); }

/* layout */
.layout { display: grid; grid-template-columns: 400px minmax(0, 1fr); gap: 24px; align-items: start; }
.right-col { display: flex; flex-direction: column; gap: 20px; min-width: 0; }

/* buttons */
.btn-primary, .btn-ghost { display: inline-flex; align-items: center; justify-content: center; gap: 8px; height: 40px; padding: 0 18px; font-size: 13.5px; font-weight: 600; border-radius: 10px; cursor: pointer; border: 1px solid transparent; transition: background .15s, border-color .15s; white-space: nowrap; }
.btn-primary { background: var(--accent); color: var(--accent-ink); box-shadow: 0 1px 2px rgba(47,93,128,.3); }
.btn-primary:hover:not(:disabled) { background: var(--accent-hover); }
.btn-ghost { background: var(--card); border-color: var(--line); }
.btn-ghost:hover:not(:disabled) { background: var(--hover); border-color: var(--muted); }
.btn-text { display: inline-flex; align-items: center; gap: 6px; background: none; border: 0; color: var(--accent); font-size: 12.5px; font-weight: 600; cursor: pointer; padding: 6px 4px; }
.btn-text:hover:not(:disabled) { text-decoration: underline; }
.btn-text.muted-link { color: var(--muted); }
button:focus-visible, input:focus-visible, textarea:focus-visible, select:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
button:disabled { opacity: .45; cursor: not-allowed; }

/* form */
.form { padding: 22px; display: flex; flex-direction: column; gap: 20px; }
.form-title { display: flex; align-items: center; gap: 10px; color: var(--ink); }
.form-title .icon { color: var(--accent); }
.field { display: flex; flex-direction: column; gap: 8px; }
.label { font-size: 13px; font-weight: 600; }
.label-row { display: flex; justify-content: space-between; align-items: baseline; }
.hint { font-size: 12px; color: var(--muted); }
.err { font-size: 12px; color: var(--danger); font-weight: 500; }
.note { font-size: 12.5px; color: var(--muted); line-height: 1.5; padding: 10px 12px; background: var(--soft); border-radius: 10px; }
.note strong { color: var(--ink); }

.segment { display: grid; grid-template-columns: 1fr 1fr; gap: 4px; padding: 4px; background: var(--soft); border-radius: 12px; }
.seg { display: inline-flex; align-items: center; justify-content: center; gap: 8px; height: 38px; border: 0; border-radius: 9px; background: transparent; font-size: 13px; font-weight: 600; color: var(--muted); cursor: pointer; transition: background .15s, color .15s, box-shadow .15s; }
.seg:hover { color: var(--ink); }
.seg.on { background: var(--card); color: var(--accent); box-shadow: 0 1px 3px rgba(23,32,42,.12); }

/* picker */
.picker { display: flex; flex-direction: column; gap: 10px; }
.search { display: flex; align-items: center; gap: 8px; height: 40px; padding: 0 12px; border: 1px solid var(--line); background: var(--field); border-radius: 10px; color: var(--muted); transition: border-color .15s, box-shadow .15s; }
.search:focus-within { border-color: var(--accent); box-shadow: 0 0 0 3px var(--accent-soft); }
.search input { flex: 1; border: 0; outline: 0 !important; background: transparent; font: inherit; font-size: 13.5px; color: var(--ink); min-width: 0; }
.chips { display: flex; flex-wrap: wrap; gap: 6px; max-height: 88px; overflow-y: auto; }
.chip { display: inline-flex; align-items: center; gap: 4px; padding: 4px 4px 4px 10px; font-size: 12px; font-weight: 600; border-radius: 999px; background: var(--accent-soft); color: var(--accent); }
.chip button { width: 18px; height: 18px; display: grid; place-items: center; border: 0; border-radius: 50%; background: transparent; color: inherit; cursor: pointer; }
.chip button:hover { background: color-mix(in srgb, var(--accent) 20%, transparent); }
.picker-bar { display: flex; justify-content: space-between; align-items: center; gap: 8px; flex-wrap: wrap; }
.picker-links { display: inline-flex; gap: 6px; }
.user-list { list-style: none; max-height: 232px; overflow-y: auto; border: 1px solid var(--line); border-radius: 10px; background: var(--field); }
.user-list li + li { border-top: 1px solid var(--line); }
.user-row { width: 100%; display: flex; align-items: center; gap: 10px; padding: 9px 12px; background: transparent; border: 0; text-align: left; cursor: pointer; transition: background .12s; }
.user-row:hover { background: var(--hover); }
.user-row.on { background: var(--accent-soft); }
.user-text { display: flex; flex-direction: column; min-width: 0; }
.user-text .small { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.no-result { padding: 22px 12px; text-align: center; font-size: 13px; color: var(--muted); }
.cb { width: 16px; height: 16px; accent-color: var(--accent); pointer-events: none; flex-shrink: 0; }
.name { font-weight: 600; font-size: 13.5px; }
.avatar { display: grid; place-items: center; border-radius: 50%; color: #fff; font-weight: 600; flex-shrink: 0; }

/* channel */
.channels { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; }
.channel { display: flex; flex-direction: column; align-items: center; gap: 6px; padding: 12px 6px; font-size: 12.5px; font-weight: 600; background: var(--card); border: 1px solid var(--line); border-radius: 10px; cursor: pointer; color: var(--muted); transition: background .15s, border-color .15s, color .15s; }
.channel:hover { border-color: var(--muted); color: var(--ink); }
.channel.on { background: var(--accent-soft); border-color: var(--accent); color: var(--accent); }

.input, textarea { width: 100%; padding: 10px 12px; font: inherit; font-size: 13.5px; line-height: 1.5; color: var(--ink); background: var(--field); border: 1px solid var(--line); border-radius: 10px; transition: border-color .15s, box-shadow .15s; }
textarea { resize: vertical; min-height: 110px; }
.input:focus, textarea:focus { outline: 0; border-color: var(--accent); box-shadow: 0 0 0 3px var(--accent-soft); }
.input::placeholder, textarea::placeholder { color: var(--muted); opacity: .7; }
.input[aria-invalid="true"], textarea[aria-invalid="true"] { border-color: var(--danger); }
.send { width: 100%; height: 46px; font-size: 14px; }

/* stats */
.stats { display: grid; grid-template-columns: repeat(3, 1fr); gap: 16px; }
.stat { padding: 18px 20px; }
.stat-label { font-size: 12.5px; font-weight: 500; color: var(--muted); }
.stat-value { font-size: 26px; font-weight: 700; letter-spacing: -0.02em; margin-top: 6px; line-height: 1.2; }
.stat-hint { font-size: 12px; color: var(--muted); margin-top: 6px; }
.stat-hint.bad { color: var(--danger); }
.inline-link { display: inline-flex; align-items: center; gap: 5px; background: none; border: 0; padding: 0; font-size: 12px; font-weight: 600; color: var(--danger); cursor: pointer; }
.inline-link:hover { text-decoration: underline; }

/* history */
.list { overflow: hidden; }
.list-head { display: flex; justify-content: space-between; align-items: center; gap: 12px; flex-wrap: wrap; padding: 16px 20px; border-bottom: 1px solid var(--line); }
.list-tools { display: flex; align-items: center; gap: 12px; }
.export { font-size: 13px; }
select { height: 36px; padding: 0 32px 0 12px; font: inherit; font-size: 13px; color: var(--ink); border: 1px solid var(--line); background-color: var(--field); border-radius: 10px; cursor: pointer; appearance: none; background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%236A7380' stroke-width='2.5' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E"); background-repeat: no-repeat; background-position: right 12px center; }
.table-wrap { overflow-x: auto; }
table { width: 100%; border-collapse: collapse; min-width: 640px; font-size: 13.5px; }
th { text-align: left; font-size: 11.5px; font-weight: 600; letter-spacing: .04em; text-transform: uppercase; color: var(--muted); padding: 12px 20px; background: var(--soft); white-space: nowrap; }
td { padding: 14px 20px; border-bottom: 1px solid var(--line); vertical-align: middle; line-height: 1.45; }
tbody tr:hover { background: var(--hover); }
tbody tr:last-child td { border-bottom: 0; }
.title-cell { max-width: 260px; font-weight: 500; }

.pill { display: inline-flex; align-items: center; gap: 6px; font-size: 12px; font-weight: 600; padding: 4px 10px; border-radius: 999px; white-space: nowrap; background: color-mix(in srgb, var(--c) 14%, transparent); color: color-mix(in srgb, var(--c) 78%, var(--ink)); }
.pill i { width: 6px; height: 6px; border-radius: 50%; background: var(--c); }

.foot { display: flex; justify-content: space-between; align-items: center; gap: 12px; flex-wrap: wrap; padding: 14px 20px; border-top: 1px solid var(--line); font-size: 13px; color: var(--muted); }
.pager { display: flex; gap: 4px; }
.pg { min-width: 34px; height: 34px; padding: 0 8px; display: grid; place-items: center; font-size: 13px; font-weight: 600; background: transparent; border: 1px solid transparent; border-radius: 8px; cursor: pointer; color: var(--muted); }
.pg:hover:not(:disabled) { background: var(--soft); color: var(--ink); }
.pg.active { background: var(--accent); color: var(--accent-ink); }

.empty { display: flex; flex-direction: column; align-items: center; text-align: center; padding: 56px 24px 64px; gap: 8px; }
.empty-icon { width: 80px; height: 80px; border-radius: 50%; display: grid; place-items: center; background: var(--accent-soft); color: var(--accent); margin-bottom: 12px; box-shadow: 0 0 0 10px color-mix(in srgb, var(--accent-soft) 45%, transparent); }
.empty p { max-width: 340px; font-size: 13.5px; color: var(--muted); line-height: 1.6; margin-bottom: 14px; }

/* modal */
.overlay { position: fixed; inset: 0; z-index: 50; background: var(--overlay); backdrop-filter: blur(4px); display: grid; place-items: center; padding: 16px; animation: fade .15s ease; }
.modal { width: 100%; max-width: 440px; background: var(--card); border: 1px solid var(--line); border-radius: 16px; box-shadow: 0 24px 64px rgba(0,0,0,.28); overflow: hidden; animation: pop .18s ease; }
.modal-body { padding: 22px 24px; display: flex; flex-direction: column; gap: 10px; }
.modal-body.confirm { align-items: center; text-align: center; padding-top: 28px; }
.modal-body .sub { margin-top: 0; }
.modal-foot { display: flex; justify-content: flex-end; gap: 10px; padding: 16px 24px; border-top: 1px solid var(--line); background: var(--soft); }
.info-icon { width: 48px; height: 48px; border-radius: 50%; display: grid; place-items: center; background: var(--accent-soft); color: var(--accent); }

.toast { position: fixed; left: 50%; bottom: 28px; transform: translateX(-50%); z-index: 80; display: flex; align-items: center; gap: 8px; background: var(--ink); color: var(--bg); font-size: 13.5px; font-weight: 500; padding: 11px 18px; border-radius: 12px; box-shadow: 0 10px 30px rgba(0,0,0,.25); animation: fade .2s ease; max-width: calc(100vw - 32px); }

@keyframes fade { from { opacity: 0 } to { opacity: 1 } }
@keyframes pop { from { opacity: 0; transform: translateY(8px) scale(.98) } to { opacity: 1; transform: none } }

@media (max-width: 1040px) { .layout { grid-template-columns: 1fr; } }
@media (max-width: 640px) {
  .wrap { padding: 20px 16px 48px; }
  h1 { font-size: 24px; }
  .stats { grid-template-columns: 1fr; }
  .quota { width: 100%; justify-content: space-between; }
  .form { padding: 18px; }
}
@media (prefers-reduced-motion: reduce) { * { transition: none !important; animation: none !important; } }
`;