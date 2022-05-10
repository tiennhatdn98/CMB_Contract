const { ethers, upgrades } = require('hardhat');

async function main() {
  const CMB = await ethers.getContractFactory('CMB');
  console.log('Deploying CMB...');
  const cmb = await upgrades.deployProxy(
    CMB,
    ['0x1AA75ee60ba29B408275762B1340A0416B2cb4e0', 20000000],
    { initializer: 'initialize' },
  );
  await cmb.deployed();
  console.log('CMB deployed to:', cmb.address);
}

main();
