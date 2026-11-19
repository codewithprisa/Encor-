import crypto from "crypto";
import db from "../config/db.js";

/*
 * Transfer tiket antar user (memakai tabel ticket_transfers yang sudah ada).
 *
 *  1. Pengirim  POST /api/transfer            -> ticket_transfers 'pending' + notifikasi type 'transfer' ke penerima
 *  2. Penerima  PUT  /api/transfer/:id/terima -> tiket pengirim jadi 'transferred', penerima dapat tiket baru (QR baru)
 *     Penerima  PUT  /api/transfer/:id/tolak  -> tiket tetap milik pengirim
 *     Pengirim  PUT  /api/transfer/:id/batal  -> batalkan selama masih 'pending'
 *
 * ticketId = order_items.id (sama dengan `id` dari GET /api/checkout/tiket).
 * Notifikasi hasil untuk PENGIRIM bertipe 'ticket' (bukan 'transfer'),
 * supaya di aplikasi tidak muncul tombol Terima/Tolak.
 */

const pad = (n) => String(n).padStart(2, "0");
const bersih = (v) => String(v ?? "").trim();

const notif = (conn, userId, title, message, type, referenceId = null) =>
  conn.query(
    "INSERT INTO notifications (user_id, title, message, type, reference_id) VALUES (?, ?, ?, ?, ?)",
    [userId, title, message, type, referenceId]
  );

const PETA_GALAT = {
  PENERIMA_TIDAK_ADA: [404, "Penerima tidak ditemukan."],
  TIKET_TIDAK_ADA: [404, "Tiket tidak ditemukan."],
  TIKET_TIDAK_AKTIF: [409, "Tiket ini tidak bisa ditransfer (belum lunas, sudah dipakai, atau dibatalkan)."],
  SUDAH_PENDING: [409, "Tiket ini sedang menunggu jawaban penerima."],
  TRANSFER_TIDAK_ADA: [404, "Transfer tidak ditemukan."],
  SUDAH_DIJAWAB: [409, "Transfer ini sudah dijawab atau dibatalkan."],
};

function kirimGalat(res, err, label) {
  const hit = PETA_GALAT[err.message];
  if (hit) return res.status(hit[0]).json({ message: hit[1] });
  console.error(`${label} error:`, err);
  return res.status(500).json({ message: "Terjadi kesalahan pada server." });
}

/*
 * GET /api/users/search
 *  - tanpa q  -> semua user aktif selain diri sendiri (dipakai halaman transfer)
 *  - dengan q -> disaring nama / email / no HP
 */
export const cariUser = async (req, res) => {
  const q = bersih(req.query.q);

  try {
    const where = ["role = 'user'", "status = 'active'", "id <> ?"];
    const params = [req.user.id];

    if (q) {
      // escape wildcard LIKE supaya "%" / "_" yang diketik user dianggap huruf biasa
      const like = `%${q.replace(/[\\%_]/g, "\\$&")}%`;
      const digits = q.replace(/[\s-]/g, "");
      const hp = /^\+?\d{3,}$/.test(digits)
        ? `%${digits.replace(/^\+62/, "0").replace(/^62/, "0")}%`
        : null;

      where.push(`(name LIKE ? OR email LIKE ?${hp ? " OR REPLACE(REPLACE(phone, ' ', ''), '-', '') LIKE ?" : ""})`);
      params.push(like, like);
      if (hp) params.push(hp);
    }

    const [rows] = await db.query(
      `SELECT id, name, email, phone, photo, profile_picture
         FROM users
        WHERE ${where.join(" AND ")}
        ORDER BY name ASC
        LIMIT 500`,
      params
    );

    res.json(
      rows.map((u) => ({
        id: String(u.id),
        name: u.name,
        email: u.email,
        phone: u.phone ?? "",
        photo: u.photo ?? u.profile_picture ?? null,
      }))
    );
  } catch (err) {
    console.error("cariUser error:", err);
    res.status(500).json({ message: "Gagal mengambil daftar pengguna" });
  }
};

