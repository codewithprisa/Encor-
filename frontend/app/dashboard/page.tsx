"use client";

import { useState, type ReactNode } from "react";
import { Inter } from "next/font/google";
import { useDashboard, type Status } from "./useDashboard";

const inter = Inter({ subsets: ["latin"], display: "swap" });

/* ───────────── Konstanta ───────────── */
const BRAND = "Encoré"; // tampil di header PDF, ganti sesuai nama aplikasi
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agu", "Sep", "Okt", "Nov", "Des"];
const MONTH_NAMES = ["Januari", "Februari", "Maret", "April", "Mei", "Juni", "Juli", "Agustus", "September", "Oktober", "November", "Desember"];

// "2026-10" → "Oktober 2026"
function monthLabel(ym: string) {
  const [y, m] = ym.split("-");
  return `${MONTH_NAMES[Number(m) - 1]} ${y}`;
}

const STATUS_CLASS: Record<Status, string> = {
  Terjadwal: "d-pill d-pill-blue",
  "Hampir Habis": "d-pill d-pill-orange",
  Selesai: "d-pill d-pill-green",
};

/* ───────────── Helpers ───────────── */
const nf = new Intl.NumberFormat("id-ID");
function rupiah(n: number) {
  if (n >= 1e9) return `Rp ${(n / 1e9).toFixed(1).replace(".", ",")} M`;
  if (n >= 1e6) return `Rp ${(n / 1e6).toFixed(1).replace(".", ",")} Jt`;
  return `Rp ${nf.format(n)}`;
}

// "+12%" / "-5%" / "" (kalau bulan sebelumnya kosong)
function pctChange(cur: number, prev: number) {
  return prev > 0 ? `${cur >= prev ? "+" : ""}${Math.round((cur / prev - 1) * 100)}%` : "";
}

function Icon({ children }: { children: ReactNode }) {
  return (
    <svg className="d-icon" viewBox="0 0 24 24" aria-hidden="true">
      {children}
    </svg>
  );
}

/* Batas atas sumbu Y yang "rapi" dan habis dibagi 4 (ada 4 garis bantu) */
function niceMax(v: number) {
  if (v <= 0) return 4;
  const raw = v / 4;
  const pow = Math.pow(10, Math.floor(Math.log10(raw)));
  const n = raw / pow;
  const nice = n <= 1 ? 1 : n <= 2 ? 2 : n <= 2.5 ? 2.5 : n <= 5 ? 5 : 10;
  return Math.max(1, nice * pow) * 4;
}

/* ───────────── Ekspor PDF ─────────────
   Butuh:  npm i jspdf jspdf-autotable
   Library dimuat hanya saat tombol diklik (dynamic import), jadi aman untuk SSR
   dan tidak membebani bundle awal. */
// @pdf-begin
type RGB = [number, number, number];

const C = {
  navy: [47, 93, 128] as RGB,
  sky: [142, 193, 236] as RGB,
  sand: [245, 227, 195] as RGB,
  tint: [230, 238, 245] as RGB,
  cream: [255, 251, 248] as RGB,
  ink: [26, 26, 26] as RGB,
  muted: [107, 107, 107] as RGB,
  line: [239, 228, 220] as RGB,
  track: [246, 234, 223] as RGB,
  white: [255, 255, 255] as RGB,
  soft: [214, 233, 251] as RGB,
  up: [31, 107, 54] as RGB,
  down: [196, 55, 45] as RGB,
};

type ReportInput = {
  month: string; // "2026-10"
  tickets: number[]; // tiket terjual per hari
  revenue: number[]; // pendapatan per hari (Rp)
  prevTickets: number; // total tiket bulan sebelumnya
  prevRevenue: number; // total pendapatan bulan sebelumnya
};

