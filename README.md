# BetterDeck Planner

A browser-based React + TypeScript deck concept planner. Run with Node 22.6+:

```sh
npm install
npm run dev
npm test
npm run build
npm run lint
```

## Guided workflow

One progress sequence replaces the separate step and view tab bars:

1. **Shape** — rectangle/L/U/angled templates, coordinate entry or click-to-draw editing. Drag, insert/delete and nudge corners; set exact edge lengths, bearings and interior angles. Grid/angle snapping and draft undo/redo are available. Apply or revert a draft before leaving the step.
2. **Boards** — saved product profiles, 3.66/4.88/custom stock, full-width picture-frame perimeter, infill direction/joint policy, optional straight ripping and balanced/economy/custom breaker placement. Breaker width can be automatic, one board or two boards. Perimeter and breaker stock joints are added only when a continuous section exceeds stock length.
3. **Supports** — customer build-up height/ground variation, live load, joist centres and independent automatic/manual frame and pedestal selection. Choose lowest material cost, simplest frame or fewest pedestals. Bearing dimensions and custom product limits sit in Advanced settings. The live plan stays visible alongside the controls.
4. **Finish** — colour, mouse/touch drag to rotate and tilt the 3D view (horizontal dragging uses the reversed direction), right-side picture cards exposing each successive layer, and optional full-height skirting. Keyboard arrows, camera buttons and Home/reset are also available. Skirting is a separate fascia product with an entered height, selected stock length and finish. The average ground clearance is displayed; the planner never rips it down to fit.
5. **Review** — quantities, optional EUR rates, cutting schedules, support checks and notes. CSV exports separate purchase quantities, materials quotes, board/aluminium/skirting cuts, pedestal positions and project details into consistent tables.

The Boards step offers Board smaller / Board bigger size previews, including unresolved layouts. Rectangles snap to the neighbouring full-row dimensions; already-fitting rectangles add/remove one board width plus gap. Irregular outlines solve the perimeter inset to find neighbouring whole-row dimensions, scaling across the board run from the minimum coordinate. Stock length remains unchanged. Previews show the original/proposed outline and recalculate board/support checks; no change is applied until selected. Resizing never silently switches a frame or promises to resolve its restrictions.

Projects, product profiles and rates persist in browser storage. The Project menu imports/exports versioned JSON. New deck retains product profiles and stores the previous deck for restoration, including after reload. `examples/starter-deck.json` contains a whole-board-fitting starter rectangle. Applied outlines save even when a board layout is unresolved; unapplied editor drafts do not survive reload.

## Perimeter and infill cuts

Every outside edge receives a board parallel to that edge, with mitred corner geometry. The infill region is inset by one full board width plus the installation gap. All cutting blanks use the entered stock width. Crosscuts, straight rips, angled rips and tapered edge pieces are allowed by default, including existing projects without a saved cut policy. The Boards step can disable straight ripping. Board smaller / Board bigger dimension previews remain available with either policy.

Angled ends may follow a connected chain of angled edges across a corner. Butt joints share two globally aligned staggered support lattices, with a bounded common phase search; short runs remain unbroken. Angled end regions may be split into tapered pieces within the selected stock length, including at breaker bays. These pieces remain clipped to the outline and use real frame bearings. A common butt-lattice phase is retried when the initial layout puts parallel bearing faces too close together.

With straight ripping enabled, outside infill rows are cut to equal finished widths, avoiding a thin sliver and filling the cross-run depth while retaining installation gaps. Disabling straight ripping places only whole-width rows with the remaining clearance centred and visible. Rectangular layouts still offer lower/higher exact dimensions that fit whole-width rows. Ripping also fits local internal steps and recesses, using clipped/notched pieces. Disconnected intersections remain separate pieces, so boards do not bridge cut-outs. If ripping is disabled, interrupted whole-width rows remain visibly unfilled and flagged. Finished cut widths appear in plan tooltips and cutting-schedule tooltips/CSV; local rip/notch flags and outline coordinates are included in the CSV; product stock width and installation gaps remain unchanged.

