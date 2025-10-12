# Implementation Tasks: Migrate Frontend from DaisyUI/Tailwind to Bulma + htmx

## Overview

This migration replaces the current DaisyUI/Tailwind CSS stack with Bulma and adds htmx for dynamic interactions. The approach is a complete replacement (not incremental) to eliminate all old framework references and establish a clean htmx-first foundation.

**Key Goals:**

- Remove 207 occurrences of DaisyUI classes across 11 template files
- Replace with Bulma's semantic class names
- Add htmx for form submission, pagination, and live search
- Maintain dark theme appearance
- Keep all existing tests passing

**Implementation Strategy:** 6 phases building from dependencies → static styling → dynamic interactions

---

## Phase 1: Dependencies & Build Pipeline

**Goal**: Replace CSS framework dependencies and get the build working
**Demo**: "At standup, I can show: CSS builds with Bulma instead of Tailwind, and htmx is available in node_modules"

### Tasks

- [ ] Task 1.1: Remove old dependencies and install new ones
  - **Output**: package.json updated with Bulma/htmx
  - **Files**: `package.json`, `package-lock.json`
  - **Command**:
    ```bash
    npm uninstall daisyui tailwindcss
    npm install bulma htmx.org sass postcss-sass
    ```
  - **Remove**: Lines with `daisyui` and `tailwindcss` from package.json
  - **Verify**: Check package.json has `bulma`, `htmx.org`, `sass`, `postcss-sass`

- [ ] Task 1.2: Delete Tailwind configuration file
  - **Output**: Tailwind config removed
  - **Files**: `tailwind.config.js` (DELETE)
  - **Command**: `rm tailwind.config.js`
  - **Verify**: File no longer exists

- [ ] Task 1.3: Update PostCSS configuration for Sass
  - **Output**: PostCSS configured to compile Bulma Sass
  - **Files**: `postcss.config.js`
  - **Change**:
    ```javascript
    export default {
      plugins: {
        'postcss-sass': {},
        autoprefixer: {},
      },
    };
    ```
  - **Remove**: Any `tailwindcss: {}` plugin reference
  - **Verify**: File has postcss-sass plugin listed

- [ ] Task 1.4: Replace main.css with Bulma import
  - **Output**: CSS entry point imports Bulma
  - **Files**: `src/styles/main.css`
  - **Change**: Replace entire contents with:

    ```css
    /* Import Bulma with default colors */
    @import 'bulma/bulma';

    /* Custom overrides go here if needed */
    ```

  - **Remove**: All `@tailwind` directives (lines 1-3)
  - **Verify**: File only has @import statement for Bulma

- [ ] Task 1.5: Copy htmx to public directory
  - **Output**: htmx.min.js available to serve
  - **Files**: `public/js/htmx.min.js` (NEW)
  - **Command**: `cp node_modules/htmx.org/dist/htmx.min.js public/js/`
  - **Alternative**: Configure Express static middleware to serve from node_modules
  - **Verify**: File exists at public/js/htmx.min.js or is served via middleware

### Phase 1 Checkpoint

- [ ] Build CSS: `npm run build:css`
- [ ] Check output: Verify `public/css/main.css` contains Bulma styles (not Tailwind)
- [ ] Run linter: `npm run lint`
- [ ] Run build: `npm run build`
- [ ] **Demo ready**: Show package.json changes and compiled CSS file with Bulma classes

---

## Phase 2: Base Layout & Core Templates

**Goal**: Convert base layout and shared partials to Bulma, add htmx script
**Demo**: "At standup, I can show: All pages render with Bulma styling and htmx is loaded (check browser console)"

### Tasks

- [ ] Task 2.1: Update base layout template
  - **Output**: Base layout uses Bulma classes and includes htmx
  - **Files**: `views/layouts/base.ejs`
  - **Changes**:
    - Remove `data-theme="dark"` attribute from `<html>` tag
    - Add `hx-boost="true"` to `<body>` tag
    - Replace `class="container mx-auto px-4 py-8"` with `class="container section"`
    - Add `<script src="/js/htmx.min.js"></script>` before closing `</body>`
  - **Remove**: All Tailwind utility classes from container
  - **Verify**: View page source, see htmx script tag and Bulma class names

