#!/usr/bin/env python3
"""
Pandas CLI for the RP lead pipeline POC. Two subcommands:

  analyze   -- inspect a raw lead CSV, report anomalies + recommendations (spec 1.1/1.2)
  sanitize  -- clean/dedupe a raw lead CSV into a normalized CSV (spec 2.1/2.2)

Self-contained on purpose (only stdlib + pandas + scripts/constants.py) so this
directory can be lifted into a standalone Claude Code skill later without any
changes. Both subcommands print their JSON report to stdout (for the calling
Next.js API route) and also write it to --output-dir (for durability/download).
On failure, a JSON error object is printed to stderr and the process exits
non-zero; finding anomalies is a normal, successful analyze run, not a failure.
"""

from __future__ import annotations

import argparse
import json
import re
import sys
import urllib.parse
from collections import defaultdict
from datetime import datetime, timezone
from pathlib import Path

import pandas as pd

sys.path.insert(0, str(Path(__file__).resolve().parent))
import constants as C  # noqa: E402

EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")
WHITESPACE_ISSUE_RE = re.compile(r"^\s|\s$|\s{2,}")
# Matches a local-part or domain label made of one character repeated (e.g.
# "aaa@bbb.cc") -- a low-entropy pattern typical of spam/placeholder test
# records rather than a real address.
REPEATED_CHAR_RE = re.compile(r"^(.)\1*$")


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def collapse_whitespace(s: str) -> str:
    return re.sub(r"\s+", " ", s).strip()


def load_csv(path: str) -> pd.DataFrame:
    df = pd.read_csv(path, dtype=str, keep_default_na=False)
    df.columns = [c.strip() for c in df.columns]
    return df


# ---------------------------------------------------------------------------
# Field-level classification helpers (shared by analyze + sanitize)
# ---------------------------------------------------------------------------

def email_domain(email: str) -> str:
    return email.split("@", 1)[1].lower().strip() if "@" in email else ""


def is_malformed_email(email: str) -> bool:
    return not bool(EMAIL_RE.match(email.strip()))


def is_suspicious_fake_email(email: str) -> bool:
    local = email.split("@", 1)[0] if "@" in email else email
    domain_label = email_domain(email).split(".", 1)[0] if "@" in email else ""
    return bool(REPEATED_CHAR_RE.match(local)) or (domain_label and bool(REPEATED_CHAR_RE.match(domain_label)))


def classify_email(email: str) -> dict:
    e = email.strip().lower()
    domain = email_domain(e)
    return {
        "email_normalized": e,
        "malformed": is_malformed_email(e),
        "domain": domain,
        "is_freemail": domain in C.FREEMAIL_DOMAINS,
        "is_competitor_domain": domain in C.COMPETITOR_DOMAINS,
        "is_disposable_domain": domain in C.DISPOSABLE_DOMAINS,
        "is_academic_domain": any(domain.endswith(suf) for suf in C.ACADEMIC_DOMAIN_SUFFIXES),
        "is_suspicious_fake": is_suspicious_fake_email(e),
    }


def normalize_country(raw: str) -> dict:
    v = raw.strip()
    if v.lower() in C.SUSPICIOUS_COUNTRY_VALUES or v == "":
        return {"value": "", "suspicious": v != "" and v.lower() not in ("",), "raw": raw}
    iso = C.COUNTRY_ALIASES.get(v.lower())
    if iso:
        return {"value": iso, "suspicious": False, "raw": raw}
    return {"value": v, "suspicious": False, "unmapped": True, "raw": raw}


def normalize_consent(raw: str) -> str:
    return C.CONSENT_ALIASES.get(raw.strip().lower(), "unknown")


def normalize_utm(raw: str, field: str) -> dict:
    decoded = urllib.parse.unquote(raw).strip()
    if decoded.lower() in C.UTM_PLACEHOLDER_VALUES:
        return {"value": "", "is_placeholder": True}
    folded = C.UTM_VALUE_ALIASES.get(decoded.lower())
    if folded:
        return {"value": folded, "is_placeholder": False}
    cleaned = collapse_whitespace(decoded).lower()
    sep = "-" if field == "utm_campaign" else "_"
    cleaned = cleaned.replace(" ", sep)
    return {"value": cleaned, "is_placeholder": False}


