/**
 * Re-exports official ZEGOCLOUD token04 generator (see zegoServerAssistant.official.js).
 */
// eslint-disable-next-line @typescript-eslint/no-require-imports
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
