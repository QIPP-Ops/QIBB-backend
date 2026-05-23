const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/authMiddleware');
const c = require('../controllers/trainingController');

router.get('/catalog', protect, c.getCatalog);
router.get('/completed-courses', protect, c.getCompletedCourses);
router.post('/catalog/add-to-curriculum', protect, c.addCatalogToCurriculum);

module.exports = router;
