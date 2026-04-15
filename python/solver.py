"""
Restaurant Schedule Solver — Python Implementation

Same 4-pass algorithm as the JavaScript frontend:
  1. Demand Analysis
  2. Minimal Assignment (hardest days first)
  3. Hour Balancing
  4. Split Shift Repair

Usage:
  from solver import solve
  result = solve(days, employees, max_per_day=8, weekly_target=40)
"""

from typing import List, Dict, Any, Optional
from dataclasses import dataclass, field
import json


@dataclass
class Employee:
    name: str
    roles: List[str]
    active: bool = True


@dataclass
class Rule:
    roles: List[str]
    count: int
    from_hour: int
    to_hour: int


@dataclass
class Day:
    name: str
    open: int
    close: int
    enabled: bool
    rules: List[Rule]


@dataclass
class Shift:
    emp_idx: int
    start: int
    end: int


def emp_matches_rule(emp: Employee, rule_roles: List[str]) -> bool:
    if "Any" in rule_roles:
        return True
    return any(r in rule_roles for r in emp.roles)


def fmt_time(h: int) -> str:
    if h in (0, 24):
        return "12am"
    if h == 12:
        return "12pm"
    return f"{h}am" if h < 12 else f"{h-12}pm"


def solve(
    days: List[Day],
    employees: List[Employee],
    max_per_day: int = 8,
    weekly_target: int = 40,
) -> Dict[str, Any]:
    active_days = [d for d in days if d.enabled and d.close > d.open]
    active_emps = [e for e in employees if e.active]
    n = len(active_emps)

    if not n or not active_days:
        return {
            "assignments": {},
            "emp_hours": [],
            "emp_days": [],
            "warnings": [],
            "coverage": {},
            "split_shifts": [],
        }

    emp_hours = [0] * n
    emp_days_count = [0] * n
    assignments: Dict[str, List[Shift]] = {d.name: [] for d in active_days}
    warnings = []
    split_shifts = []

    # ── PASS 1: Build demand seats ──
    day_demand = {}
    for day in active_days:
        seats = []
        for rule in day.rules:
            fr = max(rule.from_hour, day.open)
            to = min(rule.to_hour, day.close)
            if to <= fr:
                continue
            for _ in range(rule.count):
                total_hours = to - fr
                if total_hours <= max_per_day:
                    seats.append({
                        "roles": list(rule.roles),
                        "from": fr, "to": to, "hours": total_hours,
                    })
                else:
                    # Split into staggered chunks
                    num_chunks = -(-total_hours // max_per_day)  # ceil division
                    stride = (total_hours - max_per_day) / max(num_chunks - 1, 1)
                    for ch in range(num_chunks):
                        cs = round(fr + ch * stride)
                        ce = min(cs + max_per_day, to)
                        if ce - cs > 0:
                            seats.append({
                                "roles": list(rule.roles),
                                "from": cs, "to": ce, "hours": ce - cs,
                            })
        seats.sort(key=lambda s: (-s["hours"], s["from"]))
        day_demand[day.name] = seats

    # ── PASS 2: Minimal assignment (hardest days first) ──
    day_order = sorted(
        active_days,
        key=lambda d: sum(s["hours"] for s in day_demand.get(d.name, [])),
        reverse=True,
    )

    for day in day_order:
        seats = day_demand.get(day.name, [])
        today_assigned: Dict[int, Dict] = {}  # emp_idx -> {start, end}

        for seat in seats:
            candidates = []
            for i, emp in enumerate(active_emps):
                if not emp_matches_rule(emp, seat["roles"]):
                    continue

                existing = today_assigned.get(i)
                if existing:
                    ns = min(existing["start"], seat["from"])
                    ne = max(existing["end"], seat["to"])
                    if ne - ns > max_per_day:
                        continue
                    if seat["from"] > existing["end"] or seat["to"] < existing["start"]:
                        continue
                else:
                    if seat["hours"] > max_per_day:
                        continue
                    if emp_hours[i] + seat["hours"] > weekly_target + 4:
                        continue

                # Score: exact match, extend preference, hours remaining
                exact = 0 if (
                    "Any" not in seat["roles"]
                    and any(r in seat["roles"] for r in emp.roles)
                ) else 1
                ext = 0 if i in today_assigned else 1
                remaining = weekly_target - emp_hours[i]
                candidates.append((exact, ext, -remaining, i))

            if not candidates:
                continue

            candidates.sort()
            pick_idx = candidates[0][3]
            existing = today_assigned.get(pick_idx)

            if existing:
                old_len = existing["end"] - existing["start"]
                existing["start"] = min(existing["start"], seat["from"])
                existing["end"] = max(existing["end"], seat["to"])
                emp_hours[pick_idx] += (existing["end"] - existing["start"]) - old_len
            else:
                today_assigned[pick_idx] = {"start": seat["from"], "end": seat["to"]}
                emp_hours[pick_idx] += seat["hours"]
                emp_days_count[pick_idx] += 1

        for emp_idx, shift in today_assigned.items():
            assignments[day.name].append(
                Shift(emp_idx=emp_idx, start=shift["start"], end=shift["end"])
            )

    # ── PASS 3a: Trim over-target ──
    for _ in range(60):
        changed = False
        for e in range(n):
            over = emp_hours[e] - weekly_target
            if over <= 0:
                continue

            best_day = None
            best_len = float("inf")
            best_si = -1
            for day in active_days:
                for si, s in enumerate(assignments[day.name]):
                    if s.emp_idx != e:
                        continue
                    slen = s.end - s.start
                    if slen < best_len:
                        best_len = slen
                        best_day = day
                        best_si = si

            if not best_day:
                continue

            s = assignments[best_day.name][best_si]
            slen = s.end - s.start
            trim = min(over, slen - 1)
            if trim <= 0:
                continue

            start_rules = [r for r in best_day.rules if s.start >= r.from_hour and s.start < r.to_hour]
            end_rules = [r for r in best_day.rules if (s.end - 1) >= r.from_hour and (s.end - 1) < r.to_hour]

            if len(end_rules) <= len(start_rules):
                s.end -= trim
            else:
                s.start += trim
            emp_hours[e] -= trim

            if s.end <= s.start:
                assignments[best_day.name].pop(best_si)
                emp_days_count[e] -= 1
            changed = True

        if not changed:
            break

    # ── PASS 3b: Extend under-target ──
    for _ in range(80):
        changed = False
        worst_e, worst_def = -1, 0
        for e in range(n):
            deficit = weekly_target - emp_hours[e]
            if deficit > worst_def:
                worst_def = deficit
                worst_e = e

        if worst_e == -1 or worst_def <= 0:
            break

        e = worst_e
        needed = worst_def

        # Try extending existing shift
        extended = False
        for day in active_days:
            si = next((i for i, s in enumerate(assignments[day.name]) if s.emp_idx == e), None)
            if si is None:
                continue
            s = assignments[day.name][si]
            slen = s.end - s.start
            can_add = min(needed, max_per_day - slen)
            if can_add <= 0:
                continue

            ext_start = min(can_add, s.start - day.open)
            if ext_start > 0:
                s.start -= ext_start
                emp_hours[e] += ext_start
                changed = extended = True
                break

            ext_end = min(can_add, day.close - s.end)
            if ext_end > 0:
                s.end += ext_end
                emp_hours[e] += ext_end
                changed = extended = True
                break

        if not extended:
            # Add to unworked day with most gaps
            unworked = [
                d for d in active_days
                if not any(s.emp_idx == e for s in assignments[d.name])
            ]

            best_day, best_score = None, -1
            for day in unworked:
                add_hrs = min(needed, max_per_day, day.close - day.open)
                if add_hrs < 1:
                    continue
                gaps = 0
                shifts = assignments[day.name]
                for rule in day.rules:
                    for h in range(max(rule.from_hour, day.open), min(rule.to_hour, day.close)):
                        ppl = [s for s in shifts if s.start <= h < s.end]
                        elig = sum(1 for s in ppl if emp_matches_rule(active_emps[s.emp_idx], rule.roles))
                        if elig < rule.count and emp_matches_rule(active_emps[e], rule.roles):
                            gaps += 1
                if gaps > best_score:
                    best_score = gaps
                    best_day = day

            if best_day:
                add_hrs = min(needed, max_per_day, best_day.close - best_day.open)
                best_start, best_gap_cover = best_day.open, 0
                for start in range(best_day.open, best_day.close - add_hrs + 1):
                    gap_cover = 0
                    for h in range(start, start + add_hrs):
                        shifts = assignments[best_day.name]
                        ppl = [s for s in shifts if s.start <= h < s.end]
                        for rule in best_day.rules:
                            if h < rule.from_hour or h >= rule.to_hour:
                                continue
                            elig = sum(1 for s in ppl if emp_matches_rule(active_emps[s.emp_idx], rule.roles))
                            if elig < rule.count and emp_matches_rule(active_emps[e], rule.roles):
                                gap_cover += 1
                    if gap_cover > best_gap_cover:
                        best_gap_cover = gap_cover
                        best_start = start

                assignments[best_day.name].append(Shift(e, best_start, best_start + add_hrs))
                emp_hours[e] += add_hrs
                emp_days_count[e] += 1
                changed = True

        if not changed:
            break

    # ── PASS 4: Split shift repair ──
    for day in active_days:
        for rule in day.rules:
            for h in range(max(rule.from_hour, day.open), min(rule.to_hour, day.close)):
                shifts = assignments[day.name]
                ppl = [s for s in shifts if s.start <= h < s.end]
                elig = sum(1 for s in ppl if emp_matches_rule(active_emps[s.emp_idx], rule.roles))
                if elig >= rule.count:
                    continue

                for e in range(n):
                    if not emp_matches_rule(active_emps[e], rule.roles):
                        continue
                    on_today = [s for s in shifts if s.emp_idx == e]
                    today_hrs = sum(s.end - s.start for s in on_today)

                    if not on_today:
                        if emp_hours[e] >= weekly_target + 2:
                            continue
                        gs, ge = h, h + 1
                        while gs > day.open:
                            pp = [s for s in shifts if s.start <= (gs-1) < s.end]
                            el = sum(1 for s in pp if emp_matches_rule(active_emps[s.emp_idx], rule.roles))
                            if el < rule.count and (ge - gs + 1) <= max_per_day:
                                gs -= 1
                            else:
                                break
                        while ge < day.close:
                            pp = [s for s in shifts if s.start <= ge < s.end]
                            el = sum(1 for s in pp if emp_matches_rule(active_emps[s.emp_idx], rule.roles))
                            if el < rule.count and (ge + 1 - gs) <= max_per_day:
                                ge += 1
                            else:
                                break
                        sl = ge - gs
                        if sl > max_per_day or emp_hours[e] + sl > weekly_target + 4:
                            continue
                        assignments[day.name].append(Shift(e, gs, ge))
                        emp_hours[e] += sl
                        emp_days_count[e] += 1
                        break

                    if len(on_today) >= 2:
                        continue
                    if today_hrs + 1 > max_per_day or emp_hours[e] >= weekly_target + 2:
                        continue

                    existing = on_today[0]
                    if existing.start <= h < existing.end:
                        continue

                    ext_len = max(existing.end, h + 1) - min(existing.start, h)
                    if ext_len <= max_per_day:
                        old_len = existing.end - existing.start
                        existing.start = min(existing.start, h)
                        existing.end = max(existing.end, h + 1)
                        emp_hours[e] += (existing.end - existing.start) - old_len
                        break

                    split_len = min(2, max_per_day - today_hrs, day.close - h)
                    if split_len < 1:
                        continue
                    assignments[day.name].append(Shift(e, h, h + split_len))
                    emp_hours[e] += split_len
                    split_shifts.append({"emp_idx": e, "day": day.name})
                    break

    # ── Final trim ──
    for _ in range(30):
        changed = False
        for e in range(n):
            if emp_hours[e] <= weekly_target:
                continue
            for day in active_days:
                my_shifts = [s for s in assignments[day.name] if s.emp_idx == e]
                for s in my_shifts:
                    while emp_hours[e] > weekly_target and s.end > s.start + 1:
                        test_h = s.end - 1
                        others = [x for x in assignments[day.name] if x is not s and x.start <= test_h < x.end]
                        rules = [r for r in day.rules if r.from_hour <= test_h < r.to_hour]
                        can_trim = all(
                            sum(1 for x in others if emp_matches_rule(active_emps[x.emp_idx], r.roles)) >= r.count
                            or not emp_matches_rule(active_emps[e], r.roles)
                            for r in rules
                        )
                        if can_trim:
                            s.end -= 1
                            emp_hours[e] -= 1
                            changed = True
                        else:
                            break
                    while emp_hours[e] > weekly_target and s.end > s.start + 1:
                        test_h = s.start
                        others = [x for x in assignments[day.name] if x is not s and x.start <= test_h < x.end]
                        rules = [r for r in day.rules if r.from_hour <= test_h < r.to_hour]
                        can_trim = all(
                            sum(1 for x in others if emp_matches_rule(active_emps[x.emp_idx], r.roles)) >= r.count
                            or not emp_matches_rule(active_emps[e], r.roles)
                            for r in rules
                        )
                        if can_trim:
                            s.start += 1
                            emp_hours[e] -= 1
                            changed = True
                        else:
                            break
                    if s.end <= s.start:
                        assignments[day.name].remove(s)
                        emp_days_count[e] -= 1
        if not changed:
            break

    # ── Build coverage + warnings ──
    coverage = {}
    for day in active_days:
        shifts = assignments[day.name]
        cov = []
        for h in range(day.open, day.close):
            ppl = [s for s in shifts if s.start <= h < s.end]
            cov.append({"hour": h, "count": len(ppl), "emp_indices": [s.emp_idx for s in ppl]})
        coverage[day.name] = cov

        for rule in day.rules:
            gaps = []
            for h in range(max(rule.from_hour, day.open), min(rule.to_hour, day.close)):
                c = next((x for x in cov if x["hour"] == h), None)
                if not c:
                    gaps.append(h)
                    continue
                elig = sum(
                    1 for ei in c["emp_indices"]
                    if emp_matches_rule(active_emps[ei], rule.roles)
                )
                if elig < rule.count:
                    gaps.append(h)
            if gaps:
                role_str = "/".join(rule.roles)
                gap_str = ",".join(fmt_time(h) for h in gaps)
                warnings.append(
                    f"{day.name}: need {rule.count} [{role_str}] "
                    f"{fmt_time(rule.from_hour)}–{fmt_time(rule.to_hour)}, gaps at {gap_str}"
                )

    if split_shifts:
        unique = list(set(f"{active_emps[s['emp_idx']].name} on {s['day']}" for s in split_shifts))
        warnings.append(f"Split shifts: {', '.join(unique)}")

    off = [(e.name, emp_hours[i]) for i, e in enumerate(active_emps) if emp_hours[i] != weekly_target]
    if off:
        parts = ", ".join(f"{name} {hrs}h" for name, hrs in off)
        warnings.append(f"Hours: {parts} (target {weekly_target})")

    for e in range(n):
        emp_days_count[e] = sum(
            1 for d in active_days if any(s.emp_idx == e for s in assignments[d.name])
        )

    # Serialize shifts
    serial_assignments = {
        day_name: [{"emp_idx": s.emp_idx, "start": s.start, "end": s.end} for s in shifts]
        for day_name, shifts in assignments.items()
    }

    return {
        "assignments": serial_assignments,
        "emp_hours": emp_hours,
        "emp_days": emp_days_count,
        "warnings": warnings,
        "coverage": coverage,
        "split_shifts": split_shifts,
    }


def parse_config(config: dict) -> tuple:
    """Parse a JSON config dict into solver inputs."""
    employees = [
        Employee(name=e["name"], roles=e["roles"], active=e.get("active", True))
        for e in config["employees"]
    ]
    days = [
        Day(
            name=d["name"],
            open=d["open"],
            close=d["close"],
            enabled=d.get("enabled", True),
            rules=[
                Rule(roles=r["roles"], count=r["count"], from_hour=r["from"], to_hour=r["to"])
                for r in d.get("rules", [])
            ],
        )
        for d in config["days"]
    ]
    max_per_day = config.get("maxPerDay", 8)
    weekly_target = config.get("weeklyTarget", 40)
    return days, employees, max_per_day, weekly_target
