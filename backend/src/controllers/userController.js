import db from "../config/db.js";

export const listAkun = async (req, res) => {
  try {
    const [rows] = await db.execute(
      "SELECT id, name, email, role FROM users ORDER BY name ASC"
    );
    const data = rows.map((u) => ({
      id: u.id,
      name: u.name,
      email: u.email,
      role: u.role === "admin" ? "Admin" : "User",
    }));
    res.json({ success: true, data });
  } catch (err) {
    console.error("listAkun error:", err);
    res.status(500).json({ message: "Gagal memuat akun." });
  }
};

export const ubahRole = async (req, res) => {
  try {
    const role =
      req.body.role === "Admin" ? "admin" : req.body.role === "User" ? "user" : null;
    if (!role) return res.status(400).json({ message: "Role tidak valid." });

    const [rows] = await db.execute(
      "SELECT id, role FROM users WHERE id = ? LIMIT 1",
      [req.params.id]
    );
    const akun = rows[0];
    if (!akun) return res.status(404).json({ message: "Akun tidak ditemukan." });

    if (akun.role === role) return res.json({ success: true });

    if (role === "user") {
      // admin tidak boleh menurunkan dirinya sendiri
      if (req.user?.id && String(req.user.id) === String(akun.id)) {
        return res.status(403).json({ message: "Kamu tidak bisa menurunkan akunmu sendiri." });
      }
      // harus tersisa minimal satu admin
      const [[{ total }]] = await db.execute(
        "SELECT COUNT(*) AS total FROM users WHERE role = 'admin'"
      );
      if (total <= 1) {
        return res.status(403).json({ message: "Minimal harus ada satu admin." });
      }
    }

    await db.execute("UPDATE users SET role = ? WHERE id = ?", [role, akun.id]);
    res.json({ success: true });
  } catch (err) {
    console.error("ubahRole error:", err);
    res.status(500).json({ message: "Gagal mengubah role." });
  }
};