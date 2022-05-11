const { ethers, waffle } = require('hardhat');
const { expect } = require('chai');
const { MAX_UINT256 } = require('@openzeppelin/test-helpers/src/constants');
const { add, subtract, multiply, divide } = require('js-big-decimal');

describe('CMB - Integration', () => {
  before(async () => {
    provider = waffle.provider;
    INITIAL_STATUS = 0;
    PAID_STATUS = 1;
    CONFIRMED_STATUS = 2;
    CLAIMED_STATUS = 3;
    accounts = await ethers.getSigners();
    [owner, bo, client, client2, client3] = accounts;
    serviceFee = 2000000;
    paymentId = 1;
    amount = 20000000;
    data = '0x666f6f6261720000000000000000000000000000000000000000000000000000';

    const CMB = await ethers.getContractFactory('CMB');
    cmbContract = await upgrades.deployProxy(CMB, [bo.address, serviceFee]);
  });

  it('request payment for client1, client2', async () => {
    const requestPaymentTx = await cmbContract
      .connect(bo)
      .requestPayment(paymentId, client.address, data, amount);

    const payment = await cmbContract.payments(paymentId);

    expect(await payment.bo).to.equal(bo.address);
    expect(await payment.client).to.equal(client.address);
    expect(await payment.data).to.equal(data);
    expect(await payment.amount).to.equal(amount);
    expect(await payment.status).to.equal(INITIAL_STATUS);
    expect(requestPaymentTx).to.emit(cmbContract, 'RequestedPayment');

    const clientBalanceBefore = await provider.getBalance(client.address);
    console.log('clientBalanceBefore', clientBalanceBefore);

    const serviceFeeBefore = await cmbContract.serviceFeeTotal();
    const payTx = await cmbContract
      .connect(client)
      .pay(paymentId, { value: amount + serviceFee });
    const serviceFeeAfter = await cmbContract.serviceFeeTotal();

    const clientBalanceAfter = await provider.getBalance(client.address);
    console.log('clientBalanceAfter', clientBalanceAfter);

    expect(await serviceFeeAfter).to.equal(serviceFeeBefore.add(serviceFee));
    expect(payTx).to.emit(cmbContract, 'Paid');
    expect(clientBalanceAfter).to.be.bignumber.lessThan(clientBalanceBefore);
  });
});
