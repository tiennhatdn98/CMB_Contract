const { ethers } = require('hardhat');

async function getTransactionFee(transaction, contract) {
  const txNormal = await ethers.provider.getTransaction(transaction.hash);

  const receipt = await transaction.wait();

  const gasUsed = receipt.gasUsed;
  const gasPrice = txNormal.gasPrice;
  const txFee = gasUsed.mul(gasPrice);

  return txFee;
}

module.exports = getTransactionFee;
