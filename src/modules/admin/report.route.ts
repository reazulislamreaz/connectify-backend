import { Router } from "express";
import { adminController } from "./admin.controller";
import { authenticate } from "../../middleware/auth.middleware";
import { validate } from "../../middleware/validate.middleware";
import { createReportSchema } from "./admin.validation";

const router = Router();

// Public to any signed-in user — this is how private content gets actioned
// without staff ever reading inboxes. Mounted at /api/reports.
router.post(
  "/",
  authenticate,
  validate(createReportSchema),
  adminController.createReport,
);

export default router;