def normalize_website(raw: str) -> dict:
    v = raw.strip()
    if not v:
        return {"value": "", "valid": False, "had_protocol": False}
    had_protocol = v.lower().startswith(("http://", "https://"))
    bare = re.sub(r"^https?://", "", v, flags=re.IGNORECASE)
    bare = re.sub(r"^www\.", "", bare, flags=re.IGNORECASE).rstrip("/").lower()
    valid = "." in bare and " " not in bare
    return {"value": bare, "valid": valid, "had_protocol": had_protocol}


def normalize_name_like(raw: str) -> str:
    v = collapse_whitespace(raw)
    if v.isupper() or v.islower():
        return v.title()
    return v


# ---------------------------------------------------------------------------
# analyze
# ---------------------------------------------------------------------------

def analyze(input_path: str) -> dict:
    df = load_csv(input_path)
    n = len(df)

    columns = []
    for col in df.columns:
        blank = (df[col].str.strip() == "").sum()
        columns.append({
            "name": col,
            "dtype": "string",
            "null_count": int(blank),
            "null_pct": round(100 * blank / n, 2) if n else 0,
            "distinct_count": int(df[col].nunique()),
        })

    # --- duplicates -----------------------------------------------------
    raw_email_dupes = int(df["email"].duplicated().sum())
    norm_emails = df["email"].str.strip().str.lower()
    normalized_dupe_mask = norm_emails.duplicated(keep=False)
    normalized_dupes = int(norm_emails.duplicated().sum())

    sample_groups = []
    if normalized_dupe_mask.any():
        for key, group in df[normalized_dupe_mask].assign(_norm=norm_emails[normalized_dupe_mask]).groupby("_norm"):
            sample_groups.append({
                "email_normalized": key,
                "lead_ids": group["lead_id"].tolist(),
                "created_dates": group["created_date"].tolist(),
            })
            if len(sample_groups) >= 15:
                break

    # --- country ----------------------------------------------------------
    country_variants = defaultdict(set)
    suspicious_count = 0
    unmapped_values = set()
    for raw in df["country"]:
        r = normalize_country(raw)
        if r.get("suspicious"):
            suspicious_count += 1
        elif r.get("unmapped"):
            unmapped_values.add(raw.strip())
        elif r["value"]:
            country_variants[r["value"]].add(raw.strip())
    grouped_variants = {k: sorted(v) for k, v in country_variants.items() if len(v) > 1}

    # --- utm ----------------------------------------------------------------
    utm_report = {}
    for field in ("utm_source", "utm_medium", "utm_campaign"):
        placeholder_counts = defaultdict(int)
        real_values = set()
        for raw in df[field]:
            r = normalize_utm(raw, field)
            if r["is_placeholder"]:
                placeholder_counts[raw] += 1
            elif r["value"]:
                real_values.add(r["value"])
        utm_report[field] = {
            "placeholder_counts": dict(placeholder_counts),
            "placeholder_total": sum(placeholder_counts.values()),
            "distinct_real_values_after_normalization": len(real_values),
        }

    # --- marketing_consent ---------------------------------------------------
    consent_counts = df["marketing_consent"].value_counts().to_dict()
    proposed_mapping = {k: normalize_consent(k) for k in consent_counts}

    # --- job_title ------------------------------------------------------------
    jt_blank = int((df["job_title"].str.strip() == "").sum())
    jt_ws_issue = int(df["job_title"].apply(lambda v: bool(WHITESPACE_ISSUE_RE.search(v))).sum())
    jt_case_issue = int(df["job_title"].apply(lambda v: v != "" and (v.isupper() or v.islower())).sum())

    # --- company (variant grouping as a proxy for typos/casing drift) --------
    company_ws_issue = int(df["company"].apply(lambda v: bool(WHITESPACE_ISSUE_RE.search(v))).sum())
    company_groups = defaultdict(set)
    for raw in df["company"]:
        key = collapse_whitespace(raw).lower()
        if key:
            company_groups[key].add(raw)
    company_variant_groups = [
        {"normalized": k, "variants": sorted(v)}
        for k, v in company_groups.items() if len(v) > 1
    ][:20]

    # --- email ------------------------------------------------------------------
    malformed = 0
    competitor_hits = 0
    disposable_hits = 0
    freemail_count = 0
    work_count = 0
    suspicious_fake_hits = 0
    for raw in df["email"]:
        c = classify_email(raw)
        if c["malformed"]:
            malformed += 1
        if c["is_competitor_domain"]:
            competitor_hits += 1
        if c["is_disposable_domain"]:
            disposable_hits += 1
        if c["is_suspicious_fake"]:
            suspicious_fake_hits += 1
        if c["is_freemail"]:
            freemail_count += 1
        else:
            work_count += 1

    # --- company_website -----------------------------------------------------------
    site_missing = 0
    site_no_protocol = 0
    site_malformed = 0
    for raw in df["company_website"]:
        r = normalize_website(raw)
        if r["value"] == "":
            site_missing += 1
        else:
            if not r["had_protocol"]:
                site_no_protocol += 1
            if not r["valid"]:
                site_malformed += 1

    recommendations = [
        {"field": "email", "issue": "duplicate records (case/whitespace variants of the same address)",
         "proposed_fix": "normalize to lowercase/trimmed and dedupe, keeping the most recent created_date per group",
         "affected_rows": normalized_dupes},
        {"field": "country", "issue": "same country spelled multiple ways (name vs. ISO code vs. casing)",
         "proposed_fix": "map to ISO 3166-1 alpha-2 via an alias table",
         "affected_rows": sum(len(v) for v in country_variants.values())},
        {"field": "country", "issue": "junk/unusable values ('??', 'earth', blank)",
         "proposed_fix": "null out and flag as suspicious rather than guess",
         "affected_rows": suspicious_count},
        {"field": "marketing_consent", "issue": "17 distinct spellings of what should be a boolean-ish field",
         "proposed_fix": "map to a tri-state true/false/unknown via an alias table",
         "affected_rows": n - consent_counts.get("", 0)},
        {"field": "utm_source/utm_medium/utm_campaign", "issue": "placeholder/test values (null, undefined, {{...}}, (direct), test)",
         "proposed_fix": "normalize placeholders to null and flag with is_placeholder_utm",
         "affected_rows": sum(v["placeholder_total"] for v in utm_report.values())},
        {"field": "job_title/company", "issue": "leading/trailing/doubled whitespace",
         "proposed_fix": "trim and collapse internal whitespace",
         "affected_rows": jt_ws_issue + company_ws_issue},
        {"field": "company_website", "issue": "inconsistent scheme/www formatting or missing values",
         "proposed_fix": "normalize to a canonical bare-domain form",
         "affected_rows": site_no_protocol + site_missing},
        {"field": "email", "issue": "leads from named competitor domains",
         "proposed_fix": "suppress at routing time per the ICP memo",
         "affected_rows": competitor_hits},
        {"field": "email/first_name/last_name/company", "issue": "clearly fake/spam test records (e.g. aaa@bbb.cc with blank company/title/industry)",
         "proposed_fix": "suppress at routing time per the ICP memo's 'spam and clearly fake records' rule",
         "affected_rows": suspicious_fake_hits},
    ]

    return {
        "meta": {
            "input_file": str(input_path),
            "row_count": n,
            "column_count": len(df.columns),
            "generated_at": now_iso(),
        },
        "columns": columns,
        "duplicates": {
            "exact_email_dupes": raw_email_dupes,
            "normalized_email_dupes": normalized_dupes,
            "sample_groups": sample_groups,
        },
        "anomalies": {
            "country": {
                "distinct_raw_values": int(df["country"].nunique()),
                "grouped_variants": grouped_variants,
                "suspicious_value_count": suspicious_count,
                "unmapped_values": sorted(unmapped_values),
            },
            "utm": utm_report,
            "marketing_consent": {
                "distinct_spellings": len(consent_counts),
                "value_counts": consent_counts,
                "proposed_boolean_mapping": proposed_mapping,
            },
            "job_title": {
                "null_count": jt_blank,
                "whitespace_issue_count": jt_ws_issue,
                "case_issue_count": jt_case_issue,
            },
            "company": {
                "whitespace_issue_count": company_ws_issue,
                "variant_groups": company_variant_groups,
            },
            "email": {
                "malformed_count": malformed,
                "competitor_domain_hits": competitor_hits,
                "disposable_domain_hits": disposable_hits,
                "suspicious_fake_hits": suspicious_fake_hits,
                "freemail_count": freemail_count,
                "work_domain_count": work_count,
            },
            "company_website": {
                "missing_count": site_missing,
                "protocol_missing_count": site_no_protocol,
                "malformed_count": site_malformed,
            },
        },
        "recommendations": recommendations,
    }


