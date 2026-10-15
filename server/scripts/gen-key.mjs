// Prints a new random AES-256 key (base64 of 32 bytes) for ENCRYPTION_KEY.
//   local:      paste into server/.dev.vars
//   production: npx wrangler secret put ENCRYPTION_KEY  (then paste)
// Changing the key makes existing secrets unreadable — keep the old key until they are re-encrypted.
import { randomBytes } from 'node:crypto';

console.log(randomBytes(32).toString('base64'));
