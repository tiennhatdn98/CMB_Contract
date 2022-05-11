// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/security/ReentrancyGuardUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";

contract CMB is Initializable, OwnableUpgradeable, ReentrancyGuardUpgradeable {
    /*
     *  @notice Payment struct is information of payment includes: address of business owner and client, encrypt sensitive data, amount and status of payment
     */
    struct Payment {
        uint256 paymentId;
        address bo;
        address client;
        bytes32 data;
        uint256 amount;
        Status status;
    }

    /**
     *  Status enum
     *          Suit                                Value
     *           |                                    |
     *  After Business Owner requests payment       REQUESTING
     *  After Client escrows money                  PAID
     *  After Client confirms to release money      CONFIRMED
     *  After Business Owner claims money           CLAIMED
     */
    enum Status { REQUESTING, PAID, CONFIRMED, CLAIMED }

    /**
     *  @notice Mapping payment ID to a payment detail
     */
    mapping(uint256 => Payment) public payments;

    /**
     *  @notice serviceFeeTotal unit256 is total of service fee
     */
    uint256 public serviceFeeTotal;

    /**
     *  @notice serviceFee uint256 is service fee of each payment
     */
    uint256 public serviceFee;

    /**
     *  @notice lastPaymentId uint256 is the latest requested payment ID started by 1
     */
    uint256 public lastPaymentId;

    event RequestedPayment(uint256 indexed paymentId, address indexed bo, address indexed client, bytes32 data, uint256 amount);
    event Paid(uint256 indexed paymentId);
    event ConfirmedToRelease(uint256 indexed paymentId);
    event Claimed(uint256 indexed paymentId);
    event WithdrawnServiceFee(uint256 amount, address indexed fundingReceiver);

    event SetClient(address oldClient, address newClient);
    event SetData(bytes32 oldData, bytes32 newData);
    event SetAmount(uint256 oldAmount, uint256 newAmount);
    event SetServiceFee(uint256 oldAmount, uint256 newAmount);

    modifier onlyValidAddress(address _address) {
        uint32 size;
        assembly {
            size := extcodesize(_address)
        }
        require((size <= 0) && _address != address(0), "Invalid address");
        _;
    }

    modifier onlyBusinessOwner(uint256 paymentId) {
        require(_msgSender() == payments[paymentId].bo, "Only Business Owner can do it");
        _;
    }

    modifier onlyClient(uint256 paymentId) { 
        require(_msgSender() == payments[paymentId].client, "Only Client can do it");
        _;
    }

    modifier onlyValidPayment(uint256 paymentId) {
        require(paymentId > 0 && paymentId <= lastPaymentId, "This payment is invalid");
        _;
    }

    modifier onlyRequestingPayment(uint256 paymentId) {
        require(payments[paymentId].status == Status.REQUESTING, "This payment needs to be requested");
        _;
    }

    /**
     *  @notice Initialize new logic contract.
     */
    function initialize(address _owner, uint256 _serviceFee) public initializer {
        OwnableUpgradeable.__Ownable_init();
        transferOwnership(_owner);
        serviceFee = _serviceFee;
    }

    /** 
     *  @notice Get amount of payment by payment ID
     * 
     *  @dev    Anyone can call this function. 
     * 
     *          Name        Meaning 
     *  @param  paymentId   ID of payment that needs to get fee 
     *
     *          Type        Meaning
     *  @return uint256     Amount of payment by payment ID 
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
     *  @param  _amount     Amount of service fee that want to be updated
     */ 
    function setServiceFee(uint256 _amount) external onlyOwner {
        require(_amount > 0, "Service fee must be greather than 0");
        uint256 oldAmount = serviceFee;
        serviceFee = _amount;
        emit SetServiceFee(oldAmount, _amount);
    }

    /** 
     *  @notice Set Client of payment by payment ID
     * 
     *  @dev    Only Business Owner can call this function and payment needs to be initialized. 
     * 
     *          Name        Meaning 
     *  @param  paymentId   ID of payment that needs to be updated 
     */ 
    function setClient(uint256 paymentId, address _client) external onlyValidPayment(paymentId) onlyBusinessOwner(paymentId) onlyRequestingPayment(paymentId) onlyValidAddress(_client) {
        address oldClient = payments[paymentId].client;
        payments[paymentId].client = _client;
        emit SetClient(oldClient, _client);
    }

    /** 
     *  @notice Set encrypt data of payment by payment ID
     * 
     *  @dev    Only Business Owner can call this function and payment needs to be initialized. 
     * 
     *          Name        Meaning 
     *  @param  paymentId   ID of payment that needs to be updated 
     */ 
    function setData(uint256 paymentId, bytes32 _data) external onlyValidPayment(paymentId) onlyBusinessOwner(paymentId) onlyRequestingPayment(paymentId) {
        bytes32 oldData = payments[paymentId].data;
        payments[paymentId].data = _data;
        emit SetData(oldData, _data);
    }

    /** 
     *  @notice Set amount of payment by payment ID
     * 
     *  @dev    Only Business Owner can call this function and payment needs to be initialized. 
     * 
     *          Name        Meaning 
     *  @param  paymentId   ID of payment that needs to be updated 
     */ 
    function setAmount(uint256 paymentId, uint256 _amount) external onlyValidPayment(paymentId) onlyBusinessOwner(paymentId) onlyRequestingPayment(paymentId) {
        require(_amount > 0, "Amount must be greater than 0");
        uint256 oldAmount = payments[paymentId].amount;
        payments[paymentId].amount = _amount;
        emit SetAmount(oldAmount, _amount);
    }

    /** 
     *  @notice Create a payment
     * 
     *  @dev    Anyone can call this function. 
     * 
     *          Name        Meaning 
     *  @param  client      Address of client 
     *  @param  data        Encrypt sensitive data
     *  @param  amount      Payment fee
     */
    function requestPayment(address client, bytes32 data, uint256 amount) external onlyValidAddress(client) {
        require(
            _msgSender() != client, 
            "Business Owner and Client can not be same"
        );
        lastPaymentId++;
        payments[lastPaymentId] = Payment(lastPaymentId, _msgSender(), client, data, amount, Status.REQUESTING);
        emit RequestedPayment(lastPaymentId, _msgSender(), client, data, amount);
    }

    /** 
     *  @notice Client make payment
     * 
     *  @dev    Only Client can call this function. 
     * 
     *          Name        Meaning 
     *  @param  paymentId   ID of payment that needs to be updated
     */
    function pay(uint256 paymentId) external payable onlyValidPayment(paymentId) onlyClient(paymentId) nonReentrant {
        require(
            msg.value == payments[paymentId].amount + serviceFee, 
            "Not enough fee according to payment"
        );

        payments[paymentId].status = Status.PAID;
        serviceFeeTotal += serviceFee;
        emit Paid(paymentId);
    }

    /** 
     *  @notice Client confirm to release money
     * 
     *  @dev    Only Client can call this function. 
     * 
     *          Name        Meaning 
     *  @param  paymentId   ID of payment that needs to be updated
     */
    function confirmToRelease(uint256 paymentId) external onlyValidPayment(paymentId) onlyClient(paymentId) {
        require(payments[paymentId].status == Status.PAID, "This payment needs to paid by client");
        
        payments[paymentId].status = Status.CONFIRMED;
        emit ConfirmedToRelease(paymentId);
    }

    /** 
     *  @notice Business Owner claim payment
     * 
     *  @dev    Only Business Owner can call this function. 
     * 
     *          Name        Meaning 
     *  @param  paymentId   ID of payment that needs to be updated
     */
    function claim(uint256 paymentId) external payable onlyValidPayment(paymentId) onlyBusinessOwner(paymentId) nonReentrant {
        require(payments[paymentId].status == Status.CONFIRMED, "This payment needs to confirmed by client");

        payments[paymentId].status = Status.CLAIMED;
        payable(_msgSender()).transfer(payments[paymentId].amount);
        emit Claimed(paymentId);
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
    function withdrawServiceFee(uint256 _amount, address _fundingReceiver) external payable onlyOwner onlyValidAddress(_fundingReceiver) {
        require(_amount > 0, "Amount must be greater than 0");
        require(_amount <= serviceFeeTotal, "Not enough to withdraw");

        serviceFeeTotal -= _amount;
        payable(_fundingReceiver).transfer(_amount);
        emit WithdrawnServiceFee(_amount, _fundingReceiver);
    }
}