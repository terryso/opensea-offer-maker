# OpenSea Offer Maker

A command-line tool for creating and managing offers on OpenSea. Supports multiple chains (Ethereum, Base, Sepolia).

## Features
- Create collection and individual NFT offers
- Automatic bidding with price range
- Monitor current offers
- Support for multiple chains
- Real-time offer tracking
- Secure private key management

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

2. Set up your private key securely:
```bash
# Initialize your private key (will be encrypted)
node src/cli.js key setup

# Verify your key setup
node src/cli.js key test
```

The private key will be encrypted and stored locally. You can also use a temporary private key for one-time operations:
```bash
node src/cli.js send -t eth --private-key 0xYourPrivateKey ...
```

## Usage

### Managing Private Keys
```bash
# Add a new private key with a name
node src/cli.js key add my-key

# List all stored keys
node src/cli.js key list

# Switch active key
node src/cli.js key use my-key

# Remove a stored key
node src/cli.js key remove my-key

# Test key decryption
node src/cli.js key test

# Use temporary private key for any command
--private-key <key>
```

### Check Collection Offers
```bash
# View current offers for a collection
node src/cli.js check -c collection_slug

# View offers on specific chain
node src/cli.js check -c collection_slug --chain ethereum
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
```bash
# List NFT on multiple marketplaces
node src/cli.js list -a contract_address -t token_id -p 0.1 --marketplaces opensea,blur

# List with floor price difference
node src/cli.js list -a contract_address -t token_id --floor-diff +10% --marketplaces all

# List with specific expiration
node src/cli.js list -a contract_address -t token_id -p 0.1 -e 7d --marketplaces opensea,blur
```

Supported marketplaces:
- OpenSea
- Blur (Ethereum only)

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
- Ethereum Mainnet (--chain ethereum)
- Base (--chain base)
- Sepolia (--chain sepolia)

## License
MIT


