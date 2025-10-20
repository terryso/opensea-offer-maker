# Epic 3: NFT Monitoring with OpenSea Stream API - Brownfield Enhancement

## Epic Goal

Enable users to monitor their NFT portfolio in real-time using OpenSea Stream API, receiving instant notifications for sales, transfers, listings, bids, and cancellations for NFTs in their wallet.

## Epic Description

### Existing System Context

**Current relevant functionality:**
- CLI tool with multiple commands (list, offer, auto, check, swap, send, cache, key)
- OpenSeaApi service for REST API interactions with OpenSea v2 API
- Wallet management via keyManager with encrypted private keys
- Multi-chain support (ethereum, base, arbitrum, polygon, ronin, apechain)
- Cache system for storing NFT data locally (Epic 2)
- No real-time monitoring capabilities - all operations are on-demand

**Technology stack:**
- Node.js 16+ ES Modules with ethers.js v6 for blockchain interaction
- Commander.js v12.1.0 for CLI command structure
- OpenSea SDK (opensea-js v8.0.3) for marketplace interactions
- Native fetch API for HTTP requests
- File system (fs/promises) for local data persistence
- Existing services: OpenSeaApi, KeyManager, CacheService

**Integration points:**
- New `monitor` command will use OpenSea Stream API WebSocket connection
- New StreamService will handle WebSocket lifecycle and event subscriptions
- New NotificationService will format and display events to users
- Integration with existing CacheService to track monitored NFTs
- Use existing wallet addresses from KeyManager
- Event data stored in `.cache/events/` directory (gitignored)

### Enhancement Details

**What's being added/changed:**

1. **OpenSea Stream SDK Integration**
   - Install `@opensea/stream-js` npm package
   - Configure WebSocket connection with OpenSea API key authentication
   - Handle connection lifecycle (connect, disconnect, reconnect)
   - Manage subscriptions to event types (item_listed, item_sold, item_transferred, item_received_bid, item_cancelled)

2. **New StreamService** (`src/services/streamService.js`)
   - Initialize OpenSeaStreamClient with API key
   - Subscribe to events by collection slug or account address
   - Support wildcard subscriptions for all collections (*)
   - Handle event delivery and ordering (events may arrive out of order)
   - Implement reconnection logic for connection failures
   - Event filtering by wallet address
   - Follows existing service patterns

3. **New NotificationService** (`src/services/notificationService.js`)
   - Format event data for console display
   - Display event details: type, NFT name, price, from/to addresses, timestamp
   - Support different verbosity levels (minimal, normal, detailed)
   - Log events to file for history (`.cache/events/{walletAddress}_{chain}.jsonl`)
   - Support for future notification channels (webhook, email, etc.)

4. **New Monitor Command** (`src/commands/monitorCommand.js`)
   - `monitor start` - Start monitoring current wallet's NFTs
   - `monitor start --all-collections` - Monitor all collections (wildcard)
   - `monitor start --collections <slug1,slug2>` - Monitor specific collections
   - `monitor history` - Show recent events from log file
   - `monitor stats` - Show monitoring statistics (events received, uptime)
   - Support chain-specific monitoring with `--chain` flag
   - Real-time display with graceful shutdown (Ctrl+C)

5. **Event History Storage**
   - Store events in `.cache/events/{walletAddress}_{chain}.jsonl` (JSON Lines format)
   - Each line is a JSON object with event data and timestamp
   - Support event queries: filter by type, date range, NFT
   - Automatic log rotation (keep last 30 days by default)

**How it integrates:**
- StreamService is a new standalone service with dependency on @opensea/stream-js SDK
- Monitor command uses StreamService, NotificationService, and CacheService (optional)
- No changes to existing commands or services
- Event logs are gitignored, no impact on repository
- WebSocket connection is long-lived but can be stopped gracefully
- Works alongside existing REST API operations

**Success criteria:**
- ✅ Users can start monitoring their wallet NFTs with `monitor start`
- ✅ Real-time events displayed in console as they occur
- ✅ All event types supported: sales, transfers, listings, bids, cancellations
- ✅ Events logged to local file for history and analysis
- ✅ Monitor runs continuously until user stops it (Ctrl+C)
- ✅ Graceful reconnection if WebSocket connection drops
- ✅ Multi-chain support: monitor different chains independently
- ✅ Collection filtering: monitor specific collections or all collections
- ✅ Clear event display with relevant details (price, addresses, etc.)
- ✅ History command shows past events from log file

