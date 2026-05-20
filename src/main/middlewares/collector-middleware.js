/**
 * Starts a new report collection session with the user's initial inputs.
 * Called from the home screen when the user submits their health issue.
 * @param {{ issue: string, gender: string, age: string|number }} payload
 * @returns {{ ok: boolean, issue: string, gender: string, age: string }}
 */
function StartReportcollection({ issue, gender, age }) {
  console.log("[collector] StartReportcollection:", { issue, gender, age });
  return {
    ok: true,
    issue: String(issue || ""),
    gender: String(gender || "male"),
    age: String(age || "30"),
  };
}

module.exports = { StartReportcollection };
