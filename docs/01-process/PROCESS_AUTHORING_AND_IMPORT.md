# Process authoring and Excel import

13 September 2026 · Proposed implementation contract. This owns draft editing and source conversion only. [SOP Version Model](SOP_VERSION_MODEL.md) owns lifecycle/publication; [Process Model](MUSHROOMOS_PROCESS_MODEL.md) owns graph meaning and factory decisions. The supplied FINAL library places SOP management beyond the immediate execution release; keep it on the complete-project roadmap without delaying independent integrity fixes.

## Entry and output

Admin can start blank, copy an existing version, or import a workbook. All three produce the same structured, editable draft. Excel is an input format, never a production engine or automatic publisher. Reuse existing process and laboratory families; do not create a second recipe engine. Exact draft APIs/storage remain to be designed against current schema.

Blank creates a new draft identity. Copy creates a distinct graph with explicit lineage and remapped internal references; editing it cannot alter its published source. Import creates a source artifact and conversion proposal, not a selectable process version. Existing active and historical batches remain pinned to their version.

## Draft activity editing

Each activity supports identity/code, purpose/name, stage, stream, scope/cardinality, work/hold/lab/decision kind, standard/min/max duration and timing basis, typed start/end conditions, predecessor edges, derived successors, responsible role, resource classes, lab bindings, evidence requirements, gates and controlled options. Values carry source/provenance and confirmation status.

Show graph and tabular views of the same draft; neither maintains independent state. Add/edit/remove/reorder operations validate references. Moving a row changes presentation unless the user explicitly changes dependencies. Removing referenced work raises a conflict; it does not silently delete dependent gates. Parallel streams converge on explicit subjects and predicates. Repeated pile/bunker work uses declared expansion rules; a fixed row count is not universal completeness.

Typed duration relationships such as “same as Stage 1B Pass 1” belong to version data and validation. Resolve the numeric outcome for the reviewed version without creating a mutable reference to another published version. Resource classes are recipe requirements; physical unit usage remains operational unless an approved scheduling contract states otherwise.

## Workbook conversion pipeline

1. Preserve original bytes, filename, content hash, import actor/time and parser version. Reject unsupported/corrupt/encrypted formats clearly. Do not execute macros or external workbook links.
2. Inventory every sheet, hidden row/sheet, merged cell, formula, cached value, unit and note. Retain raw cell values and formulas separately. A cached formula result is not a freshly verified calculation.
3. Propose field mappings to existing graph concepts. Show unmatched headings, ambiguous stage membership, duplicate identifiers, mixed units, missing bounds and unmapped notes. Confidence is parser confidence, not factory approval.
4. Let the reviewer map a source row/range to an activity, grouping, note, option or unresolved item. No automatic dependencies from row adjacency; no blank-to-zero duration; no automatic role/threshold/gate/default evidence count.
5. Show proposed draft beside source cells. Each field retains workbook hash, sheet, cell/range, raw text/formula, normalized candidate, transformation and reviewer decision. Manual additions carry manual provenance and reason.
6. Validate structural correctness and factory-rule completeness using the version model. Parsing success alone never clears unresolved semantics.
7. Review a diff against any copied version: activities, timings, scopes, dependencies, conditions, roles, lab/evidence/resource bindings and resulting named milestones. Edits invalidate prior review/validation of that draft revision.
8. Only the version lifecycle's authorized review/publish operation may promote the exact reviewed revision. Import never calls publication automatically.

## Conflict and retry contract

Keep statuses distinct: unmapped, proposed mapping, needs factory decision, reviewer-confirmed, excluded with reason and validation error. A warning must not silently become an allowed value. Store source/revision identity and stable command identity so repeated import/save cannot duplicate logical drafts. Upload/parse/map/save are separately recoverable; preserve reviewer choices on retry. Reimport creates an explicit new source/revision and diff; it never overwrites a reviewed draft invisibly.

Example from the FINAL library: the supplied revised workbook has Stage 1B rows C24:D26 containing heading12, mixing8 and hopper4. The separately requested second pass/rest amendment is not present in those cells. Paddy soaks occur at C30:D32. Import must preserve those locations and flag the proposed amendment's different provenance; it must not relabel the soaks Stage 1B to fit prose.

## Required interface and contracts

Extend A10/A11 in [Screen Specification](../05-ui/SCREEN_SPECIFICATION.md) with source upload, sheet inventory, mapping review, conflict resolution, draft graph/table editor and version diff. Always show current draft/source revision, validation status and who must resolve a blocking issue. Empty means no source or no mapped activities, not a default recipe. Loading/error/blocked states preserve unsaved mappings. Published views are read-only.

Required server capabilities, not invented callable RPC names: authorized draft create/copy; revision-aware graph edit; source upload/provenance read; import proposal persistence; mapping review; full draft validation; revision-bound review/publication; immutable published reads. Verify existing tables/functions before naming new storage. Review/copy/import access follows approved publication policy D12.

## Acceptance

Test blank and copy paths, both supplied workbooks, hidden/merged rows, formulas without caches, invalid units, duplicates, unmatched notes, conflicting stage totals, unresolved triggers, cycles, invalid scope expansion, missing lab/evidence mapping, stale review, concurrent edits, repeated imports, failed saves and unauthorized publication. Assert original bytes/provenance survive and old batches retain exactly the same interpretation after new publication. Do not claim arbitrary Excel layouts supported until tested. See acceptance K/L and [Project Delivery](../03-mission/PROJECT-DELIVERY.md).