async function buildSalesPdf({ month, tickets, revenue, prevTickets, prevRevenue }: ReportInput) {
  const [{ jsPDF }, { default: autoTable }] = await Promise.all([import("jspdf"), import("jspdf-autotable")]);

  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const PW = 210, PH = 297, M = 14, CW = PW - M * 2;

  const [yy, mm] = month.split("-").map(Number);
  const monthShort = MONTHS[mm - 1];
  const periode = monthLabel(month);
  const n = tickets.length;
  const sumT = tickets.reduce((a, b) => a + b, 0);
  const sumR = revenue.reduce((a, b) => a + b, 0);
  const maxT = n ? Math.max(...tickets) : 0;
  const peak = maxT > 0 ? tickets.indexOf(maxT) : -1;
  const avgT = n ? Math.round(sumT / n) : 0;

  const fill = (c: RGB) => doc.setFillColor(c[0], c[1], c[2]);
  const stroke = (c: RGB) => doc.setDrawColor(c[0], c[1], c[2]);
  const ink = (c: RGB) => doc.setTextColor(c[0], c[1], c[2]);
  const font = (style: "normal" | "bold", size: number) => {
    doc.setFont("helvetica", style);
    doc.setFontSize(size);
  };

  /* ── Header ── */
  fill(C.navy);
  doc.rect(0, 0, PW, 34, "F");
  fill(C.sky);
  doc.rect(0, 34, PW, 1.2, "F");
  font("bold", 19);
  ink(C.white);
  doc.text("Laporan Penjualan Tiket", M, 17);
  font("normal", 10);
  ink(C.soft);
  doc.text(`Periode ${periode}`, M, 25);
  font("bold", 11);
  ink(C.white);
  doc.text(BRAND, PW - M, 17, { align: "right" });
  font("normal", 8);
  ink(C.soft);
  doc.text("Dashboard Admin", PW - M, 22.5, { align: "right" });

  /* ── Kartu ringkasan ── */
  const dT = pctChange(sumT, prevTickets);
  const dR = pctChange(sumR, prevRevenue);
  const tone = (d: string): RGB => (d.startsWith("-") ? C.down : C.up);
  const cards: { label: string; value: string; sub: string; subColor: RGB }[] = [
    { label: "TOTAL TIKET", value: nf.format(sumT), sub: dT ? `${dT} vs bulan lalu` : "", subColor: tone(dT) },
    { label: "TOTAL PENDAPATAN", value: `Rp ${nf.format(sumR)}`, sub: dR ? `${dR} vs bulan lalu` : "", subColor: tone(dR) },
    { label: "RATA-RATA / HARI", value: `${nf.format(avgT)} tiket`, sub: `dalam ${n} hari`, subColor: C.muted },
    {
      label: "HARI PUNCAK",
      value: peak >= 0 ? `${peak + 1} ${monthShort}` : "-",
      sub: peak >= 0 ? `${nf.format(maxT)} tiket` : "Belum ada penjualan",
      subColor: C.muted,
    },
  ];
  const gap = 4;
  const cw = (CW - gap * 3) / 4;
  const cy = 43;
  const ch = 23;
  cards.forEach((c, i) => {
    const x = M + i * (cw + gap);
    fill(C.white);
    stroke(C.line);
    doc.setLineWidth(0.25);
    doc.roundedRect(x, cy, cw, ch, 1.5, 1.5, "FD");
    fill(C.navy);
    doc.rect(x + 4, cy + 3.4, 5, 0.7, "F");
    font("bold", 6.3);
    ink(C.muted);
    doc.text(c.label, x + 4, cy + 8.2);
    let fs = 12.5;
    font("bold", fs);
    while (doc.getTextWidth(c.value) > cw - 8 && fs > 7) {
      fs -= 0.5;
      doc.setFontSize(fs);
    }
    ink(C.ink);
    doc.text(c.value, x + 4, cy + 15.2);
    if (c.sub) {
      font("normal", 6.6);
      ink(c.subColor);
      doc.text(c.sub, x + 4, cy + 19.8);
    }
  });

  /* ── Grafik (vektor, tajam di cetak maupun zoom) ── */
  const T = 71;
  const CH = 96;
  fill(C.white);
  stroke(C.line);
  doc.setLineWidth(0.25);
  doc.roundedRect(M, T, CW, CH, 1.5, 1.5, "FD");

  font("bold", 9.5);
  ink(C.ink);
  doc.text("Grafik Penjualan Tiket per Hari", M + 5, T + 7.5);
  font("normal", 7);
  ink(C.muted);
  const legend = "Tiket terjual per hari";
  const lw0 = doc.getTextWidth(legend);
  doc.text(legend, M + CW - 5, T + 7.3, { align: "right" });
  fill(C.navy);
  doc.circle(M + CW - 5 - lw0 - 2.6, T + 6.6, 0.9, "F");

  const px0 = M + 17;
  const px1 = M + CW - 6;
  const py0 = T + 20;
  const py1 = T + 82;
  const max = niceMax(maxT);
  const x = (i: number) => (n > 1 ? px0 + (i * (px1 - px0)) / (n - 1) : px0);
  const y = (v: number) => py1 - (v / max) * (py1 - py0);

  if (n > 0) {
    // area (kurva mulus, sama dengan grafik di layar)
    const curves = tickets.slice(0, -1).map((_, i) => {
      const cx = (x(i) + x(i + 1)) / 2;
      const dy = y(tickets[i + 1]) - y(tickets[i]);
      return [cx - x(i), 0, cx - x(i), dy, x(i + 1) - x(i), dy];
    });
    fill(C.tint);
    doc.lines([[0, y(tickets[0]) - py1], ...curves, [0, py1 - y(tickets[n - 1])]], x(0), py1, [1, 1], "F", true);

    // garis bantu + label sumbu Y
    stroke(C.line);
    doc.setLineWidth(0.2);
    font("normal", 6.5);
    ink(C.muted);
    [0, 0.25, 0.5, 0.75, 1].forEach((t) => {
      const gy = y(max * t);
      doc.setLineDashPattern(t === 0 ? [] : [0.8, 1.2], 0);
      doc.line(px0, gy, px1, gy);
      doc.setLineDashPattern([], 0);
      doc.text(nf.format(max * t), px0 - 2.5, gy + 0.9, { align: "right" });
    });

    // garis utama
    stroke(C.navy);
    doc.setLineWidth(0.7);
    doc.setLineJoin("round");
    doc.setLineCap("round");
    doc.lines(curves, x(0), y(tickets[0]), [1, 1], "S", false);

    // titik data
    fill(C.navy);
    tickets.forEach((v, i) => doc.circle(x(i), y(v), 0.55, "F"));

    // penanda puncak
    if (peak >= 0) {
      const ppx = x(peak);
      const ppy = y(maxT);
      const label = `${nf.format(maxT)} tiket`;
      font("bold", 6.8);
      const lw = doc.getTextWidth(label) + 5;
      const lx = Math.min(Math.max(ppx - lw / 2, px0), px1 - lw);
      fill(C.navy);
      doc.roundedRect(lx, ppy - 9.5, lw, 5, 1.2, 1.2, "F");
      ink(C.white);
      doc.text(label, lx + lw / 2, ppy - 6, { align: "center" });
      fill(C.white);
      stroke(C.navy);
      doc.setLineWidth(0.6);
      doc.circle(ppx, ppy, 1.5, "FD");
    }

    // label sumbu X
    font("normal", 6.5);
    ink(C.muted);
    tickets.forEach((_, i) => {
      if (i === 0 || (i + 1) % 5 === 0) doc.text(String(i + 1), x(i), py1 + 5, { align: "center" });
    });
    font("normal", 7);
    doc.text(`Tanggal (${periode})`, (px0 + px1) / 2, py1 + 10.5, { align: "center" });
  }

  /* ── Tabel rincian harian ── */
  const tableTitleY = T + CH + 9;
  font("bold", 10.5);
  ink(C.navy);
  doc.text("Rincian Penjualan Harian", M, tableTitleY);
  if (peak >= 0) {
    font("normal", 7);
    ink(C.muted);
    doc.text("Baris yang disorot = hari puncak", PW - M, tableTitleY, { align: "right" });
  }

  const weekday = (d: number) =>
    new Date(Date.UTC(yy, mm - 1, d)).toLocaleDateString("id-ID", { weekday: "long", timeZone: "UTC" });
  const body = tickets.map((v, i) => [
    `${weekday(i + 1)}, ${i + 1} ${monthShort} ${yy}`,
    nf.format(v),
    `Rp ${nf.format(revenue[i] ?? 0)}`,
    "",
  ]);

  autoTable(doc, {
    startY: tableTitleY + 3,
    margin: { left: M, right: M, top: 20, bottom: 20 },
    head: [
      [
        "Tanggal",
        { content: "Tiket Terjual", styles: { halign: "right" } },
        { content: "Pendapatan", styles: { halign: "right" } },
        "Proporsi",
      ],
    ],
    body,
    foot: [
      [
        "Total",
        { content: nf.format(sumT), styles: { halign: "right" } },
        { content: `Rp ${nf.format(sumR)}`, styles: { halign: "right" } },
        "",
      ],
    ],
    showFoot: "lastPage",
    theme: "striped",
    rowPageBreak: "avoid",
    styles: {
      font: "helvetica",
      fontSize: 8.5,
      textColor: C.ink,
      lineColor: C.line,
      cellPadding: { top: 2.1, bottom: 2.1, left: 3, right: 3 },
    },
    headStyles: { fillColor: C.navy, textColor: C.white, fontStyle: "bold", fontSize: 8 },
    footStyles: { fillColor: C.sand, textColor: C.navy, fontStyle: "bold", fontSize: 8.5 },
    alternateRowStyles: { fillColor: C.cream },
    columnStyles: {
      0: { cellWidth: 56 },
      1: { halign: "right", cellWidth: 32 },
      2: { halign: "right", cellWidth: 44 },
    },
    didParseCell: (d) => {
      if (d.section === "body" && d.row.index === peak) {
        d.cell.styles.fontStyle = "bold";
        d.cell.styles.textColor = C.navy;
        d.cell.styles.fillColor = C.tint;
      }
    },
    didDrawCell: (d) => {
      // batang proporsi di kolom terakhir
      if (d.section !== "body" || d.column.index !== 3) return;
      const v = tickets[d.row.index] ?? 0;
      const pad = 3;
      const bw = d.cell.width - pad * 2;
      const bh = 2.2;
      const by = d.cell.y + d.cell.height / 2 - bh / 2;
      fill(C.track);
      doc.roundedRect(d.cell.x + pad, by, bw, bh, 1.1, 1.1, "F");
      if (v > 0 && maxT > 0) {
        fill(C.navy);
        doc.roundedRect(d.cell.x + pad, by, Math.max((bw * v) / maxT, 2.2), bh, 1.1, 1.1, "F");
      }
    },
    didDrawPage: (d) => {
      if (d.pageNumber > 1) {
        font("bold", 8.5);
        ink(C.navy);
        doc.text("Laporan Penjualan Tiket", M, 11);
        font("normal", 8.5);
        ink(C.muted);
        doc.text(periode, PW - M, 11, { align: "right" });
        stroke(C.line);
        doc.setLineWidth(0.3);
        doc.line(M, 14, PW - M, 14);
      }
    },
  });

  /* ── Footer di semua halaman ── */
  const now = new Date();
  const printedDate = now.toLocaleDateString("id-ID", { day: "numeric", month: "long", year: "numeric", timeZone: "Asia/Jakarta" });
  const printedTime = now
    .toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Jakarta" })
    .replace(".", ":");
  const pages = doc.getNumberOfPages();
  for (let p = 1; p <= pages; p++) {
    doc.setPage(p);
    stroke(C.line);
    doc.setLineWidth(0.3);
    doc.line(M, PH - 14, PW - M, PH - 14);
    font("normal", 7.5);
    ink(C.muted);
    doc.text(`Dicetak ${printedDate}, ${printedTime} WIB`, M, PH - 9);
    doc.text(`Halaman ${p} dari ${pages}`, PW - M, PH - 9, { align: "right" });
  }

  doc.save(`laporan-penjualan-tiket-${month}.pdf`);
}
// @pdf-end

