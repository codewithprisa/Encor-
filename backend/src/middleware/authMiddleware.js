import jwt from "jsonwebtoken";

function ambilToken(req) {
  const header = req.headers.authorization || "";
  return header.startsWith("Bearer ") ? header.slice(7) : null;
}

/* Cukup login (user biasa maupun admin). Dipakai route yang butuh req.user.id. */
export const requireLogin = (req, res, next) => {
  const token = ambilToken(req);

  if (!token) {
    return res.status(401).json({
      success: false,
      message: "Token tidak ditemukan. Silakan login.",
    });
  }

  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    // controller membaca req.user.id, jadi nama field id diseragamkan
    req.user = { ...payload, id: payload.id ?? payload.userId ?? payload.user_id };
    next();
  } catch {
    return res.status(401).json({
      success: false,
      message: "Token tidak valid atau sudah kedaluwarsa.",
    });
  }
};

/* Khusus admin (tidak diubah). */
export const requireAdmin = (req, res, next) => {
  const token = ambilToken(req);

  if (!token) {
    return res.status(401).json({
      success: false,
      message: "Token tidak ditemukan. Silakan login.",
    });
  }

  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET);

    if (payload.role !== "admin") {
      return res.status(403).json({
        success: false,
        message: "Akses hanya untuk admin.",
      });
    }

    req.user = payload;
    next();
  } catch {
    return res.status(401).json({
      success: false,
      message: "Token tidak valid atau sudah kedaluwarsa.",
    });
  }
};

// route baru mengimpor ini sebagai authMiddleware
export default requireLogin;