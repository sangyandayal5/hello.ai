This directory contains tests built with Vitest.

Notes:
- The suite includes meta-tests for vitest.config.ts validating both static markers and dynamic configuration shape.
- Tests avoid introducing new dependencies and follow Vitest's built-in expect API.
- Environment-sensitive options are checked with NODE_ENV and CI toggles, restoring env after each case.