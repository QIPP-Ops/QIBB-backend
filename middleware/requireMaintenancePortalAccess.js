const { canAccessMaintenancePortal } = require('../utils/maintenanceAccess');



function requireMaintenancePortalAccess(req, res, next) {

  if (canAccessMaintenancePortal(req.user)) {

    return next();

  }

  return res.status(403).json({

    message: 'Maintenance portal access is restricted to the super administrator and Bander Aldogaish.',

    code: 'MAINTENANCE_ACCESS_DENIED',

  });

}



module.exports = { requireMaintenancePortalAccess };


