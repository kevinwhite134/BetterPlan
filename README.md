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
4. **Finish** — colour, mouse/touch drag to rotate and tilt the 3D view (horizontal dragging uses the reversed direction), right-side picture cards exposing each successive layer, and fascia enabled by default. Keyboard arrows, camera buttons and Home/reset are also available. Fascia stacks full-width boards around the perimeter, using the decking board width by default. Automatic mode rounds up the height below the decking divided by the fascia board width; Manual lets you choose the row count. Quantities, cutting lists, pricing and the 3D model include every row. Average ground clearance flags any overlap with the ground; the planner never rips fascia down to fit.
5. **Review** — quantities, optional EUR rates, cutting schedules, support checks and notes. CSV exports separate purchase quantities, materials quotes, board/aluminium/skirting cuts, pedestal positions and project details into consistent tables.

The Boards step offers Board smaller / Board bigger size previews, including unresolved layouts. Rectangles snap to the neighbouring full-row dimensions; already-fitting rectangles add/remove one board width plus gap. Irregular outlines solve the perimeter inset to find neighbouring whole-row dimensions, scaling across the board run from the minimum coordinate. Stock length remains unchanged. Previews show the original/proposed outline and recalculate board/support checks; no change is applied until selected. Resizing never silently switches a frame or promises to resolve its restrictions.

Projects opens the project library, with deck preview cards, names, Recents and editable sections (Residential and Commercial by default). Project designs, prices and last workflow steps persist in IndexedDB in this browser; the existing current and previous deck are migrated once. Project JSON import/export is available on project cards and in Review. Imports create separate projects and preserve existing work. Product profiles remain shared between projects. Applied outlines save even when a board layout is unresolved; unapplied editor drafts do not survive reload.

## Perimeter and infill cuts

Every outside edge receives a board parallel to that edge, with mitred corner geometry. The infill region is inset by one full board width plus the installation gap. All cutting blanks use the entered stock width. Crosscuts, straight rips, angled rips and tapered edge pieces are allowed by default, including existing projects without a saved cut policy. The Boards step can disable straight ripping. Board smaller / Board bigger dimension previews remain available with either policy.

Angled ends may follow a connected chain of angled edges across a corner. Butt joints share two globally aligned staggered support lattices, with a bounded common phase search; short runs remain unbroken. Angled end regions may be split into tapered pieces within the selected stock length, including at breaker bays. These pieces remain clipped to the outline and use real frame bearings. A common butt-lattice phase is retried when the initial layout puts parallel bearing faces too close together.

With straight ripping enabled, outside infill rows are cut to equal finished widths, avoiding a thin sliver and filling the cross-run depth while retaining installation gaps. Disabling straight ripping places only whole-width rows with the remaining clearance centred and visible. Rectangular layouts still offer lower/higher exact dimensions that fit whole-width rows. Ripping also fits local internal steps and recesses, using clipped/notched pieces. Disconnected intersections remain separate pieces, so boards do not bridge cut-outs. If ripping is disabled, interrupted whole-width rows remain visibly unfilled and flagged. Finished cut widths appear in plan tooltips and cutting-schedule tooltips/CSV; local rip/notch flags and outline coordinates are included in the CSV; product stock width and installation gaps remain unchanged.

Offsets that collapse, cross or cannot fit a narrow region fail explicitly. Supported outlines are simple 3–32 vertex polygons, up to 30 m in each direction, without holes. Complex inset splits require separate build zones. Geometrically filled infill still requires the selected support arrangement to pass its separate bearing checks.

Balanced breakers use equal clear bays and the minimum necessary line count. When a direction, outline or stock-length change makes a saved manual count insufficient, the main planner switches to automatic breakers so the deck preview remains available. Draft breaker edits retain their chosen count until applied. Lowest waste keeps the stock-packing heuristic, allowing asymmetric/additional breakers. Custom placement supports dragging, exact positions, mirrored edits and corner snapping. Guides stay perpendicular to the board run and are clipped to the infill polygon. A no-butt infill layout never adds butt joints within an infill bay. Each continuous breaker section stays in one piece if stock reaches; otherwise it uses the minimum number of butt joints with the entered end gap. Required breaker stock joints receive ladder noggins and an independent check of actual end bearing, including the face width needed for both ends. Disconnected sections across a cut-out are assessed separately. Cross-breaker mosaics and arbitrary regional/free-angle breaker paths are not implemented.

