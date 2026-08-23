/**
 * Remote R2 Storage Adapter
 * Directly connects to Cloudflare R2 via Cloudflare REST API using Cloudflare API Token.
 * Provides identical interface to Cloudflare Worker env.DOCUMENTS / env.PUBLIC_MEDIA (get, put, delete).
 */

export function createRemoteR2(bucketName, {
  accountId = process.env.CLOUDFLARE_ACCOUNT_ID,
  apiToken = process.env.CLOUDFLARE_R2_API_TOKEN
} = {}) {
  const baseUrl = `https://api.cloudflare.com/client/v4/accounts/${accountId}/r2/buckets/${bucketName}/objects`;

  return {
    async put(key, body, options = {}) {
      const url = `${baseUrl}/${encodeURIComponent(key)}`;
      const headers = {
        'Authorization': `Bearer ${apiToken}`
      };

      if (options.httpMetadata?.contentType) {
        headers['Content-Type'] = options.httpMetadata.contentType;
      }
      if (options.customMetadata) {
        for (const [k, v] of Object.entries(options.customMetadata)) {
          headers[`cf-r2-metadata-${k}`] = String(v);
        }
      }

      let requestBody = body;
      if (body && typeof body.getReader === 'function') {
        const reader = body.getReader();
        const chunks = [];
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          chunks.push(value);
        }
        requestBody = Buffer.concat(chunks.map(c => Buffer.from(c)));
      }

      const res = await fetch(url, {
        method: 'PUT',
        headers,
        body: requestBody
      });

      if (!res.ok) {
        const text = await res.text();
        throw new Error(`R2_PUT_ERROR (${res.status}): ${text}`);
      }

      return { key };
    },

    async get(key, options = {}) {
      const url = `${baseUrl}/${encodeURIComponent(key)}`;
      const headers = {
        'Authorization': `Bearer ${apiToken}`
      };

      if (options.range) {
        headers['Range'] = options.range;
      }

      const res = await fetch(url, { headers });
      if (res.status === 404) return null;

      if (!res.ok) {
        const text = await res.text();
        throw new Error(`R2_GET_ERROR (${res.status}): ${text}`);
      }

      const arrayBuffer = await res.arrayBuffer();
      return {
        body: arrayBuffer,
        arrayBuffer: () => Promise.resolve(arrayBuffer),
        text: () => Promise.resolve(Buffer.from(arrayBuffer).toString('utf-8')),
        httpMetadata: {
          contentType: res.headers.get('content-type')
        }
      };
    },

    async delete(key) {
      const url = `${baseUrl}/${encodeURIComponent(key)}`;
      const res = await fetch(url, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${apiToken}` }
      });
      return res.ok;
    }
  };
}
