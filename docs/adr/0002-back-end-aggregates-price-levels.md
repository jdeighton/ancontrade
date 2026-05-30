# Back end aggregates order-by-order market data into price levels

The back end receives order-by-order Market Data from the venue, maintains full order-by-order book state in memory, and pushes aggregated price-level data (total volume and order count per level) to the browser over WebSocket. The browser never sees raw order-by-order events — it only receives price-level snapshots and updates.

This keeps aggregation logic on the back end where it can be tested as a pure function (order-by-order state → N-level price ladder), and keeps the front end simple. Pushing raw events to the browser and aggregating there would duplicate the logic and make it harder to test.
