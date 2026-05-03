const { authClient } = require("../../utils/apiClient");

// #29 — List notifications
const getNotifications = async (req, res) => {
  const response = await authClient(req.token).get("/v1/customers/notifications");
  res.json(response.data);
};

module.exports = { getNotifications };
