import crypto from "crypto";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import db from "../config/db.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// backend/src/controllers -> backend/uploads
const UPLOAD_DIR = path.join(__dirname, "..", "..", "uploads");

// Harus sama dengan SERVICE_FEE di mobile/src/app/tiket/checkout.tsx
const SERVICE_FEE = 25000; // biaya layanan per tiket

/*
 * POST /api/checkout
 * body: {
 *   paymentMethod: "BCA",   // nama metode dari tabel payment_methods (harus aktif)
 *   items: [{ ticketTypeId: 1, quantity: 2 }, { ticketTypeId: 3, seatId: 15 }]
 * }
 * Membuat pesanan berstatus pending. Stok (sold) baru naik saat pesanan Lunas,
 * yaitu ketika bukti pembayaran diunggah (paymentController).
 */
export const createOrder = async (req, res) => {
  const userId = req.user?.id; // sesuaikan dengan isi authMiddleware kamu
  const { paymentMethod, items } = req.body || {};

  if (!paymentMethod || !Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ message: "Metode pembayaran dan item tiket wajib diisi." });
  }

  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();

    // Metode harus ada dan sedang aktif (bisa dinonaktifkan/dihapus admin kapan saja).
    const [[pm]] = await conn.query(
      "SELECT id FROM payment_methods WHERE name = ? AND is_active = 1 LIMIT 1",
      [String(paymentMethod)]
    );
    if (!pm) throw new Error("METODE_TIDAK_AKTIF");

    let total = 0;
    const lines = []; // baris order_items yang akan disimpan

    for (const it of items) {
      const qty = Number(it.quantity ?? 1);
      if (!Number.isInteger(qty) || qty < 1) throw new Error("QTY_TIDAK_VALID");

      const [[tt]] = await conn.query(
        "SELECT id, price, quota, COALESCE(sold, 0) AS sold FROM ticket_types WHERE id = ? FOR UPDATE",
        [it.ticketTypeId]
      );
      if (!tt) throw new Error("TIKET_TIDAK_ADA");
      if (tt.sold + qty > tt.quota) throw new Error("KUOTA_HABIS");

      if (it.seatId) {
        if (qty !== 1) throw new Error("QTY_TIDAK_VALID"); // 1 kursi = 1 tiket
        const [[seat]] = await conn.query(
          "SELECT id, status FROM seats WHERE id = ? FOR UPDATE",
          [it.seatId]
        );
        if (!seat || seat.status !== "available") throw new Error("KURSI_TIDAK_TERSEDIA");
      }

      // harga tiket + biaya layanan, supaya sama dengan total yang tampil di aplikasi
      total += (Number(tt.price) + SERVICE_FEE) * qty;
      lines.push({ ticketTypeId: tt.id, seatId: it.seatId || null, qty, price: Number(tt.price) });
    }

    // nomor invoice sementara, dirapikan setelah id pesanan diketahui
    // order_status memakai 'waiting_payment' (nilai 'pending' tidak ada di ENUM orders.order_status)
    const [ins] = await conn.query(
      `INSERT INTO orders (user_id, invoice_number, total_amount, payment_method,
                           payment_status, order_status, order_date)
       VALUES (?, ?, ?, ?, 'pending', 'waiting_payment', NOW())`,
      [userId, `TMP-${crypto.randomUUID()}`, total, String(paymentMethod)]
    );
    const orderId = ins.insertId;
    const invoice = `INV-${new Date().getFullYear()}-${String(orderId).padStart(3, "0")}`;
    await conn.query("UPDATE orders SET invoice_number = ? WHERE id = ?", [invoice, orderId]);

    for (const l of lines) {
      await conn.query(
        `INSERT INTO order_items (order_id, ticket_type_id, seat_id, quantity, price, ticket_status, qr_code)
         VALUES (?, ?, ?, ?, ?, 'active', ?)`,
        [orderId, l.ticketTypeId, l.seatId, l.qty, l.price, crypto.randomUUID()]
      );

      // Tandai kursi sebagai reserved saat pesanan dibuat (sedang checkout/menunggu bayar)
      if (l.seatId) {
        await conn.query("UPDATE seats SET status = 'reserved' WHERE id = ?", [l.seatId]);
      }
    }

    await conn.query(
      `INSERT INTO payments (order_id, payment_method, amount, payment_status)
       VALUES (?, ?, ?, 'pending')`,
      [orderId, String(paymentMethod), total]
    );

    await conn.commit();
    res.status(201).json({ id: orderId, invoice, total });
  } catch (err) {
    await conn.rollback();
    const peta = {
      METODE_TIDAK_AKTIF: [400, "Metode pembayaran tidak tersedia. Pilih metode lain."],
      QTY_TIDAK_VALID: [400, "Jumlah tiket tidak valid."],
      TIKET_TIDAK_ADA: [404, "Kategori tiket tidak ditemukan."],
      KUOTA_HABIS: [409, "Kuota tiket tidak mencukupi."],
      KURSI_TIDAK_TERSEDIA: [409, "Kursi sudah tidak tersedia."],
    };
    const hit = peta[err.message];
    if (hit) return res.status(hit[0]).json({ message: hit[1] });
    console.error(err);
    res.status(500).json({ message: "Terjadi kesalahan pada server." });
  } finally {
    conn.release();
  }
};