- [ ] Task 2.2: Convert header partial
  - **Output**: Header uses Bulma navbar component
  - **Files**: `views/partials/header.ejs`
  - **Changes**: Replace DaisyUI classes with Bulma navbar classes
    - Use `navbar` instead of custom header classes
    - Apply `navbar-brand`, `navbar-menu`, `navbar-item` as needed
  - **Remove**: All `menu`, `btn`, etc. DaisyUI classes
  - **Verify**: Header displays correctly with Bulma styling

- [ ] Task 2.3: Convert navigation partial
  - **Output**: Navigation uses Bulma navbar or tabs
  - **Files**: `views/partials/nav.ejs`
  - **Changes**:
    - Replace `class="menu menu-horizontal px-1"` with `class="navbar-menu"` or `class="tabs"`
    - Update list items to use `navbar-item` or `tab` classes
    - Keep active state logic, apply Bulma's `is-active` class
  - **Remove**: All `menu`, `menu-horizontal` classes
  - **Verify**: Navigation displays correctly and active states work

- [ ] Task 2.4: Convert footer partial
  - **Output**: Footer uses Bulma footer component
  - **Files**: `views/partials/footer.ejs`
  - **Changes**: Replace DaisyUI classes with `class="footer"`
  - **Remove**: Old footer utility classes
  - **Verify**: Footer displays correctly

- [ ] Task 2.5: Convert tenant selector partial (if exists)
  - **Output**: Tenant selector uses Bulma select component
  - **Files**: `views/partials/tenant-selector.ejs`
  - **Changes**: Wrap `<select>` in `<div class="select">` structure
  - **Remove**: DaisyUI select classes
  - **Verify**: Selector displays correctly

### Phase 2 Checkpoint

- [ ] Start dev server: `npm run dev`
- [ ] Visit http://localhost:PORT in browser
- [ ] Manual verification:
  - [ ] Pages render without styling errors
  - [ ] Header, nav, footer display correctly
  - [ ] Browser console shows htmx loaded (check Network tab)
  - [ ] Dark theme colors are present
- [ ] Run tests: `npm test`
- [ ] **Demo ready**: Navigate to any page and show Bulma-styled layout with htmx loaded

---

## Phase 3: Component Demo Page (Pattern Library)

**Goal**: Convert components-demo.ejs to establish Bulma patterns for all other pages
**Demo**: "At standup, I can show: Complete component showcase using Bulma classes"

### Tasks

- [ ] Task 3.1: Convert alert components
  - **Output**: Alerts use Bulma notification component
  - **Files**: `views/pages/components-demo.ejs` (lines ~24-50)
  - **Changes**: Replace `alert alert-*` with `notification is-*`
    - `alert-info` → `notification is-info`
    - `alert-success` → `notification is-success`
    - `alert-warning` → `notification is-warning`
    - `alert-error` → `notification is-danger`
  - **Remove**: All `alert` class references
  - **Verify**: Visit /components-demo, see styled notifications

- [ ] Task 3.2: Convert button components
  - **Output**: Buttons use Bulma button classes
  - **Files**: `views/pages/components-demo.ejs` (lines ~54-74)
  - **Changes**: Replace `btn btn-*` with `button is-*`
    - `btn-primary` → `is-primary`
    - `btn-secondary` → `is-secondary` (or `is-link`)
    - `btn-outline` → `is-outlined`
    - `btn-sm` → `is-small`
    - `btn-lg` → `is-large`
  - **Remove**: All `btn` class references
  - **Verify**: Buttons display with correct styling and sizes

- [ ] Task 3.3: Convert card components
  - **Output**: Cards use Bulma box component
  - **Files**: `views/pages/components-demo.ejs` (lines ~77-117)
  - **Changes**: Replace `card` structure with `box`
    - `card` → `box`
    - `card-body` → just content inside box
    - `card-title` → `title is-5` or `subtitle`
    - `card-actions` → `buttons` wrapper if multiple buttons
  - **Remove**: All `card`, `card-body`, `card-title`, `card-actions` classes
  - **Verify**: Cards display as Bulma boxes

