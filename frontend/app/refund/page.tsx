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
const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";
const API_REFUND = `${API_BASE}/api/refund`;

// Samakan dengan key token yang dipakai halaman login kamu
const TOKEN_KEY = "token";

async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const token = typeof window !== "undefined" ? localStorage.getItem(TOKEN_KEY) : null;
  const res = await fetch(url, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...init?.headers,
    },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((data as { message?: string }).message || "Permintaan gagal.");
  return data as T;
}

/* ───────────── Tipe & konstanta ───────────── */
type Status = "Menunggu" | "Disetujui" | "Selesai" | "Ditolak";

// Bentuk data dari GET /api/refund (mapRefund di refundController)
type Refund = {
  id: number;
  orderId: number;
  invoice: string;
  pemesan: string;
  email: string;
  event: string;
  alasan: string;
  jumlah: number;
  status: Status;
  statusKode: "pending" | "approved" | "rejected" | "completed";
  catatanAdmin: string;
  diajukan: string; // sudah diformat server: "12 Oktober 2026, 04:06"
  diproses: string | null;
};

type BulkResult = { berhasil: number[]; gagal: { id: number; message: string }[] };
type Aksi = "terima" | "tolak" | "hapus";

const STATUSES: Status[] = ["Menunggu", "Disetujui", "Selesai", "Ditolak"];
const STATUS_COLOR: Record<string, string> = {
  Menunggu: "#3B82C4",
  Disetujui: "#C08A2B",
  Selesai: "#16A34A",
  Ditolak: "#DC4C4C",
};
const AVATAR_COLORS = ["#2F5D80", "#B4573A", "#5B7F4A", "#7A5C9E", "#A8742A", "#3F7F88"];
const PAGE_SIZE = 10;
const MIN_REASON = 5;

/* ───────────── Helpers ───────────── */
const nf = new Intl.NumberFormat("id-ID");
const rupiah = (n: number) => `Rp ${nf.format(n)}`;
const errMsg = (e: unknown) => (e instanceof Error ? e.message : "Terjadi kesalahan.");
const initials = (name: string) =>
  name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]?.toUpperCase()).join("");
const colorFor = (name: string) => {
  let h = 0;
  for (const c of name) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return AVATAR_COLORS[h % AVATAR_COLORS.length];
};
// "12 Oktober 2026, 04:06" -> tanggal & jam
const splitTanggal = (s: string) => {
  const i = s.lastIndexOf(", ");
  return i === -1 ? { date: s, time: "" } : { date: s.slice(0, i), time: s.slice(i + 2) };
};

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
const IEye = () => <Icon size={17}><path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12Z" /><circle cx="12" cy="12" r="3" /></Icon>;
const ICheck = () => <Icon size={17}><path d="m5 12.5 4.5 4.5L19 7.5" /></Icon>;
const IX = () => <Icon size={17}><path d="M6 6l12 12M18 6 6 18" /></Icon>;
const ITrash = () => <Icon size={17}><path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3" /></Icon>;
const IClose = () => <Icon><path d="M6 6l12 12M18 6 6 18" /></Icon>;
const ISearch = () => <Icon size={16}><circle cx="11" cy="11" r="6.5" /><path d="m20 20-4-4" /></Icon>;
const IPrev = () => <Icon size={14}><path d="m15 5-7 7 7 7" /></Icon>;
const INext = () => <Icon size={14}><path d="m9 5 7 7-7 7" /></Icon>;
const IWarn = () => <Icon size={22}><path d="M12 4 2.5 20h19L12 4ZM12 10v4.5M12 17.5h.01" /></Icon>;
const IFile = () => <Icon><path d="M6 3h8l4 4v14H6V3ZM14 3v4h4M9 12h6M9 16h6" /></Icon>;
const IClock = () => <Icon><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></Icon>;
const IWallet = () => <Icon><path d="M3 7h16a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7Zm0 0V6a2 2 0 0 1 2-2h11M16 14h2" /></Icon>;
const IDone = () => <Icon><circle cx="12" cy="12" r="9" /><path d="m8 12.5 3 3 5-6" /></Icon>;
const IInbox = () => (
  <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M3 13l3-8h12l3 8v6H3v-6ZM3 13h5l1 3h6l1-3h5" />
  </svg>
);

/* ───────────── Komponen kecil ───────────── */
function StatusPill({ status }: { status: string }) {
  return (
    <span className="pill" style={{ "--c": STATUS_COLOR[status] ?? "#8A94A3" } as CSSProperties}>
      <i />
      {status}
    </span>
  );
}

function Avatar({ name, size = 34 }: { name: string; size?: number }) {
  return (
    <span className="avatar" style={{ width: size, height: size, fontSize: size * 0.38, background: colorFor(name) }} aria-hidden="true">
      {initials(name)}
    </span>
  );
}

