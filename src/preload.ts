import * as crypto from 'crypto';
(global as any).crypto = crypto;


if (!global.crypto) {
  // @ts-ignore
  global.crypto = require("crypto").webcrypto;
}