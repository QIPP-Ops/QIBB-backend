jest.mock('../models/Quiz', () => ({
  updateOne: jest.fn().mockResolvedValue({}),
  findById: jest.fn(),
}));

const Quiz = require('../models/Quiz');
const {
  saveQuizHtml,
  savePrizeImage,
  readStorage,
  mongoHtmlKey,
  mongoPrizeKey,
} = require('../services/quizStorage');

describe('quizStorage MongoDB persistence', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('saveQuizHtml stores buffer in MongoDB', async () => {
    const quizId = '507f1f77bcf86cd799439011';
    const buffer = Buffer.from('<html><body>quiz</body></html>');
    const key = await saveQuizHtml(quizId, buffer);
    expect(key).toBe(mongoHtmlKey(quizId));
    expect(Quiz.updateOne).toHaveBeenCalledWith(
      { _id: quizId },
      { $set: { htmlContent: buffer, htmlStorageKey: mongoHtmlKey(quizId) } }
    );
  });

  test('savePrizeImage stores buffer in MongoDB', async () => {
    const quizId = '507f1f77bcf86cd799439011';
    const buffer = Buffer.from('fake-image');
    const key = await savePrizeImage(quizId, buffer, 'image/png');
    expect(key).toBe(mongoPrizeKey(quizId));
    expect(Quiz.updateOne).toHaveBeenCalledWith(
      { _id: quizId },
      {
        $set: {
          prizeImageData: buffer,
          prizeImageMime: 'image/png',
          prizeImageUrl: mongoPrizeKey(quizId),
        },
      }
    );
  });

  test('readStorage reads from MongoDB key', async () => {
    const quizId = '507f1f77bcf86cd799439011';
    const html = Buffer.from('<html></html>');
    Quiz.findById.mockReturnValue({
      select: () => ({
        lean: () => Promise.resolve({ htmlContent: html }),
      }),
    });
    const result = await readStorage(mongoHtmlKey(quizId));
    expect(result.equals(html)).toBe(true);
  });
});
