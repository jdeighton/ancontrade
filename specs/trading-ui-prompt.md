# Trading UI for Testing — Implementation Prompt

This is a web-based user interface for trading futures products, intended to be used in testing the end-to-end operation of various components of a trading system. The system has a web-based front end (React) and a back end that handles communication to the trading venue. The back end connects to the trading venue via the FIX protocol (version 4.4) using a previously built FIX engine.

The whole purpose of this system is end-to-end testing, so rejection and error paths are first-class features, not edge cases. They must be handled, displayed to the user, and covered by tests.

## Technology stack

- **Language/runtime:** All Node.js and TypeScript, top to bottom.
- **Back end:** Node.js. Integrates with the existing FIX engine (source code at D:\NextCloud\src\fixserver) and the existing matching engine (source code at D:\NextCloud\src\matchingengine) (both written in Node/TypeScript).
- **Front end:** React with Vite.
- **Transport:** WebSocket for market data and execution reports (server push). REST for all commands — new orders, cancels, and settings/admin management. Keeping commands on REST aids development testing and allows scripting the back end when the finished system is used for overall testing.
- **Grids:** AG Grid Community Edition for the order book grid and the order-events/detail grids. A custom component for the market data price ladder (see rationale below).
- **Persistence:**
  - **FIX message logs:** JSONL (append-only, human-greppable).
  - **Order/execution state:** SQLite via Node's native `node:sqlite` module (no third-party dependency). Gives queryable order history and avg-price recalculation without re-parsing logs.
- **Dependency philosophy:** Keep the total number of dependencies down. Prefer native Node capabilities and well-established libraries only where they earn their place.

## Architecture notes

- **Order book state lives on the back end**, keyed by venue + instrument. The FIX session is owned by the back end, so the back end maintains the books from the incoming FIX market data and the front end requests a book and receives snapshots/updates over WebSocket.
- **Session-level FIX concerns (sequence numbering, gap fill, resend, etc.) are handled entirely by the FIX engine.** The application layer handles only business-level messages. If gaps in this area are discovered, flag them and enhance the FIX engine code directly rather than working around them in the app.
- Market data arrives as FIX `35=X` (Market Data Incremental Refresh) messages in an order-by-order format.

## Test-driven development (methodology)

Development must be test-driven. Follow red-green-refactor throughout.

- **Start with the pure-logic units that have no I/O**, as these are the easiest to TDD and the most error-prone:
  - Order book aggregation (order-by-order → per-level totals and order counts).
  - Tick-size price validation against instrument reference data.
  - Average fill price calculation (simple quantity-weighted; see Order book section).
  - Client Order ID counter generation (prefix + counter).
- **Move to component-level unit tests** for each component so we know exactly what data is sent in and how the system is expected to react. Mocking venue behavior is acceptable at the unit level.
- **Add integration tests** once multiple components are used together. Spin up the actual matching engine per test suite to provide a realistic, controlled environment (we know there are no other market participants when we instantiate it for our tests). Tear it down after the suite. If per-suite startup cost becomes a performance pain, add state-clearing functionality to the matching engine later rather than mocking it.

### Synthetic test fixtures

- Generate synthetic test data as **separate fixture files, one scenario per file**, that can be played into the system for testing.
- Each fixture has a **descriptive name and a header comment stating the real-world condition it recreates** (and, for rejection scenarios, the rejection reason).
- The **fixture format must be identical to what the FIX engine emits**, so that captured live data can drop in to replace synthetic fixtures in the future.
- Each named fixture should map to a named test that clearly identifies the scenario being recreated.
- Representative fixtures (non-exhaustive):
  - `snapshot-then-incremental-add.jsonl`
  - `level-emptied-to-zero.jsonl`
  - `partial-fill-then-full-fill.jsonl`
  - `order-reject-invalid-price.jsonl`
  - `cancel-reject-too-late-to-cancel.jsonl`
  - `md-request-reject-unknown-symbol.jsonl`
- Every rejection path gets a fixture whose name states the rejection reason. Reason codes (see Rejections) drive what the UI shows, so fixtures should carry varied reasons.

## Admin

