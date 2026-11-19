import db from "../config/db.js";
import { tutupPesanan, pesanErrorStok } from "./orderController.js";
const STATUS_UI = {
  pending: "Menunggu",
  approved: "Disetujui",
  rejected: "Ditolak",
  completed: "Selesai",
};

const KODE_STATUS = {
  menunggu: "pending",
  disetujui: "approved",
  ditolak: "rejected",
  selesai: "completed",
  pending: "pending",
  approved: "approved",
  rejected: "rejected",
  completed: "completed",
};

function serverError(res, err) {
  console.error(err);
  res.status(500).json({ message: "Terjadi kesalahan pada server." });
}

function formatTanggalJam(d) {
  if (!d) return "-";
  const dt = new Date(d);
  const tgl = dt.toLocaleDateString("id-ID", { day: "numeric", month: "long", year: "numeric" });
  const jam = dt.toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit", hour12: false });
  return `${tgl}, ${jam.replace(".", ":")}`;
}

/* Error refund -> respons HTTP. */
function pesanErrorRefund(err) {
  const peta = {
    REFUND_NOT_FOUND: [404, "Data refund tidak ditemukan."],
    REFUND_BUKAN_PENDING: [409, "Refund ini sudah diproses sebelumnya."],
    ORDER_BELUM_LUNAS: [409, "Pesanan belum berstatus lunas, refund tidak dapat disetujui."],
    REFUND_MASIH_PENDING: [409, "Refund masih menunggu keputusan admin. Proses dulu sebelum dihapus."],
  };
  const hit = peta[err.message];
  return hit ? { status: hit[0], message: hit[1] } : pesanErrorStok(err);
}

const SELECT_REFUND = `
  SELECT r.id, r.order_id, r.reason, r.refund_amount, r.status,
         r.requested_at, r.processed_at, r.admin_notes,
         o.invoice_number, o.total_amount, o.payment_status,
         u.id AS user_id, u.name AS pemesan, u.email,
         (SELECT GROUP_CONCAT(DISTINCT e.title SEPARATOR ', ')
            FROM order_items oi
            JOIN ticket_types tt ON tt.id = oi.ticket_type_id
            JOIN events e ON e.id = tt.event_id
           WHERE oi.order_id = o.id) AS event
    FROM refunds r
    JOIN orders o ON o.id = r.order_id
    JOIN users u ON u.id = o.user_id
`;

function mapRefund(r) {
  return {
    id: r.id,
    orderId: r.order_id,
    invoice: r.invoice_number,
    pemesan: r.pemesan,
    email: r.email,
    event: r.event || "-",
    alasan: r.reason,
    jumlah: Number(r.refund_amount),
    status: STATUS_UI[r.status] || r.status,
    statusKode: r.status,
    catatanAdmin: r.admin_notes || "",
    diajukan: formatTanggalJam(r.requested_at),
    diproses: r.processed_at ? formatTanggalJam(r.processed_at) : null,
  };
}

/* ───────────────────────── ADMIN ───────────────────────── */

/* GET /api/refund?status=<Menunggu|pending|...>&q=<invoice/nama> */
export const getRefunds = async (req, res) => {
  try {
    const where = [];
    const params = [];

    const kode = KODE_STATUS[String(req.query.status || "").trim().toLowerCase()];
    if (kode) {
      where.push("r.status = ?");
      params.push(kode);
    }
    if (req.query.q && String(req.query.q).trim()) {
      const like = `%${String(req.query.q).trim()}%`;
      where.push("(o.invoice_number LIKE ? OR u.name LIKE ? OR u.email LIKE ?)");
      params.push(like, like, like);
    }
    const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";

    const [rows] = await db.query(
      `${SELECT_REFUND} ${whereSql} ORDER BY r.requested_at DESC, r.id DESC`,
      params
    );
    res.json(rows.map(mapRefund));
  } catch (err) {
    serverError(res, err);
  }
};

/*
 * Proses satu refund dalam satu transaksi.
 *  aksi "terima": order jadi refunded + dibatalkan, sold dikurangi, kursi dilepas
 *  aksi "tolak" : status rejected, catatan wajib
 */
