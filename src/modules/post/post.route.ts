import { Router } from "express";
import { postController } from "./post.controller";
import { authenticate } from "../../middleware/auth.middleware";
import { validate } from "../../middleware/validate.middleware";
import { uploadPostImage } from "../../middleware/upload.middleware";
import {
  createPostSchema,
  updatePostSchema,
  feedQuerySchema,
  createCommentSchema,
  updateCommentSchema,
  commentsQuerySchema,
} from "./post.validation";

const router = Router();

router.use(authenticate);

const withImageUpload = (
  req: import("express").Request,
  res: import("express").Response,
  next: import("express").NextFunction
) => {
  uploadPostImage.single("image")(req, res, (err) => {
    if (err) return next(err);
    next();
  });
};

router.get("/", validate(feedQuerySchema, "query"), postController.getFeed);
router.post("/", withImageUpload, validate(createPostSchema), postController.createPost);
router.patch("/:id", withImageUpload, validate(updatePostSchema), postController.updatePost);
router.delete("/:id", postController.deletePost);
router.post("/:id/like", postController.toggleLike);
router.get(
  "/:id/comments",
  validate(commentsQuerySchema, "query"),
  postController.getComments
);
router.post(
  "/:id/comments",
  validate(createCommentSchema),
  postController.addComment
);
router.patch(
  "/:id/comments/:commentId",
  validate(updateCommentSchema),
  postController.updateComment
);
router.delete("/:id/comments/:commentId", postController.deleteComment);

export default router;
