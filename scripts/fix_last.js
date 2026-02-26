const fs = require('fs');
let c = fs.readFileSync('e:/stock_an/stock-picker-latest/frontend/src/pages/Home.tsx', 'utf8');
c = c.replace('>????</div>', '>累计入选</div>');
fs.writeFileSync('e:/stock_an/stock-picker-latest/frontend/src/pages/Home.tsx', c, 'utf8');
const rem = (c.match(/\?{3,}/g) || []);
console.log('Remaining ???+ runs: ' + rem.length);
const rem2 = (c.match(/\uFFFD/g) || []);
console.log('Remaining replacement chars: ' + rem2.length);
