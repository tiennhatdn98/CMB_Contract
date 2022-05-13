const { ethers, upgrades } = require('hardhat');
const { expect } = require('chai');
const {
  MAX_UINT256,
  ZERO_ADDRESS,
} = require('@openzeppelin/test-helpers/src/constants');

const REQUESTING_STATUS = 0;
const PAID_STATUS = 1;
const CONFIRMED_STATUS = 2;
const CLAIMED_STATUS = 3;
const BEGINNING_PAYMENT_ID = 1;
const NOT_EXISTED_PAYMENT_ID = 9999;

const WEIGHT_DECIMAL = 1e6;
const DEFAULT_FEE_PERCENTAGE = 15e5;

const provider = ethers.provider;
const getTransactionFee = require('../utils/getTransactionFee');

const chai = require('chai');
chai.use(require('chai-bignumber')());

describe('CMB - Unit test', () => {
  beforeEach(async () => {
    amount = ethers.utils.parseEther('0.01');
    data = '0x666f6f6261720000000000000000000000000000000000000000000000000000';
    const accounts = await ethers.getSigners();
    bo = accounts[0];
    client = accounts[1];
    client2 = accounts[2];
    fundingReceiver = accounts[3];
    stranger = accounts[4];
    // serviceFee = ethers.utils.parseEther('0.002');

    CMB = await ethers.getContractFactory('CMB');
    cmbContract = await upgrades.deployProxy(CMB, [bo.address]);
  });

  describe('initialize', async () => {
    it('Should assign service fee and owner successfully', async () => {
      expect(await cmbContract.serviceFeePercent()).to.equal(
        DEFAULT_FEE_PERCENTAGE,
      );
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
      expect(lastPaymentId).to.equal(BEGINNING_PAYMENT_ID);
      expect(await payment.paymentId).to.equal(BEGINNING_PAYMENT_ID);
      expect(await payment.bo).to.equal(bo.address);
      expect(await payment.client).to.equal(client.address);
      expect(await payment.data).to.equal(data);
      expect(await payment.amount).to.equal(amount);
      expect(await payment.status).to.equal(REQUESTING_STATUS);
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

    it('Should pay successfully, status will change to PAID and serviceTotalFee will be increased by service fee ', async () => {
      const balanceOfClientBefore = await provider.getBalance(client.address);
      const balanceOfContractBefore = await provider.getBalance(
        cmbContract.address,
      );

      const serviceFeeTotalBefore = await cmbContract.serviceFeeTotal();

      // const totalFeeNeedToPay = amount.add(serviceFee);
      const transaction = await cmbContract
        .connect(client)
        .pay(lastPaymentId, { value: amount });

      const payment = await cmbContract.payments(lastPaymentId);
      const serviceFee = await cmbContract.calculateServiceFee(payment.amount);

      const serviceFeeTotalAfter = await cmbContract.serviceFeeTotal();

      const balanceOfContractAfter = await provider.getBalance(
        cmbContract.address,
      );
      const balanceOfClientAfter = await provider.getBalance(client.address);

      const txFee = await getTransactionFee(transaction, cmbContract);

      expect(await payment.status).to.equal(PAID_STATUS);
      expect(serviceFeeTotalAfter).to.equal(
        serviceFeeTotalBefore.add(serviceFee),
      );
      expect(balanceOfClientAfter).to.equal(
        balanceOfClientBefore.sub(amount).sub(txFee),
      );
      expect(balanceOfContractAfter).to.equal(
        balanceOfContractBefore.add(amount),
      );
      expect(cmbContract).to.emit('Paid');
    });

    it('Should be fail when caller is not client', async () => {
      await expect(
        cmbContract.connect(stranger).pay(lastPaymentId, { value: amount }),
      ).to.be.revertedWith('Only Client can do it');
    });

    it('Should be fail when this payment is invalid', async () => {
      await expect(
        cmbContract
          .connect(client)
          .pay(NOT_EXISTED_PAYMENT_ID, { value: amount }),
      ).to.be.revertedWith('This payment is invalid');
    });

    it('Should be fail when client not pay enough amount payment', async () => {
      await expect(
        cmbContract
          .connect(client)
          .pay(lastPaymentId, { value: amount.sub(1) }),
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
      await cmbContract.connect(client).pay(lastPaymentId, { value: amount });
      await cmbContract.connect(client).confirmToRelease(lastPaymentId);

      const payment = await cmbContract.payments(lastPaymentId);
      expect(await payment.status).to.equal(CONFIRMED_STATUS);
      expect(cmbContract).to.emit('ConfirmedToRelease');
    });

    it('Should be fail when caller is not client', async () => {
      const lastPaymentId = cmbContract.lastPaymentId();
      await cmbContract.connect(client).pay(lastPaymentId, { value: amount });
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
      await expect(
        cmbContract.connect(client).confirmToRelease(NOT_EXISTED_PAYMENT_ID),
      ).to.be.revertedWith('This payment is invalid');
    });
  });

  describe('claim', async () => {
    beforeEach(async () => {
      await cmbContract
        .connect(bo)
        .requestPayment(client.address, data, amount);
      lastPaymentId = await cmbContract.lastPaymentId();
      await cmbContract.connect(client).pay(lastPaymentId, { value: amount });
    });

    it('Should claim successfully, status will change to CLAIMED', async () => {
      const balanceOfBoBefore = await provider.getBalance(bo.address);
      const balanceOfContractBefore = await provider.getBalance(
        cmbContract.address,
      );

      await cmbContract.connect(client).confirmToRelease(lastPaymentId);
      const transaction = await cmbContract.connect(bo).claim(lastPaymentId);

      const txFee = await getTransactionFee(transaction, cmbContract);

      const balanceOfBoAfter = await provider.getBalance(bo.address);
      const balanceOfContractAfter = await provider.getBalance(
        cmbContract.address,
      );

      const payment = await cmbContract.payments(lastPaymentId);
      const serviceFee = await cmbContract.calculateServiceFee(payment.amount);
      const receivedAmount = payment.amount.sub(serviceFee);

      expect(await payment.status).to.equal(CLAIMED_STATUS);
      expect(balanceOfBoAfter).to.equal(
        balanceOfBoBefore.add(receivedAmount).sub(txFee),
      );
      expect(balanceOfContractAfter).to.equal(
        balanceOfContractBefore.sub(receivedAmount),
      );
      expect(cmbContract).to.emit('Claimed');
    });

    it('Should be fail when this payment is invalid', async () => {
      await expect(
        cmbContract.connect(bo).claim(NOT_EXISTED_PAYMENT_ID),
      ).to.be.revertedWith('This payment is invalid');
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
      await cmbContract
        .connect(bo)
        .requestPayment(client.address, data, amount);
      lastPaymentId = cmbContract.lastPaymentId();
      await cmbContract.connect(client).pay(lastPaymentId, { value: amount });

      serviceFeeTotal = await cmbContract.serviceFeeTotal();
    });

    it('Should withdraw successfully', async () => {
      const balanceOfReceiverBefore = await provider.getBalance(
        fundingReceiver.address,
      );
      const balanceOfBoBefore = await provider.getBalance(bo.address);
      const balanceOfContractBefore = await provider.getBalance(
        cmbContract.address,
      );
      const serviceFeeTotalBefore = await cmbContract.serviceFeeTotal();

      const transaction = await cmbContract
        .connect(bo)
        .withdrawServiceFee(serviceFeeTotal, fundingReceiver.address);

      const txFee = await getTransactionFee(transaction, cmbContract);

      const serviceFeeTotalAfter = await cmbContract.serviceFeeTotal();
      const balanceOfReceiverAfter = await provider.getBalance(
        fundingReceiver.address,
      );
      const balanceOfBoAfter = await provider.getBalance(bo.address);
      const balanceOfContractAfter = await provider.getBalance(
        cmbContract.address,
      );

      expect(balanceOfReceiverAfter).to.equal(
        balanceOfReceiverBefore.add(serviceFeeTotal),
      );
      expect(balanceOfBoAfter).to.equal(balanceOfBoBefore.sub(txFee));
      expect(serviceFeeTotalBefore).to.equal(
        serviceFeeTotalAfter.add(serviceFeeTotal),
      );
      expect(cmbContract).to.emit('WithdrawnServiceFee');
    });

    it('Should be fail when amount equal to zero', async () => {
      const ZERO_FEE = 0;

      await expect(
        cmbContract
          .connect(bo)
          .withdrawServiceFee(ZERO_FEE, fundingReceiver.address),
      ).to.be.revertedWith('Amount must be greater than 0');
    });

    it('Should be fail when amount is greater than service fee total', async () => {
      const amountFee = ethers.utils.parseEther('0.1');

      await expect(
        cmbContract
          .connect(bo)
          .withdrawServiceFee(amountFee, fundingReceiver.address),
      ).to.be.revertedWith('Not enough to withdraw');
    });

    it('Should be fail when caller is not owner', async () => {
      await expect(
        cmbContract
          .connect(client)
          .withdrawServiceFee(serviceFeeTotal, fundingReceiver.address),
      ).to.be.revertedWith('Ownable: caller is not the owner');
    });

    it('Should be fail when funding receiver is an invalid address', async () => {
      await expect(
        cmbContract
          .connect(bo)
          .withdrawServiceFee(serviceFeeTotal, ZERO_ADDRESS),
      ).to.be.revertedWith('Invalid address');
    });
  });

  describe('setServiceFeePercent', async () => {
    const newServiceFeePercentage = 25;
    it('Should set service fee successfully', async () => {
      await cmbContract
        .connect(bo)
        .setServiceFeePercent(newServiceFeePercentage);
      const serviceFeePercent = await cmbContract.serviceFeePercent();
      expect(await cmbContract.serviceFeePercent()).to.equal(serviceFeePercent);
      expect(cmbContract).to.emit('SetServiceFee');
    });

    it('Should be fail when service fee is zero', async () => {
      await expect(
        cmbContract.connect(bo).setServiceFeePercent(0),
      ).to.be.revertedWith('Service fee percentage must be greather than 0');
    });

    it('Should be fail when caller is not owner', async () => {
      await expect(
        cmbContract.connect(client).setServiceFeePercent(amount),
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
      await expect(
        cmbContract.connect(bo).setClient(NOT_EXISTED_PAYMENT_ID, ZERO_ADDRESS),
      ).to.be.revertedWith('This payment is invalid');
    });

    it('Should be fail when this payment status is not requesting', async () => {
      const lastPaymentId = await cmbContract.lastPaymentId();
      await cmbContract.connect(client).pay(lastPaymentId, { value: amount });
      await expect(
        cmbContract.connect(bo).setClient(lastPaymentId, client2.address),
      ).to.be.revertedWith('This payment needs to be requested');
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
      await expect(
        cmbContract.connect(bo).setData(NOT_EXISTED_PAYMENT_ID, newData),
      ).to.be.revertedWith('This payment is invalid');
    });

    it('Should be fail when this payment status is not requesting', async () => {
      const lastPaymentId = await cmbContract.lastPaymentId();
      await cmbContract.connect(client).pay(lastPaymentId, { value: amount });
      await expect(
        cmbContract.connect(bo).setData(lastPaymentId, newData),
      ).to.be.revertedWith('This payment needs to be requested');
    });
  });

  describe('setAmount', async () => {
    beforeEach(async () => {
      await cmbContract
        .connect(bo)
        .requestPayment(client.address, data, amount);
      newAmount = ethers.utils.parseEther('0.012345');
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
      await expect(
        cmbContract.connect(bo).setAmount(NOT_EXISTED_PAYMENT_ID, newAmount),
      ).to.be.revertedWith('This payment is invalid');
    });

    it('Should be fail when amount fee is zero', async () => {
      const ZERO_AMOUNT = 0;
      await expect(
        cmbContract.connect(bo).setAmount(lastPaymentId, ZERO_AMOUNT),
      ).to.be.revertedWith('Amount must be greater than 0');
    });

    it('Should be fail when this payment status is not requesting', async () => {
      const lastPaymentId = await cmbContract.lastPaymentId();
      await cmbContract.connect(client).pay(lastPaymentId, { value: amount });
      await expect(
        cmbContract.connect(bo).setAmount(lastPaymentId, newAmount),
      ).to.be.revertedWith('This payment needs to be requested');
    });
  });
});
