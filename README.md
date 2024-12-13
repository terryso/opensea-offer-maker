# OpenSea Offer Maker

A command-line tool for creating and managing offers on OpenSea. Supports multiple chains (Ethereum, Base, Sepolia).

## Features
- Create collection and individual NFT offers
- Automatic bidding with price range
- Monitor current offers
- Support for multiple chains
- Real-time offer tracking

## Installation

```bash
bash
git clone https://github.com/yourusername/opensea-offer-maker.git
cd opensea-offer-maker
npm install
```

## Configuration

Create a `.env` file in the root directory:

```bash
OPENSEA_API_KEY=your_api_key
WALLET_PRIV_KEY=your_wallet_private_key
ALCHEMY_API_KEY=your_alchemy_api_key
```

## Usage

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
# Automatically create offers within a price range
node src/cli.js auto -c collection_slug --min 0.0001 --max 0.0003 --increment 0.0001 --interval 60

# Auto bidding on specific chain
node src/cli.js auto -c collection_slug --min 0.0001 --max 0.0003 --chain ethereum
```

## Examples

```bash
# Check current offers for a collection on Base
node src/cli.js check -c scribblebears --chain base

# Create a collection offer for 0.1 WETH
node src/cli.js offer -c scribblebears -o 0.1 -e 60 --chain base

# Auto bid between 0.1 and 0.2 WETH
node src/cli.js auto -c scribblebears --min 0.1 --max 0.2 --chain base --debug
```

## Supported Chains
- Ethereum (mainnet)
- Base
- Sepolia (testnet)

## License
MIT


