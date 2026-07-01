const ReferenceCategory = require('../models/ReferenceCategory');
const ReferenceItem = require('../models/ReferenceItem');

const DEFAULT_MANUALS = [
  {
    category: 'Operations',
    title: 'Plant Operating Manual — Overview',
    description: 'High-level plant systems and operating philosophy.',
    url: '',
  },
  {
    category: 'Safety',
    title: 'Emergency Response Procedures',
    description: 'ERT roles, muster points, and escalation contacts.',
    url: '',
  },
  {
    category: 'Technical',
    title: 'Chemistry & Water Treatment SOPs',
    description: 'Lab sampling, chemical dosing, and quality limits.',
    url: '',
  },
  {
    category: 'Maintenance',
    title: 'Maintenance Work Order Guide',
    description: 'Raising WOs, JHA linkage, and PTW coordination.',
    url: '',
  },
  {
    category: 'PTW',
    title: 'PTW Authorization Matrix Reference',
    description: 'Role matrix for permit receivers, issuers, and safety coordinators.',
    url: '/ptw',
  },
  {
    category: 'HR',
    title: 'Leave & Crew Roster Policy',
    description: 'Leave types, delegation, and timesheet expectations.',
    url: '/leave',
  },
];

async function ensureCategory(type, name, sortOrder) {
  let category = await ReferenceCategory.findOne({ type, name });
  if (!category) {
    category = await ReferenceCategory.create({ type, name, sortOrder });
    return { category, created: true };
  }
  return { category, created: false };
}

async function ensureBuiltinReferencesSeeded(options = {}) {
  const force = Boolean(options.force);
  const existingCount = await ReferenceItem.countDocuments({ type: 'manuals' });
  if (existingCount > 0 && !force) {
    return { seeded: false, reason: 'already_has_items', count: existingCount };
  }

  if (force) {
    await ReferenceItem.deleteMany({ type: 'manuals' });
    await ReferenceCategory.deleteMany({ type: 'manuals' });
  }

  let itemsCreated = 0;
  let categoriesCreated = 0;

  for (let i = 0; i < DEFAULT_MANUALS.length; i += 1) {
    const def = DEFAULT_MANUALS[i];
    const { category, created } = await ensureCategory('manuals', def.category, i);
    if (created) categoriesCreated += 1;

    const exists = await ReferenceItem.findOne({
      type: 'manuals',
      categoryId: category._id,
      title: def.title,
    });
    if (!exists) {
      await ReferenceItem.create({
        type: 'manuals',
        categoryId: category._id,
        title: def.title,
        description: def.description,
        url: def.url,
        sortOrder: i,
      });
      itemsCreated += 1;
    }
  }

  return {
    seeded: itemsCreated > 0 || categoriesCreated > 0,
    itemsCreated,
    categoriesCreated,
  };
}

module.exports = {
  DEFAULT_MANUALS,
  ensureBuiltinReferencesSeeded,
};
