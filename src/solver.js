/**
 * Restaurant Schedule Solver — Multi-Pass, Globally-Aware
 *
 * PASS 1: Demand Analysis — compute exact staffing needs per day
 * PASS 2: Minimal Assignment — fill hardest days first, minimum staff
 * PASS 3: Hour Balancing — extend/add shifts to hit weekly targets
 * PASS 4: Split Shift Repair — fill remaining gaps (last resort)
 */

function empMatchesRule(emp, ruleRoles) {
  if (ruleRoles.includes('Any')) return true;
  return emp.roles.some(r => ruleRoles.includes(r));
}

// Count eligible staff at a given hour (avoids allocating filter arrays)
function countEligible(shifts, hour, activeEmps, ruleRoles) {
  let count = 0;
  for (let i = 0; i < shifts.length; i++) {
    const s = shifts[i];
    if (s.start <= hour && s.end > hour && empMatchesRule(activeEmps[s.empIdx], ruleRoles)) count++;
  }
  return count;
}

function countAtHour(shifts, hour) {
  let count = 0;
  for (let i = 0; i < shifts.length; i++) {
    if (shifts[i].start <= hour && shifts[i].end > hour) count++;
  }
  return count;
}

function indicesAtHour(shifts, hour) {
  const out = [];
  for (let i = 0; i < shifts.length; i++) {
    if (shifts[i].start <= hour && shifts[i].end > hour) out.push(shifts[i].empIdx);
  }
  return out;
}