- [ ] Task 3.4: Convert stats components (custom layout)
  - **Output**: Stats use Bulma columns with boxes
  - **Files**: `views/pages/components-demo.ejs` (lines ~120-161)
  - **Changes**: Replace `stats` with `columns` and individual `column` + `box`
    - `stats` → `columns`
    - `stat` → `column` with nested `box`
    - Style stat content with Bulma typography classes
  - **Remove**: All `stats`, `stat`, `stat-*` classes
  - **Verify**: Stats display in column layout

- [ ] Task 3.5: Convert form components
  - **Output**: Forms use Bulma field/control structure
  - **Files**: `views/pages/components-demo.ejs` (lines ~163-235)
  - **Changes**:
    - `form-control` → `field`
    - Wrap inputs in `<div class="control">`
    - `input input-bordered` → just `input` (borders default)
    - `select select-bordered` → `<div class="select"><select>` structure
    - `textarea textarea-bordered` → just `textarea`
    - `checkbox` → `<label class="checkbox"><input type="checkbox"></label>`
    - `toggle` → Install bulma-switch or use checkbox for now
    - `radio` → `<label class="radio"><input type="radio"></label>`
  - **Remove**: All `form-control`, `input-bordered`, `select-bordered` classes
  - **Verify**: Form elements display correctly

- [ ] Task 3.6: Convert modal component
  - **Output**: Modal uses Bulma modal component
  - **Files**: `views/pages/components-demo.ejs` (lines ~237-257)
  - **Changes**: Restructure to Bulma modal format:
    ```html
    <div class="modal">
      <div class="modal-background"></div>
      <div class="modal-card">
        <header class="modal-card-head">
          <p class="modal-card-title">Title</p>
          <button class="delete" aria-label="close"></button>
        </header>
        <section class="modal-card-body">Content</section>
        <footer class="modal-card-foot">
          <button class="button">Close</button>
        </footer>
      </div>
    </div>
    ```
  - **Remove**: DaisyUI modal classes
  - **Verify**: Modal opens and closes correctly

- [ ] Task 3.7: Convert table component
  - **Output**: Table uses Bulma table classes
  - **Files**: `views/pages/components-demo.ejs` (lines ~259-294)
  - **Changes**: Add `class="table is-fullwidth is-striped"` to `<table>`
  - **Remove**: Default `table` class if it's DaisyUI-specific
  - **Verify**: Table displays with stripes and full width

- [ ] Task 3.8: Convert badge components
  - **Output**: Badges use Bulma tag component
  - **Files**: `views/pages/components-demo.ejs` (lines ~296-316)
  - **Changes**: Replace `badge badge-*` with `tag is-*`
    - `badge-primary` → `tag is-primary`
    - `badge-outline` → `tag is-light`
  - **Remove**: All `badge` class references
  - **Verify**: Tags display correctly

- [ ] Task 3.9: Convert loading components
  - **Output**: Loading states use Bulma loading button or custom spinner
  - **Files**: `views/pages/components-demo.ejs` (lines ~318-333)
  - **Changes**:
    - Replace `loading loading-spinner` with `button is-loading` (for button context)
    - Or create custom spinner with CSS if needed
  - **Remove**: All `loading` class references
  - **Verify**: Loading indicators display

### Phase 3 Checkpoint

- [ ] Visit http://localhost:PORT/components-demo
- [ ] Manual verification:
  - [ ] All component sections display correctly
  - [ ] Buttons, cards, forms, tables look styled
  - [ ] Modal opens/closes
  - [ ] No console errors
- [ ] Take screenshot for reference
- [ ] Run tests: `npm test`
- [ ] **Demo ready**: Show complete component demo page as pattern library

---

## Phase 4: Simple Pages

**Goal**: Convert error and dashboard pages using patterns from component demo
**Demo**: "At standup, I can show: Error and dashboard pages fully styled with Bulma"

### Tasks

- [ ] Task 4.1: Convert error page
  - **Output**: Error page uses Bulma classes
  - **Files**: `views/pages/error.ejs`
  - **Changes**: Apply Bulma classes based on component demo patterns
    - Use `notification is-danger` for error display
    - Use `title` and `subtitle` classes for headings
  - **Remove**: All DaisyUI/Tailwind utility classes
  - **Verify**: Trigger an error, see styled error page

