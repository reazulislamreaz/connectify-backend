/**
 * Official ZEGOCLOUD token04 generator (pinned from zego_server_assistant repo).
 * @see zegoServerAssistant.official.js
 */
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);

const { generateToken04 } = require("./zegoServerAssistant.official.js") as {
  generateToken04: (
    appId: number,
    userId: string,
    secret: string,
    effectiveTimeInSeconds: number,
    payload?: string,
  ) => string;
};

export { generateToken04 };