export function solve(days, employees, maxPerDay, weeklyTarget) {
  const activeDays = days.filter(d => d.enabled && d.close > d.open);
  const activeEmps = employees.filter(e => e.active);
  const N = activeEmps.length;

  const empty = {
    assignments: {}, empHours: [], empDays: [],
    warnings: [], coverageByDay: {}, splitShifts: [],
  };
  if (!N || !activeDays.length) return empty;

  const empHours = new Array(N).fill(0);
  const empDaysCount = new Array(N).fill(0);
  const assignments = {};
  activeDays.forEach(d => { assignments[d.name] = []; });
  const warnings = [];
  const splitShifts = [];

  // ────────────────────────────────────────────
  // PASS 1: Build demand seats per day
  // ────────────────────────────────────────────
  const dayDemand = {};
  for (const day of activeDays) {
    const seats = [];
    for (const rule of (day.rules || [])) {
      const from = Math.max(rule.from, day.open);
      const to = Math.min(rule.to, day.close);
      if (to <= from) continue;
      for (let c = 0; c < rule.count; c++) {
        const totalHours = to - from;
        if (totalHours <= maxPerDay) {
          seats.push({ roles: rule.roles, from, to, hours: totalHours });
        } else {
          const numChunks = Math.ceil(totalHours / maxPerDay);
          const stride = (totalHours - maxPerDay) / Math.max(numChunks - 1, 1);
          for (let ch = 0; ch < numChunks; ch++) {
            const cs = Math.round(from + ch * stride);
            const ce = Math.min(cs + maxPerDay, to);
            if (ce - cs > 0) {
              seats.push({ roles: rule.roles, from: cs, to: ce, hours: ce - cs });
            }
          }
        }
      }
    }
    seats.sort((a, b) => (b.hours - a.hours) || (a.from - b.from));
    dayDemand[day.name] = seats;
  }

  // ────────────────────────────────────────────
  // PASS 2: Minimal assignment (hardest days first)
  // ────────────────────────────────────────────
  const dayOrder = [...activeDays].sort((a, b) => {
    const ad = (dayDemand[a.name] || []).reduce((s, seat) => s + seat.hours, 0);
    const bd = (dayDemand[b.name] || []).reduce((s, seat) => s + seat.hours, 0);
    return bd - ad;
  });

  for (const day of dayOrder) {
    const seats = dayDemand[day.name] || [];
    const todayAssigned = new Map();

    for (const seat of seats) {
      const candidates = [];
      for (let i = 0; i < N; i++) {
        const emp = activeEmps[i];
        if (!empMatchesRule(emp, seat.roles)) continue;
        const existing = todayAssigned.get(i);
        if (existing) {
          const ns = Math.min(existing.start, seat.from);
          const ne = Math.max(existing.end, seat.to);
          if (ne - ns > maxPerDay) continue;
          if (seat.from > existing.end || seat.to < existing.start) continue;
        } else {
          if (empHours[i] + seat.hours > weeklyTarget + 4) continue;
          if (seat.hours > maxPerDay) continue;
        }
        candidates.push({ emp, idx: i });
      }

      candidates.sort((a, b) => {
        const aE = !seat.roles.includes('Any') && a.emp.roles.some(r => seat.roles.includes(r)) ? 0 : 1;
        const bE = !seat.roles.includes('Any') && b.emp.roles.some(r => seat.roles.includes(r)) ? 0 : 1;
        if (aE !== bE) return aE - bE;
        const aX = todayAssigned.has(a.idx) ? 0 : 1;
        const bX = todayAssigned.has(b.idx) ? 0 : 1;
        if (aX !== bX) return aX - bX;
        return empHours[a.idx] - empHours[b.idx];
      });

      if (!candidates.length) continue;
      const pick = candidates[0];
      const existing = todayAssigned.get(pick.idx);

      if (existing) {
        const oldLen = existing.end - existing.start;
        existing.start = Math.min(existing.start, seat.from);
        existing.end = Math.max(existing.end, seat.to);
        empHours[pick.idx] += (existing.end - existing.start) - oldLen;
      } else {
        todayAssigned.set(pick.idx, { start: seat.from, end: seat.to });
        empHours[pick.idx] += seat.hours;
        empDaysCount[pick.idx]++;
      }
    }

    for (const [empIdx, shift] of todayAssigned) {
      assignments[day.name].push({ empIdx, start: shift.start, end: shift.end });
    }
  }

  // ────────────────────────────────────────────
  // PASS 3: Hour balancing
  // ────────────────────────────────────────────

  // 3a: Trim over-target employees
  for (let iter = 0; iter < 60; iter++) {
    let changed = false;
    for (let e = 0; e < N; e++) {
      const over = empHours[e] - weeklyTarget;
      if (over <= 0) continue;

      let bestDay = null, bestLen = Infinity, bestSi = -1;
      for (const day of activeDays) {
        const dayShifts = assignments[day.name];
        for (let si = 0; si < dayShifts.length; si++) {
          if (dayShifts[si].empIdx !== e) continue;
          const len = dayShifts[si].end - dayShifts[si].start;
          if (len < bestLen) { bestLen = len; bestDay = day; bestSi = si; }
          break;
        }
      }
      if (!bestDay) continue;

      const s = assignments[bestDay.name][bestSi];
      const len = s.end - s.start;
      const trim = Math.min(over, len - 1);
      if (trim <= 0) continue;

      const rules = bestDay.rules || [];
      let startCount = 0, endCount = 0;
      for (const r of rules) {
        if (s.start >= r.from && s.start < r.to) startCount++;
        if ((s.end - 1) >= r.from && (s.end - 1) < r.to) endCount++;
      }

      if (endCount <= startCount) {
        s.end -= trim;
      } else {
        s.start += trim;
      }
      empHours[e] -= trim;

      if (s.end <= s.start) {
        assignments[bestDay.name].splice(bestSi, 1);
        empDaysCount[e]--;
      }
      changed = true;
    }
    if (!changed) break;
  }

  // 3b: Extend under-target employees
  for (let iter = 0; iter < 80; iter++) {
    let worstE = -1, worstDef = 0;
    for (let e = 0; e < N; e++) {
      const def = weeklyTarget - empHours[e];
      if (def > worstDef) { worstDef = def; worstE = e; }
    }
    if (worstE === -1 || worstDef <= 0) break;

    const e = worstE;
    const needed = worstDef;
    let changed = false;

    // Try extending existing shift
    for (const day of activeDays) {
      const dayShifts = assignments[day.name];
      let s = null;
      for (let i = 0; i < dayShifts.length; i++) {
        if (dayShifts[i].empIdx === e) { s = dayShifts[i]; break; }
      }
      if (!s) continue;
      const len = s.end - s.start;
      const canAdd = Math.min(needed, maxPerDay - len);
      if (canAdd <= 0) continue;

      const extStart = Math.min(canAdd, s.start - day.open);
      if (extStart > 0) {
        s.start -= extStart;
        empHours[e] += extStart;
        changed = true; break;
      }
      const extEnd = Math.min(canAdd, day.close - s.end);
      if (extEnd > 0) {
        s.end += extEnd;
        empHours[e] += extEnd;
        changed = true; break;
      }
    }

    if (!changed) {
      // Add to unworked day with most coverage gaps
      const unworked = activeDays.filter(d =>
        !assignments[d.name].some(s => s.empIdx === e)
      );

      let bestDay = null, bestScore = -1;
      for (const day of unworked) {
        const addHrs = Math.min(needed, maxPerDay, day.close - day.open);
        if (addHrs < 1) continue;

        let gaps = 0;
        const shifts = assignments[day.name];
        for (const rule of (day.rules || [])) {
          for (let h = Math.max(rule.from, day.open); h < Math.min(rule.to, day.close); h++) {
            const elig = countEligible(shifts, h, activeEmps, rule.roles);
            if (elig < rule.count && empMatchesRule(activeEmps[e], rule.roles)) gaps++;
          }
        }
        if (gaps > bestScore) { bestScore = gaps; bestDay = day; }
      }

      if (bestDay) {
        const addHrs = Math.min(needed, maxPerDay, bestDay.close - bestDay.open);
        let bestStart = bestDay.open, bestGapCover = 0;
        for (let start = bestDay.open; start + addHrs <= bestDay.close; start++) {
          let gapCover = 0;
          const shifts = assignments[bestDay.name];
          for (let h = start; h < start + addHrs; h++) {
            for (const rule of (bestDay.rules || [])) {
              if (h < rule.from || h >= rule.to) continue;
              const elig = countEligible(shifts, h, activeEmps, rule.roles);
              if (elig < rule.count && empMatchesRule(activeEmps[e], rule.roles)) gapCover++;
            }
          }
          if (gapCover > bestGapCover) { bestGapCover = gapCover; bestStart = start; }
        }

        assignments[bestDay.name].push({ empIdx: e, start: bestStart, end: bestStart + addHrs });
        empHours[e] += addHrs;
        empDaysCount[e]++;
        changed = true;
      }
    }
    if (!changed) break;
  }

  // ────────────────────────────────────────────
  // PASS 4: Split shift repair
  // ────────────────────────────────────────────
  for (const day of activeDays) {
    for (const rule of (day.rules || [])) {
      for (let h = Math.max(rule.from, day.open); h < Math.min(rule.to, day.close); h++) {
        const shifts = assignments[day.name];
        const elig = countEligible(shifts, h, activeEmps, rule.roles);
        if (elig >= rule.count) continue;

        for (let e = 0; e < N; e++) {
          if (!empMatchesRule(activeEmps[e], rule.roles)) continue;
          let onTodayCount = 0, onTodayFirst = null, todayHrs = 0;
          for (let i = 0; i < shifts.length; i++) {
            if (shifts[i].empIdx === e) {
              onTodayCount++;
              if (!onTodayFirst) onTodayFirst = shifts[i];
              todayHrs += shifts[i].end - shifts[i].start;
            }
          }

          if (onTodayCount === 0) {
            if (empHours[e] >= weeklyTarget + 2) continue;
            let gs = h, ge = h + 1;
            while (gs > day.open) {
              const el = countEligible(shifts, gs - 1, activeEmps, rule.roles);
              if (el < rule.count && (ge - gs + 1) <= maxPerDay) gs--;
              else break;
            }
            while (ge < day.close) {
              const el = countEligible(shifts, ge, activeEmps, rule.roles);
              if (el < rule.count && (ge + 1 - gs) <= maxPerDay) ge++;
              else break;
            }
            const sl = ge - gs;
            if (sl > maxPerDay || empHours[e] + sl > weeklyTarget + 4) continue;
            assignments[day.name].push({ empIdx: e, start: gs, end: ge });
            empHours[e] += sl;
            empDaysCount[e]++;
            break;
          }

          if (onTodayCount >= 2) continue;
          if (todayHrs + 1 > maxPerDay || empHours[e] >= weeklyTarget + 2) continue;

          const existing = onTodayFirst;
          if (h >= existing.start && h < existing.end) continue;

          const extLen = Math.max(existing.end, h + 1) - Math.min(existing.start, h);
          if (extLen <= maxPerDay) {
            const oldLen = existing.end - existing.start;
            existing.start = Math.min(existing.start, h);
            existing.end = Math.max(existing.end, h + 1);
            empHours[e] += (existing.end - existing.start) - oldLen;
            break;
          }

          // True split
          const splitLen = Math.min(2, maxPerDay - todayHrs, day.close - h);
          if (splitLen < 1) continue;
          assignments[day.name].push({ empIdx: e, start: h, end: h + splitLen });
          empHours[e] += splitLen;
          splitShifts.push({ empIdx: e, day: day.name });
          break;
        }
      }
    }
  }

  // ────────────────────────────────────────────
  // Final trim — remove unnecessary overstaffing
  // ────────────────────────────────────────────
  for (let iter = 0; iter < 30; iter++) {
    let changed = false;
    for (let e = 0; e < N; e++) {
      if (empHours[e] <= weeklyTarget) continue;
      for (const day of activeDays) {
        const dayShifts = assignments[day.name];
        for (let si = 0; si < dayShifts.length; si++) {
          const s = dayShifts[si];
          if (s.empIdx !== e) continue;
          // Trim end
          while (empHours[e] > weeklyTarget && s.end > s.start + 1) {
            const testH = s.end - 1;
            const rules = (day.rules || []);
            let canTrim = true;
            for (const rule of rules) {
              if (testH < rule.from || testH >= rule.to) continue;
              // Count others eligible at this hour (excluding this shift)
              let el = 0;
              for (let j = 0; j < dayShifts.length; j++) {
                if (j === si) continue;
                const x = dayShifts[j];
                if (x.start <= testH && x.end > testH && empMatchesRule(activeEmps[x.empIdx], rule.roles)) el++;
              }
              if (el < rule.count && empMatchesRule(activeEmps[e], rule.roles)) { canTrim = false; break; }
            }
            if (canTrim) { s.end--; empHours[e]--; changed = true; }
            else break;
          }
          // Trim start
          while (empHours[e] > weeklyTarget && s.end > s.start + 1) {
            const testH = s.start;
            const rules = (day.rules || []);
            let canTrim = true;
            for (const rule of rules) {
              if (testH < rule.from || testH >= rule.to) continue;
              let el = 0;
              for (let j = 0; j < dayShifts.length; j++) {
                if (j === si) continue;
                const x = dayShifts[j];
                if (x.start <= testH && x.end > testH && empMatchesRule(activeEmps[x.empIdx], rule.roles)) el++;
              }
              if (el < rule.count && empMatchesRule(activeEmps[e], rule.roles)) { canTrim = false; break; }
            }
            if (canTrim) { s.start++; empHours[e]--; changed = true; }
            else break;
          }
          if (s.end <= s.start) {
            dayShifts.splice(si, 1);
            empDaysCount[e]--;
            si--;
          }
        }
      }
    }
    if (!changed) break;
  }

  // ────────────────────────────────────────────
  // Build coverage + warnings
  // ────────────────────────────────────────────
  const coverageByDay = {};
  for (const day of activeDays) {
    const sh = assignments[day.name] || [];
    const cov = [];
    for (let h = day.open; h < day.close; h++) {
      const empIndices = indicesAtHour(sh, h);
      cov.push({ hour: h, count: empIndices.length, empIndices });
    }
    coverageByDay[day.name] = cov;

    for (const rule of (day.rules || [])) {
      const gaps = [];
      for (let h = Math.max(rule.from, day.open); h < Math.min(rule.to, day.close); h++) {
        const c = cov[h - day.open];
        if (!c) { gaps.push(h); continue; }
        let el = 0;
        for (const ei of c.empIndices) {
          if (empMatchesRule(activeEmps[ei], rule.roles)) el++;
        }
        if (el < rule.count) gaps.push(h);
      }
      if (gaps.length) {
        warnings.push(
          `${day.name}: need ${rule.count} [${rule.roles.join('/')}] ` +
          `${fmtTime(rule.from)}–${fmtTime(rule.to)}, gaps at ${gaps.map(fmtTime).join(',')}`
        );
      }
    }
  }

  if (splitShifts.length) {
    const unique = [...new Set(splitShifts.map(s => `${activeEmps[s.empIdx].name} on ${s.day}`))];
    warnings.push(`Split shifts: ${unique.join(', ')}`);
  }

  const off = activeEmps.map((e, i) => ({ name: e.name, hrs: empHours[i] }))
    .filter(e => e.hrs !== weeklyTarget);
  if (off.length) {
    warnings.push('Hours: ' + off.map(e => `${e.name} ${e.hrs}h`).join(', ') + ` (target ${weeklyTarget})`);
  }

  // Recalc days count
  for (let e = 0; e < N; e++) {
    empDaysCount[e] = activeDays.filter(d => assignments[d.name].some(s => s.empIdx === e)).length;
  }

  return { assignments, empHours, empDays: empDaysCount, warnings, coverageByDay, splitShifts };
}

function fmtTime(h) {
  if (h === 0 || h === 24) return '12am';
  if (h === 12) return '12pm';
  return h < 12 ? `${h}am` : `${h - 12}pm`;
}
