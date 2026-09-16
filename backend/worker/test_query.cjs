const { createRemoteD1 } = require('./src/adapters/remoteD1.js');
const fs = require('fs');
const env = {};
fs.readFileSync('../../.env', 'utf8').split('\n').forEach(l => {
  const m = l.match(/^([^=]+)=(.*)$/);
  if (m) env[m[1].trim()] = m[2].trim();
});
const DB = createRemoteD1({
  accountId: env.CLOUDFLARE_ACCOUNT_ID,
  databaseId: env.CLOUDFLARE_DATABASE_ID,
  apiToken: env.CLOUDFLARE_D1_API_TOKEN
});

const query = `
  SELECT o.public_id, o.status, s.name, s.study_year_id, s.branch_id, sec.name as section_name
  FROM orders o
  LEFT JOIN students s ON o.student_id = s.id
  LEFT JOIN sections sec ON s.section = sec.id
  WHERE o.status != 'payment_pending' 
    AND (s.study_year_id = ? AND s.branch_id = ? AND sec.name = ?)
`;
const qParams = ['y_1', 'b_aiml', 'A'];

DB.prepare(query).bind(...qParams).all()
  .then(r => console.log('Orders found:', r.results))
  .catch(console.error);
