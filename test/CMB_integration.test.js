const { ethers, waffle } = require('hardhat');
const { expect } = require('chai');
const { MAX_UINT256 } = require('@openzeppelin/test-helpers/src/constants');
const { add, subtract, multiply, divide } = require('js-big-decimal');

const chai = require('chai');
chai.use(require('chai-bignumber')());

describe('CMB - Integration test', () => {
  before(async () => {
    provider = waffle.provider;
    INITIAL_STATUS = 0;
    PAID_STATUS = 1;
    CONFIRMED_STATUS = 2;
    CLAIMED_STATUS = 3;
    accounts = await ethers.getSigners();
    [owner, bo, fundingReceiver, client, client2, client3] = accounts;
    serviceFee = 2000000;
    paymentId = 1;
    amount = 20000000;
    data = '0x666f6f6261720000000000000000000000000000000000000000000000000000';

    const CMB = await ethers.getContractFactory('CMB');
    cmbContract = await upgrades.deployProxy(CMB, [bo.address, serviceFee]);
  });

  it('request payment for 1 client', async () => {
    const requestPaymentTx = await cmbContract
      .connect(bo)
      .requestPayment(client.address, data, amount);

    let lastPaymentId = cmbContract.lastPaymentId();
    expect(await cmbContract.lastPaymentId()).to.equal(1);

    const payment = await cmbContract.payments(lastPaymentId);
    expect(await payment.bo).to.equal(bo.address);
    expect(await payment.client).to.equal(client.address);
    expect(await payment.data).to.equal(data);
    expect(await payment.amount).to.equal(amount);
    expect(await payment.status).to.equal(INITIAL_STATUS);
    expect(requestPaymentTx).to.emit(cmbContract, 'RequestedPayment');

    const clientBalanceBefore = await provider.getBalance(client.address);

    const serviceFeeTotalBeforePaid = await cmbContract.serviceFeeTotal();
    const payTx = await cmbContract
      .connect(client)
      .pay(lastPaymentId, { value: amount + serviceFee });
    const serviceFeeTotalAfterPaid = await cmbContract.serviceFeeTotal();

    const clientBalanceAfter = await provider.getBalance(client.address);
    expect(await serviceFeeTotalAfterPaid).to.equal(
      serviceFeeTotalBeforePaid.add(serviceFee),
    );
    expect(payTx).to.emit(cmbContract, 'Paid');
    expect(Number.parseInt(clientBalanceBefore)).to.be.greaterThan(
      Number.parseInt(clientBalanceAfter),
    );

    const confirmTx = await cmbContract
      .connect(client)
      .confirmToRelease(lastPaymentId);
    const confirmedPayment = await cmbContract.payments(lastPaymentId);
    expect(confirmTx).to.emit(cmbContract, 'Confirmed');
    expect(confirmedPayment.status).to.be.equal(CONFIRMED_STATUS);

    const claimedTx = await cmbContract.connect(bo).claim(lastPaymentId);
    // const balanceOfBoBeforeClaim = await provider.getBalance(bo.address);
    // const balanceOfBoAfterClaim = await provider.getBalance(bo.address);
    // console.log('Before claim: ', balanceOfBoBeforeClaim);
    // console.log('After claim: ', balanceOfBoAfterClaim);
    // expect(Number.parseInt(balanceOfBoAfterClaim)).to.be.greaterThan(
    //   Number.parseInt(balanceOfBoBeforeClaim),
    // );

    const claimedPayment = await cmbContract.payments(lastPaymentId);
    expect(claimedPayment.status).to.be.equal(CLAIMED_STATUS);
    expect(claimedTx).to.emit(cmbContract, 'Claimed');

    const serviceFeeTotalBeforeWithdraw = await cmbContract.serviceFeeTotal();
    const withdrawnfeeAmount = 123456;
    const withdrawServiceFeeTx = await cmbContract
      .connect(bo)
      .withdrawServiceFee(withdrawnfeeAmount, fundingReceiver.address);
    const serviceFeeTotalAfterWithdraw = await cmbContract.serviceFeeTotal();
    expect(await serviceFeeTotalAfterWithdraw).to.equal(
      serviceFeeTotalBeforeWithdraw.sub(withdrawnfeeAmount),
    );
    expect(withdrawServiceFeeTx).to.emit('WithdrawnServiceFee');
  });

  it('request payment for client2 and client3', async () => {
    await cmbContract.connect(bo).requestPayment(client2.address, data, amount);
    cmbContract.connect(bo).requestPayment(client3.address, data, amount);

    const PAYMENT_2_ID = 2;
    const PAYMENT_3_ID = 3;

    let lastPaymentId = await cmbContract.lastPaymentId();
    expect(await cmbContract.lastPaymentId()).to.equal(PAYMENT_3_ID);

    const payment2 = await cmbContract.payments(PAYMENT_2_ID);
    expect(await payment2.bo).to.equal(bo.address);
    expect(await payment2.client).to.equal(client2.address);
    expect(await payment2.data).to.equal(data);
    expect(await payment2.amount).to.equal(amount);
    expect(await payment2.status).to.equal(INITIAL_STATUS);

    const payment3 = await cmbContract.payments(PAYMENT_3_ID);
    expect(await payment3.bo).to.equal(bo.address);
    expect(await payment3.client).to.equal(client3.address);
    expect(await payment3.data).to.equal(data);
    expect(await payment3.amount).to.equal(amount);
    expect(await payment3.status).to.equal(INITIAL_STATUS);
    expect(cmbContract).to.emit(cmbContract, 'RequestedPayment');

    const clientBalanceBefore = await provider.getBalance(client2.address);

    const serviceFeeTotalBeforePaid = await cmbContract.serviceFeeTotal();
    const payTx = await cmbContract
      .connect(client2)
      .pay(lastPaymentId, { value: amount + serviceFee });
    const serviceFeeTotalAfterPaid = await cmbContract.serviceFeeTotal();

    const clientBalanceAfter = await provider.getBalance(client2.address);
    expect(await serviceFeeTotalAfterPaid).to.equal(
      serviceFeeTotalBeforePaid.add(serviceFee),
    );
    expect(payTx).to.emit(cmbContract, 'Paid');
    expect(Number.parseInt(clientBalanceBefore)).to.be.greaterThan(
      Number.parseInt(clientBalanceAfter),
    );

    const confirmTx = await cmbContract
      .connect(client2)
      .confirmToRelease(PAYMENT_2_ID);
    const confirmedPayment = await cmbContract.payments(PAYMENT_2_ID);
    expect(confirmTx).to.emit(cmbContract, 'Confirmed');
    expect(confirmedPayment.status).to.be.equal(CONFIRMED_STATUS);

    const claimedTx = await cmbContract.connect(bo).claim(PAYMENT_2_ID);

    const claimedPayment = await cmbContract.payments(PAYMENT_2_ID);
    expect(claimedPayment.status).to.be.equal(CLAIMED_STATUS);
    expect(claimedTx).to.emit(cmbContract, 'Claimed');

    const serviceFeeTotalBeforeWithdraw = await cmbContract.serviceFeeTotal();
    const withdrawnfeeAmount = 123456;
    const withdrawServiceFeeTx = await cmbContract
      .connect(bo)
      .withdrawServiceFee(withdrawnfeeAmount, fundingReceiver.address);
    const serviceFeeTotalAfterWithdraw = await cmbContract.serviceFeeTotal();
    expect(await serviceFeeTotalAfterWithdraw).to.equal(
      serviceFeeTotalBeforeWithdraw.sub(withdrawnfeeAmount),
    );
    expect(withdrawServiceFeeTx).to.emit('WithdrawnServiceFee');
  });
});
