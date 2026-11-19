import db from "../config/db.js";

function serverError(res, err) {
  console.error(err);
  res.status(500).json({ message: "Terjadi kesalahan pada server." });
}

const HEX = /^#[0-9a-fA-F]{6}$/;

/* Campur warna hex ke arah `ke` (255 = putih, 0 = hitam) sebesar t (0..1). */
function campur(hex, ke, t) {
  const n = parseInt(hex.slice(1), 16);
  const kanal = [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  const hasil = kanal.map((c) => Math.round(c + (ke - c) * t));
  return "#" + hasil.map((x) => x.toString(16).padStart(2, "0")).join("").toUpperCase();
}

function mapGenre(r) {
  return {
    id: r.id,
    nama: r.genre_name,
    warna: r.color_swatch, // warna utama (untuk preview & swatch)
    colorBg: r.color_bg,
    colorText: r.color_text,
    colorSwatch: r.color_swatch,
    jumlahArtis: Number(r.jumlah_artis),
    jumlahEvent: Number(r.jumlah_event),
  };
}

/*
 * Ambil input dari body.
 * Warna utama boleh dikirim sebagai `warna` atau `colorSwatch`.
 * colorBg / colorText kalau tidak dikirim dihitung otomatis dari warna utama.
 */
function bodyGenre(b) {
  const nama = String(b.nama || "").trim();
  const swatch = String(b.warna || b.colorSwatch || "").trim();
  const bg = String(b.colorBg || "").trim();
  const text = String(b.colorText || "").trim();
  return { nama, swatch, bg, text };
}

function validasi(g) {
  if (!g.nama) return "Nama genre wajib diisi.";
  if (g.nama.length > 100) return "Nama genre maksimal 100 karakter.";
  if (!HEX.test(g.swatch)) return "Warna badge harus berupa kode hex, contoh #A855F7.";
  if (g.bg && !HEX.test(g.bg)) return "Warna latar badge tidak valid.";
  if (g.text && !HEX.test(g.text)) return "Warna teks badge tidak valid.";
  return null;
}

function warnaFinal(g) {
  return {
    swatch: g.swatch.toUpperCase(),
    bg: g.bg ? g.bg.toUpperCase() : campur(g.swatch, 255, 0.85),
    text: g.text ? g.text.toUpperCase() : campur(g.swatch, 0, 0.4),
  };
}

const SELECT_GENRE = `
  SELECT g.id, g.genre_name, g.color_bg, g.color_text, g.color_swatch,
         (SELECT COUNT(*) FROM artists a WHERE a.genre_id = g.id) AS jumlah_artis,
         (SELECT COUNT(*) FROM events  e WHERE e.genre_id = g.id) AS jumlah_event
    FROM genres g
`;

/* GET /api/genre?q= */
export const getGenres = async (req, res) => {
  try {
    const params = [];
    let whereSql = "";
    if (req.query.q && String(req.query.q).trim()) {
      whereSql = "WHERE g.genre_name LIKE ?";
      params.push(`%${String(req.query.q).trim()}%`);
    }
    const [rows] = await db.query(`${SELECT_GENRE} ${whereSql} ORDER BY g.genre_name ASC`, params);
    res.json(rows.map(mapGenre));
  } catch (err) {
    serverError(res, err);
  }
};

/* GET /api/genre/:id */
export const getGenreById = async (req, res) => {
  try {
    const [rows] = await db.query(`${SELECT_GENRE} WHERE g.id = ?`, [req.params.id]);
    if (!rows.length) return res.status(404).json({ message: "Genre tidak ditemukan." });
    res.json(mapGenre(rows[0]));
  } catch (err) {
    serverError(res, err);
  }
};

/* POST /api/genre  (nama, warna) */
export const createGenre = async (req, res) => {
  const g = bodyGenre(req.body || {});
  const msg = validasi(g);
  if (msg) return res.status(400).json({ message: msg });

  const w = warnaFinal(g);
  try {
    const [ins] = await db.query(
      "INSERT INTO genres (genre_name, color_bg, color_text, color_swatch) VALUES (?, ?, ?, ?)",
      [g.nama, w.bg, w.text, w.swatch]
    );
    res.status(201).json({ id: ins.insertId });
  } catch (err) {
    if (err.code === "ER_DUP_ENTRY") {
      return res.status(409).json({ message: "Genre dengan nama ini sudah ada." });
    }
    serverError(res, err);
  }
};

/* PUT /api/genre/:id */
export const updateGenre = async (req, res) => {
  const g = bodyGenre(req.body || {});
  const msg = validasi(g);
  if (msg) return res.status(400).json({ message: msg });

  const w = warnaFinal(g);
  try {
    const [r] = await db.query(
      "UPDATE genres SET genre_name = ?, color_bg = ?, color_text = ?, color_swatch = ? WHERE id = ?",
      [g.nama, w.bg, w.text, w.swatch, req.params.id]
    );
    if (r.affectedRows === 0) {
      return res.status(404).json({ message: "Genre tidak ditemukan." });
    }
    res.json({ ok: true });
  } catch (err) {
    if (err.code === "ER_DUP_ENTRY") {
      return res.status(409).json({ message: "Genre dengan nama ini sudah ada." });
    }
    serverError(res, err);
  }
};

/* DELETE /api/genre/:id */
export const deleteGenre = async (req, res) => {
  try {
    const [rows] = await db.query(`${SELECT_GENRE} WHERE g.id = ?`, [req.params.id]);
    if (!rows.length) return res.status(404).json({ message: "Genre tidak ditemukan." });

    // artists.genre_id = ON DELETE RESTRICT, jadi genre yang masih dipakai artis tidak boleh dihapus
    if (Number(rows[0].jumlah_artis) > 0) {
      return res.status(409).json({
        message: `Genre masih dipakai ${rows[0].jumlah_artis} artis. Pindahkan artisnya ke genre lain dulu.`,
      });
    }

    // events.genre_id = ON DELETE SET NULL, event tidak ikut terhapus tapi kehilangan genre
    if (Number(rows[0].jumlah_event) > 0 && req.query.paksa !== "1") {
      return res.status(409).json({
        message: `Genre masih dipakai ${rows[0].jumlah_event} event. Event tersebut akan kehilangan genre.`,
        perluKonfirmasi: true, // kirim ulang dengan ?paksa=1 kalau admin tetap ingin menghapus
      });
    }

    await db.query("DELETE FROM genres WHERE id = ?", [req.params.id]);
    res.json({ ok: true });
  } catch (err) {
    if (err.code === "ER_ROW_IS_REFERENCED_2") {
      return res.status(409).json({ message: "Genre masih dipakai data lain dan tidak bisa dihapus." });
    }
    serverError(res, err);
  }
};