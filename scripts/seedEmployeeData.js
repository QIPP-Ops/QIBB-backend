/**
 * One-time employee data seed — updates name, email, and leave balances.
 * Manual run only: npm run seed:employees
 *
 *   node scripts/seedEmployeeData.js
 */
require('dotenv').config();
const mongoose = require('mongoose');
const AdminUser = require('../models/AdminUser');

const EMPLOYEE_SEED = [
  { name: 'Abdulwahab Mohammed Al Shehab', email: 'a.alshehab@nomac.com', annualLeaveBalance: 7.83, bankLeaveBalance: 4 },
  { name: 'Abdul Hameed AbdulRasheed', email: 'a_hameed@nomac.com', annualLeaveBalance: 3.83, bankLeaveBalance: 0 },
  { name: 'Sami Hamdan Al Harbi', email: 'sami.alharbi@nomac.com', annualLeaveBalance: 10.41, bankLeaveBalance: 44 },
  { name: 'Mohammed Abdullah Aldawsari', email: 'm.aldawsari@nomac.com', annualLeaveBalance: 8.16, bankLeaveBalance: 5 },
  { name: 'Abdullah Faleh Al Hajri', email: 'abdullah.faleh@nomac.com', annualLeaveBalance: 10.41, bankLeaveBalance: 0.5 },
  { name: 'Bakr Abdulmajeed Al Khabeerani', email: 'bakr.kamal@nomac.com', annualLeaveBalance: 8.03, bankLeaveBalance: 2 },
  { name: 'Abdulrahman Shabib AlBaqami', email: 'abdulrahman.shabib@nomac.com', annualLeaveBalance: -8.83, bankLeaveBalance: 2 },
  { name: 'Faris Shaya AlDawsari', email: 'faris.shaya@nomac.com', annualLeaveBalance: -5.83, bankLeaveBalance: 0 },
  { name: 'Mohammad Abdullah AlGarni', email: 'm.algarni@nomac.com', annualLeaveBalance: 4.91, bankLeaveBalance: 3 },
  { name: 'Saad Salem AlHajri', email: 'saad.salem@nomac.com', annualLeaveBalance: 9.16, bankLeaveBalance: 0 },
  { name: 'Abdulhadi Mohammed AlMohammedSaleh', email: 'abdulhadi.mohammed@nomac.com', annualLeaveBalance: 9.16, bankLeaveBalance: 0 },
  { name: 'Ali Mashabab AlQahtani', email: 'ali.mashabab@nomac.com', annualLeaveBalance: 8.16, bankLeaveBalance: 4 },
  { name: 'Saad Mohammed AlShahrani', email: 'saad.mohammed@nomac.com', annualLeaveBalance: 9.16, bankLeaveBalance: 4 },
  { name: 'Abdullah Abdulrahman Alamri', email: 'abdullah.alamri@nomac.com', annualLeaveBalance: 7.58, bankLeaveBalance: 4 },
  { name: 'Saleh Mohammed Saleh Alamri', email: 'saleh.alamri@nomac.com', annualLeaveBalance: 10, bankLeaveBalance: 5 },
  { name: 'Saad Fadel Saad Alenezi', email: 'saad.alenizi@nomac.com', annualLeaveBalance: -1.41, bankLeaveBalance: 2 },
  { name: 'Mohammed Abdullah Alghamdi', email: 'mohammed.gh@nomac.com', annualLeaveBalance: -2.83, bankLeaveBalance: 1 },
  { name: 'Rashed Ghalib Alhajri', email: 'r.hajri@nomac.com', annualLeaveBalance: 10.41, bankLeaveBalance: 5 },
  { name: 'Abdulaziz Dhaifallah Alharbi', email: 'abdulaziz.a@nomac.com', annualLeaveBalance: 9.33, bankLeaveBalance: 0 },
  { name: 'Syed Shahnawaz Ahmed', email: 'syed.shahnawaz@nomac.com', annualLeaveBalance: -1.16, bankLeaveBalance: 0.58 },
  { name: 'Muhammad Afnan Shafi', email: 'm.afnan@nomac.com', annualLeaveBalance: 9.16, bankLeaveBalance: 2 },
  { name: 'Mark Anthony Villaluz Ramirez', email: 'mark.ramirez@nomac.com', annualLeaveBalance: 9.24, bankLeaveBalance: 0.66 },
  { name: 'Lakshmi Appala Rama Durga Prasad Rowthu', email: 'lakshmi.rowthu@nomac.com', annualLeaveBalance: 9.16, bankLeaveBalance: 0 },
  { name: 'Devaraj Purushothaman', email: 'p.devaraj@nomac.com', annualLeaveBalance: 1.16, bankLeaveBalance: 0.66 },
  { name: 'Somanathan Nair Prathapan', email: 'prathapan@nomac.com', annualLeaveBalance: 10.83, bankLeaveBalance: 0 },
  { name: 'Veera Venkata Prasad Vaka', email: 'veera.venkata@nomac.com', annualLeaveBalance: 9.41, bankLeaveBalance: 2 },
  { name: 'Mustafa Salem Mustafa', email: 'mustafa.salem@nomac.com', annualLeaveBalance: 9.41, bankLeaveBalance: 28 },
  { name: 'Rajesh Muniasamy', email: 'r.muniasamy@nomac.com', annualLeaveBalance: 4.89, bankLeaveBalance: 0 },
  { name: 'Izhar Ali Muhammad', email: 'Izhar.ali@nomac.com', annualLeaveBalance: 1.16, bankLeaveBalance: 5 },
  { name: 'Ahmed Mostafa Mohamed Meshref', email: 'ahmed.mostafa@nomac.com', annualLeaveBalance: 10.83, bankLeaveBalance: 0 },
  { name: 'Saravanakumar Madhaiyan', email: 's.madhaiyan@nomac.com', annualLeaveBalance: -6.75, bankLeaveBalance: 5 },
  { name: 'Shaheer Yousaf Latif Ur Rehman', email: 'shaheer.yousaf@nomac.com', annualLeaveBalance: 8.91, bankLeaveBalance: 0 },
  { name: 'Kanaka Naga Srinivasu Kolli', email: 'kanaka.naga@nomac.com', annualLeaveBalance: 9.24, bankLeaveBalance: 0 },
  { name: 'Khaled Saleh Khulusi', email: 'k.khulusi@nomac.com', annualLeaveBalance: 1.16, bankLeaveBalance: 3.63 },
  { name: 'Juma Khan', email: 'juma.khan@nomac.com', annualLeaveBalance: 2.83, bankLeaveBalance: 0 },
  { name: 'Bader Ibrahim Alsubeet', email: 'b.alsubit@nomac.com', annualLeaveBalance: 10, bankLeaveBalance: 4 },
  { name: 'Ahmed Fathy Ibrahim AbduelKader', email: 'ahmed.abdelkhad@nomac.com', annualLeaveBalance: 9.24, bankLeaveBalance: 5 },
  { name: 'Moustafa Elansary Hewaidy', email: 'moustafa.elansary@nomac.com', annualLeaveBalance: 10.83, bankLeaveBalance: 10 },
  { name: 'Fahad Faisal Halawani', email: 'fahad.halawani@nomac.com', annualLeaveBalance: 5.68, bankLeaveBalance: 5 },
  { name: 'Mohammed Hassan Hakami', email: 'mohammed.hassan@nomac.com', annualLeaveBalance: 9.16, bankLeaveBalance: 0 },
  { name: 'Walid Elshahhat Hussein Fayad', email: 'walid.fayad@nomac.com', annualLeaveBalance: 3.16, bankLeaveBalance: 0.76 },
  { name: 'Mohammed Fahad Al Mulhim', email: 'mohammed.almulhim@nomac.com', annualLeaveBalance: 7.58, bankLeaveBalance: 0 },
  { name: 'Norbie Vianzon Cruz', email: 'norbie.cruz@nomac.com', annualLeaveBalance: 10.58, bankLeaveBalance: 6 },
  { name: 'Albara Tareq M Barri', email: 'a.barri@nomac.com', annualLeaveBalance: 3.66, bankLeaveBalance: 0 },
  { name: 'Hassan Arshad', email: 'arshad.hassan@nomac.com', annualLeaveBalance: 10.41, bankLeaveBalance: 4 },
  { name: 'Yasir Essa Althuwayqib', email: 'y.althuwayqib@nomac.com', annualLeaveBalance: 9.16, bankLeaveBalance: 1 },
  { name: 'Mashal Mohammed Alsumaihan', email: 'mashal.alsumaihan@nomac.com', annualLeaveBalance: 6.16, bankLeaveBalance: 0.17 },
  { name: 'Ahmed Salem Alsaqoor', email: 'ahmed.alsaqoor@nomac.com', annualLeaveBalance: 2.16, bankLeaveBalance: 1 },
  { name: 'Alaa Alrefaei', email: 'a.alrefaei@nomac.com', annualLeaveBalance: 6.87, bankLeaveBalance: 0 },
  { name: 'Fawaz Mari Saeed Alqahtani', email: 'fawaz.alqahtani@nomac.com', annualLeaveBalance: 3, bankLeaveBalance: 3 },
  { name: 'Faisal Abdullah D Alotaibi', email: 'faisal.alotaibi@nomac.com', annualLeaveBalance: 3.42, bankLeaveBalance: 0 },
  { name: 'Zaid Hadi Almarri', email: 'z.almarri@nomac.com', annualLeaveBalance: 7.2, bankLeaveBalance: 0 },
  { name: 'Adam Mohammed Alhuzum', email: 'adam.alhuzum@nomac.com', annualLeaveBalance: 9.41, bankLeaveBalance: 4 },
  { name: 'Saud Saad Abdulkarim', email: 'saud.abdulkarim@nomac.com', annualLeaveBalance: 3.58, bankLeaveBalance: 40 },
  { name: 'Mukhtar Ali', email: 'mukhtar.ali@nomac.com', annualLeaveBalance: 10.83, bankLeaveBalance: 5 },
  { name: 'Mohamed Nawas Mohamed Mydeen', email: 'Mohamed.nawas@nomac.com', annualLeaveBalance: 10.83, bankLeaveBalance: 4 },
  { name: 'Tariq Mohammed Alqahtani', email: 'tariq.alqahtani@nomac.com', annualLeaveBalance: 7.58, bankLeaveBalance: 2 },
  { name: 'Alvin Haban Perello', email: 'alvin.perello@nomac.com', annualLeaveBalance: 9.16, bankLeaveBalance: 4.67 },
  { name: 'Qasem Ahmed Al Saad', email: 'qasem.ahmed@nomac.com', annualLeaveBalance: 0, bankLeaveBalance: 0 },
  { name: 'Mohammed Ahmed Saleh Al Gamdi', email: 'm.a.alghamdi@nomac.com', annualLeaveBalance: 10, bankLeaveBalance: 2 },
];

