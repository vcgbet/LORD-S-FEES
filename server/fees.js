// Shared fee / class / department constants for The Lord's Great Academy fees system.
const FEE_ITEMS = [
  { key: 'registration', label: 'Registration' },
  { key: 'form_fee', label: 'Form' },
  { key: 'arrears', label: 'Arrears' },
  { key: 'pta', label: 'PTA' },
  { key: 'gnaps', label: 'GNAPS' },
  { key: 'maintenance', label: 'Maintenance' },
  { key: 'building_furniture', label: 'Building and Furniture' },
  { key: 'first_aid', label: 'First Aid' },
  { key: 'sports_culture', label: 'Sports and Culture' },
  { key: 'utility', label: 'Utility' },
  { key: 'teachers_incentive', label: "Teacher's Incentive" },
  { key: 'cola', label: 'COLA' },
  { key: 'special_levy', label: 'Special Levy' },
  { key: 'childrens_sp_levy', label: "Children's S.P. Levy" },
  { key: 'additional_fee', label: 'Additional Fee' },
];

const FEE_KEYS = FEE_ITEMS.map((f) => f.key);

const DEPARTMENTS = ['NURSERY', 'KINDERGARTEN', 'PRIMARY', 'JHS'];

const CLASSES = [
  'N1', 'N2', 'KG1', 'KG2',
  'Basic 1', 'Basic 2', 'Basic 3', 'Basic 4', 'Basic 5', 'Basic 6', 'Basic 7', 'Basic 8', 'Basic 9',
];

// Typical class mapping per department (used for smart auto-suggest).
const DEPT_CLASSES = {
  NURSERY: ['N1', 'N2'],
  KINDERGARTEN: ['KG1', 'KG2'],
  PRIMARY: ['Basic 1', 'Basic 2', 'Basic 3', 'Basic 4', 'Basic 5', 'Basic 6'],
  JHS: ['Basic 7', 'Basic 8', 'Basic 9'],
};

function computeTotal(obj) {
  return FEE_KEYS.reduce((s, k) => s + (Number(obj && obj[k]) || 0), 0);
}

module.exports = { FEE_ITEMS, FEE_KEYS, DEPARTMENTS, CLASSES, DEPT_CLASSES, computeTotal };
