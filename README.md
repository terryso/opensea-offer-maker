# OpenSea Offer Maker

A comprehensive command-line tool for NFT trading and portfolio management on OpenSea. Supports multiple chains (Ethereum, Base, Arbitrum, Polygon, Ronin, ApeChain, Sepolia).

## Features
- **Offer Management**: Create collection and individual NFT offers with smart pricing strategies
- **Auto Bidding**: Automated bidding with configurable price ranges and floor price protection
- **NFT Trading**: Buy NFTs and list them for sale across marketplaces
- **Portfolio Management**: Track balances and manage multi-token assets
- **Real-time Monitoring**: Monitor NFT events (sales, listings, transfers, bids) with instant notifications
- **Smart Caching**: Cache wallet NFTs for interactive selection and quick access
- **Multi-Chain Support**: Operate seamlessly across 7 different blockchain networks
- **Secure Wallet**: AES-256-GCM encrypted private key management
- **Token Swapping**: Convert between ETH and WETH instantly
- **Cross-Chain Operations**: Unified experience across all supported chains

## Quick Start

```bash
# 1. Install
git clone https://github.com/yourusername/opensea-offer-maker.git
cd opensea-offer-maker
npm install

# 2. Configure API Keys
echo "OPENSEA_API_KEY=your_api_key" > .env
echo "ALCHEMY_API_KEY=your_alchemy_api_key" >> .env

# 3. Add Your Wallet
node src/cli.js key add my-wallet

# 4. Cache Your NFTs
node src/cli.js cache refresh

# 5. Start Trading!
node src/cli.js list --interactive  # List NFTs for sale
node src/cli.js monitor start       # Monitor your portfolio
```

## Installation

```bash
git clone https://github.com/yourusername/opensea-offer-maker.git
cd opensea-offer-maker
npm install
```

## Configuration

1. Create a `.env` file in the root directory:

```bash
OPENSEA_API_KEY=your_api_key
ALCHEMY_API_KEY=your_alchemy_api_key
```

2. Configure secure encryption parameters (IMPORTANT):

Copy the encryption configuration from `.env.example` to your `.env` file:

```bash
# Encryption Configuration (Required for security)
ENCRYPTION_PASSWORD=your_secure_password_minimum_32_characters
ENCRYPTION_SALT=your_unique_salt_minimum_16_characters
ENCRYPTION_ITERATIONS=32768
ENCRYPTION_MEMORY=134217728
ENCRYPTION_PARALLELISM=1
```

⚠️ **Security Note**: The encryption configuration protects your private keys. Use strong, unique values and store them securely.

3. Set up your private key securely:
```bash
# Initialize your private key (will be encrypted with your new configuration)
node src/cli.js key setup

# Verify your key setup
node src/cli.js key test
```

The private key will be encrypted and stored locally. You can also use a temporary private key for one-time operations:
```bash
node src/cli.js send -t eth --private-key 0xYourPrivateKey ...
```

### Security Migration (v0.0.6 → v0.0.7)

If you're upgrading from a version before v0.0.7, your encrypted keys will be **automatically migrated** to use the new secure encryption system.

#### What happens during migration?

1. **Automatic Detection**: The system detects if you have old-format encrypted keys
2. **Backup Creation**: A backup of your existing `.keys` file is created with timestamp
3. **Key Re-encryption**: All keys are decrypted with old parameters and re-encrypted with your new secure configuration
4. **Format Update**: Key file format is updated to version 2.0 with metadata
5. **Verification**: All migrated keys are verified to work correctly

#### Migration Requirements

Before migration, ensure you have:

```bash
# 1. Set your encryption configuration in .env
ENCRYPTION_PASSWORD=your_secure_password_min_32_chars
ENCRYPTION_SALT=your_unique_salt_min_16_chars

# 2. The correct original .keys file (do not modify it)
# 3. Sufficient disk space for backup files
```

#### Migration Process

