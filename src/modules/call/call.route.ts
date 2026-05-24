import { Router } from "express";
import { authenticate } from "../../middleware/auth.middleware";
import { validate } from "../../middleware/validate.middleware";
import { callController } from "./call.controller";
import { callTokenSchema } from "./call.validation";

const router = Router();

router.use(authenticate);

router.get("/config", callController.getConfig);
router.post("/token", validate(callTokenSchema), callController.createToken);

export default router;
