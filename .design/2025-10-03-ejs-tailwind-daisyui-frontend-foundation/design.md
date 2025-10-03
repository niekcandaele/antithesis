# Design: EJS Templating with Tailwind CSS and DaisyUI Frontend Foundation

## Layer 1: Problem & Requirements

### Problem Statement

The application currently only serves JSON APIs with embedded HTML responses for documentation (RapiDoc). There's no structured frontend templating system for serving user-facing HTML pages. We need a foundation for building server-rendered HTML interfaces using modern styling frameworks.

### Current State

- Application uses Express.js with three separate API servers (public, admin, meta)
- Controllers use custom `Endpoint` abstraction that currently only supports JSON responses
- HTML is served inline as strings (see src/controllers/meta.ts:35-72)
- No view templating system exists
- No CSS framework or styling infrastructure
- Static assets served directly from node_modules (rapidoc.js example)

### Requirements

#### Functional

- REQ-001: The system SHALL support EJS templating for rendering HTML views
- REQ-002: WHEN a controller renders a view THEN it SHALL use reusable EJS partials for common elements (header, footer, layout)
- REQ-003: The system SHALL integrate Tailwind CSS for utility-first styling
- REQ-004: The system SHALL integrate DaisyUI component library with dark theme only
- REQ-005: The system SHALL support serving compiled/processed CSS assets
- REQ-006: The system SHALL provide a base layout template that other views can extend
- REQ-007: The system SHALL maintain compatibility with existing JSON API endpoints
- REQ-008: The system SHALL provide a `.renderView()` method on Endpoint class for first-class view rendering support
- REQ-009: The system SHALL automatically include global context (route, config, flash messages, user session) in all views

#### Non-Functional

- Performance: CSS should be compiled and minified for production builds during Docker image build
- Developer Experience: CSS should be built on-demand using PostCSS middleware in development (no separate watch process)
- Maintainability: Reusable partials should eliminate duplication across views
- Compatibility: Must work within Docker development environment
- Theming: Dark theme only to minimize CSS bundle size

### Constraints

- Must integrate with existing Express.js HTTP abstraction (src/lib/http/app.ts)
- Must work with current controller/endpoint pattern
- Must not break existing JSON API responses
- Development happens in Docker containers, build processes must account for this

### Success Criteria

- Developers can create new HTML pages using EJS templates
- Common UI elements (header, footer) are defined once and reused
- Tailwind CSS classes work in templates
- DaisyUI components render correctly
- CSS is automatically compiled when templates change
- Existing API endpoints continue to function

## Layer 2: Functional Specification

### User Workflows

1. **Developer Creates New HTML Page**
   - Developer creates new EJS file in views directory → File uses base layout → Common header/footer automatically included → Page rendered with Tailwind styles

2. **Developer Adds Styled Component**
   - Developer uses DaisyUI component class in template → Component renders with proper styling → No custom CSS needed

3. **Developer Modifies Styles**
   - Developer edits template with Tailwind classes → Development server detects change → Browser auto-refreshes with updated styles

### External Interfaces

#### New Template Rendering API

```typescript
// In controller endpoint using .renderView() method
get('/dashboard', 'getDashboard').renderView('pages/dashboard', (inputs, req, res) => {
  return {
    user: req.user,
    data: someData,
  };
});
```

> **Decision**: Use `.renderView()` method on Endpoint class
> **Rationale**: Provides first-class view support with better developer experience and type safety
> **Alternative**: Returning raw HTML strings was simpler but less structured

#### Directory Structure

```
views/
  layouts/
    base.ejs          - Main HTML structure with dark theme
  partials/
    header.ejs        - Reusable header
    footer.ejs        - Reusable footer
    nav.ejs           - Navigation component
  pages/
    dashboard.ejs     - Example page

public/
  css/
    main.css          - Compiled Tailwind CSS (production)
  images/             - Image assets
  fonts/              - Font files
  js/                 - Frontend JavaScript

src/styles/
  main.css            - Source CSS with Tailwind directives
```

