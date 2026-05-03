const { apiClient } = require("../../utils/apiClient");

// #24 — Get feedback questions (for rating form)
const getFeedbackQuestions = async (req, res) => {
  const response = await apiClient.get("/v1/customers/feedback/questions");
  res.json(response.data);
};

module.exports = { getFeedbackQuestions };
