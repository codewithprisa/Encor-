"use client";

import {
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";
import { Inter } from "next/font/google";

const inter = Inter({ subsets: ["latin"], display: "swap" });

/* ───────────── API ───────────── */
const API_BASE = "http://localhost:3001";
const API_PESANAN = `${API_BASE}/api/pesanan`;
const API_EVENTS = `${API_BASE}/api/events`;

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
type Status = "Menunggu" | "Lunas" | "Gagal" | "Kedaluwarsa" | "Refund";

// Item di daftar: GET /api/pesanan
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

// Detail: GET /api/pesanan/:id
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
type Filters = { event: string; status: string; q: string };

// Aksi inline yang sedang menunggu konfirmasi di baris tabel
type RowAction = { id: number; kind: "reject" } | null;

const STATUSES: Status[] = ["Menunggu", "Lunas", "Gagal", "Kedaluwarsa", "Refund"];
const STATUS_COLOR: Record<string, string> = {
  Menunggu: "#3B82C4",
  Lunas: "#16A34A",
  Gagal: "#DC4C4C",
  Kedaluwarsa: "#8A94A3",
  Refund: "#7C5CC4",
};
const PAGE_SIZE = 10;
const ALL = "Semua";
const NO_FILTER: Filters = { event: ALL, status: ALL, q: "" };

/* ───────────── Helpers ───────────── */
const nf = new Intl.NumberFormat("id-ID");
const rupiah = (n: number) => `Rp ${nf.format(n)}`;
const errMsg = (e: unknown) => (e instanceof Error ? e.message : "Terjadi kesalahan.");

/* Status konfirmasi pesanan oleh admin */
const isAccepted = (o: { statusPesanan: string }) => o.statusPesanan?.toLowerCase() === "diterima";
const isRejected = (o: { statusPesanan: string }) => o.statusPesanan?.toLowerCase() === "ditolak";
const isIncoming = (o: { statusPesanan: string; statusKode: string }) =>
  o.statusKode === "pending" && !isAccepted(o) && !isRejected(o);

/* Respons /api/events bisa berupa array langsung atau dibungkus { data | events | rows } */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const pickList = (r: any): any[] =>
  Array.isArray(r) ? r : r?.data ?? r?.events ?? r?.rows ?? r?.result ?? [];
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const eventTitle = (e: any): string =>
  e.title ?? e.name ?? e.nama ?? e.judul ?? e.event_name ?? e.event_title ?? `Event #${e.id}`;

/* ───────────── Ikon ───────────── */
function Icon({ children, size = 18 }: { children: ReactNode; size?: number }) {
  return (
    <svg className="icon" width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
      {children}
    </svg>
  );
}
const IEye = () => <Icon size={18}><path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12Z" /><circle cx="12" cy="12" r="3" /></Icon>;
const IClose = () => <Icon><path d="M6 6l12 12M18 6 6 18" /></Icon>;
const IPrev = () => <Icon size={14}><path d="m15 5-7 7 7 7" /></Icon>;
const INext = () => <Icon size={14}><path d="m9 5 7 7-7 7" /></Icon>;
const ICheck = () => <Icon size={16}><path d="m5 12.5 4.5 4.5L19 7.5" /></Icon>;
const ICheckSm = () => <Icon size={14}><path d="m5 12.5 4.5 4.5L19 7.5" /></Icon>;
const IXSm = () => <Icon size={14}><path d="M6 6l12 12M18 6 6 18" /></Icon>;
const IFilter = () => <Icon size={16}><path d="M4 6h16M7 12h10M10 18h4" /></Icon>;
const IExpand = () => <Icon size={16}><path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5" /></Icon>;
const IBell = () => <Icon size={16}><path d="M6 9a6 6 0 1 1 12 0c0 6 2 7 2 7H4s2-1 2-7ZM10 20a2 2 0 0 0 4 0" /></Icon>;
const IReceipt = () => <Icon size={30}><path d="M6 3h12v18l-3-2-3 2-3-2-3 2V3ZM9 8h6M9 12h6" /></Icon>;
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

/* Pill konfirmasi pesanan: Perlu konfirmasi / Diterima / Ditolak */
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

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="kv">
      <dt>{label}</dt>
      <dd>{children}</dd>
    </div>
  );
}

