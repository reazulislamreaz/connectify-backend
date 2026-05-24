import multer from "multer";
import path from "path";

const imageFilter: multer.Options["fileFilter"] = (_req, file, cb) => {
  const allowed = /jpeg|jpg|png|gif|webp/;
  const ext = allowed.test(path.extname(file.originalname).toLowerCase());
  const mime = allowed.test(file.mimetype);
  if (ext && mime) {
    cb(null, true);
  } else {
    cb(new Error("Only image files are allowed"));
  }
};

const memoryStorage = multer.memoryStorage();

export const uploadImage = multer({
  storage: memoryStorage,
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: imageFilter,
});

export const uploadAvatar = multer({
  storage: memoryStorage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: imageFilter,
});

export const uploadPostImage = multer({
  storage: memoryStorage,
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: imageFilter,
});

export const uploadMessageImage = multer({
  storage: memoryStorage,
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: imageFilter,
});

const audioFilter: multer.Options["fileFilter"] = (_req, file, cb) => {
  const allowedExt = /webm|ogg|mp3|mpeg|mp4|m4a|wav|aac/;
  const allowedMime = /^audio\//;
  const ext = allowedExt.test(path.extname(file.originalname).toLowerCase());
  const mime = allowedMime.test(file.mimetype);
  if (ext && mime) {
    cb(null, true);
  } else {
    cb(new Error("Only audio files are allowed"));
  }
};

const messageMediaFilter: multer.Options["fileFilter"] = (req, file, cb) => {
  if (file.fieldname === "image") {
    return imageFilter(req, file, cb);
  }
  if (file.fieldname === "voice") {
    return audioFilter(req, file, cb);
  }
  cb(new Error("Unexpected upload field"));
};

export const uploadMessageMedia = multer({
  storage: memoryStorage,
  limits: { fileSize: 16 * 1024 * 1024 },
  fileFilter: messageMediaFilter,
}).fields([
  { name: "image", maxCount: 1 },
  { name: "voice", maxCount: 1 },
]);
