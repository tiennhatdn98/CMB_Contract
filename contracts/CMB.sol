// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "@openzeppelin/contracts/access/Ownable.sol";

contract CMB is Ownable {
    struct Payment {
        address bo;
        address client;
        bytes32 data;
        uint256 amount;
        Status status;
    }

    /*
     * Status:
     * After BO creates payment: INITIAL,
     * After Client escrows money: PAID,
     * After Client confirm to release money: CONFIRMED
     * After BO release money: RELEASED
     * After Client withdraw money: FINISHED
    */
    enum Status { INITIAL, PAID, CONFIRMED, RELEASED, FINISHED }

    mapping(uint256 => Payment) public payments;
    uint256 public serviceFeeTotal;
    uint256 public serviceFee;

    event RequestPayment(uint256 indexed paymentId, address indexed bo, address indexed client, bytes32 data, uint256 amount);
    event Pay(uint256 indexed paymentId);
    event ConfirmToRelease(uint256 indexed paymentId);
    event Claim(uint256 indexed paymentId);
    event WithdrawServiceFee(uint256 amount, address indexed fundingReceiver);

    modifier onlyValidAddress(address _address) {
        uint32 size;
        assembly {
            size := extcodesize(_address)
        }
        require((size <= 0) && _address != address(0), "Invalid address");
        _;
    }

    modifier onlyBusinessOwner(uint256 paymentId) {
        require(msg.sender == payments[paymentId].bo, "Only Business Owner can do it");
        _;
    }

    modifier onlyClient(uint256 paymentId) {
        require(msg.sender == payments[paymentId].client, "Only Client can do it");
        _;
    }

    modifier onlyOnInitialPayment(uint256 paymentId) {
        require(payments[paymentId].status == Status.INITIAL, "This payment needs to initialized");
        _;
    }

    constructor() {
        serviceFee = 0.02 ether;
    }

    /** 
     *  @notice Get amount of payment by payment ID
     * 
     *  @dev    Anyone can call this function. 
     * 
     *          Name        Meaning 
     *  @param  paymentId   ID of payment that needs to get fee 
     */ 
    function getPaymentAmount(uint256 paymentId) external view returns (uint256) {
        return payments[paymentId].amount;
    }

    /** 
     *  @notice Set service fee
     * 
     *  @dev    Only owner can call this function. 
     * 
     *          Name        Meaning 
     *  @param  _amount     Amount of service fee that want to update 
     */ 
    function setServiceFee(uint256 _amount) external onlyOwner {
        serviceFee = _amount;
    }

    /** 
     *  @notice Set Client of payment by payment ID
     * 
     *  @dev    Only Business Owner can call this function and payment needs to be initialized. 
     * 
     *          Name        Meaning 
     *  @param  paymentId   ID of payment that needs to be updated 
     */ 
    function setClient(uint256 paymentId, address _client) external onlyBusinessOwner(paymentId) onlyOnInitialPayment(paymentId) {
        payments[paymentId].client = _client;
    }

    /** 
     *  @notice Set encrypt data of payment by payment ID
     * 
     *  @dev    Only Business Owner can call this function and payment needs to be initialized. 
     * 
     *          Name        Meaning 
     *  @param  paymentId   ID of payment that needs to be updated 
     */ 
    function setData(uint256 paymentId, bytes32 _data) external onlyBusinessOwner(paymentId) onlyOnInitialPayment(paymentId) {
        payments[paymentId].data = _data;
    }

    /** 
     *  @notice Set amount of payment by payment ID
     * 
     *  @dev    Only Business Owner can call this function and payment needs to be initialized. 
     * 
     *          Name        Meaning 
     *  @param  paymentId   ID of payment that needs to be updated 
     */ 
    function setAmount(uint256 paymentId, uint256 _amount) external onlyBusinessOwner(paymentId) onlyOnInitialPayment(paymentId) {
        payments[paymentId].amount = _amount;
    }

    /** 
     *  @notice Create a payment
     * 
     *  @dev    Anyone can call this function. 
     * 
     *          Name        Meaning 
     *  @param  paymentId   ID of payment that needs to be updated 
     *  @param  client      Address of client 
     *  @param  data        Encrypt sensitive data
     *  @param  amount      Payment fee
     */
    function requestPayment(uint256 paymentId, address client, bytes32 data, uint256 amount) external onlyValidAddress(client) {
        require(
            msg.sender != client, 
            "Business Owner and Client can not be same"
        );
        require(amount > 0, "Amount must be greater than 0");

        payments[paymentId] = Payment(msg.sender, client, data, amount, Status.INITIAL);
        emit RequestPayment(paymentId, msg.sender, client, data, amount);
    }

    /** 
     *  @notice Make payment
     * 
     *  @dev    Only Client can call this function. 
     * 
     *          Name        Meaning 
     *  @param  paymentId   ID of payment that needs to be updated
     */
    function pay(uint256 paymentId) external payable onlyClient(paymentId) onlyOnInitialPayment(paymentId) {
        require(
            msg.value == payments[paymentId].amount + serviceFee, 
            "Not enough fee according to payment"
        );

        payments[paymentId].status = Status.PAID;
        serviceFeeTotal += serviceFee;
        emit Pay(paymentId);
    }

    /** 
     *  @notice Confirm to release money
     * 
     *  @dev    Only Client can call this function. 
     * 
     *          Name        Meaning 
     *  @param  paymentId   ID of payment that needs to be updated
     */
    function confirmToRelease(uint256 paymentId) external onlyClient(paymentId) {
        require(payments[paymentId].status == Status.PAID, "This payment needs to paid by client");
        
        payments[paymentId].status = Status.CONFIRMED;
        emit ConfirmToRelease(paymentId);
    }

    /** 
     *  @notice Claim payment
     * 
     *  @dev    Only Business Owner can call this function. 
     * 
     *          Name        Meaning 
     *  @param  paymentId   ID of payment that needs to be updated
     */
    function claim(uint256 paymentId) external payable onlyBusinessOwner(paymentId) {
        require(payments[paymentId].status == Status.CONFIRMED, "This payment needs to confirmed by client");

        payments[paymentId].status = Status.RELEASED;
        payable(msg.sender).transfer(payments[paymentId].amount);
        emit Claim(paymentId);
    }

    /** 
     *  @notice Withdraw amount of service fee to specific address
     * 
     *  @dev    Only Owner can call this function. 
     * 
     *          Name                Meaning 
     *  @param  _amount             Amount of service fee that want to withdraw
     *  @param  _fundingReceiver    Address that want to transfer
     */
    function withdrawServiceFee(uint256 _amount, address _fundingReceiver) external payable onlyOwner {
        require(_amount <= serviceFeeTotal, "Not enough to withdraw");

        serviceFeeTotal -= _amount;
        payable(_fundingReceiver).transfer(_amount);
        emit WithdrawServiceFee(_amount, _fundingReceiver);
    }
}
