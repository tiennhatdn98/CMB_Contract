// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/security/ReentrancyGuardUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";

contract CMBV2 is Initializable, OwnableUpgradeable, ReentrancyGuardUpgradeable {
    /*
     *  @notice Payment struct is information of payment includes: address of business owner and client, encrypt sensitive data, amount and status of payment
     */
    struct Payment {
        uint256 paymentId;
        address bo;
        address client;
        bytes32 data;
        uint256 amount;
        uint256 paidAmount;
        uint256 numberOfInstallment;
        uint256[] amountPerInstallment;
        uint256 numberOfPaidTimes;
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
        uint256 amount,
        uint256 numberOfInstallment,
        uint256[] amountPerInstallment
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
    function requestPayment(
        address client, 
        bytes32 data, 
        uint256 amount, 
        uint256 numberOfInstallment, 
        uint256[] memory amountPerInstallment
    ) 
        external 
        onlyValidAddress(client) 
    {
        require(
            _msgSender() != client, 
            "Business Owner and Client can not be same"
        );
        lastPaymentId++;
        payments[lastPaymentId] = Payment(
            lastPaymentId, 
            _msgSender(), 
            client, 
            data, 
            amount, 
            0, 
            numberOfInstallment, 
            amountPerInstallment, 
            0,
            Status.REQUESTING
        );
        emit RequestedPayment(
            lastPaymentId, 
            _msgSender(), 
            client, 
            data, 
            amount,  
            numberOfInstallment,
            amountPerInstallment
        );
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
        Payment storage payment = payments[paymentId];
        require(msg.value > 0, "You must pay greater than 0");
        require(
            msg.value >= payment.amountPerInstallment[payment.numberOfPaidTimes], 
            "You must pay equal or greater than amount per installment"
        );

        payment.paidAmount += msg.value;
        payment.numberOfPaidTimes++;
        if (
            payment.paidAmount >= payment.amount || 
            payment.numberOfInstallment == payment.numberOfPaidTimes
        ) {
            payments[paymentId].status = Status.PAID;
        }
        emit Paid(paymentId);
    }
}