- **FIX sessions:** Manage FIX sessions (sender/target comp IDs) used to connect to the venue. Support adding multiple sessions and choosing which credentials to use. Separate FIX sessions are expected for market data and order routing. Initially expect one market data session and one order routing session active at the same time; design so future usage can expand to multiple market data and multiple order routing sessions active together (e.g. connecting to multiple venues).
- **Trader IDs:** Configure multiple IDs and select which one is active. No full user login system is needed at this time — just the ability to define and select which trader is used at any given time. Trader IDs are simple strings sent to the venue; the admin system can alias them to friendly display names.
- **Trading accounts:** Manage account references — simple strings sent to the venue, optionally with friendly display names used locally in the UI.
- **Trading venues:** Configure the components needed to send messages to a particular venue from the overall universe of connections — pick a market data and an order routing FIX session, assign which trader ID to use, assign which account(s) are available on this venue, and allow a friendly display name for use in the UI.
- **Other settings:** Provide a place to manage other admin settings as additional features arrive.
- All admin/settings management uses the REST API. Persisted via a simple file-based approach.

## Market and reference data

- Connect to the market data session of each venue and retrieve the list of available instruments and associated reference data. Store these so the user can later select which instrument to display, and so the data populates order routing.
- Display a grid of bid and ask prices for a selected instrument. The system subscribes to market data updates for that instrument; the venue sends a snapshot of the current order book state and then incremental updates. Data is order-by-order, so multiple orders can exist at a price level and order matters to how the book works. For local display, show total volume at each price and the number of orders making up that volume.
- **Columns:** ask num orders, ask total volume, ask price, bid price, bid total volume, bid num orders.
- **Rows:** the top row shows the current best bid and best ask. Below that, show each valid tick level even if there is no active bid/offer at that level (show zero or leave empty).
- The grid updates when a new market data message for that instrument is received.
- **Price levels setting:** allow the user to define the number of price levels shown (on a settings page or the widget). Default 5, maximum 20.
- **Color:** bid and ask columns use different palettes — typically red for asks and blue for bids. The price level column has a bolder background than the other data elements.
- **Subscription model:** once a subscription is started it is maintained until explicitly stopped by the user, or until the user logs off / disconnects the session. All subscriptions stay live; switching instruments just switches the displayed book.
- **Caching:** the back end caches received market data in memory for the duration of the connected session (keyed venue + instrument). On switching instruments, the display is generated from the cached book without waiting for new data from the venue. In-memory only — no disk or external key/value store.

### Price ladder — custom component (rationale)

A fixed N-level book (5–20 rows) updating at most ~10/sec is small enough that AG Grid's virtualization buys nothing. A custom table gives precise visual control over the red/blue palettes and the bold price column. Use a custom component for the price ladder.

## Order entry ticket

- Provide a means for the user to enter order details and send to the venue.
- **Fields:**
  - **Instrument** — from the list of valid instruments retrieved from the venue(s).
  - **Order type** — limit or market initially (others may be added later).
  - **Price** — required only for limit orders. Must be valid for the tick size of the selected instrument (from reference data).
  - **Quantity** — integer ≥ 1, though the field displays zero initially.
  - **Account** — one of the accounts configured for use on the venue associated with the selected instrument.
  - **Trader ID** — displayed (so the user sees what will be sent) but not selectable or editable in the ticket.
- **Launch states:**
  - **Empty:** no instrument selected; the ticket offers a way to select the trading venue and instrument.
  - **Pre-selected:** launched with an instrument already chosen (e.g. from the price grid or a saved choice).
- **Extensibility:** design so additional fields/choices (time in force, notes, stop price levels, etc.) are simple to add later. Do not implement them now.
- **Buttons:** a clear BUY and SELL button, color-coded to match the price grid — **BUY uses the blue palette, SELL uses the red palette.**
- Expect to prototype the ticket layout and operation over several iterations.
- **Order IDs:** the system creates a unique Client Order ID when an order is sent. Use a counter-based scheme with a prefix rather than a UUID approach.

## Order book

- A grid-based order book showing the current status of all orders sent to the venues.
- Clearly indicate venue, instrument, current order status, and associated fields such as order type and order price (where applicable). Show both the **Client Order ID** (created by the system on send) and the venue-assigned **Exchange Order ID** (FIX `OrderID`, tag 37).
- Listen for execution reports and update the corresponding row when one is received.
- Provide a separate grid to display all order events for a particular order (the new-order message and any rejections or execution reports).
- Provide a means to show the FIX messages received for a particular order when selected/clicked.
- On partial or full fill, update the total filled quantity (**Cumulative Quantity**) and display the amount of the last fill (**Last Qty**).
- Calculate and display the **average fill price** per order from the individual fills — simple quantity-weighted average. (Multi-leg products are out of scope for phase 1; do not implement.)
- Display the **last fill price** received for an order in another column.
- **Cancel button** per order. Disabled when the order is not in an active working state — including the brief pending-new window (order sent, no ack and therefore no Exchange Order ID yet), since you cannot cancel by an ID you do not have.

