  import fs from "fs";
  import path from "path";
  import { fileURLToPath } from "url";
  import db from "../config/db.js";

  const __filename = fileURLToPath(import.meta.url);
  const __dirname = path.dirname(__filename);

  /* ───────── Helper stok tiket & kursi (dipakai juga oleh refundController) ─────────
  * Semua fungsi menerima koneksi yang SUDAH di dalam transaksi
  * (conn.beginTransaction()) dan melempar Error dengan kode di message-nya.
  */

  /* pending -> paid: naikkan ticket_types.sold, tandai kursi terjual, konfirmasi order. */
  export async function tandaiLunas(conn, orderId) {
    const [[order]] = await conn.query(
      "SELECT id, payment_status FROM orders WHERE id = ? FOR UPDATE",
      [orderId]
    );
    if (!order) throw new Error("ORDER_NOT_FOUND");
    if (order.payment_status === "paid") return; // idempotent
    if (order.payment_status !== "pending") throw new Error("ORDER_NOT_PENDING");

    const [items] = await conn.query(
      `SELECT id, ticket_type_id, seat_id, quantity
        FROM order_items
        WHERE order_id = ? AND ticket_status = 'active'`,
      [orderId]
    );

    for (const it of items) {
      // hanya naik kalau masih ada kuota
      const [r] = await conn.query(
        `UPDATE ticket_types
            SET sold = COALESCE(sold, 0) + ?
          WHERE id = ? AND COALESCE(sold, 0) + ? <= quota`,
        [it.quantity, it.ticket_type_id, it.quantity]
      );
      if (r.affectedRows === 0) throw new Error("KUOTA_HABIS");

      if (it.seat_id) {
        await conn.query("UPDATE seats SET status = 'sold' WHERE id = ?", [it.seat_id]);
      }
    }

    await conn.query(
      "UPDATE orders SET payment_status = 'paid', order_status = 'confirmed' WHERE id = ?",
      [orderId]
    );
    await conn.query(
      `UPDATE payments
          SET payment_status = 'paid', payment_date = COALESCE(payment_date, NOW())
        WHERE order_id = ?`,
      [orderId]
    );
  }

  /*
  * Batalkan order: 'failed' | 'expired' (dari pending) atau 'refunded' (dari paid).
  * - sold dikurangi hanya kalau order tadinya paid (karena sold baru naik saat lunas)
  * - kursi dikembalikan ke available, tiket aktif jadi cancelled
  */
  export async function tutupPesanan(conn, orderId, paymentBaru) {
    const [[order]] = await conn.query(
      "SELECT id, payment_status FROM orders WHERE id = ? FOR UPDATE",
      [orderId]
    );
    if (!order) throw new Error("ORDER_NOT_FOUND");
    if (order.payment_status === paymentBaru) return; // idempotent
    if (order.payment_status === "refunded") throw new Error("ORDER_SUDAH_REFUND");

    const [items] = await conn.query(
      "SELECT id, ticket_type_id, seat_id, quantity, ticket_status FROM order_items WHERE order_id = ?",
      [orderId]
    );
    if (items.some((i) => i.ticket_status === "used")) {
      throw new Error("TIKET_SUDAH_DIPAKAI");
    }

    for (const it of items) {
      if (it.ticket_status !== "active") continue;
      if (order.payment_status === "paid") {
        await conn.query(
          "UPDATE ticket_types SET sold = GREATEST(COALESCE(sold, 0) - ?, 0) WHERE id = ?",
          [it.quantity, it.ticket_type_id]
        );
      }
      if (it.seat_id) {
        await conn.query("UPDATE seats SET status = 'available' WHERE id = ?", [it.seat_id]);
      }
    }

    await conn.query(
      "UPDATE order_items SET ticket_status = 'cancelled' WHERE order_id = ? AND ticket_status = 'active'",
      [orderId]
    );
    await conn.query(
      "UPDATE orders SET payment_status = ?, order_status = 'cancelled' WHERE id = ?",
      [paymentBaru, orderId]
    );
    // enum payments tidak punya 'refunded', jadi riwayat pembayaran dibiarkan 'paid'
    if (paymentBaru !== "refunded") {
      await conn.query("UPDATE payments SET payment_status = ? WHERE order_id = ?", [
        paymentBaru,
        orderId,
      ]);
    }
  }

  /* Terjemahkan kode error helper ke respons HTTP. Return null kalau bukan error yang dikenal. */
  export function pesanErrorStok(err) {
    const peta = {
      ORDER_NOT_FOUND: [404, "Pesanan tidak ditemukan."],
      ORDER_NOT_PENDING: [409, "Pesanan ini sudah diproses sebelumnya."],
      ORDER_SUDAH_REFUND: [409, "Pesanan ini sudah di-refund."],
      KUOTA_HABIS: [409, "Kuota tiket tidak mencukupi untuk menyelesaikan pesanan ini."],
      TIKET_SUDAH_DIPAKAI: [409, "Tiket pada pesanan ini sudah dipakai check-in."],
    };
    const hit = peta[err.message];
    return hit ? { status: hit[0], message: hit[1] } : null;
  }

  const BASE_URL = "http://localhost:3001";

  // backend/src/controllers -> backend/uploads
  const UPLOAD_DIR = path.join(__dirname, "..", "..", "uploads");

  const STATUS_BAYAR_UI = {
    pending: "Menunggu",
    paid: "Lunas",
    failed: "Gagal",
    expired: "Kedaluwarsa",
    refunded: "Refund",
  };

  // order_status hasil konfirmasi admin -> label yang dibaca frontend
  const STATUS_PESANAN_UI = {
    accepted: "Diterima",
    rejected: "Ditolak",
  };

  // filter dari frontend boleh pakai label ("Lunas") atau kode ("paid")
  const KODE_BAYAR = {
    menunggu: "pending",
    lunas: "paid",
    gagal: "failed",
    kedaluwarsa: "expired",
    refund: "refunded",
    pending: "pending",
    paid: "paid",
    failed: "failed",
    expired: "expired",
    refunded: "refunded",
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

  /*
  * URL file bukti pembayaran. Dicari di uploads/, uploads/payments/, uploads/bukti/
  * (sesuaikan kalau paymentUpload.js menyimpan di folder lain). Null kalau file tidak ada.
  */
  function urlBukti(file) {
    if (!file) return null;
    const nama = String(file).replace(/^\/?uploads\//, "");
    for (const sub of ["", "payments", "bukti"]) {
      if (fs.existsSync(path.join(UPLOAD_DIR, sub, nama))) {
        const depan = sub ? `${sub}/` : "";
        return `${BASE_URL}/uploads/${depan}${encodeURIComponent(nama)}`;
      }
    }
    return null;
  }

  /* GET /api/pesanan?event=<eventId>&status=<Lunas|paid|...>&q=<invoice/nama/email> */
  export const getOrders = async (req, res) => {
    try {
      const where = [];
      const params = [];

      if (req.query.event && /^\d+$/.test(String(req.query.event))) {
        where.push(`EXISTS (
          SELECT 1 FROM order_items oi
            JOIN ticket_types tt ON tt.id = oi.ticket_type_id
          WHERE oi.order_id = o.id AND tt.event_id = ?)`);
        params.push(Number(req.query.event));
      }

      const kode = KODE_BAYAR[String(req.query.status || "").trim().toLowerCase()];
      if (kode) {
        where.push("o.payment_status = ?");
        params.push(kode);
      }

      if (req.query.q && String(req.query.q).trim()) {
        const like = `%${String(req.query.q).trim()}%`;
        where.push("(o.invoice_number LIKE ? OR u.name LIKE ? OR u.email LIKE ?)");
        params.push(like, like, like);
      }

      const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";

      const [rows] = await db.query(
        `SELECT o.id, o.invoice_number, o.total_amount, o.payment_method,
                o.payment_status, o.order_status, o.order_date,
                u.name AS pemesan, u.email,
                (SELECT GROUP_CONCAT(DISTINCT e.title SEPARATOR ', ')
                  FROM order_items oi
                  JOIN ticket_types tt ON tt.id = oi.ticket_type_id
                  JOIN events e ON e.id = tt.event_id
                  WHERE oi.order_id = o.id) AS event,
                (SELECT GROUP_CONCAT(CONCAT(tt.ticket_name, ' x', oi.quantity) SEPARATOR ', ')
                  FROM order_items oi
                  JOIN ticket_types tt ON tt.id = oi.ticket_type_id
                  WHERE oi.order_id = o.id) AS kategori,
                (SELECT COUNT(*) FROM payments p
                  WHERE p.order_id = o.id
                    AND (p.payment_proof IS NOT NULL OR p.receipt IS NOT NULL)) AS jumlah_bukti
          FROM orders o
          JOIN users u ON u.id = o.user_id
          ${whereSql}
          ORDER BY o.order_date DESC, o.id DESC`,
        params
      );

      res.json(
        rows.map((r) => ({
          id: r.id,
          invoice: r.invoice_number,
          pemesan: r.pemesan,
          email: r.email,
          event: r.event || "-",
          kategori: r.kategori || "-",
          total: Number(r.total_amount),
          metode: r.payment_method || "-",
          status: STATUS_BAYAR_UI[r.payment_status] || r.payment_status,
          statusKode: r.payment_status,
          statusPesanan: STATUS_PESANAN_UI[r.order_status] || r.order_status,
          tanggal: formatTanggalJam(r.order_date),
          adaBukti: Number(r.jumlah_bukti) > 0,
        }))
      );
    } catch (err) {
      serverError(res, err);
    }
  };

  /* GET /api/pesanan/:id  (detail + item + bukti pembayaran) */
  export const getOrderById = async (req, res) => {
    try {
      const [orders] = await db.query(
        `SELECT o.*, u.name AS pemesan, u.email, u.phone
          FROM orders o JOIN users u ON u.id = o.user_id
          WHERE o.id = ?`,
        [req.params.id]
      );
      if (!orders.length) return res.status(404).json({ message: "Pesanan tidak ditemukan." });
      const o = orders[0];

      const [items] = await db.query(
        `SELECT oi.id, oi.quantity, oi.price, oi.ticket_status, oi.qr_code,
                tt.ticket_name, e.title AS event_title,
                s.section, s.row_name, s.seat_number
          FROM order_items oi
          JOIN ticket_types tt ON tt.id = oi.ticket_type_id
          JOIN events e ON e.id = tt.event_id
          LEFT JOIN seats s ON s.id = oi.seat_id
          WHERE oi.order_id = ?
          ORDER BY oi.id ASC`,
        [req.params.id]
      );

      const [payments] = await db.query(
        "SELECT * FROM payments WHERE order_id = ? ORDER BY id DESC",
        [req.params.id]
      );

      res.json({
        id: o.id,
        invoice: o.invoice_number,
        pemesan: o.pemesan,
        email: o.email,
        telepon: o.phone || "-",
        total: Number(o.total_amount),
        metode: o.payment_method || "-",
        status: STATUS_BAYAR_UI[o.payment_status] || o.payment_status,
        statusKode: o.payment_status,
        statusPesanan: STATUS_PESANAN_UI[o.order_status] || o.order_status,
        tanggal: formatTanggalJam(o.order_date),
        item: items.map((i) => ({
          id: i.id,
          event: i.event_title,
          kategori: i.ticket_name,
          jumlah: i.quantity,
          harga: Number(i.price),
          statusTiket: i.ticket_status,
          qr: i.qr_code,
          kursi: i.section ? `${i.section} ${i.row_name}-${i.seat_number}` : null,
        })),
        pembayaran: payments.map((p) => ({
          id: p.id,
          metode: p.payment_method,
          kodeTransaksi: p.transaction_code,
          jumlah: Number(p.amount),
          status: STATUS_BAYAR_UI[p.payment_status] || p.payment_status,
          tanggalBayar: p.payment_date ? formatTanggalJam(p.payment_date) : null,
          buktiBayar: urlBukti(p.payment_proof),
          struk: urlBukti(p.receipt),
        })),
      });
    } catch (err) {
      serverError(res, err);
    }
  };

  /*
  * PATCH /api/pesanan/:id/konfirmasi   body: { aksi: "terima" | "tolak" }
  * Langkah 1 alur admin: terima / tolak pesanan baru (sebelum verifikasi pembayaran).
  *  - terima -> order_status = 'accepted' (pembayaran baru bisa disetujui lewat /status)
  *  - tolak  -> tiket dibatalkan, kursi dilepas, order_status = 'rejected', pembayaran 'failed'
  */
  export const konfirmasiPesanan = async (req, res) => {
    const aksi = String((req.body || {}).aksi || "").trim().toLowerCase();
    const alasan = String((req.body || {}).alasan || "").trim();

    if (!["terima", "tolak"].includes(aksi)) {
      return res.status(400).json({ message: "Aksi harus 'terima' atau 'tolak'." });
    }

    const conn = await db.getConnection();

    try {
      await conn.beginTransaction();

      const [[order]] = await conn.query(
        `SELECT id, user_id, invoice_number, payment_status, order_status
          FROM orders
          WHERE id = ?
            FOR UPDATE`,
        [req.params.id]
      );

      if (!order) {
        await conn.rollback();
        return res.status(404).json({ message: "Pesanan tidak ditemukan." });
      }

      if (
        order.payment_status !== "pending" ||
        ["accepted", "rejected"].includes(order.order_status)
      ) {
        await conn.rollback();
        return res.status(409).json({ message: "Pesanan ini sudah diproses sebelumnya." });
      }

      if (aksi === "terima") {
        await conn.query("UPDATE orders SET order_status = 'accepted' WHERE id = ?", [order.id]);
      } else {
        // batalkan tiket & lepas kursi, lalu tandai sebagai ditolak
        await tutupPesanan(conn, order.id, "failed");
        await conn.query("UPDATE orders SET order_status = 'rejected' WHERE id = ?", [order.id]);
      }

      const [judul, pesan] =
        aksi === "terima"
          ? [
              "Pesanan diterima",
              `Pesanan ${order.invoice_number} diterima. Pembayaran telah diverifikasi.`,
            ]
          : [
              "Pesanan ditolak",
              alasan
                ? `Pesanan ${order.invoice_number} ditolak. Alasan: ${alasan}`
                : `Pesanan ${order.invoice_number} tidak dapat diproses.`,
            ];

      await conn.query(
        `INSERT INTO notifications
        (user_id, title, message, type, reference_id)
        VALUES (?, ?, ?, 'payment', ?)`,
        [order.user_id, judul, pesan, order.id]
      );

      await conn.commit();

      return res.json({
        ok: true,
        statusPesanan: aksi === "terima" ? "Diterima" : "Ditolak",
      });
    } catch (err) {
      await conn.rollback();

      const known = pesanErrorStok(err);
      if (known) {
        return res.status(known.status).json({ message: known.message });
      }

      serverError(res, err);
    } finally {
      conn.release();
    }
  };

  /*
  * PATCH /api/pesanan/:id/status   body: { status: "Lunas" | "Gagal" | "Kedaluwarsa" }
  * Hanya untuk pesanan yang masih Menunggu (verifikasi bukti pembayaran oleh admin).
  *  - Lunas       -> sold naik, kursi jadi terjual, order confirmed
  *  - Gagal/Kedaluwarsa -> tiket dibatalkan, kursi dilepas
  * Refund diproses lewat refundController, bukan di sini.
  */

  export const updatePaymentStatus = async (req, res) => {
    const kode =
      KODE_BAYAR[
        String((req.body || {}).status || "")
          .trim()
          .toLowerCase()
      ];

    if (!["paid", "failed", "expired"].includes(kode)) {
      return res.status(400).json({
        message:
          "Status harus salah satu dari: Lunas, Gagal, Kedaluwarsa.",
      });
    }

    const conn = await db.getConnection();

    try {
      await conn.beginTransaction();

      const [[order]] = await conn.query(
        `SELECT id, user_id, invoice_number, payment_status
        FROM orders
        WHERE id = ?
        FOR UPDATE`,
        [req.params.id]
      );

      if (!order) {
        await conn.rollback();

        return res.status(404).json({
          message: "Pesanan tidak ditemukan.",
        });
      }

      if (order.payment_status !== "pending") {
        await conn.rollback();

        return res.status(409).json({
          message: `Pesanan sudah berstatus ${
            STATUS_BAYAR_UI[order.payment_status] ||
            order.payment_status
          } dan tidak bisa diubah lagi.`,
        });
      }

      // Admin hanya boleh menyetujui pembayaran jika
      // bukti pembayaran benar-benar sudah diunggah.
      if (kode === "paid") {
        const [[payment]] = await conn.query(
          `SELECT id
          FROM payments
          WHERE order_id = ?
            AND payment_proof IS NOT NULL
            AND TRIM(payment_proof) <> ''
          LIMIT 1`,
          [order.id]
        );

        if (!payment) {
          await conn.rollback();

          return res.status(400).json({
            message: "Pesanan belum memiliki bukti pembayaran.",
          });
        }

        // Bukti tersedia: baru sekarang pesanan dilunasi.
        await tandaiLunas(conn, order.id);
      } else {
        // Gagal atau kedaluwarsa.
        await tutupPesanan(conn, order.id, kode);
      }

      const notif = {
        paid: [
          "Pembayaran berhasil",
          `Pembayaran pesanan ${order.invoice_number} berhasil.`,
        ],
        failed: [
          "Pembayaran gagal",
          `Pembayaran pesanan ${order.invoice_number} gagal diverifikasi.`,
        ],
        expired: [
          "Pesanan kedaluwarsa",
          `Batas pembayaran pesanan ${order.invoice_number} telah berakhir.`,
        ],
      }[kode];

      await conn.query(
        `INSERT INTO notifications
        (user_id, title, message, type, reference_id)
        VALUES (?, ?, ?, 'payment', ?)`,
        [order.user_id, notif[0], notif[1], order.id]
      );

      await conn.commit();

      return res.json({
        ok: true,
        status: STATUS_BAYAR_UI[kode],
      });
    } catch (err) {
      await conn.rollback();

      const known = pesanErrorStok(err);

      if (known) {
        return res.status(known.status).json({
          message: known.message,
        });
      }

      serverError(res, err);
    } finally {
      conn.release();
    }
  };