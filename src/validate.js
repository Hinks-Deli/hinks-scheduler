/**
 * Pre-solver constraint validation.
 * Returns an array of { level: 'critical', message: string }.
 */
export function validateConfig(dayConfigs, employees) {
  const warnings = [];
  const seen = new Set();

  const add = (msg) => {
    if (!seen.has(msg)) { seen.add(msg); warnings.push({ level: 'critical', message: msg }); }
  };

  const activeEmps = employees.filter(e => e.active);

  for (const day of dayConfigs) {
    if (!day.enabled) continue;

    for (const rule of day.rules) {
      // Rule fully outside business hours
      const from = Math.max(rule.from, day.open);
      const to = Math.min(rule.to, day.close);
      if (from >= to) {
        add(`${day.name}: rule ${rule.roles.join('/')} ${rule.from}–${rule.to} is outside business hours (${day.open}–${day.close})`);
        continue;
      }

      for (const role of rule.roles) {
        if (role === 'Any') {
          if (rule.count > activeEmps.length) {
            add(`Need ${rule.count} staff but only ${activeEmps.length} active employee${activeEmps.length === 1 ? '' : 's'} exist`);
          }
          continue;
        }

        const capable = activeEmps.filter(e => e.roles.includes(role));
        if (capable.length === 0) {
          add(`No active employees have the "${role}" role`);
        } else if (rule.count > capable.length) {
          add(`Need ${rule.count} "${role}" but only ${capable.length} employee${capable.length === 1 ? '' : 's'} can fill it`);
        }
      }
    }
  }

  return warnings;
}
