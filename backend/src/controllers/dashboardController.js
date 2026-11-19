import db from "../config/db.js";

const GENRE_FALLBACK_COLORS = ["var(--g1)", "var(--g2)", "var(--g3)"];

// Tiket dianggap "terjual" kalau pesanannya sudah dibayar dan tiketnya tidak dibatalkan.
const SOLD = `o.payment_status = 'paid' AND oi.ticket_status <> 'cancelled'`;

const num = (v) => Number(v) || 0;
const pad = (n) => String(n).padStart(2, "0");

// "2026-10" → { y: 2026, m: 10 }. Kalau kosong/salah, pakai bulan sekarang.
function parseMonth(value) {
  const match = /^(\d{4})-(0[1-9]|1[0-2])$/.exec(value || "");
  if (match) return { y: Number(match[1]), m: Number(match[2]) };
  const now = new Date();
  return { y: now.getFullYear(), m: now.getMonth() + 1 };
}

// Geser bulan, mis. shift({ y: 2026, m: 1 }, -1) → { y: 2025, m: 12 }
function shift({ y, m }, delta) {
  const d = new Date(Date.UTC(y, m - 1 + delta, 1));
  return { y: d.getUTCFullYear(), m: d.getUTCMonth() + 1 };
}

const key = ({ y, m }) => `${y}-${pad(m)}`; // "2026-10"
const startOf = (ym) => `${key(ym)}-01`; // "2026-10-01"

function eventStatus(row, occupancy) {
  if (row.status === "closed" || new Date(row.event_date) < new Date()) {
    return "Selesai";
  }
  if (occupancy >= 90) return "Hampir Habis";
  return "Terjadwal";
}

