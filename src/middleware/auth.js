const jwt = require("jsonwebtoken");

function authenticate(req, res, next) {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401).json({
      error: "Authentication required",
      message: "Provide a valid Bearer token in the Authorization header.",
    });
  }

  const token = authHeader.substring(7);

  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET);

    req.user = {
      id: payload.userId,
    };

    next();
  } catch {
    return res.status(401).json({
      error: "Invalid authentication token",
      message: "Provide a valid and non-expired Bearer token.",
    });
  }
}

module.exports = authenticate;