/**
 * Restaurant Schedule Solver — Constraint-Based Search
 *
 * Phase 1: Per-day enumeration — find all high-coverage shift combos per day
 * Phase 2: Cross-day backtracking — pick one combo per day maximizing global score
 *
 * Hard constraints: maxPerDay, operating hours
 * Primary goal:     coverage rules (100 pts per satisfied hour-slot)
 * Soft constraints:  fewer working days (-5 per day), hour balance (-2 × variance)
 * Target hours:      per-employee soft penalty (-1 × deviation² per employee)
 * Shift preference:  per-employee open/close preference (-8 per violation day)
 */

function empMatchesRule(emp, ruleRoles) {
  if (ruleRoles.includes('Any')) return true;
  return emp.roles.some(r => ruleRoles.includes(r));
}

export function solve(days, employees, maxPerDay, weeklyTarget) {
  const activeDays = days.filter(d => d.enabled && d.close > d.open);
  const activeEmps = employees.filter(e => e.active);
  const N = activeEmps.length;
  const empTargets = activeEmps.map(e =>
    e.targetHoursEnabled && e.targetHours != null ? e.targetHours : weeklyTarget
  );
  const empShiftPref = activeEmps.map(e => e.shiftPreference || null);

  const empty = {
    assignments: {}, empHours: [], empDays: [],
    warnings: [], coverageByDay: {}, splitShifts: [],
  };
  if (!N || !activeDays.length) return empty;

  // ── Prepare day data with boundary-aligned shift options ──
  const dayData = activeDays.map(day => {
    const pts = new Set([day.open, day.close]);
    const rules = (day.rules || []).map(r => ({
      roles: r.roles, count: r.count,
      from: Math.max(r.from, day.open),
      to: Math.min(r.to, day.close),
    })).filter(r => r.to > r.from);

    for (const r of rules) { pts.add(r.from); pts.add(r.to); }
    // Add maxPerDay offsets for shift-length flexibility
    for (const p of [...pts]) {
      const lo = p - maxPerDay, hi = p + maxPerDay;
      if (lo >= day.open && lo <= day.close) pts.add(lo);
      if (hi >= day.open && hi <= day.close) pts.add(hi);
    }
    const boundaries = [...pts].sort((a, b) => a - b);

    const options = [];
    for (let i = 0; i < boundaries.length; i++) {
      for (let j = i + 1; j < boundaries.length; j++) {
        const len = boundaries[j] - boundaries[i];
        if (len >= 1 && len <= maxPerDay) options.push({ s: boundaries[i], e: boundaries[j] });
      }
    }

    let maxCov = 0;
    for (const r of rules) maxCov += r.count * (r.to - r.from);

    // Precompute rule-employee match table
    const ruleMatch = rules.map(rule => {
      const m = new Uint8Array(N);
      for (let e = 0; e < N; e++) m[e] = empMatchesRule(activeEmps[e], rule.roles) ? 1 : 0;
      return m;
    });

    // Per-employee shift options sorted by coverage heuristic
    const empShiftOpts = [];
    for (let ei = 0; ei < N; ei++) {
      let canContribute = false;
      for (let ri = 0; ri < rules.length; ri++) {
        if (ruleMatch[ri][ei]) { canContribute = true; break; }
      }
      if (!canContribute) { empShiftOpts.push([]); continue; }
      const eo = [];
      for (const opt of options) {
        let h = 0;
        for (let ri = 0; ri < rules.length; ri++) {
          if (!ruleMatch[ri][ei]) continue;
          const f = Math.max(rules[ri].from, opt.s);
          const t = Math.min(rules[ri].to, opt.e);
          if (t > f) h += (t - f);
        }
        if (h > 0) eo.push({ s: opt.s, e: opt.e, h: h * 10 - (opt.e - opt.s) });
      }
      eo.sort((a, b) => b.h - a.h);
      empShiftOpts.push(eo);
    }

    return { day, rules, maxCov, ruleMatch, empShiftOpts };
  });

  // Sort days: most constrained first (better pruning in cross-day search)
  dayData.sort((a, b) => b.maxCov - a.maxCov);

  // Process employees: least flexible first (fewest roles)
  const empOrder = [...Array(N).keys()].sort((a, b) =>
    activeEmps[a].roles.length - activeEmps[b].roles.length
  );

  // ── Phase 1: Per-day full enumeration ──
  const MAX_COMBOS = 80000;

  const dayPlans = dayData.map(dd => {
    // Build option arrays: [null (off), shift1, shift2, ...] per employee
    const empOptArrays = empOrder.map(ei => [null, ...dd.empShiftOpts[ei]]);

    // Cap enumeration size by trimming lowest-heuristic options
    let totalCombos = 1;
    for (const a of empOptArrays) totalCombos *= a.length;
    if (totalCombos > MAX_COMBOS && empOptArrays.length > 0) {
      const cap = Math.max(2, Math.floor(Math.pow(MAX_COMBOS, 1 / empOptArrays.length)));
      for (let i = 0; i < empOptArrays.length; i++) {
        if (empOptArrays[i].length > cap) empOptArrays[i] = empOptArrays[i].slice(0, cap);
      }
    }

    // Enumerate all combos
    const plans = [];
    const buf = new Array(N).fill(null); // reusable shift buffer

    function enumerate(eoi) {
      if (eoi === empOrder.length) {
        // Score coverage
        let cov = 0;
        for (let ri = 0; ri < dd.rules.length; ri++) {
          const rule = dd.rules[ri];
          const match = dd.ruleMatch[ri];
          for (let h = rule.from; h < rule.to; h++) {
            let filled = 0;
            for (let e = 0; e < N; e++) {
              const sh = buf[e];
              if (sh && sh.s <= h && sh.e > h && match[e]) {
                if (++filled >= rule.count) break;
              }
            }
            cov += filled < rule.count ? filled : rule.count;
          }
        }

        const hrs = new Array(N);
        let totalHrs = 0, mask = 0;
        for (let e = 0; e < N; e++) {
          if (buf[e]) {
            hrs[e] = buf[e].e - buf[e].s;
            totalHrs += hrs[e];
            mask |= (1 << e);
          } else {
            hrs[e] = 0;
          }
        }

        plans.push({
          shifts: buf.map(s => s ? { s: s.s, e: s.e } : null),
          cov, hrs, totalHrs, mask,
        });
        return;
      }

      const ei = empOrder[eoi];
      for (const opt of empOptArrays[eoi]) {
        buf[ei] = opt;
        enumerate(eoi + 1);
      }
    }

    enumerate(0);

    // ── Filter to diverse high-coverage plans ──
    plans.sort((a, b) => b.cov - a.cov || a.totalHrs - b.totalHrs);
    const maxCovSeen = plans[0]?.cov || 0;
    const covThreshold = maxCovSeen - 1;

    const seen = new Set();
    const filtered = [];
    for (const plan of plans) {
      if (plan.cov < covThreshold && filtered.length >= 5) break;
      if (filtered.length >= 40) break;
      // Deduplicate by mask + quantized hours (3h buckets)
      const key = plan.mask + '|' + plan.hrs.map(h => Math.floor(h / 3)).join(',');
      if (!seen.has(key)) {
        seen.add(key);
        filtered.push(plan);
      }
    }
    return filtered;
  });

  // ── Phase 2: Cross-day backtracking ──
  let bestScore = -Infinity;
  let bestChoice = null;
  const empHrsRunning = new Array(N).fill(0);
  const empDaysRunning = new Array(N).fill(0);
  const chosen = new Array(dayData.length);
  const t0 = Date.now();
  const BUDGET = 2000;
  let nodes = 0;

  function crossSearch(di) {
    if (++nodes % 512 === 0 && Date.now() - t0 > BUDGET) return;

    if (di === dayData.length) {
      // Score complete solution
      let score = 0;
      for (const p of chosen) score += p.cov * 100;
      for (let e = 0; e < N; e++) score -= empDaysRunning[e] * 5;
      const sum = empHrsRunning.reduce((s, h) => s + h, 0);
      const avg = sum / N;
      let v = 0;
      for (let e = 0; e < N; e++) v += (empHrsRunning[e] - avg) ** 2;
      score -= (v / N) * 2;
      // Target hours penalty: -1 × (deviation)² per employee
      for (let e = 0; e < N; e++) {
        const dev = empHrsRunning[e] - empTargets[e];
        score -= dev * dev;
      }
      // Shift preference penalty: -8 per day working against preference
      for (let e = 0; e < N; e++) {
        const pref = empShiftPref[e];
        if (!pref) continue;
        for (let d = 0; d < dayData.length; d++) {
          const sh = chosen[d].shifts[e];
          if (!sh) continue;
          const day = dayData[d].day;
          if (pref === 'open' && sh.s !== day.open) score -= 8;
          if (pref === 'close' && sh.e !== day.close) score -= 8;
        }
      }
      if (score > bestScore) { bestScore = score; bestChoice = chosen.slice(); }
      return;
    }

    for (const plan of dayPlans[di]) {
      chosen[di] = plan;
      for (let e = 0; e < N; e++) {
        empHrsRunning[e] += plan.hrs[e];
        if (plan.hrs[e] > 0) empDaysRunning[e]++;
      }

      // Branch-and-bound: actual coverage so far + optimistic remaining
      let bound = 0;
      for (let d = 0; d <= di; d++) bound += chosen[d].cov * 100;
      for (let d = di + 1; d < dayData.length; d++) bound += dayData[d].maxCov * 100;
      if (bound > bestScore) crossSearch(di + 1);

      for (let e = 0; e < N; e++) {
        empHrsRunning[e] -= plan.hrs[e];
        if (plan.hrs[e] > 0) empDaysRunning[e]--;
      }

      if (nodes % 512 === 0 && Date.now() - t0 > BUDGET) return;
    }
  }

  crossSearch(0);

  // ── Convert to output format ──
  const assignments = {};
  const empHours = new Array(N).fill(0);
  const empDays = new Array(N).fill(0);

  if (bestChoice) {
    for (let di = 0; di < dayData.length; di++) {
      const dayName = dayData[di].day.name;
      const plan = bestChoice[di];
      assignments[dayName] = [];
      for (let e = 0; e < N; e++) {
        const sh = plan.shifts[e];
        if (sh) {
          assignments[dayName].push({ empIdx: e, start: sh.s, end: sh.e });
          empHours[e] += plan.hrs[e];
          empDays[e]++;
        }
      }
    }
  } else {
    for (const dd of dayData) assignments[dd.day.name] = [];
  }

  // ── Coverage report + warnings ──
  const warnings = [];
  const coverageByDay = {};

  for (const dd of dayData) {
    const day = dd.day;
    const sh = assignments[day.name];
    const cov = [];
    for (let h = day.open; h < day.close; h++) {
      const empIndices = [];
      for (const s of sh) {
        if (s.start <= h && s.end > h) empIndices.push(s.empIdx);
      }
      cov.push({ hour: h, count: empIndices.length, empIndices });
    }
    coverageByDay[day.name] = cov;

    for (let ri = 0; ri < dd.rules.length; ri++) {
      const rule = dd.rules[ri];
      const gaps = [];
      for (let h = rule.from; h < rule.to; h++) {
        const c = cov[h - day.open];
        if (!c) { gaps.push(h); continue; }
        let el = 0;
        for (const ei of c.empIndices) {
          if (dd.ruleMatch[ri][ei]) el++;
        }
        if (el < rule.count) gaps.push(h);
      }
      if (gaps.length) {
        warnings.push(
          `${day.name}: need ${rule.count} [${rule.roles.join('/')}] ` +
          `${fmtTime(rule.from)}\u2013${fmtTime(rule.to)}, gaps at ${gaps.map(fmtTime).join(',')}`
        );
      }
    }
  }

  // Shift preference warnings
  if (bestChoice) {
    const prefMisses = [];
    for (let e = 0; e < N; e++) {
      const pref = empShiftPref[e];
      if (!pref) continue;
      const missDays = [];
      for (let di = 0; di < dayData.length; di++) {
        const sh = bestChoice[di].shifts[e];
        if (!sh) continue;
        const day = dayData[di].day;
        if (pref === 'open' && sh.s !== day.open) missDays.push(day.name);
        if (pref === 'close' && sh.e !== day.close) missDays.push(day.name);
      }
      if (missDays.length) prefMisses.push(`${activeEmps[e].name} prefers ${pref} (not met: ${missDays.join(', ')})`);
    }
    if (prefMisses.length) warnings.push('Shift prefs: ' + prefMisses.join('; '));
  }

  // Per-employee target warnings
  const off = activeEmps.map((e, i) => {
    const target = empTargets[i];
    return { name: e.name, hrs: empHours[i], target };
  }).filter(e => e.hrs !== e.target);
  if (off.length) {
    warnings.push('Hours: ' + off.map(e => `${e.name} ${e.hrs}h (target ${e.target}h)`).join(', '));
  }

  return { assignments, empHours, empDays, warnings, coverageByDay, splitShifts: [] };
}

function fmtTime(h) {
  if (h === 0 || h === 24) return '12am';
  if (h === 12) return '12pm';
  return h < 12 ? `${h}am` : `${h - 12}pm`;
}
