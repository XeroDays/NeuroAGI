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
