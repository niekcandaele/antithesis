# Design: Migrate Frontend from DaisyUI/Tailwind to Bulma + htmx

## Layer 1: Problem & Requirements

### Problem Statement

The current frontend uses DaisyUI and Tailwind CSS, which are utility-first frameworks requiring extensive class composition and custom configuration. This approach can lead to verbose HTML, tight coupling to specific utility patterns, and difficulty maintaining consistent styling across components. Additionally, the application lacks dynamic interactions beyond full page reloads, creating a less responsive user experience [1].

The migration to Bulma offers a more semantic, component-based CSS framework with simpler class names and less configuration overhead [2]. Integrating htmx enables progressive enhancement with AJAX-driven interactions while maintaining server-side rendering, following hypermedia-driven application (HDA) principles [3][4].

### Current State

**Technology Stack:**

- **CSS Framework**: Tailwind CSS v3.4.18 with DaisyUI v4.12.24 plugin
- **Build Pipeline**: PostCSS with Autoprefixer
- **Template Engine**: EJS (12 template files across views/)
- **Current DaisyUI Usage**: 207 occurrences of DaisyUI component classes across 11 template files

**Key Files:**

- `src/styles/main.css` - Tailwind directives entry point (4 lines)
- `tailwind.config.js` - Tailwind configuration with DaisyUI dark theme
- `postcss.config.js` - PostCSS pipeline configuration
- `package.json` - Dependencies (daisyui@4.12.24, tailwindcss@3.4.18)
- `views/layouts/base.ejs` - Base layout template
- `views/pages/components-demo.ejs` - Comprehensive component showcase (340 lines)

**Component Inventory:**
Current templates use these DaisyUI components extensively:

- Navigation: menu (horizontal), navbar patterns
- Layout: cards, stats, forms, tables
- Feedback: alerts (info/success/warning/error), badges, loading states
- Interactive: buttons, modals, form controls (inputs, selects, textareas, checkboxes, toggles, radios)
- Data: tables with status badges

**Pain Points:**

- Verbose class strings like `class="card bg-base-100 shadow-xl"` require memorizing utility combinations
- No native interactive components - all interactions require full page reloads or custom JavaScript
- DaisyUI theming through Tailwind configuration adds complexity
- 207 class occurrences need manual migration across 11 files

### Requirements

#### Functional

- **REQ-001**: The system SHALL render all existing UI components using Bulma CSS classes with equivalent visual appearance
- **REQ-002**: The system SHALL support dynamic content updates without full page reloads using htmx attributes
- **REQ-003**: WHEN users interact with forms or navigation THEN htmx SHALL handle requests via AJAX and swap partial HTML responses
- **REQ-004**: The system SHALL use Bulma's default dark theme colors for visual consistency
- **REQ-005**: The system SHALL serve HTML fragments for htmx requests and full pages for standard navigation [6]
- **REQ-006**: The system SHALL organize reusable HTML fragments in `views/partials/` directory

> **Decision**: Progressive enhancement removed as a requirement
> **Rationale**: This is a greenfield project focused on establishing a stable htmx foundation. Full progressive enhancement support (JavaScript-disabled fallbacks) adds significant complexity without immediate value. The focus is on building htmx-first interactions that work well for the primary use case.

#### Non-Functional

- **Performance**: Bulma and htmx SHALL be installed via npm and bundled through the build pipeline for version control and customization
- **Security**: Server-side templates SHALL whitelist allowed HTML attributes and tags when rendering dynamic content [6]
- **Maintainability**: CSS class names should be semantic and self-documenting (e.g., `button is-primary` vs `btn btn-primary`)
- **Accessibility**: All interactive components SHALL maintain WCAG 2.1 AA compliance with proper ARIA attributes

> **Decision**: Install dependencies via npm instead of CDN
> **Rationale**: npm installation provides better version control, allows build-time customization of Bulma via Sass variables, and enables tree-shaking for smaller production bundles. PostCSS pipeline can compile Bulma Sass directly.

