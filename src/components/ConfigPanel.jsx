import React, { useState, useMemo } from 'react';
import { rc, fmt, ALL_DAY_NAMES, EMP_COLORS } from '../config';
import { TimeSelect, RolePills, EmpRolePills, CopyDayButton } from './ui';

export default function ConfigPanel({
  roles, setRoles,
  employees, setEmployees,
  dayConfigs, setDayConfigs,
  maxPerDay, setMaxPerDay,
  weeklyTarget, setWeeklyTarget,
}) {
  const [open, setOpen] = useState(true);
  const [tab, setTab] = useState('days');
  const [newRole, setNewRole] = useState('');

  // ── Handlers ──
  const ud = (i, f, v) => setDayConfigs(p => { const n = [...p]; n[i] = { ...n[i], [f]: v }; return n; });
  const ur = (di, ri, f, v) => setDayConfigs(p => {
    const n = [...p]; const r = [...n[di].rules];
    r[ri] = { ...r[ri], [f]: v }; n[di] = { ...n[di], rules: r }; return n;
  });
  const addRule = (di) => setDayConfigs(p => {
    const n = [...p]; const d = n[di];
    n[di] = { ...d, rules: [...d.rules, { roles: ['Any'], count: 1, from: d.open, to: d.close }] };
    return n;
  });
  const rmRule = (di, ri) => setDayConfigs(p => {
    const n = [...p]; n[di] = { ...n[di], rules: n[di].rules.filter((_, i) => i !== ri) }; return n;
  });
  const addDay = () => {
    const used = new Set(dayConfigs.map(d => d.name));
    const nx = ALL_DAY_NAMES.find(n => !used.has(n));
    if (nx) setDayConfigs(p => [...p, { name: nx, open: 8, close: 22, enabled: true, rules: [{ roles: ['Any'], count: 2, from: 8, to: 22 }] }]);
  };
  const rmDay = (i) => setDayConfigs(p => p.filter((_, j) => j !== i));
  const ue = (i, f, v) => setEmployees(p => { const n = [...p]; n[i] = { ...n[i], [f]: v }; return n; });
  const addE = () => setEmployees(p => [...p, { name: `Staff ${p.length + 1}`, roles: [roles[0] || 'Any'], active: true }]);
  const rmE = (i) => setEmployees(p => p.filter((_, j) => j !== i));

  const addRoleGlobal = () => {
    const r = newRole.trim();
    if (r && !roles.includes(r)) { setRoles(p => [...p, r]); setNewRole(''); }
  };
  const rmRole = (r) => {
    if (roles.length <= 1) return;
    setRoles(p => p.filter(x => x !== r));
    setEmployees(p => p.map(e => ({
      ...e, roles: e.roles.filter(x => x !== r).length ? e.roles.filter(x => x !== r) : [roles.find(x => x !== r) || 'Any'],
    })));
    setDayConfigs(p => p.map(d => ({
      ...d, rules: d.rules.map(rl => ({
        ...rl, roles: rl.roles.filter(x => x !== r).length ? rl.roles.filter(x => x !== r) : ['Any'],
      })),
    })));
  };

  const sortedDayIndices = useMemo(() => {
    const order = Object.fromEntries(ALL_DAY_NAMES.map((n, i) => [n, i]));
    return dayConfigs.map((_, i) => i).sort((a, b) => order[dayConfigs[a].name] - order[dayConfigs[b].name]);
  }, [dayConfigs]);

  return (
    <div className="config-panel">
      <button className="config-toggle" onClick={() => setOpen(!open)}>
        <span>Configuration</span>
        <span>{open ? '▾' : '▸'}</span>
      </button>

      {open && (
        <div className="config-body">
          {/* Global settings */}
          <div className="config-globals">
            <div>
              <label className="lbl">Max hrs/day</label>
              <input type="number" className="nin" min={2} max={24}
                value={maxPerDay} onChange={e => setMaxPerDay(Number(e.target.value))} />
            </div>
            <div>
              <label className="lbl">Weekly target</label>
              <input type="number" className="nin" min={4} max={120}
                value={weeklyTarget} onChange={e => setWeeklyTarget(Number(e.target.value))} />
            </div>
          </div>

          {/* Tabs */}
          <div className="tab-bar">
            {['roles', 'staff', 'days'].map(t => (
              <button key={t} className={`tab ${tab === t ? 'on' : ''}`} onClick={() => setTab(t)}>
                {t}
              </button>
            ))}
          </div>

          {/* ── Roles tab ── */}
          {tab === 'roles' && (
            <div className="tab-content">
              <p className="hint">Define roles. "Any" is built-in and matches everyone.</p>
              <div className="pill-row" style={{ marginBottom: 10 }}>
                {roles.map(r => (
                  <div key={r} className="role-tag" style={{ background: rc(r).b, borderColor: rc(r).a + '44' }}>
                    <span style={{ color: rc(r).t, fontWeight: 700 }}>{r}</span>
                    {roles.length > 1 && <span className="x" onClick={() => rmRole(r)}>×</span>}
                  </div>
                ))}
              </div>
              <div className="row-gap-6">
                <input className="tin" value={newRole} onChange={e => setNewRole(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && addRoleGlobal()}
                  placeholder="New role..." style={{ border: '1px solid #252e28', width: 110 }} />
                <button className="btn bg" onClick={addRoleGlobal}>+ Add Role</button>
              </div>
            </div>
          )}

          {/* ── Staff tab ── */}
          {tab === 'staff' && (
            <div className="tab-content">
              <p className="hint">Click role pills to toggle. Staff can fill any role they hold.</p>
              <div className="stack-5">
                {employees.map((emp, i) => {
                  const c = EMP_COLORS[i % EMP_COLORS.length];
                  return (
                    <div key={i} className={`emp-row ${emp.active ? '' : 'inactive'}`}>
                      <input type="checkbox" checked={emp.active}
                        onChange={e => ue(i, 'active', e.target.checked)} style={{ accentColor: '#5cb88a' }} />
                      <span className="dot" style={{ background: c.accent }} />
                      <input type="text" className="tin" value={emp.name}
                        onChange={e => ue(i, 'name', e.target.value)} />
                      <EmpRolePills selected={emp.roles} allRoles={roles}
                        onChange={v => ue(i, 'roles', v)} />
                      {employees.length > 1 && (
                        <span className="x" onClick={() => rmE(i)} style={{ marginLeft: 'auto' }}>×</span>
                      )}
                    </div>
                  );
                })}
              </div>
              <button className="btn bg" onClick={addE}>+ Add Employee</button>
            </div>
          )}

          {/* ── Days tab ── */}
          {tab === 'days' && (
            <div className="tab-content">
              <p className="hint">
                Use <strong style={{ color: '#7888b8' }}>⧉ Copy to…</strong> to duplicate a day's setup.
              </p>
              <div className="stack-8">
                {sortedDayIndices.map(di => { const day = dayConfigs[di]; return (
                  <div key={di} className={`day-card ${day.enabled ? '' : 'inactive'}`}>
                    <div className="day-header">
                      <input type="checkbox" checked={day.enabled}
                        onChange={e => ud(di, 'enabled', e.target.checked)} style={{ accentColor: '#5cb88a' }} />
                      <span className="day-name">{day.name.slice(0, 3)}</span>
                      <span className="label-sm">Open</span>
                      <TimeSelect value={day.open} onChange={v => {
                        setDayConfigs(p => {
                          const n = [...p];
                          n[di] = { ...n[di], open: v, rules: n[di].rules.map(r => ({
                            ...r, from: Math.max(r.from, v), to: Math.max(r.to, v + 1),
                          }))};
                          return n;
                        });
                      }} min={0} max={day.close - 1} />
                      <span className="label-sm">Close</span>
                      <TimeSelect value={day.close} onChange={v => {
                        setDayConfigs(p => {
                          const n = [...p];
                          n[di] = { ...n[di], close: v, rules: n[di].rules.map(r => ({
                            ...r, to: Math.min(r.to, v), from: Math.min(r.from, v - 1),
                          }))};
                          return n;
                        });
                      }} min={day.open + 1} max={24} />
                      <CopyDayButton dayIndex={di} dayConfigs={dayConfigs} setDayConfigs={setDayConfigs} />
                      <span className="x" onClick={() => rmDay(di)} style={{ marginLeft: 'auto' }}>×</span>
                    </div>

                    {day.enabled && (
                      <div className="rules-section">
                        <div className="rules-title">Coverage Rules</div>
                        {day.rules.map((rule, ri) => (
                          <div key={ri} className="rule-row">
                            <span className="label-sm">Need</span>
                            <input type="number" className="nin" style={{ width: 50 }} min={1} max={20}
                              value={rule.count} onChange={e => ur(di, ri, 'count', Number(e.target.value))} />
                            <span className="label-sm">of</span>
                            <RolePills selected={rule.roles} allRoles={roles}
                              onChange={v => ur(di, ri, 'roles', v)} />
                            <span className="label-sm">from</span>
                            <TimeSelect value={rule.from} onChange={v => {
                              setDayConfigs(p => {
                                const n = [...p]; const d = { ...n[di] }; const r = [...d.rules];
                                r[ri] = { ...r[ri], from: v };
                                if (v < d.open) d.open = v;
                                d.rules = r; n[di] = d; return n;
                              });
                            }} min={0} max={rule.to - 1} />
                            <span className="label-sm">to</span>
                            <TimeSelect value={rule.to} onChange={v => {
                              setDayConfigs(p => {
                                const n = [...p]; const d = { ...n[di] }; const r = [...d.rules];
                                r[ri] = { ...r[ri], to: v };
                                if (v > d.close) d.close = v;
                                d.rules = r; n[di] = d; return n;
                              });
                            }} min={rule.from + 1} max={24} />
                            <span className="x" onClick={() => rmRule(di, ri)}>×</span>
                          </div>
                        ))}
                        <button className="btn bg" style={{ marginTop: 3 }} onClick={() => addRule(di)}>
                          + Rule
                        </button>
                      </div>
                    )}
                  </div>
                ); })}
              </div>
              {dayConfigs.length < 7 && (
                <button className="btn bg" onClick={addDay}>+ Add Day</button>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
