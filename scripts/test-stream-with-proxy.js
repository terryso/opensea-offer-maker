// Test OpenSea Stream API with global-agent proxy
// Usage:
//   HTTP_PROXY=http://127.0.0.1:7890 OPENSEA_API_KEY=your_key node scripts/test-stream-with-proxy.js

import dotenv from 'dotenv';
dotenv.config();

// Setup global proxy before any imports
import { bootstrap } from 'global-agent';

const proxyUrl = process.env.HTTP_PROXY || process.env.HTTPS_PROXY;
if (proxyUrl) {
    process.env.GLOBAL_AGENT_HTTP_PROXY = proxyUrl;
    console.log(`[Proxy] Using proxy: ${proxyUrl}`);
}

// Bootstrap global-agent
bootstrap();
console.log('[Proxy] Global agent initialized');

import { OpenSeaStreamClient } from '@opensea/stream-js';
import WebSocket from 'ws';
import { LocalStorage } from 'node-localstorage';

const apiKey = process.env.OPENSEA_API_KEY;
if (!apiKey) {
  console.error('Missing OPENSEA_API_KEY');
  process.exit(1);
}

const network = (process.env.NETWORK || 'mainnet').toLowerCase();
console.log(`[Test] Network: ${network}`);
console.log(`[Test] API Key: ${apiKey.substring(0, 8)}...`);

// Create client
const client = new OpenSeaStreamClient({
  token: apiKey,
  network: network,
  connectOptions: {
    transport: WebSocket,
    sessionStorage: LocalStorage
  },
  onError: (error) => {
    console.error('[Error]', error?.message || error);
  }
});

console.log('[Test] Connecting to OpenSea Stream API...');

// Connect manually
client.connect();

// Subscribe to wildcard collection for item_listed events
console.log('[Test] Subscribing to item_listed events (all collections)...');

const unsubscribe = client.onItemListed('*', (event) => {
  console.log('[Event] Item listed:', {
    collection: event.payload?.collection?.slug,
    nft: event.payload?.item?.nft_id,
    price: event.payload?.base_price
  });
});

// Run for 30 seconds
const timeout = setTimeout(() => {
  console.log('[Test] Timeout reached, disconnecting...');
  unsubscribe();
  client.disconnect(() => {
    console.log('[Test] Disconnected');
    process.exit(0);
  });
}, 30000);

// Handle Ctrl+C
process.on('SIGINT', () => {
  console.log('\n[Test] Interrupted, cleaning up...');
  clearTimeout(timeout);
  unsubscribe();
  client.disconnect(() => {
    console.log('[Test] Disconnected');
    process.exit(0);
  });
});

console.log('[Test] Listening for 30 seconds...');
