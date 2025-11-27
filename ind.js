const jwt = require("jsonwebtoken");

const token = jwt.sign(
  { userId: 123 },            // payload
  "mysecretkey",              // secret key (use env variable in real apps)
  { expiresIn: "1d" }         // expiry time
);

console.log(token);
