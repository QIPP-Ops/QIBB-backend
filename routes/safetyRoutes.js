const express = require('express');
const router = express.Router();
const safetyController = require('../controllers/safetyController');

router.get('/', safetyController.getAllPermits);
router.post('/', safetyController.createPermit);
router.patch('/:id', safetyController.updatePermitStatus);
router.delete('/:id', safetyController.deletePermit);

module.exports = router;
