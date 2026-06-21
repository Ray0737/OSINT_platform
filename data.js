// OSINT GOTHAM — static intelligence data
// ICBM coordinates sourced from intel_data.js (malmstromInventory, minotInventory, warrenInventory)

function inventoryToSilos(inventory, wingCode) {
  return inventory.map(s => ({
    id: `${wingCode}-${s.name.replace(/\s+/g, '')}`,
    lat: s.lat,
    lng: s.lng,
    wing: wingCode,
    maf: s.name.split('-')[0],
    type: s.name.includes('MAF') ? 'MAF' : 'ICBM_SILO',
    status: 'active',
    label: s.name
  }));
}

// Built from intel_data.js global arrays (loaded before this file)
const ICBM_SILOS = [
  ...inventoryToSilos(malmstromInventory, '341'),  // 341st MW — Malmstrom AFB, MT
  ...inventoryToSilos(minotInventory,     '91'),   // 91st MW  — Minot AFB, ND
  ...inventoryToSilos(warrenInventory,    '90')    // 90th MW  — F.E. Warren AFB, WY/CO/NE
];

// Use the full globalMilIntelligence dataset from intel_data.js
const INSTALLATIONS = globalMilIntelligence;

const STAMP_TYPES = [
  { id:'CONFIRMED',    label:'CONFIRMED',    color:'#a6e3a1' },
  { id:'SUSPECTED',    label:'SUSPECTED',    color:'#f9e2af' },
  { id:'HIGH_VALUE',   label:'HIGH VALUE',   color:'#f38ba8' },
  { id:'SURVEILLANCE', label:'SURVEILLANCE', color:'#cba6f7' },
  { id:'PERSONNEL',    label:'PERSONNEL',    color:'#cdd6f4' },
  { id:'VEHICLE',      label:'VEHICLE',      color:'#89dceb' },
  { id:'SIGINT',       label:'SIGINT',       color:'#89b4fa' },
  { id:'ELINT',        label:'ELINT',        color:'#b4befe' },
  { id:'STRUCTURE',    label:'STRUCTURE',    color:'#fab387' },
  { id:'UNKNOWN',      label:'UNKNOWN',      color:'#6c7086' }
];
