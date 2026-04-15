import React, { useState } from 'react';
import { rc, fmt } from '../config';

export function TimeSelect({ value, onChange, min = 0, max = 24 }) {
  const opts = [];
  for (let h = min; h <= max; h++) {
    opts.push(<option key={h} value={h}>{fmt(h)}</option>);
  }
  return (
    <select value={value} onChange={e => onChange(Number(e.target.value))} className="tsel">
      {opts}
    </select>
  );
}

export function RolePills({ selected, allRoles, onChange }) {
  const toggle = (r) => {
    if (selected.includes(r)) {
      if (selected.length > 1) onChange(selected.filter(x => x !== r));
    } else {
      if (r === 'Any') onChange(['Any']);
      else onChange([...selected.filter(x => x !== 'Any'), r]);
    }
  };

  return (
    <div className="pill-row">
      {['Any', ...allRoles].map(r => {
        const on = selected.includes(r);
        const c = rc(r);
        return (
          <button
            key={r}
            onClick={() => toggle(r)}
            className="pill"
            style={{
              borderColor: on ? c.a + '88' : '#252e28',
              background: on ? c.b : 'transparent',
              color: on ? c.t : '#445',
              fontWeight: on ? 700 : 400,
            }}
          >
            {r}
          </button>
        );
      })}
    </div>
  );
}

export function EmpRolePills({ selected, allRoles, onChange }) {
  const toggle = (r) => {
    if (selected.includes(r)) {
      if (selected.length > 1) onChange(selected.filter(x => x !== r));
    } else {
      onChange([...selected, r]);
    }
  };

  return (
    <div className="pill-row">
      {allRoles.map(r => {
        const on = selected.includes(r);
        const c = rc(r);
        return (
          <button
            key={r}
            onClick={() => toggle(r)}
            className="pill"
            style={{
              borderColor: on ? c.a + '88' : '#252e28',
              background: on ? c.b : 'transparent',
              color: on ? c.t : '#445',
              fontWeight: on ? 700 : 400,
            }}
          >
            {r}
          </button>
        );
      })}
    </div>
  );
}

export function RoleBadges({ roles, small }) {
  return (
    <span className="role-badges">
      {roles.map(r => {
        const c = rc(r);
        return (
          <span
            key={r}
            className={small ? 'badge badge-sm' : 'badge'}
            style={{ color: c.a, background: c.b }}
          >
            {r}
          </span>
        );
      })}
    </span>
  );
}

export function CopyDayButton({ dayIndex, dayConfigs, setDayConfigs }) {
  const [open, setOpen] = useState(false);
  const src = dayConfigs[dayIndex];

  const copyTo = (ti) => {
    setDayConfigs(p => {
      const n = [...p];
      n[ti] = {
        ...n[ti],
        open: src.open,
        close: src.close,
        enabled: src.enabled,
        rules: src.rules.map(r => ({ ...r, roles: [...r.roles] })),
      };
      return n;
    });
    setOpen(false);
  };

  const copyAll = () => {
    setDayConfigs(p =>
      p.map((d, i) =>
        i === dayIndex ? d : {
          ...d,
          open: src.open, close: src.close, enabled: src.enabled,
          rules: src.rules.map(r => ({ ...r, roles: [...r.roles] })),
        }
      )
    );
    setOpen(false);
  };

  return (
    <div style={{ position: 'relative', display: 'inline-block' }}>
      <button className="btn cp" onClick={() => setOpen(!open)}>
        <span style={{ fontSize: 11 }}>⧉</span> Copy to…
      </button>
      {open && (
        <div className="copy-dropdown">
          <button className="cpi" onClick={copyAll}>
            <span style={{ color: '#5cb88a', fontWeight: 700 }}>All other days</span>
          </button>
          <div className="copy-divider" />
          {dayConfigs.map((d, i) =>
            i === dayIndex ? null : (
              <button key={i} className="cpi" onClick={() => copyTo(i)}>
                {d.name}
              </button>
            )
          )}
          <div className="copy-divider" />
          <button className="cpi" onClick={() => setOpen(false)} style={{ color: '#556' }}>
            Cancel
          </button>
        </div>
      )}
      {open && (
        <div className="copy-backdrop" onClick={() => setOpen(false)} />
      )}
    </div>
  );
}
