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
const API_PESANAN = `${API_BASE}/api/pesanan`;
const API_EVENTS = `${API_BASE}/api/events`;

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
type Status = "Menunggu" | "Lunas" | "Gagal" | "Kedaluwarsa" | "Refund";

type Order = {
  id: number;
  invoice: string;
  pemesan: string;
  email: string;
  event: string;
  kategori: string;
  total: number;
  metode: string;
  status: Status;
  statusKode: string; // pending | paid | failed | expired | refunded
  statusPesanan: string; // Diterima | Ditolak | selain itu dianggap pesanan baru
  tanggal: string;
  adaBukti: boolean;
};

type Payment = {
  id: number;
  metode: string;
  kodeTransaksi: string | null;
  jumlah: number;
  status: string;
  tanggalBayar: string | null;
  buktiBayar: string | null;
  struk: string | null;
};

type OrderDetail = {
  id: number;
  invoice: string;
  pemesan: string;
  email: string;
  telepon: string;
  total: number;
  metode: string;
  status: Status;
  statusKode: string;
  statusPesanan: string;
  tanggal: string;
  item: {
    id: number;
    event: string;
    kategori: string;
    jumlah: number;
    harga: number;
    statusTiket: string;
    kursi: string | null;
  }[];
  pembayaran: Payment[];
};

type EventOpt = { id: number; title: string };
type Tab = "Semua" | "Perlu Konfirmasi" | "Lunas" | "Menunggu" | "Ditolak" | "Kedaluwarsa" | "Refund";

const TABS: Tab[] = ["Semua", "Perlu Konfirmasi", "Lunas", "Menunggu", "Ditolak", "Kedaluwarsa", "Refund"];

const STATUS_COLOR: Record<string, string> = {
  Menunggu: "#3B82C4",
  Lunas: "#16A34A",
  Gagal: "#DC4C4C",
  Kedaluwarsa: "#8A94A3",
  Refund: "#7C5CC4",
};

const AVATAR_COLORS = ["#2F5D80", "#B4573A", "#5B7F4A", "#7A5C9E", "#A8742A", "#3F7F88"];
const PAGE_SIZE = 10;
const ALL = "Semua";

/* ───────────── Helpers ───────────── */
const nf = new Intl.NumberFormat("id-ID");
const rupiah = (n: number) => `Rp ${nf.format(n)}`;
const errMsg = (e: unknown) => (e instanceof Error ? e.message : "Terjadi kesalahan.");

const isAccepted = (o: { statusPesanan: string }) => o.statusPesanan?.toLowerCase() === "diterima";
const isRejected = (o: { statusPesanan: string; status?: string; statusKode?: string }) =>
  o.statusPesanan?.toLowerCase() === "ditolak" || o.status === "Gagal" || o.statusKode === "failed";
const isIncoming = (o: { statusPesanan: string; statusKode: string }) =>
  o.statusKode === "pending" && !isAccepted(o) && !isRejected(o);

const initials = (name: string) =>
  name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]?.toUpperCase()).join("");

