import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import db from "../config/db.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const BASE_URL = "http://localhost:3001";

// backend/src/controllers -> backend/uploads/artis (di-serve lewat /uploads/artis/...)
const UPLOAD_ROOT = path.join(__dirname, "..", "..", "uploads");
const ARTIS_DIR = path.join(UPLOAD_ROOT, "artis");
fs.mkdirSync(ARTIS_DIR, { recursive: true });

const MAX_FOTO_BYTES = 5 * 1024 * 1024;

function serverError(res, err) {
  console.error(err);
  res.status(500).json({ message: "Terjadi kesalahan pada server." });
}

/* URL foto, atau null kalau kosong / file fisiknya tidak ada (frontend tampilkan inisial/placeholder). */
function urlFoto(filename) {
  if (!filename) return null;
  if (!fs.existsSync(path.join(ARTIS_DIR, filename))) return null;
  return `${BASE_URL}/uploads/artis/${encodeURIComponent(filename)}`;
}

/* Simpan foto dari data URL base64 ke uploads/artis. Return nama file, atau null kalau kosong. */
function simpanFoto(dataUrl) {
  if (!dataUrl) return null;
  const m = /^data:image\/(png|jpeg|jpg|webp|gif);base64,(.+)$/.exec(dataUrl);
  if (!m) throw new Error("FOTO_INVALID");

  const buffer = Buffer.from(m[2], "base64");
  if (buffer.length > MAX_FOTO_BYTES) throw new Error("FOTO_TOO_BIG");

  const ext = m[1] === "jpeg" ? "jpg" : m[1];
  const filename = "artis-" + Date.now() + "-" + Math.round(Math.random() * 1e6) + "." + ext;
  fs.writeFileSync(path.join(ARTIS_DIR, filename), buffer);
  return filename;
}

function hapusFile(filename) {
  if (!filename) return;
  fs.unlink(path.join(ARTIS_DIR, filename), () => {});
}

/* Balas 400 untuk error foto. Return true kalau error-nya memang soal foto. */
function balasErrorFoto(res, err) {
  if (err.message === "FOTO_TOO_BIG") {
    res.status(400).json({ message: "Ukuran foto maksimal 5MB." });
    return true;
  }
  if (err.message === "FOTO_INVALID") {
    res.status(400).json({ message: "Format foto tidak valid (gunakan PNG, JPG, WEBP, atau GIF)." });
    return true;
  }
  return false;
}

// jumlah event dihitung dari events.artist_id DAN event_artists, tanpa dobel hitung
const SELECT_ARTIS = `
  SELECT a.id, a.artist_name, a.photo, a.description, a.genre_id,
         g.genre_name, g.color_bg, g.color_text, g.color_swatch,
         (SELECT COUNT(*) FROM events e
           WHERE e.artist_id = a.id
              OR e.id IN (SELECT ea.event_id FROM event_artists ea WHERE ea.artist_id = a.id)
         ) AS jumlah_event
    FROM artists a
    LEFT JOIN genres g ON g.id = a.genre_id
`;

function mapArtis(r) {
  return {
    id: r.id,
    nama: r.artist_name,
    foto: urlFoto(r.photo),
    deskripsi: r.description || "",
    genreId: r.genre_id,
    genre: r.genre_name || "-",
    genreWarna: {
      bg: r.color_bg,
      text: r.color_text,
      swatch: r.color_swatch,
    },
    jumlahEvent: Number(r.jumlah_event),
  };
}

/* Cari id genre dari body: genreId (prioritas) atau nama genre. */
async function cariGenreId(b) {
  if (b.genreId) {
    const [rows] = await db.query("SELECT id FROM genres WHERE id = ?", [b.genreId]);
    return rows[0]?.id ?? null;
  }
  if (b.genre && String(b.genre).trim()) {
    const [rows] = await db.query("SELECT id FROM genres WHERE genre_name = ?", [
      String(b.genre).trim(),
    ]);
    return rows[0]?.id ?? null;
  }
  return null;
}

/* GET /api/artis?q=&genre=<genreId>  */
export const getArtists = async (req, res) => {
  try {
    const where = [];
    const params = [];
    if (req.query.q && String(req.query.q).trim()) {
      where.push("a.artist_name LIKE ?");
      params.push(`%${String(req.query.q).trim()}%`);
    }
    if (req.query.genre && /^\d+$/.test(String(req.query.genre))) {
      where.push("a.genre_id = ?");
      params.push(Number(req.query.genre));
    }
    const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";

    const [rows] = await db.query(
      `${SELECT_ARTIS} ${whereSql} ORDER BY a.artist_name ASC`,
      params
    );
    res.json(rows.map(mapArtis));
  } catch (err) {
    serverError(res, err);
  }
};

