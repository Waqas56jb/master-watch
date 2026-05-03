const { authClient } = require("../../utils/apiClient");

// #30 — Get profile
const getAccount = async (req, res) => {
  const response = await authClient(req.token).get("/v1/customers/account");
  res.json(response.data);
};

// #31 — Logout
const logout = async (req, res) => {
  const response = await authClient(req.token).post("/v1/customers/logout");
  res.json(response.data);
};

module.exports = { getAccount, logout };
