#!/usr/bin/env python3
"""
Restaurant Scheduler CLI

Usage:
  python run.py                          # Use default config.json
  python run.py --config my_config.json  # Use custom config
  python run.py --output schedule.json   # Export result as JSON
"""

import argparse
import json
import sys
from pathlib import Path

from solver import solve, parse_config, fmt_time


def print_schedule(result, employees, days):
    active_emps = [e for e in employees if e.active]
    active_days = [d for d in days if d.enabled]

    print("\n" + "=" * 60)
    print("  RESTAURANT STAFF SCHEDULE")
    print("=" * 60)

    # Warnings
    if result["warnings"]:
        print("\n⚠  Warnings:")
        for w in result["warnings"]:
            print(f"   {w}")

    # Employee summary
    print("\n── Employee Hours ──")
    for i, emp in enumerate(active_emps):
        hrs = result["emp_hours"][i]
        days_on = result["emp_days"][i]
        roles = ", ".join(emp.roles)
        status = "✓" if hrs == 40 else f"({'+'if hrs>40 else ''}{hrs-40}h)"
        print(f"  {emp.name:<10} [{roles:<12}]  {hrs:>2}h / {days_on}d  {status}")

    # Daily schedule
    print("\n── Daily Schedule ──")
    for day in active_days:
        shifts = result["assignments"].get(day.name, [])
        print(f"\n  {day.name} ({fmt_time(day.open)}–{fmt_time(day.close)}):")

        if not shifts:
            print("    (no shifts)")
            continue

        for s in sorted(shifts, key=lambda x: x["start"]):
            emp = active_emps[s["emp_idx"]]
            roles = ",".join(emp.roles)
            hrs = s["end"] - s["start"]
            print(f"    {emp.name:<10} {fmt_time(s['start']):>5}–{fmt_time(s['end']):<5}  ({hrs}h)  [{roles}]")

        # Coverage
        cov = result["coverage"].get(day.name, [])
        if cov:
            counts = [c["count"] for c in cov]
            min_c, max_c = min(counts), max(counts)
            print(f"    Coverage: min={min_c}, max={max_c}")

    print("\n" + "=" * 60)


def main():
    parser = argparse.ArgumentParser(description="Restaurant Staff Scheduler")
    parser.add_argument("--config", default="config.json", help="Path to config JSON file")
    parser.add_argument("--output", help="Export schedule to JSON file")
    args = parser.parse_args()

    config_path = Path(args.config)
    if not config_path.exists():
        print(f"Error: Config file not found: {config_path}")
        sys.exit(1)

    with open(config_path) as f:
        config = json.load(f)

    days, employees, max_per_day, weekly_target = parse_config(config)
    result = solve(days, employees, max_per_day, weekly_target)

    print_schedule(result, employees, days)

    if args.output:
        with open(args.output, "w") as f:
            json.dump(result, f, indent=2)
        print(f"\nSchedule exported to: {args.output}")


if __name__ == "__main__":
    main()