/* ───────────── Grafik penjualan (SVG, tanpa library) ───────────── */
function SalesChart({ data, monthName }: { data: number[]; monthName: string }) {
  const [hover, setHover] = useState<number | null>(null);
  const W = 640, H = 250;
  const P = { t: 16, r: 16, b: 30, l: 46 };
  const max = niceMax(Math.max(...data));
  const x = (i: number) => P.l + (i * (W - P.l - P.r)) / (data.length - 1);
  const y = (v: number) => P.t + (1 - v / max) * (H - P.t - P.b);

  let line = `M${x(0)},${y(data[0])}`;
  for (let i = 0; i < data.length - 1; i++) {
    const cx = (x(i) + x(i + 1)) / 2;
    line += ` C${cx},${y(data[i])} ${cx},${y(data[i + 1])} ${x(i + 1)},${y(data[i + 1])}`;
  }
  const area = `${line} L${x(data.length - 1)},${H - P.b} L${x(0)},${H - P.b} Z`;
  const step = (W - P.l - P.r) / (data.length - 1);

  return (
    <div className="d-chart">
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Grafik penjualan tiket per hari">
        <defs>
          <linearGradient id="d-area" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" style={{ stopColor: "var(--navy)" }} stopOpacity="0.22" />
            <stop offset="100%" style={{ stopColor: "var(--navy)" }} stopOpacity="0" />
          </linearGradient>
        </defs>

        {[0, 0.25, 0.5, 0.75, 1].map((t) => (
          <g key={t}>
            <line className="d-grid-line" x1={P.l} x2={W - P.r} y1={y(max * t)} y2={y(max * t)} strokeDasharray={t === 0 ? "0" : "3 4"} />
            <text x={P.l - 8} y={y(max * t) + 3} textAnchor="end" className="d-axis">
              {nf.format(max * t)}
            </text>
          </g>
        ))}

        <path d={area} fill="url(#d-area)" />
        <path d={line} className="d-line" fill="none" strokeWidth="2.5" strokeLinecap="round" />

        {data.map((v, i) => (
          <g key={i}>
            {(i === 0 || (i + 1) % 5 === 0) && (
              <text x={x(i)} y={H - 10} textAnchor="middle" className="d-axis">{i + 1}</text>
            )}
            {hover === i && (
              <>
                <line className="d-hover-line" x1={x(i)} x2={x(i)} y1={P.t} y2={H - P.b} strokeOpacity="0.25" />
                <circle className="d-dot" cx={x(i)} cy={y(v)} r="5" strokeWidth="2.5" />
              </>
            )}
            <rect
              x={x(i) - step / 2} y={0} width={step} height={H}
              fill="transparent"
              onMouseEnter={() => setHover(i)}
              onMouseLeave={() => setHover(null)}
              onTouchStart={() => setHover(i)}
            />
          </g>
        ))}
      </svg>

      {hover !== null && (
        <div
          className="d-tooltip"
          style={{ left: `${(x(hover) / W) * 100}%`, top: `${(y(data[hover]) / H) * 100}%` }}
        >
          <strong>{nf.format(data[hover])}</strong> tiket
          <span>{hover + 1} {monthName}</span>
        </div>
      )}
    </div>
  );
}

