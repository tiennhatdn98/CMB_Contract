const hre = require('hardhat');
const fs = require('fs');
const ethers = hre.ethers;
const upgrades = hre.upgrades;
const { getImplementationAddress } = require('@openzeppelin/upgrades-core');
const provider = ethers.provider;

async function main() {
  // Loading accounts
  const accounts = await ethers.getSigners();
  const addresses = accounts.map((account) => account.address);
  const bo = addresses[0];
  const serviceFee = 2000000;

  // Loading contract factory
  const CMB = await ethers.getContractFactory('CMB');

  // Deploy contract
  console.log(
    '==================================================================',
  );
  console.log('DEPLOY CONTRACTS');
  console.log(
    '==================================================================',
  );

  // const cmbContract = await CMB.deploy();
  // await cmbContract.deployed();
  // console.log('CMB contract deployed at: ', cmbContract.address);

  const cmbProxy = await upgrades.deployProxy(CMB, [bo]);
  await cmbProxy.deployed();
  console.log('CMB proxy deployed at: ', cmbProxy.address);

  const cmbVerify = await getImplementationAddress(provider, cmbProxy.address);
  console.log('Current implementation address: ', cmbVerify);

  // Upgrading
  // const CMBv2 = await ethers.getContractFactory('CMBV2');
  // const upgraded = await upgrades.upgradeProxy(cmb.address, CMBv2);

  const contractAddresses = {
    bo: bo.address,
    cmbProxy: cmbProxy.address,
    cmbVerify: cmbVerify,
  };

  // Write detail address to contrats.json
  await fs.writeFileSync('contracts.json', JSON.stringify(contractAddresses));
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
