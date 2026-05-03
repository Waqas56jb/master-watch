const axios = require("axios");
const { BASE_URL, API_KEY } = require("../config/hopn.config");

// Hop'n API client — always sends X-API-Key
const apiClient = axios.create({
  baseURL: BASE_URL,
  headers: {
    "X-API-Key": API_KEY,
    "Content-Type": "application/json",
  },
});

// Attach Bearer token if provided
const authClient = (token) => {
  return axios.create({
    baseURL: BASE_URL,
    headers: {
      "X-API-Key": API_KEY,
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
  });
};

module.exports = { apiClient, authClient };
