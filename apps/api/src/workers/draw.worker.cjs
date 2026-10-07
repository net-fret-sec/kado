const { parentPort, workerData } = require("node:worker_threads");
const { solveDraw } = require("./solver.cjs");
try {
  parentPort.postMessage({ assignments: solveDraw(...workerData) });
} catch (e) {
  parentPort.postMessage({
    error:
      e.message === "DRAW_COMPUTATION_LIMIT"
        ? e.message
        : "INTERNAL_SERVER_ERROR",
  });
}
