const { ethers, waffle, upgrades } = require('hardhat');
const { expect } = require('chai');
const { MAX_UINT256 } = require('@openzeppelin/test-helpers/src/constants');

const REQUESTING_STATUS = 0;
const PAID_STATUS = 1;
const CONFIRMED_STATUS = 2;
const CLAIMED_STATUS = 3;
const BEGINNING_PAYMENT_ID = 1;

const provider = waffle.provider;

const chai = require('chai');
const BN = require('bn.js');
chai.use(require('chai-bn')(BN));

async function getTransactionFee(transaction, contract) {
  const txNormal = await provider.getTransaction(transaction.hash);

  const receipt = await transaction.wait();

  const gasUsed = receipt.gasUsed;
  const gasPrice = txNormal.gasPrice;
  const txFee = gasUsed.mul(gasPrice);

  return txFee;
}

describe('CMB - Integration test', () => {
  beforeEach(async () => {
    accounts = await ethers.getSigners();
    [
      owner,
      bo1,
      bo2,
      bo3,
      client1,
      client2,
      client3,
      fundingReceiver1,
      fundingReceiver2,
    ] = accounts;
    serviceFee = ethers.utils.parseEther('0.002');
    paymentId = 1;
    amount = ethers.utils.parseEther('0.01');
    data = '0x666f6f6261720000000000000000000000000000000000000000000000000000';

    const CMB = await ethers.getContractFactory('CMB');
    cmbContract = await upgrades.deployProxy(CMB, [owner.address, serviceFee]);
  });

  it('request payment for 3 clients', async () => {
    await cmbContract
      .connect(bo1)
      .requestPayment(client1.address, data, amount);
    expect(await cmbContract.lastPaymentId()).to.equal(1);
    const payment1 = await cmbContract.payments(1);
    expect(await payment1.bo).to.equal(bo1.address);
    expect(await payment1.client).to.equal(client1.address);
    expect(await payment1.data).to.equal(data);
    expect(await payment1.amount).to.equal(amount);
    expect(await payment1.status).to.equal(REQUESTING_STATUS);
    expect(cmbContract).to.emit(cmbContract, 'RequestedPayment');

    await cmbContract
      .connect(bo2)
      .requestPayment(client2.address, data, amount);
    expect(await cmbContract.lastPaymentId()).to.equal(2);
    const payment2 = await cmbContract.payments(2);
    expect(await payment2.bo).to.equal(bo2.address);
    expect(await payment2.client).to.equal(client2.address);
    expect(await payment2.data).to.equal(data);
    expect(await payment2.amount).to.equal(amount);
    expect(await payment2.status).to.equal(REQUESTING_STATUS);
    expect(cmbContract).to.emit(cmbContract, 'RequestedPayment');

    await cmbContract
      .connect(bo3)
      .requestPayment(client3.address, data, amount);
    expect(await cmbContract.lastPaymentId()).to.equal(3);
    const payment3 = await cmbContract.payments(3);
    expect(await payment3.bo).to.equal(bo3.address);
    expect(await payment3.client).to.equal(client3.address);
    expect(await payment3.data).to.equal(data);
    expect(await payment3.amount).to.equal(amount);
    expect(await payment3.status).to.equal(REQUESTING_STATUS);
    expect(cmbContract).to.emit(cmbContract, 'RequestedPayment');
  });

  describe('After 3 clients request payment successfully', async () => {
    beforeEach(async () => {
      await cmbContract
        .connect(bo1)
        .requestPayment(client1.address, data, amount);

      await cmbContract
        .connect(bo2)
        .requestPayment(client2.address, data, amount);

      await cmbContract
        .connect(bo3)
        .requestPayment(client3.address, data, amount);
    });

    it('Client1 and client2 make payment', async () => {
      const totalFeeBefore = await cmbContract.serviceFeeTotal();
      const balanceOfClient1Before = await provider.getBalance(client1.address);
      const balanceOfClient2Before = await provider.getBalance(client2.address);
      const balanceOfClient3Before = await provider.getBalance(client3.address);

      const totalFeeNeedToPay = amount.add(serviceFee);

      const transaction1 = await cmbContract
        .connect(client1)
        .pay(1, { value: totalFeeNeedToPay });

      const txFee1 = await getTransactionFee(transaction1, cmbContract);

      const transaction2 = await cmbContract
        .connect(client2)
        .pay(2, { value: totalFeeNeedToPay });
      const txFee2 = await getTransactionFee(transaction2, cmbContract);

      const payment1 = await cmbContract.payments(1);
      const payment2 = await cmbContract.payments(2);
      const payment3 = await cmbContract.payments(3);

      const totalFeeAfter = await cmbContract.serviceFeeTotal();
      const balanceOfClient1After = await provider.getBalance(client1.address);
      const balanceOfClient2After = await provider.getBalance(client2.address);
      const balanceOfClient3After = await provider.getBalance(client3.address);

      expect(payment1.status).to.equal(PAID_STATUS);
      expect(payment2.status).to.equal(PAID_STATUS);
      expect(payment3.status).to.equal(REQUESTING_STATUS);

      expect(totalFeeAfter).to.equal(totalFeeBefore.add(serviceFee.mul(2)));
      expect(balanceOfClient1After).to.equal(
        balanceOfClient1Before.sub(txFee1).sub(totalFeeNeedToPay),
      );
      expect(balanceOfClient2After).to.equal(
        balanceOfClient2Before.sub(txFee2).sub(totalFeeNeedToPay),
      );
      expect(balanceOfClient3After).to.equal(balanceOfClient3Before);
    });

    it('Client1 and client2 confirm to release money', async () => {
      const totalFeeBefore = await cmbContract.serviceFeeTotal();
      const totalFeeNeedToPay = amount.add(serviceFee);

      await cmbContract.connect(client1).pay(1, { value: totalFeeNeedToPay });
      await cmbContract.connect(client1).confirmToRelease(1);

      await cmbContract.connect(client2).pay(2, { value: totalFeeNeedToPay });
      await cmbContract.connect(client2).confirmToRelease(2);

      await cmbContract.connect(client3).pay(3, { value: totalFeeNeedToPay });

      const payment1 = await cmbContract.payments(1);
      const payment2 = await cmbContract.payments(2);
      const payment3 = await cmbContract.payments(3);

      const totalFeeAfter = await cmbContract.serviceFeeTotal();

      expect(payment1.status).to.equal(CONFIRMED_STATUS);

      expect(payment2.status).to.equal(CONFIRMED_STATUS);

      expect(payment3.status).to.equal(PAID_STATUS);

      expect(totalFeeAfter).to.equal(totalFeeBefore.add(serviceFee.mul(3)));
    });

    describe('After 3 client confirm to release to money', async () => {
      beforeEach(async () => {
        await cmbContract
          .connect(client1)
          .pay(1, { value: amount.add(serviceFee) });
        await cmbContract.connect(client1).confirmToRelease(1);

        await cmbContract
          .connect(client2)
          .pay(2, { value: amount.add(serviceFee) });
        await cmbContract.connect(client2).confirmToRelease(2);

        await cmbContract
          .connect(client3)
          .pay(3, { value: amount.add(serviceFee) });
        await cmbContract.connect(client3).confirmToRelease(3);

        balanceOfBo1Before = await provider.getBalance(bo1.address);
        balanceOfBo2Before = await provider.getBalance(bo2.address);
        balanceOfBo3Before = await provider.getBalance(bo3.address);
        serviceFeeTotalBefore = await cmbContract.serviceFeeTotal();
      });

      it('Only business owner 1 claims payment', async () => {
        const transaction = await cmbContract.connect(bo1).claim(1);

        const balanceOfBo1After = await provider.getBalance(bo1.address);
        const balanceOfBo2After = await provider.getBalance(bo2.address);
        const balanceOfBo3After = await provider.getBalance(bo3.address);
        const txFee = await getTransactionFee(transaction, cmbContract);
        const serviceFeeTotalAfter = await cmbContract.serviceFeeTotal();

        const payment1 = await cmbContract.payments(1);
        const payment2 = await cmbContract.payments(2);
        const payment3 = await cmbContract.payments(3);

        expect(balanceOfBo1After).to.equal(
          balanceOfBo1Before.add(amount).sub(txFee),
        );
        expect(balanceOfBo2After).to.equal(balanceOfBo2Before);
        expect(balanceOfBo3After).to.equal(balanceOfBo3Before);
        expect(serviceFeeTotalBefore).to.equal(serviceFeeTotalAfter);
        expect(payment1.status).to.equal(CLAIMED_STATUS);
        expect(payment2.status).to.equal(CONFIRMED_STATUS);
        expect(payment3.status).to.equal(CONFIRMED_STATUS);
      });

      it('Three business owners claim corresponding payment', async () => {
        const transaction1 = await cmbContract.connect(bo1).claim(1);
        const transaction2 = await cmbContract.connect(bo2).claim(2);
        const transaction3 = await cmbContract.connect(bo3).claim(3);

        const txFee1 = await getTransactionFee(transaction1, cmbContract);
        const txFee2 = await getTransactionFee(transaction2, cmbContract);
        const txFee3 = await getTransactionFee(transaction3, cmbContract);

        const balanceOfBo1After = await provider.getBalance(bo1.address);
        const balanceOfBo2After = await provider.getBalance(bo2.address);
        const balanceOfBo3After = await provider.getBalance(bo3.address);
        const serviceFeeTotalAfter = await cmbContract.serviceFeeTotal();

        const payment1 = await cmbContract.payments(1);
        const payment2 = await cmbContract.payments(2);
        const payment3 = await cmbContract.payments(3);

        expect(balanceOfBo1After).to.equal(
          balanceOfBo1Before.add(amount).sub(txFee1),
        );
        expect(balanceOfBo2After).to.equal(
          balanceOfBo2Before.add(amount).sub(txFee2),
        );
        expect(balanceOfBo3After).to.equal(
          balanceOfBo3Before.add(amount).sub(txFee3),
        );
        expect(serviceFeeTotalBefore).to.equal(serviceFeeTotalAfter);

        expect(payment1.status).to.equal(CLAIMED_STATUS);
        expect(payment2.status).to.equal(CLAIMED_STATUS);
        expect(payment3.status).to.equal(CLAIMED_STATUS);
      });

      it('Owner withdraw service fee total multiple times to same wallet', async () => {
        const serviceFeeTotalBefore = await cmbContract.serviceFeeTotal();
        const balanceOfReceiverBefore = await provider.getBalance(
          fundingReceiver1.address,
        );

        const withdrawAmount1 = ethers.utils.parseEther('0.001');
        const withdrawAmount2 = ethers.utils.parseEther('0.002');
        const withdrawAmount3 = ethers.utils.parseEther('0.003');

        await cmbContract
          .connect(owner)
          .withdrawServiceFee(withdrawAmount1, fundingReceiver1.address);
        await cmbContract
          .connect(owner)
          .withdrawServiceFee(withdrawAmount2, fundingReceiver1.address);
        await cmbContract
          .connect(owner)
          .withdrawServiceFee(withdrawAmount3, fundingReceiver1.address);

        const serviceFeeTotalAfter = await cmbContract.serviceFeeTotal();
        const balanceOfReceiverAfter = await provider.getBalance(
          fundingReceiver1.address,
        );

        expect(serviceFeeTotalAfter).to.be.equal(
          serviceFeeTotalBefore
            .sub(withdrawAmount1)
            .sub(withdrawAmount2)
            .sub(withdrawAmount3),
        );
        expect(balanceOfReceiverAfter).to.be.equal(
          balanceOfReceiverBefore
            .add(withdrawAmount1)
            .add(withdrawAmount2)
            .add(withdrawAmount3),
        );
      });

      it('Owner withdraw service fee total multiple times to difference wallet', async () => {
        const serviceFeeTotalBefore = await cmbContract.serviceFeeTotal();
        const balanceOfReceiver1Before = await provider.getBalance(
          fundingReceiver1.address,
        );
        const balanceOfReceiver2Before = await provider.getBalance(
          fundingReceiver2.address,
        );

        const withdrawAmount1 = ethers.utils.parseEther('0.001');
        const withdrawAmount2 = ethers.utils.parseEther('0.002');

        await cmbContract
          .connect(owner)
          .withdrawServiceFee(withdrawAmount1, fundingReceiver1.address);
        await cmbContract
          .connect(owner)
          .withdrawServiceFee(withdrawAmount2, fundingReceiver2.address);

        const serviceFeeTotalAfter = await cmbContract.serviceFeeTotal();
        const balanceOfReceiver1After = await provider.getBalance(
          fundingReceiver1.address,
        );
        const balanceOfReceiver2After = await provider.getBalance(
          fundingReceiver2.address,
        );

        expect(serviceFeeTotalAfter).to.be.equal(
          serviceFeeTotalBefore.sub(withdrawAmount1).sub(withdrawAmount2),
        );
        expect(balanceOfReceiver1After).to.be.equal(
          balanceOfReceiver1Before.add(withdrawAmount1),
        );
        expect(balanceOfReceiver2After).to.be.equal(
          balanceOfReceiver2Before.add(withdrawAmount2),
        );
      });

      it('Owner withdraw all service fee total', async () => {
        const serviceFeeTotalBefore = await cmbContract.serviceFeeTotal();
        const balanceOfReceiverBefore = await provider.getBalance(
          fundingReceiver1.address,
        );

        await cmbContract
          .connect(owner)
          .withdrawServiceFee(serviceFeeTotalBefore, fundingReceiver1.address);
        const balanceOfReceiverAfter = await provider.getBalance(
          fundingReceiver1.address,
        );

        expect(balanceOfReceiverAfter).to.be.equal(
          balanceOfReceiverBefore.add(serviceFeeTotalBefore),
        );
        expect(await cmbContract.serviceFeeTotal()).to.be.equal(0);
      });
    });
  });
});