Migration happens automatically when you first run any command that accesses your keys:

```bash
# Any of these commands will trigger migration if needed:
node src/cli.js key list
node src/cli.js offer -c some-collection -o 0.1
node src/cli.js balance
```

**Migration Output Example:**
```
⚠️  Legacy key format detected. Starting migration...
✅ Created backup file: .keys.backup.2025-01-21T10-30-00-000Z
🔄 Migrating key 1/1: default
✅ Successfully migrated key: default
✅ Key file migration completed successfully.
```

#### Post-Migration

- ✅ Your keys are now protected with AES-256-GCM encryption
- ✅ Decryption attempts are rate-limited for brute force protection
- ✅ All sensitive data is cleared from memory after use
- ✅ Your backup file is safely stored (you can delete it after verification)

#### Troubleshooting Migration

**Migration Fails:**
1. Check that your `.env` file contains valid encryption configuration
2. Ensure your `.keys` file is not corrupted
3. Try restoring from backup if available

**Keys Not Working After Migration:**
1. Verify your encryption configuration matches what you set in `.env`
2. Check for any error messages during migration
3. Use `node src/cli.js key test` to verify key access

**Still Having Issues?**
- Check the backup file created during migration
- Review your `.env` encryption configuration
- Delete the migrated `.keys` file and try again with correct configuration

## Usage

### Managing Private Keys
```bash
# Add a new private key with a name
node src/cli.js key add my-key

# Add a key with interactive name prompt
node src/cli.js key add

# List all stored keys with addresses
node src/cli.js key list

# Switch active key
node src/cli.js key use my-key

# Remove a stored key
node src/cli.js key remove my-key

# Test key decryption and wallet access
node src/cli.js key test

# Use temporary private key for any command
--private-key <key>
```

**Security Notes:**
- Private keys are encrypted with AES-256-GCM
- Keys are stored in `.keys` file (gitignored)
- Each key shows the associated wallet address
- You can have multiple named keys for different wallets

### Managing Default Chain
```bash
# View current default chain
node src/cli.js chain get

# Set default chain to base
node src/cli.js chain set base

# Set default chain to ethereum
node src/cli.js chain set ethereum

# List all supported chains
node src/cli.js chain list
```

Once you set a default chain, all commands will use it unless you explicitly specify `--chain` option.

### Check Wallet Balance
```bash
# Check all token balances
node src/cli.js balance

# Check balance on specific chain
node src/cli.js balance --chain ethereum

# Check specific token balance
node src/cli.js balance --token eth
node src/cli.js balance --token weth

# Use temporary private key
node src/cli.js balance --private-key 0xYourPrivateKey
```

### Check Collection Offers
```bash
# View current offers for a collection
node src/cli.js check -c collection_slug

# View offers on specific chain
node src/cli.js check -c collection_slug --chain ethereum
```

### NFT Caching

Cache your wallet's NFTs for interactive selection and quick access.

#### Refresh Cache
```bash
# Cache all NFTs from your wallet
node src/cli.js cache refresh

# Cache on specific chain
node src/cli.js cache refresh --chain base
```

#### Manage Cache
```bash
# List cached NFTs
node src/cli.js cache list

# Show cache status
node src/cli.js cache status

# Clear cache
node src/cli.js cache clear
```

#### Collection Filters
```bash
# Add collection to ignore list
node src/cli.js cache filter add worthless-collection

# Remove from ignore list
node src/cli.js cache filter remove worthless-collection

# List ignored collections
node src/cli.js cache filter list

# Clear all filters
node src/cli.js cache filter clear
```

### Buy NFTs

Purchase NFTs directly from the command line.

#### Buy Specific NFT
```bash
# Buy a specific NFT
node src/cli.js buy -a contract_address -t token_id

# Buy with maximum price limit
node src/cli.js buy -a contract_address -t token_id -m 0.1

# Buy without confirmation prompt
node src/cli.js buy -a contract_address -t token_id --skip-confirm
```

