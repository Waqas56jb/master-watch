const { authClient } = require("../../utils/apiClient");

// #25 — List saved payment methods
const getPaymentMethods = async (req, res) => {
  const response = await authClient(req.token).get("/v1/customers/payment-methods");
  res.json(response.data);
};

// #26 — Add new payment method
const addPaymentMethod = async (req, res) => {
  const response = await authClient(req.token).post("/v1/customers/payment-methods", req.body);
  res.json(response.data);
};

// #27 — Delete payment method
const deletePaymentMethod = async (req, res) => {
  const response = await authClient(req.token).delete(`/v1/customers/payment-methods/${req.params.id}`);
  res.json(response.data);
};

// #28 — Set default payment method
const setDefaultPaymentMethod = async (req, res) => {
  const response = await authClient(req.token).post(`/v1/customers/payment-methods/${req.params.id}/set-default`);
  res.json(response.data);
};

module.exports = {
  getPaymentMethods,
  addPaymentMethod,
  deletePaymentMethod,
  setDefaultPaymentMethod,
};
