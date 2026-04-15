import React, { useState, useMemo, useEffect, useRef } from 'react';
import { DEFAULT_ROLES, DEFAULT_EMPLOYEES, DEFAULT_DAYS, DEFAULT_GLOBALS, ALL_DAY_NAMES } from './config';
import { validateConfig } from './validate';
import ConfigPanel from './components/ConfigPanel';
import StatsBar from './components/StatsBar';
import Timeline from './components/Timeline';
import ScheduleTable from './components/ScheduleTable';
import SolverWorker from './solver.worker.js?worker';

const STORAGE_KEY = 'scheduler-config';
const EMPTY_RESULT = { assignments: {}, empHours: [], empDays: [], warnings: [], coverageByDay: {}, splitShifts: [] };

function loadConfig() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw);
  } catch (e) { /* ignore */ }
  return null;
}

function saveConfig(cfg) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(cfg)); }
  catch (e) { /* ignore */ }
}

function clearConfig() {
  try { localStorage.removeItem(STORAGE_KEY); }
  catch (e) { /* ignore */ }
}

function deepClone(obj) {
  return JSON.parse(JSON.stringify(obj));
}

export default function App() {
  const [roles, setRoles] = useState(() => {
    const cfg = loadConfig();
    return cfg?.roles || [...DEFAULT_ROLES];
  });
  const [employees, setEmployees] = useState(() => {
    const cfg = loadConfig();
    return cfg?.employees || deepClone(DEFAULT_EMPLOYEES);
  });
  const [dayConfigs, setDayConfigs] = useState(() => {
    const cfg = loadConfig();
    return cfg?.dayConfigs || deepClone(DEFAULT_DAYS);
  });
  const [maxPerDay, setMaxPerDay] = useState(() => {
    const cfg = loadConfig();
    return cfg?.maxPerDay ?? DEFAULT_GLOBALS.maxPerDay;
  });
  const [weeklyTarget, setWeeklyTarget] = useState(() => {
    const cfg = loadConfig();
    return cfg?.weeklyTarget ?? DEFAULT_GLOBALS.weeklyTarget;
  });

  const saveTimer = useRef(null);

  // Auto-save on change (debounced) — no synchronous setState in the effect body
  useEffect(() => {
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      saveConfig({ roles, employees, dayConfigs, maxPerDay, weeklyTarget });
    }, 800);
    return () => { if (saveTimer.current) clearTimeout(saveTimer.current); };
  }, [roles, employees, dayConfigs, maxPerDay, weeklyTarget]);

  const handleExport = async () => {
    const { exportSchedule } = await import('./exportSchedule.js');
    exportSchedule({ activeDays, activeEmps, employees, result, weeklyTarget });
  };

  const handleReset = () => {
    if (!confirm('Reset all configuration to defaults?')) return;
    clearConfig();
    setRoles([...DEFAULT_ROLES]);
    setEmployees(deepClone(DEFAULT_EMPLOYEES));
    setDayConfigs(deepClone(DEFAULT_DAYS));
    setMaxPerDay(DEFAULT_GLOBALS.maxPerDay);
    setWeeklyTarget(DEFAULT_GLOBALS.weeklyTarget);
  };

  // Memoize derived arrays so child React.memo actually works
  const activeEmps = useMemo(() => employees.filter(e => e.active), [employees]);
  const activeDays = useMemo(() => {
    const order = Object.fromEntries(ALL_DAY_NAMES.map((n, i) => [n, i]));
    return dayConfigs.filter(d => d.enabled).sort((a, b) => order[a.name] - order[b.name]);
  }, [dayConfigs]);

  // Pre-solver constraint validation
  const configWarnings = useMemo(() => validateConfig(dayConfigs, employees), [dayConfigs, employees]);

  // Run solver in a Web Worker so it never blocks the main thread
  const [result, setResult] = useState(EMPTY_RESULT);
  const workerRef = useRef(null);
  const solveTimer = useRef(null);

  useEffect(() => {
    const worker = new SolverWorker();
    workerRef.current = worker;
    worker.onmessage = (e) => setResult(e.data);
    // Initial solve
    worker.postMessage({ dayConfigs, employees, maxPerDay, weeklyTarget });
    return () => worker.terminate();
  }, []);

  useEffect(() => {
    if (solveTimer.current) clearTimeout(solveTimer.current);
    solveTimer.current = setTimeout(() => {
      workerRef.current?.postMessage({ dayConfigs, employees, maxPerDay, weeklyTarget });
    }, 200);
    return () => { if (solveTimer.current) clearTimeout(solveTimer.current); };
  }, [dayConfigs, employees, maxPerDay, weeklyTarget]);

  return (
    <div>
      {/* Header */}
      <div style={{ marginBottom: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 3 }}>
              <div style={{
                width: 7, height: 7, borderRadius: '50%',
                background: '#5cb88a', boxShadow: '0 0 8px #5cb88a55',
              }} />
              <span style={{
                fontFamily: "'JetBrains Mono', monospace",
                fontSize: 9, color: '#5cb88a', letterSpacing: 2.5, textTransform: 'uppercase',
              }}>
                Schedule Engine
              </span>
            </div>
            <h1 style={{ fontSize: 20, fontWeight: 800, color: '#eef4f0', letterSpacing: -0.5 }}>
              Restaurant Staff Scheduler
            </h1>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            {result.empHours.length > 0 && (
              <button className="btn" onClick={handleExport}>Export to Excel</button>
            )}
            <button className="btn br" onClick={handleReset}>Reset</button>
          </div>
        </div>
        <p style={{ fontSize: 11, color: '#4a5a50', marginTop: 3 }}>
          Multi-pass solver · Minimal staffing · Split shifts only when needed · Auto-saves
        </p>
      </div>

      {/* Config */}
      <ConfigPanel
        roles={roles} setRoles={setRoles}
        employees={employees} setEmployees={setEmployees}
        dayConfigs={dayConfigs} setDayConfigs={setDayConfigs}
        maxPerDay={maxPerDay} setMaxPerDay={setMaxPerDay}
        weeklyTarget={weeklyTarget} setWeeklyTarget={setWeeklyTarget}
      />

      {/* Critical config warnings */}
      {configWarnings.length > 0 && (
        <div className="warnings warnings-critical">
          {configWarnings.map((w, i) => <div key={i}>{w.message}</div>)}
        </div>
      )}

      {/* Solver warnings */}
      {result.warnings.length > 0 && (
        <div className="warnings">
          {result.warnings.map((w, i) => <div key={i}>⚠ {w}</div>)}
        </div>
      )}

      {/* Stats */}
      <StatsBar
        activeEmps={activeEmps}
        employees={employees}
        result={result}
        weeklyTarget={weeklyTarget}
      />

      {/* Timeline */}
      <Timeline
        activeDays={activeDays}
        activeEmps={activeEmps}
        employees={employees}
        result={result}
      />

      {/* Table */}
      <ScheduleTable
        activeDays={activeDays}
        activeEmps={activeEmps}
        employees={employees}
        result={result}
        weeklyTarget={weeklyTarget}
      />

      {/* Legend */}
      <div className="legend">
        <span className="legend-item">
          <span className="legend-dot" style={{ background: 'rgba(240,80,60,.25)' }} /> Rule unmet
        </span>
        <span className="legend-item">
          <span className="legend-dot" style={{ background: 'rgba(92,184,138,.2)' }} /> Rules met
        </span>
        <span className="legend-item">
          <span className="legend-dot" style={{ background: '#3a3018', border: '1px solid #b8a05b66' }} /> Split shift
        </span>
      </div>
    </div>
  );
}
