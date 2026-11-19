import upload, { siapkanNamaFile } from "../middleware/uploadBukti.js"; // sesuaikan path/nama file

router.post(
  "/:orderId/bukti",
  requireLogin,
  siapkanNamaFile,
  upload.single("bukti"),
  uploadBukti
);