# ---------------------------------------------------------------------------
# sanitize
# ---------------------------------------------------------------------------

def apply_overrides(instructions: dict | None) -> list[str]:
    """Merge user-supplied override maps on top of the built-in constants.
    Returns the list of override keys that were actually applied."""
    applied = []
    if not instructions:
        return applied
    overrides = instructions.get("overrides") or {}
    override_targets = {
        "country_aliases": C.COUNTRY_ALIASES,
        "consent_aliases": C.CONSENT_ALIASES,
        "utm_value_aliases": C.UTM_VALUE_ALIASES,
        "utm_placeholder_values": None,  # set, handled separately
        "freemail_domains": None,
        "competitor_domains": None,
        "disposable_domains": None,
    }
    for key, value in overrides.items():
        if key not in override_targets:
            continue
        if key == "utm_placeholder_values":
            C.UTM_PLACEHOLDER_VALUES.update(set(value))
        elif key == "freemail_domains":
            C.FREEMAIL_DOMAINS.update(set(value))
        elif key == "competitor_domains":
            C.COMPETITOR_DOMAINS.update(set(value))
        elif key == "disposable_domains":
            C.DISPOSABLE_DOMAINS.update(set(value))
        else:
            override_targets[key].update(value)
        applied.append(key)
    return applied


