import db from "../config/db.js"; // samakan dengan import db di controller lain

export const logLogin = async (email, userId, status) => {
  try {
    await db.query(
      "INSERT INTO login_logs (user_id, email, status) VALUES (?, ?, ?)",
      [userId ?? null, email, status]
    );
  } catch (err) {
    console.error("logLogin error:", err); // jangan sampai login ikut gagal
  }
};