Stock cutting uses best-fit decreasing with entered saw kerf. It is a heuristic, not a guaranteed global optimum. Length loss is purchased length minus cutting-blank length; it does not include rip-width offcuts, angled end-cut area or intentional installation gaps. Width offcuts are not reused: each piece is conservatively packed from a full-stock-width blank. Quantities contain no blanket spare percentage. Fixings are allowances, not a confirmed clip/screw/connection schedule.

## Downloads & files

Review contains all PDF/CSV downloads and project/product JSON import/export. **Download quotation PDF** combines the former customer pack and quotation into one branded document with customer details, a 3D picture, itemised prices, delivery/VAT and a dimensioned layout; span reports are excluded. **Download plan PDF** provides the measured plan, coloured 3D supports, guide and applicable engineer references. The Excel pack is temporarily removed from the interface and production bundle. Seven CSV reports offer an optional styled preview before downloading. Each file is one rectangular table with one header, so filters and sorting work without mixing unrelated sections:

- **Materials & pricing:** purchase quantities, stock dimensions, optional unit rates and line totals. The summary is either an entered-materials total or a known-priced subtotal; missing rates stay blank and zero prices remain valid.
- **Materials quote:** concise material quantities and prices, with an explicit incomplete status when prices or quantities are missing. It includes entered delivery and VAT where specified; labour, unlisted hardware and spare allowances remain excluded. It is a provisional quotation.
- **Deck board cutting list:** stock board / piece IDs, cut order, use, blank length, finished maximum width, square/rip/notch/angled classification, local cut-outline coordinates and deck location. Kerf is per additional cut and the final remainder appears once per stock board.
- **Alu-Joist cutting list:** profile stock allocation, member/piece IDs, member type and physical endpoints. Packed cuts map back to actual frame members.
- **Fascia cutting list:** separate fascia stock allocation, edge IDs, cut lengths, height, physical endpoints and clearance status.
- **Pedestal positions:** one row per actual base, physical deck coordinates, base dimensions, required/product height ranges and shared junction flags.
- **Project details & checks:** outline corners, product settings, coordinate conventions, span source/limits, individual geometry checks and individual review notes.

Dimensions use millimetres (area uses m²), pricing uses EUR. Physical coordinates use a normalised deck origin with X right and Y down, including after flipping the board direction. Cut outlines use local blank length/width from their minimum bounds. Final remainder follows the planner's inter-cut kerf convention; it is not a guarantee of reusable workshop offcut. Width offcuts are not reused.

The previous Excel exporter remains in source for later use, with its existing validation, but has no application download action.

CSV retains plain rectangular data for imports. Files use UTF-8 with a BOM, CRLF and quoted fields. Choose comma or semicolon for local spreadsheet settings. User-authored formula-like text is exported as literal text. Geometry exports are current-design snapshots. UI and CSV pricing share the same line-by-line cent rounding. When support geometry fails, required frame/pedestal items remain visible with pending quantities and no line total; frame/pedestal detail downloads are unavailable. Disabled skirting has no cutting-list download.

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

## Phone and tablet support editing

On phone screens up to 760 px wide, Supports shows the plan above the settings without a pinned scrolling panel. Edit supports keeps the drawing tools visible above the plan, so changing tools takes one tap; selection details and geometry checks remain in a scrollable area below. Wider screens retain the side-by-side settings and plan, with the editor tools in the sidebar. Tap twice to draw a member, drag a pedestal along its supporting frame, and use two fingers to pan or pinch to zoom. Zoom buttons and Fit deck are also available. Touch additions and removals happen on release so starting a pinch does not modify the draft. Edits are saved only when applied.


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

The Supports canvas offers **Add measurements**; the plan PDF is downloaded from **Review → Downloads & files**. Measurement mode retains the fixed-height drawing region, adds true edge lengths, overall dimensions and pedestal centre-to-centre dimension chains without component IDs, and supplies zoom/Fit controls with scrollable inspection. The measured view uses physical deck axes after either board-run selection. Pedestal and member IDs agree with the existing CSV exports.

The PDF is generated locally on demand using lazily loaded `pdf-lib`. It contains the measured A3 layout, a purple/green 3D support view, a personalised installation guide, a short specification/review page and the applicable supplier references. PDF drawings omit entry IDs and the PDF no longer contains long corner, pedestal, member, projection or connection schedules. CSV exports retain detailed IDs and coordinates.