/* ───────────── Halaman ───────────── */
export default function DashboardPage() {
  // Kosong = backend memilih bulan sekarang (hindari new Date() di client component)
  const [month, setMonth] = useState("");
  const [exporting, setExporting] = useState(false);
  const [exportErr, setExportErr] = useState("");
  const { data: dash, error } = useDashboard(month);

  if (!dash) {
    return (
      <main className={`d-dash ${inter.className}`}>
        <style>{css}</style>
        <p className="d-sub">{error || "Memuat data..."}</p>
      </main>
    );
  }

  const { stats: totals, monthly, genres, events, months } = dash;
  const selectedMonth = dash.month;
  const monthName = MONTHS[Number(selectedMonth.split("-")[1]) - 1];
  const data = monthly.tickets;
  const maxSales = Math.max(...data);
  const peak = data.indexOf(maxSales);

  // semua genre, diurutkan dari yang paling diminati
  const rankedGenres = [...genres].sort((a, b) => b.value - a.value);
  const topGenre = rankedGenres[0];
  const secondGenre = rankedGenres[1];

  async function exportPdf() {
    setExporting(true);
    setExportErr("");
    try {
      await buildSalesPdf({
        month: selectedMonth,
        tickets: data,
        revenue: monthly.revenue,
        prevTickets: totals.prevTickets,
        prevRevenue: totals.prevRevenue,
      });
    } catch (err) {
      console.error(err);
      setExportErr("Gagal membuat PDF. Coba lagi.");
    } finally {
      setExporting(false);
    }
  }

  const stats = [
    {
      label: "Total Tiket Terjual",
      value: nf.format(totals.tickets),
      badge: pctChange(totals.tickets, totals.prevTickets),
      icon: <Icon><path d="M3 9V7a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v2a2 2 0 0 0 0 6v2a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-2a2 2 0 0 0 0-6Z" /></Icon>,
    },
    {
      label: "Total Pendapatan",
      value: rupiah(totals.revenue),
      badge: pctChange(totals.revenue, totals.prevRevenue),
      icon: <Icon><rect x="3" y="6" width="18" height="12" rx="2" /><circle cx="12" cy="12" r="2.5" /></Icon>,
    },
    {
      label: "Event Aktif",
      value: nf.format(totals.activeEvents),
      badge: totals.newEvents ? `${totals.newEvents} Baru` : "",
      icon: <Icon><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M3 10h18M8 3v4M16 3v4" /></Icon>,
    },
    {
      label: "Total Pengguna",
      value: nf.format(totals.totalUsers),
      badge: totals.newUsers ? `+${totals.newUsers}` : "",
      icon: <Icon><circle cx="12" cy="8" r="4" /><path d="M4 21c0-4 4-6 8-6s8 2 8 6" /></Icon>,
    },
  ];

  return (
    <main className={`d-dash ${inter.className}`}>
      <style>{css}</style>

      {/* Welcome Header */}
      <header className="d-welcome">
        <div>
          <h1 className="d-welcome-title">Selamat Datang, Admin</h1>
          <p className="d-welcome-date">
            {new Date().toLocaleDateString("id-ID", {
              weekday: "long",
              day: "numeric",
              month: "long",
              year: "numeric",
            })}
          </p>
        </div>
      </header>

      {/* Statistik */}
      <section className="d-stats" aria-label="Ringkasan">
        {stats.map((s) => (
          <article key={s.label} className="d-card d-stat">
            <div className="d-stat-top">
              {s.icon}
              {s.badge && <span className="d-badge">{s.badge}</span>}
            </div>
            <p className="d-stat-label">{s.label}</p>
            <p className="d-stat-value">{s.value}</p>
          </article>
        ))}
      </section>

      {/* Grafik + Genre */}
      <section className="d-row2">
        <article className="d-card d-pad">
          <div className="d-card-head">
            <div>
              <h2>Grafik Penjualan Tiket</h2>
              <p className="d-sub">
                {maxSales > 0
                  ? `Penjualan per hari · puncak tanggal ${peak + 1} (${nf.format(maxSales)} tiket)`
                  : "Belum ada penjualan pada bulan ini"}
              </p>
            </div>
            <div className="d-actions">
              <select value={selectedMonth} onChange={(e) => setMonth(e.target.value)} aria-label="Pilih bulan">
                {months.map((m) => (
                  <option key={m} value={m}>{monthLabel(m)}</option>
                ))}
              </select>
              <button className="d-btn-dark" onClick={exportPdf} disabled={exporting}>
                {exporting ? "Menyiapkan..." : "Simpan PDF"}
              </button>
            </div>
          </div>
          {exportErr && <p className="d-err" role="alert">{exportErr}</p>}
          <SalesChart data={data} monthName={monthName} />
        </article>

        <article className="d-card d-pad d-genre">
          <h2>Perbandingan Genre</h2>
          <p className="d-sub">Minat penonton · {rankedGenres.length} genre</p>

          <ul>
            {rankedGenres.map((g, i) => (
              <li key={g.name} className={i === 0 ? "d-genre-top" : undefined}>
                <div className="d-genre-row">
                  <span className="d-genre-name">
                    <span className="d-rank">{i + 1}</span>
                    {g.name}
                    {i === 0 && <span className="d-top-tag">Paling diminati</span>}
                  </span>
                  <span style={{ color: g.color }}>{g.value}%</span>
                </div>
                <div className="d-track" role="progressbar" aria-label={g.name} aria-valuenow={g.value} aria-valuemin={0} aria-valuemax={100}>
                  <div style={{ width: `${g.value}%`, background: g.color }} />
                </div>
              </li>
            ))}
          </ul>

          <div className="d-insight">
            <span className="d-insight-icon">
              <Icon><path d="m3 17 6-6 4 4 8-8M15 7h6v6" /></Icon>
            </span>
            <p>
              {topGenre
                ? `${topGenre.name} paling diminati penonton (${topGenre.value}%)${
                    secondGenre ? `, diikuti ${secondGenre.name} (${secondGenre.value}%).` : "."
                  }`
                : "Belum ada data genre."}
            </p>
          </div>
        </article>
      </section>

      {/* Event terbaru */}
      <section className="d-card">
        <div className="d-card-head d-pad d-card-head-event">
          <h2>List Event Terbaru</h2>
          <a href="/event" className="d-link-all">
            Lihat Semua Event
          </a>
        </div>
        <div className="d-table-wrap">
          <table>
            <thead>
              <tr>
                <th>Nama Konser</th>
                <th>Artis Utama</th>
                <th>Tanggal</th>
                <th>Status</th>
                <th>Terjual</th>
              </tr>
            </thead>
            <tbody>
              {events.map((e) => (
                <tr
                  key={e.id}
                  onClick={() => {
                    window.location.href = "/event";
                  }}
                  className="d-row-clickable"
                  title="Klik untuk buka di halaman Event"
                >
                  <td className="d-strong">{e.name}</td>
                  <td>{e.artist}</td>
                  <td>{e.date}</td>
                  <td><span className={STATUS_CLASS[e.status]}>{e.status}</span></td>
                  <td>
                    <div className="d-occ">
                      <span>{e.occupancy}%</span>
                      <div className="d-track d-sm"><div style={{ width: `${e.occupancy}%` }} /></div>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </main>
  );
}

/* ───────────── Styles ───────────── */
const css = `
.d-dash {
  --bg: #FFF8F4; --ink: #1A1A1A; --muted: #6B6B6B; --line: #EFE4DC;
  --navy: #2F5D80; --sky: #8EC1EC; --sand: #F5E3C3; --link: #1E5A8A;
  --card: #fff; --track: #F6EADF; --row-hover: #FFFBF8; --axis: #8a8a8a;
  --btn-bg: #2F5D80; --btn-hover: #244A68; --btn-ink: #fff;
  --tip-bg: #1A1A1A; --tip-ink: #fff;
  --g1: #2F5D80; --g2: #8EC1EC; --g3: #4B7FA6;
  --pill-blue-bg: #D6E9FB; --pill-blue-ink: #1E4E7A;
  --pill-orange-bg: #FFC9B5; --pill-orange-ink: #8A3A18;
  --pill-green-bg: #BDEBC8; --pill-green-ink: #1F6B36;
  --shadow: rgba(140,90,40,.06);
}
:root[data-theme="dark"] .d-dash {
  --bg: #141316; --ink: #F2EDE8; --muted: #A8A29B; --line: #34312F;
  --navy: #8EC1EC; --sky: #8EC1EC; --sand: #3A3022; --link: #8EC1EC;
  --card: #1C1B1F; --track: #2C2A2E; --row-hover: #232126; --axis: #A8A29B;
  --btn-bg: #8EC1EC; --btn-hover: #A6D0F2; --btn-ink: #1A1A1A;
  --tip-bg: #F2EDE8; --tip-ink: #1A1A1A;
  --g1: #8EC1EC; --g2: #5E8FB8; --g3: #B7D9F2;
  --pill-blue-bg: #1E3A55; --pill-blue-ink: #B7D9F2;
  --pill-orange-bg: #4A2A1C; --pill-orange-ink: #FFC9B5;
  --pill-green-bg: #1C3D26; --pill-green-ink: #BDEBC8;
  --shadow: rgba(0,0,0,.35);
}
:where(.d-dash, .d-dash *) { box-sizing: border-box; margin: 0; padding: 0; }
html, body { background: #FFF8F4; color: #1A1A1A; }
:root[data-theme="dark"] body { background: #141316; color: #F2EDE8; }

.d-dash { max-width: 1180px; margin: 0 auto; padding: 24px 20px 48px; display: flex; flex-direction: column; gap: 20px; }

.d-card { background: var(--card); border: 1px solid var(--line); border-radius: 4px; box-shadow: 0 1px 2px rgba(0,0,0,.04), 0 8px 24px var(--shadow); transition: background .2s, border-color .2s; }
.d-pad { padding: 22px; }

/* header */
.d-top { display: flex; justify-content: flex-end; align-items: center; gap: 16px; }
.d-admin { display: flex; align-items: center; gap: 10px; font-size: 12px; font-weight: 600; padding-left: 16px; border-left: 1px solid var(--line); }
.d-avatar { width: 34px; height: 34px; border-radius: 50%; background: var(--sand); color: var(--navy); display: grid; place-items: center; font-weight: 700; }

/* welcome header */
.d-welcome { display: flex; justify-content: space-between; align-items: flex-end; padding: 4px 2px; }
.d-welcome-title { font-size: 22px; font-weight: 700; letter-spacing: -0.02em; color: var(--ink); }
.d-welcome-date { font-size: 13px; color: var(--muted); margin-top: 4px; }
.d-card-head-event { display: flex; justify-content: space-between; align-items: center; }
.d-link-all { font-size: 12px; font-weight: 600; color: var(--navy); text-decoration: none; padding: 6px 12px; border-radius: 4px; background: var(--sand); transition: opacity .15s; }
.d-link-all:hover { opacity: .85; }
.d-row-clickable { cursor: pointer; }

/* stats */
.d-stats { display: grid; grid-template-columns: repeat(4, 1fr); gap: 16px; }
.d-stat { padding: 18px 20px 20px; }
.d-stat-top { display: flex; justify-content: space-between; align-items: center; margin-bottom: 22px; }
.d-icon { width: 20px; height: 20px; fill: none; stroke: var(--navy); stroke-width: 1.6; stroke-linecap: round; stroke-linejoin: round; }
.d-badge { font-size: 11px; font-weight: 600; color: var(--link); }
.d-stat-label { font-size: 11px; font-weight: 600; letter-spacing: .06em; text-transform: uppercase; color: var(--muted); }
.d-stat-value { font-size: 30px; font-weight: 700; letter-spacing: -0.02em; margin-top: 4px; }

/* row 2 */
.d-row2 { display: grid; grid-template-columns: minmax(0, 2fr) minmax(0, 1fr); gap: 16px; }
.d-dash h2 { font-size: 14px; font-weight: 600; }
.d-sub { font-size: 12px; color: var(--muted); margin-top: 4px; }
.d-err { font-size: 12px; font-weight: 500; color: #C4372D; margin-top: 10px; }
:root[data-theme="dark"] .d-err { color: #EE7A70; }
.d-card-head { display: flex; justify-content: space-between; align-items: flex-start; gap: 12px; flex-wrap: wrap; }
.d-actions { display: flex; gap: 8px; flex-wrap: wrap; }
.d-dash select { height: 34px; padding: 0 28px 0 12px; font: inherit; font-size: 12px; color: var(--ink); border: 1px solid var(--line); background: var(--bg); border-radius: 3px; cursor: pointer; }
.d-btn-dark { height: 34px; padding: 0 16px; font: inherit; font-size: 12px; font-weight: 600; color: var(--btn-ink); background: var(--btn-bg); border: 1px solid transparent; border-radius: 3px; cursor: pointer; transition: background .15s; }
.d-btn-dark:hover:not(:disabled) { background: var(--btn-hover); }
.d-btn-dark:disabled { opacity: .6; cursor: progress; }
.d-dash select:focus-visible, .d-btn-dark:focus-visible { outline: 2px solid var(--sky); outline-offset: 2px; }

/* chart */
.d-chart { position: relative; margin-top: 18px; }
.d-chart svg { width: 100%; height: auto; display: block; }
.d-axis { font-size: 10px; fill: var(--axis); }
.d-grid-line { stroke: var(--line); }
.d-line { stroke: var(--navy); }
.d-hover-line { stroke: var(--navy); }
.d-dot { fill: var(--card); stroke: var(--navy); }
.d-tooltip { position: absolute; transform: translate(-50%, calc(-100% - 12px)); background: var(--tip-bg); color: var(--tip-ink); font-size: 12px; padding: 6px 10px; border-radius: 3px; pointer-events: none; white-space: nowrap; display: flex; flex-direction: column; align-items: center; gap: 1px; }
.d-tooltip span { font-size: 10px; opacity: .7; }

/* genre */
.d-genre ul { list-style: none; margin-top: 22px; display: flex; flex-direction: column; gap: 16px; max-height: 320px; overflow-y: auto; padding-right: 6px; scrollbar-width: thin; }
.d-genre-row { display: flex; justify-content: space-between; align-items: center; gap: 8px; font-size: 12px; font-weight: 600; margin-bottom: 6px; }
.d-genre-name { display: flex; align-items: center; gap: 8px; min-width: 0; }
.d-rank { width: 18px; height: 18px; border-radius: 50%; display: grid; place-items: center; font-size: 10px; font-weight: 700; background: var(--track); color: var(--muted); flex-shrink: 0; }
.d-genre-top .d-rank { background: var(--navy); color: var(--btn-ink); }
.d-top-tag { font-size: 9.5px; font-weight: 700; letter-spacing: .04em; text-transform: uppercase; padding: 2px 8px; border-radius: 999px; background: var(--sand); color: var(--navy); white-space: nowrap; }
.d-genre-top .d-track { height: 8px; }
.d-track { height: 6px; background: var(--track); border-radius: 3px; overflow: hidden; }
.d-track > div { height: 100%; border-radius: 3px; }
.d-insight { display: flex; align-items: center; gap: 12px; margin-top: 26px; padding-top: 18px; border-top: 1px solid var(--line); font-size: 12px; }
.d-insight-icon { width: 32px; height: 32px; background: var(--sand); border-radius: 3px; display: grid; place-items: center; flex-shrink: 0; }
.d-insight-icon .d-icon { width: 16px; height: 16px; }

/* table */
.d-table-wrap { overflow-x: auto; margin-top: 4px; }
.d-dash table { width: 100%; border-collapse: collapse; min-width: 640px; font-size: 13px; }
.d-dash th { background: var(--sand); text-align: left; font-size: 10px; font-weight: 700; letter-spacing: .08em; text-transform: uppercase; padding: 14px 22px; white-space: nowrap; }
.d-dash td { padding: 18px 22px; border-bottom: 1px solid var(--line); }
.d-dash tbody tr:last-child td { border-bottom: 0; }
.d-dash tbody tr:hover { background: var(--row-hover); }
.d-strong { font-weight: 600; }

.d-pill { display: inline-block; font-size: 10px; font-weight: 600; padding: 3px 10px; border-radius: 999px; white-space: nowrap; }
.d-pill-blue { background: var(--pill-blue-bg); color: var(--pill-blue-ink); }
.d-pill-orange { background: var(--pill-orange-bg); color: var(--pill-orange-ink); }
.d-pill-green { background: var(--pill-green-bg); color: var(--pill-green-ink); }

.d-occ { display: flex; flex-direction: column; gap: 5px; width: 90px; font-size: 12px; font-weight: 600; }
.d-track.d-sm { height: 4px; }
.d-track.d-sm > div { background: var(--navy); }

/* responsive */
@media (max-width: 960px) {
  .d-stats { grid-template-columns: repeat(2, 1fr); }
  .d-row2 { grid-template-columns: 1fr; }
}
@media (max-width: 520px) {
  .d-stats { grid-template-columns: 1fr; }
}
@media (prefers-reduced-motion: reduce) { .d-dash * { transition: none !important; } }
`;