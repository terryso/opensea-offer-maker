# Epic 1: Relay API Token Swap - Brownfield Enhancement

## Epic Goal

Enable users to swap arbitrary tokens across multiple chains using Relay API, matching OpenSea.io's token swap capabilities and replacing the limited ETH/WETH-only swap functionality.

## Epic Description

### Existing System Context

**Current relevant functionality:**
- `swap` command currently supports only ETH ↔ WETH conversion via direct WETH contract interaction
- Users must manually wrap/unwrap ETH to obtain WETH for OpenSea offers
- Limited to single token pair on each supported chain (Ethereum, Base, Sepolia)

**Technology stack:**
- Node.js ES Modules with ethers.js v6 for blockchain interaction
- Commander.js for CLI command structure
- Service layer pattern (OpenSeaApi, ReservoirApi) for external API integration
- Native fetch API for HTTP requests with retry logic (3 retries, 1s delay)

**Integration points:**
- New RelayApi service will follow existing API service patterns (OpenSeaApi, ReservoirApi)
- SwapCommand will be refactored to use RelayApi instead of direct WETH contract calls
- Wallet management via existing CommandUtils (getWallet, validateChain)
- Logging via existing Logger utility

### Enhancement Details

**What's being added/changed:**

1. **New RelayApi Service** (`src/services/relayApi.js`)
   - Quote generation for token swaps
   - Execute swap transactions via Relay
   - Token price lookup and validation
   - Chain-aware API URL selection
   - Follows existing retry/error handling patterns

2. **Enhanced SwapCommand** (`src/commands/swapCommand.js`)
   - Support arbitrary token-to-token swaps (e.g., USDC → ETH, WETH → DAI)
   - Token search by symbol or contract address
   - Cross-chain swap support (if Relay supports)
   - Maintain backward compatibility with eth2weth/weth2eth shortcuts
   - Improved UX with token selection and swap preview

3. **Documentation Updates**
   - README.md with new swap command examples
   - Architecture documentation for RelayApi integration

**How it integrates:**
- RelayApi follows same service pattern as OpenSeaApi/ReservoirApi
- Uses existing wallet management, chain config, and logging infrastructure
- SwapCommand maintains existing CLI interface, adds new token options
- No changes required to other commands (offer, auto, check, list, send, key)

**Success criteria:**
- ✅ Users can swap any supported token pair (not just ETH/WETH)
- ✅ Swap quotes show accurate exchange rates and fees
- ✅ Cross-chain swaps work where Relay supports them
- ✅ Existing eth2weth/weth2eth functionality preserved
- ✅ Error handling matches existing service quality (retry logic, clear errors)
- ✅ Zero impact on other commands (offer, auto, check, etc.)

## Stories

1. **Story 1: Create RelayApi Service**
   - Implement `src/services/relayApi.js` following OpenSeaApi/ReservoirApi patterns
   - Add quote generation endpoint integration
   - Add swap execution endpoint integration
   - Implement token search/lookup functionality
   - Add comprehensive unit tests with mocked API responses
   - Document Relay API configuration in external-apis.md

2. **Story 2: Enhance SwapCommand for Token Swaps**
   - Refactor SwapCommand to use RelayApi instead of direct WETH contract
   - Add token selection options (--from-token, --to-token)
   - Maintain backward compatibility for eth2weth/weth2eth shortcuts
   - Add swap preview showing exchange rate, fees, and estimated output
   - Implement transaction confirmation flow
   - Add unit tests for command logic

3. **Story 3: Documentation and Integration Testing**
   - Update README.md with new swap examples (token pairs, cross-chain)
   - Add architecture documentation for RelayApi integration
   - Create integration test for full swap flow
   - Test backward compatibility scenarios (existing eth2weth/weth2eth)
   - Verify no regression in other commands

## Compatibility Requirements

- ✅ Existing swap command shortcuts (eth2weth/weth2eth) remain unchanged
- ✅ No changes to other commands (offer, auto, check, list, send, key)
- ✅ Existing CommandUtils, Logger, KeyManager APIs unchanged
- ✅ No database/state management changes (stateless CLI)
- ✅ Performance: Relay API latency only affects swap command
- ✅ New dependency: Relay API integration (research required for SDK vs REST)

## Risk Mitigation

**Primary Risk:** Relay API changes or becomes unavailable, breaking swap functionality

**Mitigation:**
- Implement robust error handling with clear user messages
- Maintain fallback to direct WETH contract for eth2weth/weth2eth
- Follow existing retry logic pattern (3 retries, 1s delay)
- Add API health check before swap attempts
- Document Relay API dependency and alternatives in architecture docs

**Rollback Plan:**
- Git revert to restore original swap command
- Original SwapCommand code is isolated, no other modules affected
- No data persistence means no migration concerns
- Users can immediately return to eth2weth/weth2eth functionality

**Additional Risks:**
- **Token address validation:** Mitigate with ethers.js address validation + Relay API verification
- **Slippage/price volatility:** Show clear warnings, allow user-configurable slippage tolerance
- **Gas estimation errors:** Use existing gas estimation patterns from SendCommand

## Definition of Done

- ✅ All stories completed with acceptance criteria met
- ✅ Swap command supports arbitrary token pairs via Relay API
- ✅ Backward compatibility verified: eth2weth/weth2eth still works
- ✅ Unit tests added for RelayApi service (>80% coverage)
- ✅ Integration test covers full swap flow
- ✅ No regression in other commands (run full test suite)
- ✅ README and architecture docs updated
- ✅ Code review confirms pattern consistency with existing services
- ✅ Manual testing on testnet (Sepolia) successful

---

## Validation Checklist ✅

**Scope Validation:**
- ✅ Epic can be completed in 3 stories maximum
- ✅ No architectural changes required (follows existing service pattern)
- ✅ Enhancement follows existing patterns (API service + command)
- ✅ Integration complexity is manageable (isolated to swap feature)

**Risk Assessment:**
- ✅ Risk to existing system is low (swap command isolated)
- ✅ Rollback plan is feasible (git revert, no migrations)
- ✅ Testing approach covers existing functionality (full test suite)
- ✅ Team has sufficient knowledge (same patterns as OpenSeaApi/ReservoirApi)

**Completeness Check:**
- ✅ Epic goal is clear and achievable
- ✅ Stories are properly scoped (service → command → docs)
- ✅ Success criteria are measurable
- ✅ Dependencies identified (Relay API research needed)

## Relay API Research

Based on initial research, the following Relay APIs will be relevant for implementing the swap functionality:

- **Get Quote API**: This will be the primary API to get quotes for token swaps. It provides a unified interface for bridging, swapping, and calling.
- **Swap Multi-Input API**: `POST https://api.relay.link/execute/swap/multi-input`. This is the main endpoint for executing a swap from multiple origin chains to a single destination chain.
- **Status API**: There are endpoints for checking the status of a transaction.
- **Chains and Currencies API**: Endpoints to retrieve information about supported chains and currencies.
- **Testnet API**: The testnet is available at `https://api.testnets.relay.link`. This will be used for integration testing.
