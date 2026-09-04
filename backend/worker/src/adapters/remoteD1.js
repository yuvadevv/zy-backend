/**
 * Remote D1 Database Adapter
 * Directly connects to Cloudflare D1 via Cloudflare REST API using Cloudflare API Token.
 * Provides identical interface to Cloudflare Worker env.DB binding (prepare, bind, first, all, run, batch, exec).
 */

export function createRemoteD1({
  accountId = process.env.CLOUDFLARE_ACCOUNT_ID,
  databaseId = process.env.CLOUDFLARE_DATABASE_ID,
  apiToken = process.env.CLOUDFLARE_D1_API_TOKEN
} = {}) {
  const endpoint = `https://api.cloudflare.com/client/v4/accounts/${accountId}/d1/database/${databaseId}/query`;

  async function executeQuery(sql, params = []) {
    console.log(`[D1_QUERY] ${sql} | Params: ${JSON.stringify(params)}`);
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ sql, params })
    });

    const data = await res.json();
    if (!res.ok || !data.success) {
      const errMsg = data.errors?.[0]?.message || `D1 query failed with status ${res.status}`;
      throw new Error(`D1_ERROR: ${errMsg}`);
    }

    return data.result?.[0] || { results: [], success: true, meta: {} };
  }

  class PreparedStatement {
    constructor(queryStr, params = []) {
      this.queryStr = queryStr;
      this.params = params;
    }

    bind(...params) {
      return new PreparedStatement(this.queryStr, params);
    }

    async first(col) {
      const res = await executeQuery(this.queryStr, this.params);
      const row = res.results?.[0] || null;
      if (col && row) {
        return row[col];
      }
      return row;
    }

    async all() {
      const res = await executeQuery(this.queryStr, this.params);
      return {
        results: res.results || [],
        success: res.success ?? true,
        meta: res.meta || {}
      };
    }

    async run() {
      const res = await executeQuery(this.queryStr, this.params);
      return {
        success: res.success ?? true,
        meta: res.meta || {}
      };
    }

    async raw() {
      const res = await executeQuery(this.queryStr, this.params);
      return (res.results || []).map(r => Object.values(r));
    }
  }

  return {
    prepare(sql) {
      return new PreparedStatement(sql);
    },

    async batch(statements) {
      const results = [];
      for (const s of statements) {
        results.push(await executeQuery(s.queryStr, s.params));
      }
      return results.map(r => ({
        results: r?.results || [],
        success: r?.success ?? true,
        meta: r?.meta || {}
      }));
    },

    async exec(sql) {
      return await executeQuery(sql);
    }
  };
}
