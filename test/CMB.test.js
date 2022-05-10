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
  let CMB, cmbContract;
  let serviceFee;
  let bo, client, client2, fundingReceiver, stranger;

  const paymentId = 1;
  const amount = 20000000;
  const data =
    '0x666f6f6261720000000000000000000000000000000000000000000000000000';
  beforeEach(async () => {
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
        .requestPayment(paymentId, client.address, data, amount);
      const payment = await cmbContract.payments(paymentId);
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
        .requestPayment(paymentId, ZERO_ADDRESS, data, amount);
      await expect(tx).to.be.revertedWith('Invalid address');
    });

    it('Should request payment fail when client address and business owner address are same', async () => {
      const tx = cmbContract
        .connect(bo)
        .requestPayment(paymentId, bo.address, data, amount);
      await expect(tx).to.be.revertedWith(
        'Business Owner and Client can not be same',
      );
    });
  });

  describe('pay', async () => {
    it('Should pay successfully, status will change to PAID and serviceTotalFee will be added serviceFee', async () => {
      const serviceFeeTotalBefore = await cmbContract.serviceFeeTotal();
      await cmbContract
        .connect(bo)
        .requestPayment(paymentId, client.address, data, amount);
      await cmbContract
        .connect(client)
        .pay(paymentId, { value: amount + serviceFee });

      const payment = await cmbContract.payments(paymentId);
      const serviceFeeTotalAfter = await cmbContract.serviceFeeTotal();
      expect(await payment.status).to.equal(PAID_STATUS);
      expect(serviceFeeTotalAfter).to.equal(
        serviceFeeTotalBefore.add(serviceFee),
      );
      expect(cmbContract).to.emit('Paid');
    });

    it('Should be fail when caller is not client', async () => {
      await cmbContract
        .connect(bo)
        .requestPayment(paymentId, client.address, data, amount);
      await expect(
        cmbContract
          .connect(stranger)
          .pay(paymentId, { value: amount + serviceFee }),
      ).to.be.revertedWith('Only Client can do it');
    });

    it('Should be fail when this payment is not requested', async () => {
      await expect(
        cmbContract.connect(client).pay(paymentId, { value: amount }),
      ).to.be.revertedWith('Only Client can do it');
    });

    it('Should be fail when client not pay enough amount', async () => {
      await cmbContract
        .connect(bo)
        .requestPayment(paymentId, client.address, data, amount);
      await expect(
        cmbContract.connect(client).pay(paymentId, { value: amount }),
      ).to.be.revertedWith('Not enough fee according to payment');
    });
  });

  describe('confirmToRelease', async () => {
    it('Should confirm to release successfully, status will change to CONFIRMED', async () => {
      await cmbContract
        .connect(bo)
        .requestPayment(paymentId, client.address, data, amount);
      await cmbContract
        .connect(client)
        .pay(paymentId, { value: amount + serviceFee });
      await cmbContract.connect(client).confirmToRelease(paymentId);

      const payment = await cmbContract.payments(paymentId);
      expect(await payment.status).to.equal(CONFIRMED_STATUS);
      expect(cmbContract).to.emit('ConfirmedToRelease');
    });

    it('Should be fail when caller is not client', async () => {
      await cmbContract
        .connect(bo)
        .requestPayment(paymentId, client.address, data, amount);
      await cmbContract
        .connect(client)
        .pay(paymentId, { value: amount + serviceFee });
      await expect(
        cmbContract.connect(bo).confirmToRelease(paymentId),
      ).to.be.revertedWith('Only Client can do it');
    });

    it('Should be fail when this payment is not paid by client', async () => {
      await cmbContract
        .connect(bo)
        .requestPayment(paymentId, client.address, data, amount);

      await expect(
        cmbContract.connect(client).confirmToRelease(paymentId),
      ).to.be.revertedWith('This payment needs to paid by client');
    });
  });

  describe('claim', async () => {
    it('Should claim successfully, status will change to CLAIMED', async () => {
      await cmbContract
        .connect(bo)
        .requestPayment(paymentId, client.address, data, amount);
      await cmbContract
        .connect(client)
        .pay(paymentId, { value: amount + serviceFee });
      await cmbContract.connect(client).confirmToRelease(paymentId);
      await cmbContract.connect(bo).claim(paymentId);

      const payment = await cmbContract.payments(paymentId);
      expect(await payment.status).to.equal(CLAIMED_STATUS);
      expect(cmbContract).to.emit('Claimed');
    });

    it('Should be fail when caller is not business owner', async () => {
      await cmbContract
        .connect(bo)
        .requestPayment(paymentId, client.address, data, amount);
      await cmbContract
        .connect(client)
        .pay(paymentId, { value: amount + serviceFee });
      await cmbContract.connect(client).confirmToRelease(paymentId);
      await expect(
        cmbContract.connect(client).claim(paymentId),
      ).to.be.revertedWith('Only Business Owner can do it');
    });

    it('Should be fail when this payment is not confirmed by client', async () => {
      await cmbContract
        .connect(bo)
        .requestPayment(paymentId, client.address, data, amount);
      await cmbContract
        .connect(client)
        .pay(paymentId, { value: amount + serviceFee });
      await expect(cmbContract.connect(bo).claim(paymentId)).to.be.revertedWith(
        'This payment needs to confirmed by client',
      );
    });
  });

  describe('withdrawServiceFee', async () => {
    it('Should withdraw successfully', async () => {
      const amount = 1000000;

      await cmbContract
        .connect(bo)
        .requestPayment(paymentId, client.address, data, amount);
      await cmbContract
        .connect(client)
        .pay(paymentId, { value: amount + serviceFee });

      const boBalanceBefore = await provider.getBalance(bo.address);
      console.log('BO balance before: ', boBalanceBefore);
      const serviceFeeTotalBefore = await cmbContract.serviceFeeTotal();

      await cmbContract
        .connect(bo)
        .withdrawServiceFee(amount, fundingReceiver.address);

      const serviceFeeTotalAfter = await cmbContract.serviceFeeTotal();
      const boBalanceAfter = await provider.getBalance(bo.address);
      console.log('BO balance After: ', boBalanceAfter);

      expect(serviceFeeTotalBefore).to.equal(serviceFeeTotalAfter.add(amount));
      expect(cmbContract).to.emit('WithdrawnServiceFee');
    });

    it('Should be fail when amount equal to zero', async () => {
      const amountFee = 0;

      await cmbContract
        .connect(bo)
        .requestPayment(paymentId, client.address, data, amount);
      await cmbContract
        .connect(client)
        .pay(paymentId, { value: amount + serviceFee });

      await expect(
        cmbContract
          .connect(bo)
          .withdrawServiceFee(amountFee, fundingReceiver.address),
      ).to.be.revertedWith('Amount must be greater than 0');
    });

    it('Should be fail when amount is greater than service fee total', async () => {
      const amountFee = 10000000000000;
      await cmbContract
        .connect(bo)
        .requestPayment(paymentId, client.address, data, amount);
      await cmbContract
        .connect(client)
        .pay(paymentId, { value: amount + serviceFee });

      await expect(
        cmbContract
          .connect(bo)
          .withdrawServiceFee(amountFee, fundingReceiver.address),
      ).to.be.revertedWith('Not enough to withdraw');
    });

    it('Should be fail when caller is not owner', async () => {
      const amountFee = 10000000000000;
      await cmbContract
        .connect(bo)
        .requestPayment(paymentId, client.address, data, amount);
      await cmbContract
        .connect(client)
        .pay(paymentId, { value: amount + serviceFee });

      await expect(
        cmbContract
          .connect(client)
          .withdrawServiceFee(amountFee, fundingReceiver.address),
      ).to.be.revertedWith('Ownable: caller is not the owner');
    });

    it('Should be fail when funding receiver is an invalid address', async () => {
      const amountFee = 10000000000000;
      await cmbContract
        .connect(bo)
        .requestPayment(paymentId, client.address, data, amount);
      await cmbContract
        .connect(client)
        .pay(paymentId, { value: amount + serviceFee });

      await expect(
        cmbContract.connect(bo).withdrawServiceFee(amountFee, ZERO_ADDRESS),
      ).to.be.revertedWith('Invalid address');
    });
  });

  describe('getPaymentAmount', async () => {
    it('Should get payment amount successfully', async () => {
      await cmbContract
        .connect(bo)
        .requestPayment(paymentId, client.address, data, amount);
      const paymentAmount = await cmbContract.getPaymentAmount(paymentId);
      expect(paymentAmount).to.equal(amount);
    });

    it('Should be zero when this payment is not requested', async () => {
      const paymentAmount = await cmbContract.getPaymentAmount(paymentId);
      expect(paymentAmount).to.equal(0);
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
    it('Should set client successfully', async () => {
      await cmbContract
        .connect(bo)
        .requestPayment(paymentId, client.address, data, amount);
      await cmbContract.connect(bo).setClient(paymentId, client2.address);

      const payment = await cmbContract.payments(paymentId);
      expect(payment.client).to.equal(client2.address);
      expect(cmbContract).to.emit('SetClient');
    });

    it('Should be fail when caller is not business owner', async () => {
      await cmbContract
        .connect(bo)
        .requestPayment(paymentId, client.address, data, amount);
      await expect(
        cmbContract.connect(client).setClient(paymentId, client2.address),
      ).to.be.revertedWith('Only Business Owner can do it');
    });

    it('Should be fail when client is an invalid address', async () => {
      await cmbContract
        .connect(bo)
        .requestPayment(paymentId, client.address, data, amount);
      await expect(
        cmbContract.connect(bo).setClient(paymentId, ZERO_ADDRESS),
      ).to.be.revertedWith('Invalid address');
    });

    it('Should be fail when this payment is not created', async () => {
      await expect(
        cmbContract.connect(bo).setClient(paymentId, ZERO_ADDRESS),
      ).to.be.revertedWith('Only Business Owner can do it');
    });
  });

  describe('setData', async () => {
    const newData =
      '0x123f6f6261720000000000000000000000000000000000000000000000000000';
    it('Should set data successfully', async () => {
      await cmbContract
        .connect(bo)
        .requestPayment(paymentId, client.address, data, amount);
      await cmbContract.connect(bo).setData(paymentId, newData);

      const payment = await cmbContract.payments(paymentId);
      expect(payment.data).to.equal(newData);
      expect(cmbContract).to.emit('SetData');
    });

    it('Should be fail when caller is not business owner', async () => {
      await cmbContract
        .connect(bo)
        .requestPayment(paymentId, client.address, data, amount);
      await expect(
        cmbContract.connect(client).setData(paymentId, newData),
      ).to.be.revertedWith('Only Business Owner can do it');
    });

    it('Should be fail when this payment is not created', async () => {
      await expect(
        cmbContract.connect(bo).setData(paymentId, newData),
      ).to.be.revertedWith('Only Business Owner can do it');
    });
  });

  describe('setAmount', async () => {
    const newAmount = 12345678;
    it('Should set data successfully', async () => {
      await cmbContract
        .connect(bo)
        .requestPayment(paymentId, client.address, data, amount);
      await cmbContract.connect(bo).setAmount(paymentId, newAmount);

      const payment = await cmbContract.payments(paymentId);
      expect(payment.amount).to.equal(newAmount);
      expect(cmbContract).to.emit('SetAmount');
    });

    it('Should be fail when caller is not business owner', async () => {
      await cmbContract
        .connect(bo)
        .requestPayment(paymentId, client.address, data, amount);
      await expect(
        cmbContract.connect(client).setAmount(paymentId, newAmount),
      ).to.be.revertedWith('Only Business Owner can do it');
    });

    it('Should be fail when this payment is not created', async () => {
      await expect(
        cmbContract.connect(bo).setAmount(paymentId, newAmount),
      ).to.be.revertedWith('Only Business Owner can do it');
    });
  });
});
