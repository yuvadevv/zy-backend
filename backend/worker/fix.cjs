const fs = require('fs');
let content = fs.readFileSync('C:/Users/SAI/Documents/yuvadev-zy/zy-backend/backend/worker/src/services/adminService.js', 'utf-8');
content = content.replace(/\\`/g, '`');
content = content.replace(/\\\$\{/g, '${');
fs.writeFileSync('C:/Users/SAI/Documents/yuvadev-zy/zy-backend/backend/worker/src/services/adminService.js', content);
console.log('Fixed');
