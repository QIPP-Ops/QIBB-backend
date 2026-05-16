$ cat << 'EOF' > rosterController.js
const AdminUser = require('../models/AdminUser');
const AdminConfig = require('../models/AdminConfig');

exports.getRoster = async (req, res) => {
  try {
    res.json(await AdminUser.find().select('-passwordHash').sort({ crew: 1, role: 1 }));
  } catch (error) { res.status(500).json({ message: error.message }); }
};

exports.addLeave = async (req, res) => {
  const { employeeId, empId, leave, start, end, type, workingDays, totalDays } = req.body;
  const targetId = employeeId || empId;
  if (!targetId) return res.status(400).json({ message: 'employeeId (or empId) is required.' });
  try {
    const user = await AdminUser.findOne({ empId: targetId });
    if (!user) return res.status(404).json({ message: 'Personnel not found' });
    const leaveData = leave || { start, end, type, workingDays, totalDays };
    if (!leaveData.start || !leaveData.end) {
      return res.status(400).json({ message: 'Leave start and end dates are required.' });
    }
    user.leaves.push(leaveData);
    await user.save();
    res.status(201).json(user);
  } catch (error) { res.status(400).json({ message: error.message }); }
};

exports.createEmployee = async (req, res) => {
  try {
    const config = await AdminConfig.findOne();
    let kpis = [];
    if (config && req.body.role) {
      const template = (config.kpiTemplates || []).find(t => t.role === req.body.role);
      if (template) kpis = template.goals.map(g => ({ title: g, progress: 0, locked: false, visible: true }));
    }
    const payload = { ...req.body, kpis };
    if (!payload.email) {
      payload.email = `${(payload.name || 'user').toLowerCase().replace(/\s+/g, '.')}.${payload.empId}@acwapower.com`;
    }
    if (!payload.passwordHash) {
      const bcrypt = require('bcryptjs');
      payload.passwordHash = await bcrypt.hash('acwa_ops_2026', 10);
    }
    const user = new AdminUser(payload);
    await user.save();
    res.status(201).json(user);
  } catch (error) { res.status(400).json({ message: error.message }); }
};

exports.updateEmployee = async (req, res) => {
  try {
    // Strip sensitive fields from update payload
    const { passwordHash, email: _email, ...safeBody } = req.body;
    const user = await AdminUser.findOneAndUpdate(
      { empId: req.params.empId },
      { $set: safeBody },
      { new: true, runValidators: false }
    ).select('-passwordHash');
    if (!user) return res.status(404).json({ message: 'Personnel not found' });
    res.json(user);
  } catch (error) { res.status(400).json({ message: error.message }); }
};

exports.deleteEmployee = async (req, res) => {
  try {
    const user = await AdminUser.findOneAndDelete({ empId: req.params.empId });
    if (!user) return res.status(404).json({ message: 'Personnel not found' });
    res.json({ message: 'Deleted' });
  } catch (error) { res.status(500).json({ message: error.message }); }
};

exports.removeLeave = async (req, res) => {
  const { employeeId, leaveId } = req.params;
  try {
    const user = await AdminUser.findOne({ empId: employeeId });
    if (!user) return res.status(404).json({ message: 'Personnel not found' });
    user.leaves = user.leaves.filter(l => l._id.toString() !== leaveId);
    await user.save();
    res.json(user);
  } catch (error) { res.status(400).json({ message: error.message }); }
};

exports.updateKpi = async (req, res) => {
  try {
    const { empId, kpiId } = req.params;
    const user = await AdminUser.findOne({ empId });
    if (!user) return res.status(404).json({ message: 'Personnel not found' });
    const config = await AdminConfig.findOne();
    const isAdmin = req.user?.role === 'admin';
    const globalAllowed = config?.globalKpiEditingAllowed !== false;
    if (!isAdmin && (!globalAllowed || !user.kpiEditingAllowed))
      return res.status(403).json({ message: 'KPI editing is locked.' });
    const kpi = user.kpis.id(kpiId);
    if (!kpi) return res.status(404).json({ message: 'KPI not found' });
    if (!isAdmin && kpi.locked)
      return res.status(403).json({ message: 'This KPI is locked by admin.' });
    const { progress, title, description, locked, visible, targetDate } = req.body;
    if (progress !== undefined) kpi.progress = progress;
    if (isAdmin) {
      if (title       !== undefined) kpi.title       = title;
      if (description !== undefined) kpi.description = description;
      if (locked      !== undefined) kpi.locked      = locked;
      if (visible     !== undefined) kpi.visible     = visible;
      if (targetDate  !== undefined) kpi.targetDate  = targetDate;
    }
    await user.save();
    res.json(user);
  } catch (error) { res.status(400).json({ message: error.message }); }
};

