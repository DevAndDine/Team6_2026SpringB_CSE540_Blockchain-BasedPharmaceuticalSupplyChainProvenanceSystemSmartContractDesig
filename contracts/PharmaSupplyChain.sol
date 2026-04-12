// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
===================================================================
Blockchain-Based Pharmaceutical Supply Chain Provenance System 
Project for Course CSE 540 — Engineering Blockchain Applications
===================================================================
 * @title PharmaSupplyChain
 * @author All Team Members
 *
 * @notice
 * This smart contract implements a blockchain-based pharmaceutical supply chain
 * provenance system. It enables multiple stakeholders (Manufacturer, Distributor,
 * Pharmacy, Auditor) to track the lifecycle of drug batches in a decentralized,
 * transparent, and tamper-resistant manner.
 *
 * @dev
 * DESIGN PRINCIPLES:
 * - Blockchain stores critical state (ownership, status, provenance logs)
 * - Off-chain JSON is stored as serialized strings for detailed metadata
 * - Role-based access control ensures only authorized actions
 * - Separation of concerns:
 *      - State (Batch)
 *      - History (ProcessRecord)
 * - Event-driven architecture for frontend integration
 */
contract PharmaSupplyChain {

    /* =============================================================
                        ENUMS
    ============================================================= */

    /**
     * @dev Defines roles for participants in supply chain
     */
    enum Role {
        None,
        Manufacturer,
        Distributor,
        Pharmacy,
        Auditor
    }

    /**
     * @dev Defines lifecycle stages of a batch
     */
    enum BatchStatus {
        Created,
        InTransit,
        Delivered,
        Verified
    }

    /* =============================================================
                        STRUCTS
    ============================================================= */

    /**
     * @dev Represents a pharmaceutical product batch
     *
     * @param id Unique identifier of the batch
     * @param owner Current owner of the batch
     * @param metadata Basic description (e.g., drug name)
     * @param status Current lifecycle stage
     * @param exists Flag to check existence
     */
    struct Batch {
        uint256 id;
        address owner;
        string metadata;
        BatchStatus status;
        bool exists;
    }

    /**
     * @dev Represents a provenance record (history log)
     *
     * @param step Human-readable action label
     * @param data JSON string storing detailed off-chain info
     * @param timestamp Time of action
     * @param actor Address performing the action
     *
     * NOTE:
     * This struct captures immutable history and should NOT be modified.
     */
    struct ProcessRecord {
        string step;
        string data;
        uint256 timestamp;
        address actor;
    }

    /* =============================================================
                        STATE VARIABLES
    ============================================================= */

    /// @dev System administrator (deployer)
    address public admin;

    /// @dev Mapping from batch ID to Batch
    mapping(uint256 => Batch) private batches;

    /// @dev Mapping from batch ID to its full provenance history
    mapping(uint256 => ProcessRecord[]) private histories;

    /// @dev Mapping from address to role
    mapping(address => Role) public roles;

    /* =============================================================
                            EVENTS
    ============================================================= */

    /// @dev Emitted when role is assigned
    event RoleAssigned(address indexed user, Role role);

    /// @dev Emitted when a batch is created
    event BatchCreated(uint256 indexed batchId, address indexed owner);

    /// @dev Emitted when ownership changes
    event OwnershipTransferred(uint256 indexed batchId, address from, address to);

    /// @dev Emitted when process step is logged
    event ProcessLogged(uint256 indexed batchId, string step, address actor);

    /// @dev Emitted when batch status changes
    event StatusUpdated(uint256 indexed batchId, BatchStatus status);

    /* =============================================================
                        MODIFIERS
    ============================================================= */

    /// @dev Restricts access to admin only
    modifier onlyAdmin() {
        require(msg.sender == admin, "Not admin");
        _;
    }

    /// @dev Restricts access to specific role
    modifier onlyRole(Role _role) {
        require(roles[msg.sender] == _role, "Unauthorized role");
        _;
    }

    /// @dev Ensures batch exists
    modifier batchExists(uint256 _id) {
        require(batches[_id].exists, "Batch does not exist");
        _;
    }


    /// @dev Ensures caller is batch owner
    modifier onlyOwner(uint256 _id) {
        require(batches[_id].owner == msg.sender, "Not owner");
        _;
    }

    /* =============================================================
                        CONSTRUCTOR
    ============================================================= */

    /**
     * @dev Initializes contract
     * - Assigns deployer as admin and manufacturer
     */
    constructor() {
        admin = msg.sender;
        roles[msg.sender] = Role.Manufacturer;
    }

    /* =============================================================
                        ROLE MANAGEMENT
    ============================================================= */

    /**
     * @notice Assign role to a user
     * @dev Only admin can assign roles
     */
    function assignRole(address _user, Role _role)
        public
        onlyAdmin
    {
        roles[_user] = _role;
        emit RoleAssigned(_user, _role);
    }

    /* =============================================================
                        CORE FUNCTIONS
    ============================================================= */

    /**
     * @notice Create a new batch
     * @dev Only Manufacturer can create batches
     */
    function createBatch(uint256 _id, string memory _metadata)
        public
        onlyRole(Role.Manufacturer)
    {
        require(!batches[_id].exists, "Batch exists");

        batches[_id] = Batch({
            id: _id,
            owner: msg.sender,
            metadata: _metadata,
            status: BatchStatus.Created,
            exists: true
        });

        // add initial history
        histories[_id].push(ProcessRecord({
            step: "Created",
            data: _metadata,
            timestamp: block.timestamp,
            actor: msg.sender
        }));

        emit BatchCreated(_id, msg.sender);
    }

    /**
     * @notice Transfer batch ownership
     * @dev Ownership change reflects supply chain movement
     */
    function transferBatch(uint256 _id, address _to)
        public
        batchExists(_id)
        onlyOwner(_id)
    {
        require(roles[_to] != Role.None, "Invalid receiver");

        address prev = batches[_id].owner;
        batches[_id].owner = _to;

        // update status automatically
        batches[_id].status = BatchStatus.InTransit;

        histories[_id].push(ProcessRecord({
            step: "Transferred",
            data: "Ownership transferred",
            timestamp: block.timestamp,
            actor: msg.sender
        }));

        emit OwnershipTransferred(_id, prev, _to);
    }

    /**
     * @notice Update batch lifecycle status
     * @dev Should reflect real supply chain stages
     */
    function updateStatus(uint256 _id, BatchStatus _status)
        public
        batchExists(_id)
        onlyOwner(_id)
    {
        require(
            uint(_status) > uint(batches[_id].status),
            "Invalid status progression"
        );

        batches[_id].status = _status;
        emit StatusUpdated(_id, _status);
    }

    /**
     * @notice Log a process step for provenance tracking
     *
     * @dev
     * This function records detailed history of actions performed on a batch.
     * It complements the Batch struct by storing time-series data.
     *
     * Example:
     * - step: "Shipped"
     * - data: JSON string with logistics details
     *
     * IMPORTANT:
     * This does NOT modify batch state; it only appends history.
     */
    function logProcessStep(
        uint256 _id,
        string memory _step,
        string memory _data
    )
        public
        batchExists(_id)
        onlyOwner(_id)
    {
        histories[_id].push(ProcessRecord({
            step: _step,
            data: _data,
            timestamp: block.timestamp,
            actor: msg.sender
        }));

        emit ProcessLogged(_id, _step, msg.sender);
    }

    /* =============================================================
                        VIEW FUNCTIONS
    ============================================================= */

    /**
     * @notice Get current batch state
     * @dev Returns latest snapshot (NOT history)
     */
    function getBatch(uint256 _id)
        public
        view
        batchExists(_id)
        returns (Batch memory)
    {
        return batches[_id];
    }

    /**
     * @notice Get full provenance history
     * @dev Returns chronological list of all actions
     */
    function getBatchHistory(uint256 _id)
        public
        view
        batchExists(_id)
        returns (ProcessRecord[] memory)
    {
        return histories[_id];
    }
}