### Alternatives Considered

| Option           | Pros                    | Cons                                   | Why Not Chosen                            |
| ---------------- | ----------------------- | -------------------------------------- | ----------------------------------------- |
| React SSR        | Modern, component-based | Heavy build setup, complexity overhead | Over-engineered for server-rendered pages |
| Handlebars       | Simple, logic-less      | Less powerful than EJS                 | User specifically requested EJS           |
| No framework CSS | Full control            | Time-consuming, inconsistent           | User requested Tailwind/DaisyUI           |
| CDN CSS          | Easy setup              | Not optimized, unused styles           | Best practice is to purge/compile CSS     |

## Layer 3: Technical Specification

### Architecture

```
┌─────────────────────────────────────────────┐
│           Express Application                │
│  (src/lib/http/app.ts)                      │
└─────────────────────────────────────────────┘
                    │
    ┌───────────────┼───────────────┐
    │               │               │
    ▼               ▼               ▼
┌─────────┐   ┌──────────┐   ┌──────────┐
│ JSON    │   │ HTML     │   │ Static   │
│ Routes  │   │ Routes   │   │ Assets   │
│ (exist) │   │ (new)    │   │ (new)    │
└─────────┘   └──────────┘   └──────────┘
                    │               │
                    ▼               ▼
              ┌──────────┐   ┌──────────┐
              │   EJS    │   │Compiled  │
              │ Renderer │   │   CSS    │
              └──────────┘   └──────────┘
                    │
                    ▼
              ┌──────────┐
              │  Views   │
              │ (layouts │
              │ partials)│
              └──────────┘
```

### Code Change Analysis

| Component                | Action | Justification                                                                         |
| ------------------------ | ------ | ------------------------------------------------------------------------------------- |
| package.json             | Extend | Add ejs, tailwindcss, daisyui, autoprefixer, postcss, postcss-middleware dependencies |
| src/lib/http/app.ts      | Extend | Add EJS view engine, static assets, PostCSS middleware for on-demand CSS              |
| src/lib/http/endpoint.ts | Extend | Add `.renderView()` method for first-class template rendering                         |
| views/                   | Create | New directory structure for templates and partials                                    |
| public/                  | Create | Static assets directory (images, fonts, js, css for production)                       |
| tailwind.config.js       | Create | Tailwind config with dark theme only, DaisyUI plugin                                  |
| postcss.config.js        | Create | PostCSS configuration for Tailwind processing                                         |
| src/styles/main.css      | Create | Main CSS entry point with Tailwind directives                                         |
| package.json scripts     | Extend | Add CSS build command for production                                                  |
| Dockerfile               | Extend | Build and minify CSS during production image build                                    |

### Code to Remove

None - this is purely additive. Existing inline HTML in meta.ts:35-72 could optionally be migrated to use the new view system later, but removal is not required.

### Implementation Approach

#### Components

- **HTTP Application Setup** (src/lib/http/app.ts:50-80)
  - Current: Express app configured with JSON parsing, CORS, cookies
  - Changes: Add EJS view engine, static assets, PostCSS middleware
  - Integration:
    ```
    configure express view engine as 'ejs'
    set views directory to '/app/views'
    add PostCSS middleware for on-demand CSS compilation (development)
    add static middleware for '/public' -> public/ directory
    ```

> **Decision**: Use PostCSS middleware for CSS compilation
> **Rationale**: Simpler development setup, no separate watch process needed in Docker
> **Alternative**: Separate Tailwind watch process would be faster but more complex in containers

- **Endpoint View Rendering** (src/lib/http/endpoint.ts - extend)
  - Add `.renderView()` method to Endpoint class
  - Automatically includes global context (current route, app config, flash messages, user session)
  - Sets response content type to 'text/html'
  - Example logic:
    ```
    method renderView(template, dataHandler):
      set responseContentType to 'text/html'
      wrap dataHandler to include global context:
        - req.path (current route)
        - config (app configuration)
        - flash (success/error messages from session)
        - user (req.user if authenticated)
      render template with merged data
      return rendered HTML
    ```

