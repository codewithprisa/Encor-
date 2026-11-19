// backend/src/controllers/wishlistController.js
//
// PENTING: samakan import `db` di bawah dengan yang dipakai controller lain
// (buka profileController.js atau notificationController.js dan salin baris import db-nya).
import db from "../config/db.js";

/** Ambil id user dari token. Sesuaikan jika middleware auth kamu menyimpannya di field lain. */
const getUserId = (req) => req.user?.id ?? req.user?.userId ?? req.user?.id_user ?? req.userId;

/* ---------------------------------------------------------------------
 * Nama tabel wishlist dicari otomatis di database (mis. wishlist / wishlists /
 * favorit). Jika belum ada sama sekali, tabel `wishlist` dibuat otomatis.
 * ------------------------------------------------------------------- */
let tablePromise = null;

async function resolveTable() {
  const [rows] = await db.query("SHOW TABLES");
  const names = rows.map((r) => String(Object.values(r)[0]));
  const found =
    names.find((n) => /^wishlists?$/i.test(n)) ?? names.find((n) => /wish|favor|favorit/i.test(n));

  if (found) {
    console.log("[WISHLIST] memakai tabel:", found);
    return found;
  }

  await db.query(`
    CREATE TABLE IF NOT EXISTS wishlist (
      id INT AUTO_INCREMENT PRIMARY KEY,
      user_id INT NOT NULL,
      event_id INT NOT NULL,
      created_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
      KEY idx_wishlist_user (user_id),
      KEY idx_wishlist_event (event_id)
    )
  `);
  console.log("[WISHLIST] tabel wishlist dibuat otomatis");
  return "wishlist";
}

async function T() {
  if (!tablePromise) {
    tablePromise = resolveTable().catch((err) => {
      tablePromise = null; // coba lagi di request berikutnya
      throw err;
    });
  }
  const name = await tablePromise;
  return "`" + name.replace(/`/g, "``") + "`";
}

/** GET /api/wishlist -> daftar event favorit milik user (terbaru dulu) */
export const getWishlist = async (req, res) => {
  try {
    const userId = getUserId(req);
    const table = await T();
    const [rows] = await db.query(
      `SELECT id, event_id, created_at FROM ${table} WHERE user_id = ? ORDER BY created_at DESC, id DESC`,
      [userId]
    );
    res.json({ success: true, data: rows });
  } catch (err) {
    console.error("[WISHLIST] getWishlist:", err);
    res.status(500).json({ success: false, message: "Gagal memuat wishlist." });
  }
};

/** POST /api/wishlist/:eventId -> tambah ke favorit (aman dipanggil berulang) */
export const addWishlist = async (req, res) => {
  try {
    const userId = getUserId(req);
    const eventId = Number(req.params.eventId);
    if (!eventId) return res.status(400).json({ success: false, message: "ID event tidak valid." });

    const table = await T();

    // Cek dulu agar tidak dobel, tanpa bergantung pada unique key di tabel
    const [exists] = await db.query(
      `SELECT id FROM ${table} WHERE user_id = ? AND event_id = ? LIMIT 1`,
      [userId, eventId]
    );
    if (exists.length > 0) {
      return res.json({ success: true, message: "Sudah ada di wishlist." });
    }

    await db.query(`INSERT INTO ${table} (user_id, event_id) VALUES (?, ?)`, [userId, eventId]);
    res.status(201).json({ success: true, message: "Ditambahkan ke wishlist." });
  } catch (err) {
    if (err?.code === "ER_NO_REFERENCED_ROW_2") {
      return res.status(404).json({ success: false, message: "Event tidak ditemukan." });
    }
    console.error("[WISHLIST] addWishlist:", err);
    res.status(500).json({ success: false, message: "Gagal menambah ke wishlist." });
  }
};

/** DELETE /api/wishlist/:eventId -> hapus dari favorit */
export const removeWishlist = async (req, res) => {
  try {
    const userId = getUserId(req);
    const eventId = Number(req.params.eventId);
    if (!eventId) return res.status(400).json({ success: false, message: "ID event tidak valid." });

    const table = await T();
    await db.query(`DELETE FROM ${table} WHERE user_id = ? AND event_id = ?`, [userId, eventId]);
    res.json({ success: true, message: "Dihapus dari wishlist." });
  } catch (err) {
    console.error("[WISHLIST] removeWishlist:", err);
    res.status(500).json({ success: false, message: "Gagal menghapus dari wishlist." });
  }
};