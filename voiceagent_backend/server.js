require("dotenv").config();
const express = require("express");
const cors = require("cors");

const app = express();
app.use(cors());
app.use(express.json());

// ─── Middleware ────────────────────────────────────────
const authMiddleware = require("./src/middleware/auth.middleware");

// ─── PUBLIC ROUTES — No login required ────────────────
// #9-13  Auth       → register, login, otp, password reset
// #1-5,8 Config     → airports, vehicles, passengers, child seats, luggage, discount
// #6-7   Trips      → calculate-route, calculate-cost
const authRoutes       = require("./src/routes/public/auth.routes");
const configRoutes     = require("./src/routes/public/config.routes");
const publicTripRoutes = require("./src/routes/public/trip.routes");

app.use("/api/auth",         authRoutes);
app.use("/api/config",       configRoutes);
app.use("/api/trips",        publicTripRoutes);

// ─── PROTECTED ROUTES — Login required ────────────────
// #14-23 Trips      → create, list, get, confirm, cancel, return, messages, feedback
// #25-28 Payments   → list, add, delete, set-default
// #29    Notifications → list
// #30-31 Account    → profile, logout
// #24    Feedback   → questions
const tripRoutes         = require("./src/routes/protected/trip.routes");
const paymentRoutes      = require("./src/routes/protected/payment.routes");
const notificationRoutes = require("./src/routes/protected/notification.routes");
const accountRoutes      = require("./src/routes/protected/account.routes");
const feedbackRoutes     = require("./src/routes/protected/feedback.routes");

app.use("/api/my-trips",      authMiddleware, tripRoutes);
app.use("/api/payments",      authMiddleware, paymentRoutes);
app.use("/api/notifications", authMiddleware, notificationRoutes);
app.use("/api/account",       authMiddleware, accountRoutes);
app.use("/api/feedback",      authMiddleware, feedbackRoutes);

// ─── Chat (OpenAI) ─────────────────────────────────────
const chatRoutes  = require("./src/routes/chat.routes");
const voiceRoutes = require("./src/routes/voice.routes");
app.use("/api/chat",  chatRoutes);
app.use("/api/voice", voiceRoutes);

// ─── Health Check ──────────────────────────────────────
app.get("/", (req, res) => {
  res.json({ status: "Travel Bot Backend is running!", totalAPIs: 31 });
});

// ─── Global Error Handler ──────────────────────────────
app.use((err, req, res, next) => {
  console.error(err?.response?.data || err.message);
  res.status(err?.response?.status || 500).json({
    status: "Error",
    message: err?.response?.data?.message || "Something went wrong",
  });
});

const PORT = process.env.PORT || 5000;
const server = app.listen(PORT, () => {
  console.log(`\n✅ Server running on http://localhost:${PORT}`);
  console.log(`📂 Public   → /api/auth | /api/config | /api/trips`);
  console.log(`🔒 Protected→ /api/my-trips | /api/payments | /api/notifications | /api/account | /api/feedback`);
  console.log(`🤖 Chat     → /api/chat`);
  console.log(`\nPress Ctrl+C to stop.\n`);
});

server.on("error", (err) => {
  if (err.code === "EADDRINUSE") {
    console.error(`\n❌ Port ${PORT} is already in use!`);
    console.error(`   Run this to kill it: npx kill-port ${PORT}`);
    console.error(`   Or change PORT in .env\n`);
  } else {
    console.error("Server error:", err);
  }
  process.exit(1);
});