### Constraints

- Must work with existing EJS templating system
- Must maintain Node.js 22+ and Express 5.1.0 compatibility
- Must preserve existing route structure and server-side logic
- PostCSS build pipeline should remain for future customization
- Cannot break existing test suite (unit, integration, E2E tests)
- Must support horizontal scaling (stateless server design per 12-factor app principles)

### Success Criteria

- Zero DaisyUI/Tailwind dependencies in package.json
- Bulma and htmx installed via npm with latest stable versions
- All 11 template files converted to Bulma classes
- At least 3 interactive patterns implemented with htmx (e.g., form submission, content loading, search)
- Dark theme using Bulma's default color scheme
- Build and test scripts pass successfully
- Functional E2E tests verify htmx interactions work correctly

> **Decision**: Complete migration, not incremental rollout
> **Rationale**: This is a greenfield project without production users. A complete replacement eliminates confusion from maintaining dual systems and ensures all old CSS framework references are removed. Feature flags and gradual rollout add unnecessary complexity.

## Layer 2: Functional Specification

### User Workflows

#### 1. **Page Navigation with htmx Boost**

- **User action**: User clicks a navigation link
- **System response**: htmx intercepts click, sends AJAX request with `HX-Request: true` header [7]
- **Outcome**: Server detects htmx request, responds with main content fragment only (not full layout), htmx swaps content into page without full reload

#### 2. **Form Submission with Inline Validation**

- **User action**: User fills form and submits (e.g., album creation form)
- **System response**: htmx sends AJAX POST, server validates and returns success message fragment or error alerts [6]
- **Outcome**: Success/error alerts appear inline without page reload; on success, list updates with new item

#### 3. **Dynamic Content Loading**

- **User action**: User clicks "Load More" on paginated album list
- **System response**: htmx sends GET request with pagination params, server returns HTML fragment of next page items
- **Outcome**: New items append to existing list without full page reload

#### 4. **Server-Side Error Handling**

- **User action**: User submits form with validation errors
- **System response**: htmx receives HTML fragment with inline error messages
- **Outcome**: Error messages appear inline in the form without page reload, maintaining user's input state

### External Interfaces

**HTTP Request/Response Patterns:**

1. **Standard Request** (no htmx):

```http
GET /albums HTTP/1.1
Host: example.com

Response: Full HTML page with layout (200 OK)
```

2. **htmx Request**:

```http
GET /albums HTTP/1.1
Host: example.com
HX-Request: true
HX-Current-URL: http://example.com/dashboard

Response: HTML fragment (main content only, no layout) (200 OK)
```

3. **htmx Form Submission**:

```http
POST /albums HTTP/1.1
HX-Request: true
Content-Type: application/x-www-form-urlencoded

Response: Fragment with success message or form with errors
HX-Trigger: albumCreated (for event-driven updates)
```

**Server-Side Detection:**

```javascript
// In route handlers
function isHtmxRequest(req) {
  return req.headers['hx-request'] === 'true';
}

// Render appropriate response
if (isHtmxRequest(req)) {
  res.render('partials/album-item', { album });
} else {
  res.render('pages/albums/list', { albums });
}
```

### Alternatives Considered

| Option                             | Pros                                       | Cons                                                                              | Why Not Chosen                                                             |
| ---------------------------------- | ------------------------------------------ | --------------------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| **Keep Tailwind, add htmx**        | Minimal refactor, only add htmx            | Still maintains utility-class verbosity, doesn't address semantic naming concerns | User specifically requested Bulma migration                                |
| **Bootstrap + htmx**               | Battle-tested, extensive documentation [8] | Heavier framework, jQuery legacy patterns in older docs                           | Bulma is more modern and lightweight without JavaScript dependencies [2]   |
| **Alpine.js instead of htmx**      | Rich reactive client-side scripting [9]    | More client-side complexity, less aligned with server-side rendering philosophy   | htmx better fits SSR-first architecture and progressive enhancement [3][4] |
| **Full SPA framework (React/Vue)** | Rich interactivity, component ecosystem    | Requires major architectural rewrite, loses SSR simplicity, over-engineering [10] | Violates existing architecture, too complex for requirements               |
| **Semantic UI**                    | Similar semantic approach to Bulma         | Project maintenance concerns, less active community [11]                          | Bulma has more active development and modern Flexbox foundation [2]        |

