const ReferenceCategory = require('../models/ReferenceCategory');
const ReferenceItem = require('../models/ReferenceItem');
const {
  uploadReferenceFile,
  readReferenceFile,
  deleteReferenceFile,
} = require('../services/referenceFileService');

const VALID_TYPES = ReferenceCategory.REFERENCE_TYPES;

function parseType(raw) {
  const type = String(raw || '').trim();
  if (!VALID_TYPES.includes(type)) return null;
  return type;
}

function createdById(req) {
  return req.user?._id || req.user?.userId || null;
}

function serializeItem(item) {
  const doc = item?.toObject ? item.toObject() : { ...item };
  delete doc.fileData;
  return doc;
}

async function buildGroupedResponse(type) {
  const [categories, items] = await Promise.all([
    ReferenceCategory.find({ type }).sort({ sortOrder: 1, name: 1 }).lean(),
    ReferenceItem.find({ type }).sort({ sortOrder: 1, title: 1 }).lean(),
  ]);

  const itemsByCategory = items.reduce((acc, item) => {
    const key = String(item.categoryId);
    if (!acc[key]) acc[key] = [];
    acc[key].push(item);
    return acc;
  }, {});

  return {
    type,
    categories: categories.map((cat) => ({
      ...cat,
      items: itemsByCategory[String(cat._id)] || [],
    })),
  };
}

async function clearItemFile(item) {
  if (!item?.storageKey) return;
  await deleteReferenceFile({ storageKey: item.storageKey });
  item.storageKey = '';
  item.fileUrl = '';
  item.fileName = '';
  item.mimeType = '';
  item.fileData = undefined;
}

exports.listReferences = async (req, res) => {
  try {
    const type = parseType(req.query.type);
    if (!type) {
      return res.status(400).json({ message: 'Valid type query param required (manuals or policies_procedures).' });
    }
    const data = await buildGroupedResponse(type);
    res.json(data);
  } catch (err) {
    res.status(500).json({ message: 'Error fetching references', error: err.message });
  }
};

exports.createCategory = async (req, res) => {
  try {
    const type = parseType(req.body.type);
    const name = String(req.body.name || '').trim();
    if (!type) return res.status(400).json({ message: 'Valid type is required.' });
    if (!name) return res.status(400).json({ message: 'Category name is required.' });

    const existing = await ReferenceCategory.findOne({ type, name });
    if (existing) {
      return res.status(409).json({ message: 'A category with this name already exists.' });
    }

    const sortOrder = Number.isFinite(Number(req.body.sortOrder)) ? Number(req.body.sortOrder) : 0;
    const category = await ReferenceCategory.create({
      type,
      name,
      sortOrder,
      createdBy: createdById(req),
    });

    res.status(201).json(category);
  } catch (err) {
    res.status(500).json({ message: 'Error creating category', error: err.message });
  }
};

exports.updateCategory = async (req, res) => {
  try {
    const category = await ReferenceCategory.findById(req.params.id);
    if (!category) return res.status(404).json({ message: 'Category not found.' });

    if (req.body.name !== undefined) {
      const name = String(req.body.name || '').trim();
      if (!name) return res.status(400).json({ message: 'Category name cannot be empty.' });
      const duplicate = await ReferenceCategory.findOne({
        type: category.type,
        name,
        _id: { $ne: category._id },
      });
      if (duplicate) {
        return res.status(409).json({ message: 'A category with this name already exists.' });
      }
      category.name = name;
    }

    if (req.body.sortOrder !== undefined && Number.isFinite(Number(req.body.sortOrder))) {
      category.sortOrder = Number(req.body.sortOrder);
    }

    await category.save();
    res.json(category);
  } catch (err) {
    res.status(500).json({ message: 'Error updating category', error: err.message });
  }
};

exports.deleteCategory = async (req, res) => {
  try {
    const category = await ReferenceCategory.findById(req.params.id);
    if (!category) return res.status(404).json({ message: 'Category not found.' });

    const items = await ReferenceItem.find({ categoryId: category._id }).select('+fileData storageKey');
    await Promise.all(items.map((item) => clearItemFile(item)));
    await ReferenceItem.deleteMany({ categoryId: category._id });
    await category.deleteOne();
    res.json({ message: 'Category deleted.' });
  } catch (err) {
    res.status(500).json({ message: 'Error deleting category', error: err.message });
  }
};

