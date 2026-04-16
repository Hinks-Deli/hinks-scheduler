import React from 'react';
import { fmt, EMP_COLORS } from '../config';
import { RoleBadges } from './ui';

export default React.memo(function ScheduleTable({ activeDays, activeEmps, employees, result, weeklyTarget }) {
  if (!activeDays.length) return null;

  const gIdx = (ai) => {
    let c = -1;
    for (let j = 0; j < employees.length; j++) {
      if (employees[j].active) c++;
      if (c === ai) return j;
    }
    return 0;
  };

  return (
    <div className="schedule-table-wrap">
      <table className="schedule-table">
        <thead>
          <tr>
            <th>Employee</th>
            <th>Roles</th>
            {activeDays.map(d => <th key={d.name}>{d.name.slice(0, 3)}</th>)}
            <th>Total</th>
          </tr>
        </thead>
        <tbody>
          {activeEmps.map((emp, ei) => {
            const gi = gIdx(ei);
            const c = EMP_COLORS[gi % EMP_COLORS.length];
            const hrs = result.empHours[ei] || 0;

            return (
              <tr key={ei}>
                <td style={{ fontWeight: 700, color: c.text }}>
                  <span className="dot" style={{ background: c.accent }} />
                  {emp.name}
                </td>
                <td><RoleBadges roles={emp.roles} /></td>
                {activeDays.map(day => {
                  const sh = (result.assignments[day.name] || []).filter(s => s.empIdx === ei);
                  if (!sh.length) {
                    return <td key={day.name} className="off">OFF</td>;
                  }
                  return (
                    <td key={day.name} className={sh.length > 1 ? 'split' : ''}>
                      {sh.map((s, i) => (
                        <span key={i}>{i > 0 ? ' + ' : ''}{fmt(s.start)}–{fmt(s.end)}</span>
                      ))}
                    </td>
                  );
                })}
                {(() => {
                  const target = emp.targetHoursEnabled && emp.targetHours != null ? emp.targetHours : weeklyTarget;
                  return (
                    <td className={`total ${hrs === target ? 'ok' : hrs < target ? 'under' : 'over'}`}>
                      {hrs}h
                    </td>
                  );
                })()}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
})