## Layer 3: Technical Specification

### Architecture

**Component Interaction Diagram:**

```
Browser                  Server (Express + EJS)         Database
   │                            │                          │
   ├─── Standard Request ──────>│                          │
   │    (GET /albums)           │                          │
   │                            ├──── Query data ─────────>│
   │                            │<──── Return rows ────────┤
   │                            │ Render full page         │
   │                            │ (layout + content)       │
   │<──── Full HTML ───────────┤                          │
   │                            │                          │
   ├─── htmx Request ──────────>│                          │
   │    HX-Request: true        │ Detect htmx header       │
   │    (GET /albums)           ├──── Query data ─────────>│
   │                            │<──── Return rows ────────┤
   │                            │ Render fragment only     │
   │                            │ (no layout)              │
   │<──── HTML Fragment ────────┤                          │
   │ htmx swaps content         │                          │
   │                            │                          │
```

**Data Flow:**

1. User interacts with Bulma-styled UI element
2. htmx attribute (e.g., `hx-get`, `hx-post`) triggers AJAX request
3. Express middleware checks `HX-Request` header
4. Route controller renders appropriate template (full page or fragment)
5. htmx receives HTML fragment and swaps into DOM based on `hx-swap` strategy
6. Bulma CSS provides styling for both initial and dynamically loaded content

### Code Change Analysis

| Component                         | Action                                                                       | Justification                                                                              |
| --------------------------------- | ---------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| `package.json`                    | **Remove** daisyui, tailwindcss<br>**Add** bulma (latest), htmx.org (latest) | Replace CSS framework and add htmx library via npm                                         |
| `tailwind.config.js`              | **Remove**                                                                   | No longer needed without Tailwind                                                          |
| `postcss.config.js`               | **Modify**                                                                   | Add sass plugin for Bulma compilation, keep autoprefixer                                   |
| `src/styles/main.css`             | **Replace**                                                                  | Remove Tailwind directives, import Bulma with default dark theme                           |
| `views/layouts/base.ejs`          | **Extend**                                                                   | Import htmx from node_modules, update class names to Bulma, add `hx-boost`                 |
| `views/partials/*.ejs`            | **Modify**                                                                   | Convert DaisyUI classes to Bulma equivalents; reuse for htmx fragments                     |
| `views/pages/*.ejs`               | **Modify**                                                                   | Convert DaisyUI classes to Bulma, add htmx attributes for dynamic interactions             |
| `views/pages/components-demo.ejs` | **Modify in parallel**                                                       | Convert early to establish Bulma pattern library and test all components                   |
| `src/controllers/*.ts`            | **Extend**                                                                   | Add htmx request detection helper, conditional rendering logic for fragments vs full pages |
| `src/lib/http/middleware/`        | **Create**                                                                   | New middleware for htmx request detection and response helpers                             |

> **Decision**: Install Bulma extensions as needed
> **Rationale**: Bulma doesn't have direct equivalents for all DaisyUI components (e.g., toggle switches, advanced stats layouts). Using official Bulma extensions (like bulma-switch, bulma-divider) provides consistent styling and reduces custom CSS maintenance. Extensions increase bundle size slightly but improve development velocity.

### Code to Remove

- **tailwind.config.js** (`/home/catalysm/code/antithesis/tailwind.config.js`)
  - Why it's obsolete: Tailwind-specific configuration no longer needed
  - What replaces it: Bulma imported directly in CSS with custom variables for theming
  - Migration path: Move theme colors to CSS custom properties in main.css

