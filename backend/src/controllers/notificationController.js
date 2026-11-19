import db from "../config/db.js"; // sesuaikan: harus pool dari mysql2/promise

/* ======================================================
   ADMIN: Broadcast
   ====================================================== */

// GET /api/notifikasi/users
export const getUsers = async (req, res) => {
  try {
    const [rows] = await db.query(
      "SELECT id, name, email FROM users WHERE role = 'user' AND status = 'active' ORDER BY name ASC"
    );
    res.json(rows.map((u) => ({ id: String(u.id), name: u.name, email: u.email })));
  } catch (err) {
    console.error("getUsers error:", err);
    res.status(500).json({ message: "Gagal mengambil data user" });
  }
};

// GET /api/notifikasi  → riwayat broadcast (dikelompokkan per pengiriman)
export const getHistory = async (req, res) => {
  try {
    const [[{ total }]] = await db.query(
      "SELECT COUNT(*) AS total FROM users WHERE role = 'user' AND status = 'active'"
    );

    const [rows] = await db.query(`
      SELECT MIN(n.id) AS id,
             n.title,
             n.message,
             n.created_at AS sentAt,
             COUNT(*) AS recipients,
             GROUP_CONCAT(u.name ORDER BY u.name SEPARATOR '||') AS names
        FROM notifications n
        JOIN users u ON u.id = n.user_id
       WHERE n.type = 'broadcast'
       GROUP BY n.title, n.message, n.created_at
       ORDER BY n.created_at DESC
    `);

    res.json(
      rows.map((r) => {
        const mode = r.recipients >= total ? "all" : "selected";
        return {
          id: String(r.id),
          title: r.title,
          message: r.message,
          channel: "In-App",
          mode,
          recipientNames: mode === "selected" && r.names ? r.names.split("||") : [],
          recipients: r.recipients,
          status: "Terkirim",
          sentAt: new Date(r.sentAt).toISOString(),
        };
      })
    );
  } catch (err) {
    console.error("getHistory error:", err);
    res.status(500).json({ message: "Gagal mengambil riwayat" });
  }
};

// POST /api/notifikasi  → kirim broadcast
export const sendNotification = async (req, res) => {
  const { title, message, mode, userIds = [] } = req.body;

  if (!title || title.trim().length < 3)
    return res.status(400).json({ message: "Judul minimal 3 karakter" });
  if (!message || message.trim().length < 5)
    return res.status(400).json({ message: "Isi pesan minimal 5 karakter" });
  if (!["all", "selected"].includes(mode))
    return res.status(400).json({ message: "Mode tidak valid" });
  if (mode === "selected" && (!Array.isArray(userIds) || userIds.length === 0))
    return res.status(400).json({ message: "Pilih minimal 1 user" });

  try {
    let targets;
    if (mode === "all") {
      const [rows] = await db.query(
        "SELECT id FROM users WHERE role = 'user' AND status = 'active'"
      );
      targets = rows.map((r) => r.id);
    } else {
      const [rows] = await db.query(
        "SELECT id FROM users WHERE role = 'user' AND status = 'active' AND id IN (?)",
        [userIds]
      );
      targets = rows.map((r) => r.id);
    }

    if (targets.length === 0)
      return res.status(400).json({ message: "Tidak ada penerima yang valid" });

    // Satu statement → semua baris punya created_at yang sama (dipakai untuk grouping riwayat)
    await db.query(
      "INSERT INTO notifications (user_id, title, message, type) VALUES ?",
      [targets.map((uid) => [uid, title.trim(), message.trim(), "broadcast"])]
    );

    res.status(201).json({ recipients: targets.length });
  } catch (err) {
    console.error("sendNotification error:", err);
    res.status(500).json({ message: "Gagal mengirim notifikasi" });
  }
};

/* ======================================================
   USER: Inbox notifikasi (aplikasi mobile)
   Asumsi: authMiddleware mengisi req.user.id
   ====================================================== */

// GET /api/notifikasi/me
export const getMyNotifications = async (req, res) => {
  try {
    const [rows] = await db.query(
      `SELECT id, title, message, type, reference_id, is_read, created_at
         FROM notifications
        WHERE user_id = ?
        ORDER BY created_at DESC, id DESC`,
      [req.user.id]
    );
    res.json(rows);
  } catch (err) {
    console.error("getMyNotifications error:", err);
    res.status(500).json({ message: "Gagal mengambil notifikasi" });
  }
};

// GET /api/notifikasi/me/unread-count
export const getUnreadCount = async (req, res) => {
  try {
    const [[row]] = await db.query(
      "SELECT COUNT(*) AS count FROM notifications WHERE user_id = ? AND is_read = 0",
      [req.user.id]
    );
    res.json({ count: row.count });
  } catch (err) {
    console.error("getUnreadCount error:", err);
    res.status(500).json({ message: "Gagal mengambil jumlah notifikasi" });
  }
};

// PUT /api/notifikasi/me/read-all
export const markAllAsRead = async (req, res) => {
  try {
    await db.query(
      "UPDATE notifications SET is_read = 1 WHERE user_id = ? AND is_read = 0",
      [req.user.id]
    );
    res.json({ message: "Semua notifikasi ditandai sudah dibaca" });
  } catch (err) {
    console.error("markAllAsRead error:", err);
    res.status(500).json({ message: "Gagal memperbarui notifikasi" });
  }
};

// PUT /api/notifikasi/me/:id/read
export const markAsRead = async (req, res) => {
  try {
    const [result] = await db.query(
      "UPDATE notifications SET is_read = 1 WHERE id = ? AND user_id = ?",
      [req.params.id, req.user.id]
    );
    if (result.affectedRows === 0)
      return res.status(404).json({ message: "Notifikasi tidak ditemukan" });
    res.json({ message: "Notifikasi ditandai sudah dibaca" });
  } catch (err) {
    console.error("markAsRead error:", err);
    res.status(500).json({ message: "Gagal memperbarui notifikasi" });
  }
};

// DELETE /api/notifikasi/me/:id  → hapus satu notifikasi milik user yang login
export const deleteNotification = async (req, res) => {
  try {
    // user_id dicek supaya user tidak bisa menghapus notifikasi milik orang lain
    const [result] = await db.query(
      "DELETE FROM notifications WHERE id = ? AND user_id = ?",
      [req.params.id, req.user.id]
    );
    if (result.affectedRows === 0)
      return res.status(404).json({ message: "Notifikasi tidak ditemukan" });
    res.json({ message: "Notifikasi dihapus" });
  } catch (err) {
    console.error("deleteNotification error:", err);
    res.status(500).json({ message: "Gagal menghapus notifikasi" });
  }
};

// Helper untuk controller lain (order, pembayaran, refund, dll)
// Contoh: await buatNotifikasi(userId, "Pembayaran berhasil", "Pesanan INV-001 sudah dibayar", "payment", orderId);
export const buatNotifikasi = async (userId, title, message, type, referenceId = null) => {
  await db.query(
    "INSERT INTO notifications (user_id, title, message, type, reference_id) VALUES (?, ?, ?, ?, ?)",
    [userId, title, message, type, referenceId]
  );
};