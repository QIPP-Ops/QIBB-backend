const express = require('express');
const multer = require('multer');
const router = express.Router();
const { protect } = require('../middleware/auth');
const { admin } = require('../middleware/auth');
const { requireSuperAdmin } = require('../middleware/superAdmin');
const c = require('../controllers/trainingController');

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 8 * 1024 * 1024 },
});

const quizUpload = upload.fields([
  { name: 'html', maxCount: 1 },
  { name: 'prizeImage', maxCount: 1 },
]);

router.get('/catalog', protect, c.getCatalog);
router.get('/completed-courses', protect, c.getCompletedCourses);
router.post('/catalog/add-to-curriculum', protect, c.addCatalogToCurriculum);

router.post('/quiz/upload', protect, requireSuperAdmin, quizUpload, c.uploadQuiz);
router.get('/quiz/list', protect, c.listQuizzes);
router.get('/quiz/attempts', protect, c.listQuizAttempts);
router.delete('/quiz/:quizId', protect, requireSuperAdmin, c.deleteQuiz);
router.get('/quiz/:quizId/results', protect, c.getQuizResults);
router.patch('/quiz/:quizId/reward', protect, requireSuperAdmin, c.updateQuizReward);
router.post('/quiz/:quizId/attempts', protect, c.recordQuizAttempt);
router.get('/quiz/:quizId/html', protect, c.getQuizHtml);
router.get('/quiz/:quizId/prize-image', protect, c.getQuizPrizeImage);
router.post('/quiz/assign', protect, c.assignQuiz);
router.post('/quiz/unassign', protect, c.unassignQuiz);
router.get('/quiz/:quizId/assignments', protect, c.listQuizAssignments);
router.patch('/quiz/assignment/:assignmentId', protect, c.updateQuizAssignment);
router.post('/quiz/complete', protect, c.completeQuiz);
router.post('/quiz/claim-prize', protect, c.claimQuizPrize);
router.post('/course-reminder', protect, admin, c.sendCourseReminder);

module.exports = router;
