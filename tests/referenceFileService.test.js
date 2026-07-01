const {
  isAllowedReferenceFile,
  uploadReferenceFile,
  readReferenceFile,
  mongoFileKey,
} = require('../services/referenceFileService');

describe('referenceFileService', () => {
  test('isAllowedReferenceFile accepts pdf and word docs', () => {
    expect(
      isAllowedReferenceFile({ originalname: 'guide.pdf', mimetype: 'application/pdf' })
    ).toBe(true);
    expect(
      isAllowedReferenceFile({ originalname: 'policy.docx', mimetype: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' })
    ).toBe(true);
    expect(
      isAllowedReferenceFile({ originalname: 'notes.txt', mimetype: 'text/plain' })
    ).toBe(false);
  });

  test('uploadReferenceFile stores mongo buffer when R2 is not configured', async () => {
    const itemId = '507f1f77bcf86cd799439011';
    const file = {
      originalname: 'manual.pdf',
      mimetype: 'application/pdf',
      size: 12,
      buffer: Buffer.from('%PDF-1.4'),
    };

    const uploaded = await uploadReferenceFile({ itemId, file });

    expect(uploaded.storageKey).toBe(mongoFileKey(itemId));
    expect(uploaded.fileName).toBe('manual.pdf');
    expect(uploaded.mimeType).toBe('application/pdf');
    expect(uploaded.fileUrl).toBe(`/api/training/references/files/${itemId}`);
    expect(uploaded.fileData).toEqual(file.buffer);
  });

  test('readReferenceFile returns mongo buffer from fileData', async () => {
    const buffer = Buffer.from('%PDF-1.4');
    const result = await readReferenceFile({
      storageKey: 'mongo:abc:file',
      fileData: buffer,
    });
    expect(result).toEqual(buffer);
  });
});