export const getDashboard = async (req, res) => {
  try {
    const cur = parseMonth(req.query.month);
    const prevMonth = shift(cur, -1);
    const nextMonth = shift(cur, 1);

    const from = startOf(cur);
    const to = startOf(nextMonth);
    const prevFrom = startOf(prevMonth);
    const daysInMonth = new Date(Date.UTC(cur.y, cur.m, 0)).getUTCDate();

    const [
      [dailyRows],
      [[prev]],
      [monthRows],
      [[counts]],
      [genreRows],
      [eventRows],
    ] = await Promise.all([
      // 1. Penjualan per hari pada bulan yang dipilih
      db.execute(
        `SELECT DAY(o.order_date) AS day,
                SUM(oi.quantity) AS tickets,
                SUM(oi.price * oi.quantity) AS revenue
         FROM order_items oi
         JOIN orders o ON o.id = oi.order_id
         WHERE ${SOLD} AND o.order_date >= ? AND o.order_date < ?
         GROUP BY DAY(o.order_date)`,
        [from, to]
      ),

      // 2. Total bulan sebelumnya (untuk persentase naik/turun)
      db.execute(
        `SELECT COALESCE(SUM(oi.quantity), 0) AS tickets,
                COALESCE(SUM(oi.price * oi.quantity), 0) AS revenue
         FROM order_items oi
         JOIN orders o ON o.id = oi.order_id
         WHERE ${SOLD} AND o.order_date >= ? AND o.order_date < ?`,
        [prevFrom, from]
      ),

      // 3. Bulan yang punya pesanan (untuk dropdown)
      db.execute(
        `SELECT DISTINCT DATE_FORMAT(order_date, '%Y-%m') AS ym
         FROM orders`
      ),

      // 4. Event aktif dan jumlah pengguna
      db.execute(
        `SELECT
           (SELECT COUNT(*) FROM events
             WHERE status = 'published' AND event_date >= NOW()) AS activeEvents,
           (SELECT COUNT(*) FROM events
             WHERE status = 'published'
               AND created_at >= NOW() - INTERVAL 30 DAY) AS newEvents,
           (SELECT COUNT(*) FROM users WHERE role = 'user') AS totalUsers,
           (SELECT COUNT(*) FROM users
             WHERE role = 'user'
               AND created_at >= NOW() - INTERVAL 30 DAY) AS newUsers`
      ),

      // 5. Perbandingan genre pada bulan yang dipilih.
      //    Mulai dari tabel genres + LEFT JOIN, jadi SEMUA genre ikut tampil
      //    (genre tanpa penjualan bernilai 0), bukan hanya yang sudah laku.
      db.execute(
        `SELECT g.id, g.genre_name, g.color_swatch,
                SUM(CASE WHEN ${SOLD}
                              AND o.order_date >= ? AND o.order_date < ?
                         THEN oi.quantity ELSE 0 END) AS tickets
         FROM genres g
         LEFT JOIN events e ON e.genre_id = g.id
         LEFT JOIN ticket_types tt ON tt.event_id = e.id
         LEFT JOIN order_items oi ON oi.ticket_type_id = tt.id
         LEFT JOIN orders o ON o.id = oi.order_id
         GROUP BY g.id, g.genre_name, g.color_swatch
         ORDER BY tickets DESC, g.genre_name ASC`,
        [from, to]
      ),

      // 6. Event terbaru + jumlah tiket terjual dan kuotanya
      db.execute(
        `SELECT e.id, e.title, e.event_date, e.status, a.artist_name,
                COALESCE((SELECT SUM(tt.quota)
                          FROM ticket_types tt
                          WHERE tt.event_id = e.id), 0) AS quota,
                COALESCE((SELECT SUM(oi.quantity)
                          FROM order_items oi
                          JOIN orders o ON o.id = oi.order_id
                          JOIN ticket_types tt ON tt.id = oi.ticket_type_id
                          WHERE tt.event_id = e.id AND ${SOLD}), 0) AS sold
         FROM events e
         LEFT JOIN artists a ON a.id = e.artist_id
         WHERE e.status <> 'draft'
         ORDER BY e.created_at DESC
         LIMIT 5`
      ),
    ]);

    // Susun data per hari (hari tanpa penjualan = 0)
    const tickets = Array(daysInMonth).fill(0);
    const revenue = Array(daysInMonth).fill(0);
    for (const r of dailyRows) {
      tickets[r.day - 1] = num(r.tickets);
      revenue[r.day - 1] = num(r.revenue);
    }

    // Daftar bulan: 12 bulan terakhir + bulan yang punya pesanan + bulan terpilih
    const months = new Set(monthRows.map((r) => r.ym));
    const now = parseMonth();
    for (let i = 0; i < 12; i++) months.add(key(shift(now, -i)));
    months.add(key(cur));

    // Persentase genre (semua genre, tanpa dibatasi 5)
    const genreTotal = genreRows.reduce((s, g) => s + num(g.tickets), 0);
    const genres = genreRows.map((g, i) => ({
      name: g.genre_name,
      value: genreTotal ? Math.round((num(g.tickets) / genreTotal) * 100) : 0,
      color:
        g.color_swatch ||
        GENRE_FALLBACK_COLORS[i % GENRE_FALLBACK_COLORS.length],
    }));

    // Daftar event
    const events = eventRows.map((e) => {
      const quota = num(e.quota);
      const occupancy = quota
        ? Math.min(100, Math.round((num(e.sold) / quota) * 100))
        : 0;

      return {
        id: e.id,
        name: e.title,
        artist: e.artist_name || "-",
        date: new Date(e.event_date).toLocaleDateString("id-ID", {
          day: "numeric",
          month: "short",
          year: "numeric",
        }),
        status: eventStatus(e, occupancy),
        occupancy,
      };
    });

    return res.status(200).json({
      success: true,
      data: {
        month: key(cur),
        months: [...months].sort().reverse(),
        stats: {
          tickets: tickets.reduce((a, b) => a + b, 0),
          revenue: revenue.reduce((a, b) => a + b, 0),
          prevTickets: num(prev.tickets),
          prevRevenue: num(prev.revenue),
          activeEvents: num(counts.activeEvents),
          newEvents: num(counts.newEvents),
          totalUsers: num(counts.totalUsers),
          newUsers: num(counts.newUsers),
        },
        monthly: { tickets, revenue },
        genres,
        events,
      },
    });
  } catch (error) {
    console.error("Dashboard error:", error);

    return res.status(500).json({
      success: false,
      message: "Gagal memuat data dashboard.",
    });
  }
};