/* POST /api/transfer   body: { ticketId, recipientId, message? } */
export const buatTransfer = async (req, res) => {
  const userId = req.user?.id;
  const { ticketId, recipientId } = req.body || {};
  const pesan = bersih(req.body?.message).slice(0, 200);

  if (!ticketId || !recipientId) {
    return res.status(400).json({ message: "Tiket dan penerima wajib diisi." });
  }
  if (String(recipientId) === String(userId)) {
    return res.status(400).json({ message: "Tidak bisa mengirim tiket ke diri sendiri." });
  }

  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();

    const [[to]] = await conn.query(
      "SELECT id FROM users WHERE id = ? AND role = 'user' AND status = 'active'",
      [recipientId]
    );
    if (!to) throw new Error("PENERIMA_TIDAK_ADA");

    // tiket harus milik pengirim
    const [[item]] = await conn.query(
      `SELECT oi.id, oi.ticket_status, o.payment_status, tt.ticket_name, tt.event_id
         FROM order_items oi
         JOIN orders o ON o.id = oi.order_id
         JOIN ticket_types tt ON tt.id = oi.ticket_type_id
        WHERE oi.id = ? AND o.user_id = ?
        FOR UPDATE`,
      [ticketId, userId]
    );
    if (!item) throw new Error("TIKET_TIDAK_ADA");
    if (item.ticket_status !== "active" || item.payment_status !== "paid") {
      throw new Error("TIKET_TIDAK_AKTIF");
    }

    const [[sudah]] = await conn.query(
      "SELECT id FROM ticket_transfers WHERE order_item_id = ? AND status = 'pending' LIMIT 1",
      [item.id]
    );
    if (sudah) throw new Error("SUDAH_PENDING");

    const [ins] = await conn.query(
      `INSERT INTO ticket_transfers (order_item_id, sender_id, receiver_id, message, status)
       VALUES (?, ?, ?, ?, 'pending')`,
      [item.id, userId, to.id, pesan || null]
    );

    const [[pengirim]] = await conn.query("SELECT name FROM users WHERE id = ?", [userId]);
    const [[ev]] = await conn.query("SELECT title FROM events WHERE id = ?", [item.event_id]);

    await notif(
      conn,
      to.id,
      "Tiket transfer untukmu",
      `${pengirim?.name ?? "Seseorang"} ingin mengirim tiket ${ev?.title ?? "acara"} (${item.ticket_name}).` +
        (pesan ? ` Pesan: "${pesan}"` : ""),
      "transfer",
      ins.insertId
    );

    await conn.commit();
    res.status(201).json({ id: ins.insertId, status: "pending" });
  } catch (err) {
    await conn.rollback();
    kirimGalat(res, err, "buatTransfer");
  } finally {
    conn.release();
  }
};

