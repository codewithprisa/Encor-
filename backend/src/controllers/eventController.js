import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import db from "../config/db.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DEFAULT_ADMIN_ID = 1; // dipakai kalau belum ada req.user dari authMiddleware

// backend/src/controllers -> backend/uploads (sama dengan folder yang di-serve di server.js)
const UPLOAD_DIR = path.join(__dirname, "..", "..", "uploads");
const POSTER_DIR = path.join(UPLOAD_DIR, "poster"); // poster baru disimpan di sini
fs.mkdirSync(POSTER_DIR, { recursive: true });

const MAX_POSTER_BYTES = 5 * 1024 * 1024;

const STATUS_UI = { draft: "Draft", published: "Published", closed: "Closed" };
const RE_TGL = /^\d{4}-\d{2}-\d{2}$/;
const RE_JAM = /^\d{2}:\d{2}$/;

function formatTanggal(d) {
  if (!d) return "-";
  return new Date(d).toLocaleDateString("id-ID", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

const pad2 = (n) => String(n).padStart(2, "0");

/* Date -> "YYYY-MM-DD" (untuk <input type="date">), pakai jam lokal server supaya tidak geser hari. */
function keInputTanggal(d) {
  if (!d) return "";
  const dt = new Date(d);
  return `${dt.getFullYear()}-${pad2(dt.getMonth() + 1)}-${pad2(dt.getDate())}`;
}

/* Date -> "HH:MM" (untuk <input type="time">) */
function keInputJam(d) {
  if (!d) return "";
  const dt = new Date(d);
  return `${pad2(dt.getHours())}:${pad2(dt.getMinutes())}`;
}

function serverError(res, err) {
  console.error(err);
  res.status(500).json({ message: "Terjadi kesalahan pada server." });
}

/* Base URL mengikuti alamat yang dipakai client (localhost dari web admin, IP LAN dari HP). */
function baseUrl(req) {
  return `${req.protocol}://${req.get("host")}`;
}

/*
 * URL poster, atau null kalau kosong / file fisiknya tidak ada.
 * Cek uploads/poster dulu, lalu uploads/ (untuk poster lama yang terlanjur di root).
 */
function urlPoster(req, filename) {
  if (!filename) return null;
  const enc = encodeURIComponent(filename);
  if (fs.existsSync(path.join(POSTER_DIR, filename))) {
    return `${baseUrl(req)}/uploads/poster/${enc}`;
  }
  if (fs.existsSync(path.join(UPLOAD_DIR, filename))) {
    return `${baseUrl(req)}/uploads/${enc}`;
  }
  return null;
}

/*
 * URL gambar umum (foto artis, dll). Mencari di uploads/<folder>/ lalu uploads/.
 * Mengembalikan null kalau file tidak ada.
 */
function urlGambar(req, value, folders = []) {
  if (!value) return null;
  if (/^https?:\/\//i.test(value)) return value;

  const clean = String(value).replace(/^\/+/, "").replace(/^uploads\//, "");
  const kandidat = [...folders.map((f) => `${f}/${clean}`), clean];

  for (const k of kandidat) {
    if (fs.existsSync(path.join(UPLOAD_DIR, k))) {
      const enc = k.split("/").map(encodeURIComponent).join("/");
      return `${baseUrl(req)}/uploads/${enc}`;
    }
  }
  return null;
}

/* Simpan poster dari data URL base64 ke uploads/poster. Return nama file, atau null kalau kosong. */
function simpanPoster(dataUrl) {
  if (!dataUrl) return null;
  const m = /^data:image\/(png|jpeg|jpg|webp|gif);base64,(.+)$/.exec(dataUrl);
  if (!m) throw new Error("POSTER_INVALID");

  const buffer = Buffer.from(m[2], "base64");
  if (buffer.length > MAX_POSTER_BYTES) throw new Error("POSTER_TOO_BIG");

  const ext = m[1] === "jpeg" ? "jpg" : m[1];
  const filename = Date.now() + "-" + Math.round(Math.random() * 1e6) + "." + ext;
  fs.writeFileSync(path.join(POSTER_DIR, filename), buffer);
  return filename;
}

/* Hapus file poster di folder baru, atau di root kalau itu poster lama. */
function hapusFile(filename) {
  if (!filename) return;
  fs.unlink(path.join(POSTER_DIR, filename), (err) => {
    if (err) fs.unlink(path.join(UPLOAD_DIR, filename), () => {});
  });
}

/* Balas 400 untuk error poster. Return true kalau error-nya memang soal poster. */
function balasErrorPoster(res, err) {
  if (err.message === "POSTER_TOO_BIG") {
    res.status(400).json({ message: "Ukuran poster maksimal 5MB." });
    return true;
  }
  if (err.message === "POSTER_INVALID") {
    res
      .status(400)
      .json({ message: "Format poster tidak valid (gunakan PNG, JPG, WEBP, atau GIF)." });
    return true;
  }
  return false;
}

/*
 * Baca & validasi body event (dipakai create dan update).
 * Kolom event_date, ticket_open, ticket_close di database NOT NULL, jadi wajib diisi.
 * Return { error } atau { data }.
 */
function bacaBody(b) {
  const judul = String(b.judul || "").trim();
  if (!judul) return { error: "Judul konser wajib diisi." };

  const tanggal = String(b.tanggal || "").trim();
  if (!RE_TGL.test(tanggal)) return { error: "Tanggal pelaksanaan wajib diisi." };
  const waktu = RE_JAM.test(String(b.waktu || "")) ? String(b.waktu) : "00:00";

  const jualMulai = String(b.jualMulai || "").trim();
  const jualSelesai = String(b.jualSelesai || "").trim();
  if (!RE_TGL.test(jualMulai)) return { error: "Tanggal mulai penjualan wajib diisi." };
  if (!RE_TGL.test(jualSelesai)) return { error: "Tanggal selesai penjualan wajib diisi." };
  if (jualSelesai < jualMulai) {
    return { error: "Penjualan tiket tidak boleh berakhir sebelum dimulai." };
  }

  const statusIn = String(b.status || "").toLowerCase();
  const status = ["draft", "published", "closed"].includes(statusIn) ? statusIn : "draft";

  return {
    data: {
      judul,
      deskripsi: String(b.deskripsi || "").trim(), // kolom description NOT NULL
      venue: String(b.venue || "").trim(),
      venueTipe: String(b.venueTipe || "").toLowerCase(),
      genre: String(b.genre || "").trim(),
      artis: (Array.isArray(b.artis) ? b.artis : [])
        .map((x) => String(x || "").trim())
        .filter(Boolean),
      eventDate: `${tanggal} ${waktu}:00`,
      ticketOpen: `${jualMulai} 00:00:00`,
      ticketClose: `${jualSelesai} 23:59:59`, // tiket dijual sampai akhir hari terakhir
      syarat: String(b.syarat || "").trim() || null,
      refundOtomatis: b.refundOtomatis === true,
      status,
    },
  };
}

async function getOrCreateGenre(conn, nama) {
  if (!nama) return null;
  const [rows] = await conn.query("SELECT id FROM genres WHERE genre_name = ?", [nama]);
  if (rows.length) return rows[0].id;
  const [ins] = await conn.query("INSERT INTO genres (genre_name) VALUES (?)", [nama]);
  return ins.insertId;
}

/* tipe venue: "festival" atau "seated" (default seated kalau tidak dikirim) */
async function getOrCreateVenue(conn, nama, tipe) {
  if (!nama) return null;
  const [rows] = await conn.query("SELECT id FROM venues WHERE venue_name = ?", [nama]);
  if (rows.length) return rows[0].id;
  const seatType = tipe === "festival" ? "festival" : "seated";
  const [ins] = await conn.query(
    "INSERT INTO venues (venue_name, address, city, capacity, seat_type) VALUES (?, ?, '-', 0, ?)",
    [nama, nama, seatType]
  );
  return ins.insertId;
}

async function getOrCreateArtist(conn, nama, genreId) {
  const [rows] = await conn.query("SELECT id FROM artists WHERE artist_name = ?", [nama]);
  if (rows.length) return rows[0].id;
  const [ins] = await conn.query(
    "INSERT INTO artists (artist_name, genre_id) VALUES (?, ?)",
    [nama, genreId]
  );
  return ins.insertId;
}

async function resolveArtis(conn, daftarNama, genreId) {
  const ids = [];
  for (const nama of daftarNama) {
    const id = await getOrCreateArtist(conn, nama, genreId);
    if (!ids.includes(id)) ids.push(id);
  }
  return ids;
}

/* GET /api/events  (opsional: ?status=published untuk aplikasi pengguna) */
export const getEvents = async (req, res) => {
  try {
    const statusQ = String(req.query.status || "").toLowerCase();
    const filterStatus = ["draft", "published", "closed"].includes(statusQ);

    // kapasitas, terjual & harga pakai subquery supaya tidak terjadi JOIN fan-out
    const [rows] = await db.query(
      `
      SELECT e.id, e.title, e.poster, e.event_date, e.status,
             g.genre_name, v.venue_name, v.city,
             (SELECT GROUP_CONCAT(a.artist_name SEPARATOR ', ')
                FROM event_artists ea
                JOIN artists a ON a.id = ea.artist_id
               WHERE ea.event_id = e.id) AS artis,
             (SELECT COALESCE(SUM(quota), 0) FROM ticket_types WHERE event_id = e.id) AS kapasitas,
             (SELECT COALESCE(SUM(sold), 0)  FROM ticket_types WHERE event_id = e.id) AS terjual,
             (SELECT MIN(price) FROM ticket_types
               WHERE event_id = e.id AND status = 'active') AS harga_mulai
        FROM events e
        LEFT JOIN genres g ON g.id = e.genre_id
        LEFT JOIN venues v ON v.id = e.venue_id
        ${filterStatus ? "WHERE e.status = ?" : ""}
       ORDER BY e.created_at DESC, e.id DESC
      `,
      filterStatus ? [statusQ] : []
    );

    res.json(
      rows.map((r) => ({
        id: r.id,
        poster: urlPoster(req, r.poster),
        judul: r.title,
        artis: r.artis || "-",
        genre: r.genre_name || "Pop",
        lokasi: r.venue_name
          ? r.city && r.city !== "-"
            ? `${r.city} • ${r.venue_name}`
            : r.venue_name
          : "-",
        venue: r.venue_name || "",
        kota: r.city && r.city !== "-" ? r.city : "",
        tanggal: formatTanggal(r.event_date),
        status: STATUS_UI[r.status] || "Draft",
        terjual: Number(r.terjual),
        kapasitas: Number(r.kapasitas),
        hargaMulai: r.harga_mulai != null ? Number(r.harga_mulai) : null,
      }))
    );
  } catch (err) {
    serverError(res, err);
  }
};

/* GET /api/events/:id  — data lengkap (form edit admin + detail di aplikasi) */
export const getEventById = async (req, res) => {
  try {
    const [rows] = await db.query(
      `SELECT e.*, g.genre_name, v.venue_name, v.seat_type,
              v.address AS venue_address, v.city AS venue_city
         FROM events e
         LEFT JOIN genres g ON g.id = e.genre_id
         LEFT JOIN venues v ON v.id = e.venue_id
        WHERE e.id = ?`,
      [req.params.id]
    );
    if (!rows.length) return res.status(404).json({ message: "Event tidak ditemukan." });
    const e = rows[0];

    // Artis + foto (kolom artists: id, genre_id, artist_name, photo, description)
    const [artisRows] = await db.query(
      `SELECT a.id, a.artist_name, a.photo
         FROM event_artists ea
         JOIN artists a ON a.id = ea.artist_id
        WHERE ea.event_id = ?
        ORDER BY ea.id ASC`,
      [e.id]
    );
    let artisData = artisRows;

    // data lama: artis hanya tercatat di events.artist_id
    if (!artisData.length && e.artist_id) {
      const [a] = await db.query(
        "SELECT id, artist_name, photo FROM artists WHERE id = ?",
        [e.artist_id]
      );
      artisData = a;
    }

    const lineup = artisData.map((a) => ({
      nama: a.artist_name || "",
      foto: urlGambar(req, a.photo, ["artis", "artist"]),
    }));
    const artis = lineup.map((a) => a.nama).filter(Boolean);

    // Kategori tiket asli dari admin (ticket_types)
    const [tierRows] = await db.query(
      `SELECT id, ticket_name, description, ticket_kind, price, quota, sold,
              color, sale_start, sale_end, status
         FROM ticket_types
        WHERE event_id = ? AND status = 'active'
        ORDER BY price DESC, id ASC`,
      [e.id]
    );

    const kategori = tierRows.map((t) => {
      const kuota = Number(t.quota || 0);
      const terjual = Number(t.sold || 0);
      return {
        id: t.id,
        nama: t.ticket_name,
        harga: Number(t.price),
        kuota,
        terjual,
        sisa: Math.max(0, kuota - terjual),
        jenis: t.ticket_kind, // "seated" | "festival"
        warna: t.color || null,
        fasilitas: t.description || "",
        periode:
          t.sale_start && t.sale_end
            ? `${formatTanggal(t.sale_start)} – ${formatTanggal(t.sale_end)}`
            : "",
      };
    });

    res.json({
      id: e.id,
      judul: e.title,
      deskripsi: e.description || "",
      venue: e.venue_name || "",
      venueTipe: e.seat_type || "seated",
      alamat: e.venue_address || "",
      kota: e.venue_city && e.venue_city !== "-" ? e.venue_city : "",
      genre: e.genre_name || "",
      artis, // array nama (dipakai form edit admin)
      lineup, // [{ nama, foto }] (dipakai aplikasi)
      kategori, // [{ id, nama, harga, sisa, jenis, warna, fasilitas, periode }]
      tanggal: keInputTanggal(e.event_date),
      waktu: keInputJam(e.event_date),
      jualMulai: keInputTanggal(e.ticket_open),
      jualSelesai: keInputTanggal(e.ticket_close),
      syarat: e.terms_conditions || "",
      refundOtomatis: e.refund_policy === "AUTO",
      refund:
        e.refund_policy === "AUTO"
          ? "Refund diproses otomatis."
          : e.refund_policy && e.refund_policy !== "MANUAL"
          ? e.refund_policy
          : "Refund diproses manual oleh admin.",
      status: STATUS_UI[e.status] || "Draft",
      poster: urlPoster(req, e.poster),
    });
  } catch (err) {
    serverError(res, err);
  }
};

/* POST /api/events  (JSON, poster = data URL base64) */
export const createEvent = async (req, res) => {
  const parsed = bacaBody(req.body || {});
  if (parsed.error) return res.status(400).json({ message: parsed.error });
  const d = parsed.data;

  const refund = d.refundOtomatis ? "AUTO" : "MANUAL";
  const adminId = (req.user && req.user.id) || DEFAULT_ADMIN_ID;

  let posterFile = null;
  try {
    posterFile = simpanPoster((req.body || {}).poster);
  } catch (err) {
    if (balasErrorPoster(res, err)) return;
    return serverError(res, err);
  }

  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();

    const genreId = await getOrCreateGenre(conn, d.genre);
    const venueId = await getOrCreateVenue(conn, d.venue, d.venueTipe);
    const artistIds = await resolveArtis(conn, d.artis, genreId);

    const [ins] = await conn.query(
      `INSERT INTO events
        (admin_id, venue_id, title, description, artist_id, genre_id,
         event_date, ticket_open, ticket_close, poster, terms_conditions, refund_policy, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        adminId,
        venueId,
        d.judul,
        d.deskripsi,
        artistIds[0] || null,
        genreId,
        d.eventDate,
        d.ticketOpen,
        d.ticketClose,
        posterFile,
        d.syarat,
        refund,
        d.status,
      ]
    );

    for (const aid of artistIds) {
      await conn.query(
        "INSERT IGNORE INTO event_artists (event_id, artist_id) VALUES (?, ?)",
        [ins.insertId, aid]
      );
    }

    await conn.commit();
    res.status(201).json({ id: ins.insertId });
  } catch (err) {
    await conn.rollback();
    hapusFile(posterFile); // jangan tinggalkan file yatim kalau insert gagal
    serverError(res, err);
  } finally {
    conn.release();
  }
};

/*
 * PUT /api/events/:id  (JSON, field sama dengan create)
 *  - poster berisi data URL baru -> poster diganti (file lama dihapus)
 *  - hapusPoster: true           -> poster dikosongkan
 *  - selain itu                  -> poster lama dipertahankan
 *  - daftar artis diganti sesuai yang dikirim
 */
export const updateEvent = async (req, res) => {
  const b = req.body || {};
  const parsed = bacaBody(b);
  if (parsed.error) return res.status(400).json({ message: parsed.error });
  const d = parsed.data;

  let posterBaru = null;
  try {
    posterBaru = simpanPoster(b.poster);
  } catch (err) {
    if (balasErrorPoster(res, err)) return;
    return serverError(res, err);
  }

  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();

    const [[lama]] = await conn.query(
      "SELECT id, poster, refund_policy FROM events WHERE id = ? FOR UPDATE",
      [req.params.id]
    );
    if (!lama) {
      await conn.rollback();
      hapusFile(posterBaru);
      return res.status(404).json({ message: "Event tidak ditemukan." });
    }

    let posterFinal = lama.poster;
    if (posterBaru) posterFinal = posterBaru;
    else if (b.hapusPoster === true) posterFinal = null;

    // refund_policy: toggle ON -> AUTO. Toggle OFF -> MANUAL, kecuali teks kebijakan lama
    // (bukan AUTO/MANUAL) dibiarkan supaya tidak hilang.
    let refund;
    if (d.refundOtomatis) refund = "AUTO";
    else if (lama.refund_policy === "AUTO" || !lama.refund_policy) refund = "MANUAL";
    else refund = lama.refund_policy;

    const genreId = await getOrCreateGenre(conn, d.genre);
    const venueId = await getOrCreateVenue(conn, d.venue, d.venueTipe);
    const artistIds = await resolveArtis(conn, d.artis, genreId);

    await conn.query(
      `UPDATE events
          SET venue_id = ?, title = ?, description = ?, artist_id = ?, genre_id = ?,
              event_date = ?, ticket_open = ?, ticket_close = ?, poster = ?,
              terms_conditions = ?, refund_policy = ?, status = ?
        WHERE id = ?`,
      [
        venueId,
        d.judul,
        d.deskripsi,
        artistIds[0] || null,
        genreId,
        d.eventDate,
        d.ticketOpen,
        d.ticketClose,
        posterFinal,
        d.syarat,
        refund,
        d.status,
        lama.id,
      ]
    );

    await conn.query("DELETE FROM event_artists WHERE event_id = ?", [lama.id]);
    for (const aid of artistIds) {
      await conn.query(
        "INSERT IGNORE INTO event_artists (event_id, artist_id) VALUES (?, ?)",
        [lama.id, aid]
      );
    }

    await conn.commit();
    if (posterFinal !== lama.poster) hapusFile(lama.poster);
    res.json({ ok: true, id: lama.id });
  } catch (err) {
    await conn.rollback();
    hapusFile(posterBaru);
    serverError(res, err);
  } finally {
    conn.release();
  }
};

/*
 * DELETE /api/events/:id
 *  - ditolak (409) kalau sudah ada tiket terjual
 *  - ditolak (409) kalau masih direferensikan tabel lain (order, review, wishlist, dll.)
 *  - hapus data turunan -> hapus event -> hapus file poster
 */
export const deleteEvent = async (req, res) => {
  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();

    const [[ev]] = await conn.query(
      "SELECT id, poster FROM events WHERE id = ? FOR UPDATE",
      [req.params.id]
    );
    if (!ev) {
      await conn.rollback();
      return res.status(404).json({ message: "Event tidak ditemukan." });
    }

    const [[tt]] = await conn.query(
      "SELECT COALESCE(SUM(sold), 0) AS terjual FROM ticket_types WHERE event_id = ?",
      [ev.id]
    );
    if (Number(tt.terjual) > 0) {
      await conn.rollback();
      return res.status(409).json({
        message: "Event tidak bisa dihapus karena sudah ada tiket terjual. Ubah statusnya menjadi Closed.",
      });
    }

    // data turunan (sesuaikan nama tabel/kolom seats kalau berbeda)
    await conn.query("DELETE FROM event_artists WHERE event_id = ?", [ev.id]);
    await conn.query("DELETE FROM seats WHERE event_id = ?", [ev.id]);
    await conn.query("DELETE FROM ticket_types WHERE event_id = ?", [ev.id]);

    await conn.query("DELETE FROM events WHERE id = ?", [ev.id]);

    await conn.commit();
    hapusFile(ev.poster); // hapus file setelah commit berhasil
    res.json({ ok: true, id: ev.id });
  } catch (err) {
    await conn.rollback();
    // 1451 = masih dipakai tabel lain lewat foreign key
    if (err.errno === 1451) {
      return res.status(409).json({
        message: "Event tidak bisa dihapus karena masih terhubung dengan data lain (pesanan, ulasan, dll.).",
      });
    }
    serverError(res, err);
  } finally {
    conn.release();
  }
};

/*
 * PATCH /api/events/:id/status
 * Mengubah status event secara cepat: Draft, Published, Closed
 */
export const updateEventStatus = async (req, res) => {
  try {
    const { status } = req.body || {};
    const valid = ["draft", "published", "closed"];
    const norm = String(status || "").toLowerCase();
    if (!valid.includes(norm)) {
      return res.status(400).json({ message: "Status tidak valid. Gunakan Draft, Published, atau Closed." });
    }

    const [r] = await db.query("UPDATE events SET status = ? WHERE id = ?", [norm, req.params.id]);
    if (r.affectedRows === 0) {
      return res.status(404).json({ message: "Event tidak ditemukan." });
    }

    res.json({ ok: true, id: Number(req.params.id), status: STATUS_UI[norm] || norm });
  } catch (err) {
    serverError(res, err);
  }
};