- **@tailwind directives** (`src/styles/main.css` lines 1-3)
  - Why it's obsolete: Tailwind directive system replaced by standard CSS imports
  - What replaces it: `@import 'bulma/bulma.sass';` with custom variable overrides
  - Migration path: Replace directives with Bulma imports and theme variables

- **DaisyUI component classes** (207 occurrences across 11 files)
  - Why it's obsolete: Migrating to Bulma component system
  - What replaces it: Bulma equivalent classes (see mapping table in Implementation Approach)
  - Migration path: Systematic find-replace with manual review for complex components

### Implementation Approach

#### Phase 1: Setup & Configuration

**Install Dependencies:**

```bash
npm uninstall daisyui tailwindcss
npm install bulma htmx.org sass postcss-cli
```

> **Decision**: Install latest tagged versions via npm
> **Rationale**: Using npm provides version control in package.json and eliminates CDN reliability concerns. Installing the latest tagged versions (not @latest tag) ensures stability while getting modern features. Bulma and htmx can be imported/bundled through the existing PostCSS pipeline.

**Update Build Configuration:**

1. **`postcss.config.js`** - Add Sass support for Bulma:

```javascript
export default {
  plugins: {
    'postcss-sass': {}, // Add Sass compilation
    autoprefixer: {},
  },
};
```

2. **`src/styles/main.css`** - Replace Tailwind with Bulma:

```css
/* Import Bulma with default dark theme colors */
@import 'bulma/bulma';

/* Minimal custom overrides if needed */
/* Bulma's default color scheme used for dark theme */
```

> **Decision**: Use Bulma's default colors
> **Rationale**: Bulma's default color palette is well-designed and provides sufficient contrast for dark themes. Using defaults reduces CSS maintenance burden and ensures consistency with Bulma documentation examples. Custom theming can be added later if specific brand colors are needed.

3. **Build script** - Verify CSS build works:

```bash
npm run build:css
```

#### Phase 2: Base Layout & htmx Integration

**`views/layouts/base.ejs`** - Add htmx and convert to Bulma:

Key changes:

- Import htmx from node_modules: `<script src="/js/htmx.min.js"></script>` (served via static middleware)
- Remove `data-theme="dark"` attribute (DaisyUI-specific)
- Add `hx-boost="true"` to enable AJAX navigation [7]
- Update container classes: `container mx-auto px-4 py-8` → `container section`

Example structure:

```html
<body hx-boost="true">
  <%- include('../partials/header') %>
  <main class="section">
    <div class="container"><%- body %></div>
  </main>
  <%- include('../partials/footer') %>
  <script src="/js/htmx.min.js"></script>
</body>
```

Note: Copy htmx from `node_modules/htmx.org/dist/htmx.min.js` to `public/js/` in build process or serve directly from node_modules via static middleware configuration.

#### Phase 3: Component Migration

**DaisyUI → Bulma Class Mapping:**

| DaisyUI Pattern              | Bulma Equivalent                               | Notes                                                      |
| ---------------------------- | ---------------------------------------------- | ---------------------------------------------------------- |
| `btn btn-primary`            | `button is-primary`                            | Bulma uses `is-` prefix for modifiers                      |
| `btn btn-outline`            | `button is-outlined`                           |                                                            |
| `btn btn-sm/lg`              | `button is-small/is-large`                     |                                                            |
| `card bg-base-100 shadow-xl` | `box`                                          | Bulma's box component has shadow by default                |
| `alert alert-info`           | `notification is-info`                         |                                                            |
| `alert alert-success`        | `notification is-success`                      |                                                            |
| `badge badge-primary`        | `tag is-primary`                               |                                                            |
| `form-control`               | `field`                                        | Bulma uses field + control structure                       |
| `input input-bordered`       | `input`                                        | Borders included by default in Bulma                       |
| `select select-bordered`     | `select` wrapper + `<select>`                  | Nested structure                                           |
| `textarea textarea-bordered` | `textarea`                                     |                                                            |
| `checkbox checkbox-primary`  | `checkbox` + label wrapper                     | Different structure                                        |
| `toggle toggle-primary`      | Install bulma-switch extension                 | Bulma doesn't have native toggle; use bulma-switch package |
| `menu menu-horizontal`       | `navbar` or `tabs`                             | Depending on context                                       |
| `table`                      | `table is-fullwidth is-striped`                |                                                            |
| `modal`                      | `modal` + `modal-background` + `modal-content` | Similar structure                                          |
| `loading loading-spinner`    | `button is-loading` or custom spinner          |                                                            |
| `stats`                      | Custom card layout with columns                | No direct equivalent                                       |

