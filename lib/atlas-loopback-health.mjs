/** Read-only Activepieces health response from one fixed loopback endpoint.
 * No tokens, external DNS, redirects, webhooks, or requests to paid providers.
 * HTTP 2xx is only evidence of an endpoint response; never claim a flow ran.
 */
import { request } from 'node:http';

export async function checkActivepiecesLocalHealth({port = 8080, timeoutMs = 900} = {}) {
  if (!Number.isSafeInteger(port) || port < 1 || port > 65535) return 'INVALID_LOCAL_PORT';
  return await new Promise(resolve => {
    let settled = false;
    function finish(result) {
      if (settled) return;
      settled = true;
      resolve(result);
    }
    const req = request({
      host: '127.0.0.1', port, path: '/api/v1/health', method: 'GET',
      agent: false, headers: { Accept: 'application/json' }
    }, res => {
      const status = res.statusCode ?? 0;
      // Ignore body entirely; it might contain nonpublic operational details.
      res.destroy();
      finish(status >= 200 && status < 300
        ? 'HEALTH_HTTP_2XX_APP_ID_AND_WORKERS_UNVERIFIED'
        : 'HEALTH_HTTP_NON_2XX');
    });
    req.setTimeout(timeoutMs, () => req.destroy(new Error('timeout')));
    req.on('error', () => finish('HEALTH_ENDPOINT_UNREACHABLE'));
    req.end();
  });
}