async function prosesSatu(refundId, aksi, catatan) {
  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();

    const [[r]] = await conn.query(
      `SELECT r.id, r.order_id, r.status, o.user_id, o.invoice_number, o.payment_status
         FROM refunds r JOIN orders o ON o.id = r.order_id
        WHERE r.id = ? FOR UPDATE`,
      [refundId]
    );
    if (!r) throw new Error("REFUND_NOT_FOUND");
    if (r.status !== "pending") throw new Error("REFUND_BUKAN_PENDING");

    if (aksi === "terima") {
      if (r.payment_status !== "paid") throw new Error("ORDER_BELUM_LUNAS");
      await tutupPesanan(conn, r.order_id, "refunded");
      await conn.query(
        `UPDATE refunds
            SET status = 'approved', processed_at = NOW(), admin_notes = ?
          WHERE id = ?`,
        [catatan || "Pengajuan disetujui", r.id]
      );
      await conn.query(
        "INSERT INTO notifications (user_id, title, message, type, reference_id) VALUES (?, ?, ?, 'refund', ?)",
        [
          r.user_id,
          "Refund disetujui",
          `Pengajuan refund pesanan ${r.invoice_number} telah disetujui.`,
          r.id,
        ]
      );
    } else {
      await conn.query(
        `UPDATE refunds
            SET status = 'rejected', processed_at = NOW(), admin_notes = ?
          WHERE id = ?`,
        [catatan, r.id]
      );
      await conn.query(
        "INSERT INTO notifications (user_id, title, message, type, reference_id) VALUES (?, ?, ?, 'refund', ?)",
        [
          r.user_id,
          "Refund ditolak",
          `Pengajuan refund pesanan ${r.invoice_number} ditolak. Alasan: ${catatan}`,
          r.id,
        ]
      );
    }

    await conn.commit();
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
}

/* Hapus satu refund. Refund yang masih pending harus diputuskan dulu. */
async function hapusSatu(refundId) {
  const [rows] = await db.query("SELECT id, status FROM refunds WHERE id = ?", [refundId]);
  if (!rows.length) throw new Error("REFUND_NOT_FOUND");
  if (rows[0].status === "pending") throw new Error("REFUND_MASIH_PENDING");
  await db.query("DELETE FROM refunds WHERE id = ?", [refundId]);
}

/* PATCH /api/refund/:id/terima  (body opsional: { catatan }) */
export const approveRefund = async (req, res) => {
  try {
    await prosesSatu(req.params.id, "terima", String((req.body || {}).catatan || "").trim());
    res.json({ ok: true, status: STATUS_UI.approved });
  } catch (err) {
    const known = pesanErrorRefund(err);
    if (known) return res.status(known.status).json({ message: known.message });
    serverError(res, err);
  }
};

/* PATCH /api/refund/:id/tolak  (body wajib: { alasan }) */
export const rejectRefund = async (req, res) => {
  const alasan = String((req.body || {}).alasan || "").trim();
  if (!alasan) return res.status(400).json({ message: "Alasan penolakan wajib diisi." });

  try {
    await prosesSatu(req.params.id, "tolak", alasan);
    res.json({ ok: true, status: STATUS_UI.rejected });
  } catch (err) {
    const known = pesanErrorRefund(err);
    if (known) return res.status(known.status).json({ message: known.message });
    serverError(res, err);
  }
};

/* DELETE /api/refund/:id */
export const deleteRefund = async (req, res) => {
  try {
    await hapusSatu(req.params.id);
    res.json({ ok: true });
  } catch (err) {
    const known = pesanErrorRefund(err);
    if (known) return res.status(known.status).json({ message: known.message });
    serverError(res, err);
  }
};

/*
 * POST /api/refund/bulk   body: { ids: [1,2,3], aksi: "terima" | "tolak" | "hapus", alasan }
 * Tiap id diproses terpisah, jadi satu yang gagal tidak membatalkan yang lain.
 * Respons: { berhasil: [ids], gagal: [{ id, message }] }
 */
export const bulkRefund = async (req, res) => {
  const b = req.body || {};
  const ids = [...new Set((Array.isArray(b.ids) ? b.ids : []).map(Number).filter(Number.isInteger))];
  const aksi = String(b.aksi || "").toLowerCase();
  const alasan = String(b.alasan || "").trim();

  if (!ids.length) return res.status(400).json({ message: "Pilih minimal satu refund." });
  if (!["terima", "tolak", "hapus"].includes(aksi)) {
    return res.status(400).json({ message: "Aksi harus terima, tolak, atau hapus." });
  }
  if (aksi === "tolak" && !alasan) {
    return res.status(400).json({ message: "Alasan penolakan wajib diisi." });
  }

  const berhasil = [];
  const gagal = [];
  for (const id of ids) {
    try {
      if (aksi === "hapus") await hapusSatu(id);
      else await prosesSatu(id, aksi, alasan);
      berhasil.push(id);
    } catch (err) {
      const known = pesanErrorRefund(err);
      if (!known) console.error(err);
      gagal.push({ id, message: known ? known.message : "Terjadi kesalahan pada server." });
    }
  }

  res.json({ berhasil, gagal });
};

