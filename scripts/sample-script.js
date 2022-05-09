const hre = require("hardhat");

async function main() {
  const CMB = await hre.ethers.getContractFactory("CMB");
  const cmbContract = await CMB.deploy();

  await cmbContract.deployed();

  console.log("CMB deployed to:", cmbContract.address);
}

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
