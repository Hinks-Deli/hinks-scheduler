import React from 'react';
import { EMP_COLORS } from '../config';
import { RoleBadges } from './ui';

export default React.memo(function StatsBar({ activeEmps, employees, result, weeklyTarget }) {
  const gIdx = (ai) => {
    let c = -1;
    for (let j = 0; j < employees.length; j++) {
      if (employees[j].active) c++;
      if (c === ai) return j;
    }
    return 0;
  };

  return (
    <div className="stats-bar">
      {activeEmps.map((emp, ei) => {
        const gi = gIdx(ei);
        const c = EMP_COLORS[gi % EMP_COLORS.length];
        const hrs = result.empHours[ei] || 0;
        const dys = result.empDays?.[ei] || 0;
        const target = emp.targetHoursEnabled && emp.targetHours != null ? emp.targetHours : weeklyTarget;
        const diff = Math.abs(hrs - target);

        return (
          <div key={ei} className="stat-card" style={{ background: c.bg, borderColor: c.accent + '33' }}>
            <div className="stat-header">
              <span style={{ color: c.text, fontWeight: 700, fontSize: 11 }}>{emp.name}</span>
              <RoleBadges roles={emp.roles} small />
            </div>
            <div className="stat-hours" style={{ color: c.accent }}>
              {hrs}h{emp.targetHoursEnabled && <span style={{ fontSize: '0.7em', opacity: 0.7 }}> / {target}h</span>}
            </div>
            <div className="stat-meta" style={{ color: c.text + '88' }}>
              {dys}d · {hrs === target ? '✓' : `${diff}h ${hrs < target ? 'short' : 'over'}`}
            </div>
          </div>
        );
      })}
    </div>
  );
})
