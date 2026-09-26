"use strict";

function profileStoreErrorHandler(error, req, res, next) {
  if (error && error.code === "PROFILE_STORE_MIRROR_FAILED") {
    return res.status(503).json({
      error: {
        code: "PROFILE_STORE_MIRROR_FAILED",
        message: "Configuration saved, but the storage mirror is temporarily unavailable"
      }
    });
  }
  if (error && error.code === "PROFILE_STORE_READ_FAILED") {
    return res.status(503).json({
      error: {
        code: "PROFILE_STORE_READ_FAILED",
        message: "Configuration storage is temporarily unavailable"
      }
    });
  }
  if (error && error.code === "PROFILE_STORE_WRITE_FAILED") {
    return res.status(503).json({
      error: {
        code: "PROFILE_STORE_WRITE_FAILED",
        message: "Configuration was not created because storage is temporarily unavailable"
      }
    });
  }
  if (error && error.code === "PROFILE_STORE_ACCOUNT_EXISTS") {
    return res.status(409).json({
      error: {
        code: "PROFILE_STORE_ACCOUNT_EXISTS",
        message: "Configuration token already exists"
      }
    });
  }
  return next(error);
}

module.exports = { profileStoreErrorHandler };
