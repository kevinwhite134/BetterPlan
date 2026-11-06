# BetterPlan — Deck Planning & Quotation Software

**An internal web application developed for BetterDeck to automate structural decking layouts, material estimation and customer quotations.**

BetterPlan turns a deck outline into an editable board and support layout, a material take-off and priced customer documents. It brings geometry, product constraints, stock cutting and quotation generation into one workflow.

In internal company use, it reduced a previously **6–12-hour planning and quotation workflow to minutes**.

## Project ownership

I spearheaded the design, development and launch of BetterPlan, translating a manual business workflow into software used within BetterDeck. The work covered the React interface, deterministic layout algorithms, AI image-analysis integration, project persistence and document generation.

## What it does

- **Photo or drawing to editable outline:** take, upload or paste an image; AI image analysis returns corner coordinates that are validated and applied automatically.
- **Interactive design:** edit corners, dimensions, openings, board direction and breaker positions, with draft editing and undo/redo tools.
- **Structural layout calculations:** generate frame and pedestal arrangements using product dimensions and engineering span-report limits, with independent geometry checks.
- **Material-waste reduction:** compare board-layout candidates and allocate cuts to stock lengths, accounting for saw kerf and reuse of remaining stock length.
- **2D and 3D visualisation:** inspect dimensioned plans, component layers and exploded views on desktop, tablet or phone. Technical plans retain their light drawing surface in dark mode.
- **Quotations and installation outputs:** generate itemised quotation PDFs, dimensioned installer plans and CSV material, cutting and pedestal reports.
- **Project and product management:** save separate projects, organise them by section, maintain reusable product profiles and import/export backups. Project deletion requires confirmation.

## User workflow

1. **Shape:** create an outline manually or analyse an image, check its measurements and add openings.
2. **Boards:** choose products, direction, perimeter treatment and breaker placement.
3. **Supports:** enter site height and load requirements, compare frame options and inspect the support layout.
4. **Finish:** review the assembled or exploded 3D model and fascia details.
5. **Review:** check quantities, edit rates, enter customer details, delivery and VAT, then download documents.

Applied changes save automatically. Unapplied drawing edits remain drafts until applied or reverted.

## Technical highlights

### Deterministic geometry and layout algorithms

The planner clips board runs to the deck outline and openings, accounts for perimeter boards and installation gaps, and evaluates breaker arrangements against stock-length constraints. Stock allocation uses a **best-fit-decreasing heuristic** to fit cutting blanks into purchased lengths while allowing for saw kerf.

Support generation uses span limits transcribed from engineering reports alongside actual member dimensions, pedestal footprints, height ranges and bearing requirements. A separate geometry audit checks the generated arrangement. Unresolved support layouts remain visibly flagged, with affected quantities pending and installer exports blocked.

The optimisation aims to reduce material waste; it does not claim a mathematically optimal solution. Length offcuts can be reused within stock allocation; width offcuts are not reused.

### AI image analysis via API

The image-analysis service interprets a photo or drawing and returns structured outline data. The backend checks the geometry and derives a uniform scale from recognised dimension references where available; otherwise, the result is labelled estimated. The frontend validates the returned coordinates before applying them through the same checks used for manual input.

AI assists with outline capture. Board layouts, support calculations, quantities and prices are calculated by application code. Users check the generated outline and dimensions against site measurements.

The API key stays on the server. Upload validation, payload limits, timeouts and error handling protect the analysis flow. Automated API tests use mocked responses rather than paid live requests.

### Responsive calculations and consistent outputs

Larger planning jobs run in Web Workers so the interface remains usable during calculation. Results are matched to the current inputs before display. The 3D renderer batches component faces, and PDF generation loads on demand.

The drawing, material estimates and exported documents share the same project data and pricing calculations, including line-level currency rounding and incomplete-quotation handling.

## Technology

| Area | Implementation |
| --- | --- |
| Frontend | React, TypeScript and Vite |
| Drawing and interaction | SVG, Konva and React Konva |
| Geometry and planning | TypeScript algorithms and polygon clipping |
| Background computation | Web Workers |
| Image-analysis backend | Node.js, native fetch and an external AI API |
| Local persistence | IndexedDB for projects; localStorage for shared catalogue/settings data |
| Documents and reports | pdf-lib and CSV generation |
| Verification | Node.js test runner, TypeScript checks and Oxlint |
| Hosting | Vercel frontend plus API function, or a standalone Node.js server |

## Explore the code

| Area | Starting points |
| --- | --- |
| Board layout and stock packing | [planner.ts](src/planner.ts), [deckGeometry.ts](src/deckGeometry.ts) |
| Support generation and validation | [supportLayout.ts](src/supportLayout.ts), [boardSupportLayout.ts](src/boardSupportLayout.ts) |
| Image-analysis request and validation | [PhotoCoordinates.tsx](src/PhotoCoordinates.tsx), [photoCoordinates.ts](server/photoCoordinates.ts), [photoTrace.ts](server/photoTrace.ts) |
| Background planning | [useDeckPlanning.ts](src/useDeckPlanning.ts), [planning.worker.ts](src/planning.worker.ts) |
| Project persistence | [projectLibrary.ts](src/projectLibrary.ts), [projectStorage.ts](src/projectStorage.ts) |
| Pricing and exports | [materialEstimate.ts](src/materialEstimate.ts), [quotationEstimate.ts](src/quotationEstimate.ts), [installerPdf.ts](src/installerPdf.ts), [csvExport.ts](src/csvExport.ts) |

## Run locally

Use **Node.js 22.12 or later** and npm.

```sh
npm ci
npm run dev
```

Open the local URL printed by Vite. Manual drawing, planning and quotations can be explored without an AI API key.

To enable image analysis, create a local `.env` file using [`.env.example`](.env.example) and set `OPENAI_API_KEY`. The optional model setting is documented in that file. Restart the development server after changing these values. Keep the key server-side; never give it a `VITE_` prefix or commit it.

Both development and preview serve `/api/photo-to-coordinates` from the same origin as the interface.

## Verification

```sh
npm test
npm run build
npm run lint
```

The test suite covers geometry and report-rule cases, stock conservation, board bearings, support-layout scenarios, project persistence, image-analysis validation, pricing reconciliation and generated exports. Image-analysis tests mock the external service; they verify the integration and validation logic rather than live image-recognition accuracy.

## Deployment

The repository includes [Vercel configuration](vercel.json) for the Vite frontend and [photo-analysis API function](api/photo-to-coordinates.ts). Configure the server-side API key in the deployment environment. Deploy the full application so the API is available alongside the built frontend.

For a standalone Node.js deployment:

```sh
npm run build
npm start
```

The server defaults to `127.0.0.1:3000`; `HOST` and `PORT` are configurable. Camera and clipboard access depend on browser support and permissions; use HTTPS for hosted access.

## Current scope

Projects are stored locally in the current browser. Staff accounts, shared company storage and cross-device synchronisation are future extensions, rather than current features. Default material rates are editable reference values, not confirmed BetterDeck selling prices.

The software supports planning and quotation preparation. Geometry checks and report-based span limits do not replace site verification, supplier connection details or engineering approval.

Detailed report tables, pricing assumptions, export conventions and earlier implementation decisions are preserved in the [implementation notes](docs/implementation-notes.md).
