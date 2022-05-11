const hre = require('hardhat');
const contracts = require('../contracts.json');

async function main() {
  try {
    await hre.run('verify:verify', {
      // address: '0x378E7886A33EFD3fd548323DF0f35c5B2b4B9aAb',
      address: '0x27ac1Ed624443eFB818ECcfF63De2F5722547C3F',
    });
  } catch (error) {
    console.log('err :>> ', error);
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
