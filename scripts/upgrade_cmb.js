const { ethers, upgrades } = require('hardhat');

async function main() {
  const CMBV2 = await ethers.getContractFactory('CMBV2');
  console.log('Upgrading CMB...');
  await upgrades.upgradeProxy(
    '0x9fE46736679d2D9a65F0992F2272dE9f3c7fa6e0',
    CMBV2,
  );
  console.log('CMB upgraded');
}

main();
