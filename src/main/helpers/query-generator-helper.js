function GenerateQuestionnaireLlmQuery({ issue, gender, age } = {}) {
  const safeIssue = String(issue || "").trim() || "an unspecified health issue";
  const safeGender = String(gender || "male").toLowerCase();
  const safeAge = String(age || "30");

  return `You are a medical intake assistant. The user is a ${safeAge}-year-old ${safeGender} reporting the following issue: "${safeIssue}". Ask the user a short list of clear, specific follow-up questions to better understand their symptoms, history, and severity. Keep the questions concise and easy to answer.`;
}

module.exports = { GenerateQuestionnaireLlmQuery };