> **Decision**: Global view context includes route, config, flash messages, and user session
> **Rationale**: These are commonly needed across all views and eliminate repetitive passing
> **Configuration**: Context merging happens automatically, no configuration needed

- **Base Layout Template** (views/layouts/base.ejs - new file)
  - Defines HTML structure once
  - Includes CSS link, meta tags
  - Uses DaisyUI dark theme only (data-theme="dark")
  - Uses blocks/yields for page-specific content
  - Includes header and footer partials

> **Decision**: DaisyUI dark theme only
> **Rationale**: Minimizes CSS bundle size, simpler implementation
> **Alternative**: Multiple themes or system preference would add complexity and bundle size

- **Reusable Partials** (views/partials/\*.ejs - new files)
  - header.ejs: Site logo, navigation, user menu
  - footer.ejs: Copyright, links, scripts
  - nav.ejs: Main navigation component
  - Each uses Tailwind utilities and DaisyUI components

- **CSS Build System** (tailwind.config.js, postcss.config.js - new files)
  - Tailwind scans EJS templates for class usage
  - Generates minimal CSS with only used utilities
  - DaisyUI plugin configured with dark theme only
  - Development: PostCSS middleware compiles on-demand
  - Production: CSS built and minified during Docker image build
  - Example process:
    ```
    scan all .ejs files for class names
    generate CSS with matched utilities (dark theme only)
    apply autoprefixer for browser compatibility
    output to public/css/main.css
    in production: minify and optimize CSS
    ```

> **Decision**: Production CSS built during Docker image build
> **Rationale**: Faster container startup, optimized for production deployment
> **Alternative**: Runtime compilation would slow startup; committing to git would track generated files

#### Data Models

No database changes required - this is purely presentation layer.

#### Configuration

No configuration changes needed. PostCSS middleware automatically detects NODE_ENV for development/production mode switching.

#### Security

- EJS auto-escapes output by default (prevents XSS)
- Static assets served with proper MIME types
- CSP headers should be considered (future enhancement)
- Follow existing CORS patterns from src/lib/http/app.ts:56-79

### Testing Strategy

- **Unit Tests**:
  - Test view rendering helper with various inputs
  - Test partial inclusion works correctly
  - Test error handling in template rendering

- **Integration Tests**:
  - Create test endpoint that renders a view
  - Verify HTML output contains expected Tailwind classes
  - Verify DaisyUI components render correctly
  - Test static CSS file is served correctly

- **E2E Tests**:
  - Load page in browser context (existing testcontainers pattern)
  - Verify styles are applied visually
  - Test responsive behavior

### Rollout Plan

**Phase 1: Infrastructure Setup**

- Install dependencies (ejs, tailwindcss, daisyui, postcss, autoprefixer, postcss-middleware)
- Create directory structure (views/, public/, src/styles/)
- Configure Tailwind with dark theme only
- Configure PostCSS for Tailwind processing
- Update Dockerfile for production CSS build

**Phase 2: Base Templates**

- Create base layout with dark theme
- Create header/footer partials using DaisyUI components
- Create sample page demonstrating layout usage
- Add global view context support

**Phase 3: Integration**

- Add EJS engine to Express (src/lib/http/app.ts)
- Add PostCSS middleware for development
- Add static asset serving for /public
- Extend Endpoint class with `.renderView()` method
- Create example controller endpoint

**Phase 4: Testing & Documentation**

- Add unit tests for view rendering
- Add integration tests for endpoint rendering
- Verify styles work correctly
- Document usage patterns and API

**Rollback Strategy**:

- All changes are additive, no breaking changes
- Can disable by not using new endpoints
- No database migrations to rollback
- CSS build failures fall back to no styling
