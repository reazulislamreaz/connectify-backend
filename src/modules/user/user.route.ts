import { Router } from "express";
import { userController } from "./user.controller";
import { authenticate } from "../../middleware/auth.middleware";
import { validate } from "../../middleware/validate.middleware";
import { updateProfileSchema, searchUsersSchema } from "./user.validation";
import { uploadAvatar } from "../../middleware/upload.middleware";

const router = Router();

router.use(authenticate);

router.get("/profile", userController.getProfile);
router.patch(
  "/profile",
  (req, res, next) => {
    uploadAvatar.single("profilePicture")(req, res, (err) => {
      if (err) return next(err);
      next();
    });
  },
  validate(updateProfileSchema),
  userController.updateProfile
);
router.get("/", validate(searchUsersSchema, "query"), userController.listUsers);
router.get("/:id", userController.getUserById);

export default router;