/* GET /api/artis/:id */
export const getArtistById = async (req, res) => {
  try {
    const [rows] = await db.query(`${SELECT_ARTIS} WHERE a.id = ?`, [req.params.id]);
    if (!rows.length) return res.status(404).json({ message: "Artis tidak ditemukan." });
    res.json(mapArtis(rows[0]));
  } catch (err) {
    serverError(res, err);
  }
};

/* GET /api/artis/genres */
export const getGenres = async (req, res) => {
  try {
    const [rows] = await db.query(
      "SELECT id, genre_name, color_bg, color_text, color_swatch FROM genres ORDER BY genre_name ASC"
    );
    res.json(
      rows.map((r) => ({
        id: r.id,
        nama: r.genre_name,
        warna: { bg: r.color_bg, text: r.color_text, swatch: r.color_swatch },
      }))
    );
  } catch (err) {
    serverError(res, err);
  }
};

/* POST /api/artis  (JSON: nama, genreId | genre, deskripsi, foto = data URL base64) */
export const createArtist = async (req, res) => {
  const b = req.body || {};
  const nama = String(b.nama || "").trim();
  if (!nama) return res.status(400).json({ message: "Nama artis wajib diisi." });

  let fotoFile = null;
  try {
    const genreId = await cariGenreId(b);
    if (!genreId) return res.status(400).json({ message: "Genre utama wajib dipilih." });

    const [dup] = await db.query("SELECT id FROM artists WHERE artist_name = ?", [nama]);
    if (dup.length) return res.status(409).json({ message: "Artis dengan nama ini sudah ada." });

    fotoFile = simpanFoto(b.foto);

    const [ins] = await db.query(
      "INSERT INTO artists (genre_id, artist_name, photo, description) VALUES (?, ?, ?, ?)",
      [genreId, nama, fotoFile, String(b.deskripsi || "").trim() || null]
    );
    res.status(201).json({ id: ins.insertId });
  } catch (err) {
    hapusFile(fotoFile); // jangan tinggalkan file yatim kalau insert gagal
    if (balasErrorFoto(res, err)) return;
    serverError(res, err);
  }
};

/*
 * PUT /api/artis/:id
 *  - foto berisi data URL baru  -> ganti foto
 *  - hapusFoto: true            -> foto dikosongkan
 *  - selain itu                 -> foto lama dipertahankan
 */
export const updateArtist = async (req, res) => {
  const b = req.body || {};
  const nama = String(b.nama || "").trim();
  if (!nama) return res.status(400).json({ message: "Nama artis wajib diisi." });

  let fotoBaru = null;
  try {
    const [rows] = await db.query("SELECT id, photo FROM artists WHERE id = ?", [req.params.id]);
    if (!rows.length) return res.status(404).json({ message: "Artis tidak ditemukan." });
    const lama = rows[0];

    const genreId = await cariGenreId(b);
    if (!genreId) return res.status(400).json({ message: "Genre utama wajib dipilih." });

    const [dup] = await db.query(
      "SELECT id FROM artists WHERE artist_name = ? AND id <> ?",
      [nama, req.params.id]
    );
    if (dup.length) return res.status(409).json({ message: "Artis dengan nama ini sudah ada." });

    let fotoFinal = lama.photo;
    if (b.foto) {
      fotoBaru = simpanFoto(b.foto);
      fotoFinal = fotoBaru;
    } else if (b.hapusFoto === true) {
      fotoFinal = null;
    }

    await db.query(
      "UPDATE artists SET genre_id = ?, artist_name = ?, photo = ?, description = ? WHERE id = ?",
      [genreId, nama, fotoFinal, String(b.deskripsi || "").trim() || null, req.params.id]
    );

    if (fotoFinal !== lama.photo) hapusFile(lama.photo);
    res.json({ ok: true });
  } catch (err) {
    hapusFile(fotoBaru);
    if (balasErrorFoto(res, err)) return;
    serverError(res, err);
  }
};

/* DELETE /api/artis/:id */
export const deleteArtist = async (req, res) => {
  try {
    const [rows] = await db.query(`${SELECT_ARTIS} WHERE a.id = ?`, [req.params.id]);
    if (!rows.length) return res.status(404).json({ message: "Artis tidak ditemukan." });

    if (Number(rows[0].jumlah_event) > 0) {
      return res.status(409).json({
        message: `Artis masih terhubung dengan ${rows[0].jumlah_event} event. Lepaskan dari event dulu sebelum dihapus.`,
      });
    }

    await db.query("DELETE FROM artists WHERE id = ?", [req.params.id]);
    hapusFile(rows[0].photo);
    res.json({ ok: true });
  } catch (err) {
    serverError(res, err);
  }
};