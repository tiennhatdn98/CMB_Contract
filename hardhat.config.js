// Loading env configs for deploying and public contract source
require('dotenv').config();

// Using hardhat-ethers plugin for deploying
// See here: https://hardhat.org/plugins/nomiclabs-hardhat-ethers.html
// https://hardhat.org/guides/deploying.html
require('@nomiclabs/hardhat-ethers');

// Testing plugins with Waffle
// See here: https://hardhat.org/guides/waffle-testing.html
require('@nomiclabs/hardhat-waffle');

// This plugin runs solhint on the project's sources and prints the report
// See here: https://hardhat.org/plugins/nomiclabs-hardhat-solhint.html
require('@nomiclabs/hardhat-solhint');

// Verify and public source code on etherscan
require('@nomiclabs/hardhat-etherscan');

require('@openzeppelin/hardhat-upgrades');
const config = {
  defaultNetwork: 'hardhat',
  networks: {
    hardhat: { accounts: { count: 100 } },
    avaxTestnet: {
      url: `https://api.avax-test.network/ext/bc/C/rpc`,
      chainId: 43113,
      accounts: [process.env.DEPLOY_ACCOUNT],
    },
    avaxMainnet: {
      url: 'https://api.avax.network/ext/bc/C/rpc',
      chainId: 43113,
      accounts: [process.env.DEPLOY_ACCOUNT],
      gasPrice: 8000000000,
    },
  },
  etherscan: {
    apiKey: process.env.SNOWTRACE_API_KEY,
  },
  solidity: {
    compilers: [
      {
        version: '0.8.4',
        settings: { optimizer: { enabled: true, runs: 200 } },
      },
    ],
  },
  paths: {
    sources: './contracts',
    tests: './test',
    cache: './cache',
    artifacts: './artifacts',
    deploy: 'deploy',
    deployments: 'deployments',
  },
  mocha: {
    timeout: 200000,
    useColors: true,
    reporter: 'mocha-multi-reporters',
    reporterOptions: { configFile: './mocha-report.json' },
  },
};

module.exports = config;
