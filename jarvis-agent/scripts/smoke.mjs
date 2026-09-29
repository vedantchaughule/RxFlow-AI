import { parseLocalIntent } from '../dist/parser.js';
const cases = [
  ['How many patients are remaining?', 'queue'],
  ['Open patient RXF-ABC123', 'patient_lookup'],
  ['Search paracetamol 500 mg in inventory', 'inventory_search'],
  ['Show low-stock medicines', 'low_stock'],
  ['Add paracetamol 500 mg twice daily for five days after food', 'prescription_draft'],
];
for (const [message, kind] of cases) {
  const actual = parseLocalIntent(message).kind;
  if (actual !== kind) throw new Error(`${message}: expected ${kind}, got ${actual}`);
}
console.log(`Jarvis smoke passed: ${cases.length}/${cases.length}`);