function normalizeName(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function nameTokens(value) {
  return normalizeName(value).split(' ').filter(Boolean);
}

function namesMatch(a, b) {
  const na = normalizeName(a);
  const nb = normalizeName(b);
  if (!na || !nb) return false;
  if (na === nb) return true;
  if (na.includes(nb) || nb.includes(na)) return true;

  const ta = nameTokens(a);
  const tb = nameTokens(b);
  if (!ta.length || !tb.length) return false;

  const shared = ta.filter((t) => tb.includes(t));
  const minLen = Math.min(ta.length, tb.length);
  return shared.length >= Math.max(2, minLen - 1);
}

function findMatch(seedRow, users) {
  const email = String(seedRow.email || '').trim().toLowerCase();
  if (email) {
    const byEmail = users.find((u) => String(u.email || '').trim().toLowerCase() === email);
    if (byEmail) return byEmail;
  }

  if (seedRow.empId) {
    const byEmpId = users.find((u) => String(u.empId || '').trim() === String(seedRow.empId).trim());
    if (byEmpId) return byEmpId;
  }

  const exactName = users.find((u) => normalizeName(u.name) === normalizeName(seedRow.name));
  if (exactName) return exactName;

  const fuzzy = users.filter((u) => namesMatch(u.name, seedRow.name));
  if (fuzzy.length === 1) return fuzzy[0];

  return null;
}

async function main() {
  const uri = process.env.COSMOS_URI || process.env.MONGODB_URI;
  if (!uri) {
    console.error('Set COSMOS_URI or MONGODB_URI');
    process.exit(1);
  }

  await mongoose.connect(uri, { retryWrites: false });
  const users = await AdminUser.find({}).select('empId name email annualLeaveBalance bankLeaveBalance');

  let updated = 0;
  let notMatched = 0;

  for (const row of EMPLOYEE_SEED) {
    const match = findMatch(row, users);
    if (!match) {
      console.log(`⚠ No match found: ${row.name}`);
      notMatched += 1;
      continue;
    }

    match.name = row.name;
    match.email = row.email;
    match.annualLeaveBalance = row.annualLeaveBalance;
    match.bankLeaveBalance = row.bankLeaveBalance;
    await match.save();

    console.log(`✓ Updated: ${row.name} (${match.empId})`);
    updated += 1;
  }

  console.log('\n--- Summary ---');
  console.log(`Total in seed list: ${EMPLOYEE_SEED.length}`);
  console.log(`Updated: ${updated}`);
  console.log(`Not matched: ${notMatched}`);

  await mongoose.disconnect();
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
