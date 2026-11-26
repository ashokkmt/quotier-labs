# V6 DOCX Compatibility Matrix

## Automated package baseline

| Area | Result | Evidence |
|---|---|---|
| ZIP and required OOXML parts | Pass | package and transport regression tests |
| styles and direct formatting | Pass | XML semantic inspection |
| independent numbering, headers/footers, PAGE/NUMPAGES, explicit break | Pass | XML semantic inspection |
| fixed tables, repeated headers, spans, minimum heights, rich cells | Pass | XML semantic inspection |
| deduplicated managed images and alt text | Pass | projector regression test |
| resolved fields and backend-authoritative quotation totals | Pass | projector regression test |
| unsafe paths, macros, embedded content, and external assets | Rejected | transport security tests |
| cancellation and atomic destination replacement | Pass | projector cancellation and shared atomic-write tests |
| exporter dependency | Pass | existing `docx` 9.7.1, MIT; no new exporter dependency introduced |

## Consumer qualification

The release candidate must be opened without a repair prompt and reviewed against the fixture in
each supported consumer. Exact pagination is not an acceptance requirement.

| Consumer | Version tested | Open/repair | Semantic review | Visual tolerance | Status |
|---|---|---|---|---|---|
| Microsoft Word | release-machine current | — | text, lists, fields, tables, images, stories, breaks | fonts may substitute; pagination may move | Manual release check required |
| LibreOffice Writer | LibreOfficeDev 26.8.0.0.alpha0, ARM64 | Opened and converted headlessly without repair | fixture included text, ordered list, fixed table, footer PAGE field, and explicit break; output PDF was A4 and tagged | no automated conversion failure | Pass (automated smoke); final release UI review still required |
| Google Docs import | current web release | — | same checklist | fields and pagination may be recalculated | Manual release check required |

Use one representative simple quotation and one table/image-heavy multi-page quotation. Record the
exact application versions, any repair prompt, missing semantic content, and release-blocking visual
differences here. This manual qualification cannot be truthfully completed by automated unit tests.