#### Buy Floor NFT
```bash
# Buy cheapest NFT from collection
node src/cli.js buy -c collection_slug

# Buy floor NFT with price limit
node src/cli.js buy -c collection_slug -m 0.05
```

### Create Offers
```bash
# Create a collection offer
node src/cli.js offer -c collection_slug -o 0.0001 -e 15

# Create an individual NFT offer
node src/cli.js offer -a contract_address -t token_id -o 0.0001 -e 15

# Create offer on specific chain
node src/cli.js offer -c collection_slug -o 0.0001 --chain base
```

### Auto Bidding
```bash
# Automatically create collection offers
node src/cli.js auto collection -c collection_slug --min 0.01 --max 0.035 --increment 0.0001 --interval 30 --floor-percentage 80

# Automatically create individual token offers
node src/cli.js auto token -a contract_address -t token_id -c collection_slug --min 0.01 --max 0.035 --increment 0.0001 --interval 30 --floor-percentage 80

# Auto bidding on specific chain
node src/cli.js auto collection -c collection_slug --min 0.01 --max 0.035 --chain ethereum
```

### Send Tokens
```bash
# Send ETH
node src/cli.js send -t eth -a 0.1 -r recipient_address

# Send WETH
node src/cli.js send -t weth -a 0.1 -r recipient_address
```

### Swap ETH/WETH
```bash
# Convert ETH to WETH
node src/cli.js swap -a 0.1 -d eth2weth

# Convert WETH to ETH
node src/cli.js swap -a 0.1 -d weth2eth
```

### Cross-Market Listing

#### Interactive Mode (Recommended)

**Full Interactive Mode** - Select collection, NFT, and pricing all interactively:
```bash
# Complete interactive experience (recommended for beginners)
node src/cli.js list --interactive

# Or use shorthand
node src/cli.js list -i
```

This mode provides a step-by-step guided experience:
1. Select a collection from your wallet
2. Choose a specific NFT from that collection
3. Select pricing strategy and enter price
   - Absolute price (e.g., 0.1 ETH)
   - Floor price difference (e.g., +0.1, -5%)
   - Profit margin (e.g., +0.01 ETH)
   - Profit percentage (e.g., +10%)

**Partial Interactive Mode** - Pre-specify pricing, only select NFT interactively:
```bash
# Interactive NFT selection with pre-set price
node src/cli.js list --interactive -p 0.1

# Interactive with floor price difference
node src/cli.js list --interactive --floor-diff +10%

# Interactive with profit margin over purchase price
node src/cli.js list --interactive --profit-margin 0.05 -e 7d

# Interactive with profit percentage
node src/cli.js list --interactive --profit-percent 15 --marketplaces opensea
```

**Note**: Interactive mode requires cached NFTs. First run `node src/cli.js cache refresh` to populate your NFT cache.

#### Manual Mode
Specify contract address and token ID directly:

```bash
# List NFT on OpenSea
node src/cli.js list -a contract_address -t token_id -p 0.1

# List with floor price difference
node src/cli.js list -a contract_address -t token_id --floor-diff +10% --marketplaces all

# List with specific expiration
node src/cli.js list -a contract_address -t token_id -p 0.1 -e 7d
```

Supported marketplace:
- OpenSea

### NFT Monitoring

Monitor your NFT portfolio in real-time with OpenSea Stream API.

#### Start Monitoring

Monitor all events for your wallet's NFTs:
```bash
node src/cli.js monitor start
```

Monitor specific collections:
```bash
node src/cli.js monitor start --collections azuki,beanz
```

Monitor all collections (high volume):
```bash
node src/cli.js monitor start --all-collections
```

Set verbosity level (minimal, normal, detailed):
```bash
node src/cli.js monitor start --verbosity detailed
```

Monitor on specific chain:
```bash
node src/cli.js monitor start --chain ethereum
```