def sanitize(input_path: str, instructions: dict | None) -> tuple[pd.DataFrame, dict]:
    df = load_csv(input_path)
    n = len(df)
    applied_overrides = apply_overrides(instructions)

    counts = defaultdict(int)

    for field in ("first_name", "last_name", "company", "job_title"):
        raw_col = f"{field}_raw"
        df[raw_col] = df[field]
        cleaned = df[field].apply(normalize_name_like if field in ("first_name", "last_name") else collapse_whitespace)
        counts[f"{field}_normalized"] = int((cleaned != df[field]).sum())
        df[field] = cleaned

    country_raw = df["country"]
    country_results = country_raw.apply(normalize_country)
    df["country_raw"] = country_raw
    df["country"] = country_results.apply(lambda r: r["value"])
    df["is_suspicious_country"] = country_results.apply(lambda r: bool(r.get("suspicious")))
    counts["country_normalized"] = int((df["country"] != country_raw).sum())
    counts["country_suspicious"] = int(df["is_suspicious_country"].sum())

    df["marketing_consent_raw"] = df["marketing_consent"]
    df["consent_normalized"] = df["marketing_consent"].apply(normalize_consent)
    counts["consent_normalized"] = int((df["consent_normalized"] != df["marketing_consent"]).sum())

    for field in ("utm_source", "utm_medium", "utm_campaign"):
        raw_col = f"{field}_raw"
        df[raw_col] = df[field]
        results = df[field].apply(lambda v, f=field: normalize_utm(v, f))
        df[field] = results.apply(lambda r: r["value"])
        df[f"is_placeholder_{field}"] = results.apply(lambda r: r["is_placeholder"])
        counts[f"{field}_placeholder"] = int(df[f"is_placeholder_{field}"].sum())

    df["email_raw"] = df["email"]
    email_results = df["email"].apply(classify_email)
    df["email_normalized"] = email_results.apply(lambda r: r["email_normalized"])
    df["email_type"] = email_results.apply(lambda r: "freemail" if r["is_freemail"] else "work")
    df["is_competitor_domain"] = email_results.apply(lambda r: r["is_competitor_domain"])
    df["is_disposable_domain"] = email_results.apply(lambda r: r["is_disposable_domain"])
    df["is_academic_domain"] = email_results.apply(lambda r: r["is_academic_domain"])
    df["is_malformed_email"] = email_results.apply(lambda r: r["malformed"])
    df["is_suspicious_fake"] = email_results.apply(lambda r: r["is_suspicious_fake"])
    counts["email_competitor_domain"] = int(df["is_competitor_domain"].sum())
    counts["email_disposable_domain"] = int(df["is_disposable_domain"].sum())
    counts["email_malformed"] = int(df["is_malformed_email"].sum())
    counts["email_suspicious_fake"] = int(df["is_suspicious_fake"].sum())

    df["company_website_raw"] = df["company_website"]
    site_results = df["company_website"].apply(normalize_website)
    df["company_website"] = site_results.apply(lambda r: r["value"])
    df["company_website_valid"] = site_results.apply(lambda r: r["valid"])
    counts["company_website_normalized"] = int((df["company_website"] != df["company_website_raw"]).sum())

    # --- dedup: one record per person, keep most-recent created_date, flag conflicts ---
    df["dedup_group_id"] = ""
    df["is_duplicate_primary"] = True
    df["dedup_conflict_flag"] = False
    df["dedup_conflict_fields"] = ""

    conflict_check_fields = ["company", "job_title", "company_size", "industry", "country", "consent_normalized"]
    groups = df.groupby("email_normalized")
    dupe_groups = 0
    conflict_groups = 0
    for key, idx in groups.groups.items():
        if not key or len(idx) < 2:
            continue
        dupe_groups += 1
        group = df.loc[idx].copy()
        group["_created_dt"] = pd.to_datetime(group["created_date"], errors="coerce")
        group = group.sort_values("_created_dt", ascending=False, na_position="last")
        primary_idx = group.index[0]
        other_idx = group.index[1:]

        df.loc[idx, "dedup_group_id"] = key
        df.loc[idx, "is_duplicate_primary"] = False
        df.loc[primary_idx, "is_duplicate_primary"] = True

        conflicting_fields = []
        for f in conflict_check_fields:
            distinct_vals = {v for v in group[f].tolist() if v not in ("", None)}
            if len(distinct_vals) > 1:
                conflicting_fields.append(f)
        if conflicting_fields:
            conflict_groups += 1
            df.loc[idx, "dedup_conflict_flag"] = True
            df.loc[idx, "dedup_conflict_fields"] = ",".join(conflicting_fields)

    counts["duplicate_groups_found"] = dupe_groups
    counts["duplicate_conflict_groups"] = conflict_groups

    report = {
        "meta": {"input_file": str(input_path), "row_count_in": n, "generated_at": now_iso()},
        "row_count_out": int(df["is_duplicate_primary"].sum()),
        "transformations_applied": dict(counts),
        "instructions_applied": applied_overrides,
        "instructions_notes": (instructions or {}).get("notes", ""),
    }
    return df, report


