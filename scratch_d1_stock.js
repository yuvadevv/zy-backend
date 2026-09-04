async function run() {
  try {
    const url = 'http://127.0.0.1:8787/api/db';
    
    const query = `
      SELECT CASE 
        WHEN 1 = 0 THEN 1 
        ELSE (SELECT 1 UNION ALL SELECT 2) 
      END
    `;
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query })
    });
    const data = await res.json();
    console.log('Result:', data);
  } catch (err) {
    console.error('Error:', err);
  }
}
run();
