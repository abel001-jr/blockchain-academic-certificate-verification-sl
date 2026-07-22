// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

/**
 * @title  IssuerRegistry
 * @notice Manages institutions and their registrars for CREDENCE.
 *
 * Trust hierarchy (spec §5 + issuer-registration-auth-prompt §3):
 *   owner (Super Admin deployer)
 *     └─ registers / revokes Institution wallets (Institutional Admins)
 *           └─ each Institution Admin authorises / revokes its own Registrars
 *
 * Super Admin / Account 0 (local Hardhat):
 *   Ownership is Ownable-style: constructor sets `owner = msg.sender`.
 *   Hardhat's first account (accounts[0]) becomes Super Admin because it
 *   deploys this contract — not because "0" is special to Ethereum.
 *   On a real testnet/mainnet there is no fixed mnemonic; assign a specific
 *   deployer wallet as Super Admin at deploy time instead.
 *
 * Authorization is resolved at read-time:
 *   isAuthorizedRegistrar(addr) is true IFF
 *     1. registrarToInstitution[addr] is set to some institutionAdmin
 *     2. institutions[institutionAdmin].active == true       (cascade deactivation)
 *     3. registrars[institutionAdmin][addr]   == true
 */
contract IssuerRegistry {

    // ─── Events ──────────────────────────────────────────────────────────────

    event IssuerRegistered(
        address indexed institutionAdmin,
        string          name,
        uint256         registeredAt
    );

    event IssuerRevoked(
        address indexed institutionAdmin,
        uint256         revokedAt
    );

    event RegistrarAuthorized(
        address indexed institutionAdmin,
        address indexed registrar,
        uint256         authorizedAt
    );

    event RegistrarRevoked(
        address indexed institutionAdmin,
        address indexed registrar,
        uint256         revokedAt
    );

    event VCAuthorized(
        address indexed institutionAdmin,
        address indexed vc,
        uint256         authorizedAt
    );

    event VCRevoked(
        address indexed institutionAdmin,
        address indexed vc,
        uint256         revokedAt
    );

    event ChancellorAuthorized(
        address indexed institutionAdmin,
        address indexed chancellor,
        uint256         authorizedAt
    );

    event ChancellorRevoked(
        address indexed institutionAdmin,
        address indexed chancellor,
        uint256         revokedAt
    );

    // ─── Data structures ─────────────────────────────────────────────────────

    struct Institution {
        string  institutionId;    // off-chain ID, e.g. "CUSL-001"
        string  name;             // e.g. "Central University Sierra Leone"
        bool    active;
        uint256 registeredAt;
        uint256 revokedAt;
    }

    // ─── State ───────────────────────────────────────────────────────────────

    address public owner;

    /// institutionAdmin wallet → Institution record
    mapping(address => Institution) public institutions;

    /// institutionAdmin → registrarAddr → authorized
    mapping(address => mapping(address => bool)) public registrars;

    /// registrarAddr → institutionAdmin (so we can do the cascade check)
    mapping(address => address) public registrarToInstitution;

    /// institutionAdmin → VC wallet → authorized
    mapping(address => mapping(address => bool)) public vcs;
    mapping(address => address) public vcToInstitution;

    /// institutionAdmin → Chancellor wallet → authorized
    mapping(address => mapping(address => bool)) public chancellors;
    mapping(address => address) public chancellorToInstitution;

    /// all ever-registered institution admin wallets (for enumeration)
    address[] private _institutionAddresses;

    // ─── Modifiers ───────────────────────────────────────────────────────────

    modifier onlyOwner() {
        require(msg.sender == owner, "IssuerRegistry: caller is not the owner");
        _;
    }

    modifier notZero(address addr) {
        require(addr != address(0), "IssuerRegistry: zero address not allowed");
        _;
    }

    modifier onlyActiveInstitution() {
        require(
            institutions[msg.sender].active,
            "IssuerRegistry: caller is not an active institution"
        );
        _;
    }

    // ─── Constructor ─────────────────────────────────────────────────────────

    constructor() {
        owner = msg.sender;
    }

    // ─── Super Admin: institution management ─────────────────────────────────

    /**
     * @notice Register (anchor) an institution on-chain.
     * @param  institutionAdmin  The Institutional Admin's wallet address.
     * @param  institutionId     Off-chain ID, e.g. "CUSL-001".
     * @param  name              Human-readable institution name.
     */
    function registerIssuer(
        address institutionAdmin,
        string  calldata institutionId,
        string  calldata name
    )
        external
        onlyOwner
        notZero(institutionAdmin)
    {
        require(!institutions[institutionAdmin].active,  "IssuerRegistry: already active");
        require(bytes(institutionId).length > 0,         "IssuerRegistry: empty institutionId");
        require(bytes(name).length          > 0,         "IssuerRegistry: empty name");

        institutions[institutionAdmin] = Institution({
            institutionId:  institutionId,
            name:           name,
            active:         true,
            registeredAt:   block.timestamp,
            revokedAt:      0
        });

        _institutionAddresses.push(institutionAdmin);

        emit IssuerRegistered(institutionAdmin, name, block.timestamp);
    }

    /**
     * @notice Revoke an institution's issuer rights.
     * @dev    Cascades to all its registrars at read-time — no loop needed.
     */
    function revokeIssuer(address institutionAdmin)
        external
        onlyOwner
        notZero(institutionAdmin)
    {
        require(institutions[institutionAdmin].active, "IssuerRegistry: institution not active");

        institutions[institutionAdmin].active    = false;
        institutions[institutionAdmin].revokedAt = block.timestamp;

        emit IssuerRevoked(institutionAdmin, block.timestamp);
    }

    /**
     * @notice Transfer ownership to a new Super Admin.
     */
    function transferOwnership(address newOwner) external onlyOwner notZero(newOwner) {
        owner = newOwner;
    }

    // ─── Institution Admin: registrar management ──────────────────────────────

    /**
     * @notice Authorize a registrar wallet under the calling institution.
     * @dev    Reverts if the registrar is already bound to a DIFFERENT institution.
     *         A revoked-then-re-authorized registrar under the same institution is allowed.
     */
    function authorizeRegistrar(address registrarAddr)
        external
        onlyActiveInstitution
        notZero(registrarAddr)
    {
        address existingInstitution = registrarToInstitution[registrarAddr];
        if (existingInstitution != address(0) && existingInstitution != msg.sender) {
            revert("IssuerRegistry: registrar already bound to another institution");
        }

        registrars[msg.sender][registrarAddr]  = true;
        registrarToInstitution[registrarAddr]  = msg.sender;

        emit RegistrarAuthorized(msg.sender, registrarAddr, block.timestamp);
    }

    /**
     * @notice Revoke a registrar from the calling institution.
     */
    function revokeRegistrar(address registrarAddr)
        external
        notZero(registrarAddr)
    {
        require(
            registrarToInstitution[registrarAddr] == msg.sender,
            "IssuerRegistry: not the authorizing institution"
        );

        registrars[msg.sender][registrarAddr] = false;

        emit RegistrarRevoked(msg.sender, registrarAddr, block.timestamp);
    }

    // ─── Institution Admin (Registrar identity): VC & Chancellor ──────────────

    function authorizeVC(address vcAddr)
        external
        onlyActiveInstitution
        notZero(vcAddr)
    {
        address existing = vcToInstitution[vcAddr];
        if (existing != address(0) && existing != msg.sender) {
            revert("IssuerRegistry: VC already bound to another institution");
        }
        vcs[msg.sender][vcAddr] = true;
        vcToInstitution[vcAddr] = msg.sender;
        emit VCAuthorized(msg.sender, vcAddr, block.timestamp);
    }

    function revokeVC(address vcAddr) external notZero(vcAddr) {
        require(vcToInstitution[vcAddr] == msg.sender, "IssuerRegistry: not the authorizing institution");
        vcs[msg.sender][vcAddr] = false;
        emit VCRevoked(msg.sender, vcAddr, block.timestamp);
    }

    function authorizeChancellor(address chancellorAddr)
        external
        onlyActiveInstitution
        notZero(chancellorAddr)
    {
        address existing = chancellorToInstitution[chancellorAddr];
        if (existing != address(0) && existing != msg.sender) {
            revert("IssuerRegistry: Chancellor already bound to another institution");
        }
        chancellors[msg.sender][chancellorAddr] = true;
        chancellorToInstitution[chancellorAddr] = msg.sender;
        emit ChancellorAuthorized(msg.sender, chancellorAddr, block.timestamp);
    }

    function revokeChancellor(address chancellorAddr) external notZero(chancellorAddr) {
        require(
            chancellorToInstitution[chancellorAddr] == msg.sender,
            "IssuerRegistry: not the authorizing institution"
        );
        chancellors[msg.sender][chancellorAddr] = false;
        emit ChancellorRevoked(msg.sender, chancellorAddr, block.timestamp);
    }

    // ─── View / query functions ───────────────────────────────────────────────

    /**
     * @notice Returns true if an address is an active registrar under an active institution.
     * @dev    This is the single authorization gate used by CertificateRegistry.
     *         Cascade deactivation happens here — no storage writes needed when an
     *         institution is revoked.
     */
    function isAuthorizedRegistrar(address registrarAddr) external view returns (bool) {
        address inst = registrarToInstitution[registrarAddr];
        if (inst == address(0))             return false;   // never registered
        if (!institutions[inst].active)     return false;   // institution revoked
        return registrars[inst][registrarAddr];             // registrar flag
    }

    function isActiveIssuer(address institutionAdmin) external view returns (bool) {
        return institutions[institutionAdmin].active;
    }

    function isAuthorizedVC(address vcAddr) external view returns (bool) {
        address inst = vcToInstitution[vcAddr];
        if (inst == address(0)) return false;
        if (!institutions[inst].active) return false;
        return vcs[inst][vcAddr];
    }

    function isAuthorizedChancellor(address chancellorAddr) external view returns (bool) {
        address inst = chancellorToInstitution[chancellorAddr];
        if (inst == address(0)) return false;
        if (!institutions[inst].active) return false;
        return chancellors[inst][chancellorAddr];
    }

    function getInstitutionOfVC(address vcAddr) external view returns (address) {
        return vcToInstitution[vcAddr];
    }

    function getInstitutionOfChancellor(address chancellorAddr) external view returns (address) {
        return chancellorToInstitution[chancellorAddr];
    }

    /**
     * @notice Returns the institution admin address that authorized a given registrar.
     * @dev    Used by CertificateRegistry to tag certificates with their institution.
     */
    function getInstitutionOf(address registrarAddr) external view returns (address) {
        return registrarToInstitution[registrarAddr];
    }

    /**
     * @notice Returns the Institution record for a given admin wallet.
     */
    function getInstitution(address institutionAdmin)
        external
        view
        returns (Institution memory)
    {
        return institutions[institutionAdmin];
    }

    /**
     * @notice Total ever-registered institution count (for enumeration).
     */
    function institutionCount() external view returns (uint256) {
        return _institutionAddresses.length;
    }

    /**
     * @notice Institution admin address at a given index.
     */
    function institutionAt(uint256 index) external view returns (address) {
        require(index < _institutionAddresses.length, "IssuerRegistry: out of bounds");
        return _institutionAddresses[index];
    }
}
