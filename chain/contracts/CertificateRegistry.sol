// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "./IssuerRegistry.sol";

/**
 * @title  CertificateRegistry
 * @notice Dual-approval certificate trust layer for CREDENCE.
 *
 * Lifecycle (branding / preview flow):
 *   1. Registrar submitForApproval(certId, dataHash)     → PendingApproval
 *   2. VC approveAsVC                                    → records VC approval
 *   3. Chancellor approveAsChancellor                    → PendingFinalize
 *   4. Registrar finalizeCertificate(docHash, IPFS CIDs) → Issued
 *
 * Legacy submitCertificate / registerCertificate still set PendingApproval
 * with full hashes (for older clients) and allow finalize to be a no-op skip
 * if docHash already set — prefer the new two-step path.
 *
 * Public verifyCertificate is Valid only when status == Issued and data hashes match.
 */
contract CertificateRegistry {

    enum CertificateStatus { PendingApproval, PendingFinalize, Issued, Revoked }

    event CertificateSubmitted(
        string  indexed certificateId,
        address indexed issuer,
        string          institutionId,
        bytes32         certHash,
        uint256         submittedAt
    );

    event VCApproved(
        string  indexed certificateId,
        address indexed vc,
        uint256         approvedAt
    );

    event ChancellorApproved(
        string  indexed certificateId,
        address indexed chancellor,
        uint256         approvedAt
    );

    event CertificateFinalized(
        string  indexed certificateId,
        bytes32         docHash,
        string          ipfsCidPdf,
        uint256         finalizedAt
    );

    event CertificateIssued(
        string  indexed certificateId,
        uint256         issuedAt
    );

    event CertificateRevoked(
        string  indexed certificateId,
        address indexed revokedBy,
        string          reason,
        uint256         revokedAt
    );

    struct Certificate {
        string            certificateId;
        bytes32           certHash;      // dataHash — structured academic data
        bytes32           docHash;       // documentHash — final PDF (set at finalize)
        string            ipfsCidJson;
        string            ipfsCidPdf;
        address           issuer;
        string            institutionId;
        CertificateStatus status;
        address           vcApprover;
        uint256           vcApprovedAt;
        address           chancellorApprover;
        uint256           chancellorApprovedAt;
        uint256           issuedAt;
        uint256           submittedAt;
        uint256           revokedAt;
        string            revocationReason;
    }

    address public owner;
    IssuerRegistry public issuerRegistry;

    mapping(string => Certificate) private _certificates;
    string[] private _certificateIds;
    mapping(address => string[]) private _issuerCertificates;

    modifier onlyOwner() {
        require(msg.sender == owner, "CertificateRegistry: caller is not the owner");
        _;
    }

    modifier onlyActiveRegistrar() {
        require(
            issuerRegistry.isActiveIssuer(msg.sender) ||
            issuerRegistry.isAuthorizedRegistrar(msg.sender),
            "CertificateRegistry: caller is not an active registrar/issuer"
        );
        _;
    }

    modifier certificateExists(string calldata certificateId) {
        require(
            _certificates[certificateId].submittedAt != 0,
            "CertificateRegistry: certificate not found"
        );
        _;
    }

    constructor(address issuerRegistryAddress) {
        require(issuerRegistryAddress != address(0), "CertificateRegistry: zero address");
        owner          = msg.sender;
        issuerRegistry = IssuerRegistry(issuerRegistryAddress);
    }

    function _resolveInstitutionId(address actor) internal view returns (string memory) {
        address instAdmin = issuerRegistry.getInstitutionOf(actor);
        if (instAdmin != address(0)) {
            return issuerRegistry.getInstitution(instAdmin).institutionId;
        }
        return issuerRegistry.getInstitution(actor).institutionId;
    }

    function _institutionAdminOf(address actor) internal view returns (address) {
        address viaReg = issuerRegistry.getInstitutionOf(actor);
        if (viaReg != address(0)) return viaReg;
        if (issuerRegistry.isActiveIssuer(actor)) return actor;
        address viaVc = issuerRegistry.getInstitutionOfVC(actor);
        if (viaVc != address(0)) return viaVc;
        return issuerRegistry.getInstitutionOfChancellor(actor);
    }

    /**
     * @notice Commit structured certificate data for dual approval (no final PDF yet).
     */
    function submitForApproval(
        string  calldata certificateId,
        bytes32          dataHash
    )
        external
        onlyActiveRegistrar
    {
        require(bytes(certificateId).length > 0, "CertificateRegistry: empty certificateId");
        require(dataHash != bytes32(0), "CertificateRegistry: empty dataHash");
        require(
            _certificates[certificateId].submittedAt == 0,
            "CertificateRegistry: certificate already submitted"
        );

        string memory instId = _resolveInstitutionId(msg.sender);

        _certificates[certificateId] = Certificate({
            certificateId:         certificateId,
            certHash:              dataHash,
            docHash:               bytes32(0),
            ipfsCidJson:           "",
            ipfsCidPdf:            "",
            issuer:                msg.sender,
            institutionId:         instId,
            status:                CertificateStatus.PendingApproval,
            vcApprover:            address(0),
            vcApprovedAt:          0,
            chancellorApprover:    address(0),
            chancellorApprovedAt:  0,
            issuedAt:              0,
            submittedAt:           block.timestamp,
            revokedAt:             0,
            revocationReason:      ""
        });

        _certificateIds.push(certificateId);
        _issuerCertificates[msg.sender].push(certificateId);

        emit CertificateSubmitted(certificateId, msg.sender, instId, dataHash, block.timestamp);
    }

    /**
     * @notice Legacy full submit (data + document). Prefer submitForApproval + finalize.
     */
    function registerCertificate(
        string  calldata certificateId,
        bytes32          certHash,
        bytes32          docHash,
        string  calldata ipfsCidJson,
        string  calldata ipfsCidPdf
    )
        external
        onlyActiveRegistrar
    {
        _submitLegacy(certificateId, certHash, docHash, ipfsCidJson, ipfsCidPdf);
    }

    function submitCertificate(
        string  calldata certificateId,
        bytes32          certHash,
        bytes32          docHash,
        string  calldata ipfsCidJson,
        string  calldata ipfsCidPdf
    )
        external
        onlyActiveRegistrar
    {
        _submitLegacy(certificateId, certHash, docHash, ipfsCidJson, ipfsCidPdf);
    }

    function _submitLegacy(
        string  calldata certificateId,
        bytes32          certHash,
        bytes32          docHash,
        string  calldata ipfsCidJson,
        string  calldata ipfsCidPdf
    ) internal {
        require(bytes(certificateId).length > 0, "CertificateRegistry: empty certificateId");
        require(certHash != bytes32(0), "CertificateRegistry: empty certHash");
        require(docHash  != bytes32(0), "CertificateRegistry: empty docHash");
        require(bytes(ipfsCidJson).length > 0, "CertificateRegistry: empty ipfsCidJson");
        require(bytes(ipfsCidPdf).length  > 0, "CertificateRegistry: empty ipfsCidPdf");
        require(
            _certificates[certificateId].submittedAt == 0,
            "CertificateRegistry: certificate already submitted"
        );

        string memory instId = _resolveInstitutionId(msg.sender);

        _certificates[certificateId] = Certificate({
            certificateId:         certificateId,
            certHash:              certHash,
            docHash:               docHash,
            ipfsCidJson:           ipfsCidJson,
            ipfsCidPdf:            ipfsCidPdf,
            issuer:                msg.sender,
            institutionId:         instId,
            status:                CertificateStatus.PendingApproval,
            vcApprover:            address(0),
            vcApprovedAt:          0,
            chancellorApprover:    address(0),
            chancellorApprovedAt:  0,
            issuedAt:              0,
            submittedAt:           block.timestamp,
            revokedAt:             0,
            revocationReason:      ""
        });

        _certificateIds.push(certificateId);
        _issuerCertificates[msg.sender].push(certificateId);

        emit CertificateSubmitted(certificateId, msg.sender, instId, certHash, block.timestamp);
    }

    function approveAsVC(string calldata certificateId)
        external
        certificateExists(certificateId)
    {
        require(issuerRegistry.isAuthorizedVC(msg.sender), "CertificateRegistry: not an authorized VC");
        Certificate storage cert = _certificates[certificateId];
        require(
            cert.status == CertificateStatus.PendingApproval,
            "CertificateRegistry: not pending approval"
        );
        require(cert.vcApprovedAt == 0, "CertificateRegistry: VC already approved");

        address instAdmin = _institutionAdminOf(msg.sender);
        address certInst  = _institutionAdminOf(cert.issuer);
        require(instAdmin == certInst && instAdmin != address(0), "CertificateRegistry: wrong institution");

        cert.vcApprover   = msg.sender;
        cert.vcApprovedAt = block.timestamp;

        emit VCApproved(certificateId, msg.sender, block.timestamp);
    }

    function approveAsChancellor(string calldata certificateId)
        external
        certificateExists(certificateId)
    {
        require(
            issuerRegistry.isAuthorizedChancellor(msg.sender),
            "CertificateRegistry: not an authorized Chancellor"
        );
        Certificate storage cert = _certificates[certificateId];
        require(
            cert.status == CertificateStatus.PendingApproval,
            "CertificateRegistry: not pending approval"
        );
        require(cert.vcApprovedAt != 0, "CertificateRegistry: VC approval required first");
        require(cert.chancellorApprovedAt == 0, "CertificateRegistry: Chancellor already approved");

        address instAdmin = _institutionAdminOf(msg.sender);
        address certInst  = _institutionAdminOf(cert.issuer);
        require(instAdmin == certInst && instAdmin != address(0), "CertificateRegistry: wrong institution");

        cert.chancellorApprover   = msg.sender;
        cert.chancellorApprovedAt = block.timestamp;

        // If document already attached (legacy full submit), issue immediately.
        // Otherwise wait for finalizeCertificate (preview flow).
        if (cert.docHash != bytes32(0) && bytes(cert.ipfsCidPdf).length > 0) {
            cert.status   = CertificateStatus.Issued;
            cert.issuedAt = block.timestamp;
            emit CertificateIssued(certificateId, block.timestamp);
        } else {
            cert.status = CertificateStatus.PendingFinalize;
        }

        emit ChancellorApproved(certificateId, msg.sender, block.timestamp);
    }

    /**
     * @notice After dual approval: attach final PDF hash + IPFS CIDs and issue.
     */
    function finalizeCertificate(
        string  calldata certificateId,
        bytes32          docHash,
        string  calldata ipfsCidJson,
        string  calldata ipfsCidPdf
    )
        external
        onlyActiveRegistrar
        certificateExists(certificateId)
    {
        Certificate storage cert = _certificates[certificateId];
        require(
            cert.status == CertificateStatus.PendingFinalize,
            "CertificateRegistry: not awaiting finalize"
        );
        require(cert.vcApprovedAt != 0 && cert.chancellorApprovedAt != 0, "CertificateRegistry: dual approval required");
        require(docHash != bytes32(0), "CertificateRegistry: empty docHash");
        require(bytes(ipfsCidJson).length > 0, "CertificateRegistry: empty ipfsCidJson");
        require(bytes(ipfsCidPdf).length  > 0, "CertificateRegistry: empty ipfsCidPdf");
        require(
            msg.sender == cert.issuer ||
            issuerRegistry.isActiveIssuer(msg.sender),
            "CertificateRegistry: only issuer may finalize"
        );

        cert.docHash     = docHash;
        cert.ipfsCidJson = ipfsCidJson;
        cert.ipfsCidPdf  = ipfsCidPdf;
        cert.status      = CertificateStatus.Issued;
        cert.issuedAt    = block.timestamp;

        emit CertificateFinalized(certificateId, docHash, ipfsCidPdf, block.timestamp);
        emit CertificateIssued(certificateId, block.timestamp);
    }

    function revokeCertificate(string calldata certificateId, string calldata reason)
        external
        certificateExists(certificateId)
    {
        Certificate storage cert = _certificates[certificateId];
        require(
            msg.sender == cert.issuer || msg.sender == owner,
            "CertificateRegistry: not authorised to revoke"
        );
        require(cert.status == CertificateStatus.Issued, "CertificateRegistry: not issued");

        cert.status           = CertificateStatus.Revoked;
        cert.revokedAt        = block.timestamp;
        cert.revocationReason = reason;

        emit CertificateRevoked(certificateId, msg.sender, reason, block.timestamp);
    }

    function transferOwnership(address newOwner) external onlyOwner {
        require(newOwner != address(0), "CertificateRegistry: zero address");
        owner = newOwner;
    }

    function getCertificate(string calldata certificateId)
        external
        view
        returns (Certificate memory)
    {
        require(_certificates[certificateId].submittedAt != 0, "CertificateRegistry: certificate not found");
        return _certificates[certificateId];
    }

    function verifyCertificate(string calldata certificateId, bytes32 expectedCertHash)
        external
        view
        returns (bool exists, bool isRevoked, bool hashMatch, bool isIssued)
    {
        Certificate storage cert = _certificates[certificateId];
        if (cert.submittedAt == 0) {
            return (false, false, false, false);
        }
        exists    = true;
        isRevoked = cert.status == CertificateStatus.Revoked;
        isIssued  = cert.status == CertificateStatus.Issued;
        hashMatch = cert.certHash == expectedCertHash;
    }

    function certificateCount() external view returns (uint256) {
        return _certificateIds.length;
    }

    function certificateIdAt(uint256 index) external view returns (string memory) {
        require(index < _certificateIds.length, "CertificateRegistry: index out of bounds");
        return _certificateIds[index];
    }

    function getCertificatesByIssuer(address issuerAddress)
        external
        view
        returns (string[] memory)
    {
        return _issuerCertificates[issuerAddress];
    }
}
