// Test OpenSea Stream API using the official SDK
// Usage:
//   OPENSEA_API_KEY=your_key NETWORK=mainnet node scripts/test-stream-sdk.js
//   OPENSEA_API_KEY=your_key NETWORK=testnet node scripts/test-stream-sdk.js

import dotenv from 'dotenv';
dotenv.config();

import { OpenSeaStreamClient } from '@opensea/stream-js';
import WebSocket from 'ws';
import { LocalStorage } from 'node-localstorage';

const apiKey = process.env.OPENSEA_API_KEY;
if (!apiKey) {
  console.error('Missing OPENSEA_API_KEY');
  process.exit(1);
}

const network = (process.env.NETWORK || 'mainnet').toLowerCase();
console.log(`[SDK] Testing OpenSea Stream API with network: ${network}`);
console.log(`[SDK] Using API key: ${apiKey.substring(0, 8)}...`);

// Create client
const client = new OpenSeaStreamClient({
  token: apiKey,
  network: network,
  connectOptions: {
    transport: WebSocket,
    sessionStorage: LocalStorage
  },
  onError: (error) => {
    console.error('[SDK] Error:', error?.message || error);
    if (error?.stack) console.error('[SDK] Stack:', error.stack);
  }
});

console.log('[SDK] Client created, connecting...');

// Connect manually (optional - will auto-connect on first subscription)
client.connect();

// Test subscription to a collection (using wildcard for all collections)
console.log('[SDK] Subscribing to all collections for item_listed events...');

const unsubscribe = client.onItemListed('*', (event) => {
  console.log('[SDK] Event received:', JSON.stringify(event, null, 2));
});

// Keep the script running for 30 seconds to receive events
const timeout = setTimeout(() => {
  console.log('[SDK] Test timeout, disconnecting...');
  unsubscribe();
  client.disconnect(() => {
    console.log('[SDK] Disconnected successfully');
    process.exit(0);
  });
}, 30000);

// Handle Ctrl+C
process.on('SIGINT', () => {
  console.log('\n[SDK] Interrupted, disconnecting...');
  clearTimeout(timeout);
  unsubscribe();
  client.disconnect(() => {
    console.log('[SDK] Disconnected successfully');
    process.exit(0);
  });
});

console.log('[SDK] Listening for events (30 seconds)...');
