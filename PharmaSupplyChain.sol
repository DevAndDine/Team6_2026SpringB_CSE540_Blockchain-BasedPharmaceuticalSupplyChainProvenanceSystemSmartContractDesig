// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title PharmaSupplyChain
 * @notice A blockchain-based pharmaceutical supply chain provenance system
 * for tracking drug batches from manufacturer to pharmacy with auditor verification.
 */
contract PharmaSupplyChain {

    enum Role {
        None,
        Manufacturer,
        Distributor,
        Pharmacy,
        Auditor
    }

    enum BatchStatus {
        Created,
        InTransit,
        Delivered,
        Verified
    }

    struct Batch {
        uint256 id;
        string drugName;
        string lotNumber;
        uint256 manufactureDate;
        uint256 expiryDate;
        address currentOwner;
        BatchStatus status;
        bool exists;
        bool verified;
    }

    struct ProcessRecord {
        string step;
        string details;
        uint256 timestamp;
        address actor;
    }

    address public admin;

    mapping(address => Role) public roles;
    mapping(uint256 => Batch) private batches;
    mapping(uint256 => ProcessRecord[]) private histories;

    event RoleAssigned(address indexed user, Role role);
    event BatchCreated(uint256 indexed batchId, address indexed manufacturer);
    event BatchTransferred(uint256 indexed batchId, address indexed from, address indexed to);
    event BatchDelivered(uint256 indexed batchId, address indexed pharmacy);
    event BatchVerified(uint256 indexed batchId, address indexed auditor);
    event ProcessLogged(uint256 indexed batchId, string step, address indexed actor);

    modifier onlyAdmin() {
        require(msg.sender == admin, "Only admin can perform this action");
        _;
    }

    modifier onlyRole(Role _role) {
        require(roles[msg.sender] == _role, "Unauthorized role");
        _;
    }

    modifier batchExists(uint256 _batchId) {
        require(batches[_batchId].exists, "Batch does not exist");
        _;
    }

    modifier onlyBatchOwner(uint256 _batchId) {
        require(batches[_batchId].currentOwner == msg.sender, "Not current batch owner");
        _;
    }

    constructor() {
        admin = msg.sender;
        roles[msg.sender] = Role.Manufacturer;
        emit RoleAssigned(msg.sender, Role.Manufacturer);
    }

    function assignRole(address _user, Role _role) external onlyAdmin {
        require(_user != address(0), "Invalid address");
        require(_role != Role.None, "Invalid role");
        roles[_user] = _role;
        emit RoleAssigned(_user, _role);
    }

    function createBatch(
        uint256 _batchId,
        string memory _drugName,
        string memory _lotNumber,
        uint256 _manufactureDate,
        uint256 _expiryDate
    ) external onlyRole(Role.Manufacturer) {
        require(!batches[_batchId].exists, "Batch already exists");
        require(_manufactureDate < _expiryDate, "Invalid dates");

        batches[_batchId] = Batch({
            id: _batchId,
            drugName: _drugName,
            lotNumber: _lotNumber,
            manufactureDate: _manufactureDate,
            expiryDate: _expiryDate,
            currentOwner: msg.sender,
            status: BatchStatus.Created,
            exists: true,
            verified: false
        });

        histories[_batchId].push(ProcessRecord({
            step: "Batch Created",
            details: "Manufacturer created a new drug batch",
            timestamp: block.timestamp,
            actor: msg.sender
        }));

        emit BatchCreated(_batchId, msg.sender);
        emit ProcessLogged(_batchId, "Batch Created", msg.sender);
    }

    function transferToDistributor(uint256 _batchId, address _distributor)
        external
        batchExists(_batchId)
        onlyBatchOwner(_batchId)
        onlyRole(Role.Manufacturer)
    {
        require(roles[_distributor] == Role.Distributor, "Recipient must be a distributor");
        require(batches[_batchId].status == BatchStatus.Created, "Batch must be in Created state");

        batches[_batchId].currentOwner = _distributor;
        batches[_batchId].status = BatchStatus.InTransit;

        histories[_batchId].push(ProcessRecord({
            step: "Transferred to Distributor",
            details: "Manufacturer transferred batch to distributor",
            timestamp: block.timestamp,
            actor: msg.sender
        }));

        emit BatchTransferred(_batchId, msg.sender, _distributor);
        emit ProcessLogged(_batchId, "Transferred to Distributor", msg.sender);
    }

    function transferToPharmacy(uint256 _batchId, address _pharmacy)
        external
        batchExists(_batchId)
        onlyBatchOwner(_batchId)
        onlyRole(Role.Distributor)
    {
        require(roles[_pharmacy] == Role.Pharmacy, "Recipient must be a pharmacy");
        require(batches[_batchId].status == BatchStatus.InTransit, "Batch must be in transit");

        batches[_batchId].currentOwner = _pharmacy;
        batches[_batchId].status = BatchStatus.Delivered;

        histories[_batchId].push(ProcessRecord({
            step: "Delivered to Pharmacy",
            details: "Distributor delivered batch to pharmacy",
            timestamp: block.timestamp,
            actor: msg.sender
        }));

        emit BatchTransferred(_batchId, msg.sender, _pharmacy);
        emit BatchDelivered(_batchId, _pharmacy);
        emit ProcessLogged(_batchId, "Delivered to Pharmacy", msg.sender);
    }

    function verifyBatch(uint256 _batchId)
        external
        batchExists(_batchId)
        onlyRole(Role.Auditor)
    {
        require(batches[_batchId].status == BatchStatus.Delivered, "Batch must be delivered first");
        require(!batches[_batchId].verified, "Batch already verified");

        batches[_batchId].status = BatchStatus.Verified;
        batches[_batchId].verified = true;

        histories[_batchId].push(ProcessRecord({
            step: "Batch Verified",
            details: "Auditor verified the delivered batch",
            timestamp: block.timestamp,
            actor: msg.sender
        }));

        emit BatchVerified(_batchId, msg.sender);
        emit ProcessLogged(_batchId, "Batch Verified", msg.sender);
    }

    function logCustomProcessStep(
        uint256 _batchId,
        string memory _step,
        string memory _details
    ) external batchExists(_batchId) onlyBatchOwner(_batchId) {
        histories[_batchId].push(ProcessRecord({
            step: _step,
            details: _details,
            timestamp: block.timestamp,
            actor: msg.sender
        }));

        emit ProcessLogged(_batchId, _step, msg.sender);
    }

    function getBatch(uint256 _batchId)
        external
        view
        batchExists(_batchId)
        returns (Batch memory)
    {
        return batches[_batchId];
    }

    function getBatchHistory(uint256 _batchId)
        external
        view
        batchExists(_batchId)
        returns (ProcessRecord[] memory)
    {
        return histories[_batchId];
    }
}