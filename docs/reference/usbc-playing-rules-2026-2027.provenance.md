# USBC Playing Rules 2026–2027 — immutable scoring-rule provenance

This file is the in-repository immutable reference for ARCH-001 Slice 4 scoring
authority. It identifies the official USBC/BOWL.com artifact. It does **not**
reproduce USBC Playing Rules text.

The official publication is copyrighted by the United States Bowling Congress.
It is **not** committed to this repository.

```ini
RULE_AUTHORITY=UNITED_STATES_BOWLING_CONGRESS
RULE_SET=USBC_PLAYING_RULES
RULE_AUTHORITY_SHORT=USBC_PLAYING_RULES
RULE_EDITION=2026-2027
SCORING_DOMAIN=AMERICAN_TENPINS
RULE_REFERENCE_IMMUTABLE=true
HISTORICAL_RECOMPUTATION_RULESET_PINNED=true
EXTERNAL_FUTURE_RULE_CHANGES_DO_NOT_MUTATE_EXISTING_RESULTS=true
SOURCE_HOST=bowl.com
LISTING_URL=https://bowl.com/rules
SOURCE_URL=https://images.bowl.com/bowl/media/assets/usbc/rules/general%20pdfs/usbc-playing-rulebook-26-27.pdf
SOURCE_FILENAME=usbc-playing-rulebook-26-27.pdf
SOURCE_BYTES=2065204
SOURCE_PDF_VERSION=1.4
SOURCE_PDF_MODDATE=D:20260731100401-05'00'
SOURCE_PDF_CREATOR=Adobe InDesign 21.2 (Macintosh)
RETRIEVED_AT=2026-09-07T13:43:00Z
SOURCE_SHA256=4cb44a2a9d62fdf18957da2db4646e05342eebdc308cc56711a6249ad2cdddec
PUBLICATION_COMMITTED=false
```

## How this artifact was identified

1. Canonical USBC rules landing page `https://bowl.com/rules` labels the current
   rulebook **2026-2027 USBC Rulebook** and links **CLICK HERE** to
   `usbc-playing-rulebook-26-27.pdf` on `images.bowl.com`.
2. The downloaded bytes are a complete PDF (`%PDF-1.4` header, `%%EOF` trailer),
   2065204 bytes.
3. SHA-256 was computed twice on the same file (PowerShell `Get-FileHash` and
   Windows `certutil -hashfile … SHA256`). Both produced
   `4cb44a2a9d62fdf18957da2db4646e05342eebdc308cc56711a6249ad2cdddec`.
4. The PDF’s internal calendar section is labeled **2026-2027 Season**. PDF
   modification date is `2026-07-31T10:04:01-05:00`.
5. Scoring domain identity for this product is **American Tenpins** as defined
   in that publication’s Chapter 2 General Playing Rules, Rule 2 (The Game).
   Future scoring implementation must use that pinned Rule 2 scoring system and
   must not silently adopt a later USBC edition.

## Supporting USBC statement (not a substitute rulebook)

USBC Rules Extra (May 2026), official `images.bowl.com` publication
`https://images.bowl.com/bowl/media/assets/usbc/rules/rules%20extra/rules-extra-may-2026.pdf`,
states that there were no changes to the USBC Playing Rules for the 2026–2027
season. That statement explains continuity of the Playing Rules text; the
authoritative scoring artifact remains the 2026–2027 rulebook PDF hashed above.

## Re-verification

To prove the same artifact later:

1. Download `SOURCE_URL`.
2. Confirm byte length `2065204`.
3. Confirm SHA-256 `4cb44a2a9d62fdf18957da2db4646e05342eebdc308cc56711a6249ad2cdddec`.

A later USBC edition, URL, or hash is a **different** ruleset and requires an
explicit architecture/version change. Existing derived scores under this pin
must not change.