exports.addKpi = async (req, res) => {
  try {
    const user = await AdminUser.findOne({ empId: req.params.empId });
    if (!user) return res.status(404).json({ message: 'Personnel not found' });
    user.kpis.push(req.body);
    await user.save();
    res.json(user);
  } catch (error) { res.status(400).json({ message: error.message }); }
};

exports.deleteKpi = async (req, res) => {
  try {
    const user = await AdminUser.findOne({ empId: req.params.empId });
    if (!user) return res.status(404).json({ message: 'Personnel not found' });
    user.kpis = user.kpis.filter(k => k._id.toString() !== req.params.kpiId);
    await user.save();
    res.json(user);
  } catch (error) { res.status(400).json({ message: error.message }); }
};

exports.exportIcs = async (req, res) => {
  try {
    const user = await AdminUser.findOne({ empId: req.params.empId });
    if (!user) return res.status(404).json({ message: 'Personnel not found' });

    const SHIFT_CYCLES = {
      'A': ['O','O','O','O','D','D','N','N'],
      'B': ['D','D','N','N','O','O','O','O'],
      'C': ['N','N','O','O','O','O','D','D'],
      'D': ['O','O','D','D','N','N','O','O'],
      'General': ['O','O','O','O','O','O','O','O'],
      'S': ['O','O','O','O','O','O','O','O'],
    };

    const config = await AdminConfig.findOne();
    const baseDate = new Date(config?.shiftCycleBaseDate || '2026-01-01T00:00:00Z');
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const endDate = new Date(today); endDate.setDate(endDate.getDate() + 90);
    const pad = n => String(n).padStart(2, '0');

    const cycle = SHIFT_CYCLES[user.crew] || SHIFT_CYCLES['General'];
    const lines = [
      'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//QIPP Ops//EN',
      `X-WR-CALNAME:${user.name} Shift Schedule`, 'CALSCALE:GREGORIAN'
    ];

    let d = new Date(today);
    while (d <= endDate) {
      const diff = Math.floor((d - baseDate) / 86400000);
      const shift = cycle[((diff % 8) + 8) % 8];

      if (shift !== 'O') {
        const ds = `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}`;

        // Night shift ends next day at 05:30
        const nextDay = new Date(d);
        nextDay.setDate(nextDay.getDate() + 1);
        const dsNext = `${nextDay.getFullYear()}${pad(nextDay.getMonth() + 1)}${pad(nextDay.getDate())}`;

        lines.push(
          'BEGIN:VEVENT',
          `DTSTART;TZID=Asia/Riyadh:${ds}T${shift === 'D' ? '053000' : '173000'}`,
          `DTEND;TZID=Asia/Riyadh:${shift === 'D' ? ds + 'T173000' : dsNext + 'T053000'}`,
          `SUMMARY:${shift === 'D' ? '☀️ Day' : '🌙 Night'} Shift - Crew ${user.crew}`,
          `UID:shift-${user.empId}-${ds}@qipp`,
          'END:VEVENT'
        );
      }
      d.setDate(d.getDate() + 1);
    }

    user.leaves.forEach((lv, i) => {
      const s = new Date(lv.start), e = new Date(lv.end);
      e.setDate(e.getDate() + 1);
      const fmt = x => `${x.getFullYear()}${pad(x.getMonth() + 1)}${pad(x.getDate())}`;
      lines.push(
        'BEGIN:VEVENT',
        `DTSTART;VALUE=DATE:${fmt(s)}`,
        `DTEND;VALUE=DATE:${fmt(e)}`,
        `SUMMARY:🏖️ ${lv.type}`,
        `UID:leave-${user.empId}-${i}@qipp`,
        'END:VEVENT'
      );
    });

    lines.push('END:VCALENDAR');

    res.setHeader('Content-Type', 'text/calendar; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${user.name.replace(/\s+/g, '_')}.ics"`);
    res.send(lines.join('\r\n'));
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};
