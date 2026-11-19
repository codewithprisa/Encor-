import fs from "fs";
import db from "../config/db.js";

function hapusFile(file) {
  if (file?.path) {
    fs.unlink(file.path, () => {});
  }
}

/*
 * POST /api/pembayaran/:orderId/bukti
 * multipart/form-data, field: "bukti"
 *
 * User mengunggah bukti pembayaran.
 * Status tetap pending sampai admin menyetujui bukti.
 */
export const uploadBukti = async (req, res) => {
  if (!req.file) {
    return res.status(400).json({
      message: "File bukti pembayaran wajib diunggah.",
    });
  }

  const orderId = Number(req.params.orderId);
  const userId = req.user?.id;

  const conn = await db.getConnection();

  try {
    await conn.beginTransaction();

    // Pastikan pesanan milik user yang login.
    const [[order]] = await conn.query(
      `SELECT
         id,
         invoice_number,
         total_amount,
         payment_method,
         payment_status
       FROM orders
       WHERE id = ? AND user_id = ?
       FOR UPDATE`,
      [orderId, userId]
    );

    if (!order) {
      await conn.rollback();
      hapusFile(req.file);

      return res.status(404).json({
        message: "Pesanan tidak ditemukan.",
      });
    }

    if (order.payment_status !== "pending") {
      await conn.rollback();
      hapusFile(req.file);

      return res.status(409).json({
        message: "Pesanan ini sudah diproses sebelumnya.",
      });
    }

    // Simpan bukti tanpa mengubah status menjadi paid.
    const [upd] = await conn.query(
      `UPDATE payments
       SET payment_proof = ?, payment_date = NOW()
       WHERE order_id = ?`,
      [req.file.filename, orderId]
    );

    // Buat data pembayaran jika belum ada.
    if (upd.affectedRows === 0) {
      await conn.query(
        `INSERT INTO payments (
          order_id,
          payment_method,
          amount,
          payment_status,
          payment_proof,
          payment_date
        )
        VALUES (?, ?, ?, 'pending', ?, NOW())`,
        [
          orderId,
          order.payment_method,
          order.total_amount,
          req.file.filename,
        ]
      );
    }

    // Jangan panggil tandaiLunas() di sini.
    // Pembayaran masih menunggu pemeriksaan admin.

    await conn.commit();

    return res.json({
      ok: true,
      status: "Menunggu",
      message:
        "Bukti pembayaran berhasil diunggah. Menunggu verifikasi admin.",
    });
  } catch (err) {
    await conn.rollback();
    hapusFile(req.file);

    console.error("Upload bukti pembayaran gagal:", err);

    return res.status(500).json({
      message: "Terjadi kesalahan pada server.",
    });
  } finally {
    conn.release();
  }
};

/* ═══════════════ Metode pembayaran ═══════════════ */

const NOMOR_REK = /^[0-9][0-9\s-]{3,28}[0-9]$/; // 5–30 karakter: angka, spasi, strip

function formatMetode(r) {
  return {
    id: r.id,
    name: r.name,
    account_number: r.account_number,
    is_active: Boolean(r.is_active),
  };
}

/*
 * GET /api/pembayaran/metode
 * Admin: semua metode (aktif & nonaktif).
 */
export const daftarMetode = async (_req, res) => {
  try {
    const [rows] = await db.query(
      `SELECT id, name, account_number, is_active
       FROM payment_methods
       ORDER BY id ASC`
    );
    res.json({ data: rows.map(formatMetode) });
  } catch (err) {
    console.error("Daftar metode pembayaran gagal:", err);
    res.status(500).json({ message: "Terjadi kesalahan pada server." });
  }
};

/*
 * GET /api/pembayaran/metode/aktif
 * Untuk checkout user: hanya metode yang sedang dipakai.
 */
export const daftarMetodeAktif = async (_req, res) => {
  try {
    const [rows] = await db.query(
      `SELECT id, name, account_number, is_active
       FROM payment_methods
       WHERE is_active = 1
       ORDER BY id ASC`
    );
    res.json({ data: rows.map(formatMetode) });
  } catch (err) {
    console.error("Daftar metode aktif gagal:", err);
    res.status(500).json({ message: "Terjadi kesalahan pada server." });
  }
};

/*
 * POST /api/pembayaran/metode
 * body: { name, account_number }
 * Langsung berstatus aktif.
 */
export const tambahMetode = async (req, res) => {
  const name = String(req.body?.name ?? "").trim();
  const accountNumber = String(req.body?.account_number ?? "").trim();

  if (name.length < 2 || name.length > 50) {
    return res.status(400).json({ message: "Nama harus 2–50 karakter." });
  }
  if (!NOMOR_REK.test(accountNumber)) {
    return res.status(400).json({
      message: "Nomor rekening tidak valid (5–30 karakter, hanya angka).",
    });
  }

  try {
    const [[dup]] = await db.query(
      "SELECT id FROM payment_methods WHERE LOWER(name) = LOWER(?) LIMIT 1",
      [name]
    );
    if (dup) {
      return res.status(409).json({ message: "Nama metode sudah dipakai." });
    }

    const [result] = await db.query(
      `INSERT INTO payment_methods (name, account_number, is_active)
       VALUES (?, ?, 1)`,
      [name, accountNumber]
    );

    res.status(201).json({
      data: formatMetode({
        id: result.insertId,
        name,
        account_number: accountNumber,
        is_active: 1,
      }),
    });
  } catch (err) {
    console.error("Tambah metode pembayaran gagal:", err);
    res.status(500).json({ message: "Terjadi kesalahan pada server." });
  }
};

/*
 * PATCH /api/pembayaran/metode/:id/status
 * body: { is_active: true | false }
 */
export const ubahStatusMetode = async (req, res) => {
  const id = Number(req.params.id);
  if (typeof req.body?.is_active !== "boolean") {
    return res.status(400).json({ message: "is_active harus true atau false." });
  }

  try {
    const [result] = await db.query(
      "UPDATE payment_methods SET is_active = ? WHERE id = ?",
      [req.body.is_active ? 1 : 0, id]
    );
    if (result.affectedRows === 0) {
      return res.status(404).json({ message: "Metode tidak ditemukan." });
    }
    res.json({ ok: true, is_active: req.body.is_active });
  } catch (err) {
    console.error("Ubah status metode gagal:", err);
    res.status(500).json({ message: "Terjadi kesalahan pada server." });
  }
};

/*
 * DELETE /api/pembayaran/metode/:id
 */
export const hapusMetode = async (req, res) => {
  const id = Number(req.params.id);
  try {
    const [result] = await db.query(
      "DELETE FROM payment_methods WHERE id = ?",
      [id]
    );
    if (result.affectedRows === 0) {
      return res.status(404).json({ message: "Metode tidak ditemukan." });
    }
    res.json({ ok: true });
  } catch (err) {
    console.error("Hapus metode pembayaran gagal:", err);
    res.status(500).json({ message: "Terjadi kesalahan pada server." });
  }
};