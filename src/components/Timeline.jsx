import React from 'react';
import { fmt, EMP_COLORS, rc } from '../config';
import { RoleBadges } from './ui';

function empMatchesRule(emp, ruleRoles) {
  if (ruleRoles.includes('Any')) return true;
  return emp.roles.some(r => ruleRoles.includes(r));
}

export default React.memo(function Timeline({ activeDays, activeEmps, employees, result }) {
  if (!activeDays.length) return null;

  const globalOpen = Math.min(...activeDays.map(d => d.open));
  const globalClose = Math.max(...activeDays.map(d => d.close));
  const span = Math.max(globalClose - globalOpen, 1);

  const gIdx = (ai) => {
    let c = -1;
    for (let j = 0; j < employees.length; j++) {
      if (employees[j].active) c++;
      if (c === ai) return j;
    }
    return 0;
  };

  return (
    <div className="timeline">
      {/* Header */}
      <div className="tl-header">
        <div className="tl-label">DAY</div>
        <div className="tl-hours">
          {Array.from({ length: span + 1 }, (_, i) => i + globalOpen).map(hr => (
            <span key={hr} className="tl-hour">{fmt(hr)}</span>
          ))}
        </div>
      </div>

      {/* Day rows */}
      {activeDays.map((day, di) => {
        const shifts = result.assignments[day.name] || [];
        const cov = result.coverageByDay[day.name] || [];
        const doo = day.open - globalOpen;
        const dco = day.close - globalOpen;

        return (
          <div key={di} className="tl-row" style={{ borderBottom: di < activeDays.length - 1 ? '1px solid #151a17' : 'none' }}>
            <div className="tl-day-label">
              <div className="tl-day-name">{day.name.slice(0, 3)}</div>
              <div className="tl-day-time">{fmt(day.open)}–{fmt(day.close)}</div>
            </div>

            <div className="tl-body">
              {/* Grid lines */}
              {Array.from({ length: span + 1 }, (_, i) => (
                <div key={i} className="tl-gridline" style={{ left: `${(i / span) * 100}%` }} />
              ))}

              {/* Closed overlays */}
              {doo > 0 && <div className="tl-closed" style={{ left: 6, width: `${(doo / span) * 100}%` }} />}
              {dco < span && <div className="tl-closed" style={{ left: `calc(${(dco / span) * 100}% + 6px)`, right: 6, width: 'auto' }} />}

              {/* Coverage heatmap */}
              <div className="tl-coverage">
                {cov.map((c, ci) => {
                  const lp = ((c.hour - globalOpen) / span) * 100;
                  const wp = (1 / span) * 100;
                  const rulesHere = (day.rules || []).filter(r => c.hour >= r.from && c.hour < r.to);
                  const ok = rulesHere.every(r => {
                    const elig = c.empIndices.filter(ei => empMatchesRule(activeEmps[ei], r.roles)).length;
                    return elig >= r.count;
                  });
                  return (
                    <div
                      key={ci}
                      className={`tl-cov-cell ${ok ? 'met' : 'unmet'}`}
                      style={{
                        left: `${lp}%`, width: `${wp}%`,
                        background: ok
                          ? `rgba(92,184,138,${0.08 + c.count * 0.1})`
                          : `rgba(240,80,60,${0.15 + c.count * 0.08})`,
                        color: ok ? '#5cb88a' : '#f05040',
                      }}
                    >
                      {c.count}
                    </div>
                  );
                })}
              </div>

              {/* Shift bars */}
              <div className="tl-shifts">
                {shifts.sort((a, b) => a.start - b.start).map((sh, si) => {
                  const gi = gIdx(sh.empIdx);
                  const c = EMP_COLORS[gi % EMP_COLORS.length];
                  const emp = activeEmps[sh.empIdx];
                  const lp = ((sh.start - globalOpen) / span) * 100;
                  const wp = ((sh.end - sh.start) / span) * 100;
                  const isSplit = shifts.filter(s => s.empIdx === sh.empIdx).length > 1;

                  return (
                    <div
                      key={si}
                      className="tl-shift"
                      style={{
                        marginLeft: `calc(${lp}% + 6px)`,
                        width: `${wp}%`,
                        background: `linear-gradient(135deg, ${c.bg}, ${c.bg}cc)`,
                        borderColor: isSplit ? '#b8a05b66' : c.accent + '44',
                      }}
                    >
                      <span className="tl-shift-name" style={{ color: c.text }}>
                        {emp?.name}
                        <RoleBadges roles={emp?.roles || []} small />
                        {isSplit && <span className="split-badge">SPLIT</span>}
                      </span>
                      <span className="tl-shift-time" style={{ color: c.text + '77' }}>
                        {fmt(sh.start)}–{fmt(sh.end)}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
})