const colorFor = (name: string) => {
  let h = 0;
  for (const c of name) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return AVATAR_COLORS[h % AVATAR_COLORS.length];
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const pickList = (r: any): any[] =>
  Array.isArray(r) ? r : r?.data ?? r?.events ?? r?.rows ?? r?.result ?? [];
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const eventTitle = (e: any): string =>
  e.title ?? e.name ?? e.nama ?? e.judul ?? e.event_name ?? e.event_title ?? `Event #${e.id}`;

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
const IClose = () => <Icon><path d="M6 6l12 12M18 6 6 18" /></Icon>;
const IPrev = () => <Icon size={14}><path d="m15 5-7 7 7 7" /></Icon>;
const INext = () => <Icon size={14}><path d="m9 5 7 7-7 7" /></Icon>;
const ICheck = () => <Icon size={16}><path d="m5 12.5 4.5 4.5L19 7.5" /></Icon>;
const ICheckSm = () => <Icon size={14}><path d="m5 12.5 4.5 4.5L19 7.5" /></Icon>;
const IXSm = () => <Icon size={14}><path d="M6 6l12 12M18 6 6 18" /></Icon>;
const ISearch = () => <Icon size={16}><circle cx="11" cy="11" r="6.5" /><path d="m20 20-4-4" /></Icon>;
const IExpand = () => <Icon size={16}><path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5" /></Icon>;
const IBell = () => <Icon size={16}><path d="M6 9a6 6 0 1 1 12 0c0 6 2 7 2 7H4s2-1 2-7ZM10 20a2 2 0 0 0 4 0" /></Icon>;
const IReceipt = () => <Icon size={30}><path d="M6 3h12v18l-3-2-3 2-3-2-3 2V3ZM9 8h6M9 12h6" /></Icon>;
const IDownload = () => <Icon size={16}><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3" /></Icon>;
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

function ConfirmPill({ order }: { order: { statusPesanan: string; statusKode: string } }) {
  let label = "";
  let color = "";
  if (isRejected(order)) {
    label = "Ditolak";
    color = "#DC4C4C";
  } else if (isAccepted(order)) {
    label = "Diterima";
    color = "#16A34A";
  } else if (isIncoming(order)) {
    label = "Perlu konfirmasi";
    color = "#D98A0B";
  } else {
    return null;
  }
  return (
    <span className="pill" style={{ "--c": color } as CSSProperties}>
      <i />
      {label}
    </span>
  );
}

function Avatar({ name, size = 32 }: { name: string; size?: number }) {
  return (
    <span className="avatar" style={{ width: size, height: size, fontSize: size * 0.38, background: colorFor(name) }} aria-hidden="true">
      {initials(name)}
    </span>
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

/* ───────────── Dialog tolak dengan alasan ───────────── */
function RejectDialog({
  order,
  busy,
  onCancel,
  onConfirm,
}: {
  order: { id: number; invoice: string };
  busy: boolean;
  onCancel: () => void;
  onConfirm: (alasan: string) => void;
}) {
  const [reason, setReason] = useState("");
  useModal(onCancel);

  return (
    <div className="overlay top" onMouseDown={(e) => e.target === e.currentTarget && onCancel()}>
      <div className="modal small" role="dialog" aria-modal="true" aria-labelledby="rej-title">
        <header className="modal-head">
          <div>
            <h2 id="rej-title">Tolak Pesanan #{order.invoice}</h2>
            <p className="sub">Tiket akan dibatalkan dan kursi dilepas kembali.</p>
          </div>
          <button className="icon-btn" onClick={onCancel} aria-label="Tutup"><IClose /></button>
        </header>
        <div className="modal-body">
          <div className="field">
            <label className="label" htmlFor="rej-reason">Alasan penolakan (opsional)</label>
            <textarea
              id="rej-reason"
              rows={3}
              autoFocus
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Contoh: Bukti transfer buram, tidak valid, atau nominal kurang."
            />
            <p className="hint">Alasan ini akan dikirimkan ke notifikasi pemesan.</p>
          </div>
        </div>
        <footer className="modal-foot">
          <button className="btn-ghost" onClick={onCancel} disabled={busy}>Batal</button>
          <button className="btn-danger" onClick={() => onConfirm(reason.trim())} disabled={busy}>
            {busy ? "Memproses…" : "Konfirmasi Tolak"}
          </button>
        </footer>
      </div>
    </div>
  );
}

/* ───────────── Modal detail + terima / tolak ───────────── */
function OrderModal({
  order,
  saving,
  onClose,
  onAccept,
  onRejectPrompt,
}: {
  order: OrderDetail;
  saving: boolean;
  onClose: () => void;
  onAccept: () => void;
  onRejectPrompt: () => void;
}) {
  const [zoom, setZoom] = useState(false);
  const proof = order.pembayaran.find((p) => p.buktiBayar)?.buktiBayar ?? null;
  const pending = order.statusKode === "pending";
  const incoming = isIncoming(order);
  const rejected = isRejected(order);
  const events = [...new Set(order.item.map((i) => i.event))].join(", ");

  useModal(onClose);

  return (
    <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal wide" role="dialog" aria-modal="true" aria-labelledby="ord-title">
        <header className="modal-head">
          <div>
            <h2 id="ord-title">Detail Pesanan</h2>
            <p className="sub">#{order.invoice}</p>
          </div>
          <div className="head-right">
            <ConfirmPill order={order} />
            <StatusPill status={order.status} />
            <button className="icon-btn" onClick={onClose} aria-label="Tutup"><IClose /></button>
          </div>
        </header>

        <div className="modal-body split">
          {/* Info pesanan */}
          <section>
            <h3 className="section-title">Informasi Pesanan</h3>
            <dl className="kvs">
              <Row label="Pemesan">
                <strong>{order.pemesan}</strong>
                <span className="muted small">{order.email}</span>
                {order.telepon !== "-" && <span className="muted small">{order.telepon}</span>}
              </Row>
              <Row label="Event">{events || "-"}</Row>
              <Row label="Tiket">
                {order.item.map((i) => (
                  <span key={i.id}>
                    {i.kategori} · {i.jumlah} tiket{i.kursi ? ` (${i.kursi})` : ""}
                  </span>
                ))}
              </Row>
              <Row label="Metode Bayar">
                <span className="method-pill">{order.metode || "Transfer"}</span>
              </Row>
              <Row label="Tanggal Pesan">{order.tanggal}</Row>
              <Row label="Total Bayar"><strong className="total">{rupiah(order.total)}</strong></Row>
            </dl>
          </section>

          {/* Bukti pembayaran */}
          <section>
            <h3 className="section-title">Bukti Pembayaran</h3>
            {proof ? (
              <>
                <button className="proof" onClick={() => setZoom(true)} aria-label="Perbesar bukti pembayaran">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={proof} alt={`Bukti pembayaran ${order.invoice}`} />
                  <span className="proof-zoom"><IExpand /> Perbesar</span>
                </button>
                <p className="hint center">Periksa nominal, tanggal, dan rekening tujuan sebelum menerima pesanan.</p>
              </>
            ) : (
              <div className="proof none">
                <IReceipt />
                <p>
                  {pending
                    ? "Pemesan belum mengunggah bukti pembayaran."
                    : "Tidak ada bukti pembayaran untuk pesanan ini."}
                </p>
              </div>
            )}
          </section>
        </div>

        {/* Info konfirmasi */}
        {incoming && (
          <div className="reject-box">
            <p className="info">
              Pesanan ini baru masuk. Klik <strong>Terima</strong> untuk menerima pesanan dan otomatis mengubah status pembayaran menjadi <strong>Lunas</strong>. Klik <strong>Tolak</strong> jika bukti tidak sesuai.
            </p>
          </div>
        )}

        {rejected && (
          <div className="reject-box">
            <p className="alert">Pesanan ini sudah ditolak dan tidak dapat diubah lagi.</p>
          </div>
        )}

        <footer className="modal-foot">
          <div className="foot-actions">
            <button className="btn-ghost" onClick={onClose}>Tutup</button>
            {incoming && (
              <>
                <button className="btn-outline-danger" onClick={onRejectPrompt} disabled={saving}>Tolak</button>
                <button className="btn-primary" onClick={onAccept} disabled={saving}>
                  <ICheck /> {saving ? "Memproses…" : "Terima Pesanan"}
                </button>
              </>
            )}
          </div>
        </footer>
      </div>

      {zoom && proof && (
        <div className="lightbox" onMouseDown={(e) => { e.stopPropagation(); setZoom(false); }}>
          <button className="lb-close" onClick={() => setZoom(false)} aria-label="Tutup pratinjau"><IClose /></button>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={proof} alt={`Bukti pembayaran ${order.invoice}`} onMouseDown={(e) => e.stopPropagation()} />
        </div>
      )}
    </div>
  );
}

/* ───────────── Halaman Utama ───────────── */
export default function OrdersPage() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [events, setEvents] = useState<EventOpt[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [opening, setOpening] = useState(false);
  const [tab, setTab] = useState<Tab>("Semua");
  const [selectedEvent, setSelectedEvent] = useState<string>(ALL);
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const [detail, setDetail] = useState<OrderDetail | null>(null);
  const [rejectOrderTarget, setRejectOrderTarget] = useState<{ id: number; invoice: string } | null>(null);
  const [tick, setTick] = useState(0);
  const [toast, setToast] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  function showToast(msg: string) {
    setToast(msg);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setToast(null), 3500);
  }

  /* Ambil daftar event untuk dropdown filter */
  useEffect(() => {
    api<unknown>(API_EVENTS)
      .then((r) => {
        const list = pickList(r);
        setEvents(
          list
            .filter((e) => e && e.id != null)
            .map((e) => ({ id: Number(e.id), title: eventTitle(e) }))
            .sort((a, b) => a.title.localeCompare(b.title, "id")),
        );
      })
      .catch((e) => {
        console.error("Gagal memuat event:", e);
      });
  }, []);

  /* Ambil seluruh pesanan dari server */
  useEffect(() => {
    let alive = true;
    setLoading(true);
    api<Order[]>(API_PESANAN)
      .then((d) => alive && setOrders(d))
      .catch((e) => alive && showToast(errMsg(e)))
      .finally(() => alive && setLoading(false));

    return () => {
      alive = false;
    };
  }, [tick]);

  /* Hitungan badge untuk tab */
  const counts = useMemo(() => {
    const c: Record<Tab, number> = {
      Semua: orders.length,
      "Perlu Konfirmasi": 0,
      Lunas: 0,
      Menunggu: 0,
      Ditolak: 0,
      Kedaluwarsa: 0,
      Refund: 0,
    };
    orders.forEach((o) => {
      if (isIncoming(o)) c["Perlu Konfirmasi"]++;
      if (o.status === "Lunas") c.Lunas++;
      if (o.status === "Menunggu" && !isIncoming(o)) c.Menunggu++;
      if (isRejected(o)) c.Ditolak++;
      if (o.status === "Kedaluwarsa") c.Kedaluwarsa++;
      if (o.status === "Refund") c.Refund++;
    });
    return c;
  }, [orders]);

  /* Filter data real-time berdasarkan Tab, Event, dan Pencarian teks */
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return orders.filter((o) => {
      // Filter Event
      if (selectedEvent !== ALL) {
        const evMatch = events.find((e) => String(e.id) === selectedEvent);
        if (evMatch && !o.event.toLowerCase().includes(evMatch.title.toLowerCase())) {
          return false;
        }
      }

      // Filter Tab Status
      if (tab === "Perlu Konfirmasi" && !isIncoming(o)) return false;
      if (tab === "Lunas" && o.status !== "Lunas") return false;
      if (tab === "Menunggu" && (o.status !== "Menunggu" || isIncoming(o))) return false;
      if (tab === "Ditolak" && !isRejected(o)) return false;
      if (tab === "Kedaluwarsa" && o.status !== "Kedaluwarsa") return false;
      if (tab === "Refund" && o.status !== "Refund") return false;

      // Filter Query Teks
      if (q) {
        const match = [o.invoice, o.pemesan, o.email, o.event, o.kategori, o.metode]
          .some((v) => v.toLowerCase().includes(q));
        if (!match) return false;
      }

      return true;
    });
  }, [orders, tab, selectedEvent, query, events]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(page, pageCount);
  const start = (safePage - 1) * PAGE_SIZE;
  const rows = filtered.slice(start, start + PAGE_SIZE);
  const incomingCount = counts["Perlu Konfirmasi"];

  function changeTab(t: Tab) {
    setTab(t);
    setPage(1);
  }

  function changeEvent(ev: string) {
    setSelectedEvent(ev);
    setPage(1);
  }

  function changeQuery(q: string) {
    setQuery(q);
    setPage(1);
  }

  function resetFilters() {
    setTab("Semua");
    setSelectedEvent(ALL);
    setQuery("");
    setPage(1);
  }

  async function openOrder(id: number) {
    if (opening) return;
    setOpening(true);
    try {
      setDetail(await api<OrderDetail>(`${API_PESANAN}/${id}`));
    } catch (e) {
      showToast(errMsg(e));
    } finally {
      setOpening(false);
    }
  }

  /* Terima pesanan: konfirmasi diterima -> otomatis set Lunas */
  async function acceptOrder(id: number) {
    setSaving(true);
    try {
      await api(`${API_PESANAN}/${id}/konfirmasi`, {
        method: "PATCH",
        body: JSON.stringify({ aksi: "terima" }),
      });

      try {
        await api(`${API_PESANAN}/${id}/status`, {
          method: "PATCH",
          body: JSON.stringify({ status: "Lunas" satisfies Status }),
        });
        showToast("Pesanan diterima dan otomatis berstatus Lunas.");
      } catch (e) {
        showToast(`Pesanan diterima, tetapi status Lunas gagal diset: ${errMsg(e)}`);
      }

      setDetail(null);
      setTick((t) => t + 1);
    } catch (e) {
      showToast(errMsg(e));
    } finally {
      setSaving(false);
    }
  }

  /* Tolak pesanan dengan alasan */
  async function rejectOrder(id: number, alasan?: string) {
    setSaving(true);
    try {
      await api(`${API_PESANAN}/${id}/konfirmasi`, {
        method: "PATCH",
        body: JSON.stringify({ aksi: "tolak", alasan }),
      });
      showToast("Pesanan ditolak.");
      setRejectOrderTarget(null);
      setDetail(null);
      setTick((t) => t + 1);
    } catch (e) {
      showToast(errMsg(e));
    } finally {
      setSaving(false);
    }
  }

  /* Ekspor laporan ke CSV (Excel UTF-8) */
  function exportReport() {
    if (!filtered.length) return showToast("Tidak ada data pesanan untuk diekspor.");
    const headers = [
      "No",
      "Invoice",
      "Tanggal Pesan",
      "Pemesan",
      "Email",
      "Event",
      "Tiket",
      "Metode Pembayaran",
      "Total (IDR)",
      "Status Bayar",
      "Status Pesanan",
    ];
    const csvRows = filtered.map((o, i) => [
      i + 1,
      `"${o.invoice}"`,
      `"${o.tanggal}"`,
      `"${o.pemesan.replace(/"/g, '""')}"`,
      `"${o.email}"`,
      `"${(o.event || "").replace(/"/g, '""')}"`,
      `"${(o.kategori || "").replace(/"/g, '""')}"`,
      `"${o.metode || "-"}"`,
      o.total,
      `"${o.status}"`,
      `"${o.statusPesanan}"`,
    ]);

    const csvContent = "\uFEFF" + [headers.join(","), ...csvRows.map((row) => row.join(","))].join("\r\n");
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    const dateStr = new Date().toISOString().split("T")[0];
    link.setAttribute("href", url);
    link.setAttribute("download", `Laporan_Pesanan_Encore_${dateStr}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    showToast("Laporan pesanan berhasil diunduh.");
  }

  const isFiltered = tab !== "Semua" || selectedEvent !== ALL || query.trim() !== "";

  return (
    <main className={`page ${inter.className}`}>
      <style>{css}</style>

      <div className="wrap">
        {/* Header (Bersih tanpa status card) */}
        <header className="head">
          <div>
            <nav className="crumb" aria-label="Breadcrumb">
              <span>Dashboard</span><span aria-hidden="true">/</span><strong>Pesanan</strong>
            </nav>
            <h1>Daftar Pesanan Masuk</h1>
            <p className="sub">Verifikasi pembayaran tiket konser dan pantau transaksi pemesanan tiket.</p>
          </div>
        </header>

        {/* Tabel Data & Toolbar Filter */}
        <section className="card list" aria-busy={loading}>
          {/* Header Card dengan Tombol Ekspor */}
          <div className="list-head">
            <div>
              <h2>Daftar Transaksi Pesanan</h2>
              <span className="muted small">
                {filtered.length > 0
                  ? `Menampilkan ${start + 1}–${start + rows.length} dari ${nf.format(filtered.length)} pesanan`
                  : "Tidak ada pesanan"}
              </span>
            </div>
            <button className="btn-ghost btn-export" onClick={exportReport} title="Ekspor daftar pesanan ke CSV / Excel">
              <IDownload /> Ekspor Laporan
            </button>
          </div>

          {/* Tab Status Cepat */}
          <div className="tabs-bar">
            <div className="tabs" role="tablist" aria-label="Filter status">
              {TABS.map((t) => (
                <button
                  key={t}
                  role="tab"
                  aria-selected={tab === t}
                  className={`tab ${tab === t ? "on" : ""}`}
                  onClick={() => changeTab(t)}
                >
                  {t} <span>{counts[t]}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Baris Filter Event & Search Cepat */}
          <div className="toolbar">
            <div className="tool-left">
              <div className="select-wrap">
                <select
                  value={selectedEvent}
                  onChange={(e) => changeEvent(e.target.value)}
                  aria-label="Pilih Event"
                >
                  <option value={ALL}>Semua Event</option>
                  {events.map((ev) => (
                    <option key={ev.id} value={String(ev.id)}>{ev.title}</option>
                  ))}
                </select>
              </div>
              {isFiltered && (
                <button className="btn-text reset" onClick={resetFilters}>Reset Filter</button>
              )}
            </div>

            <label className="search">
              <ISearch />
              <input
                type="search"
                placeholder="Cari invoice, nama, event, metode..."
                value={query}
                onChange={(e) => changeQuery(e.target.value)}
                aria-label="Cari pesanan"
              />
            </label>
          </div>

          {loading ? (
            <p className="loading muted">Memuat pesanan…</p>
          ) : rows.length > 0 ? (
            <>
              <div className="table-wrap">
                <table>
                  <colgroup>
                    <col style={{ width: 170 }} />
                    <col style={{ width: 220 }} />
                    <col style={{ width: 200 }} />
                    <col style={{ width: 130 }} />
                    <col style={{ width: 130 }} />
                    <col style={{ width: 160 }} />
                    <col style={{ width: 190 }} />
                  </colgroup>
                  <thead>
                    <tr>
                      <th>Invoice</th>
                      <th>Pemesan</th>
                      <th>Event & Tiket</th>
                      <th>Metode</th>
                      <th className="right">Total</th>
                      <th>Status</th>
                      <th className="right">Aksi</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((o) => {
                      const incoming = isIncoming(o);
                      return (
                        <tr key={o.id} className={incoming ? "incoming" : undefined}>
                          <td>
                            <button className="invoice" onClick={() => openOrder(o.id)}>#{o.invoice}</button>
                            <p className="muted small mt">{o.tanggal}</p>
                          </td>
                          <td>
                            <div className="who">
                              <Avatar name={o.pemesan} />
                              <div className="who-text">
                                <p className="name ellipsis" title={o.pemesan}>{o.pemesan}</p>
                                <p className="muted small ellipsis" title={o.email}>{o.email}</p>
                              </div>
                            </div>
                          </td>
                          <td>
                            <p className="ev ellipsis" title={o.event}>{o.event}</p>
                            <p className="muted small ellipsis mt" title={o.kategori}>{o.kategori}</p>
                          </td>
                          <td>
                            <span className="method-pill">{o.metode || "Transfer"}</span>
                          </td>
                          <td className="right total num">{rupiah(o.total)}</td>
                          <td>
                            <div className="pills">
                              <ConfirmPill order={o} />
                              <StatusPill status={o.status} />
                              {o.statusKode === "pending" && !o.adaBukti && (
                                <span className="muted small">Belum ada bukti</span>
                              )}
                            </div>
                          </td>
                          <td className="right">
                            <div className="row-actions">
                              {incoming && (
                                <>
                                  <button
                                    className="act no"
                                    onClick={() => setRejectOrderTarget({ id: o.id, invoice: o.invoice })}
                                    disabled={saving}
                                    title="Tolak pesanan"
                                    aria-label={`Tolak ${o.invoice}`}
                                  >
                                    <IXSm /> Tolak
                                  </button>
                                  <button
                                    className="act ok"
                                    onClick={() => acceptOrder(o.id)}
                                    disabled={saving}
                                    title="Terima dan lunaskan pesanan"
                                    aria-label={`Terima ${o.invoice}`}
                                  >
                                    <ICheckSm /> {saving ? "…" : "Terima"}
                                  </button>
                                </>
                              )}
                              <button
                                className="act view"
                                onClick={() => openOrder(o.id)}
                                aria-label={`Lihat detail ${o.invoice}`}
                                title="Lihat detail & bukti transfer"
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
                <span>
                  Menampilkan {start + 1}–{start + rows.length} dari {nf.format(filtered.length)} pesanan
                </span>
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
              {isFiltered ? (
                <>
                  <h3>Tidak ada pesanan</h3>
                  <p>Tidak ada pesanan yang cocok dengan filter atau pencarian kamu.</p>
                  <button className="btn-ghost" onClick={resetFilters}>Reset filter</button>
                </>
              ) : (
                <>
                  <h3>Belum ada pesanan masuk</h3>
                  <p>Pesanan dari penonton akan muncul di sini setelah mereka checkout tiket.</p>
                </>
              )}
            </div>
          )}
        </section>
      </div>

      {/* Modal Detail Pesanan */}
      {detail && (
        <OrderModal
          key={`${detail.id}-${detail.statusPesanan}-${detail.statusKode}`}
          order={detail}
          saving={saving}
          onClose={() => setDetail(null)}
          onAccept={() => acceptOrder(detail.id)}
          onRejectPrompt={() => {
            setRejectOrderTarget({ id: detail.id, invoice: detail.invoice });
          }}
        />
      )}

      {/* Dialog Konfirmasi Tolak Pesanan */}
      {rejectOrderTarget && (
        <RejectDialog
          order={rejectOrderTarget}
          busy={saving}
          onCancel={() => setRejectOrderTarget(null)}
          onConfirm={(alasan) => rejectOrder(rejectOrderTarget.id, alasan)}
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
  --danger: #C4372D; --danger-hover: #A82D24; --danger-soft: #FCEBE9;
  --ok: #16A34A; --ok-soft: #E3F5EA;
  --warn: #B26F00; --warn-soft: #FFF3DC;
  --field: #FFFFFF; --overlay: rgba(23,32,42,.5);
  --shadow: 0 1px 2px rgba(23,32,42,.04), 0 6px 20px rgba(23,32,42,.05);
}
:root[data-theme="dark"] {
  --bg: #121316; --card: #1B1C20; --ink: #F1EEEA; --muted: #9CA3AE; --line: #2E3037;
  --soft: #24262B; --hover: #212328;
  --accent: #8EC1EC; --accent-hover: #A8D1F2; --accent-ink: #10202D; --accent-soft: #1F3547;
  --danger: #EE7A70; --danger-hover: #F39A92; --danger-soft: #3A2220;
  --ok: #4CC47A; --ok-soft: #1B3626;
  --warn: #F2B34D; --warn-soft: #3A2D14;
  --field: #14151A; --overlay: rgba(0,0,0,.65);
  --shadow: 0 1px 2px rgba(0,0,0,.3), 0 6px 20px rgba(0,0,0,.3);
}
* { box-sizing: border-box; margin: 0; padding: 0; }
html, body { background: var(--bg); color: var(--ink); -webkit-font-smoothing: antialiased; }
button { font: inherit; color: inherit; }

.page { min-height: 100vh; }
.wrap { max-width: 1320px; margin: 0 auto; padding: 32px 24px 64px; display: flex; flex-direction: column; gap: 20px; }

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
.mt { margin-top: 3px; }
.ellipsis { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

/* banner pesanan baru */
.banner { display: inline-flex; align-items: center; gap: 8px; padding: 9px 14px; border-radius: 999px; font-size: 13px; background: var(--warn-soft); color: var(--warn); border: 1px solid color-mix(in srgb, var(--warn) 30%, transparent); }

/* buttons */
.btn-primary, .btn-ghost, .btn-danger, .btn-outline-danger { display: inline-flex; align-items: center; justify-content: center; gap: 8px; height: 38px; padding: 0 16px; font-size: 13.5px; font-weight: 600; border-radius: 10px; cursor: pointer; border: 1px solid transparent; transition: background .15s, border-color .15s; white-space: nowrap; }
.btn-primary { background: var(--accent); color: var(--accent-ink); box-shadow: 0 1px 2px rgba(47,93,128,.3); }
.btn-primary:hover:not(:disabled) { background: var(--accent-hover); }
.btn-ghost { background: var(--card); border-color: var(--line); }
.btn-ghost:hover:not(:disabled) { background: var(--hover); border-color: var(--muted); }
.btn-danger { background: var(--danger); color: #fff; }
.btn-danger:hover:not(:disabled) { background: var(--danger-hover); }
.btn-outline-danger { background: var(--card); color: var(--danger); border-color: color-mix(in srgb, var(--danger) 45%, var(--line)); }
.btn-outline-danger:hover:not(:disabled) { background: var(--danger-soft); border-color: var(--danger); }
.btn-export { height: 36px; padding: 0 14px; font-size: 13px; font-weight: 600; border-radius: 8px; display: inline-flex; align-items: center; gap: 7px; }
.btn-text { background: none; border: 0; color: var(--accent); font-size: 13px; font-weight: 600; cursor: pointer; padding: 6px 4px; }
.btn-text:hover { text-decoration: underline; }
.btn-text.reset { color: var(--muted); }
.btn-text.reset:hover { color: var(--ink); }

button:focus-visible, select:focus-visible, textarea:focus-visible, input:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
button:disabled { opacity: .4; cursor: not-allowed; }

/* list & header */
.list { overflow: hidden; }
.list-head { display: flex; justify-content: space-between; align-items: center; gap: 12px; flex-wrap: wrap; padding: 18px 20px 12px; border-bottom: 1px solid var(--line); }

/* tabs bar */
.tabs-bar { padding: 12px 20px 0; }
.tabs { display: flex; gap: 4px; flex-wrap: wrap; }
.tab { display: inline-flex; align-items: center; gap: 7px; height: 34px; padding: 0 12px; background: transparent; border: 0; border-radius: 8px; font-size: 13px; font-weight: 600; color: var(--muted); cursor: pointer; transition: background .15s, color .15s; }
.tab span { font-size: 11.5px; padding: 1px 7px; border-radius: 999px; background: var(--soft); color: var(--muted); font-variant-numeric: tabular-nums; }
.tab:hover { background: var(--soft); color: var(--ink); }
.tab.on { background: var(--accent-soft); color: var(--accent); }
.tab.on span { background: var(--accent); color: var(--accent-ink); }

/* toolbar */
.toolbar { display: flex; justify-content: space-between; align-items: center; gap: 12px; padding: 12px 20px 16px; border-bottom: 1px solid var(--line); flex-wrap: wrap; }
.tool-left { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
.select-wrap select { height: 38px; min-width: 190px; max-width: 260px; padding: 0 34px 0 12px; font: inherit; font-size: 13px; font-weight: 500; color: var(--ink); border: 1px solid var(--line); background-color: var(--field); border-radius: 10px; cursor: pointer; appearance: none; background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%236A7380' stroke-width='2.5' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E"); background-repeat: no-repeat; background-position: right 12px center; text-overflow: ellipsis; }
.select-wrap select:focus { border-color: var(--accent); box-shadow: 0 0 0 3px var(--accent-soft); outline: 0; }

.search { width: 100%; max-width: 340px; display: flex; align-items: center; gap: 8px; height: 38px; padding: 0 12px; border: 1px solid var(--line); background: var(--field); border-radius: 10px; color: var(--muted); transition: border-color .15s, box-shadow .15s; }
.search:focus-within { border-color: var(--accent); box-shadow: 0 0 0 3px var(--accent-soft); }
.search input { flex: 1; border: 0; outline: 0 !important; background: transparent; font: inherit; font-size: 13.5px; color: var(--ink); min-width: 0; }

/* table */
.loading { padding: 56px 24px; text-align: center; font-size: 13.5px; }
.table-wrap { overflow-x: auto; }
table { width: 100%; border-collapse: collapse; table-layout: fixed; min-width: 1200px; font-size: 13.5px; }
th { text-align: left; font-size: 11.5px; font-weight: 600; letter-spacing: .04em; text-transform: uppercase; color: var(--muted); padding: 13px 16px; background: var(--soft); white-space: nowrap; }
th:first-child, td:first-child { padding-left: 20px; }
th:last-child, td:last-child { padding-right: 20px; }
td { padding: 14px 16px; border-bottom: 1px solid var(--line); vertical-align: middle; overflow: hidden; }
tbody tr { transition: background .12s; }
tbody tr:hover { background: var(--hover); }
tbody tr.incoming { background: color-mix(in srgb, var(--warn-soft) 40%, transparent); }
tbody tr:last-child td { border-bottom: 0; }
.right { text-align: right; }
.num { font-variant-numeric: tabular-nums; }
.name { font-weight: 600; }
.ev { font-weight: 500; }
.total { font-weight: 700; white-space: nowrap; }
.invoice { background: none; border: 0; padding: 0; color: var(--accent); font-weight: 700; font-size: 13.5px; cursor: pointer; text-align: left; }
.invoice:hover { text-decoration: underline; }

.who { display: flex; align-items: center; gap: 10px; min-width: 0; }
.who-text { min-width: 0; flex: 1; }
.avatar { display: grid; place-items: center; border-radius: 50%; color: #fff; font-weight: 600; flex-shrink: 0; }

.method-pill { display: inline-block; font-size: 12px; font-weight: 600; padding: 2px 8px; border-radius: 6px; background: var(--soft); color: var(--ink); border: 1px solid var(--line); }

.pills { display: flex; flex-direction: column; align-items: flex-start; gap: 5px; }
.pill { display: inline-flex; align-items: center; gap: 6px; font-size: 12px; font-weight: 600; padding: 3px 10px; border-radius: 999px; white-space: nowrap; background: color-mix(in srgb, var(--c) 14%, transparent); color: color-mix(in srgb, var(--c) 78%, var(--ink)); }
.pill i { width: 6px; height: 6px; border-radius: 50%; background: var(--c); }

/* row actions */
.row-actions { display: inline-flex; align-items: center; justify-content: flex-end; gap: 6px; flex-wrap: nowrap; }
.act { display: inline-flex; align-items: center; justify-content: center; gap: 6px; height: 32px; padding: 0 12px; font-size: 12.5px; font-weight: 600; white-space: nowrap; border: 1px solid transparent; border-radius: 8px; cursor: pointer; transition: background .15s, color .15s, border-color .15s; }
.act.ok { background: var(--ok-soft); color: color-mix(in srgb, var(--ok) 80%, var(--ink)); border-color: color-mix(in srgb, var(--ok) 25%, transparent); }
.act.ok:hover:not(:disabled) { background: var(--ok); color: #fff; }
.act.no { background: var(--danger-soft); color: var(--danger); border-color: color-mix(in srgb, var(--danger) 25%, transparent); }
.act.no:hover:not(:disabled) { background: var(--danger); color: #fff; }
.act.view { width: 32px; padding: 0; background: transparent; color: var(--muted); border-color: var(--line); }
.act.view:hover { background: var(--accent-soft); color: var(--accent); border-color: var(--accent); }

.foot { display: flex; justify-content: space-between; align-items: center; gap: 12px; flex-wrap: wrap; padding: 14px 20px; border-top: 1px solid var(--line); font-size: 13px; color: var(--muted); }
.pager { display: flex; gap: 4px; }
.pg { min-width: 34px; height: 34px; padding: 0 8px; display: grid; place-items: center; font-size: 13px; font-weight: 600; background: transparent; border: 1px solid transparent; border-radius: 8px; cursor: pointer; color: var(--muted); }
.pg:hover:not(:disabled) { background: var(--soft); color: var(--ink); }
.pg.active { background: var(--accent); color: var(--accent-ink); }

/* empty */
.empty { display: flex; flex-direction: column; align-items: center; text-align: center; padding: 72px 24px 80px; gap: 8px; }
.empty-icon { width: 80px; height: 80px; border-radius: 50%; display: grid; place-items: center; background: var(--accent-soft); color: var(--accent); margin-bottom: 12px; box-shadow: 0 0 0 10px color-mix(in srgb, var(--accent-soft) 45%, transparent); }
.empty p { max-width: 380px; font-size: 13.5px; color: var(--muted); line-height: 1.6; margin-bottom: 14px; }

/* modal */
.overlay { position: fixed; inset: 0; z-index: 50; background: var(--overlay); backdrop-filter: blur(4px); display: grid; place-items: center; padding: 16px; animation: fade .15s ease; }
.overlay.top { z-index: 60; }
.modal { width: 100%; max-width: 480px; max-height: calc(100vh - 32px); display: flex; flex-direction: column; background: var(--card); border: 1px solid var(--line); border-radius: 16px; box-shadow: 0 24px 64px rgba(0,0,0,.28); overflow: hidden; animation: pop .18s ease; }
.modal.small { max-width: 440px; }
.modal.wide { max-width: 820px; }
.modal-head { display: flex; justify-content: space-between; align-items: flex-start; gap: 12px; padding: 20px 24px 16px; border-bottom: 1px solid var(--line); }
.head-right { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; justify-content: flex-end; }
.modal-body { padding: 22px 24px; overflow-y: auto; }
.modal-body.split { display: grid; grid-template-columns: 1.1fr 1fr; gap: 28px; }
.modal-foot { display: flex; justify-content: flex-end; gap: 10px; padding: 16px 24px; border-top: 1px solid var(--line); background: var(--soft); flex-wrap: wrap; }
.foot-actions { display: flex; gap: 10px; align-items: center; }
.section-title { font-size: 12px; font-weight: 700; letter-spacing: .06em; text-transform: uppercase; color: var(--muted); margin-bottom: 14px; }

.kvs { display: flex; flex-direction: column; }
.kv { display: grid; grid-template-columns: 120px 1fr; gap: 12px; padding: 11px 0; border-bottom: 1px solid var(--line); font-size: 13.5px; }
.kv:last-child { border-bottom: 0; }
.kv dt { color: var(--muted); }
.kv dd { display: flex; flex-direction: column; gap: 2px; min-width: 0; word-break: break-word; }
.alert { font-size: 12.5px; line-height: 1.5; padding: 10px 12px; border-radius: 10px; background: var(--danger-soft); color: var(--danger); }
.info { font-size: 12.5px; line-height: 1.5; padding: 10px 12px; border-radius: 10px; background: var(--warn-soft); color: var(--warn); }

.field { display: flex; flex-direction: column; gap: 8px; }
.label { font-size: 13px; font-weight: 600; }
textarea { width: 100%; padding: 10px 12px; font: inherit; font-size: 13.5px; line-height: 1.5; color: var(--ink); background: var(--field); border: 1px solid var(--line); border-radius: 10px; resize: vertical; }
textarea:focus { outline: 0; border-color: var(--accent); box-shadow: 0 0 0 3px var(--accent-soft); }
textarea::placeholder { color: var(--muted); opacity: .7; }

.proof { position: relative; display: block; width: 100%; padding: 0; background: var(--soft); border: 1px solid var(--line); border-radius: 12px; overflow: hidden; cursor: zoom-in; }
.proof img { display: block; width: 100%; max-height: 380px; object-fit: contain; }
.proof-zoom { position: absolute; right: 10px; bottom: 10px; display: inline-flex; align-items: center; gap: 6px; font-size: 12px; font-weight: 600; padding: 6px 10px; border-radius: 8px; background: rgba(23,32,42,.78); color: #fff; opacity: 0; transition: opacity .15s; }
.proof:hover .proof-zoom, .proof:focus-visible .proof-zoom { opacity: 1; }
.proof.none { cursor: default; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 10px; min-height: 240px; border-style: dashed; color: var(--muted); font-size: 13px; text-align: center; padding: 24px; }
.hint { font-size: 12px; color: var(--muted); margin-top: 6px; line-height: 1.5; }

.reject-box { padding: 14px 24px; display: flex; flex-direction: column; gap: 8px; border-top: 1px solid var(--line); }

.lightbox { position: fixed; inset: 0; z-index: 70; background: rgba(8,10,14,.88); display: grid; place-items: center; padding: 24px; cursor: zoom-out; animation: fade .15s ease; }
.lightbox img { max-width: min(92vw, 520px); max-height: 90vh; border-radius: 10px; background: #fff; cursor: default; }
.lb-close { position: absolute; top: 16px; right: 16px; width: 40px; height: 40px; display: grid; place-items: center; border: 0; border-radius: 50%; background: rgba(255,255,255,.14); color: #fff; cursor: pointer; }
.lb-close:hover { background: rgba(255,255,255,.26); }

.icon-btn { width: 34px; height: 34px; display: grid; place-items: center; background: transparent; border: 0; border-radius: 8px; color: var(--muted); cursor: pointer; transition: background .15s, color .15s; flex-shrink: 0; }
.icon-btn:hover { background: var(--accent-soft); color: var(--accent); }

.toast { position: fixed; left: 50%; bottom: 28px; transform: translateX(-50%); z-index: 80; display: flex; align-items: center; gap: 8px; background: var(--ink); color: var(--bg); font-size: 13.5px; font-weight: 500; padding: 11px 18px; border-radius: 12px; box-shadow: 0 10px 30px rgba(0,0,0,.25); animation: fade .2s ease; max-width: calc(100vw - 32px); }

@keyframes fade { from { opacity: 0 } to { opacity: 1 } }
@keyframes pop { from { opacity: 0; transform: translateY(8px) scale(.98) } to { opacity: 1; transform: none } }

@media (max-width: 960px) {
  .modal-body.split { grid-template-columns: 1fr; gap: 24px; }
  .toolbar { flex-direction: column; align-items: stretch; }
  .search { max-width: none; }
}
@media (max-width: 560px) {
  .wrap { padding: 20px 16px 48px; }
  h1 { font-size: 24px; }
  .kv { grid-template-columns: 100px 1fr; }
}
@media (prefers-reduced-motion: reduce) { * { transition: none !important; animation: none !important; } }
`;
