// Compatibility entry point: free-print and standalone studio now share the same
// 3D workspace. The shared check covers PETG locking, failure/cancel/reload recovery,
// model transforms/layout, true 3D G-code, project roundtrips, and responsive UI.
// REAL_SLICE=1 uses a real locally configured Orca worker, never a deployed service.
process.env.BASE_URL ||= "http://127.0.0.1:8798";
require("./check-slicer-studio.cjs");
