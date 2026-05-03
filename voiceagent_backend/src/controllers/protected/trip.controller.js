const { authClient } = require("../../utils/apiClient");

// #14 — Create trip (route_hash + vehicle + payment)
const createTrip = async (req, res) => {
  const response = await authClient(req.token).post("/v1/customers/trips", req.body);
  res.json(response.data);
};

// #15 — Confirm trip
const confirmTrip = async (req, res) => {
  const response = await authClient(req.token).post(`/v1/customers/trips/${req.params.id}/confirm`);
  res.json(response.data);
};

// #16 — List all trips
const getTrips = async (req, res) => {
  const response = await authClient(req.token).get("/v1/customers/trips");
  res.json(response.data);
};

// #17 — Single trip (status + driver info)
const getTripById = async (req, res) => {
  const response = await authClient(req.token).get(`/v1/customers/trips/${req.params.id}`);
  res.json(response.data);
};

// #18 — Cancel trip
const cancelTrip = async (req, res) => {
  const response = await authClient(req.token).post(`/v1/customers/trips/${req.params.id}/cancel`, req.body);
  res.json(response.data);
};

// #19 — Cancellation policy (fee check before cancelling)
const getCancellationPolicy = async (req, res) => {
  const response = await authClient(req.token).get(`/v1/customers/trips/${req.params.id}/cancellation-policy`);
  res.json(response.data);
};

// #20 — Book return trip
const returnTrip = async (req, res) => {
  const response = await authClient(req.token).post(`/v1/customers/trips/${req.params.id}/return`, req.body);
  res.json(response.data);
};

// #21 — Send message to driver
const sendMessage = async (req, res) => {
  const response = await authClient(req.token).post(`/v1/customers/trips/${req.params.id}/messages`, req.body);
  res.json(response.data);
};

// #22 — Get conversation with driver
const getConversation = async (req, res) => {
  const response = await authClient(req.token).get(`/v1/customers/trips/${req.params.id}/conversation`);
  res.json(response.data);
};

// #23 — Submit trip feedback/rating
const submitTripFeedback = async (req, res) => {
  const response = await authClient(req.token).post(`/v1/customers/trips/${req.params.id}/feedback`, req.body);
  res.json(response.data);
};

module.exports = {
  createTrip,
  confirmTrip,
  getTrips,
  getTripById,
  cancelTrip,
  getCancellationPolicy,
  returnTrip,
  sendMessage,
  getConversation,
  submitTripFeedback,
};