Offsets that collapse, cross or cannot fit a narrow region fail explicitly. Supported outlines are simple 3–32 vertex polygons, up to 30 m in each direction, without holes. Complex inset splits require separate build zones. Geometrically filled infill still requires the selected support arrangement to pass its separate bearing checks.

Balanced breakers use equal clear bays and the minimum necessary line count. Lowest waste keeps the stock-packing heuristic, allowing asymmetric/additional breakers. Custom placement supports dragging, exact positions, mirrored edits and corner snapping. Guides stay perpendicular to the board run and are clipped to the infill polygon. A no-butt infill layout never adds butt joints within an infill bay. Each continuous breaker section stays in one piece if stock reaches; otherwise it uses the minimum number of butt joints with the entered end gap. Required breaker stock joints receive ladder noggins and an independent check of actual end bearing, including the face width needed for both ends. Disconnected sections across a cut-out are assessed separately. Cross-breaker mosaics and arbitrary regional/free-angle breaker paths are not implemented.

Stock cutting uses best-fit decreasing with entered saw kerf. It is a heuristic, not a guaranteed global optimum. Length loss is purchased length minus cutting-blank length; it does not include rip-width offcuts, angled end-cut area or intentional installation gaps. Width offcuts are not reused: each piece is conservatively packed from a full-stock-width blank. Quantities contain no blanket spare percentage. Fixings are allowances, not a confirmed clip/screw/connection schedule.

## Excel and CSV exports

Review offers seven reports with a styled document preview before downloading. Each file is one rectangular table with one header, so filters and sorting work without mixing unrelated sections:

- **Materials & pricing:** purchase quantities, stock dimensions, optional unit rates and line totals. The summary is either an entered-materials total or a known-priced subtotal; missing rates stay blank and zero prices remain valid.
- **Materials quote:** concise material quantities and prices, with an explicit incomplete status when prices or quantities are missing. It excludes labour, delivery, VAT, unlisted hardware and spare allowances; it is a provisional materials estimate.
- **Deck board cutting list:** stock board / piece IDs, cut order, use, blank length, finished maximum width, square/rip/notch/angled classification, local cut-outline coordinates and deck location. Kerf is per additional cut and the final remainder appears once per stock board.
- **Alu-Joist cutting list:** profile stock allocation, member/piece IDs, member type and physical endpoints. Packed cuts map back to actual frame members.
- **Fascia cutting list:** separate fascia stock allocation, edge IDs, cut lengths, height, physical endpoints and clearance status.
- **Pedestal positions:** one row per actual base, physical deck coordinates, base dimensions, required/product height ranges and shared junction flags.
- **Project details & checks:** outline corners, product settings, coordinate conventions, span source/limits, individual geometry checks and individual review notes.

Dimensions use millimetres (area uses m²), pricing uses EUR. Physical coordinates use a normalised deck origin with X right and Y down, including after flipping the board direction. Cut outlines use local blank length/width from their minimum bounds. Final remainder follows the planner's inter-cut kerf convention; it is not a guarantee of reusable workshop offcut. Width offcuts are not reused.

The **Styled Excel pack** includes Quote, Materials and all available schedule tabs. The Quote and Materials headers include a fixed-camera 3D render generated from the current shape, boards, colour and skirting; the same SVG is shown in the report preview and rasterised for embedding in Excel. CSV remains text-only. It uses BetterDeck green headings, alternating rows, fitted columns, frozen headers, filters, EUR number formats and print settings. Editable unit rates on Materials feed linked quote formulas and totals; missing rates and quantities stay blank and highlighted. The workbook requests recalculation when opened. Excel generation is loaded only when requested.