The guide uses the actual support layout, frame build-up, load, pedestal range/survey coverage, board direction, perimeter boards, breakers, openings and fascia. Two-tier decks show the supplied 35 mm bearer / 35 mm joist or 80 mm bearer / 35 mm joist illustration as appropriate. Single-layer frames keep their own generated section and omit the two-tier illustrations. The full supplied report is bundled at `public/installer-reference/alu-joist-span-report.pdf`; export appends unchanged notes/summary and calculation pages for the selected K Series composite-deck frame and 3 or 5 kN/m² load. `src/installerReferences.ts` maps one-based PDF pages (one above printed Sheet No.). Browser exports load these local assets on demand; programmatic callers may supply their bytes through the `references` option.

References and illustrations describe the supplier's standard arrangement; they do not approve custom connections or ground conditions. Unresolved support geometry still blocks the installer export. The metric TimberTech manual remains explicitly product-specific. Generated pages are numbered; original report extracts retain their own sheet numbers.

QA scripts and rendered example pages are under `tmp/installer-plan-qa.ts` and `outputs/installer-plan-qa/`. Tests verify physical axes and CSV ID agreement, true sloping-edge lengths, concave angles, scale/footprint fidelity, A3 orientation/pagination, deterministic references and rejection of unresolved geometry. Vite pre-optimises the lazy Excel/PDF dependencies so initial export does not trigger a development page reload.

## October 2026 branding, connectors and precision editor

Installer PDFs and the new **Quotation PDF** download use the supplied BetterDeck logo, including its italic Deck wordmark and registered mark. The quote includes every material line with current editable rates and pending quantities. The Excel heading uses a matching serif/italic registered wordmark.

Joist centres accept 100–1,500 mm in settings, saved board products and project imports. The source report still specifies 400 mm for decking; larger selected values retain an explicit board-supplier span note. Defaults and automatic choices remain at the entered spacing.

Aluminium connectors are derived from actual same-tier member ends: one continuous joiner (€1.68) plus two side joist joiners (€1.20 each) at every collinear butt joint, including bearer joints, and one perpendicular joist joiner (€1.20) at each ladder/end attachment. Split receiving rails do not duplicate a perpendicular connector. Stacked tier crossings are excluded. Quantities stay pending with unresolved supports. These user-supplied rates participate in quotes, CSV, Excel and automatic cost selection. The 3D view shows a 2 mm black butt seam with side plates, and a black perpendicular connection marker without shortening the perpendicular member. Rendering does not alter support coordinates or cutting lengths. Pedestal adjusting columns are 110 mm in diameter, capped to fit unusually small entered base/head diameters. Finish offers labels for one example of each component visible in the selected layer.

The Boards preview remains pinned while settings scroll on desktop and mobile. The support editor has adaptive millimetre rulers and grid, a scale bar calibrated through the SVG aspect-ratio transform, live cursor coordinates, a two-point Measure tool, whole-member and endpoint dragging, exact member lengths, duplication and arrow-key nudging. Shift constrains dragging to an axis or multiplies keyboard nudges by ten. V selects, H pans, M measures, F fits the deck, Ctrl/Cmd+D duplicates, Ctrl/Cmd+Z undoes and Shift+Ctrl/Cmd+Z redoes. Draft geometry is checked in the worker before application, and all changes remain in the draft until applied.

## Interactive 3D, group edits, surveys and customer packs

Finish now supports wheel/pinch zoom, Shift-drag or two-finger pan, click-to-inspect components and Focus selected (up to 24× zoom). The exploded-view slider separates the actual tiers for explanation without changing geometry, quantities or exports. Boards, members, pedestals, fascia and all three connector types can be inspected in the model or through the accessible category/number controls. The inspector reports physical dimensions, installed category counts, purchase quantity, unit rate and quotation line total. Show in quotation opens Review and highlights the corresponding material row.

The support editor adds Shift-click selection, box selection, Select all visible, group dragging, duplication/removal, centre alignment, equal distribution and exact centre spacing along either site axis. Each group edit is one undo step and uses the same worker geometry checks as single-part edits. Alignment uses the first selected centre; distribution keeps the outer centres fixed.

Supports includes a paginated ground-survey table. Enter millimetres relative to the site's ground datum; positive readings raise the ground and reduce required pedestal adjustment. The finished deck datum remains at the entered build-up height. Readings attach to physical coordinates, not list indices. Moved/removed supports do not transfer their readings to another support; unmatched readings remain stored and are reported. Unsurveyed positions retain the global average/variation estimate. Actual ranges feed product checks, automatic selection, 3D pedestal heights, the pedestal CSV and installer PDF schedules. Product ranges must still cover the required adjustments.

