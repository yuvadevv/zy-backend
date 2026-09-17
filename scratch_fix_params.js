import fs from 'node:fs';
import path from 'node:path';

const routesDir = 'c:\\Users\\SAI\\Documents\\yuvadev-zy\\zy-backend\\backend\\worker\\src\\routes';
const files = fs.readdirSync(routesDir).filter(f => f.endsWith('.js'));

for (const file of files) {
  const filePath = path.join(routesDir, file);
  let content = fs.readFileSync(filePath, 'utf8');
  let originalContent = content;

  // Replace ctx.params with req.params
  content = content.replace(/ctx\.params/g, 'req.params');
  
  // Replace context.params with request.params
  content = content.replace(/context\.params/g, 'request.params');

  if (content !== originalContent) {
    fs.writeFileSync(filePath, content, 'utf8');
    console.log(`Updated ${file}`);
  }
}
