# CMB Smart Contract

Development for escrow

## Development

#### Setup

Make sure these tools are installed with the correct version

- `nodejs` LST `v16.13.0`
- `npm` `8.1.0`
- `solc` `0.8.9`

#### Build and Test

Install dependencies

```console
cmd$> npm install
```

Run local network

```console
cmd$> npx hardhat node
```

Compile contracts

```console
cmd$> npx hardhat compile
```

Deploy main contracts (default is local network `hardhat`)

```console
cmd$> npx hardhat run scripts/deploy.js --network <your-network>
```

Deploy Early Supporter Pool contract (default is local network `hardhat`)

```console
cmd$> TOKEN_ADDRESS=<string> MIRROR_POOL_ADDRESS=<string> npx hardhat run scripts/deploy_EarlySupporterPool.js --network <your-network>
```

Deploy OpPusher contract (default is local network `hardhat`)

```console
cmd$> MIRROR_POOL_ADDRESS=<string> TREASURY_ADDRESS=<string> npx hardhat run scripts/deploy_OpPusher.js --network <your-network>
```

Verify and public contract sources (please make sure that we added SNOWTRACE_API_KEY value in `.env` file)

```console
cmd$> npx hardhat run script/verify.js --network <your-network>
```

Run all javascript tests

```console
cmd$> npx hardhat test
```

Run specified javascript test or specified network (default is local network `hardhat`)

```console
cmd$> npx hardhat test <test-file-path> --network <your-network>
```

Run solhint

```console
cmd$> npx solhint --formatter table 'contracts/**/*.sol'
```

Run wallet account generation script

```console
cmd$> npx hardhat generate:accounts --amount <number> --secret <string, optional>

// Example
cmd$> npx hardhat generate:accounts --amount 1
cmd$> npx hardhat generate:accounts --amount 100 --secret hehehe
```