# ---------------------------------------------------------------------------
# CLI
# ---------------------------------------------------------------------------

def write_json(obj: dict, path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(obj, indent=2, default=str))


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    sub = parser.add_subparsers(dest="mode", required=True)

    p_analyze = sub.add_parser("analyze")
    p_analyze.add_argument("--input", required=True)
    p_analyze.add_argument("--output-dir", required=True)

    p_sanitize = sub.add_parser("sanitize")
    p_sanitize.add_argument("--input", required=True)
    p_sanitize.add_argument("--output-dir", required=True)
    p_sanitize.add_argument("--instructions-file", required=False, default=None)

    args = parser.parse_args()

    try:
        if args.mode == "analyze":
            report = analyze(args.input)
            write_json(report, Path(args.output_dir) / "analysis-report.json")
            print(json.dumps(report, default=str))
        elif args.mode == "sanitize":
            instructions = None
            if args.instructions_file and Path(args.instructions_file).exists():
                instructions = json.loads(Path(args.instructions_file).read_text())
            df, report = sanitize(args.input, instructions)
            out_dir = Path(args.output_dir)
            out_dir.mkdir(parents=True, exist_ok=True)
            sanitized_path = out_dir / "sanitized.csv"
            df.to_csv(sanitized_path, index=False)
            report["sanitized_csv_path"] = str(sanitized_path)
            write_json(report, out_dir / "sanitize-report.json")
            print(json.dumps(report, default=str))
        return 0
    except Exception as exc:  # noqa: BLE001 - deliberate: surface any failure as structured JSON
        print(json.dumps({"error": type(exc).__name__, "detail": str(exc)}), file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