**Migration Priority:**

1. Start with `base.ejs` layout and shared partials (`header.ejs`, `nav.ejs`, `footer.ejs`)
2. **Convert `components-demo.ejs` in parallel** to establish Bulma pattern library
3. Convert simple pages (`error.ejs`, `dashboard.ejs`) using patterns from components-demo
4. Convert form-heavy pages (`albums/form.ejs`, `photos/form.ejs`) referencing form patterns
5. Convert remaining pages (`albums/list.ejs`, `albums/detail.ejs`, etc.)

> **Decision**: Convert components-demo early, in parallel with other work
> **Rationale**: The components-demo page establishes the Bulma pattern library that other pages will reference. Converting it early prevents replicating incorrect patterns across multiple pages. Use it as a staging area to perfect each component before applying patterns project-wide.

#### Phase 4: Dynamic Interactions with htmx

**Pattern 1: Form Submission** (`views/pages/albums/form.ejs`):

Add htmx attributes to form:

```html
<form hx-post="/albums" hx-target="#form-container" hx-swap="outerHTML">
  <!-- Form fields with Bulma classes -->
  <button type="submit" class="button is-primary">Submit</button>
</form>
```

Server-side handling (`src/controllers/albums.ts`):

```typescript
if user authenticated and valid data:
  create album in database
  if htmx request:
    render success notification fragment (from views/partials/)
  else:
    redirect to albums list
else:
  if htmx request:
    render form with error notifications (from views/partials/)
  else:
    render full error page
```

> **Decision**: Organize fragments in views/partials/
> **Rationale**: Leverages existing partials directory structure. Partials are already understood as reusable components; extending this pattern to include htmx response fragments keeps the codebase consistent. No need for a new directory structure.

**Pattern 2: Dynamic Content Loading** (`views/pages/albums/list.ejs`):

Add htmx for pagination:

```html
<div id="album-list">
  <!-- Album items -->
</div>
<button hx-get="/albums?page=2" hx-target="#album-list" hx-swap="beforeend">Load More</button>
```

**Pattern 3: Live Search** (new feature for albums):

```html
<input
  type="search"
  name="q"
  hx-get="/albums/search"
  hx-trigger="keyup changed delay:500ms"
  hx-target="#search-results"
/>
<div id="search-results"></div>
```

#### Phase 5: Server-Side htmx Support

**Middleware** (`src/lib/http/middleware/htmx.ts` - new file):

Create helper functions:

```typescript
// Detect htmx requests
function isHtmxRequest(req: Request): boolean;

// Set response headers for htmx
function htmxRedirect(res: Response, url: string);
function htmxTrigger(res: Response, eventName: string);
```

**Controller Updates** - Extend existing controllers:

Pattern for all route handlers:

```typescript
if data operation successful:
  if isHtmxRequest:
    set success header
    render fragment template
  else:
    redirect or render full page
else:
  if isHtmxRequest:
    render error fragment
  else:
    render full error page
```

#### Phase 6: Template Fragment Creation

**Create Reusable Partials for htmx Responses:**

New partials to create in `views/partials/`:

- `alert-success.ejs` - Success notification fragment
- `alert-error.ejs` - Error notification fragment
- `album-list-item.ejs` - Single album item for dynamic loading
- `form-errors.ejs` - Validation error display
- `loading-spinner.ejs` - Loading state indicator

