import db from "../config/db.js";

const SEAT_UI = { available: "tersedia", reserved: "reservasi", sold: "terjual", broken: "rusak" };

function rowLabel(r) {
  return String.fromCharCode(65 + r);
}

function serverError(res, err) {
  console.error(err);
  res.status(500).json({ message: "Terjadi kesalahan pada server." });
}

/*
 * GET /api/events/:id/denah
 * Response:
 *  {
 *    nama, baris, kursi,
 *    seats:    { "0-0": "tersedia", "0-1": "rusak", "1-0": "kosong", ... },
 *    kategori: { "0-0": 3, "0-1": 3, ... }   // id ticket_types per kursi
 *  }
 */
export const getDenah = async (req, res) => {
  try {
    const [rows] = await db.query(
      `SELECT section, row_name, seat_number, status, ticket_type_id
         FROM seats
        WHERE event_id = ?
        ORDER BY id ASC`,
      [req.params.id]
    );

    if (rows.length === 0) {
      return res.json({ nama: "Section A1", baris: "4", kursi: "10", seats: {}, kategori: {} });
    }

    let maxRow = 0;
    let maxSeat = 0;
    rows.forEach((s) => {
      maxRow = Math.max(maxRow, s.row_name.charCodeAt(0) - 65 + 1);
      maxSeat = Math.max(maxSeat, parseInt(s.seat_number, 10));
    });

    // semua sel default "kosong", lalu diisi dari data seats
    const seats = {};
    const kategori = {};
    for (let r = 0; r < maxRow; r++) {
      for (let c = 0; c < maxSeat; c++) seats[`${r}-${c}`] = "kosong";
    }
    rows.forEach((s) => {
      const r = s.row_name.charCodeAt(0) - 65;
      const c = parseInt(s.seat_number, 10) - 1;
      seats[`${r}-${c}`] = SEAT_UI[s.status] || "tersedia";
      kategori[`${r}-${c}`] = s.ticket_type_id;
    });

    res.json({
      nama: rows[0].section,
      baris: String(maxRow),
      kursi: String(maxSeat),
      seats,
      kategori,
    });
  } catch (err) {
    serverError(res, err);
  }
};

/*
 * PUT /api/events/:id/denah
 * Body:
 *  {
 *    nama, baris, kursi,
 *    seats:    { "r-c": "tersedia" | "rusak" | "kosong" | "reservasi" | "terjual" },
 *    kategori: { "r-c": <ticket_type_id> },
 *    kategoriDefaultId: <ticket_type_id>   // dipakai kalau sebuah kursi tidak punya kategori
 *  }
 */
export const saveDenah = async (req, res) => {
  const eventId = Number(req.params.id);
  const { nama, baris, kursi, seats, kategori, kategoriDefaultId } = req.body || {};
  const B = Math.min(26, Math.max(1, parseInt(baris, 10) || 1));
  const K = Math.min(30, Math.max(1, parseInt(kursi, 10) || 1));
  const map = seats || {};
  const katMap = kategori || {};

  let conn;
  try {
    // 1) kategori tiket yang sah = milik event ini
    const [tt] = await db.query("SELECT id FROM ticket_types WHERE event_id = ?", [eventId]);
    const valid = new Set(tt.map((r) => Number(r.id)));
    if (valid.size === 0) {
      return res.status(400).json({
        message: "Event ini belum punya kategori tiket. Buat kategorinya dulu di tab Kategori Tiket.",
      });
    }
    const defaultId = Number(kategoriDefaultId);
    const fallbackId = valid.has(defaultId) ? defaultId : null;

    // 2) susun baris kursi (kursi reservasi/terjual tidak disentuh)
    const rows = [];
    for (let r = 0; r < B; r++) {
      for (let c = 0; c < K; c++) {
        const key = `${r}-${c}`;
        const st = map[key] ?? "tersedia";
        if (st === "kosong" || st === "reservasi" || st === "terjual") continue;

        const tid = Number(katMap[key] ?? fallbackId);
        if (!valid.has(tid)) {
          return res.status(400).json({
            message: `Kursi ${rowLabel(r)}${c + 1} memakai kategori tiket yang tidak valid untuk event ini.`,
          });
        }

        rows.push([
          eventId,
          tid,
          (nama || "Section A1").trim(),
          rowLabel(r),
          String(c + 1),
          st === "rusak" ? "broken" : "available",
        ]);
      }
    }

    // 3) simpan dalam satu transaksi
    conn = await db.getConnection();
    await conn.beginTransaction();

    // hanya hapus kursi yang masih bebas diubah; reserved/sold tetap aman
    await conn.query(
      "DELETE FROM seats WHERE event_id = ? AND status IN ('available','broken')",
      [eventId]
    );

    if (rows.length > 0) {
      await conn.query(
        "INSERT INTO seats (event_id, ticket_type_id, section, row_name, seat_number, status) VALUES ?",
        [rows]
      );
    }

    await conn.commit();
    res.json({ ok: true });
  } catch (err) {
    if (conn) await conn.rollback();
    serverError(res, err);
  } finally {
    if (conn) conn.release();
  }
};