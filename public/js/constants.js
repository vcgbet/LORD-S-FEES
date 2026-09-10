/* Shared constants — must match server/fees.js */
const SCHOOL_NAME = "THE LORD'S GREAT ACADEMY";

const DEPARTMENTS = ['NURSERY', 'KINDERGARTEN', 'PRIMARY', 'JHS'];

const CLASSES = [
  'N1', 'N2', 'KG1', 'KG2',
  'Basic 1', 'Basic 2', 'Basic 3', 'Basic 4', 'Basic 5', 'Basic 6', 'Basic 7', 'Basic 8', 'Basic 9',
];

const DEPT_CLASSES = {
  NURSERY: ['N1', 'N2'],
  KINDERGARTEN: ['KG1', 'KG2'],
  PRIMARY: ['Basic 1', 'Basic 2', 'Basic 3', 'Basic 4', 'Basic 5', 'Basic 6'],
  JHS: ['Basic 7', 'Basic 8', 'Basic 9'],
};

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

const FEE_SHORT = {
  registration: 'Reg', form_fee: 'Form', arrears: 'Arrears', pta: 'PTA', gnaps: 'GNAPS',
  maintenance: 'Maint', building_furniture: 'Bldg&Furn', first_aid: '1st Aid',
  sports_culture: 'Sports', utility: 'Utility', teachers_incentive: 'Tchr Inc',
  cola: 'COLA', special_levy: 'Sp Levy', childrens_sp_levy: 'Ch Sp Levy', additional_fee: 'Addl Fee',
};
