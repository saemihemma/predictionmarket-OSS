/// Source declaration schema and validation.
/// Every declared-source market must include structured source fields.
module prediction_market::pm_source;

use std::string::String;
use prediction_market::pm_rules;

// ── Errors ──
#[error(code = 0)]
const EInvalidSourceClass: vector<u8> = b"Invalid source class";
#[error(code = 1)]
const EInvalidEvidenceFormat: vector<u8> = b"Invalid evidence format";
#[error(code = 2)]
const EInvalidFallback: vector<u8> = b"Invalid fallback option";
#[error(code = 3)]
const EEmptySourceUri: vector<u8> = b"Source URI must not be empty";

/// Structured source declaration — stored as a field on PMMarket.
/// Frozen at creation time (immutable after first trade).
public struct SourceDeclaration has store, copy, drop {
    source_class: u8,
    source_uri: String,
    source_description: String,
    evidence_format: u8,
    source_archived: bool,
    creator_controls_source: bool,
    verifier_submission_required: bool,
    fallback_on_source_unavailable: u8,
}

/// Create and validate a new SourceDeclaration.
public fun new(
    source_class: u8,
    source_uri: String,
    source_description: String,
    evidence_format: u8,
    source_archived: bool,
    creator_controls_source: bool,
    verifier_submission_required: bool,
    fallback_on_source_unavailable: u8,
): SourceDeclaration {
    assert!(pm_rules::is_valid_source_class(source_class), EInvalidSourceClass);
    assert!(pm_rules::is_valid_evidence_format(evidence_format), EInvalidEvidenceFormat);
    assert!(pm_rules::is_valid_fallback(fallback_on_source_unavailable), EInvalidFallback);
    assert!(std::string::length(&source_uri) > 0, EEmptySourceUri);

    SourceDeclaration {
        source_class,
        source_uri,
        source_description,
        evidence_format,
        source_archived,
        creator_controls_source,
        verifier_submission_required,
        fallback_on_source_unavailable,
    }
}

// ── Read accessors ──

public fun source_class(s: &SourceDeclaration): u8 { s.source_class }
public fun source_uri(s: &SourceDeclaration): &String { &s.source_uri }
public fun source_description(s: &SourceDeclaration): &String { &s.source_description }
public fun evidence_format(s: &SourceDeclaration): u8 { s.evidence_format }
public fun source_archived(s: &SourceDeclaration): bool { s.source_archived }
public fun creator_controls_source(s: &SourceDeclaration): bool { s.creator_controls_source }
public fun verifier_submission_required(s: &SourceDeclaration): bool { s.verifier_submission_required }
public fun fallback_on_source_unavailable(s: &SourceDeclaration): u8 { s.fallback_on_source_unavailable }

/// Returns an empty/default SourceDeclaration for deterministic markets
/// that resolve from on-chain state (no external source needed).
public fun deterministic_default(): SourceDeclaration {
    SourceDeclaration {
        source_class: pm_rules::source_class_onchain_state(),
        source_uri: std::string::utf8(b"onchain"),
        source_description: std::string::utf8(b"Resolved from on-chain SnapshotRecord"),
        evidence_format: pm_rules::evidence_format_tx_hash(),
        source_archived: false,
        creator_controls_source: false,
        verifier_submission_required: false,
        fallback_on_source_unavailable: pm_rules::fallback_invalid(),
    }
}
