// Import all workflow definitions to register them with the singleton registry.
// Each file calls defineWorkflow() as a side effect.
import './ops/data-quality-check.js';
import './projects/weekly-status-digest.js';
import './projects/stale-review.js';