- [ ] Task 4.2: Convert dashboard page
  - **Output**: Dashboard uses Bulma classes
  - **Files**: `views/pages/dashboard.ejs`
  - **Changes**: Apply Bulma classes
    - Use `box` for card-like sections
    - Use `columns` for layout if needed
    - Apply button classes for any actions
  - **Remove**: All DaisyUI/Tailwind classes
  - **Verify**: Visit /dashboard, see styled page

### Phase 4 Checkpoint

- [ ] Visit /dashboard and intentionally trigger an error
- [ ] Verify both pages display correctly
- [ ] Run tests: `npm test`
- [ ] **Demo ready**: Navigate between dashboard and error states

---

## Phase 5: Albums Pages & Forms

**Goal**: Convert album-related pages and prepare for htmx integration
**Demo**: "At standup, I can show: Album list, detail, and form pages styled with Bulma"

### Tasks

- [ ] Task 5.1: Convert albums list page
  - **Output**: Albums list uses Bulma classes
  - **Files**: `views/pages/albums/list.ejs`
  - **Changes**:
    - Use `box` for each album item
    - Use `button` classes for action buttons
    - Prepare structure for htmx pagination (add `id="album-list"` container)
  - **Remove**: All DaisyUI/Tailwind classes
  - **Verify**: Visit /albums, see styled list

- [ ] Task 5.2: Convert album detail page
  - **Output**: Album detail uses Bulma classes
  - **Files**: `views/pages/albums/detail.ejs`
  - **Changes**: Apply Bulma box, title, button classes
  - **Remove**: All DaisyUI/Tailwind classes
  - **Verify**: Click on an album, see styled detail page

- [ ] Task 5.3: Convert album form page
  - **Output**: Album form uses Bulma field/control structure
  - **Files**: `views/pages/albums/form.ejs`
  - **Changes**:
    - Apply `field` and `control` wrappers from component demo
    - Use `button is-primary` for submit
    - Prepare structure for htmx (wrap in container with id for targeting)
  - **Remove**: All DaisyUI/Tailwind form classes
  - **Verify**: Visit /albums/new, see styled form

- [ ] Task 5.4: Convert photo form page
  - **Output**: Photo form uses Bulma classes
  - **Files**: `views/pages/photos/form.ejs`
  - **Changes**: Same as album form
  - **Remove**: All DaisyUI/Tailwind classes
  - **Verify**: Photo form displays correctly

### Phase 5 Checkpoint

- [ ] Visit /albums, /albums/:id, /albums/new, /photos/new
- [ ] Verify all pages display correctly
- [ ] Submit a form (ensure it still works)
- [ ] Run tests: `npm run test`
- [ ] **Demo ready**: Navigate through all album/photo pages

---

## Phase 6: htmx Middleware & Helper Functions

**Goal**: Add server-side support for detecting htmx requests and rendering fragments
**Demo**: "At standup, I can show: Middleware detects htmx headers and tests pass"

### Tasks

- [ ] Task 6.1: Create htmx middleware file
  - **Output**: New middleware module for htmx helpers
  - **Files**: `src/lib/http/middleware/htmx.ts` (NEW)
  - **Code**:

    ```typescript
    import { Request, Response } from 'express';

    export function isHtmxRequest(req: Request): boolean {
      return req.headers['hx-request'] === 'true';
    }

    export function htmxRedirect(res: Response, url: string): void {
      res.setHeader('HX-Redirect', url);
    }

    export function htmxTrigger(res: Response, eventName: string): void {
      res.setHeader('HX-Trigger', eventName);
    }
    ```

  - **Verify**: File exists and exports functions

- [ ] Task 6.2: Write unit tests for htmx helpers
  - **Output**: Tests for htmx middleware functions
  - **Files**: `src/lib/http/middleware/htmx.test.ts` (NEW)
  - **Tests**:
    - Test `isHtmxRequest()` returns true when `hx-request` header is 'true'
    - Test `isHtmxRequest()` returns false when header is missing
    - Test `htmxRedirect()` sets `HX-Redirect` header
    - Test `htmxTrigger()` sets `HX-Trigger` header
  - **Verify**: Run `npm test`, new tests pass