These partials are rendered server-side in response to htmx requests and swapped into the DOM.

### Test-Driven Implementation

**Unit Tests** (`src/lib/http/middleware/htmx.test.ts`):

- Test `isHtmxRequest()` correctly detects `HX-Request` header
- Test `htmxRedirect()` sets `HX-Redirect` header
- Test `htmxTrigger()` sets `HX-Trigger` header

**Integration Tests** (update existing controller tests):

- Test album creation with htmx header returns fragment (status 200, partial HTML)
- Test album creation without htmx header redirects (status 302)
- Test form validation errors return error fragment for htmx requests
- Test form validation errors render full page for standard requests
- Test search endpoint returns filtered results fragment

**E2E Tests** (`tests/e2e/frontend-migration.spec.ts` - new file):

- Test: Navigate between pages using htmx boost
  - Verify URL changes without full page reload
  - Verify content updates correctly
- Test: Submit album form with htmx
  - Fill form fields
  - Click submit
  - Verify success notification appears inline
  - Verify album appears in list without page reload
- Test: Load more pagination
  - Click "Load More" button
  - Verify additional items append to list
- Test: htmx error handling
  - Submit invalid form data
  - Verify inline error messages appear
  - Verify form state preserved

**Testing Best Practices** [13]:

- Write tests alongside implementation, not after
- Focus on functional correctness (does it work?)
- Test htmx interactions (AJAX requests, DOM swapping, error handling)
- Verify accessibility with automated tools (e.g., axe-core in E2E tests)

## References

