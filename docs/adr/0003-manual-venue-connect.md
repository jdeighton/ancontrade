# Venue connections are manually initiated, not auto-connected on startup

The back end does not attempt to connect to configured Venues on startup. The user explicitly connects and disconnects each Venue via the UI. This is a testing tool where the trader needs precise control over when they are live against the matching engine — auto-connecting on startup would create ambiguity about FIX session state (sequence numbers, active subscriptions) between test runs, and would make it harder to reason about what state the system is in when a test begins.
