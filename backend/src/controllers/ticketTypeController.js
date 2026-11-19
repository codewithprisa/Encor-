import db from "../config/db.js";

function serverError(res, err) {
  console.error(err);
  res.status(500).json({ message: "Terjadi kesalahan pada server." });
}

// kuning, biru, hijau, ungu
const WARNA_BOLEH = ["#FBBF24", "#60A5FA", "#34D399", "#C084FC"];

function mapKategori(r) {
  return {
    id: r.id,
    nama: r.ticket_name,
    keterangan: r.description || "",
    tipe: r.ticket_kind === "festival" ? "Festival" : "Seated",
    harga: Number(r.price),
    kuota: r.quota,
    terjual: r.sold,
    status: r.status === "active" ? "Aktif" : "Nonaktif",
    warna: r.color || null,
  };
}

function bodyKategori(b) {
  return {
    nama: (b.nama || "").trim(),
    // null kalau frontend tidak mengirim tipe -> nanti diturunkan dari venue
    kind: b.tipe ? (b.tipe === "Festival" ? "festival" : "seated") : null,
    harga: Number(b.harga),
    kuota: Number(b.kuota),
    status: b.status === "Nonaktif" ? "inactive" : "active",
    // hanya terima 4 warna: kuning, biru, hijau, ungu; selain itu diabaikan
    warna: WARNA_BOLEH.includes(String(b.warna || "").toUpperCase())
      ? String(b.warna).toUpperCase()
      : null,
  };
}

function validasi(k) {
  if (!k.nama) return "Nama kategori wajib diisi.";
  if (!k.harga || k.harga < 0) return "Harga harus diisi dengan angka yang valid.";
  if (!k.kuota || k.kuota < 1) return "Kuota minimal 1.";
  return null;
}

/* Ambil tipe dari venue event (festival / seated). Default: seated. */
async function tipeDariVenue(eventId) {
  const [rows] = await db.query(
    `SELECT v.seat_type
       FROM events e
       LEFT JOIN venues v ON v.id = e.venue_id
      WHERE e.id = ?`,
    [eventId]
  );
  return rows[0]?.seat_type === "festival" ? "festival" : "seated";
}

/* GET /api/events/:id/kategori */
export const getByEvent = async (req, res) => {
  try {
    const [rows] = await db.query(
      "SELECT * FROM ticket_types WHERE event_id = ? ORDER BY id ASC",
      [req.params.id]
    );
    res.json(rows.map(mapKategori));
  } catch (err) {
    serverError(res, err);
  }
};

/* POST /api/events/:id/kategori
 * Kategori otomatis ditambahkan ke SEMUA event yang ada.
 * Periode jual tiap kategori mengikuti periode jual event masing-masing. */
export const create = async (req, res) => {
  const k = bodyKategori(req.body);
  const msg = validasi(k);
  if (msg) return res.status(400).json({ message: msg });
  try {
    const [events] = await db.query(
      `SELECT e.id, e.ticket_open, e.ticket_close, v.seat_type
         FROM events e
         LEFT JOIN venues v ON v.id = e.venue_id
        ORDER BY e.id ASC`
    );
    if (!events.length) {
      return res.status(404).json({ message: "Belum ada event." });
    }

    const values = events.map((ev) => [
      ev.id,
      k.nama,
      k.kind || (ev.seat_type === "festival" ? "festival" : "seated"),
      k.harga,
      k.kuota,
      k.warna,
      ev.ticket_open,
      ev.ticket_close,
      k.status,
    ]);

    // satu statement = atomik (semua masuk atau semua gagal)
    const [ins] = await db.query(
      `INSERT INTO ticket_types
         (event_id, ticket_name, ticket_kind, price, quota, color, sale_start, sale_end, status)
       VALUES ?`,
      [values]
    );
    res.status(201).json({ id: ins.insertId, jumlahEvent: events.length });
  } catch (err) {
    serverError(res, err);
  }
};

/* PUT /api/kategori/:id */
export const update = async (req, res) => {
  const k = bodyKategori(req.body);
  const msg = validasi(k);
  if (msg) return res.status(400).json({ message: msg });
  try {
    let kind = k.kind;
    if (!kind) {
      const [rows] = await db.query("SELECT event_id FROM ticket_types WHERE id = ?", [
        req.params.id,
      ]);
      if (!rows.length) {
        return res.status(404).json({ message: "Kategori tidak ditemukan." });
      }
      kind = await tipeDariVenue(rows[0].event_id);
    }

    // kuota tidak boleh lebih kecil dari jumlah yang sudah terjual;
    // warna tidak berubah kalau tidak dikirim / tidak valid; description tidak disentuh
    const [result] = await db.query(
      `UPDATE ticket_types
          SET ticket_name = ?, ticket_kind = ?, price = ?,
              quota = GREATEST(?, sold), color = COALESCE(?, color), status = ?
        WHERE id = ?`,
      [k.nama, kind, k.harga, k.kuota, k.warna, k.status, req.params.id]
    );
    if (result.affectedRows === 0) {
      return res.status(404).json({ message: "Kategori tidak ditemukan." });
    }
    res.json({ ok: true });
  } catch (err) {
    serverError(res, err);
  }
};

/* DELETE /api/kategori/:id */
export const remove = async (req, res) => {
  try {
    await db.query("DELETE FROM ticket_types WHERE id = ?", [req.params.id]);
    res.json({ ok: true });
  } catch (err) {
    if (err.code === "ER_ROW_IS_REFERENCED_2") {
      return res.status(409).json({
        message: "Kategori sudah punya pesanan. Nonaktifkan saja, jangan dihapus.",
      });
    }
    serverError(res, err);
  }
};