## Stories

1. **Story 1: Integrate OpenSea Stream SDK and Create StreamService**
   - Add `@opensea/stream-js` to package.json dependencies
   - Create `src/services/streamService.js` with WebSocket lifecycle management
   - Implement OpenSeaStreamClient initialization with API key authentication
   - Implement subscription methods for different event types
   - Add support for collection-specific and wildcard subscriptions
   - Handle connection errors, reconnection logic, and graceful shutdown
   - Implement event filtering by wallet address (events may include other wallets)
   - Add unit tests for StreamService (mocked WebSocket connection)
   - Document OpenSea Stream API requirements and rate limits

2. **Story 2: Create NotificationService and Event Logging**
   - Implement `src/services/notificationService.js` for event formatting
   - Create event display formatters for each event type (sale, transfer, listing, bid, cancel)
   - Implement event logging to `.cache/events/{walletAddress}_{chain}.jsonl`
   - Add log rotation logic (keep last 30 days, configurable via env var)
   - Implement event query methods for history (filter by type, date, NFT)
   - Add verbosity level support (minimal, normal, detailed)
   - Add unit tests for NotificationService
   - Update `.gitignore` to exclude `.cache/events/` directory

3. **Story 3: Implement Monitor Command with Real-Time Display**
   - Create `src/commands/monitorCommand.js` with subcommands
   - Implement `monitor start` with wallet NFT monitoring
   - Add collection filtering options (`--collections`, `--all-collections`)
   - Implement real-time event display loop with graceful shutdown (SIGINT/SIGTERM)
   - Implement `monitor history` to query and display past events
   - Implement `monitor stats` to show monitoring statistics
   - Add chain support with `--chain` flag
   - Add integration test for monitor workflow (mock WebSocket events)
   - Update README.md with monitor command usage examples

## Compatibility Requirements

- ✅ No changes to existing commands (list, offer, auto, check, swap, send, cache, key)
- ✅ New dependency (@opensea/stream-js) is isolated to monitor feature
- ✅ Event logs are local and gitignored
- ✅ Monitor runs in foreground - users control when to start/stop
- ✅ Performance: WebSocket connection is efficient, minimal CPU usage
- ✅ No database or external services required (besides OpenSea Stream API)
- ✅ Works with existing multi-chain and multi-wallet architecture

## Risk Mitigation

**Primary Risk:** OpenSea Stream API connection failures or changes break monitoring

**Mitigation:**
- Implement robust reconnection logic with exponential backoff
- Handle WebSocket errors gracefully with clear error messages
- Monitor is optional feature - core CLI functionality unaffected
- Event data structure is flexible (JSON) - easy to adapt to API changes
- Document OpenSea Stream API dependency and limitations
- Add connection health checks and status reporting

**Rollback Plan:**
- Git revert to restore codebase before monitor feature
- Monitor is optional feature - removal has no impact on core functionality
- Delete `.cache/events/` directory to remove all event logs
- Remove `@opensea/stream-js` dependency
- No migrations needed (event logs are ephemeral data)

**Additional Risks:**
- **Event ordering:** OpenSea Stream API doesn't guarantee order
  - **Mitigation:** Use `event_timestamp` field to sort events for history display
- **High event volume:** Popular collections generate many events
  - **Mitigation:** Implement collection filtering, only show events for user's NFTs
- **API rate limits:** Stream API may have connection limits
  - **Mitigation:** Document limits, implement single connection per wallet/chain
- **Connection drops:** Network issues cause disconnections
  - **Mitigation:** Auto-reconnect with exponential backoff, show connection status
- **Missed events:** Events during disconnection are not re-sent
  - **Mitigation:** Document best-effort delivery, users can check history via REST API

## Definition of Done

- ✅ All stories completed with acceptance criteria met
- ✅ @opensea/stream-js SDK integrated and configured
- ✅ StreamService handles WebSocket lifecycle and subscriptions
- ✅ NotificationService formats and logs events correctly
- ✅ Monitor command supports start, history, stats subcommands
- ✅ Real-time event display working with graceful shutdown
- ✅ Event logging to JSONL files with rotation
- ✅ Collection filtering and wildcard subscriptions working
- ✅ Multi-chain support verified (test on ethereum and base)
- ✅ Reconnection logic tested (simulate connection drops)
- ✅ Unit tests added for StreamService and NotificationService (>80% coverage)
- ✅ Integration test covers monitor start → receive events → graceful shutdown flow
- ✅ No regression in other commands (run full test suite)
- ✅ README and documentation updated with monitor examples
- ✅ Code review confirms pattern consistency with existing services
- ✅ Manual testing on testnet (Sepolia) successful with live events