/* ───────────────────────── USER (aplikasi mobile) ───────────────────────── */

/* POST /api/refund   body: { orderId, alasan }  — butuh authMiddleware (req.user.id) */
export const createRefund = async (req, res) => {
  const userId = req.user && req.user.id;
  if (!userId) return res.status(401).json({ message: "Silakan login terlebih dahulu." });

  const b = req.body || {};
  const orderId = Number(b.orderId);
  const alasan = String(b.alasan || "").trim();
  if (!Number.isInteger(orderId) || orderId < 1) {
    return res.status(400).json({ message: "Pesanan tidak valid." });
  }
  if (!alasan) return res.status(400).json({ message: "Alasan refund wajib diisi." });

  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();

    const [[order]] = await conn.query(
      "SELECT id, total_amount, payment_status FROM orders WHERE id = ? AND user_id = ? FOR UPDATE",
      [orderId, userId]
    );
    if (!order) {
      await conn.rollback();
      return res.status(404).json({ message: "Pesanan tidak ditemukan." });
    }
    if (order.payment_status !== "paid") {
      await conn.rollback();
      return res.status(409).json({ message: "Hanya pesanan yang sudah lunas yang bisa diajukan refund." });
    }

    const [[dipakai]] = await conn.query(
      "SELECT COUNT(*) AS n FROM order_items WHERE order_id = ? AND ticket_status = 'used'",
      [orderId]
    );
    if (Number(dipakai.n) > 0) {
      await conn.rollback();
      return res.status(409).json({ message: "Tiket sudah dipakai check-in, refund tidak dapat diajukan." });
    }

    const [ada] = await conn.query(
      "SELECT id FROM refunds WHERE order_id = ? AND status IN ('pending','approved','completed')",
      [orderId]
    );
    if (ada.length) {
      await conn.rollback();
      return res.status(409).json({ message: "Pesanan ini sudah memiliki pengajuan refund." });
    }

    // tiket tetap aktif sampai admin menyetujui
    const [ins] = await conn.query(
      "INSERT INTO refunds (order_id, reason, refund_amount, status) VALUES (?, ?, ?, 'pending')",
      [orderId, alasan, order.total_amount]
    );

    await conn.commit();
    res.status(201).json({ id: ins.insertId, status: STATUS_UI.pending });
  } catch (err) {
    await conn.rollback();
    serverError(res, err);
  } finally {
    conn.release();
  }
};

/* GET /api/refund/saya  — riwayat refund milik user yang login */
export const getMyRefunds = async (req, res) => {
  const userId = req.user && req.user.id;
  if (!userId) return res.status(401).json({ message: "Silakan login terlebih dahulu." });

  try {
    const [rows] = await db.query(
      `${SELECT_REFUND} WHERE o.user_id = ? ORDER BY r.requested_at DESC, r.id DESC`,
      [userId]
    );
    res.json(rows.map(mapRefund));
  } catch (err) {
    serverError(res, err);
  }
};

/* DELETE /api/refund/saya/:id  — hapus riwayat milik sendiri (bukan yang masih pending) */
export const deleteMyRefund = async (req, res) => {
  const userId = req.user && req.user.id;
  if (!userId) return res.status(401).json({ message: "Silakan login terlebih dahulu." });

  try {
    const [rows] = await db.query(
      `SELECT r.id, r.status
         FROM refunds r JOIN orders o ON o.id = r.order_id
        WHERE r.id = ? AND o.user_id = ?`,
      [req.params.id, userId]
    );
    if (!rows.length) return res.status(404).json({ message: "Data refund tidak ditemukan." });
    if (rows[0].status === "pending") {
      return res.status(409).json({ message: "Refund masih menunggu keputusan admin." });
    }
    await db.query("DELETE FROM refunds WHERE id = ?", [req.params.id]);
    res.json({ ok: true });
  } catch (err) {
    serverError(res, err);
  }
};