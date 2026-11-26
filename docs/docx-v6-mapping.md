# V6 DOCX Projection Contract

PDF remains the exact print representation. DOCX preserves supported V6 semantics and may
repaginate in Microsoft Word, LibreOffice, or Google Docs.

| V6 construct | OOXML projection | Fallback / warning |
|---|---|---|
| document settings | one `w:sectPr` with A4 size, orientation, margins, and title-page flag | invalid settings are rejected by Go before export |
| named paragraph style | reusable `w:style` based on Quotier Normal | controlled font aliases map to the substitutions below |
| direct paragraph attributes | `w:pPr` alignment, spacing, indents, keep-next/keep-lines, widow control | unsupported attributes cannot enter the validated V6 schema |
| text and hard break | `w:r` / `w:t` and run break | none |
| bold, italic, underline, strike, size, color, highlight | direct `w:rPr` overrides | none |
| safe HTTP(S)/mailto link | hyperlink relationship plus `w:hyperlink` | unsafe links become plain text with `unsafe_link` warning |
| bullet / ordered lists | Word numbering definitions and paragraph numbering | each ordered-list node receives a separate numbering instance |
| explicit page break | `w:br` page break in its own paragraph | automatic PDF breaks are intentionally not exported |
| header/footer stories | related header/footer parts; optional first-page variants | unsupported story nodes produce `unsupported_node` warning |
| page number / page count | `PAGE` / `NUMPAGES` fields | consumer recalculates fields on open |
| horizontal rule | paragraph bottom border | none |
| generic table | fixed `w:tblGrid`, width/alignment, repeated header rows, minimum heights, spans, padding, shading, borders, and rich cell blocks | nested tables remain invalid V6 content |
| line-item table | fixed semantic table with configured columns and repeated header | persisted row inputs are displayed; totals use backend-authoritative saved quotation totals |
| business field | resolved snapshot/draft value emitted as ordinary text | blank/fallback follows the field policy; unresolved diagnostic fields produce `missing_field` warning |
| managed image | deduplicated media relationship and inline DrawingML with physical size and alt text | missing alt text produces `missing_alt_text`; invalid/missing managed assets fail export |

## Font policy

DOCX does not embed Quotier's bundled PDF fonts. To avoid silent references to private aliases, the
projector uses these broadly available consumer substitutions:

| V6 family | DOCX family |
|---|---|
| Quotier Sans | Arial |
| Quotier Serif | Times New Roman |
| Quotier Mono | Courier New |

Consumers may substitute metrically compatible fonts when these names are unavailable. That can
change pagination but must not change document semantics. PDF continues to use Quotier's bundled
font catalog and is the fidelity authority.

## Package safety

The desktop boundary validates the completed ZIP before opening/replacing the destination. It
requires the core DOCX parts, bounds compressed output and expanded content, rejects duplicate or
traversing paths, macros, ActiveX, embedded objects, custom UI, malformed relationships, and all
external relationships except allowlisted HTTP(S)/mailto hyperlinks. The validated bytes are then
written with the existing atomic replacement helper.