/* PUT /api/transfer/:id/terima  (hanya penerima) */
export const terimaTransfer = async (req, res) => {
  const userId = req.user?.id;
  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();

    const [[tr]] = await conn.query(
      "SELECT * FROM ticket_transfers WHERE id = ? AND receiver_id = ? FOR UPDATE",
      [req.params.id, userId]
    );
    if (!tr) throw new Error("TRANSFER_TIDAK_ADA");
    if (tr.status !== "pending") throw new Error("SUDAH_DIJAWAB");

    // tiket harus masih milik pengirim dan aktif
    const [[item]] = await conn.query(
      `SELECT oi.*, o.payment_method, o.payment_status, o.order_status
         FROM order_items oi
         JOIN orders o ON o.id = oi.order_id
        WHERE oi.id = ? AND o.user_id = ?
        FOR UPDATE`,
      [tr.order_item_id, tr.sender_id]
    );
    if (!item || item.ticket_status !== "active") {
      await conn.query("UPDATE ticket_transfers SET status = 'cancelled' WHERE id = ?", [tr.id]);
      await conn.commit();
      return res.status(409).json({ message: "Tiket ini sudah tidak tersedia untuk ditransfer." });
    }

    // Pesanan baru milik penerima. total_amount = 0 supaya pendapatan tidak terhitung dua kali
    // (pembayarannya tetap tercatat di pesanan asli pengirim). Awalan TRF- menandai pesanan hasil transfer.
    const [ord] = await conn.query(
      `INSERT INTO orders (user_id, invoice_number, total_amount, payment_method,
                           payment_status, order_status, order_date)
       VALUES (?, ?, 0, ?, ?, ?, NOW())`,
      [userId, `TMP-${crypto.randomUUID()}`, item.payment_method, item.payment_status, item.order_status]
    );
    const invoice = `TRF-${new Date().getFullYear()}-${pad(ord.insertId)}`;
    await conn.query("UPDATE orders SET invoice_number = ? WHERE id = ?", [invoice, ord.insertId]);

    // tiket baru untuk penerima (QR baru, kursi yang sama)
    await conn.query(
      `INSERT INTO order_items (order_id, ticket_type_id, seat_id, quantity, price, ticket_status, qr_code)
       VALUES (?, ?, ?, ?, ?, 'active', ?)`,
      [ord.insertId, item.ticket_type_id, item.seat_id, item.quantity, item.price, crypto.randomUUID()]
    );

    // tiket pengirim tidak berlaku lagi (QR lamanya otomatis ditolak karena bukan 'active')
    await conn.query("UPDATE order_items SET ticket_status = 'transferred' WHERE id = ?", [item.id]);

    await conn.query("UPDATE ticket_transfers SET status = 'accepted' WHERE id = ?", [tr.id]);
    await conn.query(
      "UPDATE notifications SET is_read = 1 WHERE type = 'transfer' AND reference_id = ? AND user_id = ?",
      [tr.id, userId]
    );

    const [[penerima]] = await conn.query("SELECT name FROM users WHERE id = ?", [userId]);
    await notif(
      conn,
      tr.sender_id,
      "Transfer tiket diterima",
      `${penerima?.name ?? "Penerima"} menerima tiket yang kamu kirim.`,
      "ticket"
    );

    await conn.commit();
    res.json({ message: "Tiket diterima", status: "accepted" });
  } catch (err) {
    await conn.rollback();
    kirimGalat(res, err, "terimaTransfer");
  } finally {
    conn.release();
  }
};

/* PUT /api/transfer/:id/tolak  (hanya penerima) */
export const tolakTransfer = async (req, res) => {
  const userId = req.user?.id;
  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();

    const [[tr]] = await conn.query(
      "SELECT * FROM ticket_transfers WHERE id = ? AND receiver_id = ? FOR UPDATE",
      [req.params.id, userId]
    );
    if (!tr) throw new Error("TRANSFER_TIDAK_ADA");
    if (tr.status !== "pending") throw new Error("SUDAH_DIJAWAB");

    await conn.query("UPDATE ticket_transfers SET status = 'rejected' WHERE id = ?", [tr.id]);
    await conn.query(
      "UPDATE notifications SET is_read = 1 WHERE type = 'transfer' AND reference_id = ? AND user_id = ?",
      [tr.id, userId]
    );

    const [[penerima]] = await conn.query("SELECT name FROM users WHERE id = ?", [userId]);
    await notif(
      conn,
      tr.sender_id,
      "Transfer tiket ditolak",
      `${penerima?.name ?? "Penerima"} menolak tiket yang kamu kirim. Tiket tetap ada di akunmu.`,
      "ticket"
    );

    await conn.commit();
    res.json({ message: "Tiket ditolak", status: "rejected" });
  } catch (err) {
    await conn.rollback();
    kirimGalat(res, err, "tolakTransfer");
  } finally {
    conn.release();
  }
};

/* PUT /api/transfer/:id/batal  (hanya pengirim, selama masih pending) */
export const batalTransfer = async (req, res) => {
  const userId = req.user?.id;
  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();

    const [[tr]] = await conn.query(
      "SELECT * FROM ticket_transfers WHERE id = ? AND sender_id = ? FOR UPDATE",
      [req.params.id, userId]
    );
    if (!tr) throw new Error("TRANSFER_TIDAK_ADA");
    if (tr.status !== "pending") throw new Error("SUDAH_DIJAWAB");

    await conn.query("UPDATE ticket_transfers SET status = 'cancelled' WHERE id = ?", [tr.id]);
    // notifikasi penerima ikut berubah lewat JOIN (tombol Terima/Tolak hilang)
    await conn.commit();
    res.json({ message: "Transfer dibatalkan", status: "cancelled" });
  } catch (err) {
    await conn.rollback();
    kirimGalat(res, err, "batalTransfer");
  } finally {
    conn.release();
  }
};