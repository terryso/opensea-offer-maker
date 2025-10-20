// Minimal WS handshake test for OpenSea Stream API (without SDK)
// Usage:
//   OPENSEA_API_KEY=your_key NETWORK=mainnet node scripts/test-stream-ws.js
//   OPENSEA_API_KEY=your_key NETWORK=testnet node scripts/test-stream-ws.js
// Optional:
//   WS_PROXY=http://127.0.0.1:7890  (if you want to force a proxy for WS)

import dotenv from 'dotenv';
dotenv.config();

import WebSocket from 'ws';
import { HttpsProxyAgent } from 'https-proxy-agent';
import dns from 'node:dns';
import { promises as dnsPromises } from 'node:dns';

const apiKey = process.env.OPENSEA_API_KEY;
if (!apiKey) {
  console.error('Missing OPENSEA_API_KEY');
  process.exit(1);
}

const network = (process.env.NETWORK || 'mainnet').toLowerCase();
// Note: OpenSea Stream API uses stream.openseabeta.com, not stream.opensea.io
const host = process.env.HOST || (network === 'testnet' ? 'stream-testnet.opensea.io' : 'stream.openseabeta.com');
let connectHost = host;
let url = `wss://${host}/socket/websocket?token=${encodeURIComponent(apiKey)}&vsn=2.0.0`;

const wsOptions = {
  // Fail fast if handshake takes too long
  handshakeTimeout: parseInt(process.env.WS_HANDSHAKE_TIMEOUT || '15000', 10),
  // Some WS backends enforce Origin checks
  headers: { Origin: 'https://opensea.io' },
  // Ensure TLS SNI matches host even if underlying socket resolves to IP
  servername: host
};
if (process.env.WS_PROXY) {
  // Create proxy agent with TLS configuration
  wsOptions.agent = new HttpsProxyAgent(process.env.WS_PROXY, {
    // TLS options for the connection through the proxy
    rejectUnauthorized: process.env.NODE_TLS_REJECT_UNAUTHORIZED !== '0',
    servername: host,
    // Add socket timeout
    timeout: 15000
  });
  console.log('[Proxy] Using proxy agent with TLS options');
}

console.log(`[Env] NETWORK=${network} HOST=${host} WS_PROXY=${process.env.WS_PROXY || 'none'} FORCE_IP=${process.env.FORCE_IP ? 'on' : 'off'}`);

// DNS diagnostics
try {
  const aRecords = await dnsPromises.resolve4(host);
  console.log(`[DNS] ${host} A: ${aRecords.join(', ')}`);
  if (process.env.FORCE_IP && aRecords.length > 0) {
    connectHost = aRecords[0];
    url = `wss://${connectHost}/socket/websocket?token=${encodeURIComponent(apiKey)}&vsn=2.0.0`;
    // Ensure correct Host header and SNI when connecting via IP
    wsOptions.headers = { ...(wsOptions.headers || {}), Host: host, Origin: 'https://opensea.io' };
    wsOptions.servername = host;
    console.log(`[DNS] FORCE_IP enabled. Using ${connectHost} with Host header=${host}`);
  }
} catch (e) {
  console.log(`[DNS] resolve4 failed for ${host}: ${e.message}`);
}

console.log(`[WS] Connecting to ${url}`);

const ws = new WebSocket(url, [], wsOptions);

ws.on('open', () => {
  console.log('[WS] Opened');
});

ws.on('message', (data) => {
  // Phoenix will send heartbeat and responses; we just show a short preview
  try {
    const text = data.toString();
    console.log('[WS] Message:', text.length > 300 ? text.slice(0, 300) + '...' : text);
  } catch {
    console.log('[WS] Message (binary)');
  }
});

ws.on('error', (err) => {
  console.error('[WS] Error:', err?.message || err);
  if (err?.code) console.error('[WS] Error code:', err.code);
  if (err?.stack) console.error('[WS] Stack:', err.stack);
  if (ws && ws._req) {
    if (ws._req.res) {
      console.error('[WS] HTTP status:', ws._req.res.statusCode);
      console.error('[WS] HTTP headers:', ws._req.res.headers);
    }
    if (ws._req.socket) {
      console.error('[WS] Socket info:', {
        authorized: ws._req.socket.authorized,
        authorizationError: ws._req.socket.authorizationError
      });
    }
  }
});

ws.on('close', (code, reason) => {
  console.log('[WS] Closed:', code, reason?.toString());
});

// Watchdog: if no open/error within 12s, terminate to avoid hanging silently
const watchdogMs = parseInt(process.env.WS_WATCHDOG || '12000', 10);
const watchdog = setTimeout(() => {
  console.error(`[WS] Watchdog: no open/error within ${watchdogMs}ms, terminating.`);
  try { ws.terminate(); } catch {}
}, watchdogMs);

ws.once('open', () => clearTimeout(watchdog));
ws.once('error', () => clearTimeout(watchdog));