---

## Validation Checklist ✅

**Scope Validation:**
- ✅ Epic can be completed in 3 stories maximum
- ✅ No architectural changes required (follows existing service + command pattern)
- ✅ Enhancement follows existing patterns (service-based architecture)
- ✅ Integration complexity is manageable (isolated to monitor feature)

**Risk Assessment:**
- ✅ Risk to existing system is low (monitor is optional, no changes to other commands)
- ✅ Rollback plan is feasible (git revert, remove dependency)
- ✅ Testing approach covers existing functionality (full test suite)
- ✅ Team has sufficient knowledge (similar to OpenSeaApi patterns)

**Completeness Check:**
- ✅ Epic goal is clear and achievable
- ✅ Stories are properly scoped (SDK integration → services → command)
- ✅ Success criteria are measurable
- ✅ Dependencies identified (OpenSea Stream API, @opensea/stream-js SDK)

## OpenSea Stream API Research

Based on OpenSea Stream API documentation and SDK, the following capabilities will be used:

### Connection Setup
```javascript
import { OpenSeaStreamClient } from '@opensea/stream-js';
import { WebSocket } from 'ws';

const client = new OpenSeaStreamClient({
  token: process.env.OPENSEA_API_KEY,
  network: 'mainnet', // or 'testnet' for Sepolia
  connectOptions: {
    transport: WebSocket
  }
});
```

### Event Types and Subscriptions

**Available Event Types:**
1. **item_listed** - NFT is listed for sale
2. **item_sold** - NFT is sold
3. **item_transferred** - NFT ownership transferred
4. **item_received_bid** - NFT receives a new bid/offer
5. **item_cancelled** - Listing or bid is cancelled
6. **item_metadata_updated** - NFT metadata changes (optional)

**Subscription Methods:**
```javascript
// Subscribe to specific collection
client.onItemListed('collection-slug', (event) => {
  console.log(event);
});

// Subscribe to all collections (wildcard)
client.onItemSold('*', (event) => {
  console.log(event);
});

// Multiple event types
client.onEvents('collection-slug',
  ['item_listed', 'item_sold', 'item_transferred'],
  (event) => {
    console.log(event);
  }
);
```

### Event Payload Structure
```json
{
  "event_type": "item_sold",
  "event_timestamp": "2024-01-01T12:00:00.000Z",
  "payload": {
    "item": {
      "nft_id": "ethereum/0x.../123",
      "metadata": {
        "name": "NFT Name",
        "image_url": "https://..."
      }
    },
    "collection": {
      "slug": "collection-slug"
    },
    "sale_price": "1000000000000000000",
    "from_account": {
      "address": "0x..."
    },
    "to_account": {
      "address": "0x..."
    }
  }
}
```

### Important Considerations

1. **Event Ordering:** Events may arrive out of order - use `event_timestamp` for sorting
2. **Best-Effort Delivery:** Missed events during disconnection are not re-sent
3. **Authentication:** Requires valid OpenSea API key
4. **Rate Limits:** Connection limits may apply (to be documented)
5. **Network Support:** Mainnet (ethereum, polygon, etc.) and Testnet (Sepolia)
6. **Filtering:** Events include all activity - filter by wallet address on client side

### Monitor Event Data Structure (Logged)
```json
{
  "eventType": "item_sold",
  "timestamp": "2024-01-01T12:00:00.000Z",
  "chain": "ethereum",
  "nft": {
    "contract": "0x...",
    "tokenId": "123",
    "name": "NFT Name",
    "collectionSlug": "collection-slug"
  },
  "sale": {
    "price": "1.0",
    "currency": "ETH",
    "fromAddress": "0x...",
    "toAddress": "0x..."
  },
  "relevantToWallet": "0x...",
  "raw": { /* original event payload */ }
}
```

### Configuration (Environment Variables)
```bash
# Required for Stream API
OPENSEA_API_KEY=your_api_key

# Optional configuration
MONITOR_LOG_RETENTION_DAYS=30  # Event log retention
MONITOR_RECONNECT_MAX_DELAY=60000  # Max reconnect delay (ms)
MONITOR_VERBOSITY=normal  # minimal, normal, detailed
```