- [ ] Task 6.3: Update albums controller to support htmx
  - **Output**: Albums controller conditionally renders fragments
  - **Files**: `src/controllers/albums.ts`
  - **Changes**:
    - Import `isHtmxRequest` helper
    - In list action: Check if htmx request, render partial instead of full page (prepare for Phase 7)
    - In create action: Check if htmx request, render success/error partial instead of redirect
  - **Pattern**:
    ```typescript
    if (isHtmxRequest(req)) {
      return res.render('partials/album-list-item', { album });
    }
    res.render('pages/albums/list', { albums });
    ```
  - **Verify**: Controller compiles without errors

- [ ] Task 6.4: Write integration tests for htmx controller behavior
  - **Output**: Integration tests verify htmx vs standard request handling
  - **Files**: Update existing controller tests (e.g., `src/controllers/albums.integration.test.ts`)
  - **Tests**:
    - Test: Album creation with `HX-Request` header returns 200 with HTML fragment
    - Test: Album creation without header returns 302 redirect
    - Test: Album list with `HX-Request` header returns fragment
  - **Verify**: Run `npm run test:integration`, tests pass

### Phase 6 Checkpoint

- [ ] Run unit tests: `npm run test:unit`
- [ ] Run integration tests: `npm run test:integration`
- [ ] Run lint: `npm run lint`
- [ ] Run build: `npm run build`
- [ ] **Demo ready**: Show middleware code and passing tests

---

## Phase 7: htmx Template Fragments

**Goal**: Create reusable EJS partials for htmx responses
**Demo**: "At standup, I can show: Partial templates exist and render correctly in isolation"

### Tasks

- [ ] Task 7.1: Create success notification partial
  - **Output**: Reusable success alert fragment
  - **Files**: `views/partials/alert-success.ejs` (NEW)
  - **Code**:
    ```html
    <div class="notification is-success">
      <button class="delete"></button>
      <%= message %>
    </div>
    ```
  - **Verify**: Render in a test route to confirm it works

- [ ] Task 7.2: Create error notification partial
  - **Output**: Reusable error alert fragment
  - **Files**: `views/partials/alert-error.ejs` (NEW)
  - **Code**:
    ```html
    <div class="notification is-danger">
      <button class="delete"></button>
      <%= message %>
    </div>
    ```
  - **Verify**: Render in a test route

- [ ] Task 7.3: Create album list item partial
  - **Output**: Single album item for dynamic loading
  - **Files**: `views/partials/album-list-item.ejs` (NEW)
  - **Code**: Extract single album item HTML from albums/list.ejs
  - **Verify**: Render with sample album data

- [ ] Task 7.4: Create form errors partial
  - **Output**: Validation error display fragment
  - **Files**: `views/partials/form-errors.ejs` (NEW)
  - **Code**:
    ```html
    <% if (errors && errors.length > 0) { %>
    <div class="notification is-danger">
      <ul>
        <% errors.forEach(error => { %>
        <li><%= error %></li>
        <% }) %>
      </ul>
    </div>
    <% } %>
    ```
  - **Verify**: Render with sample errors array

- [ ] Task 7.5: Create loading spinner partial (optional)
  - **Output**: Loading indicator fragment
  - **Files**: `views/partials/loading-spinner.ejs` (NEW)
  - **Code**:
    ```html
    <div class="button is-loading is-primary">Loading...</div>
    ```
  - **Verify**: Render to see loading state

### Phase 7 Checkpoint

- [ ] Verify all partial files exist in views/partials/
- [ ] Create temporary test route to render each partial
- [ ] Check browser to see styled partials
- [ ] Remove test route
- [ ] **Demo ready**: Show partial templates in editor and rendered output

---

## Phase 8: htmx Dynamic Interactions

**Goal**: Implement 3 htmx patterns: form submission, pagination, live search
**Demo**: "At standup, I can show: Form submits without page reload, load more works, search filters results"

### Tasks

- [ ] Task 8.1: Add htmx to album form submission
  - **Output**: Album form submits via AJAX
  - **Files**: `views/pages/albums/form.ejs`
  - **Changes**: Add htmx attributes to form:
    ```html
    <form hx-post="/albums" hx-target="#form-container" hx-swap="outerHTML"></form>
    ```
  - **Files**: `src/controllers/albums.ts` - Update create action to render alert-success or alert-error partial for htmx requests
  - **Verify**: Submit form, see inline success/error message without page reload