/* ───────────── Modal detail + terima / tolak ───────────── */
function OrderModal({
  order,
  saving,
  onClose,
  onConfirm,
}: {
  order: OrderDetail;
  saving: boolean;
  onClose: () => void;
  onConfirm: (aksi: "terima" | "tolak") => void;
}) {
  const [zoom, setZoom] = useState(false);
  const [rejecting, setRejecting] = useState(false);

  const proof = order.pembayaran.find((p) => p.buktiBayar)?.buktiBayar ?? null;
  const pending = order.statusKode === "pending";
  const incoming = isIncoming(order);
  const rejected = isRejected(order);
  const events = [...new Set(order.item.map((i) => i.event))].join(", ");

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      if (zoom) setZoom(false);
      else onClose();
    };
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [zoom, onClose]);

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
              <Row label="Metode Bayar">{order.metode}</Row>
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

        {/* Pesanan baru */}
        {incoming && !rejecting && (
          <div className="reject-box">
            <p className="info">
              Pesanan ini baru masuk. Klik <strong>Terima</strong> untuk menerima pesanan, status
              pembayaran akan otomatis menjadi <strong>Lunas</strong>. Klik <strong>Tolak</strong> jika
              tidak dapat diproses.
            </p>
          </div>
        )}

        {incoming && rejecting && (
          <div className="reject-box">
            <p className="alert">
              Pesanan akan <strong>Ditolak</strong>, tiket dibatalkan, dan kursi dilepas.
              Pemesan akan menerima notifikasi.
            </p>
          </div>
        )}

        {rejected && (
          <div className="reject-box">
            <p className="alert">Pesanan ini sudah ditolak dan tidak dapat diubah lagi.</p>
          </div>
        )}

        <footer className="modal-foot">
          {incoming ? (
            rejecting ? (
              <>
                <button className="btn-ghost" onClick={() => setRejecting(false)} disabled={saving}>Kembali</button>
                <button className="btn-danger" onClick={() => onConfirm("tolak")} disabled={saving}>
                  {saving ? "Memproses…" : "Konfirmasi Tolak"}
                </button>
              </>
            ) : (
              <>
                <button className="btn-ghost" onClick={onClose}>Tutup</button>
                <button className="btn-outline-danger" onClick={() => setRejecting(true)} disabled={saving}>Tolak</button>
                <button className="btn-primary" onClick={() => onConfirm("terima")} disabled={saving}>
                  <ICheck /> {saving ? "Memproses…" : "Terima Pesanan"}
                </button>
              </>
            )
          ) : (
            <button className="btn-ghost" onClick={onClose}>Tutup</button>
          )}
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