1. [htmx Documentation](https://htmx.org/docs/) - Official Documentation
   - Summary: Core concepts, attributes, and usage patterns for htmx
   - Key takeaway: htmx enables AJAX requests directly from HTML with progressive enhancement

2. [Understanding the Bulma CSS framework: a complete 2025 guide](https://pieces.app/blog/understanding-bulma) - 2024
   - Summary: Modern guide to Bulma's architecture, components, and best practices
   - Key takeaway: Bulma uses semantic class names and Flexbox-based layout without JavaScript dependencies

3. [htmx - Hypermedia-Driven Applications](https://htmx.org/essays/hypermedia-driven-applications/) - Official Essay
   - Summary: Architectural pattern for building interactive web apps with hypermedia instead of JSON APIs
   - Key takeaway: HDA combines simplicity of MPAs with UX of SPAs through server-rendered HTML fragments

4. [htmx - 10 Tips For Building SSR/HDA applications](https://htmx.org/essays/10-tips-for-ssr-hda-apps/) - Official Guide
   - Summary: Best practices for server-side rendering with htmx
   - Key takeaway: Organize via template inclusion, optimize database access, respond with HTML not JSON

5. [Simple progressively enhanced web apps - htmx](https://oliverjam.es/articles/progressive-enhancement-htmx) - 2024
   - Summary: Implementation guide for progressive enhancement with htmx
   - Key takeaway: Use both href and hx-get attributes for graceful degradation without JavaScript

6. [htmx - Server-Side Examples](https://htmx.org/server-examples/) - Official Documentation
   - Summary: Integration patterns for various server-side frameworks
   - Key takeaway: Detect htmx requests via headers, serve fragments vs full pages conditionally

7. [htmx - You Can't Build Interactive Web Apps Except as Single Page Applications... And Other Myths](https://htmx.org/essays/you-cant/) - Official Essay
   - Summary: Debunking SPA necessity, demonstrating alternatives
   - Key takeaway: hx-boost enables seamless navigation without full page reloads while maintaining progressive enhancement

8. [Bootstrap Documentation](https://getbootstrap.com/) - Official Documentation
   - Summary: Component-based CSS framework documentation
   - Key takeaway: Referenced for comparison; Bootstrap has extensive components but heavier footprint than Bulma

9. [htmx Documentation - Client-Side Scripting](https://htmx.org/docs/#scripting) - Official Documentation
   - Summary: Integrating htmx with client-side JavaScript libraries
   - Key takeaway: htmx works well with Alpine.js for reactive UI, but Alpine adds client-side complexity

10. [A 2024 Exploration into HTMX](https://javascripttoday.com/blog/a-2024-exploration-into-htmx/) - 2024
    - Summary: Modern comparison of htmx vs SPA frameworks
    - Key takeaway: SPAs are over-engineering for many use cases; htmx provides better simplicity-to-functionality ratio

11. [Bulma CSS adoption guide: Overview, examples, and alternatives - LogRocket](https://blog.logrocket.com/bulma-css-adoption-guide/) - 2023
    - Summary: Comprehensive guide to Bulma including comparison with alternatives
    - Key takeaway: Bulma has active community and modern architecture compared to Semantic UI

12. [htmx Installation Documentation](https://htmx.org/docs/#installing) - Official Documentation
    - Summary: Installation methods including CDN, npm, and direct download
    - Key takeaway: Recommended to use specific version from CDN (unpkg.com) for production reliability

13. [Best Practices for Optimizing Server-Side Rendering (SSR)](https://blog.pixelfreestudio.com/best-practices-for-optimizing-server-side-rendering-ssr/) - 2024
    - Summary: Performance and testing best practices for SSR applications
    - Key takeaway: Test functional correctness first, optimize rendering performance, monitor TTFB metrics

14. [Migrating to Bulma v1 | Bulma Documentation](https://bulma.io/documentation/start/migrating-to-v1/) - Official Documentation
    - Summary: Migration guide to Bulma v1 with CSS variables and theming
    - Key takeaway: Bulma v1 uses CSS variables for theming, making dark mode implementation simpler

15. [Using htmx to build modern web apps with classic techniques - LogRocket](https://blog.logrocket.com/using-htmx-modern-apps-classic-techniques/) - 2024
    - Summary: Practical guide to htmx integration patterns and real-world examples
    - Key takeaway: htmx fits seamlessly into existing server-rendered architectures without major refactoring

### Research Summary

**Recommended Patterns Applied:**

- **Progressive Enhancement** from [5][7]: All interactive features will work without JavaScript by providing standard HTML attributes (href, action, method) alongside htmx attributes
- **Hypermedia-Driven Architecture** from [3][4]: Server responds with HTML fragments rather than JSON, keeping logic server-side
- **Semantic Class Names** from [2][11]: Bulma's semantic class structure (e.g., `button is-primary`) improves code readability over utility-first approaches
- **Request Detection Pattern** from [6]: Use `HX-Request` header to conditionally render fragments vs full pages

**Anti-Patterns Avoided:**

- **SPA Over-Engineering** per [10]: Avoided suggesting React/Vue SPA rewrite; htmx provides interactivity without architectural complexity
- **Client-Side State Management** per [4]: Keep state on server, avoid Redux/Vuex-style complexity
- **Utility-First Verbosity** per [2]: Moving away from Tailwind's long class strings to Bulma's simpler syntax
- **Non-Progressive Forms** per [5]: Ensured all forms have proper action/method for JavaScript-disabled scenarios

**Technologies Considered:**

- **Bulma CSS**: Recommended by [2][11] for modern, lightweight, semantic CSS framework without JavaScript dependencies
- **htmx**: Industry standard per [3][10][15] for progressive enhancement and hypermedia-driven interactions
- **PostCSS**: Retained for future customization capabilities while simplifying build pipeline

**Standards Compliance:**

- **Progressive Enhancement**: Implementation approach follows [5] guidelines for graceful degradation
- **Semantic HTML**: Bulma encourages semantic markup per [2], improving accessibility
- **Server-Side Security**: Whitelist approach for HTML attributes per [6] to prevent XSS vulnerabilities
- **Accessibility**: Bulma components include ARIA attributes; E2E tests should verify WCAG 2.1 AA compliance [13]