**Stopping:** Press Ctrl+C to gracefully shutdown monitoring.

#### View Event History

Show recent events from logs:
```bash
# Show last 7 days of events
node src/cli.js monitor history

# Filter by event type
node src/cli.js monitor history --type sale --days 7

# Filter by specific NFT
node src/cli.js monitor history --nft 0xabc...def:123 --limit 20

# View on specific chain
node src/cli.js monitor history --chain base
```

Event types: `sale`, `transfer`, `listing`, `bid`, `cancel`

#### View Statistics

Show monitoring statistics for last 30 days:
```bash
node src/cli.js monitor stats
```

Custom period:
```bash
node src/cli.js monitor stats --days 7 --chain ethereum
```

#### Configuration

Monitor behavior is controlled by environment variables (optional):

- `MONITOR_VERBOSITY` - Event display verbosity: minimal, normal, detailed (default: normal)
- `MONITOR_LOG_RETENTION_DAYS` - Days to keep event logs (default: 30)

Add these to your `.env` file if you want to change the defaults.

#### Important Notes

- **Best-Effort Delivery:** Events during connection drops are not re-sent by OpenSea
- **Event Logs:** Stored in `.cache/events/{wallet}_{chain}.jsonl` (automatically gitignored)
- **Reconnection:** Automatic reconnection with exponential backoff on connection failures
- **Multi-Chain:** Use `--chain` flag to monitor different chains separately

## Examples

```bash
# Check current offers for a collection on Base
node src/cli.js check -c scribblebears --chain base

# Create a collection offer for 0.1 WETH
node src/cli.js offer -c scribblebears -o 0.1 -e 60 --chain base

# Create auto collection offers with floor price limit
node src/cli.js auto collection -c scribblebears --min 0.01 --max 0.035 --floor-percentage 80 --chain base

# Create auto token offers with floor price limit
node src/cli.js auto token -a 0xf3ec2d6394fc899a5dc1823a205670ebb30939cc -t 0 -c scribblebears --min 0.01 --max 0.035 --floor-percentage 80 --chain base
```

## Security
- Private keys are encrypted using AES-256-GCM
- No private keys are stored in plain text
- Support for temporary private keys via command line
- Each command can use a different private key if needed

## Debug Mode
Add `--debug` to any command for detailed logging:
```bash
node src/cli.js key setup --debug
```

## Supported Chains
- **Ethereum Mainnet** (--chain ethereum) - ETH, WETH
- **Base** (--chain base) - ETH, WETH
- **Arbitrum One** (--chain arbitrum) - ETH, WETH
- **Polygon** (--chain polygon) - MATIC, WETH
- **Ronin** (--chain ronin) - RON, WETH
- **ApeChain** (--chain apechain) - APE, WETH
- **Sepolia Testnet** (--chain sepolia) - ETH, WETH

Use `node src/cli.js chain list` to see all supported chains and their configurations.

## Documentation

For detailed technical documentation and architecture information:

- **[Product Requirements Document](docs/prd.md)** - Complete product specification
- **[Architecture Documentation](docs/architecture.md)** - System architecture and design
- **[Epic Documentation](docs/prd/)** - Detailed feature specifications:
  - [Epic 1: Core Offer Making System](docs/prd/epic-1-core-offer-system.md)
  - [Epic 2: NFT Wallet Cache](docs/prd/epic-2-nft-cache.md)
  - [Epic 3: NFT Monitoring](docs/prd/epic-3-nft-monitoring.md)
  - [Epic 4: NFT Trading & Portfolio Management](docs/prd/epic-4-nft-trading-portfolio.md)
  - [Epic 5: Wallet & Key Management](docs/prd/epic-5-wallet-key-management.md)
  - [Epic 6: Multi-Chain Infrastructure](docs/prd/epic-6-multichain-infrastructure.md)

## Contributing

This project follows BMAD™ Core methodology for product development and documentation.

## License
MIT


