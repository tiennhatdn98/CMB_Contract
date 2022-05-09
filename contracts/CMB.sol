// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

contract CMB {
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

    event RequestPayment(uint256 indexed paymentId, address indexed bo, address indexed client, bytes32 data, uint256 amount);
    event Pay(uint256 indexed paymentId);
    event ConfirmToRelease(uint256 indexed paymentId);
    event Claim(uint256 indexed paymentId);

    modifier onlyValidAddress(address _addr) {
        uint32 size;
        assembly {
            size := extcodesize(_addr)
        }
        require((size <= 0) && _addr != address(0), "Invalid address");
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

    modifier onlyUserInPayment(uint256 paymentId) {
        require(
            msg.sender == payments[paymentId].bo || msg.sender == payments[paymentId].client, 
            "Only Client can do it"
        );
        _;
    }

    modifier onlyOnInitialPayment(uint256 paymentId) {
        require(payments[paymentId].status == Status.INITIAL, "This payment needs to initialized");
        _;
    }

    /** 
     *  @notice Get amount of payment by payment ID
     * 
     *  @dev    Only user in payment can call this function. 
     * 
     *          Name        Meaning 
     *  @param  paymentId   ID of payment that needs to get fee 
     */ 
    function fee(uint256 paymentId) external view onlyUserInPayment(paymentId) returns (uint256) {
        return payments[paymentId].amount;
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
            msg.value == payments[paymentId].amount, 
            "Not enough fee according to payment"
        );

        payments[paymentId].status = Status.PAID;
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

        payable(msg.sender).transfer(payments[paymentId].amount);
        payments[paymentId].status = Status.RELEASED;
        emit Claim(paymentId);
    }
}
