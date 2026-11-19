
export const verifyAdmin = (req, res, next) => {
  if (!req.user || req.user.role !== "admin") {
    return res.status(403).json({
      success: false,
      message: "Akses khusus admin.",
    });
  }

  next();
};

export default verifyAdmin;