CSV retains the plain rectangular data for imports; colours, fonts and column widths are available in Excel, not CSV. Files use UTF-8 with a BOM, CRLF and quoted fields. Choose comma or semicolon for local spreadsheet settings. User-authored formula-like text is exported as literal text. Geometry exports are current-design snapshots; Excel pricing remains editable and linked within the exported workbook. UI and CSV pricing share the same line-by-line cent rounding. When support geometry fails, required frame/pedestal items remain visible with pending quantities and no line total; frame/pedestal detail downloads are unavailable. Disabled skirting has no cutting-list download.

## Structural source and recheck

Source: the user-supplied **Aluminium Profiles Design**, Betterdeck Ltd, contract **1513-1**, revision **2**, **15 June 2021**, in the adjacent `betterdeck design/pedistals span reports .pdf`. The source is not redistributed. Summary PDF pages 5 and 7, diagrams and relevant calculations were rechecked.

| K-series frame | Live load kN/m² | Primary support span max mm | Secondary span / bearer centres max mm | Case |
| --- | ---: | ---: | ---: | --- |
| 35 mm joist | 3 | 900 | — | 4A |
| 35 mm joist | 5 | 600 | — | 4A |
| 80 mm joist | 3 | 1900 | — | 1A |
| 80 mm joist | 5 | 1600 | — | 1A |
| 35 mm bearer + 35 mm joist | 3 | 700 | 900 | 4B |
| 35 mm bearer + 35 mm joist | 5 | 800 | 600 | 4B |
| 80 mm bearer + 35 mm joist | 3 | 1500 | 900 | 1B |
| 80 mm bearer + 35 mm joist | 5 | 1500 | 600 | 1B |

Joist centres are limited to 400 mm with boards perpendicular to joists, as specified on PDF page 5. Both board directions keep that angle. Infill runs at 45 degrees are not offered (the report specifies 300 mm centres for that case). Two-tier perimeter boards have a continuously borne upper trim rim, including arbitrary angles; this is an added geometric topology requiring supplier connection and load-path design, not an approved report detail. Direct angled perimeters can use same-level trim with actual pedestal bearings at every corner, incoming joist end and stock splice. These junctions also require supplier connection detailing; the span report does not approve the added topology. R-series paver tables are excluded.

The apparently unusual 4B increase from 700 mm at 3 kN/m² to 800 mm at 5 kN/m² is explicitly present in both the summary and calculations (PDF pages 63–67). Values are preserved and flagged for supplier confirmation. The single-35-mm 5 kN/m² section has a 900 mm heading typo; the summary, sketch and numerical calculation support the applied 600 mm limit.

## Height and automatic selection

The customer supplies ground-to-finished-board height. It is a constraint, never a value the selector adjusts. Board thickness plus assembled frame depth plus the remaining pedestal height must equal it. Ground variation ±V extends the required pedestal range by V in each direction. For example, 250 mm with 25 mm boards and an 80 mm direct joist leaves 145 mm; ±20 mm requires a model covering 125–165 mm. An average is not an individual pedestal site survey.

All fitting catalogue pedestal models are considered for each of the four offered frame arrangements. Height, report spans, bearing and full base clearance must pass before ranking. **Lowest material cost** compares packed purchase quantities at current net rates (including manual overrides); **Simplest frame** first minimises the number of frame layers; **Fewest pedestals** first minimises bases. Cost breaks ties for the latter two. Missing prices stay incomplete. Manual frame and pedestal locks are independent, and the objective persists in project JSON.