- [ ] Task 8.2: Add htmx pagination to albums list
  - **Output**: "Load More" button appends albums dynamically
  - **Files**: `views/pages/albums/list.ejs`
  - **Changes**:
    - Wrap album items in `<div id="album-list">`
    - Add button with htmx:
      ```html
      <button
        hx-get="/albums?page=2"
        hx-target="#album-list"
        hx-swap="beforeend"
        class="button is-primary"
      >
        Load More
      </button>
      ```
  - **Files**: `src/controllers/albums.ts` - Update list action to render album-list-item partial for htmx pagination requests
  - **Verify**: Click "Load More", see new albums append

- [ ] Task 8.3: Add htmx live search to albums list
  - **Output**: Search input filters albums as you type
  - **Files**: `views/pages/albums/list.ejs`
  - **Changes**: Add search input:
    ```html
    <input
      type="search"
      name="q"
      hx-get="/albums/search"
      hx-trigger="keyup changed delay:500ms"
      hx-target="#album-list"
      class="input"
    />
    <div id="search-results"></div>
    ```
  - **Files**: `src/controllers/albums.ts` - Add search action that renders filtered album-list-item partials
  - **Verify**: Type in search, see results update dynamically

- [ ] Task 8.4: Update controllers to render partials for htmx
  - **Output**: Controllers fully support htmx fragment rendering
  - **Files**: `src/controllers/albums.ts` (and other controllers as needed)
  - **Changes**: Ensure all htmx code paths render appropriate partials:
    - Success → `alert-success.ejs`
    - Error → `alert-error.ejs` or `form-errors.ejs`
    - List items → `album-list-item.ejs`
  - **Verify**: Test each interaction, verify correct partial is rendered

### Phase 8 Checkpoint

- [ ] Test form submission (both success and error cases)
- [ ] Test "Load More" pagination
- [ ] Test live search
- [ ] Open browser devtools, verify:
  - [ ] AJAX requests have `HX-Request: true` header
  - [ ] Responses are HTML fragments (not full pages)
  - [ ] DOM updates correctly without full reload
- [ ] Run tests: `npm test`
- [ ] **Demo ready**: Show all 3 htmx interactions working live

---

## Phase 9: E2E Tests for htmx

**Goal**: Write end-to-end tests verifying htmx interactions work correctly
**Demo**: "At standup, I can show: E2E tests pass, proving htmx features work"

### Tasks

- [x] Task 9.1: Create E2E test file for frontend migration
  - **Output**: New E2E test suite ✅
  - **Files**: `tests/e2e/frontend-migration.spec.ts` (NEW)
  - **Verify**: File exists ✅

- [ ] Task 9.2: Write test for htmx navigation boost
  - **Output**: Test verifies page navigation without full reload
  - **Files**: `tests/e2e/frontend-migration.spec.ts`
  - **Test**:
    - Navigate to /albums
    - Click a nav link
    - Verify URL changes but page didn't fully reload (check for hx-boosted class or network activity)
  - **Verify**: Run `npm run test:e2e`, test passes
  - **Note**: ⚠️ NOT IMPLEMENTED - Only basic htmx tests were created

- [x] Task 9.3: Write test for htmx form submission
  - **Output**: Test verifies form submits via AJAX ✅
  - **Files**: `tests/e2e/frontend-migration.spec.ts`
  - **Test**:
    - Navigate to /albums/new
    - Fill form fields
    - Click submit button
    - Verify success notification appears inline
    - Verify URL didn't change (no full reload)
  - **Verify**: Run `npm run test:e2e`, test passes ✅
  - **Status**: PASSING (4/4 tests)

- [x] Task 9.4: Write test for htmx pagination
  - **Output**: Test verifies "Load More" works ✅
  - **Files**: `tests/e2e/frontend-migration.spec.ts`
  - **Test**:
    - Navigate to /albums
    - Count initial number of albums
    - Click "Load More" button
    - Verify more albums appear
    - Verify count increased
  - **Verify**: Run `npm run test:e2e`, test passes ✅
  - **Status**: PASSING (4/4 tests)

