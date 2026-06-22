const path = require('path');

const fs = require('fs');

const mongoose = require('mongoose');

require('dotenv').config();



const { getMongoUri } = require('../config/database');

const { parseExportDirectory } = require('../utils/qippHtmlParser');

const WorkOrder = require('../models/WorkOrder');

const JobHazardAnalysis = require('../models/JobHazardAnalysis');

const SafetyPermit = require('../models/SafetyPermit');

const IsolationPoint = require('../models/IsolationPoint');

const PermitPackage = require('../models/PermitPackage');

const Equipment = require('../models/Equipment');

const Location = require('../models/Location');

const KeySafe = require('../models/KeySafe');



const DEFAULT_EXPORT_DIR = path.join(

  'C:',

  'Users',

  'asus',

  'Downloads',

  'it (1)',

  'New folder'

);



async function bulkUpsert(Model, items, keyField) {

  if (!items.length) return 0;

  const ops = items.map((doc) => ({

    updateOne: {

      filter: { [keyField]: doc[keyField] },

      update: { $set: doc },

      upsert: true,

    },

  }));

  const result = await Model.bulkWrite(ops, { ordered: false });

  return result.upsertedCount + result.modifiedCount + result.matchedCount;

}



async function linkPackages(packages) {

  for (const pkg of packages) {

    const updates = [];

    pkg.workOrderCodes.forEach((code) => {

      updates.push(WorkOrder.updateMany({ code }, { $set: { permitPackageId: pkg.packageId } }));

    });

    pkg.jhaCodes.forEach((code) => {

      updates.push(JobHazardAnalysis.updateMany({ code }, { $set: { permitPackageId: pkg.packageId } }));

    });

    pkg.permitCodes.forEach((code) => {

      updates.push(SafetyPermit.updateMany({ code }, { $set: { permitPackageId: pkg.packageId } }));

    });

    (pkg.workPacks || []).forEach((wp) => {

      if (wp.workOrderCode && wp.permitCode) {

        updates.push(SafetyPermit.updateMany(

          { code: wp.permitCode },

          { $set: { workOrderCode: wp.workOrderCode, jhaCode: wp.jhaCode || '' } }

        ));

      }

      if (wp.workOrderCode && wp.jhaCode) {

        updates.push(JobHazardAnalysis.updateMany(

          { code: wp.jhaCode },

          { $set: { workOrderCode: wp.workOrderCode } }

        ));

      }

    });

    await Promise.all(updates);

  }

}



async function importQippPrometheus(options = {}) {

  const exportDir = options.exportDir || process.env.QIPP_EXPORT_DIR || DEFAULT_EXPORT_DIR;

  const parsed = parseExportDirectory(exportDir);



  const outJson = path.join(__dirname, '../data/qipp-prometheus-import.json');

  fs.mkdirSync(path.dirname(outJson), { recursive: true });

  fs.writeFileSync(outJson, JSON.stringify(parsed, null, 2), 'utf8');



  if (options.jsonOnly) {

    return { ...parsed.stats, jsonPath: outJson, seeded: false };

  }



  await mongoose.connect(getMongoUri(), { retryWrites: false });



  const [wo, jha, pe, iso, pkg, equip, loc, ks] = await Promise.all([

    bulkUpsert(WorkOrder, parsed.workOrders, 'code'),

    bulkUpsert(JobHazardAnalysis, parsed.jhas, 'code'),

    bulkUpsert(SafetyPermit, parsed.permits, 'code'),

    bulkUpsert(IsolationPoint, parsed.isolationPoints, 'code'),

    bulkUpsert(PermitPackage, parsed.permitPackages, 'packageId'),

    bulkUpsert(Equipment, parsed.equipment, 'code'),

    bulkUpsert(Location, parsed.locations, 'code'),

    bulkUpsert(KeySafe, parsed.keySafes, 'code'),

  ]);



  await linkPackages(parsed.permitPackages);



  await mongoose.disconnect();



  return {

    ...parsed.stats,

    jsonPath: outJson,

    seeded: true,

    bulk: {

      workOrders: wo,

      jhas: jha,

      permits: pe,

      isolationPoints: iso,

      permitPackages: pkg,

      equipment: equip,

      locations: loc,

      keySafes: ks,

    },

  };

}



if (require.main === module) {

  const jsonOnly = process.argv.includes('--json-only');

  const exportArg = process.argv.find((a) => a.startsWith('--dir='));

  const exportDir = exportArg ? exportArg.slice(6) : undefined;



  importQippPrometheus({ jsonOnly, exportDir })

    .then((result) => {

      console.log('QIPP Prometheus import complete:', JSON.stringify(result, null, 2));

      process.exit(0);

    })

    .catch((err) => {

      console.error(err);

      process.exit(1);

    });

}



module.exports = { importQippPrometheus };

