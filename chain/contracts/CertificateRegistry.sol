// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "./IssuerRegistry.sol";

/**
 * @title  CertificateRegistry
 * @notice Dual-approval certificate trust layer for INTELLIGENT ACADEMIC CREDENTIALING.
 *
 * Privacy invariant: this contract never stores or emits a document
 * location. Only hashes, addresses, roles, and timestamps are public. The
 * encrypted document blobs live off-chain and are retrieved by the backend
 * after it validates graduate ownership or an active verification share, so
 * a time-limited share actually revokes access. A CID published here would
 * be permanently public and could not be withdrawn.
 *
 * Lifecycle (preview / generated-certificate flow):
 *   1. Registrar submitForApproval(certId, dataHash)     â†’ PendingApproval
 *   2. VC approveAsVC                                    â†’ records VC approval
 *   3. Chancellor approveAsChancellor                    â†’ PendingFinalize
 *   4. Registrar finalizeCertificate(certId, docHash)    â†’ Issued
 *
 * Lifecycle (paired-document flow):
 *   1. Registrar submitCredentialForApproval(certId, dataHash,
 *      certificateDocHash, transcriptDocHash)            â†’ PendingApproval
 *   2. VC approveAsVC                                    â†’ records VC approval
 *   3. Chancellor approveAsChancellor                    â†’ PendingFinalize
 *   4. Registrar finalizeCredential(certId)              â†’ Issued
 *
 * The paired path fixes both document hashes before either officer signs,
 * so reviewers approve exactly the bytes that are later anchored.
 *
 * Lifecycle (single uploaded document):
 *   1. Registrar submitDocumentForApproval(certId, dataHash,
 *      docHash)                                          â†’ PendingApproval
 *   2. VC approveAsVC                                    â†’ records VC approval
 *   3. Chancellor approveAsChancellor                    â†’ PendingFinalize
 *   4. Registrar finalizeCertificate(certId, docHash)    â†’ Issued
 *
 * The uploaded document is already final, so the hash committed at submit is
 * the hash that is issued. finalizeCertificate refuses to overwrite a hash that
 * was committed before review, which is what makes the officers' approval mean
 * something: they approve cert.docHash, and the issued document is provably the
 * same bytes. finalizeRequired keeps this path off the legacy auto-issue
 * branch, because the design requires a registrar final anchor even though no
 * new document is produced.
 *
 * Lifecycle (review-then-seal flow, single generated document):
 *   1. Registrar submitForSealedReview(certId, dataHash,
 *      reviewDocHash)                                    â†’ PendingApproval
 *   2. VC approveAsVC                                    â†’ records VC approval
 *   3. Chancellor approveAsChancellor                    â†’ PendingFinalize
 *   4. Registrar finalizeWithSealedDocument(certId,
 *      sealedDocHash)                                    â†’ Issued
 *
 * Lifecycle (review-then-seal flow, generated certificate with transcript):
 *   1. Registrar submitCredentialForSealedReview(certId,
 *      dataHash, reviewDocHash, transcriptDocHash)       â†’ PendingApproval
 *   2. VC approveAsVC                                    â†’ records VC approval
 *   3. Chancellor approveAsChancellor                    â†’ PendingFinalize
 *   4. Registrar finalizeWithSealedDocument(certId,
 *      sealedDocHash)                                    â†’ Issued
 *
 * A system-designed credential is one student record made of two documents, so
 * it is sealed like any other generated credential but must commit its
 * transcript hash alongside the review copy. The three-argument
 * submitForSealedReview cannot do that: it writes bytes32(0) to
 * transcriptDocHash, which on-chain is indistinguishable from a credential with
 * no transcript at all.
 *
 * The issued document of this flow carries the signature block, so it cannot
 * be rendered before the officers sign. The officers therefore approve a
 * signature-free review rendering, which is committed as cert.docHash, and the
 * registrar commits the issued bytes as cert.sealedDocHash afterwards. Both
 * are immutable and the relationship between them is recorded on-chain by the
 * CredentialSealed event. A holder of the issued PDF must check
 * getAuthoritativeDocHash, which reports the sealed hash once issued.
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

    // Covers both paired paths: submitCredentialForApproval (documents already
    // final) and submitCredentialForSealedReview (review copy committed before
    // the issued copy is rendered). In both cases transcriptDocHash is non-zero,
    // which is what distinguishes a paired credential from a single-document one.
    event CredentialSubmitted(
        string  indexed certificateId,
        address indexed issuer,
        bytes32         certHash,
        bytes32         certificateDocHash,
        bytes32         transcriptDocHash,
        uint256         submittedAt
    );

    event CredentialAnchored(
        string  indexed certificateId,
        bytes32         certificateDocHash,
        bytes32         transcriptDocHash,
        uint256         anchoredAt
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
        uint256         finalizedAt
    );

    /**
     * @notice Emitted when the registrar seals the issued document after review.
     * @dev Both hashes are included so the relationship between the reviewed
     *      copy and the issued copy is auditable on-chain. Neither is a
     *      document location.
     */
    event CredentialSealed(
        string  indexed certificateId,
        bytes32         reviewDocHash,
        bytes32         sealedDocHash,
        uint256         sealedAt
    );

    event CertificateIssued(
        string  indexed certificateId,
        uint256         issuedAt
    );

    /**
     * @dev Records the document hash fixed before officer review on a
     *      single-document credential. Emitted so an indexer can tell which
     *      bytes the officers' approvals actually referred to, without having
     *      to infer it from CertificateSubmitted. Not a document location.
     */
    event DocumentCommitted(
        string  indexed certificateId,
        bytes32          docHash,
        uint256          committedAt
    );

    event CertificateRevoked(
        string  indexed certificateId,
        address indexed revokedBy,
        string          reason,
        uint256         revokedAt
    );

    struct Certificate {
        string            certificateId;
        bytes32           certHash;      // dataHash â€” structured academic data
        bytes32           docHash;       // review-document hash the officers approved
        bytes32           transcriptDocHash;
        bytes32           sealedDocHash; // issued-document hash, set at sealing time
        address           issuer;
        string            institutionId;
        CertificateStatus status;
        // Set when the issued document is produced after officer approval and
        // must therefore be sealed by the registrar. Distinguishes the
        // review-then-seal path from the legacy submit, which supplies its
        // document hash up front and issues directly on Chancellor approval.
        bool              sealRequired;
        // Set when a document hash was committed before review and the registrar
        // must still run a final anchoring transaction. This is what separates
        // the single-upload path from the legacy submit: both hold a document
        // hash with no transcript hash, so without this flag the two would be
        // indistinguishable and the upload path would auto-issue on Chancellor
        // approval, skipping the registrar's final anchor.
        bool              finalizeRequired;
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
            issuerRegistry.isAuthorizedRegistrar(msg.sender) &&
            !issuerRegistry.isActiveIssuer(msg.sender),
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
            transcriptDocHash:     bytes32(0),
            sealedDocHash:         bytes32(0),
            issuer:                msg.sender,
            institutionId:         instId,
            status:                CertificateStatus.PendingApproval,
            sealRequired:          false,
            finalizeRequired:      false,
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
     * @notice Legacy full submit (data + document hash, no transcript).
     * @dev Prefer submitCredentialForApproval, which fixes both document
     *      hashes before officer review.
     */
    function registerCertificate(
        string  calldata certificateId,
        bytes32          certHash,
        bytes32          docHash
    )
        external
        onlyActiveRegistrar
    {
        _submitLegacy(certificateId, certHash, docHash);
    }

    function submitCertificate(
        string  calldata certificateId,
        bytes32          certHash,
        bytes32          docHash
    )
        external
        onlyActiveRegistrar
    {
        _submitLegacy(certificateId, certHash, docHash);
    }

    function _submitLegacy(
        string  calldata certificateId,
        bytes32          certHash,
        bytes32          docHash
    ) internal {
        require(bytes(certificateId).length > 0, "CertificateRegistry: empty certificateId");
        require(certHash != bytes32(0), "CertificateRegistry: empty certHash");
        require(docHash  != bytes32(0), "CertificateRegistry: empty docHash");
        require(
            _certificates[certificateId].submittedAt == 0,
            "CertificateRegistry: certificate already submitted"
        );

        string memory instId = _resolveInstitutionId(msg.sender);

        _certificates[certificateId] = Certificate({
            certificateId:         certificateId,
            certHash:              certHash,
            docHash:               docHash,
            transcriptDocHash:     bytes32(0),
            sealedDocHash:         bytes32(0),
            issuer:                msg.sender,
            institutionId:         instId,
            status:                CertificateStatus.PendingApproval,
            sealRequired:          false,
            finalizeRequired:      false,
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

    /**
     * @notice Commit finalized certificate/transcript hashes before review.
     * @dev No document location is stored on-chain. Reviewers approve this
     *      immutable pair; the registrar's final transaction marks it issued.
     */
    function submitCredentialForApproval(
        string  calldata certificateId,
        bytes32          dataHash,
        bytes32          certificateDocHash,
        bytes32          transcriptDocHash
    ) external onlyActiveRegistrar {
        require(bytes(certificateId).length > 0, "CertificateRegistry: empty certificateId");
        require(dataHash != bytes32(0), "CertificateRegistry: empty dataHash");
        require(certificateDocHash != bytes32(0), "CertificateRegistry: empty certificate hash");
        require(transcriptDocHash != bytes32(0), "CertificateRegistry: empty transcript hash");
        require(
            _certificates[certificateId].submittedAt == 0,
            "CertificateRegistry: certificate already submitted"
        );

        string memory instId = _resolveInstitutionId(msg.sender);
        _certificates[certificateId] = Certificate({
            certificateId:         certificateId,
            certHash:              dataHash,
            docHash:               certificateDocHash,
            transcriptDocHash:     transcriptDocHash,
            sealedDocHash:         bytes32(0),
            issuer:                msg.sender,
            institutionId:         instId,
            status:                CertificateStatus.PendingApproval,
            sealRequired:          false,
            finalizeRequired:      false,
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
        emit CredentialSubmitted(
            certificateId, msg.sender, dataHash, certificateDocHash,
            transcriptDocHash, block.timestamp
        );
    }

    /**
     * @notice Commit a review document for approval on a single-document credential.
     * @dev The review document is rendered before any officer signs, so its
     *      bytes are stable and the officers approve exactly what they were
     *      shown. The issued document is produced afterwards, because it
     *      carries the signature block, and is committed by
     *      finalizeWithSealedDocument. Both hashes are immutable once set.
     */
    function submitForSealedReview(
        string  calldata certificateId,
        bytes32          dataHash,
        bytes32          reviewDocHash
    ) external onlyActiveRegistrar {
        require(bytes(certificateId).length > 0, "CertificateRegistry: empty certificateId");
        require(dataHash != bytes32(0), "CertificateRegistry: empty dataHash");
        require(reviewDocHash != bytes32(0), "CertificateRegistry: empty review document hash");
        require(
            _certificates[certificateId].submittedAt == 0,
            "CertificateRegistry: certificate already submitted"
        );

        string memory instId = _resolveInstitutionId(msg.sender);
        _certificates[certificateId] = Certificate({
            certificateId:         certificateId,
            certHash:              dataHash,
            docHash:               reviewDocHash,
            transcriptDocHash:     bytes32(0),
            sealedDocHash:         bytes32(0),
            issuer:                msg.sender,
            institutionId:         instId,
            status:                CertificateStatus.PendingApproval,
            sealRequired:          true,
            finalizeRequired:      false,
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
     * @notice Commit a review document and its transcript for approval together.
     * @dev This is submitForSealedReview for a credential that is two documents
     *      rather than one. A system-designed certificate is a single student
     *      record made of the rendered certificate and the transcript uploaded
     *      with it; the officers approve both, so both hashes have to be fixed
     *      here or the transcript they were shown would sit off-chain with no
     *      commitment to it at all.
     *
     *      The three-argument overload cannot carry the transcript: it stores
     *      bytes32(0) for transcriptDocHash, and a zero hash is indistinguishable
     *      on-chain from "this credential has no transcript". Using it for a
     *      transcript-bearing credential would produce a chain record that
     *      looks like the single-document case while a transcript exists off
     *      chain, which is exactly the state a verifier cannot detect. Requiring
     *      a non-zero transcript hash here makes the paired path explicit and
     *      makes the omission fail loudly rather than silently.
     *
     *      sealRequired stays true, so issuance still goes through
     *      finalizeWithSealedDocument with the signature block, and
     *      approveAsChancellor sends this to PendingFinalize rather than
     *      auto-issuing.
     */
    function submitCredentialForSealedReview(
        string  calldata certificateId,
        bytes32          dataHash,
        bytes32          reviewDocHash,
        bytes32          transcriptDocHash
    ) external onlyActiveRegistrar {
        require(bytes(certificateId).length > 0, "CertificateRegistry: empty certificateId");
        require(dataHash != bytes32(0), "CertificateRegistry: empty dataHash");
        require(reviewDocHash != bytes32(0), "CertificateRegistry: empty review document hash");
        require(transcriptDocHash != bytes32(0), "CertificateRegistry: empty transcript hash");
        require(
            _certificates[certificateId].submittedAt == 0,
            "CertificateRegistry: certificate already submitted"
        );

        string memory instId = _resolveInstitutionId(msg.sender);
        _certificates[certificateId] = Certificate({
            certificateId:         certificateId,
            certHash:              dataHash,
            docHash:               reviewDocHash,
            transcriptDocHash:     transcriptDocHash,
            sealedDocHash:         bytes32(0),
            issuer:                msg.sender,
            institutionId:         instId,
            status:                CertificateStatus.PendingApproval,
            sealRequired:          true,
            finalizeRequired:      false,
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
        emit CredentialSubmitted(
            certificateId, msg.sender, dataHash, reviewDocHash,
            transcriptDocHash, block.timestamp
        );
    }

    /**
     * @notice Commit a single uploaded document before officer review.
     * @dev An uploaded document is already final, so the hash fixed here is the
     *      hash that is eventually issued. This exists because the upload flows
     *      used to submit only the data hash, which meant the officers approved
     *      on-chain state in which docHash was still zero — their approval was
     *      not an approval of any document.
     *
     *      finalizeRequired is what keeps this path distinct from the legacy
     *      submit, which also carries a document hash with no transcript hash.
     *      Without the flag, Chancellor approval would auto-issue and the
     *      registrar's final anchoring transaction would be skipped. The
     *      design requires that transaction even though no new document is
     *      produced, so this path always goes to PendingFinalize.
     */
    function submitDocumentForApproval(
        string  calldata certificateId,
        bytes32          dataHash,
        bytes32          docHash
    ) external onlyActiveRegistrar {
        require(bytes(certificateId).length > 0, "CertificateRegistry: empty certificateId");
        require(dataHash != bytes32(0), "CertificateRegistry: empty dataHash");
        require(docHash  != bytes32(0), "CertificateRegistry: empty docHash");
        require(
            _certificates[certificateId].submittedAt == 0,
            "CertificateRegistry: certificate already submitted"
        );

        string memory instId = _resolveInstitutionId(msg.sender);
        _certificates[certificateId] = Certificate({
            certificateId:         certificateId,
            certHash:              dataHash,
            docHash:               docHash,
            transcriptDocHash:     bytes32(0),
            sealedDocHash:         bytes32(0),
            issuer:                msg.sender,
            institutionId:         instId,
            status:                CertificateStatus.PendingApproval,
            sealRequired:          false,
            finalizeRequired:      true,
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
        emit DocumentCommitted(certificateId, docHash, block.timestamp);
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

        // Only the legacy full-submit path issues here. It is identified by a
        // document hash supplied up front with no transcript hash, no
        // sealing requirement and no final-anchor requirement. Every other
        // path must still wait for the registrar's final transaction, so it
        // goes to PendingFinalize:
        //   - submitCredentialForApproval supplies a transcript hash.
        //   - submitForSealedReview sets sealRequired, because its issued
        //     document does not exist until after approval.
        //   - submitDocumentForApproval sets finalizeRequired. Its document is
        //     already final, so it looks exactly like the legacy submit and
        //     would otherwise auto-issue, skipping the final anchor.
        if (
            cert.docHash != bytes32(0) &&
            cert.transcriptDocHash == bytes32(0) &&
            !cert.sealRequired &&
            !cert.finalizeRequired
        ) {
            cert.status   = CertificateStatus.Issued;
            cert.issuedAt = block.timestamp;
            emit CertificateIssued(certificateId, block.timestamp);
        } else {
            cert.status = CertificateStatus.PendingFinalize;
        }

        emit ChancellorApproved(certificateId, msg.sender, block.timestamp);
    }

    /**
     * @notice After dual approval: attach the final PDF hash and issue.
     * @dev No document location is written on-chain. The registrar's backend
     *      holds the encrypted blob reference out of public state.
     */
    function finalizeCertificate(
        string  calldata certificateId,
        bytes32          docHash
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
        require(
            !cert.sealRequired,
            "CertificateRegistry: sealed path must use finalizeWithSealedDocument"
        );
        // A document hash fixed before officer review is immutable. Rewriting it
        // here would mean the issued document is not the one the officers
        // approved, which is the whole point of committing it at submit. Only
        // the legacy preview path, which deliberately submitted no document
        // hash, may set one for the first time here.
        if (cert.docHash != bytes32(0)) {
            require(
                docHash == cert.docHash,
                "CertificateRegistry: document hash was committed before review and cannot be changed"
            );
        }
        require(
            msg.sender == cert.issuer ||
            issuerRegistry.isActiveIssuer(msg.sender),
            "CertificateRegistry: only issuer may finalize"
        );

        cert.docHash     = docHash;
        cert.status      = CertificateStatus.Issued;
        cert.issuedAt    = block.timestamp;

        emit CertificateFinalized(certificateId, docHash, block.timestamp);
        emit CertificateIssued(certificateId, block.timestamp);
    }

    /** @notice Registrar completes issuance after both officers approve the fixed hash pair. */
    function finalizeCredential(string calldata certificateId)
        external
        onlyActiveRegistrar
        certificateExists(certificateId)
    {
        Certificate storage cert = _certificates[certificateId];
        require(cert.status == CertificateStatus.PendingFinalize, "CertificateRegistry: not awaiting finalize");
        require(cert.vcApprovedAt != 0 && cert.chancellorApprovedAt != 0, "CertificateRegistry: dual approval required");
        // Checked before the document pair: a sealed credential has no
        // transcript hash, so the pair check below would reject it anyway but
        // with a message that points at the wrong cause.
        require(!cert.sealRequired, "CertificateRegistry: sealed path must use finalizeWithSealedDocument");
        require(cert.docHash != bytes32(0) && cert.transcriptDocHash != bytes32(0), "CertificateRegistry: document pair missing");
        require(msg.sender == cert.issuer, "CertificateRegistry: only issuer may finalize");

        cert.status = CertificateStatus.Issued;
        cert.issuedAt = block.timestamp;
        emit CredentialAnchored(
            certificateId, cert.docHash, cert.transcriptDocHash, block.timestamp
        );
        emit CertificateIssued(certificateId, block.timestamp);
    }

    /**
     * @notice Commit the issued document after officer review and seal the credential.
     * @dev The officers approved `cert.docHash` (the review copy). This records
     *      the hash of the document actually issued, which additionally carries
     *      the signature block. The two hashes are stored side by side and never
     *      overwritten, so the link between what was reviewed and what was
     *      issued stays auditable. The review copy is never mutated: a mismatch
     *      with the sealed copy is a normal outcome, not tampering.
     */
    function finalizeWithSealedDocument(
        string  calldata certificateId,
        bytes32          sealedDocHash
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
        require(cert.sealRequired, "CertificateRegistry: credential was not submitted for sealed review");
        require(cert.docHash != bytes32(0), "CertificateRegistry: review document missing");
        require(sealedDocHash != bytes32(0), "CertificateRegistry: empty sealed document hash");
        require(
            sealedDocHash != cert.docHash,
            "CertificateRegistry: sealed document must differ from review document"
        );
        require(cert.sealedDocHash == bytes32(0), "CertificateRegistry: already sealed");
        require(msg.sender == cert.issuer, "CertificateRegistry: only issuer may seal");

        cert.sealedDocHash = sealedDocHash;
        cert.status        = CertificateStatus.Issued;
        cert.issuedAt      = block.timestamp;

        emit CredentialSealed(certificateId, cert.docHash, sealedDocHash, block.timestamp);
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

    /**
     * @notice Hashes a verifier should check against the document in hand.
     * @dev Returns the sealed hash once the credential is issued via the
     *      review-then-seal path, otherwise the document hash fixed at submit.
     *      This is the value a holder of the issued PDF must be able to match.
     */
    function getAuthoritativeDocHash(string calldata certificateId)
        external
        view
        returns (bytes32 docHash, bytes32 sealedDocHash, bool isSealed)
    {
        require(_certificates[certificateId].submittedAt != 0, "CertificateRegistry: certificate not found");
        Certificate storage cert = _certificates[certificateId];
        return (cert.docHash, cert.sealedDocHash, cert.sealedDocHash != bytes32(0));
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