exports.createItem = async (req, res) => {
  try {
    const type = parseType(req.body.type);
    const title = String(req.body.title || '').trim();
    const categoryId = req.body.categoryId;

    if (!type) return res.status(400).json({ message: 'Valid type is required.' });
    if (!title) return res.status(400).json({ message: 'Title is required.' });
    if (!categoryId) return res.status(400).json({ message: 'categoryId is required.' });

    const category = await ReferenceCategory.findById(categoryId);
    if (!category) return res.status(404).json({ message: 'Category not found.' });
    if (category.type !== type) {
      return res.status(400).json({ message: 'Category type does not match item type.' });
    }

    const sortOrder = Number.isFinite(Number(req.body.sortOrder)) ? Number(req.body.sortOrder) : 0;
    const item = await ReferenceItem.create({
      type,
      categoryId,
      title,
      description: String(req.body.description || '').trim(),
      url: String(req.body.url || '').trim(),
      sortOrder,
      createdBy: createdById(req),
    });

    res.status(201).json(serializeItem(item));
  } catch (err) {
    res.status(500).json({ message: 'Error creating reference item', error: err.message });
  }
};

exports.updateItem = async (req, res) => {
  try {
    const item = await ReferenceItem.findById(req.params.id);
    if (!item) return res.status(404).json({ message: 'Reference item not found.' });

    if (req.body.title !== undefined) {
      const title = String(req.body.title || '').trim();
      if (!title) return res.status(400).json({ message: 'Title cannot be empty.' });
      item.title = title;
    }

    if (req.body.description !== undefined) {
      item.description = String(req.body.description || '').trim();
    }

    if (req.body.url !== undefined) {
      item.url = String(req.body.url || '').trim();
    }

    if (req.body.removeFile === true) {
      await clearItemFile(item);
    }

    if (req.body.sortOrder !== undefined && Number.isFinite(Number(req.body.sortOrder))) {
      item.sortOrder = Number(req.body.sortOrder);
    }

    if (req.body.categoryId !== undefined) {
      const category = await ReferenceCategory.findById(req.body.categoryId);
      if (!category) return res.status(404).json({ message: 'Category not found.' });
      if (category.type !== item.type) {
        return res.status(400).json({ message: 'Category type does not match item type.' });
      }
      item.categoryId = category._id;
    }

    await item.save();
    res.json(serializeItem(item));
  } catch (err) {
    res.status(500).json({ message: 'Error updating reference item', error: err.message });
  }
};

exports.uploadItemFile = async (req, res) => {
  try {
    const item = await ReferenceItem.findById(req.params.id).select('+fileData');
    if (!item) return res.status(404).json({ message: 'Reference item not found.' });
    if (!req.file) return res.status(400).json({ message: 'No file uploaded.' });

    if (item.storageKey) {
      await clearItemFile(item);
    }

    const uploaded = await uploadReferenceFile({
      itemId: String(item._id),
      file: req.file,
    });

    item.storageKey = uploaded.storageKey;
    item.fileUrl = uploaded.fileUrl;
    item.fileName = uploaded.fileName;
    item.mimeType = uploaded.mimeType;
    if (uploaded.fileData) {
      item.fileData = uploaded.fileData;
    } else {
      item.fileData = undefined;
    }

    await item.save();
    res.json(serializeItem(item));
  } catch (err) {
    const status = err.status || 500;
    res.status(status).json({
      message: status === 500 ? 'Error uploading reference file' : err.message,
      error: err.message,
    });
  }
};

exports.serveReferenceFile = async (req, res) => {
  try {
    const item = await ReferenceItem.findById(req.params.id).select('+fileData storageKey fileName mimeType');
    if (!item || !item.storageKey) {
      return res.status(404).json({ message: 'Reference file not found.' });
    }

    const buffer = await readReferenceFile({
      storageKey: item.storageKey,
      fileData: item.fileData,
    });

    const mimeType = item.mimeType || 'application/octet-stream';
    const fileName = item.fileName || 'reference-file';
    res.setHeader('Content-Type', mimeType);
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Cache-Control', 'private, no-store');
    res.setHeader('Content-Disposition', `inline; filename="${fileName.replace(/"/g, '')}"`);
    res.send(buffer);
  } catch (err) {
    const status = err.status || 500;
    res.status(status).json({
      message: status === 500 ? 'Error serving reference file' : err.message,
      error: err.message,
    });
  }
};

exports.deleteItem = async (req, res) => {
  try {
    const item = await ReferenceItem.findById(req.params.id).select('+fileData storageKey');
    if (!item) return res.status(404).json({ message: 'Reference item not found.' });
    await clearItemFile(item);
    await item.deleteOne();
    res.json({ message: 'Reference item deleted.' });
  } catch (err) {
    res.status(500).json({ message: 'Error deleting reference item', error: err.message });
  }
};
