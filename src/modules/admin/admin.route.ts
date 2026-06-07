import { Router } from "express";
import { adminController } from "./admin.controller";
import {
  authenticate,
  requireStaff,
  requireAdmin,
} from "../../middleware/auth.middleware";
import { validate } from "../../middleware/validate.middleware";
import {
  usersQuerySchema,
  postsQuerySchema,
  reportsQuerySchema,
  auditQuerySchema,
  updateUserSchema,
  updatePostSchema,
  resolveReportSchema,
} from "./admin.validation";

const router = Router();

// Every admin route: must be signed in AND be staff. requireStaff re-checks the
// DB each request, so a demotion or ban takes effect immediately.
router.use(authenticate, requireStaff);

router.get("/stats", adminController.getStats);
router.get("/health", adminController.getHealth);

// Users
router.get("/users", validate(usersQuerySchema, "query"), adminController.listUsers);
router.patch(
  "/users/:id",
  validate(updateUserSchema),
  adminController.updateUser,
);
router.post("/users/:id/force-logout", adminController.forceLogout);

// Content
router.get("/posts", validate(postsQuerySchema, "query"), adminController.listPosts);
router.patch(
  "/posts/:id",
  validate(updatePostSchema),
  adminController.updatePost,
);
router.delete("/posts/:id", requireAdmin, adminController.deletePost);

// Reports queue
router.get("/reports", validate(reportsQuerySchema, "query"), adminController.listReports);
router.patch(
  "/reports/:id",
  validate(resolveReportSchema),
  adminController.resolveReport,
);

// Audit log
router.get("/audit", validate(auditQuerySchema, "query"), adminController.listAudit);

export default router;