/* ───────────── Halaman ───────────── */
export default function OrdersPage() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [events, setEvents] = useState<EventOpt[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [opening, setOpening] = useState(false);
  const [draft, setDraft] = useState<Filters>(NO_FILTER);
  const [applied, setApplied] = useState<Filters>(NO_FILTER);
  const [page, setPage] = useState(1);
  const [detail, setDetail] = useState<OrderDetail | null>(null);
  const [rowAction, setRowAction] = useState<RowAction>(null);
  const [tick, setTick] = useState(0); // naikkan untuk refetch daftar
  const [toast, setToast] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  function showToast(msg: string) {
    setToast(msg);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setToast(null), 3500);
  }

  /* Daftar event untuk dropdown filter */
  useEffect(() => {
    api<unknown>(API_EVENTS)
      .then((r) => {
        const list = pickList(r);
        if (list.length === 0) console.warn("Daftar event kosong. Respons /api/events:", r);
        setEvents(
          list
            .filter((e) => e && e.id != null)
            .map((e) => ({ id: Number(e.id), title: eventTitle(e) }))
            .sort((a, b) => a.title.localeCompare(b.title, "id")),
        );
      })
      .catch((e) => {
        console.error("Gagal memuat event:", e);
        showToast(`Daftar event gagal dimuat: ${errMsg(e)}`);
      });
  }, []);

  /* Daftar pesanan: filter & urutan dikerjakan server */
  useEffect(() => {
    let alive = true;
    setLoading(true);
    const qs = new URLSearchParams();
    if (applied.event !== ALL) qs.set("event", applied.event);
    if (applied.status !== ALL) qs.set("status", applied.status);
    if (applied.q.trim()) qs.set("q", applied.q.trim());

    api<Order[]>(`${API_PESANAN}?${qs}`)
      .then((d) => alive && setOrders(d))
      .catch((e) => alive && showToast(errMsg(e)))
      .finally(() => alive && setLoading(false));

    return () => {
      alive = false;
    };
  }, [applied, tick]);

  const pageCount = Math.max(1, Math.ceil(orders.length / PAGE_SIZE));
  const safePage = Math.min(page, pageCount);
  const start = (safePage - 1) * PAGE_SIZE;
  const rows = orders.slice(start, start + PAGE_SIZE);
  const isFiltered = applied.event !== ALL || applied.status !== ALL || applied.q.trim() !== "";
  const incomingCount = orders.filter(isIncoming).length;

  function applyFilters() {
    setApplied({ ...draft }); // objek baru supaya klik ulang tetap refetch
    setPage(1);
  }
  function resetFilters() {
    setDraft(NO_FILTER);
    setApplied(NO_FILTER);
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

  /*
   * Terima / tolak pesanan baru (dari tabel atau dari modal).
   * Saat "terima": pesanan langsung diterima, lalu status otomatis diubah ke Lunas.
   */
  async function confirmOrder(id: number, aksi: "terima" | "tolak") {
    setSaving(true);
    try {
      await api(`${API_PESANAN}/${id}/konfirmasi`, {
        method: "PATCH",
        body: JSON.stringify({ aksi }),
      });

      if (aksi === "terima") {
        try {
          await api(`${API_PESANAN}/${id}/status`, {
            method: "PATCH",
            body: JSON.stringify({ status: "Lunas" satisfies Status }),
          });
          showToast("Pesanan diterima dan otomatis berstatus Lunas.");
        } catch (e) {
          showToast(`Pesanan diterima, tetapi status Lunas gagal diset: ${errMsg(e)}`);
        }
      } else {
        showToast("Pesanan ditolak.");
      }

      setRowAction(null);
      setDetail(null);
      setTick((t) => t + 1); // ambil ulang daftar dari server
    } catch (e) {
      showToast(errMsg(e)); // mis. 409: sudah diproses
    } finally {
      setSaving(false);
    }
  }

  /* Tombol aksi langsung di baris tabel */
  function renderRowActions(o: Order): ReactNode {
    // Hanya pesanan baru yang punya aksi Terima / Tolak
    if (!isIncoming(o)) return null;

    const act = rowAction && rowAction.id === o.id ? rowAction : null;

    if (act?.kind === "reject") {
      return (
        <>
          <span className="muted small">Yakin tolak?</span>
          <button className="btn-danger btn-sm" onClick={() => confirmOrder(o.id, "tolak")} disabled={saving}>
            {saving ? "…" : "Ya, Tolak"}
          </button>
          <button className="btn-ghost btn-sm" onClick={() => setRowAction(null)} disabled={saving}>Batal</button>
        </>
      );
    }

    return (
      <>
        <button className="btn-outline-danger btn-sm" onClick={() => setRowAction({ id: o.id, kind: "reject" })} disabled={saving}>
          <IXSm /> Tolak
        </button>
        <button className="btn-primary btn-sm" onClick={() => confirmOrder(o.id, "terima")} disabled={saving}>
          <ICheckSm /> {saving ? "…" : "Terima"}
        </button>
      </>
    );
  }

  return (
    <main className={`page ${inter.className}`}>
      <style>{css}</style>

      <div className="wrap">
        {/* Header */}
        <header className="head">
          <div>
            <nav className="crumb" aria-label="Breadcrumb">
              <span>Dashboard</span><span aria-hidden="true">/</span><strong>Pesanan</strong>
            </nav>
            <h1>Daftar Pesanan Masuk</h1>
            <p className="sub">Terima atau tolak pesanan baru. Pesanan yang diterima otomatis berstatus Lunas.</p>
          </div>
          {!loading && incomingCount > 0 && (
            <div className="banner" role="status">
              <IBell />
              <span><strong>{nf.format(incomingCount)}</strong> pesanan menunggu konfirmasi</span>
            </div>
          )}
        </header>

        {/* Filter */}
        <section className="card filters" aria-label="Filter pesanan">
          <div className="f-field">
            <label htmlFor="f-q">Cari</label>
            <input
              id="f-q"
              type="search"
              placeholder="Invoice, nama, atau email"
              value={draft.q}
              onChange={(e) => setDraft({ ...draft, q: e.target.value })}
              onKeyDown={(e) => e.key === "Enter" && applyFilters()}
            />
          </div>
          <div className="f-field">
            <label htmlFor="f-event">Event</label>
            <select id="f-event" value={draft.event} onChange={(e) => setDraft({ ...draft, event: e.target.value })}>
              <option value={ALL}>Semua Event</option>
              {events.map((ev) => (
                <option key={ev.id} value={String(ev.id)}>{ev.title}</option>
              ))}
              {events.length === 0 && <option disabled>Daftar event tidak tersedia</option>}
            </select>
          </div>
          <div className="f-field">
            <label htmlFor="f-status">Status Bayar</label>
            <select id="f-status" value={draft.status} onChange={(e) => setDraft({ ...draft, status: e.target.value })}>
              <option value={ALL}>Semua Status</option>
              {STATUSES.map((s) => <option key={s}>{s}</option>)}
            </select>
          </div>
          <div className="f-actions">
            {isFiltered && <button className="btn-text" onClick={resetFilters}>Reset</button>}
            <button className="btn-primary" onClick={applyFilters}><IFilter /> Terapkan</button>
          </div>
        </section>

        {/* Tabel pesanan */}
        <section className="card list" aria-busy={loading}>
          {loading ? (
            <p className="loading muted">Memuat pesanan…</p>
          ) : rows.length > 0 ? (
            <>
              <div className="table-wrap">
                <table>
                  <colgroup>
                    <col style={{ width: "15%" }} />
                    <col style={{ width: "20%" }} />
                    <col style={{ width: "20%" }} />
                    <col style={{ width: "12%" }} />
                    <col style={{ width: "15%" }} />
                    <col style={{ width: "18%" }} />
                  </colgroup>
                  <thead>
                    <tr>
                      <th>Pesanan</th>
                      <th>Pemesan</th>
                      <th>Event</th>
                      <th className="right">Total</th>
                      <th>Status</th>
                      <th className="right">Aksi</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((o) => (
                      <tr key={o.id} className={isIncoming(o) ? "incoming" : undefined}>
                        <td>
                          <button className="invoice" onClick={() => openOrder(o.id)}>#{o.invoice}</button>
                          <p className="muted small mt">{o.tanggal}</p>
                        </td>
                        <td>
                          <p className="name ellipsis" title={o.pemesan}>{o.pemesan}</p>
                          <p className="muted small ellipsis mt" title={o.email}>{o.email}</p>
                        </td>
                        <td>
                          <p className="ev ellipsis" title={o.event}>{o.event}</p>
                          <p className="muted small mt">{o.kategori}</p>
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
                        <td>
                          <div className="row-actions">
                            {renderRowActions(o)}
                            <button
                              className="icon-btn"
                              onClick={() => openOrder(o.id)}
                              aria-label={`Lihat detail dan bukti bayar ${o.invoice}`}
                              title="Lihat detail & bukti bayar"
                            >
                              <IEye />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <footer className="foot">
                <span>
                  Menampilkan {start + 1}–{start + rows.length} dari {nf.format(orders.length)} pesanan
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
                  <p>Tidak ada pesanan yang cocok dengan filter yang dipilih.</p>
                  <button className="btn-ghost" onClick={resetFilters}>Reset filter</button>
                </>
              ) : (
                <>
                  <h3>Belum ada pesanan masuk</h3>
                  <p>Pesanan dari pemesan akan muncul di sini setelah mereka checkout.</p>
                </>
              )}
            </div>
          )}
        </section>
      </div>

      {detail && (
        <OrderModal
          key={`${detail.id}-${detail.statusPesanan}-${detail.statusKode}`}
          order={detail}
          saving={saving}
          onClose={() => setDetail(null)}
          onConfirm={(aksi) => confirmOrder(detail.id, aksi)}
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
  --warn: #B26F00; --warn-soft: #FFF3DC;
  --field: #FFFFFF; --overlay: rgba(23,32,42,.5);
  --shadow: 0 1px 2px rgba(23,32,42,.04), 0 6px 20px rgba(23,32,42,.05);
}
:root[data-theme="dark"] {
  --bg: #121316; --card: #1B1C20; --ink: #F1EEEA; --muted: #9CA3AE; --line: #2E3037;
  --soft: #24262B; --hover: #212328;
  --accent: #8EC1EC; --accent-hover: #A8D1F2; --accent-ink: #10202D; --accent-soft: #1F3547;
  --danger: #EE7A70; --danger-hover: #F39A92; --danger-soft: #3A2220;
  --warn: #F2B34D; --warn-soft: #3A2D14;
  --field: #14151A; --overlay: rgba(0,0,0,.65);
  --shadow: 0 1px 2px rgba(0,0,0,.3), 0 6px 20px rgba(0,0,0,.3);
}
* { box-sizing: border-box; margin: 0; padding: 0; }
html, body { background: var(--bg); color: var(--ink); -webkit-font-smoothing: antialiased; }
button { font: inherit; color: inherit; }

.page { min-height: 100vh; }
.wrap { max-width: 1240px; margin: 0 auto; padding: 32px 24px 64px; display: flex; flex-direction: column; gap: 20px; }

.card { background: var(--card); border: 1px solid var(--line); border-radius: 14px; box-shadow: var(--shadow); }
.icon { fill: none; stroke: currentColor; stroke-width: 1.7; stroke-linecap: round; stroke-linejoin: round; flex-shrink: 0; }

/* header */
.head { display: flex; justify-content: space-between; align-items: flex-end; gap: 16px; flex-wrap: wrap; }
.crumb { display: flex; gap: 8px; font-size: 12px; color: var(--muted); margin-bottom: 10px; }
.crumb strong { color: var(--accent); font-weight: 600; }
h1 { font-size: 28px; font-weight: 700; letter-spacing: -0.025em; line-height: 1.15; }
h2 { font-size: 17px; font-weight: 650; letter-spacing: -0.01em; }
h3 { font-size: 16px; font-weight: 650; }
.sub { font-size: 13.5px; color: var(--muted); margin-top: 6px; line-height: 1.5; }
.muted { color: var(--muted); }
.small { font-size: 12px; }
.nowrap { white-space: nowrap; }
.center { text-align: center; }
.mt { margin-top: 3px; }
.ellipsis { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

/* banner pesanan baru */
.banner { display: inline-flex; align-items: center; gap: 8px; padding: 9px 14px; border-radius: 999px; font-size: 13px; background: var(--warn-soft); color: var(--warn); border: 1px solid color-mix(in srgb, var(--warn) 30%, transparent); }

/* buttons */
.btn-primary, .btn-ghost, .btn-danger, .btn-outline-danger { display: inline-flex; align-items: center; justify-content: center; gap: 8px; height: 40px; padding: 0 18px; font-size: 13.5px; font-weight: 600; border-radius: 10px; cursor: pointer; border: 1px solid transparent; transition: background .15s, border-color .15s; white-space: nowrap; }
.btn-sm { height: 32px; padding: 0 12px; font-size: 12.5px; gap: 6px; border-radius: 8px; }
.btn-primary { background: var(--accent); color: var(--accent-ink); box-shadow: 0 1px 2px rgba(47,93,128,.3); }
.btn-primary:hover { background: var(--accent-hover); }
.btn-ghost { background: var(--card); border-color: var(--line); }
.btn-ghost:hover { background: var(--hover); border-color: var(--muted); }
.btn-danger { background: var(--danger); color: #fff; }
.btn-danger:hover { background: var(--danger-hover); }
.btn-outline-danger { background: var(--card); color: var(--danger); border-color: color-mix(in srgb, var(--danger) 45%, var(--line)); }
.btn-outline-danger:hover { background: var(--danger-soft); border-color: var(--danger); }
.btn-text { background: none; border: 0; color: var(--muted); font-size: 13px; font-weight: 600; cursor: pointer; padding: 8px 6px; }
.btn-text:hover { color: var(--ink); }
button:focus-visible, select:focus-visible, textarea:focus-visible, input:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
button:disabled { opacity: .4; cursor: not-allowed; }

/* filter */
.filters { display: grid; grid-template-columns: 1.5fr 1fr 1fr auto; align-items: end; gap: 14px; padding: 16px 20px; }
.f-field { display: flex; flex-direction: column; gap: 6px; min-width: 0; }
.f-field label { font-size: 12px; font-weight: 600; color: var(--muted); }
.f-actions { display: flex; align-items: center; gap: 6px; }
select, input[type="search"] { height: 40px; width: 100%; padding: 0 12px; font: inherit; font-size: 13.5px; color: var(--ink); border: 1px solid var(--line); background-color: var(--field); border-radius: 10px; }
input[type="search"]::placeholder { color: var(--muted); opacity: .8; }
select { padding-right: 34px; cursor: pointer; appearance: none; background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%236A7380' stroke-width='2.5' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E"); background-repeat: no-repeat; background-position: right 12px center; text-overflow: ellipsis; }
select:focus, input[type="search"]:focus { border-color: var(--accent); box-shadow: 0 0 0 3px var(--accent-soft); outline: 0; }
select:disabled { opacity: .5; cursor: not-allowed; }

/* table */
.list { overflow: hidden; }
.loading { padding: 56px 24px; text-align: center; font-size: 13.5px; }
.table-wrap { overflow-x: auto; }
table { width: 100%; border-collapse: collapse; table-layout: fixed; min-width: 900px; font-size: 13.5px; }
th { text-align: left; font-size: 11.5px; font-weight: 600; letter-spacing: .04em; text-transform: uppercase; color: var(--muted); padding: 12px 16px; background: var(--soft); white-space: nowrap; }
th:first-child, td:first-child { padding-left: 20px; }
th:last-child, td:last-child { padding-right: 16px; }
td { padding: 14px 16px; border-bottom: 1px solid var(--line); vertical-align: middle; }
tbody tr { transition: background .12s; }
tbody tr:hover { background: var(--hover); }
tbody tr.incoming { background: color-mix(in srgb, var(--warn-soft) 55%, transparent); }
tbody tr:last-child td { border-bottom: 0; }
.right { text-align: right; }
.num { font-variant-numeric: tabular-nums; }
.name { font-weight: 600; }
.ev { font-weight: 500; }
.total { font-weight: 700; white-space: nowrap; }
.invoice { background: none; border: 0; padding: 0; color: var(--accent); font-weight: 700; font-size: 13.5px; cursor: pointer; text-align: left; }
.invoice:hover { text-decoration: underline; }
.pills { display: flex; flex-direction: column; align-items: flex-start; gap: 5px; }
.row-actions { display: flex; align-items: center; justify-content: flex-end; flex-wrap: wrap; gap: 6px; }

.pill { display: inline-flex; align-items: center; gap: 6px; font-size: 12px; font-weight: 600; padding: 3px 10px; border-radius: 999px; white-space: nowrap; background: color-mix(in srgb, var(--c) 14%, transparent); color: color-mix(in srgb, var(--c) 78%, var(--ink)); }
.pill i { width: 6px; height: 6px; border-radius: 50%; background: var(--c); }

.icon-btn { width: 34px; height: 34px; display: grid; place-items: center; background: transparent; border: 0; border-radius: 8px; color: var(--muted); cursor: pointer; transition: background .15s, color .15s; flex-shrink: 0; }
.icon-btn:hover { background: var(--accent-soft); color: var(--accent); }

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
.modal { width: 100%; max-width: 480px; max-height: calc(100vh - 32px); display: flex; flex-direction: column; background: var(--card); border: 1px solid var(--line); border-radius: 16px; box-shadow: 0 24px 64px rgba(0,0,0,.28); overflow: hidden; animation: pop .18s ease; }
.modal.wide { max-width: 820px; }
.modal-head { display: flex; justify-content: space-between; align-items: flex-start; gap: 12px; padding: 20px 24px 16px; border-bottom: 1px solid var(--line); }
.head-right { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; justify-content: flex-end; }
.modal-body { padding: 22px 24px; overflow-y: auto; }
.modal-body.split { display: grid; grid-template-columns: 1.1fr 1fr; gap: 28px; }
.modal-foot { display: flex; justify-content: flex-end; gap: 10px; padding: 16px 24px; border-top: 1px solid var(--line); background: var(--soft); flex-wrap: wrap; }
.section-title { font-size: 12px; font-weight: 700; letter-spacing: .06em; text-transform: uppercase; color: var(--muted); margin-bottom: 14px; }

.kvs { display: flex; flex-direction: column; }
.kv { display: grid; grid-template-columns: 120px 1fr; gap: 12px; padding: 11px 0; border-bottom: 1px solid var(--line); font-size: 13.5px; }
.kv:last-child { border-bottom: 0; }
.kv dt { color: var(--muted); }
.kv dd { display: flex; flex-direction: column; gap: 2px; }
.alert { font-size: 12.5px; line-height: 1.5; padding: 10px 12px; border-radius: 10px; background: var(--danger-soft); color: var(--danger); }
.info { font-size: 12.5px; line-height: 1.5; padding: 10px 12px; border-radius: 10px; background: var(--warn-soft); color: var(--warn); }

.proof { position: relative; display: block; width: 100%; padding: 0; background: var(--soft); border: 1px solid var(--line); border-radius: 12px; overflow: hidden; cursor: zoom-in; }
.proof img { display: block; width: 100%; max-height: 380px; object-fit: contain; }
.proof-zoom { position: absolute; right: 10px; bottom: 10px; display: inline-flex; align-items: center; gap: 6px; font-size: 12px; font-weight: 600; padding: 6px 10px; border-radius: 8px; background: rgba(23,32,42,.78); color: #fff; opacity: 0; transition: opacity .15s; }
.proof:hover .proof-zoom, .proof:focus-visible .proof-zoom { opacity: 1; }
.proof.none { cursor: default; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 10px; min-height: 240px; border-style: dashed; color: var(--muted); font-size: 13px; text-align: center; padding: 24px; }
.hint { font-size: 12px; color: var(--muted); margin-top: 10px; line-height: 1.5; }

.reject-box { padding: 14px 24px; display: flex; flex-direction: column; gap: 8px; border-top: 1px solid var(--line); }

.lightbox { position: fixed; inset: 0; z-index: 70; background: rgba(8,10,14,.88); display: grid; place-items: center; padding: 24px; cursor: zoom-out; animation: fade .15s ease; }
.lightbox img { max-width: min(92vw, 520px); max-height: 90vh; border-radius: 10px; background: #fff; cursor: default; }
.lb-close { position: absolute; top: 16px; right: 16px; width: 40px; height: 40px; display: grid; place-items: center; border: 0; border-radius: 50%; background: rgba(255,255,255,.14); color: #fff; cursor: pointer; }
.lb-close:hover { background: rgba(255,255,255,.26); }

.toast { position: fixed; left: 50%; bottom: 28px; transform: translateX(-50%); z-index: 80; display: flex; align-items: center; gap: 8px; background: var(--ink); color: var(--bg); font-size: 13.5px; font-weight: 500; padding: 11px 18px; border-radius: 12px; box-shadow: 0 10px 30px rgba(0,0,0,.25); animation: fade .2s ease; max-width: calc(100vw - 32px); }

@keyframes fade { from { opacity: 0 } to { opacity: 1 } }
@keyframes pop { from { opacity: 0; transform: translateY(8px) scale(.98) } to { opacity: 1; transform: none } }

@media (max-width: 960px) {
  .filters { grid-template-columns: 1fr 1fr; }
  .f-field:first-child { grid-column: 1 / -1; }
  .f-actions { grid-column: 1 / -1; justify-content: flex-end; }
}
@media (max-width: 760px) {
  .modal-body.split { grid-template-columns: 1fr; gap: 24px; }
}
@media (max-width: 560px) {
  .wrap { padding: 20px 16px 48px; }
  h1 { font-size: 24px; }
  .filters { grid-template-columns: 1fr; }
  .f-actions .btn-primary { flex: 1; }
  .kv { grid-template-columns: 100px 1fr; }
}
@media (prefers-reduced-motion: reduce) { * { transition: none !important; animation: none !important; } }
`;