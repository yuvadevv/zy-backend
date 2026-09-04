const fetch = require('node-fetch');

async function testApi() {
  const url = 'http://localhost:8500/api/admin/manuals/m_ds_v1';
  const data = {
    title: 'Data Structures Lab Manual',
    stock: 50
  };

  const response = await fetch(url, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      // Note: testing if the worker ignores it because no auth is provided, but since we are running locally, I'll mock a token if needed, wait, the worker uses context.admin.id! So I might need a JWT.
      // Wait, let's just look at the worker code for how it handles auth.
    },
    body: JSON.stringify(data)
  });
  
  const text = await response.text();
  console.log(response.status, text);
}

testApi();
