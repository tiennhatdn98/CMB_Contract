const { ethers, upgrades } = require('hardhat');
const { expect } = require('chai');
const { add, sub } = require('js-big-decimal');
const { MAX_UINT256 } = require('@openzeppelin/test-helpers/src/constants');

const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000';
const INITIAL_STATUS = 0;
const PAID_STATUS = 1;
const CONFIRMED_STATUS = 2;
const CLAIMED_STATUS = 3;

const provider = waffle.provider;

describe('CMB - Unit test', () => {
  beforeEach(async () => {
    amount = 20000000;
    data = '0x666f6f6261720000000000000000000000000000000000000000000000000000';
    const accounts = await ethers.getSigners();
    bo = accounts[0];
    client = accounts[1];
    client2 = accounts[2];
    fundingReceiver = accounts[3];
    stranger = accounts[4];
    serviceFee = 2000000;

    CMB = await ethers.getContractFactory('CMB');
    cmbContract = await upgrades.deployProxy(CMB, [bo.address, serviceFee]);
  });

  describe('initialize', async () => {
    it('Should assign service fee and owner successfully', async () => {
      expect(await cmbContract.serviceFee()).to.equal(serviceFee);
      expect(await cmbContract.owner()).to.equal(bo.address);
    });
  });

  describe('requestPayment', async () => {
    it('Should request payment successfully', async () => {
      const tx = await cmbContract
        .connect(bo)
        .requestPayment(client.address, data, amount);

      const lastPaymentId = await cmbContract.lastPaymentId();
      const payment = await cmbContract.payments(lastPaymentId);
      expect(lastPaymentId).to.equal(1);
      expect(await payment.paymentId).to.equal(1);
      expect(await payment.bo).to.equal(bo.address);
      expect(await payment.client).to.equal(client.address);
      expect(await payment.data).to.equal(data);
      expect(await payment.amount).to.equal(amount);
      expect(await payment.status).to.equal(INITIAL_STATUS);
      expect(tx).to.emit(cmbContract, 'RequestedPayment');
    });

    it('Should request payment fail when client address is invalid', async () => {
      const tx = cmbContract
        .connect(bo)
        .requestPayment(ZERO_ADDRESS, data, amount);
      await expect(tx).to.be.revertedWith('Invalid address');
    });

    it('Should request payment fail when client address and business owner address are same', async () => {
      const tx = cmbContract
        .connect(bo)
        .requestPayment(bo.address, data, amount);
      await expect(tx).to.be.revertedWith(
        'Business Owner and Client can not be same',
      );
    });
  });

  describe('pay', async () => {
    beforeEach(async () => {
      await cmbContract
        .connect(bo)
        .requestPayment(client.address, data, amount);
      lastPaymentId = await cmbContract.lastPaymentId();
    });

    it('Should pay successfully, status will change to PAID and serviceTotalFee will be increased by serviceFee', async () => {
      const serviceFeeTotalBefore = await cmbContract.serviceFeeTotal();
      await cmbContract
        .connect(client)
        .pay(lastPaymentId, { value: amount + serviceFee });

      const payment = await cmbContract.payments(lastPaymentId);
      const serviceFeeTotalAfter = await cmbContract.serviceFeeTotal();
      expect(await payment.status).to.equal(PAID_STATUS);
      expect(serviceFeeTotalAfter).to.equal(
        serviceFeeTotalBefore.add(serviceFee),
      );
      expect(cmbContract).to.emit('Paid');
    });

    it('Should be fail when caller is not client', async () => {
      await expect(
        cmbContract
          .connect(stranger)
          .pay(lastPaymentId, { value: amount + serviceFee }),
      ).to.be.revertedWith('Only Client can do it');
    });

    it('Should be fail when this payment is invalid', async () => {
      const paymentId = 9999;
      await expect(
        cmbContract
          .connect(client)
          .pay(paymentId, { value: amount + serviceFee }),
      ).to.be.revertedWith('This payment is invalid');
    });

    it('Should be fail when client not pay enough amount payment', async () => {
      await expect(
        cmbContract.connect(client).pay(lastPaymentId, { value: amount }),
      ).to.be.revertedWith('Not enough fee according to payment');
    });
  });

  describe('confirmToRelease', async () => {
    beforeEach(async () => {
      await cmbContract
        .connect(bo)
        .requestPayment(client.address, data, amount);
    });
    it('Should confirm to release successfully, status will change to CONFIRMED', async () => {
      const lastPaymentId = cmbContract.lastPaymentId();
      await cmbContract
        .connect(client)
        .pay(lastPaymentId, { value: amount + serviceFee });
      await cmbContract.connect(client).confirmToRelease(lastPaymentId);

      const payment = await cmbContract.payments(lastPaymentId);
      expect(await payment.status).to.equal(CONFIRMED_STATUS);
      expect(cmbContract).to.emit('ConfirmedToRelease');
    });

    it('Should be fail when caller is not client', async () => {
      const lastPaymentId = cmbContract.lastPaymentId();
      await cmbContract
        .connect(client)
        .pay(lastPaymentId, { value: amount + serviceFee });
      await expect(
        cmbContract.connect(bo).confirmToRelease(lastPaymentId),
      ).to.be.revertedWith('Only Client can do it');
    });

    it('Should be fail when this payment is not paid by client', async () => {
      const lastPaymentId = cmbContract.lastPaymentId();
      await expect(
        cmbContract.connect(client).confirmToRelease(lastPaymentId),
      ).to.be.revertedWith('This payment needs to paid by client');
    });

    it('Should be fail when this payment is invalid', async () => {
      const paymentId = 9999;
      await expect(
        cmbContract.connect(client).confirmToRelease(paymentId),
      ).to.be.revertedWith('This payment is invalid');
    });
  });

  describe('claim', async () => {
    beforeEach(async () => {
      await cmbContract
        .connect(bo)
        .requestPayment(client.address, data, amount);
      lastPaymentId = await cmbContract.lastPaymentId();
      await cmbContract
        .connect(client)
        .pay(lastPaymentId, { value: amount + serviceFee });
    });

    it('Should claim successfully, status will change to CLAIMED', async () => {
      await cmbContract.connect(client).confirmToRelease(lastPaymentId);
      await cmbContract.connect(bo).claim(lastPaymentId);

      const payment = await cmbContract.payments(lastPaymentId);
      expect(await payment.status).to.equal(CLAIMED_STATUS);
      expect(cmbContract).to.emit('Claimed');
    });

    it('Should be fail when this payment is invalid', async () => {
      const paymentId = 9999;
      await expect(cmbContract.connect(bo).claim(paymentId)).to.be.revertedWith(
        'This payment is invalid',
      );
    });

    it('Should be fail when caller is not business owner', async () => {
      await cmbContract.connect(client).confirmToRelease(lastPaymentId);
      await expect(
        cmbContract.connect(client).claim(lastPaymentId),
      ).to.be.revertedWith('Only Business Owner can do it');
    });

    it('Should be fail when this payment is not confirmed by client', async () => {
      await expect(
        cmbContract.connect(bo).claim(lastPaymentId),
      ).to.be.revertedWith('This payment needs to confirmed by client');
    });
  });

  describe('withdrawServiceFee', async () => {
    beforeEach(async () => {
      serviceFeeAmount = 1000000;

      await cmbContract
        .connect(bo)
        .requestPayment(client.address, data, amount);
      lastPaymentId = cmbContract.lastPaymentId();
      await cmbContract
        .connect(client)
        .pay(lastPaymentId, { value: amount + serviceFee });
    });

    it('Should withdraw successfully', async () => {
      const boBalanceBefore = await provider.getBalance(bo.address);
      // console.log('BO balance before: ', boBalanceBefore);
      const serviceFeeTotalBefore = await cmbContract.serviceFeeTotal();

      await cmbContract
        .connect(bo)
        .withdrawServiceFee(serviceFeeAmount, fundingReceiver.address);

      const serviceFeeTotalAfter = await cmbContract.serviceFeeTotal();
      const boBalanceAfter = await provider.getBalance(bo.address);
      // console.log('BO balance After: ', boBalanceAfter);

      expect(serviceFeeTotalBefore).to.equal(
        serviceFeeTotalAfter.add(serviceFeeAmount),
      );
      expect(cmbContract).to.emit('WithdrawnServiceFee');
    });

    it('Should be fail when amount equal to zero', async () => {
      const amountFee = 0;

      await expect(
        cmbContract
          .connect(bo)
          .withdrawServiceFee(amountFee, fundingReceiver.address),
      ).to.be.revertedWith('Amount must be greater than 0');
    });

    it('Should be fail when amount is greater than service fee total', async () => {
      const amountFee = 10000000000000;

      await expect(
        cmbContract
          .connect(bo)
          .withdrawServiceFee(amountFee, fundingReceiver.address),
      ).to.be.revertedWith('Not enough to withdraw');
    });

    it('Should be fail when caller is not owner', async () => {
      const amountFee = 10000000000000;

      await expect(
        cmbContract
          .connect(client)
          .withdrawServiceFee(amountFee, fundingReceiver.address),
      ).to.be.revertedWith('Ownable: caller is not the owner');
    });

    it('Should be fail when funding receiver is an invalid address', async () => {
      const amountFee = 10000000000000;

      await expect(
        cmbContract.connect(bo).withdrawServiceFee(amountFee, ZERO_ADDRESS),
      ).to.be.revertedWith('Invalid address');
    });
  });

  describe('setServiceFee', async () => {
    it('Should set service fee successfully', async () => {
      await cmbContract.connect(bo).setServiceFee(amount);
      expect(await cmbContract.serviceFee()).to.equal(amount);
      expect(cmbContract).to.emit('SetServiceFee');
    });

    it('Should be fail when service fee is zero', async () => {
      await expect(cmbContract.connect(bo).setServiceFee(0)).to.be.revertedWith(
        'Service fee must be greather than 0',
      );
    });

    it('Should be fail when caller is not owner', async () => {
      await expect(
        cmbContract.connect(client).setServiceFee(amount),
      ).to.be.revertedWith('Ownable: caller is not the owner');
    });
  });

  describe('setClient', async () => {
    beforeEach(async () => {
      await cmbContract
        .connect(bo)
        .requestPayment(client.address, data, amount);
    });

    it('Should set client successfully', async () => {
      const lastPaymentId = cmbContract.lastPaymentId();
      await cmbContract.connect(bo).setClient(lastPaymentId, client2.address);

      const payment = await cmbContract.payments(lastPaymentId);
      expect(payment.client).to.equal(client2.address);
      expect(cmbContract).to.emit('SetClient');
    });

    it('Should be fail when caller is not business owner', async () => {
      const lastPaymentId = cmbContract.lastPaymentId();
      await expect(
        cmbContract.connect(client).setClient(lastPaymentId, client2.address),
      ).to.be.revertedWith('Only Business Owner can do it');
    });

    it('Should be fail when client is an invalid address', async () => {
      const lastPaymentId = cmbContract.lastPaymentId();
      await expect(
        cmbContract.connect(bo).setClient(lastPaymentId, ZERO_ADDRESS),
      ).to.be.revertedWith('Invalid address');
    });

    it('Should be fail when this payment is invalid', async () => {
      const paymentId = 9999;
      await expect(
        cmbContract.connect(bo).setClient(paymentId, ZERO_ADDRESS),
      ).to.be.revertedWith('This payment is invalid');
    });
  });

  describe('setData', async () => {
    beforeEach(async () => {
      await cmbContract
        .connect(bo)
        .requestPayment(client.address, data, amount);
      newData =
        '0x123f6f6261720000000000000000000000000000000000000000000000000000';
    });

    it('Should set data successfully', async () => {
      const lastPaymentId = cmbContract.lastPaymentId();
      await cmbContract.connect(bo).setData(lastPaymentId, newData);

      const payment = await cmbContract.payments(lastPaymentId);
      expect(payment.data).to.equal(newData);
      expect(cmbContract).to.emit('SetData');
    });

    it('Should be fail when caller is not business owner', async () => {
      const lastPaymentId = cmbContract.lastPaymentId();
      await expect(
        cmbContract.connect(client).setData(lastPaymentId, newData),
      ).to.be.revertedWith('Only Business Owner can do it');
    });

    it('Should be fail when this payment is invalid', async () => {
      const paymentId = 9999;
      await expect(
        cmbContract.connect(bo).setData(paymentId, newData),
      ).to.be.revertedWith('This payment is invalid');
    });
  });

  describe('setAmount', async () => {
    beforeEach(async () => {
      await cmbContract
        .connect(bo)
        .requestPayment(client.address, data, amount);
      newAmount = 12345678;
      lastPaymentId = cmbContract.lastPaymentId();
    });

    it('Should set amount payment successfully', async () => {
      await cmbContract.connect(bo).setAmount(lastPaymentId, newAmount);

      const payment = await cmbContract.payments(lastPaymentId);
      expect(payment.amount).to.equal(newAmount);
      expect(cmbContract).to.emit('SetAmount');
    });

    it('Should be fail when caller is not business owner', async () => {
      await expect(
        cmbContract.connect(client).setAmount(lastPaymentId, newAmount),
      ).to.be.revertedWith('Only Business Owner can do it');
    });

    it('Should be fail when this payment is invalid', async () => {
      const paymentId = 9999;
      await expect(
        cmbContract.connect(bo).setAmount(paymentId, newAmount),
      ).to.be.revertedWith('This payment is invalid');
    });

    it('Should be fail when amount fee is zero', async () => {
      await expect(
        cmbContract.connect(bo).setAmount(lastPaymentId, 0),
      ).to.be.revertedWith('Amount must be greater than 0');
    });
  });
});
