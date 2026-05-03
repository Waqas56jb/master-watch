// Checks if Bearer token exists in request headers before protected routes
const authMiddleware = (req, res, next) => {
  const authHeader = req.headers["authorization"];

  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401).json({
      status: "Error",
      message: "Unauthorized. Please login first.",
    });
  }

  req.token = authHeader.split(" ")[1];
  next();
};

module.exports = authMiddleware;