Review saves customer name/address, site address, project reference and notes in the project. **Download quotation PDF** combines a branded cover with those details and a fixed-camera 3D image, the complete itemised materials quotation and a dimensioned board-layout illustration. The installer plan is a separate download in the same Review section. The layout illustration is not a fixed-scale installation drawing; labelled dimensions and site verification apply. PDF pagination, linked quantities and missing-price/pending-quantity handling remain intact.

### Lighter visualiser and individual explosion

The 3D renderer now batches structural and connector faces by style in small projects as well as large ones. Camera and separation updates coalesce to one update per display frame. Part inspection, zoom and the fixed-camera layer thumbnails remain available; quantities and physical geometry are unchanged. In the standard browser example, the complete visualiser plus thumbnails falls from 11,878 SVG face elements to about 200. This is a rendering-element count, not a measured frame-rate multiplier.

Exploded view now spreads individual boards, member stock sections, fascia pieces and joiners horizontally as well as separating tiers vertically. Pedestal bases, adjusting columns and heads also separate. Travel scales with the deck dimensions and the separation slider; zero returns to the assembled model. The camera fits the visible exploded bounds. Component labels use spaced numbered markers and a wrapping text key below the view, with no long crossing leader lines. Picking and focus use the same individual display offsets.


## November 2026 punch-list updates

New decks use 3 m aluminium stock; saved/imported projects and saved products retain their entered stock. Report span limits and the existing shared decking/breaker stock policy are unchanged. R Series paving is not supported.

Review includes an optional customer Eircode, net delivery charge (default zero) and an entered VAT percentage (blank until specified; zero is valid). The percentage applies to the rounded materials subtotal plus net delivery. Review, PDF quotations, quotation CSV and the Excel Quote sheet share cent rounding. Incomplete quantities/prices retain a known net subtotal and withhold a complete VAT/gross quotation total. Excel delivery and VAT cells are editable and its formulas recalculate when the Materials rates change; Materials remains a net material take-off.

Both quotation PDFs and customer packs include customer details, overall deck dimensions and area. Quotations do not load or append engineer span reports, including when installer drawings are added to a customer pack. Standalone plan PDF downloads retain their matching supplier illustrations and span-report pages. The installer exporter supports `includeReferences: false` for composing drawings without report attachments.

Review → Downloads & files offers **Download plan PDF**, which includes a fitted assembled 3D support illustration directly after the measured drawing, with decking removed to show actual joists, bearers and pedestals. Flat technical plans use purple bearers and green joists/rim/blocking. The interactive 3D visualiser and thumbnails retain the original silver aluminium finish, while the plan PDF uses purple bearers and green joists in both the flat drawing and its 3D support page; original supplier documents retain their own colours. Unresolved geometry blocks support/installer exports.

Supports measurement mode and the installer PDF put pedestal centre-to-centre dimensions directly on the drawing. Identical intervals along parallel primary members are labelled once to keep the plan readable; local variations receive separate labels. The drawing omits component IDs, and the PDF no longer adds coordinate-table pages. Exact support coordinates and reference IDs remain available in CSV exports. Separate members across openings are not bridged.


## Project library and consolidated files

The library stores each project independently: outline/openings, product snapshots, survey, quotation details, rate overrides, name, section, creation/edit/open dates and last editor step. Recents shows the twelve most recently opened projects; All projects and sections sort by last edit. Search matches project names, customer names and references. Each card has a deterministic isometric deck preview derived from its outline, openings, finish and board direction without solving its support layout.

The library is local to the current browser/origin, with no account or cloud sync. IndexedDB writes are atomic and ordered. Storage/load failures stay visible and project JSON exports remain available; the app never labels failed writes as saved. Legacy single-project localStorage is retained as a compatibility fallback; catalogues continue using their existing storage. Applied edits save automatically, and project switches retain the last valid design. Draft geometry must be applied or reverted before leaving the editor.

Version-1 JSON exports add optional project name/section metadata and retain product profiles, resolved price snapshots and manual overrides. Existing version-1 files remain accepted. Import creates a new project, merges catalogues without overwriting conflicting saved products, and restores or creates its named section. Project files travel through the library or Review; product catalogue import/export lives in Review, linked from Products.