function StatCard({ icon, label, value, hint }: { icon: ReactNode; label: string; value: string; hint: string }) {
  return (
    <article className="card stat">
      <span className="stat-icon">{icon}</span>
      <div>
        <p className="stat-label">{label}</p>
        <p className="stat-value">{value}</p>
        <p className="stat-hint">{hint}</p>
      </div>
    </article>
  );
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="kv">
      <dt>{label}</dt>
      <dd>{children}</dd>
    </div>
  );
}

/* ───────────── Dialog tolak (alasan wajib) ───────────── */
function RejectDialog({
  count,
  busy,
  onCancel,
  onConfirm,
}: {
  count: number;
  busy: boolean;
  onCancel: () => void;
  onConfirm: (reason: string) => void;
}) {
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  useModal(onCancel);

  function submit() {
    const trimmed = reason.trim();
    if (trimmed.length < MIN_REASON) return setError(`Alasan penolakan wajib diisi (minimal ${MIN_REASON} karakter).`);
    onConfirm(trimmed);
  }

  return (
    <div className="overlay top" onMouseDown={(e) => e.target === e.currentTarget && onCancel()}>
      <div className="modal small" role="dialog" aria-modal="true" aria-labelledby="rej-title">
        <header className="modal-head">
          <div>
            <h2 id="rej-title">Tolak {count > 1 ? `${count} Pengajuan` : "Pengajuan Refund"}</h2>
            <p className="sub">Alasan akan ditampilkan kepada pengguna.</p>
          </div>
          <button className="icon-btn" onClick={onCancel} aria-label="Tutup"><IClose /></button>
        </header>
        <div className="modal-body">
          <div className="field">
            <label className="label" htmlFor="rej-reason">Alasan penolakan</label>
            <textarea
              id="rej-reason"
              rows={4}
              autoFocus
              value={reason}
              onChange={(e) => (setReason(e.target.value), setError(null))}
              placeholder="Contoh: Pengajuan melewati batas waktu refund."
              aria-invalid={!!error}
            />
            {error && <p className="err">{error}</p>}
          </div>
        </div>
        <footer className="modal-foot">
          <button className="btn-ghost" onClick={onCancel} disabled={busy}>Batal</button>
          <button className="btn-danger" onClick={submit} disabled={busy}>{busy ? "Memproses…" : "Tolak Pengajuan"}</button>
        </footer>
      </div>
    </div>
  );
}

/* ───────────── Dialog konfirmasi umum ───────────── */
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
  busy: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  useModal(onCancel);
  return (
    <div className="overlay top" onMouseDown={(e) => e.target === e.currentTarget && onCancel()}>
      <div className="modal small" role="alertdialog" aria-modal="true" aria-labelledby="cf-title">
        <div className="modal-body confirm">
          <span className={`warn-icon ${danger ? "" : "info"}`}>{danger ? <IWarn /> : <ICheck />}</span>
          <h2 id="cf-title">{title}</h2>
          <p className="sub">{body}</p>
        </div>
        <footer className="modal-foot">
          <button className="btn-ghost" onClick={onCancel} autoFocus disabled={busy}>Batal</button>
          <button className={danger ? "btn-danger" : "btn-primary"} onClick={onConfirm} disabled={busy}>
            {busy ? "Memproses…" : confirmLabel}
          </button>
        </footer>
      </div>
    </div>
  );
}

/* ───────────── Modal detail ───────────── */
function DetailModal({
  refund,
  busy,
  onClose,
  onApprove,
  onReject,
  onDone,
  onDelete,
}: {
  refund: Refund;
  busy: boolean;
  onClose: () => void;
  onApprove: () => void;
  onReject: () => void;
  onDone: () => void;
  onDelete: () => void;
}) {
  useModal(onClose);
  const pending = refund.statusKode === "pending";
  return (
    <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal" role="dialog" aria-modal="true" aria-labelledby="det-title">
        <header className="modal-head">
          <div>
            <h2 id="det-title">Detail Pengajuan Refund</h2>
            <p className="sub">#{refund.invoice}</p>
          </div>
          <div className="head-right">
            <StatusPill status={refund.status} />
            <button className="icon-btn" onClick={onClose} aria-label="Tutup"><IClose /></button>
          </div>
        </header>

        <div className="modal-body">
          <dl className="kvs">
            <Row label="Pengguna">
              <strong>{refund.pemesan}</strong>
              <span className="muted small">{refund.email}</span>
            </Row>
            <Row label="Event">{refund.event}</Row>
            <Row label="Alasan refund">{refund.alasan}</Row>
            <Row label="Nominal"><strong className="total">{rupiah(refund.jumlah)}</strong></Row>
            <Row label="Tgl ajuan">{refund.diajukan}</Row>
            <Row label="Tgl diproses">{refund.diproses ?? "—"}</Row>
          </dl>
          {refund.statusKode === "rejected" && refund.catatanAdmin && (
            <p className="alert">Alasan penolakan: {refund.catatanAdmin}</p>
          )}
        </div>

        <footer className={`modal-foot ${pending ? "" : "spread"}`}>
          {!pending && (
            <button className="btn-text-danger" onClick={onDelete} disabled={busy}><ITrash /> Hapus</button>
          )}
          <div className="foot-right">
            {pending ? (
              <>
                <button className="btn-ghost" onClick={onClose}>Tutup</button>
                <button className="btn-outline-danger" onClick={onReject} disabled={busy}>Tolak</button>
                <button className="btn-primary" onClick={onApprove} disabled={busy}>
                  <ICheck /> {busy ? "Memproses…" : "Terima Refund"}
                </button>
              </>
            ) : refund.statusKode === "approved" ? (
              <>
                <button className="btn-ghost" onClick={onClose}>Tutup</button>
                <button className="btn-primary" onClick={onDone} disabled={busy}>
                  <ICheck /> {busy ? "Memproses…" : "Tandai Selesai"}
                </button>
              </>
            ) : (
              <button className="btn-ghost" onClick={onClose}>Tutup</button>
            )}
          </div>
        </footer>
      </div>
    </div>
  );
}

