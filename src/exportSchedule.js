import { fmt, EMP_COLORS, ROLE_COLORS } from './config';

// Map active-employee index → global employees array index
function gIdx(ai, employees) {
  let c = -1;
  for (let j = 0; j < employees.length; j++) {
    if (employees[j].active) c++;
    if (c === ai) return j;
  }
  return 0;
}

// Blend a hex colour toward white by `factor` (0 = original, 1 = white)
function tint(hex, factor = 0.75) {
  const h = hex.replace('#', '');
  const r = Math.round(parseInt(h.slice(0, 2), 16) * (1 - factor) + 255 * factor);
  const g = Math.round(parseInt(h.slice(2, 4), 16) * (1 - factor) + 255 * factor);
  const b = Math.round(parseInt(h.slice(4, 6), 16) * (1 - factor) + 255 * factor);
  return [r, g, b].map(v => v.toString(16).padStart(2, '0')).join('');
}

// Convert hex to ExcelJS ARGB (FF prefix for full opacity)
function argb(hex) {
  return 'FF' + hex.replace('#', '');
}

const THIN_BORDER = { style: 'thin', color: { argb: 'FFD0D0D0' } };
const BORDER_ALL = { top: THIN_BORDER, bottom: THIN_BORDER, left: THIN_BORDER, right: THIN_BORDER };

export async function exportSchedule({ activeDays, activeEmps, employees, result, weeklyTarget }) {
  const ExcelJS = await import('exceljs');
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Schedule');

  const dayCols = activeDays.map(d => d.name.slice(0, 3));
  const totalCols = 2 + dayCols.length + 1; // Employee + Roles + days + Total

  // Column widths
  ws.getColumn(1).width = 18;
  ws.getColumn(2).width = 14;
  for (let i = 0; i < dayCols.length; i++) ws.getColumn(3 + i).width = 18;
  ws.getColumn(totalCols).width = 12;

  // Row 1: Title
  const titleRow = ws.getRow(1);
  ws.mergeCells(1, 1, 1, totalCols);
  const titleCell = titleRow.getCell(1);
  titleCell.value = 'Restaurant Staff Schedule';
  titleCell.font = { bold: true, size: 14, color: { argb: 'FF2D3A34' } };
  titleCell.alignment = { horizontal: 'left', vertical: 'middle' };
  titleRow.height = 24;

  // Row 2: Date
  const dateRow = ws.getRow(2);
  ws.mergeCells(2, 1, 2, totalCols);
  const dateCell = dateRow.getCell(1);
  dateCell.value = `Generated: ${new Date().toLocaleDateString('en-GB', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}`;
  dateCell.font = { size: 9, color: { argb: 'FF888888' } };

  // Row 3: blank

  // Row 4: Header
  const headerLabels = ['Employee', 'Roles', ...dayCols, 'Total'];
  const headerRow = ws.getRow(4);
  headerRow.height = 20;
  headerLabels.forEach((label, i) => {
    const cell = headerRow.getCell(i + 1);
    cell.value = label;
    cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF2D3A34' } };
    cell.alignment = { horizontal: 'center', vertical: 'middle' };
    cell.border = BORDER_ALL;
  });
  // Left-align Employee header
  headerRow.getCell(1).alignment = { horizontal: 'left', vertical: 'middle' };

  // Data rows
  activeEmps.forEach((emp, ei) => {
    const gi = gIdx(ei, employees);
    const c = EMP_COLORS[gi % EMP_COLORS.length];
    const row = ws.getRow(5 + ei);

    // Employee name
    const nameCell = row.getCell(1);
    nameCell.value = emp.name;
    nameCell.font = { bold: true, color: { argb: argb(c.accent) } };
    nameCell.alignment = { horizontal: 'left', vertical: 'middle' };
    nameCell.border = BORDER_ALL;

    // Roles
    const rolesCell = row.getCell(2);
    rolesCell.value = emp.roles.join(', ');
    const firstRoleColor = ROLE_COLORS[emp.roles[0]] || ROLE_COLORS.Any;
    rolesCell.font = { color: { argb: argb(firstRoleColor.a) } };
    rolesCell.alignment = { horizontal: 'center', vertical: 'middle' };
    rolesCell.border = BORDER_ALL;

    // Day cells
    activeDays.forEach((day, di) => {
      const cell = row.getCell(3 + di);
      const shifts = (result.assignments[day.name] || []).filter(s => s.empIdx === ei);

      if (!shifts.length) {
        cell.value = 'OFF';
        cell.font = { italic: true, color: { argb: 'FF999999' } };
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF0F0F0' } };
      } else {
        cell.value = shifts.map(s => `${fmt(s.start)}\u2013${fmt(s.end)}`).join(' + ');
        cell.font = { color: { argb: 'FF2D3A34' } };
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF' + tint(c.accent, 0.75) } };
      }
      cell.alignment = { horizontal: 'center', vertical: 'middle' };
      cell.border = BORDER_ALL;
    });

    // Total hours
    const hrs = result.empHours[ei] || 0;
    const totalCell = row.getCell(totalCols);
    totalCell.value = `${hrs}h`;
    totalCell.font = {
      bold: true,
      color: {
        argb: hrs === weeklyTarget ? 'FF2E7D32' : hrs < weeklyTarget ? 'FFE65100' : 'FFC62828',
      },
    };
    totalCell.alignment = { horizontal: 'center', vertical: 'middle' };
    totalCell.border = BORDER_ALL;
  });

  // Warnings section
  if (result.warnings.length > 0) {
    const warnStart = 5 + activeEmps.length + 1;
    const warnHeader = ws.getRow(warnStart);
    const warnCell = warnHeader.getCell(1);
    warnCell.value = 'Warnings';
    warnCell.font = { bold: true, size: 11, color: { argb: 'FFE65100' } };

    result.warnings.forEach((w, i) => {
      const r = ws.getRow(warnStart + 1 + i);
      ws.mergeCells(warnStart + 1 + i, 1, warnStart + 1 + i, totalCols);
      const c = r.getCell(1);
      c.value = w;
      c.font = { size: 10, color: { argb: 'FF888888' } };
    });
  }

  // Freeze panes: row 4 header + column A
  ws.views = [{ state: 'frozen', xSplit: 1, ySplit: 4 }];

  // Generate and download
  const buf = await wb.xlsx.writeBuffer();
  const blob = new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'schedule.xlsx';
  a.click();
  URL.revokeObjectURL(url);
}
