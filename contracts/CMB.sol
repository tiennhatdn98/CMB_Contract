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
     *  Status enum is status of a payment
     *
     *          Suit                                Value
     *           |                                    |
     *  After Business Owner requests payment       REQUESTING
     *  After Client escrows money                  PAID
     *  After Client confirms to release money      CONFIRMED
     *  After Business Owner claims payment         CLAIMED
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
    uint256 public serviceFeePercent;

    /**
     *  @notice lastPaymentId uint256 is the latest requested payment ID started by 1
     */
    uint256 public lastPaymentId;

    /**
     *  @notice WEIGHT_DECIMAL uint256 constant is the weight decimal to avoid float number when calculating service fee by percentage
     */
    uint256 private constant WEIGHT_DECIMAL = 1e6;

    event RequestedPayment(
        uint256 indexed paymentId, 
        address indexed bo, 
        address indexed client, 
        bytes32 data, 
        uint256 amount
    );
    event Paid(uint256 indexed paymentId);
    event ConfirmedToRelease(uint256 indexed paymentId);
    event Claimed(uint256 indexed paymentId);
    event WithdrawnServiceFee(uint256 amount, address indexed fundingReceiver);

    event SetClient(address oldClient, address newClient);
    event SetData(bytes32 oldData, bytes32 newData);
    event SetAmount(uint256 oldAmount, uint256 newAmount);
    event ServiceFeePercent(uint256 oldAmount, uint256 newAmount);

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
    function initialize(address _owner) public initializer {
        OwnableUpgradeable.__Ownable_init();
        transferOwnership(_owner);
        serviceFeePercent = 15 * WEIGHT_DECIMAL / 10;
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
     *          Name                    Meaning 
     *  @param  newSeriveFeePercent     New service fee percent that want to be updated
     *  
     *  Emit event {ServiceFeePercent}
     */ 
    function setServiceFeePercent(uint256 newSeriveFeePercent) external onlyOwner {
        require(newSeriveFeePercent > 0, "Service fee percentage must be greather than 0");
        uint256 oldAmount = serviceFeePercent;
        serviceFeePercent = newSeriveFeePercent * WEIGHT_DECIMAL;
        emit ServiceFeePercent(oldAmount, newSeriveFeePercent);
    }

    /** 
     *  @notice Set Client of payment by payment ID
     * 
     *  @dev    Only Business Owner can call this function and payment needs to be initialized. 
     * 
     *          Name        Meaning 
     *  @param  paymentId   ID of payment that needs to be updated 
     *  
     *  Emit event {SetClient}
     */ 
    function setClient(uint256 paymentId, address newClient) 
        external 
        onlyValidPayment(paymentId) 
        onlyBusinessOwner(paymentId) 
        onlyRequestingPayment(paymentId) 
        onlyValidAddress(newClient) 
    {
        address oldClient = payments[paymentId].client;
        payments[paymentId].client = newClient;
        emit SetClient(oldClient, newClient);
    }

    /** 
     *  @notice Set encrypt data of payment by payment ID
     * 
     *  @dev    Only Business Owner can call this function and payment needs to be initialized. 
     * 
     *          Name        Meaning 
     *  @param  paymentId   ID of payment that needs to be updated 
     *
     *  Emit event {SetData}
     */ 
    function setData(uint256 paymentId, bytes32 newData) 
        external 
        onlyValidPayment(paymentId) 
        onlyBusinessOwner(paymentId) 
        onlyRequestingPayment(paymentId) 
    {
        bytes32 oldData = payments[paymentId].data;
        payments[paymentId].data = newData;
        emit SetData(oldData, newData);
    }

    /** 
     *  @notice Set amount of payment by payment ID
     * 
     *  @dev    Only Business Owner can call this function and payment needs to be initialized. 
     * 
     *          Name        Meaning 
     *  @param  paymentId   ID of payment that needs to be updated 
     *
     *  Emit event {SetAmount}
     */ 
    function setAmount(uint256 paymentId, uint256 newAmount) 
        external 
        onlyValidPayment(paymentId) 
        onlyBusinessOwner(paymentId) 
        onlyRequestingPayment(paymentId) 
    {
        require(newAmount > 0, "Amount must be greater than 0");
        uint256 oldAmount = payments[paymentId].amount;
        payments[paymentId].amount = newAmount;
        emit SetAmount(oldAmount, newAmount);
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
     *
     *  Emit event {RequestedPayment}
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
     *  @notice Client make payment by payment ID
     * 
     *  @dev    Only Client can call this function. 
     * 
     *          Name        Meaning 
     *  @param  paymentId   ID of payment that needs to be updated
     *
     *  Emit event {Paid}
     */
    function pay(uint256 paymentId) 
        external 
        payable 
        onlyValidPayment(paymentId) 
        onlyClient(paymentId) 
        nonReentrant 
    {
        require(
            msg.value == payments[paymentId].amount, 
            "Not enough fee according to payment"
        );

        uint256 amount = payments[paymentId].amount;
        uint256 serviceFee = calculateServiceFee(amount);

        payments[paymentId].status = Status.PAID;
        serviceFeeTotal += serviceFee;
        emit Paid(paymentId);
    }

    /** 
     *  @notice Client confirm to release money by payment ID
     * 
     *  @dev    Only Client can call this function. 
     * 
     *          Name        Meaning 
     *  @param  paymentId   ID of payment that needs to be updated
     *
     *  Emit event {ConfirmedToRelease}
     */
    function confirmToRelease(uint256 paymentId) 
        external 
        onlyValidPayment(paymentId) 
        onlyClient(paymentId) 
    {
        require(payments[paymentId].status == Status.PAID, "This payment needs to paid by client");
        
        payments[paymentId].status = Status.CONFIRMED;
        emit ConfirmedToRelease(paymentId);
    }

    /** 
     *  @notice Business Owner claim payment by payment ID
     * 
     *  @dev    Only Business Owner can call this function. 
     * 
     *          Name        Meaning 
     *  @param  paymentId   ID of payment that needs to be updated
     *
     *  Emit event {Claimed}
     */
    function claim(uint256 paymentId) 
        external 
        payable 
        onlyValidPayment(paymentId) 
        onlyBusinessOwner(paymentId) 
        nonReentrant 
    {
        require(payments[paymentId].status == Status.CONFIRMED, "This payment needs to confirmed by client");

        uint256 amount = payments[paymentId].amount;
        uint256 serviceFee = calculateServiceFee(amount);
        payments[paymentId].status = Status.CLAIMED;
        payable(_msgSender()).transfer(amount - serviceFee);
        emit Claimed(paymentId);
    }

    /** 
     *  @notice Withdraw `_amount` of service fee to `_fundingReceiver` address
     * 
     *  @dev    Only Owner can call this function. 
     * 
     *          Name                Meaning 
     *  @param  _amount             Amount of service fee that want to withdraw
     *  @param  _fundingReceiver    Address that want to transfer
     *
     *  Emit event {WithdrawnServiceFee}
     */
    function withdrawServiceFee(uint256 _amount, address _fundingReceiver) 
        external 
        payable 
        onlyOwner 
        onlyValidAddress(_fundingReceiver) 
    {
        require(_amount > 0, "Amount must be greater than 0");
        require(_amount <= serviceFeeTotal, "Not enough to withdraw");

        serviceFeeTotal -= _amount;
        payable(_fundingReceiver).transfer(_amount);
        emit WithdrawnServiceFee(_amount, _fundingReceiver);
    }

    /** 
     *  @notice Calculate service fee by amount payment
     * 
     *  @dev    Service fee equal amount of payment mutiply serviceFeePercent. The actual service fee will be divided by WEIGHT_DECIMAL and 100
     * 
     *          Name                Meaning 
     *  @param  amount              Amount of service fee that want to withdraw
     */
    function calculateServiceFee(uint256 amount) public view returns(uint256) {
        uint256 serviceFee = (amount * serviceFeePercent) / (WEIGHT_DECIMAL * 100);

        return serviceFee;
    }
}