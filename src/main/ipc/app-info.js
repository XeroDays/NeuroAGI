const SoftwareLicensingService = require("../services/software-licensing-service");

function buildAppInfo() {
  let pkg = {};
  try {
    pkg = require("../../../package.json");
  } catch {
    pkg = {};
  }

  return {
    productName: pkg.build?.productName || pkg.name || "NeuroAGI",
    version: SoftwareLicensingService.getVersionName(),
    build: SoftwareLicensingService.getBuildVersion(),
  };
}

module.exports = { buildAppInfo };
