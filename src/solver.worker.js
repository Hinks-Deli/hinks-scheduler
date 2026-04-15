import { solve } from './solver';

self.onmessage = (e) => {
  const { dayConfigs, employees, maxPerDay, weeklyTarget } = e.data;
  const result = solve(dayConfigs, employees, maxPerDay, weeklyTarget);
  self.postMessage(result);
};