/* ═══════════════ Tiket milik user ═══════════════ */

/* Cari file bukti di uploads/payment, payments, bukti, atau uploads langsung. */
function pathBukti(file) {
  if (!file) return null;
  const nama = String(file).replace(/^\/?uploads\//, "");
  for (const sub of ["payment", "payments", "bukti", ""]) {
    if (fs.existsSync(path.join(UPLOAD_DIR, sub, nama))) {
      return `uploads/${sub ? sub + "/" : ""}${encodeURIComponent(nama)}`;
    }
  }
  return null;
}

/* Ambil nilai pertama yang ada dari beberapa kemungkinan nama kolom. */
function ambil(row, kolom) {
  for (const k of kolom) {
    if (row[k] !== undefined && row[k] !== null && row[k] !== "") return row[k];
  }
  return null;
}

const pad = (n) => String(n).padStart(2, "0");

/* Date / string -> "yyyy-mm-dd" */
function tanggalIso(v) {
  if (!v) return null;
  if (v instanceof Date) return `${v.getFullYear()}-${pad(v.getMonth() + 1)}-${pad(v.getDate())}`;
  const m = /^(\d{4}-\d{2}-\d{2})/.exec(String(v));
  return m ? m[1] : null;
}

/* Date / string / "19:30:00" -> "19:30 WIB" (null kalau tidak ada jam) */
function jamWib(v) {
  if (!v) return null;
  if (v instanceof Date) {
    if (v.getHours() === 0 && v.getMinutes() === 0) return null;
    return `${pad(v.getHours())}:${pad(v.getMinutes())} WIB`;
  }
  const m = /(\d{2}):(\d{2})/.exec(String(v));
  return m ? `${m[1]}:${m[2]} WIB` : null;
}

/*
 * GET /api/checkout/tiket
 * Semua tiket milik user yang login: satu baris order_items = satu tiket,
 * lengkap dengan data acara, kursi, status pembayaran, dan bukti pembayaran.
 */
export const tiketSaya = async (req, res) => {
  const userId = req.user?.id;

  try {
    const [[user]] = await db.query("SELECT name FROM users WHERE id = ?", [userId]);

    const [items] = await db.query(
      `SELECT oi.id AS item_id, oi.order_id, oi.quantity, oi.price,
              oi.ticket_status, oi.qr_code,
              o.invoice_number, o.payment_method, o.payment_status,
              o.order_status, o.order_date,
              tt.ticket_name, tt.event_id,
              s.section, s.row_name, s.seat_number,
              (SELECT p.payment_proof FROM payments p
                WHERE p.order_id = o.id AND p.payment_proof IS NOT NULL
                ORDER BY p.id DESC LIMIT 1) AS payment_proof
         FROM order_items oi
         JOIN orders o ON o.id = oi.order_id
         JOIN ticket_types tt ON tt.id = oi.ticket_type_id
         LEFT JOIN seats s ON s.id = oi.seat_id
        WHERE o.user_id = ?
        ORDER BY o.order_date DESC, o.id DESC, oi.id ASC`,
      [userId]
    );

    // data acara diambil terpisah (SELECT *) supaya tidak error kalau nama kolomnya berbeda
    const eventIds = [...new Set(items.map((i) => i.event_id))];
    const events = new Map();
    if (eventIds.length) {
      const [rows] = await db.query("SELECT * FROM events WHERE id IN (?)", [eventIds]);
      rows.forEach((e) => events.set(e.id, e));
    }

    const data = items.map((i) => {
      const e = events.get(i.event_id) || {};
      const tgl = ambil(e, [
        "event_date", "date", "start_date", "start_time",
        "event_datetime", "datetime", "start_at", "starts_at", "tanggal",
      ]);
      const jam = ambil(e, ["event_time", "time", "start_time", "jam"]);

      return {
        id: i.item_id,
        orderId: i.order_id,
        invoice: i.invoice_number,
        qr: i.qr_code,
        kategori: i.ticket_name,
        kursi: i.section ? `${i.section} ${i.row_name}-${i.seat_number}` : null,
        jumlah: i.quantity,
        harga: Number(i.price),
        metode: i.payment_method,
        statusBayar: i.payment_status,   // pending | paid | failed | expired | refunded
        statusPesanan: i.order_status,
        statusTiket: i.ticket_status,    // active | used | cancelled
        bukti: pathBukti(i.payment_proof),
        pemesan: user?.name ?? "-",
        event: {
          id: i.event_id,
          title: e.title ?? "Acara",
          tanggal: tanggalIso(tgl),
          jam: jamWib(tgl) ?? jamWib(jam),
          venue: ambil(e, ["venue", "venue_name", "location", "location_name", "place", "lokasi"]),
          kota: ambil(e, ["city", "kota", "location_city", "area", "address"]),
          gambar: ambil(e, ["image", "image_url", "poster", "banner", "thumbnail", "photo", "cover", "gambar"]),
        },
      };
    });

    res.json({ data });
  } catch (err) {
    console.error("Daftar tiket user gagal:", err);
    res.status(500).json({ message: "Terjadi kesalahan pada server." });
  }
};