const crypto = require('crypto');

// Generate a 256-bit (32-byte) secret key in hex format
const secret = crypto.randomBytes(32).toString('hex');

console.log("Your JWT Secret Key:", secret);
