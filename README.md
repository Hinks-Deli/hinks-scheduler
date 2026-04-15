# Restaurant Staff Scheduler

A role-based staff scheduling tool for restaurants. Configure employees, roles, operating hours, and coverage rules — the solver generates an optimized weekly schedule.

## Features

- **Multi-role employees** — Staff can hold multiple roles (Chef, FOH, Mix, etc.)
- **OR-logic coverage rules** — "Need 2 of [Chef or Mix] from 10am–12pm"
- **Multi-pass solver** — Prioritizes hard days, minimizes overstaffing, avoids split shifts
- **Visual timeline** — See coverage heatmaps and shift bars at a glance
- **Persistent config** — Saves your setup to localStorage
- **Copy days** — Duplicate a day's config to others in one click

## Project Structure

```
restaurant-scheduler/
├── public/
│   └── index.html          # HTML shell
├── src/
│   ├── App.jsx             # Main React app (UI + state)
│   ├── solver.js           # Scheduling algorithm (JS)
│   ├── config.js           # Default configuration
│   ├── components/
│   │   ├── ConfigPanel.jsx # Configuration UI (roles, staff, days)
│   │   ├── Timeline.jsx    # Visual schedule timeline
│   │   ├── StatsBar.jsx    # Employee hour summary cards
│   │   ├── ScheduleTable.jsx # Tabular schedule view
│   │   └── ui.jsx          # Shared small components
│   └── styles.css          # All styles
├── python/
│   ├── solver.py           # Python solver (same algorithm)
│   ├── config.json         # Sample configuration
│   └── run.py              # CLI entry point
├── package.json
└── README.md
```

## Quick Start — Web App

```bash
npm install
npm run dev
```

Open http://localhost:5173

## Quick Start — Python CLI

```bash
cd python
python run.py                    # Uses default config.json
python run.py --config my.json   # Uses custom config
python run.py --output schedule.json  # Exports schedule
```

## Deploy to GitHub Pages

```bash
npm run build
# Push the `dist/` folder to your gh-pages branch
# Or use: npx gh-pages -d dist
```

## Configuration

### Roles
Define roles like `Chef`, `FOH`, `Mix`, `Cleaner`. The special role `Any` matches all employees.

### Employees
Each employee has a name, one or more roles, and an active/inactive toggle.

### Days
Each operating day has:
- **Open/Close times** (any range from 12am to 12am)
- **Coverage rules**: "Need N staff with [role set] from H1 to H2"

### Global Settings
- **Max hours/day**: Maximum shift length per employee (default 8)
- **Weekly target**: Target hours per employee per week (default 40)

## Solver Algorithm

The scheduler uses a 4-pass algorithm:

1. **Demand Analysis** — Calculates exact staffing needs per hour per day
2. **Minimal Assignment** — Assigns minimum staff needed, hardest days first
3. **Hour Balancing** — Extends/adds shifts to hit weekly targets
4. **Split Shift Repair** — Fills remaining gaps with split shifts (last resort)