The model uses stacked bearer assemblies of 70 mm (35+35) and 115 mm (80+35). The report is a plan-view span calculation, not an assembly section; neither it nor the [official decking brochure](https://betterdeck.ie/wp-content/uploads/2021/06/Alu-Joist-Decking-Brochure-2021.pdf) establishes adaptor allowances or these assembled depths. Confirm the chosen construction. The brochure shows perpendicular and angled joiners, but gives no connection capacities or general arbitrary-edge load-transfer design. The app does not turn their existence into an invented cantilever or shared-head allowance. The report's additional 80+80 grid is not one of the four currently offered configurations.

## Support layout

The support solver uses the board geometry, actual base diameter, clearance, available frame stock and the selected report spans. It does not create a full bearer row for each sloping joist tip.

- Two-tier frames have a primary perimeter ring and a continuously borne upper trim rim. The trim line straddles the picture-frame/infill gap so the entered bearing face contacts both products. The report's 35/80 mm profile heights are not silently used as face widths: actual top-face width and required board-end bearing are separate editable inputs. Their 35 mm / 10 mm defaults are examples requiring product confirmation.
- Interior bearers start as a regular grid. If corners obstruct a grid phase, the solver searches independently movable rows, mixing boundary-ended rows with rows ending at the outermost joist. A shortest-path fallback avoids repeating corner conflicts. Every candidate must retain actual secondary bearings and spans.
- Ring corners and real bearer endpoints are fixed bearing nodes. Exactly coincident junctions are counted once; distinct nearby bases are never merged. Intermediate supports avoid the circular exclusion areas of all other bases. Junction heads must carry every meeting member and need explicit supplier design.
- Primary stock cuts end at actual pedestal nodes. Secondary stock cuts end at actual primary crossings. Joists terminate on the perimeter ring, including at sloped and concave boundaries. Collinear extra drawing points do not generate artificial corner pedestals.
- The trim setback is searched within the legal bearing-face range to clear tight necks and inside corners. Parallel upper faces are checked for physical overlap; breaker ladders split at intermediate rails instead of crossing them at the same height.
- Actual infill end-cut contact is audited against upper bearing faces, including short corner fragments and paired stock butt joints. A larger butt gap needs a sufficiently wide shared face. Breaker ladders carry no separate pedestal tier.
- Direct joist frames use paired full-width breaker boards automatically when bases cannot fit beneath the two rails flanking one board. The pair includes a real side gap and short transverse supports; its outer rails have separate bases. Every physical board is included in cuts and prices. The solver does not merge nearby bases, add a special head or assume unsupported joist tips. Explicit single-board selection remains single and reports real clashes.
- Square-cornered internal openings and sloping outside perimeters can use a direct joist frame. A continuous trim uses the selected 35/80 mm profile at joist level. Every trim corner, incoming joist end and stock joint has a pedestal; intervening supports respect the direct report span. Vertical trim members replace coincident joists, so profiles are not doubled. Base discs and member faces must clear the opening and all other supports. These trim junctions still require the appropriate supplier-approved heads and connections. Curved/angled internal openings retain the bearer-frame requirement until a suitable direct opening arrangement is implemented.
- Required orthogonal inside-edge joists and breaker end-support rows anchor direct layouts. Automatic breaker placement can make a small local move to share an actual corner rail and clear tip bases; manual positions are retained. Stock limits, board bearings, joist centres and pedestal separation are rechecked for every candidate.
- Sloping direct frames search alternative joist columns when a corner-alignment column crowds a trim pedestal. The bounded search keeps joint and breaker rails fixed, excludes actual base discs and checks the full cross-section support gaps against the selected centres. A perimeter vertex retains its pedestal-supported trim but need not force an additional vertical joist. Intersections differing by less than one micrometre are treated as numerical coincidence; physically separate nearby nodes remain separate.
- Full base discs, boundary clearances, actual primary/secondary spans, end/splice bearings, infill-end contact, joist centres, noggin end bearings, primary attachment and one head elevation are checked.
- If a complete arrangement cannot be found, the board design and an amber dashed diagnostic draft remain visible with the conflict marked. Draft members and bearing positions are separate from scheduled members: frame/pedestal quantities and the complete cost stay pending, installer exports remain blocked, and the 3D structural model does not use the draft. The bounded automatic search is not a proof that no supplier-designed alternative exists.
- Paired breaker stock joints share a common cutting line when the common stock envelope preserves each board's minimum piece count. Slightly different sloping-end lengths do not create almost coincident ladder supports. Any continuous breaker run that fits stock stays unbroken, including when its neighbouring board needs a joint.

The 6 × 3.2 m example with 80/35 mm framing and 3 kN/m² has 25 pedestals and one 90–130 mm adjustment range at 250 ±20 mm build-up with 25 mm boards. Counts and actual spans change with geometry, stock and product inputs.

**Passing these checks is not engineering approval.** The report covers recommended composite decking on the specified profiles. It does not establish arbitrary board compatibility, pedestal rated load, substrate bearing, permissible board/joist edge overhang, pedestal head adapters, bracing, connection/splice design, or skirting wind loads. The two supplier-confirmation checkboxes record user confirmation only. Pedestal base dimensions, product height ranges and stock defaults are editable examples. The frame setback requires an approved edge/perimeter support detail. Narrow, angled or concave sites may need separate zones and product-specific detailing.

## Code and verification

- `src/planner.ts`: products, report rules, board/perimeter layout, stock packing and quantities.
- `src/supportLayout.ts`: collision-aware support topology, row search, supported stock joints and independent geometry audit.
- `src/deckGeometry.ts`: validated polygon insets, full-width strip intersections, clipping and base clearances.
- `src/App.tsx` / `src/FlowPanels.tsx`: guided workflow, profiles, fit decisions, audit, finishes and exports.
- `src/workbookExport.ts`: styled Excel workbook with editable material rates, linked quote pricing and formatted schedule tabs.
- `src/csvExport.ts` / `src/CsvExportPanel.tsx` / `src/materialEstimate.ts`: export schemas, previews, spreadsheet-safe encoding and shared pricing.
- `src/OutlineEditor.tsx` / `src/BreakerDesigner.tsx`: draft editing tools.
- `src/DeckView.tsx`: plans, base footprints, stock-splice markers and projected 3D/skirting preview.
- `tests/*.test.ts`: 117 test groups covering report cases, optional straight ripping, concave infill area/coverage, disconnected cuts, whole-board size options, minimum necessary breaker stock joints, CSV schemas/escaping/pricing/stock reconciliation, styled Excel round-tripping/formula links, angled cuts, stock conservation, actual board bearings and hundreds of support scenarios (frame/load/run permutations, concave hourglass/L/U/C/comb outlines, 3–32 corner polygons, rotation, winding, tight necks, chamfers, base/stock changes and seeded irregular shapes).

No backend/account/cloud sync is configured. Google font requests are optional; local fallbacks work offline. The preview is an illustrative SVG projection, not a fabrication model or photorealistic render.


## Product terminology

Frame choices, member tooltips, material names and cut schedules use **Alu-Joist** (35 mm / 80 mm) and the supplied report's **K Series** designation. Bearer, joist, noggin and rim joist describe the member's role; they do not imply different product SKUs. Fascia is the outer vertical board previously labelled skirting. Internal project keys and saved profiles remain compatible.

Names and catalogue pedestal dimensions were checked on 25 October 2026 against [BetterDeck Alu-Joist](https://betterdeck.ie/alu-joist/) and [BetterDeck pedestal systems](https://betterdeck.ie/pedestal-systems/). The model menu contains VersiJack F1–F5 and SpiraPave T11/T12/T22/T33/T34/T44. Choosing a model applies its published height range and diameter and recalculates the design. These choices exclude extenders and do not assert head, adaptor, load capacity or site approval. Editing those dimensions returns the selection to a custom pedestal. Custom board, colour and pedestal names are user-owned and are not assigned an unverified manufacturer model.


## Default product pricing

`src/pricing.ts` contains EUR rates excluding VAT, checked 25 October 2026. These populate Materials, the quote preview, CSV and Excel without adding estimate badges. Each rate remains editable; zero and an explicitly cleared rate are preserved. A per-row reset restores the automatic rate. Default rates recalculate for stock length, board width, fascia height and pedestal model; manually overridden rates remain fixed.

Public BetterDeck selling prices were not available. Decking and fascia use comparable Irish capped-composite retail prices from TJ O'Mahony (€48.74 net per 4.88 m × 140 mm decking board; €65 net per 3.66 m × 184 mm fascia), scaled by purchased stock area. The 35 mm framing allowance uses Double L's €34.72 gross / 3 m 30 mm aluminium joist, net of 23% VAT; this is not the same Alu-Joist K Series product. The 80 mm allowance uses a 1.2 multiplier supported by Ceta's £30/£36 40/80 mm profile prices, without applying an exchange rate.

VersiJack F1/F2/F3/F4 use Budget Bestrating's €4.82/€5.55/€7.35/€13.56 gross single-unit prices, net of 21% Dutch VAT. SpiraPave T12/T22/T33 use its €3.10/€3.92/€4.57 gross prices, net of 21% VAT. T11 uses PlusJop's €3.63 retail benchmark. F5 (€15), T34 (€4.75), T44 (€5.75), custom height bands and extensions (€10 per extra 245 mm) are explicit internal allowances where exact live prices could not be established. Custom pedestals use a height-band benchmark, not a product compatibility claim. Clip positions use the €15.04 net / 25-pack Chadwicks starter/end fixing benchmark, rounded to €0.60 each. Quantities are fixing positions, not a pack-based clip order. Adaptors, connectors, extenders as scheduled products, delivery, VAT and labour are not added as separate purchase lines.

The collapsed Pricing notes section records source links and the rate basis. No source price is described as a confirmed BetterDeck selling price. Project JSON carries a current resolved-price snapshot plus manual overrides and the pricing version: importing the same version preserves automatic resizing, while importing into a different pricing version retains the saved rate snapshot. Existing project format version 1 remains accepted.

VAT conversion references: [Irish Revenue](https://www.revenue.ie/en/vat/vat-rates/search-vat-rates/current-VAT-rates.aspx) and [Government of the Netherlands](https://www.government.nl/themes/taxes-benefits-and-allowances/vat/vat-rates-and-exemptions).


## Installer measurements and PDF

The Supports canvas offers **Add measurements** and **Download plan PDF**. Measurement mode retains the fixed-height drawing region, adds true edge lengths, overall dimensions, representative pedestal centre chains, corner IDs and pedestal IDs, and supplies zoom/Fit controls with scrollable inspection. The measured view uses physical deck axes after either board-run selection. Pedestal and member IDs agree with the existing CSV exports.

The PDF is generated locally on demand using lazily loaded `pdf-lib`. It includes a vector A3 drawing (portrait for tall decks, landscape for wider decks), an explicit print scale and scale bar, a bounding-box datum (X right, Y down), reference/date, corner coordinates/reflex angles/edge lengths, every pedestal coordinate/base size/global height range, every frame member's endpoints/profile/length, specification and existing review notes. Coordinates are displayed to 0.1 mm. Height ranges reflect average ground variation; they are not per-base site survey results. Very short outline edges remain in the corner schedule. Dense overviews above 160 pedestals omit pedestal text callouts; the PDF coordinate schedule is complete and automatically paginated. Installer PDFs cannot be downloaded for unresolved support geometry. Height mismatches are explicitly identified, and site verification/supplier-design notes are retained.

QA scripts and rendered example pages are under `tmp/installer-plan-qa.ts` and `outputs/installer-plan-qa/`. Tests verify physical axes and CSV ID agreement, true sloping-edge lengths, concave angles, scale/footprint fidelity, A3 orientation/pagination, deterministic references and rejection of unresolved geometry. Vite pre-optimises the lazy Excel/PDF dependencies so initial export does not trigger a development page reload.
