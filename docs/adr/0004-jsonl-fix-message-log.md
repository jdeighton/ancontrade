# FIX message log uses JSONL with flat tag map, one file per day

The back end writes all inbound and outbound application-layer FIX messages to a daily JSONL file (`logs/YYYY-MM-DD.jsonl`). Each line is a JSON object: `{"ts":"<ISO>","dir":"IN"|"OUT","session":"<sessionId>","fields":{"35":"...", ...}}` where fields is a flat map of FIX tag numbers (string keys) to string values.

This format doubles as the fixture format for tests — synthetic test fixtures are authored in the same JSONL shape, and captured live session data can replace them directly without transformation. One file per day keeps file sizes bounded and makes grepping by date straightforward. Tag numbers as keys match FIX's native representation and are greppable (`"35":"W"` finds all Snapshot Full Refresh messages). The fixserver maintains its own per-session log in a different format for session-layer purposes; this JSONL log is a separate application-level audit of business messages only.