- [x] Task 9.5: Write test for htmx error handling
  - **Output**: Test verifies inline error messages ✅
  - **Files**: `tests/e2e/frontend-migration.spec.ts`
  - **Test**:
    - Navigate to /albums/new
    - Submit form with invalid data
    - Verify error notification appears inline
    - Verify form fields retain entered data
  - **Verify**: Run `npm run test:e2e`, test passes ✅
  - **Status**: PASSING (4/4 tests)
  - **Bug Fixes Applied**:
    - Fixed invalid `hx-validate="false"` → changed to `novalidate`
    - Fixed 422 status code preventing htmx content swap → changed to 200
    - Fixed live search test using `fill()` → changed to `type()` for keyup events

- [x] **BONUS Task**: Write test for htmx live search filtering
  - **Output**: Test verifies live search filters albums ✅
  - **Files**: `tests/e2e/frontend-migration.spec.ts`
  - **Status**: PASSING (4/4 tests)

### Phase 9 Checkpoint

- [x] Run E2E tests: `npm run test:e2e` ✅
- [x] All new tests pass ✅ (4/4 passing in 57.0s)
- [ ] Check test coverage if available
- [x] **Demo ready**: Show passing E2E test suite with htmx scenarios ✅

---

## Phase 9.5: Priority 1 Critical Fixes (Post-Review)

**Goal**: Fix critical issues identified in code review and testing
**Demo**: "At standup, I can show: Proper HTTP status codes, user-friendly errors, working notifications, accessibility"

### Background

After completing Phase 9, ran cata-reviewer and cata-tester agents to verify implementation quality. Found 1 CRITICAL issue and several moderate/minor issues that required immediate fixes before production deployment.

### Tasks

- [x] Task 9.5.1: Fix HTTP status codes for validation errors ✅
  - **Problem**: Validation errors returned HTTP 200 instead of 422 (CRITICAL)
  - **Impact**: Broke monitoring dashboards, violated HTTP semantics
  - **Files Modified**:
    - `views/layouts/base.ejs` (lines 20-46)
    - `src/controllers/albums/albums.web.controller.ts` (lines 225, 264)
  - **Solution**:
    - Added htmx global configuration to handle 422 responses
    - Restored `res.status(422)` in error handlers
  - **Verify**: E2E tests pass, network tab shows 422 for validation errors ✅

- [x] Task 9.5.2: Parse Zod validation errors for user-friendly messages ✅
  - **Problem**: Users saw raw JSON from Zod (UX issue)
  - **Impact**: Poor user experience, technical error messages
  - **Files Modified**:
    - `src/controllers/albums/albums.web.controller.ts` (lines 15-30, 227, 266)
  - **Solution**:
    - Added `formatValidationErrors()` helper to extract user-friendly messages
    - Helper handles both `ValidationError` (from DTO) and raw `ZodError`
  - **Before**: `[ { "code": "too_small", "minimum": 1, ... } ]`
  - **After**: `Name is required`
  - **Verify**: Submit invalid form, see clear error message ✅

- [x] Task 9.5.3: Add notification dismiss functionality ✅
  - **Problem**: Delete button on notifications didn't work
  - **Files Modified**:
    - `views/layouts/base.ejs` (lines 29-45)
  - **Solution**:
    - Added Bulma notification dismiss script
    - Re-attaches handlers after htmx swaps in new content
  - **Verify**: Click X button on notification, it disappears ✅

- [x] Task 9.5.4: Reduce code duplication (extract helper) ✅
  - **Problem**: Promise wrapper pattern repeated 4 times
  - **Files Modified**:
    - `src/controllers/albums/albums.web.controller.ts` (lines 25-41, 214, 253)
  - **Solution**:
    - Added `renderPartial()` helper function
    - Reduced duplication from 4 instances to 1 helper
  - **Verify**: Build succeeds, tests pass ✅

- [x] Task 9.5.5: Add ARIA attributes for accessibility ✅
  - **Problem**: Error notification container lacked screen reader support
  - **Files Modified**:
    - `views/pages/albums/form.ejs` (line 24)
  - **Solution**:
    - Added `role="alert"`, `aria-live="assertive"`, `aria-atomic="true"`
  - **Verify**: Screen readers announce errors immediately ✅

### Phase 9.5 Checkpoint

- [x] All Priority 1 fixes implemented ✅
- [x] Build succeeds: `npm run build` ✅
- [x] Linter passes: `npm run lint` ✅
- [x] E2E tests pass: 4/4 passing ✅
- [x] Manual verification test created and passed ✅
- [x] **Demo ready**: All improvements verified and documented ✅

