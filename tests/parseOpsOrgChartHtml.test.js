const fs = require('fs');
const path = require('path');
const {
  parseOpsOrgChartHtml,
  parseOpsOrgChartFile,
  extractViewer,
  extractTreeMembers,
  DEFAULT_HTML,
} = require('../utils/parseOpsOrgChartHtml');

const FIXTURE = `<!DOCTYPE html><html><body>
<script>{"fullName":"Bander Khalid AlDogaish","userName":"b.aldogaish@nomac.com","displayTitle":"Operation Manager","userId":"3167","personId":2062,"timeZone":"Asia/Riyadh"}</script>
<div id="idTAC---main--idTree">
<div id="idTAC---main--idListItem-idTAC---main--idTree-0" aria-level="1">Abdul Hameed AbdulRasheed</div>
<div id="idTAC---main--idListItem-idTAC---main--idTree-1" aria-level="1">Sami Hamdan Al Harbi</div>
</div>
</body></html>`;

describe('parseOpsOrgChartHtml', () => {
  test('extractViewer reads embedded profile JSON', () => {
    const viewer = extractViewer(FIXTURE);
    expect(viewer.name).toBe('Bander Khalid AlDogaish');
    expect(viewer.email).toBe('b.aldogaish@nomac.com');
    expect(viewer.title).toBe('Operation Manager');
    expect(viewer.userId).toBe('3167');
  });

  test('extractTreeMembers reads flat team list', () => {
    const members = extractTreeMembers(FIXTURE);
    expect(members).toHaveLength(2);
    expect(members[0].name).toBe('Abdul Hameed AbdulRasheed');
    expect(members[0].reportsTo).toBeNull();
    expect(members[1].name).toBe('Sami Hamdan Al Harbi');
  });

  test('parseOpsOrgChartHtml enriches with roster and email data', () => {
    const result = parseOpsOrgChartHtml(FIXTURE, {
      roster: [
        { name: 'Sami Hamdan', fullName: 'Sami Hamdan Dasan Alharbi', empId: '2364', crew: 'A', role: 'CCR Operator' },
      ],
      personnelEmails: [
        { name: 'Abdul Hameed AbdulRasheed', email: 'a_hameed@nomac.com', empId: '1119' },
      ],
      ptwPersonnel: [],
    });

    expect(result.manager.name).toBe('Bander Khalid AlDogaish');
    expect(result.members).toHaveLength(2);
    expect(result.members[0].email).toBe('a_hameed@nomac.com');
    expect(result.members[1].crew).toBe('A');
    expect(result.members[0].reportsTo).toBe('Bander Khalid AlDogaish');
    expect(result.summary.flatHierarchy).toBe(true);
  });

  test('parseOpsOrgChartFile reads real export when present', () => {
    if (!fs.existsSync(DEFAULT_HTML)) {
      return;
    }
    const result = parseOpsOrgChartFile(DEFAULT_HTML);
    expect(result.summary.totalMembers).toBeGreaterThan(40);
    expect(result.manager.title).toMatch(/Manager/i);
    expect(result.members.some((m) => m.emailMatched)).toBe(true);
  });
});
