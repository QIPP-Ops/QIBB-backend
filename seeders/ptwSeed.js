const mongoose = require('mongoose');
require('dotenv').config();
const AdminConfig = require('../models/AdminConfig');

const PTW_PERSONNEL = [
  // SCE
  { name: 'Abdullah Alamri', designation: 'SCE', empNo: '', authorizations: ['safetyCoordinator','safetyControllerB','permitIssuer','isolationAuthority','voltageLow','voltageHigh'], validUntil: '' },
  { name: 'Mustafa Salem', designation: 'SCE', empNo: '', authorizations: ['safetyCoordinator','safetyControllerC','permitIssuer','isolationAuthority','voltageLow','voltageHigh'], validUntil: '2027-11-30' },
  // SS
  { name: 'Mustafa Al Ansari', designation: 'SS', empNo: '', authorizations: ['safetyCoordinator','safetyControllerC','permitIssuer','isolationAuthority','voltageLow','voltageHigh'], validUntil: '2027-11-30' },
  { name: 'Syed Shahanwaz', designation: 'SS', empNo: '', authorizations: ['safetyCoordinator','safetyControllerB','permitIssuer','isolationAuthority','voltageLow','voltageHigh'], validUntil: '2027-11-30' },
  { name: 'Abdul Hameed Abdul Rasheed', designation: 'SS', empNo: '', authorizations: ['safetyCoordinator','safetyControllerB','permitIssuer','isolationAuthority','voltageLow','voltageHigh'], validUntil: '' },
  { name: 'K.K.N.Srinivasu', designation: 'SS', empNo: '', authorizations: ['safetyCoordinator','safetyControllerC','permitIssuer','isolationAuthority','voltageLow','voltageHigh'], validUntil: '2027-11-30' },
  // CCR
  { name: 'Shaheer Yousaf', designation: 'CCR', empNo: '', authorizations: ['safetyCoordinator','safetyControllerB','permitIssuer','isolationAuthority','voltageLow','voltageHigh'], validUntil: '' },
  { name: 'Veera Venkata', designation: 'CCR', empNo: '', authorizations: ['safetyCoordinator','safetyControllerB','permitIssuer','isolationAuthority','voltageLow','voltageHigh'], validUntil: '2027-11-30' },
  { name: 'Juma Khan', designation: 'CCR', empNo: '', authorizations: ['safetyControllerB','permitIssuer','isolationAuthority','voltageLow','voltageHigh'], validUntil: '' },
  { name: 'Ahmed Meshref', designation: 'CCR', empNo: '', authorizations: ['safetyControllerA','permitIssuer','isolationAuthority','voltageLow','voltageHigh'], validUntil: '2027-11-30' },
  { name: 'Saleh Alamri', designation: 'CCR', empNo: '', authorizations: ['permitIssuer','isolationAuthority'], validUntil: '2027-12-31' },
  { name: 'Adam Alhuzum', designation: 'CCR', empNo: '', authorizations: ['permitIssuer','isolationAuthority'], validUntil: '2027-12-31' },
  { name: 'Mohammad Algarni', designation: 'CCR', empNo: '', authorizations: ['permitIssuer','isolationAuthority','voltageLow','voltageHigh'], validUntil: '2027-12-07' },
  { name: 'Ahmed Fathy', designation: 'CCR', empNo: '', authorizations: ['isolationAuthority'], validUntil: '' },
  { name: 'Arshad Hassan', designation: 'CCR', empNo: '', authorizations: ['isolationAuthority'], validUntil: '' },
  { name: 'Abdullah Al Hajri', designation: 'CCR', empNo: '', authorizations: ['isolationAuthority'], validUntil: '' },
  { name: 'Norbie Cruze', designation: 'CCR', empNo: '', authorizations: ['isolationAuthority'], validUntil: '2027-12-06' },
  // LO
  { name: 'Saravanakumar Madhaiyan', designation: 'LO', empNo: '', authorizations: ['isolationAuthority'], validUntil: '2027-11-30' },
  { name: 'M.Afnan Shafi', designation: 'LO', empNo: '', authorizations: ['isolationAuthority'], validUntil: '2027-12-07' },
  { name: 'Abdulwahab Alshehab', designation: 'LO', empNo: '', authorizations: ['isolationAuthority'], validUntil: '' },
  { name: 'Izhar Ali', designation: 'LO', empNo: '', authorizations: ['isolationAuthority'], validUntil: '2027-12-06' },
  { name: 'Purushothoman Devaraj', designation: 'LO', empNo: '', authorizations: ['isolationAuthority'], validUntil: '2027-11-30' },
  { name: 'Mohammed Alghamdi', designation: 'LO', empNo: '', authorizations: ['isolationAuthority'], validUntil: '2027-11-30' },
  { name: 'Ahmed Alsaqoor', designation: 'LO', empNo: '', authorizations: ['isolationAuthority'], validUntil: '2027-11-30' },
  { name: 'Mark Anthony', designation: 'LO', empNo: '', authorizations: ['isolationAuthority'], validUntil: '' },
  { name: 'Saad Alenezi', designation: 'LO', empNo: '', authorizations: ['isolationAuthority'], validUntil: '' },
  { name: 'Mohammed Aldawsari', designation: 'LO', empNo: '', authorizations: ['isolationAuthority'], validUntil: '' },
  { name: 'Rajeesh Muniasamy', designation: 'LO', empNo: '', authorizations: ['isolationAuthority'], validUntil: '' },
  { name: 'Mohammed Fahad Al Mulhim', designation: 'LO', empNo: '', authorizations: ['isolationAuthority'], validUntil: '' },
  { name: 'Abdulaziz Dhaifallah Alharbi', designation: 'LO', empNo: '', authorizations: ['isolationAuthority'], validUntil: '' },
  // MMD
  { name: 'Khaled Alsaidan', designation: 'MMD Sup.', empNo: '', authorizations: ['skilledPerson','permitReceiverStandard','permitReceiverAccess'], validUntil: '2027-12-06' },
  { name: 'Abdullah Muhanna', designation: 'MMD Sup.', empNo: '', authorizations: ['skilledPerson','permitReceiverStandard','permitReceiverAccess'], validUntil: '2027-12-01' },
  { name: 'Mohammad Alrobia', designation: 'MMD Sup.', empNo: '', authorizations: ['safetyControllerC','permitIssuer','isolationAuthority','skilledPerson','permitReceiverStandard'], validUntil: '2027-12-09' },
  { name: 'Mohammed AlRamdan', designation: 'MMD Sup.', empNo: '', authorizations: ['skilledPerson','permitReceiverStandard','permitReceiverAccess'], validUntil: '' },
  { name: 'Yasser Sendi', designation: 'MMD Tech', empNo: '', authorizations: ['skilledPerson','permitReceiverStandard','permitReceiverAccess'], validUntil: '' },
  { name: 'Mohammad Alam', designation: 'MMD Tech', empNo: '', authorizations: ['skilledPerson','permitReceiverStandard','permitReceiverAccess'], validUntil: '2027-12-10' },
  { name: 'Pankaj Kumar', designation: 'MMD Tech', empNo: '', authorizations: ['safetyControllerC','permitIssuer','isolationAuthority','skilledPerson','permitReceiverStandard'], validUntil: '2027-12-02' },
  { name: 'M.Alhammadi', designation: 'MMD Tech', empNo: '', authorizations: ['skilledPerson','permitReceiverStandard'], validUntil: '2026-05-04' },
  { name: 'Satya Narayana Vadde', designation: 'MMD Tech', empNo: '', authorizations: ['skilledPerson','permitReceiverStandard'], validUntil: '' },
  { name: 'S. Vigneshwaran', designation: 'MMD Tech', empNo: '', authorizations: ['skilledPerson','permitReceiverStandard'], validUntil: '2026-05-03' },
  { name: 'Raj Kumar Tiwari', designation: 'MMD Tech', empNo: '', authorizations: ['safetyControllerC','permitIssuer','isolationAuthority','skilledPerson','permitReceiverStandard'], validUntil: '' },
  { name: 'Shaik Mujtaba Ahmed', designation: 'MMD Tech', empNo: '', authorizations: ['skilledPerson','permitReceiverStandard','permitReceiverAccess'], validUntil: '2027-12-04' },
  // EMD
  { name: 'Mohammad Salih Ibrahim', designation: 'EMD Sup.', empNo: '', authorizations: ['safetyControllerC','permitIssuer','isolationAuthority','voltageLow','voltageHigh'], validUntil: '2027-12-05' },
  { name: 'Mohammed Faqihi', designation: 'EMD Sup.', empNo: '', authorizations: ['safetyControllerC','permitIssuer','isolationAuthority','voltageLow','voltageHigh'], validUntil: '' },
  { name: 'Imran Ali', designation: 'EMD Sup.', empNo: '', authorizations: ['safetyControllerC','permitIssuer','isolationAuthority','voltageLow','voltageHigh'], validUntil: '2027-12-08' },
  { name: 'Dhanfordjim Ebreo', designation: 'EMD Tech', empNo: '', authorizations: ['safetyControllerC','permitIssuer','isolationAuthority','voltageLow','voltageHigh','permitReceiverStandard','permitReceiverAccess'], validUntil: '2027-12-08' },
  { name: 'Nasser Almutairi', designation: 'EMD Tech', empNo: '', authorizations: ['safetyControllerC','permitIssuer','isolationAuthority','voltageLow','voltageHigh','permitReceiverStandard','permitReceiverAccess'], validUntil: '2027-12-08' },
  { name: 'Suresh Raj', designation: 'EMD Tech', empNo: '', authorizations: ['safetyControllerC','permitIssuer','isolationAuthority','voltageLow','voltageHigh','permitReceiverStandard','permitReceiverAccess'], validUntil: '2027-12-08' },
  // IMD
  { name: 'Imran Javed', designation: 'IMD Sup.', empNo: '', authorizations: ['safetyControllerC','isolationAuthority','skilledPerson'], validUntil: '' },
  { name: 'Murugananthan Sakthivel', designation: 'IMD Tech', empNo: '', authorizations: ['safetyControllerC','isolationAuthority','skilledPerson'], validUntil: '2027-12-01' },
  { name: 'Mohammad Khan Saddam', designation: 'IMD Tech', empNo: '', authorizations: ['safetyControllerC','isolationAuthority','skilledPerson','permitReceiverStandard'], validUntil: '2027-12-04' },
  { name: 'Syed Nadeem Ulhaq', designation: 'IMD Tech', empNo: '', authorizations: ['safetyControllerC','isolationAuthority'], validUntil: '' },
  { name: 'Muhammed Munir', designation: 'IMD Tech', empNo: '', authorizations: ['safetyControllerC','permitIssuer','isolationAuthority','voltageLow','voltageHigh','standbyPerson'], validUntil: '2027-12-09' },
  { name: 'Malik Ashraf', designation: 'IMD Tech', empNo: '', authorizations: ['safetyControllerC','permitIssuer','isolationAuthority','voltageLow','voltageHigh','standbyPerson'], validUntil: '2027-12-01' },
  { name: 'Abdulaziz Alfardan', designation: 'IMD Tech', empNo: '', authorizations: ['safetyControllerC','permitIssuer','isolationAuthority','voltageLow','voltageHigh','standbyPerson'], validUntil: '2026-05-07' },
  { name: 'Khalid Alahmadi', designation: 'IMD Tech', empNo: '', authorizations: ['safetyControllerC','permitIssuer','isolationAuthority','voltageLow','voltageHigh','standbyPerson'], validUntil: '' },
  // AYTB
  { name: 'Rampal', designation: 'AYTB', empNo: '', authorizations: ['permitReceiverStandard','permitReceiverAccess'], validUntil: '' },
  { name: 'Md. Manjar Hussain', designation: 'AYTB', empNo: '', authorizations: ['permitReceiverStandard','permitReceiverAccess'], validUntil: '' },
  { name: 'Omprakash', designation: 'AYTB', empNo: '', authorizations: ['permitReceiverStandard','permitReceiverAccess'], validUntil: '' },
  { name: 'Md. Tabre', designation: 'AYTB', empNo: '', authorizations: ['permitReceiverStandard','permitReceiverAccess'], validUntil: '' },
  { name: 'Indra', designation: 'AYTB', empNo: '', authorizations: ['permitReceiverStandard','permitReceiverAccess'], validUntil: '' },
  // STOM
  { name: 'M.Shoib', designation: 'STOM', empNo: '', authorizations: ['safetyControllerC','isolationAuthority','permitReceiverStandard','permitReceiverAccess'], validUntil: '2027-12-09' },
  { name: 'Abdul Aleem', designation: 'STOM', empNo: '', authorizations: ['safetyControllerC','permitIssuer','isolationAuthority','skilledPerson','permitReceiverStandard'], validUntil: '2026-05-25' },
  { name: 'Jaypee Ebreo', designation: 'STOM', empNo: '', authorizations: ['safetyControllerC','isolationAuthority','permitReceiverStandard'], validUntil: '2027-12-04' },
];

async function seed() {
  await mongoose.connect(process.env.COSMOS_CONNECTION_STRING);
  const config = await AdminConfig.findOne() || new AdminConfig();
  config.ptwPersonnel = PTW_PERSONNEL;
  await config.save();
  console.log(`✅ Seeded ${PTW_PERSONNEL.length} PTW personnel.`);
  mongoose.disconnect();
}

seed().catch(console.error);