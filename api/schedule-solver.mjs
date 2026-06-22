import solver from "javascript-lp-solver";

function valueOf(result, variable) {
  return Number(result?.[variable] || 0);
}

function objectiveCost({ objective, candidate, slot, durationMinutes, dueRank, priorityRank, isDueRisk }) {
  const slotWait = slot * Math.max(30, durationMinutes + 20);
  if (objective === "changeover-min") {
    return candidate.score + candidate.changeCost * 9 + slotWait * 0.45 + priorityRank * 25 + dueRank * 0.4;
  }
  if (objective === "due-risk") {
    return candidate.score + dueRank * 2 + priorityRank * 90 + slotWait * (isDueRisk ? 1.4 : 0.7) + candidate.changeCost * 2;
  }
  return candidate.score + slotWait + candidate.changeCost * 4 + priorityRank * 45 + dueRank;
}

export function solveScheduleAssignments({ jobs, printers, options, scoreCandidate, durationOf, dueRankOf, priorityRankOf, isDueRisk, isHardBlocked }) {
  const objective = options.objective || "balanced-cost";
  const variables = {};
  const ints = {};
  const constraints = {};
  const refs = new Map();
  const skipped = [];
  const slotsPerPrinter = Math.max(1, Math.min(Number(options.maxSlotsPerPrinter || jobs.length || 1), jobs.length || 1));

  jobs.forEach((job, jobIndex) => {
    const jobConstraint = `job_${jobIndex}`;
    constraints[jobConstraint] = { equal: 1 };
    let feasible = 0;
    printers.forEach((printer, printerIndex) => {
      const candidate = scoreCandidate(job, printer);
      const hardBlocked = isHardBlocked(job, printer, candidate.warnings || []);
      if (hardBlocked) return;
      const durationMinutes = durationOf(job);
      const dueRank = dueRankOf(job);
      const priorityRank = priorityRankOf(job);
      for (let slot = 0; slot < slotsPerPrinter; slot += 1) {
        const slotConstraint = `printer_${printerIndex}_slot_${slot}`;
        constraints[slotConstraint] ||= { max: 1 };
        const variable = `x_${jobIndex}_${printerIndex}_${slot}`;
        variables[variable] = {
          cost: objectiveCost({ objective, candidate, slot, durationMinutes, dueRank, priorityRank, isDueRisk: isDueRisk(job) }),
          [jobConstraint]: 1,
          [slotConstraint]: 1
        };
        ints[variable] = 1;
        refs.set(variable, { job, printer, slot, candidate, cost: variables[variable].cost });
        feasible += 1;
      }
    });
    if (!feasible) {
      delete constraints[jobConstraint];
      skipped.push({ jobId: job.id, file: job.file, reason: "No compatible printer for solver constraints" });
    }
  });

  if (!Object.keys(variables).length) {
    return {
      solver: { engine: "javascript-lp-solver", objective, feasible: false, bounded: false, result: 0, variables: 0 },
      assignments: [],
      skipped
    };
  }

  const result = solver.Solve({ optimize: "cost", opType: "min", constraints, variables, ints });
  if (!result.feasible) {
    return {
      solver: { engine: "javascript-lp-solver", objective, feasible: false, bounded: Boolean(result.bounded), result: Number(result.result || 0), variables: Object.keys(variables).length },
      assignments: [],
      skipped: jobs.map((job) => ({ jobId: job.id, file: job.file, reason: "Solver could not find a feasible plan" }))
    };
  }

  const assignments = [...refs.entries()]
    .filter(([variable]) => valueOf(result, variable) > 0.5)
    .map(([variable, ref]) => ({ ...ref, variable }))
    .sort((a, b) => String(a.printer.id).localeCompare(String(b.printer.id)) || a.slot - b.slot);

  return {
    solver: {
      engine: "javascript-lp-solver",
      objective,
      feasible: true,
      bounded: Boolean(result.bounded),
      result: Number(result.result || 0),
      variables: Object.keys(variables).length
    },
    assignments,
    skipped
  };
}
