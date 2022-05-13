const { ethers, waffle, upgrades } = require('hardhat');
const { expect } = require('chai');
const { MAX_UINT256 } = require('@openzeppelin/test-helpers/src/constants');

const REQUESTING_STATUS = 0;
const PAID_STATUS = 1;
const CONFIRMED_STATUS = 2;
const CLAIMED_STATUS = 3;
const BEGINNING_PAYMENT_ID = 1;

const PAYMENT_ID_1 = 1;
const PAYMENT_ID_2 = 2;
const PAYMENT_ID_3 = 3;

const WEIGHT_DECIMAL = 1e6;
const DEFAULT_FEE_PERCENTAGE = 15e5;

const provider = ethers.provider;
const getTransactionFee = require('../utils/getTransactionFee');

const chai = require('chai');
const BN = require('bn.js');
chai.use(require('chai-bn')(BN));

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
    // serviceFee = ethers.utils.parseEther('0.002');
    paymentId = 1;
    amount = ethers.utils.parseEther('0.01');
    data = '0x666f6f6261720000000000000000000000000000000000000000000000000000';

    const CMB = await ethers.getContractFactory('CMB');
    cmbContract = await upgrades.deployProxy(CMB, [owner.address]);
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
      const balanceOfClient1Before = await provider.getBalance(client1.address);
      const balanceOfClient2Before = await provider.getBalance(client2.address);
      const balanceOfClient3Before = await provider.getBalance(client3.address);

      const totalFeeNeedToPay = amount;

      const transaction1 = await cmbContract
        .connect(client1)
        .pay(PAYMENT_ID_1, { value: totalFeeNeedToPay });

      const txFee1 = await getTransactionFee(transaction1, cmbContract);

      const transaction2 = await cmbContract
        .connect(client2)
        .pay(PAYMENT_ID_2, { value: totalFeeNeedToPay });
      const txFee2 = await getTransactionFee(transaction2, cmbContract);

      const payment1 = await cmbContract.payments(PAYMENT_ID_1);
      const payment2 = await cmbContract.payments(PAYMENT_ID_2);
      const payment3 = await cmbContract.payments(PAYMENT_ID_3);

      const balanceOfClient1After = await provider.getBalance(client1.address);
      const balanceOfClient2After = await provider.getBalance(client2.address);
      const balanceOfClient3After = await provider.getBalance(client3.address);

      expect(payment1.status).to.equal(PAID_STATUS);
      expect(payment2.status).to.equal(PAID_STATUS);
      expect(payment3.status).to.equal(REQUESTING_STATUS);

      expect(balanceOfClient1After).to.equal(
        balanceOfClient1Before.sub(txFee1).sub(totalFeeNeedToPay),
      );
      expect(balanceOfClient2After).to.equal(
        balanceOfClient2Before.sub(txFee2).sub(totalFeeNeedToPay),
      );
      expect(balanceOfClient3After).to.equal(balanceOfClient3Before);
    });

    it('Client1 and client2 confirm to release money', async () => {
      const totalFeeNeedToPay = amount;

      await cmbContract
        .connect(client1)
        .pay(PAYMENT_ID_1, { value: totalFeeNeedToPay });
      await cmbContract.connect(client1).confirmToRelease(1);

      await cmbContract
        .connect(client2)
        .pay(PAYMENT_ID_2, { value: totalFeeNeedToPay });
      await cmbContract.connect(client2).confirmToRelease(2);

      await cmbContract
        .connect(client3)
        .pay(PAYMENT_ID_3, { value: totalFeeNeedToPay });

      const payment1 = await cmbContract.payments(PAYMENT_ID_1);
      const payment2 = await cmbContract.payments(PAYMENT_ID_2);
      const payment3 = await cmbContract.payments(PAYMENT_ID_3);

      expect(payment1.status).to.equal(CONFIRMED_STATUS);
      expect(payment2.status).to.equal(CONFIRMED_STATUS);
      expect(payment3.status).to.equal(PAID_STATUS);
    });

    describe('After 3 clients confirm to release to money', async () => {
      beforeEach(async () => {
        await cmbContract.connect(client1).pay(PAYMENT_ID_1, { value: amount });
        await cmbContract.connect(client1).confirmToRelease(PAYMENT_ID_1);

        await cmbContract.connect(client2).pay(PAYMENT_ID_2, { value: amount });
        await cmbContract.connect(client2).confirmToRelease(PAYMENT_ID_2);

        await cmbContract.connect(client3).pay(PAYMENT_ID_3, { value: amount });
        await cmbContract.connect(client3).confirmToRelease(PAYMENT_ID_3);

        balanceOfBo1Before = await provider.getBalance(bo1.address);
        balanceOfBo2Before = await provider.getBalance(bo2.address);
        balanceOfBo3Before = await provider.getBalance(bo3.address);
        serviceFeeTotalBefore = await cmbContract.serviceFeeTotal();

        serviceFeeTotal = await cmbContract.serviceFeeTotal();
      });

      it('Total service fee will be changed correctly when owner changes service fee percentage', async () => {
        const newServiceFeePercentage = 25; //2.5%
        const serviceFeeTotalBefore = await cmbContract.serviceFeeTotal();
        await cmbContract.setServiceFeePercent(newServiceFeePercentage);

        const payment1 = await cmbContract.payments(PAYMENT_ID_1);
        const amount1 = payment1.amount;
        const payment2 = await cmbContract.payments(PAYMENT_ID_2);
        const amount2 = payment2.amount;
        const payment3 = await cmbContract.payments(PAYMENT_ID_3);
        const amount3 = payment3.amount;

        const serviceFeePercent = await cmbContract.serviceFeePercent();

        await cmbContract.connect(bo1).claim(PAYMENT_ID_1);
        await cmbContract.connect(bo2).claim(PAYMENT_ID_2);
        await cmbContract.connect(bo3).claim(PAYMENT_ID_3);

        const serviceFeeTotalAfter = await cmbContract.serviceFeeTotal();
        const addedServiceFeeTotal = amount1
          .add(amount2)
          .add(amount3)
          .mul(serviceFeePercent)
          .div(WEIGHT_DECIMAL)
          .div(100);
        console.log(addedServiceFeeTotal);

        expect(serviceFeeTotalAfter).to.equal(
          serviceFeeTotalBefore.add(addedServiceFeeTotal),
        );
      });

      it('Only business owner 1 claims payment', async () => {
        const serviceFeeTotalBefore = await cmbContract.serviceFeeTotal();

        const transaction = await cmbContract.connect(bo1).claim(PAYMENT_ID_1);

        const balanceOfBo1After = await provider.getBalance(bo1.address);
        const balanceOfBo2After = await provider.getBalance(bo2.address);
        const balanceOfBo3After = await provider.getBalance(bo3.address);

        const txFee = await getTransactionFee(transaction, cmbContract);

        const serviceFeeTotalAfter = await cmbContract.serviceFeeTotal();

        const payment1 = await cmbContract.payments(PAYMENT_ID_1);
        const payment2 = await cmbContract.payments(PAYMENT_ID_2);
        const payment3 = await cmbContract.payments(PAYMENT_ID_3);

        const serviceFeePercent = await cmbContract.serviceFeePercent();
        const serviceFee1 = payment1.amount
          .mul(serviceFeePercent)
          .div(WEIGHT_DECIMAL)
          .div(100);

        expect(balanceOfBo1After).to.equal(
          balanceOfBo1Before.add(amount).sub(serviceFee1).sub(txFee),
        );
        expect(balanceOfBo2After).to.equal(balanceOfBo2Before);
        expect(balanceOfBo3After).to.equal(balanceOfBo3Before);
        expect(serviceFeeTotalBefore).to.equal(
          serviceFeeTotalAfter.sub(serviceFee1),
        );
        expect(payment1.status).to.equal(CLAIMED_STATUS);
        expect(payment2.status).to.equal(CONFIRMED_STATUS);
        expect(payment3.status).to.equal(CONFIRMED_STATUS);
      });

      it('Three business owners claim corresponding payment', async () => {
        const serviceFeeTotalBefore = await cmbContract.serviceFeeTotal();

        const transaction1 = await cmbContract.connect(bo1).claim(PAYMENT_ID_1);
        const transaction2 = await cmbContract.connect(bo2).claim(PAYMENT_ID_2);
        const transaction3 = await cmbContract.connect(bo3).claim(PAYMENT_ID_3);

        const txFee1 = await getTransactionFee(transaction1, cmbContract);
        const txFee2 = await getTransactionFee(transaction2, cmbContract);
        const txFee3 = await getTransactionFee(transaction3, cmbContract);

        const balanceOfBo1After = await provider.getBalance(bo1.address);
        const balanceOfBo2After = await provider.getBalance(bo2.address);
        const balanceOfBo3After = await provider.getBalance(bo3.address);

        const serviceFeeTotalAfter = await cmbContract.serviceFeeTotal();

        const payment1 = await cmbContract.payments(PAYMENT_ID_1);
        const payment2 = await cmbContract.payments(PAYMENT_ID_2);
        const payment3 = await cmbContract.payments(PAYMENT_ID_3);

        const serviceFee1 = await cmbContract.calculateServiceFee(
          payment1.amount,
        );
        const serviceFee2 = await cmbContract.calculateServiceFee(
          payment1.amount,
        );
        const serviceFee3 = await cmbContract.calculateServiceFee(
          payment1.amount,
        );

        expect(balanceOfBo1After).to.equal(
          balanceOfBo1Before.add(amount).sub(serviceFee1).sub(txFee1),
        );
        expect(balanceOfBo2After).to.equal(
          balanceOfBo2Before.add(amount).sub(serviceFee1).sub(txFee2),
        );
        expect(balanceOfBo3After).to.equal(
          balanceOfBo3Before.add(amount).sub(serviceFee1).sub(txFee3),
        );
        expect(serviceFeeTotalAfter).to.equal(
          serviceFeeTotalBefore
            .add(serviceFee1)
            .add(serviceFee2)
            .add(serviceFee3),
        );

        expect(payment1.status).to.equal(CLAIMED_STATUS);
        expect(payment2.status).to.equal(CLAIMED_STATUS);
        expect(payment3.status).to.equal(CLAIMED_STATUS);
      });

      describe('After 3 business owners claim to release to money', async () => {
        beforeEach(async () => {
          await cmbContract.connect(bo1).claim(PAYMENT_ID_1);
          await cmbContract.connect(bo2).claim(PAYMENT_ID_2);
          await cmbContract.connect(bo3).claim(PAYMENT_ID_3);

          serviceFeeTotal = await cmbContract.serviceFeeTotal();
          withdrawAmount1 = serviceFeeTotal.div(3);
          withdrawAmount2 = serviceFeeTotal.div(3);
          withdrawAmount3 = serviceFeeTotal
            .sub(withdrawAmount1)
            .sub(withdrawAmount2);
        });

        it('Owner withdraw service fee total multiple times to same wallet', async () => {
          const serviceFeeTotalBefore = await cmbContract.serviceFeeTotal();
          const balanceOfReceiverBefore = await provider.getBalance(
            fundingReceiver1.address,
          );

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
            .withdrawServiceFee(
              serviceFeeTotalBefore,
              fundingReceiver1.address,
            );
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

  it('Test flow', async () => {
    // Business Owners request payment
    await cmbContract
      .connect(bo1)
      .requestPayment(client1.address, data, amount);
    await cmbContract
      .connect(bo2)
      .requestPayment(client2.address, data, amount);
    await cmbContract
      .connect(bo3)
      .requestPayment(client3.address, data, amount);

    let payment1 = await cmbContract.payments(PAYMENT_ID_1);
    expect(payment1.status).to.equal(REQUESTING_STATUS);
    expect(payment1.data).to.equal(data);
    expect(payment1.amount).to.equal(amount);
    expect(payment1.paymentId).to.equal(PAYMENT_ID_1);

    let payment2 = await cmbContract.payments(PAYMENT_ID_2);
    expect(payment2.status).to.equal(REQUESTING_STATUS);
    expect(payment2.data).to.equal(data);
    expect(payment2.amount).to.equal(amount);
    expect(payment2.paymentId).to.equal(PAYMENT_ID_2);

    let payment3 = await cmbContract.payments(PAYMENT_ID_3);
    expect(payment3.status).to.equal(REQUESTING_STATUS);
    expect(payment3.data).to.equal(data);
    expect(payment3.amount).to.equal(amount);
    expect(payment3.paymentId).to.equal(PAYMENT_ID_3);

    // Clients make Payment
    const serviceFeeNeedToPay = amount;

    let balanceOfClient1BeforePay = await provider.getBalance(client1.address);
    let balanceOfClient2BeforePay = await provider.getBalance(client2.address);
    let balanceOfClient3BeforePay = await provider.getBalance(client3.address);

    const payTx1 = await cmbContract
      .connect(client1)
      .pay(PAYMENT_ID_1, { value: serviceFeeNeedToPay });
    const payTx2 = await cmbContract
      .connect(client2)
      .pay(PAYMENT_ID_2, { value: serviceFeeNeedToPay });
    const payTx3 = await cmbContract
      .connect(client3)
      .pay(PAYMENT_ID_3, { value: serviceFeeNeedToPay });

    const payTxFee1 = await getTransactionFee(payTx1, cmbContract);
    const payTxFee2 = await getTransactionFee(payTx2, cmbContract);
    const payTxFee3 = await getTransactionFee(payTx3, cmbContract);

    let balanceOfClient1AfterPay = await provider.getBalance(client1.address);
    let balanceOfClient2AfterPay = await provider.getBalance(client2.address);
    let balanceOfClient3AfterPay = await provider.getBalance(client3.address);

    expect(balanceOfClient1AfterPay).to.be.equal(
      balanceOfClient1BeforePay.sub(serviceFeeNeedToPay).sub(payTxFee1),
    );
    expect(balanceOfClient2AfterPay).to.be.equal(
      balanceOfClient2BeforePay.sub(serviceFeeNeedToPay).sub(payTxFee2),
    );
    expect(balanceOfClient3AfterPay).to.be.equal(
      balanceOfClient3BeforePay.sub(serviceFeeNeedToPay).sub(payTxFee3),
    );

    payment1 = await cmbContract.payments(PAYMENT_ID_1);
    expect(payment1.status).to.equal(PAID_STATUS);

    payment2 = await cmbContract.payments(PAYMENT_ID_2);
    expect(payment2.status).to.equal(PAID_STATUS);

    payment3 = await cmbContract.payments(PAYMENT_ID_3);
    expect(payment3.status).to.equal(PAID_STATUS);

    // Clients confirm to release money
    await cmbContract.connect(client1).confirmToRelease(1);
    await cmbContract.connect(client2).confirmToRelease(2);
    await cmbContract.connect(client3).confirmToRelease(3);

    payment1 = await cmbContract.payments(PAYMENT_ID_1);
    expect(payment1.status).to.equal(CONFIRMED_STATUS);

    payment2 = await cmbContract.payments(PAYMENT_ID_2);
    expect(payment2.status).to.equal(CONFIRMED_STATUS);

    payment3 = await cmbContract.payments(PAYMENT_ID_3);
    expect(payment3.status).to.equal(CONFIRMED_STATUS);

    // Business Owners claim payment
    const balanceOfBo1BeforeClaim = await provider.getBalance(bo1.address);
    const balanceOfBo2BeforeClaim = await provider.getBalance(bo2.address);
    const balanceOfBo3BeforeClaim = await provider.getBalance(bo3.address);

    const claimTx1 = await cmbContract.connect(bo1).claim(PAYMENT_ID_1);
    const claimTx2 = await cmbContract.connect(bo2).claim(PAYMENT_ID_2);
    const claimTx3 = await cmbContract.connect(bo3).claim(PAYMENT_ID_3);

    const claimTxFee1 = await getTransactionFee(claimTx1, cmbContract);
    const claimTxFee2 = await getTransactionFee(claimTx2, cmbContract);
    const claimTxFee3 = await getTransactionFee(claimTx3, cmbContract);

    const serviceFee1 = await cmbContract.calculateServiceFee(payment1.amount);
    const serviceFee2 = await cmbContract.calculateServiceFee(payment2.amount);
    const serviceFee3 = await cmbContract.calculateServiceFee(payment3.amount);

    const balanceOfBo1AfterClaim = await provider.getBalance(bo1.address);
    const balanceOfBo2AfterClaim = await provider.getBalance(bo2.address);
    const balanceOfBo3AfterClaim = await provider.getBalance(bo3.address);

    expect(balanceOfBo1AfterClaim).to.be.equal(
      balanceOfBo1BeforeClaim.add(amount).sub(serviceFee1).sub(claimTxFee1),
    );
    expect(balanceOfBo2AfterClaim).to.be.equal(
      balanceOfBo2BeforeClaim.add(amount).sub(serviceFee1).sub(claimTxFee2),
    );
    expect(balanceOfBo3AfterClaim).to.be.equal(
      balanceOfBo3BeforeClaim.add(amount).sub(serviceFee1).sub(claimTxFee3),
    );

    payment1 = await cmbContract.payments(PAYMENT_ID_1);
    expect(payment1.status).to.equal(CLAIMED_STATUS);

    payment2 = await cmbContract.payments(PAYMENT_ID_2);
    expect(payment2.status).to.equal(CLAIMED_STATUS);

    payment3 = await cmbContract.payments(PAYMENT_ID_3);
    expect(payment3.status).to.equal(CLAIMED_STATUS);

    // Owner withdraw service fee total to 2 wallets
    const balanceOfReceiverBeforeWithdraw = await provider.getBalance(
      fundingReceiver1.address,
    );
    const balanceOfOwnerBeforeWithdraw = await provider.getBalance(
      owner.address,
    );
    const serviceFeeTotal = await cmbContract.serviceFeeTotal();

    const firstWithdrawnAmount = serviceFeeTotal.div(2);
    const secondWithdrawnAmount = serviceFeeTotal.sub(firstWithdrawnAmount);

    const withdrawTx1 = await cmbContract
      .connect(owner)
      .withdrawServiceFee(firstWithdrawnAmount, fundingReceiver1.address);

    const withdrawTx2 = await cmbContract
      .connect(owner)
      .withdrawServiceFee(secondWithdrawnAmount, owner.address);

    const withdrawTxFee1 = await getTransactionFee(withdrawTx1, cmbContract);
    const withdrawTxFee2 = await getTransactionFee(withdrawTx2, cmbContract);

    const balanceOfReceiverAfterWithdraw = await provider.getBalance(
      fundingReceiver1.address,
    );
    const balanceOfOwnerAfterWithdraw = await provider.getBalance(
      owner.address,
    );

    expect(balanceOfReceiverAfterWithdraw).to.equal(
      balanceOfReceiverBeforeWithdraw.add(firstWithdrawnAmount),
    );
    expect(balanceOfOwnerAfterWithdraw).to.equal(
      balanceOfOwnerBeforeWithdraw
        .add(secondWithdrawnAmount)
        .sub(withdrawTxFee1)
        .sub(withdrawTxFee2),
    );
    expect(await cmbContract.serviceFeeTotal()).to.equal(0);
  });
});
