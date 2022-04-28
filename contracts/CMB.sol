// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

contract CMB {
    struct Payment {
        address payable bo;
        address payable client;
        string data;
        uint256 fee;
        Status status;
    }

    /*
     * Status:
     * After BO creates payment: INITIAL,
     * After Client escrows money: ESCROWED,
     * After Client confirm to release money: CONFIRMED
     * After BO release money: RELEASED
     * After Client withdraw money: FINISHED
    */
    enum Status { INITIAL, ESCROWED, CONFIRMED, RELEASED, FINISHED }

    mapping(uint256 => Payment) public payments;

    event CreatePayment(uint256 indexed paymentId, address payable bo, address payable client, string data, uint fee);
    event EscrowMoney(uint256 indexed paymentId);
    event ConfirmToRelease(uint256 indexed paymentId);
    event ReleaseMoney(uint256 indexed paymentId);
    event Withdraw(uint256 indexed paymentId);

    function createPayment(uint paymentId, address payable client, string memory data, uint fee) public {
        require(
            msg.sender != client, 
            "Business Owner and Client can not be same"
        );

        address payable bo = payable(msg.sender);
        uint256 convertedFee = fee * 1 ether;

        payments[paymentId] = Payment(bo, client, data, convertedFee, Status.INITIAL);
        emit CreatePayment(paymentId, bo, client, data, convertedFee);
    }

    function escrowMoney(uint paymentId) public payable {
        Payment storage payment = payments[paymentId];
        require(
            msg.sender == payment.client,
            "Only Client can escrow money"
        );
        require(
            payment.status == Status.INITIAL, 
            "Payment need to created"
        );
        require(
            msg.value == payment.fee, 
            "Not enough fee according to payment"
        );

        payment.status = Status.ESCROWED;
        emit EscrowMoney(paymentId);
    }

    function confirmToRelease(uint paymentId) public {
        Payment storage payment = payments[paymentId];
        require(
            msg.sender == payment.client 
            && payment.status == Status.ESCROWED, 
            "Only Client can confirm to release money and money must be escrowed"
        );
        
        payment.status = Status.CONFIRMED;
        emit ConfirmToRelease(paymentId);
    }

    function releaseMoney(uint paymentId) public payable {
        Payment storage payment = payments[paymentId];
        require(
            msg.sender == payment.bo 
            && payment.status == Status.CONFIRMED, 
            "Only Business Owner can release money and it must be confirmed by client"
        );

        payable(msg.sender).transfer(payment.fee);
        payment.status = Status.RELEASED;
        emit ReleaseMoney(paymentId);
    }
}