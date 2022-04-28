const { expect } = require("chai");
const { ethers, waffle } = require("hardhat");

describe("CMB", function () {
  let CMB;
  let cmbContract;
  let bo, client, stranger;
  const provider = waffle.provider;

  before(async () => {
    [bo, client, stranger] = await ethers.getSigners();
    CMB = await ethers.getContractFactory("CMB");
    cmbContract = await CMB.deploy();
    await cmbContract.deployed();
  });

  it("Should create payment successfully", async () => {
    const paymentId = 1;
    const fee = 1; // ETH
    const feeConverted = ethers.utils.parseEther(fee.toString());
    const data = "abcxyz";

    const tx = await cmbContract
      .connect(bo)
      .createPayment(paymentId, client.address, data, fee);
    const payment = await cmbContract.payments(paymentId);
    expect(await payment.bo).to.equal(bo.address);
    expect(await payment.client).to.equal(client.address);
    expect(await payment.data).to.equal(data);
    expect(await payment.fee).to.equal(feeConverted);
    expect(await payment.status).to.equal(0);
    expect(tx).to.emit(cmbContract, "CreatePayment");
  });

  it("Should create fail when business owner and client are same", async () => {
    const paymentId = 1;
    const fee = ethers.utils.parseEther("1");
    const data = "abcxyz";

    await expect(
      cmbContract.connect(bo).createPayment(paymentId, bo.address, data, fee)
    ).to.be.revertedWith("Business Owner and Client can not be same");
  });

  describe("Test function", async () => {
    let payment;
    const paymentId = 1;
    const fee = 1;
    const feeConverted = ethers.utils.parseEther(fee.toString());
    const data = "abcxyz";

    beforeEach(async () => {
      await cmbContract
        .connect(bo)
        .createPayment(paymentId, client.address, data, fee);
    });

    describe("Function escrowMoney", async () => {
      it("Should escrow money successfully", async () => {
        const tx = await cmbContract
          .connect(client)
          .escrowMoney(paymentId, { value: feeConverted });
        payment = await cmbContract.payments(paymentId);
        expect(await payment.status).to.equal(1);
        expect(tx).to.emit(cmbContract, "EscrowMoney");
      });

      it("Should escrow money fail when client pay not enough fee", async () => {
        const clientPaid = ethers.utils.parseEther("0.5");
        payment = await cmbContract.payments(paymentId);
        await expect(
          cmbContract
            .connect(client)
            .escrowMoney(paymentId, { value: clientPaid })
        ).to.be.revertedWith("Not enough fee according to payment");
      });

      it("Should escrow money fail when stranger do it", async () => {
        await expect(
          cmbContract.connect(stranger).escrowMoney(paymentId)
        ).to.be.revertedWith("Only Client can escrow money");
      });

      // it("Should escrow money fail when payment is not created", async () => {
      //   const paymentIdNotExisted = 9999;
      //   await expect(
      //     cmbContract.connect(client).escrowMoney(paymentIdNotExisted)
      //   ).to.be.revertedWith(
      //     "Only Client can escrow money and payment need to created"
      //   );
      // });
    });

    describe("Function confirmToRelease", async () => {
      beforeEach(async () => {
        await cmbContract
          .connect(client)
          .escrowMoney(paymentId, { value: feeConverted });
      });
      it("Should confirm to release money successfully", async () => {
        const tx = await cmbContract
          .connect(client)
          .confirmToRelease(paymentId);
        payment = await cmbContract.payments(paymentId);
        expect(await payment.status).to.equal(2);
        expect(tx).to.emit(cmbContract, "ConfirmToRelease");
      });

      it("Should confirm to release fail when stranger do it", async () => {
        await expect(
          cmbContract.connect(stranger).confirmToRelease(paymentId)
        ).to.be.revertedWith(
          "Only Client can confirm to release money and money must be escrowed"
        );
      });

      it("Should confirm to release fail when payment is not created", async () => {
        const paymentIdNotExisted = 9999;
        await expect(
          cmbContract.connect(client).confirmToRelease(paymentIdNotExisted)
        ).to.be.revertedWith(
          "Only Client can confirm to release money and money must be escrowed"
        );
      });
    });

    describe("Function releaseMoney", async () => {
      beforeEach(async () => {
        await cmbContract
          .connect(client)
          .escrowMoney(paymentId, { value: feeConverted });
        await cmbContract.connect(client).confirmToRelease(paymentId);
      });

      it("Should confirm to release successfully", async () => {
        const tx = await cmbContract.connect(bo).releaseMoney(paymentId);
        payment = await cmbContract.payments(paymentId);
        expect(await payment.status).to.equal(3);
        expect(tx).to.emit(cmbContract, "ReleaseMoney");
      });

      it("Should release money fail when stranger do it", async () => {
        await expect(
          cmbContract.connect(stranger).releaseMoney(paymentId)
        ).to.be.revertedWith(
          "Only Business Owner can release money and it must be confirmed by client"
        );
      });

      it("Should release money fail when payment is not created", async () => {
        const paymentIdNotExisted = 9999;
        await expect(
          cmbContract.connect(client).releaseMoney(paymentIdNotExisted)
        ).to.be.revertedWith(
          "Only Business Owner can release money and it must be confirmed by client"
        );
      });
    });

    // describe("Function withdraw", async () => {
    //   it("Should withdraw successfully", async () => {
    //     const clientBalanceBefore = await provider.getBalance(client.address);
    //     console.log("Before: ", clientBalanceBefore);
    //     const tx = await cmbContract.connect(client).withdraw(paymentId);
    //     payment = await cmbContract.payments(paymentId);
    //     const clientBalanceAfter = await provider.getBalance(client.address);
    //     console.log("After: ", clientBalanceAfter);
    //     expect(await payment.status).to.equal(4);
    //     expect(clientBalanceAfter).to.greaterThan(clientBalanceBefore);
    //     // console.log("Alo: ", clientBalanceAfter.sub(clientBalanceBefore));
    //     // expect(clientBalanceAfter).to.equal(
    //     //   clientBalanceBefore.add(payment.fee)
    //     // );
    //     expect(tx).to.emit(cmbContract, "Withdraw");
    //   });

    //   it("Should withdraw fail when stranger do it", async () => {
    //     await expect(
    //       cmbContract.connect(stranger).withdraw(paymentId)
    //     ).to.be.revertedWith("Only Client can withdraw money");
    //     await expect(
    //       cmbContract.connect(bo).withdraw(paymentId)
    //     ).to.be.revertedWith("Only Client can withdraw money");
    //   });

    //   it("Should withdraw fail when payment is not created", async () => {
    //     const paymentIdNotExisted = 9999;
    //     await expect(
    //       cmbContract.connect(client).withdraw(paymentIdNotExisted)
    //     ).to.be.revertedWith("Only Client can withdraw money");
    //   });
    // });
  });
});