**Time Spent**: ~1.5 hours (estimated 2-4 hours)

**Verification Report**: `.design/2025-10-11-migrate-to-bulma-and-htmx/verification-report.md`
**Completion Report**: `.design/2025-10-11-migrate-to-bulma-and-htmx/priority-1-fixes-complete.md`

---

## Phase 10: Cleanup & Final Verification

**Goal**: Remove all remaining DaisyUI/Tailwind references and verify complete migration
**Demo**: "At standup, I can show: Zero old CSS framework references, all tests pass, application fully functional"

### Tasks

- [ ] Task 10.1: Search for remaining DaisyUI class references
  - **Output**: Identify any missed class conversions
  - **Command**: `grep -r "btn\|card\|alert\|badge\|modal\|menu\|stat\|form-control\|toggle\|loading" views/ --include="*.ejs"`
  - **Verify**: No matches or all matches are intentional (e.g., button text content)

- [ ] Task 10.2: Search for remaining Tailwind utility references
  - **Output**: Identify any missed utility class conversions
  - **Command**: `grep -r "mx-\|px-\|py-\|bg-\|text-\|flex\|grid" views/ --include="*.ejs"`
  - **Verify**: No matches or convert remaining ones to Bulma equivalents

- [ ] Task 10.3: Verify no Tailwind/DaisyUI in package.json
  - **Output**: Confirm dependencies removed
  - **Command**: `grep -i "tailwind\|daisyui" package.json`
  - **Verify**: No matches

- [ ] Task 10.4: Verify no tailwind.config.js
  - **Output**: Confirm config file deleted
  - **Command**: `ls tailwind.config.js`
  - **Verify**: File not found error

- [ ] Task 10.5: Update documentation (if needed)
  - **Output**: README or docs mention Bulma and htmx
  - **Files**: `README.md` (if exists)
  - **Changes**: Update any references to CSS framework from Tailwind→Bulma, mention htmx
  - **Verify**: Documentation is accurate

- [ ] Task 10.6: Optional - Install Bulma extensions if needed
  - **Output**: Extensions for toggles or other components
  - **Command**: `npm install bulma-switch` (or other extensions)
  - **Files**: `src/styles/main.css` - Import extension CSS
  - **Verify**: Extension components work

### Phase 10 Checkpoint

- [ ] Run lint: `npm run lint` - should pass
- [ ] Run build: `npm run build` - should succeed
- [ ] Build CSS: `npm run build:css` - should generate clean output
- [ ] Run all tests: `npm test` - should pass
- [ ] Run E2E tests: `npm run test:e2e` - should pass
- [ ] Manual smoke test:
  - [ ] Visit every page in the app
  - [ ] Test every form
  - [ ] Test every button/link
  - [ ] Verify htmx interactions work
  - [ ] Check browser console for errors
- [ ] **Demo ready**: Full application walkthrough showing Bulma styling and htmx features

---

## Final Verification

- [ ] All requirements from design doc met:
  - [ ] Zero DaisyUI/Tailwind dependencies in package.json
  - [ ] Bulma and htmx installed via npm
  - [ ] All 11 template files converted
  - [ ] At least 3 htmx patterns implemented (form, pagination, search)
  - [ ] Dark theme maintained
  - [ ] All tests passing

- [ ] All obsolete code removed:
  - [ ] tailwind.config.js deleted
  - [ ] @tailwind directives removed from CSS
  - [ ] All 207 DaisyUI class occurrences replaced

- [ ] Tests comprehensive:
  - [ ] Unit tests for htmx middleware
  - [ ] Integration tests for controller htmx logic
  - [ ] E2E tests for htmx interactions

- [ ] Application functional:
  - [ ] All pages render correctly
  - [ ] All forms submit
  - [ ] All dynamic interactions work
  - [ ] No console errors

---

## Success! 🎉

You've successfully migrated from DaisyUI/Tailwind to Bulma + htmx. The application now has:

- ✅ Semantic, maintainable CSS with Bulma
- ✅ Dynamic interactions without full page reloads via htmx
- ✅ Server-side rendering with HTML fragments
- ✅ Clean codebase with all old framework references removed
- ✅ Comprehensive test coverage