### Order grid visuals — two separate channels

- **Buy/sell tint:** rendered as a left side-bar on the row, using the blue (buy) / red (sell) palette.
- **Status:** rendered as background color and/or a badge, kept as a distinct visual channel so it does not collide with the buy/sell tint.
- **Lifecycle states to distinguish:** pending-new, working, partially filled, filled, cancelled, rejected. Rejected orders get a distinct color.

### Order book — AG Grid (rationale)

Use AG Grid Community Edition for the order book and order-events/detail grids. Performance is not a concern (≤1000 orders, ≤10 updates/sec peak, typically <1/sec), but AG Grid provides sorting, column filtering, resizing, and virtualization for free across the order set. Community Edition can render the cancel button and other controls via custom cell renderers (React components in cells). The order-events sub-grid is implemented as a separate grid below the main one, so no Enterprise-only master/detail is required.

## Cancel workflow

- Cancel uses FIX `35=F` (Order Cancel Request), carrying both the **Exchange Order ID (`OrderID`, tag 37)** and **`OrigClOrdID` (tag 41)** to identify the target order, plus a **new `ClOrdID` (tag 11)** from the counter system for the cancel request itself (per the standard FIX spec).
- Verify the matching engine supports identifying the cancel by these standard fields; if it does not, update the matching engine to support the standard rather than working around it.
- No cancel/replace workflow in phase 1 (may come later).

## Rejections (first-class)

All rejection types must be handled, surfaced in a UI component, and tested.

- **Order reject** (`35=8`, `OrdStatus=8`): the order appears in the order book grid with status "rejected" and a distinct highlight color. The rejection reason is shown in the grid for order-related messages.
- **Cancel reject** (`OrderCancelReject`): the order stays in its current state (the reject may be because of an in-flight fill not yet received and processed). Notify the user with a **blocking modal** that must be dismissed, containing a summary of the order in question. The order summary snapshot is taken **at reject time**, since the order state may change moments later when a fill lands.
- **Market data request reject** (`35=Y`): leave the price ladder empty and show the failure in a **global status bar / notification area** (also a reasonable home for connection status indicators). MD rejects are expected to be infrequent compared with order events, so a global bar is sufficient.

### Reject reason detail

- The matching engine populates **`OrdRejReason` (tag 103)** — an enum — with the categorized reason, and **`Text` (tag 58)** with free-text detail where present.
- The UI shows **both**: the `103` enum mapped to a human-readable label (also useful for fixture naming and status color logic), **plus** any `58` text.
- Surface the reason everywhere a rejection is shown: the order grid (for order rejects), the blocking modal (for cancel rejects), and the global status bar (for MD rejects).

## General

- **Disconnect (phase 1):** the user can disconnect from the venues. If there are any working orders, present a warning. If the trader approves, disconnect **without auto-cancelling** — the trader can choose not to quit and can manually cancel any open orders first. (Auto-cancel-all-then-disconnect is deferred; design so it can be added later.)
- **Connection indicators:** show which venues are currently connected via red/green lights, with separate indicators for order entry and market data. These can live in the global status area.
- **Layout:** prototyping the placement of components is expected. Prefer a simple initial approach to get version 1 working — place an order, see fills, cancel if necessary — over a complex configurable UI. Design so later versions can add customization (placement, sizing) without breaking existing functionality.
- **Light/dark mode:** the user can switch between light and dark themes.

## Deferred to later versions (do not design out)

State these as explicit non-goals for phase 1, structured so they can be added without breaking existing functionality:

- Multiple market data and/or order routing sessions active together; multiple venues.
- More than one price grid displayed at a time.
- Cancel/replace workflow.
- Multi-leg products (and any non-simple average fill price logic).
- Configurable / resizable component layout.
- Additional order ticket fields (time in force, notes, stop price levels, etc.).
- Auto-cancel of all working orders on disconnect.

## Open considerations for phase 1

- What other functions and features may be needed to make a simple version 1 work? Flag anything discovered during implementation.
- **Performance:** prioritize responsiveness to the user over back-end updates. If there are many market data updates the system must not freeze or prevent the user from taking other actions. No specific throughput targets beyond the ≤10 updates/sec, ≤1000 orders envelope noted above.