/* ───────────── Halaman ───────────── */
type Tab = "Semua" | Status;
type DialogState =
  | { kind: "reject"; ids: number[] }
  | { kind: "delete"; ids: number[] }
  | { kind: "approve"; ids: number[] }
  | null;

export default function RefundPage() {
  const [refunds, setRefunds] = useState<Refund[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [tick, setTick] = useState(0); // naikkan untuk refetch
  const [tab, setTab] = useState<Tab>("Semua");
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const [viewId, setViewId] = useState<number | null>(null);
  const [dialog, setDialog] = useState<DialogState>(null);
  const [toast, setToast] = useState<{ msg: string; err: boolean } | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  function showToast(msg: string, err = false) {
    setToast({ msg, err });
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setToast(null), err ? 4500 : 2800);
  }

  /* Ambil seluruh refund; tab, pencarian, dan hitungan dikerjakan di client */
  useEffect(() => {
    let alive = true;
    setLoading(true);
    api<Refund[]>(API_REFUND)
      .then((d) => alive && setRefunds(d))
      .catch((e) => alive && showToast(errMsg(e), true))
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, [tick]);

  const counts = useMemo(() => {
    const c: Record<Tab, number> = { Semua: refunds.length, Menunggu: 0, Disetujui: 0, Selesai: 0, Ditolak: 0 };
    refunds.forEach((r) => {
      if (c[r.status] !== undefined) c[r.status]++;
    });
    return c;
  }, [refunds]);

  const stats = useMemo(
    () => ({
      total: refunds.length,
      waiting: counts.Menunggu,
      refunded: refunds
        .filter((r) => r.statusKode === "approved" || r.statusKode === "completed")
        .reduce((s, r) => s + r.jumlah, 0),
      done: counts.Selesai,
    }),
    [refunds, counts],
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return refunds.filter(
      (r) =>
        (tab === "Semua" || r.status === tab) &&
        (!q || [r.invoice, r.pemesan, r.email, r.event].some((v) => v.toLowerCase().includes(q))),
    ); // urutan sudah dari server (terbaru dulu)
  }, [refunds, tab, query]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(page, pageCount);
  const start = (safePage - 1) * PAGE_SIZE;
  const rows = filtered.slice(start, start + PAGE_SIZE);

  function changeTab(t: Tab) {
    setTab(t);
    setPage(1);
  }
  function changeQuery(q: string) {
    setQuery(q);
    setPage(1);
  }

  /* Aksi terima / tolak / hapus lewat POST /api/refund/bulk (satu jalur untuk 1 atau banyak) */
  async function runBulk(aksi: Aksi, ids: number[], alasan?: string) {
    setBusy(true);
    try {
      const res = await api<BulkResult>(`${API_REFUND}/bulk`, {
        method: "POST",
        body: JSON.stringify({ ids, aksi, alasan }),
      });
      const ok = res.berhasil.length;
      const bad = res.gagal.length;
      const kata = { terima: "diterima", tolak: "ditolak", hapus: "dihapus" }[aksi];

      if (bad === 0) showToast(ok > 1 ? `${ok} pengajuan ${kata}.` : `Pengajuan ${kata}.`);
      else if (ok === 0) showToast(res.gagal[0].message, true);
      else showToast(`${ok} ${kata}, ${bad} gagal: ${res.gagal[0].message}`, true);

      setDialog(null);
      setViewId(null);
      setTick((t) => t + 1);
    } catch (e) {
      showToast(errMsg(e), true);
    } finally {
      setBusy(false);
    }
  }

  /* Tandai selesai: PATCH /api/refund/:id/selesai (lihat catatan backend) */
  async function doDone(id: number) {
    setBusy(true);
    try {
      await api(`${API_REFUND}/${id}/selesai`, { method: "PATCH" });
      setViewId(null);
      setTick((t) => t + 1);
      showToast("Refund ditandai selesai.");
    } catch (e) {
      showToast(errMsg(e), true);
    } finally {
      setBusy(false);
    }
  }

  const viewing = refunds.find((r) => r.id === viewId) ?? null;
  const tabs: Tab[] = ["Semua", ...STATUSES];

  return (
    <main className={`page ${inter.className}`}>
      <style>{css}</style>

      <div className="wrap">
        {/* Header */}
        <header className="head">
          <div>
            <nav className="crumb" aria-label="Breadcrumb">
              <span>Dashboard</span><span aria-hidden="true">/</span><strong>Refund</strong>
            </nav>
            <h1>Kelola Refund</h1>
            <p className="sub">Tinjau dan proses pengajuan pengembalian dana tiket konser.</p>
          </div>
        </header>

        {/* Statistik */}
        <section className="stats" aria-label="Ringkasan">
          <StatCard icon={<IFile />} label="Total Ajuan" value={nf.format(stats.total)} hint="Seluruh pengajuan refund" />
          <StatCard icon={<IClock />} label="Menunggu Persetujuan" value={nf.format(stats.waiting)} hint={stats.waiting ? "Perlu tindakan segera" : "Tidak ada antrean"} />
          <StatCard icon={<IWallet />} label="Total Refund (IDR)" value={rupiah(stats.refunded)} hint="Disetujui dan selesai" />
          <StatCard icon={<IDone />} label="Refund Selesai" value={nf.format(stats.done)} hint="Dana sudah dikembalikan" />
        </section>

        {/* Daftar pengajuan */}
        <section className="card list" aria-busy={loading}>
          <div className="list-head">
            <h2>Daftar Pengajuan Refund</h2>
            <span className="muted small">
              {filtered.length > 0
                ? `Menampilkan ${start + 1}–${start + rows.length} dari ${nf.format(filtered.length)} ajuan`
                : "Tidak ada ajuan"}
            </span>
          </div>

          <div className="toolbar">
            <div className="tabs" role="tablist" aria-label="Filter status">
              {tabs.map((t) => (
                <button key={t} role="tab" aria-selected={tab === t} className={`tab ${tab === t ? "on" : ""}`} onClick={() => changeTab(t)}>
                  {t} <span>{counts[t]}</span>
                </button>
              ))}
            </div>
            <label className="search">
              <ISearch />
              <input
                type="search"
                placeholder="Cari invoice, nama, atau event..."
                value={query}
                onChange={(e) => changeQuery(e.target.value)}
                aria-label="Cari pengajuan"
              />
            </label>
          </div>

          {loading ? (
            <p className="loading muted">Memuat pengajuan refund…</p>
          ) : rows.length > 0 ? (
            <>
              <div className="table-wrap">
                <table>
                  <colgroup>
                    <col style={{ width: 172 }} />
                    <col style={{ width: 196 }} />
                    <col style={{ width: 140 }} />
                    <col style={{ width: 160 }} />
                    <col style={{ width: 116 }} />
                    <col style={{ width: 108 }} />
                    <col style={{ width: 112 }} />
                    <col style={{ width: 232 }} />
                  </colgroup>
                  <thead>
                    <tr>
                      <th>Invoice</th>
                      <th>User</th>
                      <th>Event</th>
                      <th>Alasan</th>
                      <th className="right">Nominal</th>
                      <th>Status</th>
                      <th>Tgl Ajuan</th>
                      <th className="right">Aksi</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((r) => {
                      const { date, time } = splitTanggal(r.diajukan);
                      const isPending = r.statusKode === "pending";
                      return (
                        <tr key={r.id}>
                          <td className="inv">
                            <button className="invoice" onClick={() => setViewId(r.id)} title={`#${r.invoice}`}>
                              #{r.invoice}
                            </button>
                          </td>
                          <td>
                            <div className="who">
                              <Avatar name={r.pemesan} />
                              <div>
                                <p className="name ellip" title={r.pemesan}>{r.pemesan}</p>
                                <p className="muted small ellip" title={r.email}>{r.email}</p>
                              </div>
                            </div>
                          </td>
                          <td className="event"><p className="clamp" title={r.event}>{r.event}</p></td>
                          <td className="reason"><p className="clamp" title={r.alasan}>{r.alasan}</p></td>
                          <td className="right total num nowrap">{rupiah(r.jumlah)}</td>
                          <td><StatusPill status={r.status} /></td>
                          <td className="muted nowrap">
                            {date}
                            {time && (<><br /><span className="small">{time}</span></>)}
                          </td>
                          <td className="right">
                            <div className="row-actions">
                              {isPending && (
                                <>
                                  <button
                                    className="act ok"
                                    onClick={() => setDialog({ kind: "approve", ids: [r.id] })}
                                    aria-label={`Terima ${r.invoice}`}
                                  >
                                    <ICheck /> Terima
                                  </button>
                                  <button
                                    className="act no"
                                    onClick={() => setDialog({ kind: "reject", ids: [r.id] })}
                                    aria-label={`Tolak ${r.invoice}`}
                                  >
                                    <IX /> Tolak
                                  </button>
                                </>
                              )}
                              {!isPending && (
                                <button
                                  className="act del"
                                  onClick={() => setDialog({ kind: "delete", ids: [r.id] })}
                                  aria-label={`Hapus ${r.invoice}`}
                                  title="Hapus"
                                >
                                  <ITrash />
                                </button>
                              )}
                              <button
                                className="act view"
                                onClick={() => setViewId(r.id)}
                                aria-label={`Lihat detail ${r.invoice}`}
                                title="Lihat detail"
                              >
                                <IEye />
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              <footer className="foot">
                <span>{nf.format(filtered.length)} pengajuan</span>
                <nav className="pager" aria-label="Paginasi">
                  <button className="pg" disabled={safePage === 1} onClick={() => setPage(safePage - 1)} aria-label="Sebelumnya"><IPrev /></button>
                  {Array.from({ length: pageCount }, (_, i) => i + 1).map((p) => (
                    <button key={p} className={`pg ${p === safePage ? "active" : ""}`} onClick={() => setPage(p)} aria-current={p === safePage ? "page" : undefined}>
                      {p}
                    </button>
                  ))}
                  <button className="pg" disabled={safePage === pageCount} onClick={() => setPage(safePage + 1)} aria-label="Berikutnya"><INext /></button>
                </nav>
              </footer>
            </>
          ) : (
            <div className="empty">
              <span className="empty-icon"><IInbox /></span>
              {query.trim() || tab !== "Semua" ? (
                <>
                  <h3>Tidak ada pengajuan</h3>
                  <p>Tidak ada pengajuan yang cocok dengan filter atau pencarian kamu.</p>
                  <button className="btn-ghost" onClick={() => (changeTab("Semua"), changeQuery(""))}>Reset filter</button>
                </>
              ) : (
                <>
                  <h3>Belum ada pengajuan refund</h3>
                  <p>Pengajuan pengembalian dana dari pengguna akan muncul di sini.</p>
                </>
              )}
            </div>
          )}
        </section>
      </div>

      {viewing && (
        <DetailModal
          refund={viewing}
          busy={busy}
          onClose={() => setViewId(null)}
          onApprove={() => runBulk("terima", [viewing.id])}
          onReject={() => (setViewId(null), setDialog({ kind: "reject", ids: [viewing.id] }))}
          onDone={() => doDone(viewing.id)}
          onDelete={() => (setViewId(null), setDialog({ kind: "delete", ids: [viewing.id] }))}
        />
      )}

      {dialog?.kind === "reject" && (
        <RejectDialog
          count={dialog.ids.length}
          busy={busy}
          onCancel={() => setDialog(null)}
          onConfirm={(reason) => runBulk("tolak", dialog.ids, reason)}
        />
      )}
      {dialog?.kind === "approve" && (
        <ConfirmDialog
          title={dialog.ids.length > 1 ? `Terima ${dialog.ids.length} pengajuan?` : "Terima pengajuan ini?"}
          body="Pesanan akan ditandai refund, tiket dibatalkan, kursi dilepas, dan pengguna mendapat pemberitahuan."
          confirmLabel="Ya, Terima"
          busy={busy}
          onCancel={() => setDialog(null)}
          onConfirm={() => runBulk("terima", dialog.ids)}
        />
      )}
      {dialog?.kind === "delete" && (
        <ConfirmDialog
          danger
          title={dialog.ids.length > 1 ? `Hapus ${dialog.ids.length} pengajuan?` : "Hapus pengajuan ini?"}
          body="Data yang dihapus tidak dapat dikembalikan."
          confirmLabel="Ya, Hapus"
          busy={busy}
          onCancel={() => setDialog(null)}
          onConfirm={() => runBulk("hapus", dialog.ids)}
        />
      )}

      {toast && (
        <div className={`toast ${toast.err ? "err" : ""}`} role="status">
          {toast.err ? <IWarn /> : <ICheck />} {toast.msg}
        </div>
      )}
    </main>
  );
}

/* ───────────── Styles ───────────── */
const css = `
:root {
  --bg: #F8F5F1; --card: #FFFFFF; --ink: #17202A; --muted: #6A7380; --line: #E7E1DA;
  --soft: #F3EEE8; --hover: #FBF9F6;
  --accent: #2F5D80; --accent-hover: #244A68; --accent-ink: #FFFFFF; --accent-soft: #E6EEF5;
  --danger: #C4372D; --danger-hover: #A82D24; --danger-soft: #FCEBE9;
  --ok: #16A34A; --ok-soft: #E3F5EA;
  --field: #FFFFFF; --overlay: rgba(23,32,42,.5);
  --shadow: 0 1px 2px rgba(23,32,42,.04), 0 6px 20px rgba(23,32,42,.05);
}
:root[data-theme="dark"] {
  --bg: #121316; --card: #1B1C20; --ink: #F1EEEA; --muted: #9CA3AE; --line: #2E3037;
  --soft: #24262B; --hover: #212328;
  --accent: #8EC1EC; --accent-hover: #A8D1F2; --accent-ink: #10202D; --accent-soft: #1F3547;
  --danger: #EE7A70; --danger-hover: #F39A92; --danger-soft: #3A2220;
  --ok: #4CC47A; --ok-soft: #1B3626;
  --field: #14151A; --overlay: rgba(0,0,0,.65);
  --shadow: 0 1px 2px rgba(0,0,0,.3), 0 6px 20px rgba(0,0,0,.3);
}
* { box-sizing: border-box; margin: 0; padding: 0; }
html, body { background: var(--bg); color: var(--ink); -webkit-font-smoothing: antialiased; }
button { font: inherit; color: inherit; }

.page { min-height: 100vh; }
.wrap { max-width: 1320px; margin: 0 auto; padding: 32px 24px 64px; display: flex; flex-direction: column; gap: 24px; }

.card { background: var(--card); border: 1px solid var(--line); border-radius: 14px; box-shadow: var(--shadow); }
.icon { fill: none; stroke: currentColor; stroke-width: 1.7; stroke-linecap: round; stroke-linejoin: round; flex-shrink: 0; }

/* header */
.head { display: flex; justify-content: space-between; align-items: flex-end; gap: 16px; flex-wrap: wrap; }
.crumb { display: flex; gap: 8px; font-size: 12px; color: var(--muted); margin-bottom: 10px; }
.crumb strong { color: var(--accent); font-weight: 600; }
h1 { font-size: 30px; font-weight: 700; letter-spacing: -0.025em; line-height: 1.15; }
h2 { font-size: 17px; font-weight: 650; letter-spacing: -0.01em; }
h3 { font-size: 16px; font-weight: 650; }
.sub { font-size: 13.5px; color: var(--muted); margin-top: 6px; line-height: 1.5; }
.muted { color: var(--muted); }
.small { font-size: 12px; }
.nowrap { white-space: nowrap; }

/* buttons */
.btn-primary, .btn-ghost, .btn-danger, .btn-outline-danger { display: inline-flex; align-items: center; justify-content: center; gap: 7px; height: 40px; padding: 0 18px; font-size: 13.5px; font-weight: 600; border-radius: 10px; cursor: pointer; border: 1px solid transparent; transition: background .15s, border-color .15s; white-space: nowrap; }
.btn-primary { background: var(--accent); color: var(--accent-ink); box-shadow: 0 1px 2px rgba(47,93,128,.3); }
.btn-primary:hover:not(:disabled) { background: var(--accent-hover); }
.btn-ghost { background: var(--card); border-color: var(--line); }
.btn-ghost:hover { background: var(--hover); border-color: var(--muted); }
.btn-danger { background: var(--danger); color: #fff; }
.btn-danger:hover:not(:disabled) { background: var(--danger-hover); }
.btn-outline-danger { background: var(--card); color: var(--danger); border-color: color-mix(in srgb, var(--danger) 45%, var(--line)); }
.btn-outline-danger:hover:not(:disabled) { background: var(--danger-soft); border-color: var(--danger); }
.btn-text { background: none; border: 0; color: var(--accent); font-size: 13px; font-weight: 600; cursor: pointer; padding: 6px 4px; }
.btn-text:hover { text-decoration: underline; }
.btn-text-danger { display: inline-flex; align-items: center; gap: 6px; background: none; border: 0; color: var(--danger); font-size: 13px; font-weight: 600; cursor: pointer; padding: 8px 6px; border-radius: 8px; }
.btn-text-danger:hover { background: var(--danger-soft); }
button:focus-visible, input:focus-visible, textarea:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
button:disabled { opacity: .4; cursor: not-allowed; }

/* stats */
.stats { display: grid; grid-template-columns: repeat(4, 1fr); gap: 16px; }
.stat { padding: 20px; display: flex; gap: 14px; align-items: flex-start; min-width: 0; }
.stat > div { min-width: 0; }
.stat-icon { width: 40px; height: 40px; border-radius: 10px; background: var(--accent-soft); color: var(--accent); display: grid; place-items: center; flex-shrink: 0; }
.stat-label { font-size: 12.5px; font-weight: 500; color: var(--muted); }
.stat-value { font-size: 24px; font-weight: 700; letter-spacing: -0.02em; margin-top: 4px; line-height: 1.2; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.stat-hint { font-size: 12px; color: var(--muted); margin-top: 4px; }

/* list */
.list { overflow: hidden; }
.loading { padding: 56px 24px; text-align: center; font-size: 13.5px; }
.list-head { display: flex; justify-content: space-between; align-items: center; gap: 12px; flex-wrap: wrap; padding: 18px 20px 6px; }
.toolbar { display: flex; justify-content: space-between; align-items: center; gap: 12px; padding: 12px 20px 16px; border-bottom: 1px solid var(--line); flex-wrap: wrap; }
.tabs { display: flex; gap: 4px; flex-wrap: wrap; }
.tab { display: inline-flex; align-items: center; gap: 7px; height: 34px; padding: 0 12px; background: transparent; border: 0; border-radius: 8px; font-size: 13px; font-weight: 600; color: var(--muted); cursor: pointer; transition: background .15s, color .15s; }
.tab span { font-size: 11.5px; padding: 1px 7px; border-radius: 999px; background: var(--soft); color: var(--muted); font-variant-numeric: tabular-nums; }
.tab:hover { background: var(--soft); color: var(--ink); }
.tab.on { background: var(--accent-soft); color: var(--accent); }
.tab.on span { background: var(--accent); color: var(--accent-ink); }
.search { width: 100%; max-width: 320px; display: flex; align-items: center; gap: 8px; height: 38px; padding: 0 12px; border: 1px solid var(--line); background: var(--field); border-radius: 10px; color: var(--muted); transition: border-color .15s, box-shadow .15s; }
.search:focus-within { border-color: var(--accent); box-shadow: 0 0 0 3px var(--accent-soft); }
.search input { flex: 1; border: 0; outline: 0 !important; background: transparent; font: inherit; font-size: 13.5px; color: var(--ink); min-width: 0; }

/* table */
.table-wrap { overflow-x: auto; }
table { width: 100%; border-collapse: collapse; table-layout: fixed; min-width: 1236px; font-size: 13.5px; }
th { text-align: left; overflow: hidden; text-overflow: ellipsis; font-size: 11.5px; font-weight: 600; letter-spacing: .04em; text-transform: uppercase; color: var(--muted); padding: 13px 16px; background: var(--soft); white-space: nowrap; }
/* overflow: hidden mencegah isi sel meluber & menimpa kolom di sebelahnya */
td { padding: 14px 16px; border-bottom: 1px solid var(--line); vertical-align: middle; overflow: hidden; }
th:first-child, td:first-child { padding-left: 20px; }
th:last-child, td:last-child { padding-right: 20px; }
tbody tr { transition: background .12s; }
tbody tr:hover { background: var(--hover); }
tbody tr:last-child td { border-bottom: 0; }
.right { text-align: right; }
.num { font-variant-numeric: tabular-nums; }
.name { font-weight: 600; }
.event, .reason { line-height: 1.45; }
.clamp { display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; word-break: break-word; }
.ellip { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.total { font-weight: 700; }
.inv { padding-right: 12px; }
.invoice { display: block; max-width: 100%; background: none; border: 0; padding: 0; color: var(--accent); font-weight: 700; font-size: 13.5px; cursor: pointer; text-align: left; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; font-variant-numeric: tabular-nums; }
.invoice:hover { text-decoration: underline; }
.who { display: flex; align-items: center; gap: 10px; min-width: 0; }
.who > div { min-width: 0; flex: 1; }
.avatar { display: grid; place-items: center; border-radius: 50%; color: #fff; font-weight: 600; flex-shrink: 0; }

.pill { display: inline-flex; align-items: center; gap: 6px; font-size: 12px; font-weight: 600; padding: 4px 10px; border-radius: 999px; white-space: nowrap; background: color-mix(in srgb, var(--c) 14%, transparent); color: color-mix(in srgb, var(--c) 78%, var(--ink)); }
.pill i { width: 6px; height: 6px; border-radius: 50%; background: var(--c); }

/* aksi baris */
.row-actions { display: inline-flex; align-items: center; justify-content: flex-end; gap: 6px; flex-wrap: nowrap; }

.act {
  display: inline-flex; align-items: center; justify-content: center; gap: 6px;
  height: 32px; padding: 0 12px;
  font-size: 12.5px; font-weight: 600; white-space: nowrap;
  border: 1px solid transparent; border-radius: 8px; cursor: pointer;
  transition: background .15s, color .15s, border-color .15s, transform .1s;
}
.act:active:not(:disabled) { transform: scale(.97); }
.act .icon { width: 15px; height: 15px; }

/* Terima */
.act.ok {
  background: var(--ok-soft);
  color: color-mix(in srgb, var(--ok) 80%, var(--ink));
  border-color: color-mix(in srgb, var(--ok) 25%, transparent);
}
.act.ok:hover { background: var(--ok); color: #fff; border-color: var(--ok); }

/* Tolak */
.act.no {
  background: var(--danger-soft);
  color: var(--danger);
  border-color: color-mix(in srgb, var(--danger) 25%, transparent);
}
.act.no:hover { background: var(--danger); color: #fff; border-color: var(--danger); }

/* Detail & Hapus (ikon saja) */
.act.view, .act.del { width: 32px; padding: 0; background: transparent; color: var(--muted); border-color: var(--line); }
.act.view:hover { background: var(--accent-soft); color: var(--accent); border-color: var(--accent); }
.act.del:hover { background: var(--danger-soft); color: var(--danger); border-color: var(--danger); }

.icon-btn { width: 32px; height: 32px; display: grid; place-items: center; background: transparent; border: 0; border-radius: 8px; color: var(--muted); cursor: pointer; transition: background .15s, color .15s; }
.icon-btn:hover { background: var(--accent-soft); color: var(--accent); }
.icon-btn.ok:hover { background: var(--ok-soft); color: var(--ok); }
.icon-btn.danger:hover { background: var(--danger-soft); color: var(--danger); }

.foot { display: flex; justify-content: space-between; align-items: center; gap: 12px; flex-wrap: wrap; padding: 14px 20px; border-top: 1px solid var(--line); font-size: 13px; color: var(--muted); }
.pager { display: flex; gap: 4px; flex-wrap: wrap; }
.pg { min-width: 34px; height: 34px; padding: 0 8px; display: grid; place-items: center; font-size: 13px; font-weight: 600; background: transparent; border: 1px solid transparent; border-radius: 8px; cursor: pointer; color: var(--muted); }
.pg:hover:not(:disabled) { background: var(--soft); color: var(--ink); }
.pg.active { background: var(--accent); color: var(--accent-ink); }

/* empty */
.empty { display: flex; flex-direction: column; align-items: center; text-align: center; padding: 64px 24px 72px; gap: 8px; }
.empty-icon { width: 80px; height: 80px; border-radius: 50%; display: grid; place-items: center; background: var(--accent-soft); color: var(--accent); margin-bottom: 12px; box-shadow: 0 0 0 10px color-mix(in srgb, var(--accent-soft) 45%, transparent); }
.empty p { max-width: 380px; font-size: 13.5px; color: var(--muted); line-height: 1.6; margin-bottom: 14px; }

/* modal */
.overlay { position: fixed; inset: 0; z-index: 50; background: var(--overlay); backdrop-filter: blur(4px); display: grid; place-items: center; padding: 16px; animation: fade .15s ease; }
.overlay.top { z-index: 60; }
.modal { width: 100%; max-width: 520px; max-height: calc(100vh - 32px); display: flex; flex-direction: column; background: var(--card); border: 1px solid var(--line); border-radius: 16px; box-shadow: 0 24px 64px rgba(0,0,0,.28); overflow: hidden; animation: pop .18s ease; }
.modal.small { max-width: 420px; }
.modal-head { display: flex; justify-content: space-between; align-items: flex-start; gap: 12px; padding: 20px 24px 16px; border-bottom: 1px solid var(--line); }
.head-right { display: flex; align-items: center; gap: 8px; }
.modal-body { padding: 20px 24px; overflow-y: auto; display: flex; flex-direction: column; gap: 14px; }
.modal-foot { display: flex; justify-content: flex-end; gap: 10px; padding: 16px 24px; border-top: 1px solid var(--line); background: var(--soft); flex-wrap: wrap; }
.modal-foot.spread { justify-content: space-between; align-items: center; }
.foot-right { display: flex; gap: 10px; flex-wrap: wrap; }
.confirm { align-items: center; text-align: center; gap: 10px; padding-top: 28px; }
.confirm .sub { margin-top: 0; }
.warn-icon { width: 48px; height: 48px; border-radius: 50%; display: grid; place-items: center; background: var(--danger-soft); color: var(--danger); }
.warn-icon.info { background: var(--accent-soft); color: var(--accent); }

.kvs { display: flex; flex-direction: column; }
.kv { display: grid; grid-template-columns: 120px 1fr; gap: 12px; padding: 11px 0; border-bottom: 1px solid var(--line); font-size: 13.5px; }
.kv:last-child { border-bottom: 0; }
.kv dt { color: var(--muted); }
.kv dd { display: flex; flex-direction: column; gap: 2px; min-width: 0; word-break: break-word; }
.alert { font-size: 12.5px; line-height: 1.5; padding: 10px 12px; border-radius: 10px; background: var(--danger-soft); color: var(--danger); }

.field { display: flex; flex-direction: column; gap: 8px; }
.label { font-size: 13px; font-weight: 600; }
textarea { width: 100%; padding: 10px 12px; font: inherit; font-size: 13.5px; line-height: 1.5; color: var(--ink); background: var(--field); border: 1px solid var(--line); border-radius: 10px; resize: vertical; }
textarea:focus { outline: 0; border-color: var(--accent); box-shadow: 0 0 0 3px var(--accent-soft); }
textarea::placeholder { color: var(--muted); opacity: .7; }
textarea[aria-invalid="true"] { border-color: var(--danger); }
.err { font-size: 12px; color: var(--danger); font-weight: 500; }

.toast { position: fixed; left: 50%; bottom: 28px; transform: translateX(-50%); z-index: 80; display: flex; align-items: center; gap: 8px; background: var(--ink); color: var(--bg); font-size: 13.5px; font-weight: 500; padding: 11px 18px; border-radius: 12px; box-shadow: 0 10px 30px rgba(0,0,0,.25); animation: fade .2s ease; max-width: calc(100vw - 32px); }
.toast.err { background: var(--danger); color: #fff; }

@keyframes fade { from { opacity: 0 } to { opacity: 1 } }
@keyframes pop { from { opacity: 0; transform: translateY(8px) scale(.98) } to { opacity: 1; transform: none } }

@media (max-width: 960px) { .stats { grid-template-columns: repeat(2, 1fr); } }
@media (max-width: 560px) {
  .wrap { padding: 20px 16px 48px; }
  h1 { font-size: 24px; }
  .stats { grid-template-columns: 1fr; }
  .search { max-width: none; }
  .kv { grid-template-columns: 100px 1fr; }
}
@media (prefers-reduced-motion: reduce) { * { transition: none !important; animation: none !important; } }
`;