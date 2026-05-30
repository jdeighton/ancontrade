# CONTEXT.md

## Glossary

### Order Blotter

The grid-based UI panel showing all orders the trader has submitted to venues during the current session — their current state, fill progress, and associated actions (e.g. cancel). Distinct from the exchange-side **Order Book** (resting orders at a venue, defined in the matching engine's domain model).

_Avoid_: order book (for this concept), order grid, order list

### Trader ID

A string identity sent to the venue on every order (FIX tag 50, SenderSubID). The admin layer maintains a roster of Trader IDs, each optionally paired with a **display alias** — a friendly label shown in the UI that never touches the FIX wire. Only one Trader ID is active at a time; it is shown read-only on the order ticket.

The matching engine's domain model calls this concept "Trader" — Trader ID is the trading UI's term, emphasising that it is a simple configurable string rather than a login identity.

_Avoid_: Trader (use Trader ID in this codebase), user, operator

### Status Bar

The always-visible UI panel at the bottom (or top) of the screen. Shows two things: connection status indicators (red/green per Venue, with separate indicators for the market data and order routing Sessions); and non-order-level alerts such as Market Data request rejects and session disconnect events.

_Avoid_: notification area, status panel, global bar

### Client Order ID

A unique identifier assigned by the trading UI to every outbound order and cancel request (FIX tag 11, ClOrdID). Uses a session-based scheme: `<YYYYMMDD-HHMMSS>-<counter>`, where the timestamp is the back end's startup time and the counter increments from 1. Guarantees uniqueness across process restarts without persisted counter state. A new ClOrdID is generated for each Cancel Request (as required by FIX), distinct from the original order's ClOrdID.

_Avoid_: order ID (use Client Order ID for the locally-generated identifier; Exchange Order ID for the venue-assigned one)

### Order Event

A single record in the Order Events panel for a selected order. Covers both outbound messages the system sent (New Order, Cancel Request) and inbound messages received from the venue (Execution Report, Cancel Reject). Each Order Event has a timestamp, direction (Sent / Received), a human-readable event type label, and the key fields relevant to that event type.

### Venue

An admin-configured entity representing one trading destination. Bundles a market data FIX session, an order routing FIX session, a Trader ID, a set of available Accounts, and a friendly display name. Has runtime state (connected or disconnected, with separate indicators for market data and order routing). The user selects a Venue before trading; all orders and subscriptions are scoped to it.

_Avoid_: connection, trading venue (verbose), destination

### Session Config

The stored configuration record for a single FIX connection: host, port, SenderCompID, TargetCompID, and associated settings. Managed in the admin layer. A Venue references two Session Configs — one for market data, one for order routing. At runtime, the FIX engine uses a Session Config to establish and maintain the live Session (the runtime connection object). Matches the `SessionConfig` type in `@fixenginelib/core`.

_Avoid_: FIX session (use Session Config for the config record; Session for the live runtime connection)

### Exchange Order ID

The order identifier assigned by the venue upon acknowledgement of a New Order (FIX tag 37, `OrderID`). Returned in the first Execution Report for a new order. Required in Cancel Requests alongside the Client Order ID. Absent while an order is Pending-New.

_Avoid_: order ID (ambiguous — always qualify as Client Order ID or Exchange Order ID)

### Working Order

An order in `New` or `PartiallyFilled` state — acknowledged by the exchange and still open to further fills or cancellation. The disconnect warning is shown whenever any Working Order (or Pending-New order) exists.

_Avoid_: open order, live order, active order

### Pending-New

A UI-only transient state for an order that has been submitted by the trader but not yet acknowledged by the exchange (no Exchange Order ID received). The cancel button is disabled in this state because there is no Exchange Order ID to reference in a Cancellation Request. Not a matching engine Order State — exists only in the Order Blotter until the first Execution Report arrives.

_Avoid_: in-flight, sent, unacknowledged

### Account

A clearing or margin account reference — a string sent to the venue on every order (FIX tag 1). The admin layer maintains a roster of Accounts, each optionally paired with a **display alias** shown in the UI. A Venue has a set of available Accounts; the trader selects one per order.

Matches the matching engine's "Account" concept. The display alias is a local UI property that never touches the FIX wire.

_Avoid_: client, firm

### Price Ladder

The custom UI component that displays the aggregated Order Book for a selected Instrument. Shows N price levels each side of the spread (default N=5, max N=20): ask levels above (higher prices at top), bid levels below, spread in the middle. Each row shows a single price level with total volume and order count for that side. Empty tick levels within the N-level range are shown with zero values rather than omitted.

_Avoid_: order book (for this component), depth of market, DOM
