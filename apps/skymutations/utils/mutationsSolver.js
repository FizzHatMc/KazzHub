import INITIAL_DATA from '../data/mutations.json';

const getCropIndices = (topLeftIndex, size) => {
  const indices = [];
  const tx = topLeftIndex % 10;
  const ty = Math.floor(topLeftIndex / 10);
  for (let dy = 0; dy < size; dy++) {
    for (let dx = 0; dx < size; dx++) {
      const nx = tx + dx;
      const ny = ty + dy;
      if (nx < 0 || nx > 9 || ny < 0 || ny > 9) return null;
      indices.push(ny * 10 + nx);
    }
  }
  return indices;
};

const getRingNeighbors = (topLeftIndex, size) => {
  const tx = topLeftIndex % 10;
  const ty = Math.floor(topLeftIndex / 10);
  const neighbors = [];
  for (let dy = -1; dy <= size; dy++) {
    for (let dx = -1; dx <= size; dx++) {
      if (dx >= 0 && dx < size && dy >= 0 && dy < size) continue;
      const nx = tx + dx;
      const ny = ty + dy;
      if (nx >= 0 && nx <= 9 && ny >= 0 && ny <= 9) {
        neighbors.push(ny * 10 + nx);
      }
    }
  }
  return neighbors;
};


const fillIngredients = (spots, reqMap, mSize, gridState) => {
  const layout = {};
  const spotNeeds = spots.map(s => ({
    spot: s,
    needs: reqMap.flatMap(r => Array(r.count).fill(r.id))
  }));

  let allSatisfied = false;
  let safety = 0;

  while(!allSatisfied && safety++ < 100) {
    let pendingSpots = spotNeeds.filter(sn => sn.needs.length > 0);

    if (pendingSpots.length === 0) {
      allSatisfied = true;
      break;
    }

    pendingSpots.sort((a,b) => {
      const nA = getRingNeighbors(a.spot, mSize).filter(n => gridState[n] && !layout[n] && !spots.includes(n)).length;
      const nB = getRingNeighbors(b.spot, mSize).filter(n => gridState[n] && !layout[n] && !spots.includes(n)).length;
      return nA - nB;
    });

    const target = pendingSpots[0];
    const neighbors = getRingNeighbors(target.spot, mSize).filter(n => gridState[n] && !spots.includes(n));

    // Update needs based on what's already placed around (Sharing)
    const currentNeeds = reqMap.flatMap(r => Array(r.count).fill(r.id));
    for (const n of neighbors) {
      if (layout[n]) {
        const idx = currentNeeds.indexOf(layout[n].id);
        if (idx > -1) currentNeeds.splice(idx, 1);
      }
    }

    if (currentNeeds.length === 0) {
      target.needs = [];
      continue;
    }

    const nextNeed = currentNeeds[0];
    const emptyN = neighbors.filter(n => !layout[n]);

    if (emptyN.length === 0) return null; // Impossible to fill

    emptyN.sort((a, b) => {
      const utilA = pendingSpots.filter(ps => getRingNeighbors(ps.spot, mSize).includes(a)).length;
      const utilB = pendingSpots.filter(ps => getRingNeighbors(ps.spot, mSize).includes(b)).length;
      return utilB - utilA;
    });

    const bestSlot = emptyN[0];
    layout[bestSlot] = INITIAL_DATA.find(d => d.id === nextNeed);
    target.needs.shift();
  }

  return allSatisfied ? layout : null;
};

const solveExact = (unlockedIndices, reqMap, totalReq, mSize, gridState) => {
  let maxMutations = -1;
  let bestSolution = { spots: [], layout: {} };

  const canBeMutation = (idx, currentSpots) => {
    const indices = getCropIndices(idx, mSize);
    if (!indices) return false;

    // 1. Overlap Check
    for (const s of currentSpots) {
      const sIndices = getCropIndices(s, mSize);
      if (indices.some(i => sIndices.includes(i))) return false;
    }

    // 2. Neighbor Availability Check
    const proposedSpots = [...currentSpots, idx];

    for (const s of proposedSpots) {
      const sNeighbors = getRingNeighbors(s, mSize);
      const availableNeighbors = sNeighbors.filter(n => {
        if (!gridState[n]) return false;
        for (const p of proposedSpots) {
          const pIndices = getCropIndices(p, mSize);
          if (pIndices.includes(n)) return false;
        }
        return true;
      });

      if (availableNeighbors.length < totalReq) return false;
    }

    return true;
  };

  const solve = (candidateIndex, currentSpots) => {
    const remaining = unlockedIndices.length - candidateIndex;
    if (currentSpots.length + remaining <= maxMutations) return;

    if (candidateIndex >= unlockedIndices.length) {
      if (currentSpots.length > maxMutations) {
        const layout = fillIngredients(currentSpots, reqMap, mSize, gridState);
        if (layout) {
          maxMutations = currentSpots.length;
          bestSolution = { spots: [...currentSpots], layout };
        }
      }
      return;
    }

    const spot = unlockedIndices[candidateIndex];

    if (canBeMutation(spot, currentSpots)) {
      currentSpots.push(spot);
      solve(candidateIndex + 1, currentSpots);
      currentSpots.pop();
    }

    solve(candidateIndex + 1, currentSpots);
  };

  solve(0, []);
  return bestSolution;
};

const solveHeuristic = (unlockedIndices, reqList, totalReq, mSize, gridState) => {
  let bestScore = -1;
  let bestRes = { spots: [], layout: {} };

  const ATTEMPTS = 100;
  for(let k=0; k<ATTEMPTS; k++) {
    const shuffled = [...unlockedIndices].sort(() => Math.random() - 0.5);
    const spots = [];

    const canAdd = (idx) => {
      const indices = getCropIndices(idx, mSize);
      if (!indices || indices.some(i => !gridState[i])) return false;

      for(const s of spots) {
        const sIdx = getCropIndices(s, mSize);
        if (indices.some(i => sIdx.includes(i))) return false;
      }

      const neighbors = getRingNeighbors(idx, mSize).filter(n => gridState[n]);
      const validN = neighbors.filter(n => {
        for(const s of [...spots, idx]) {
          if (getCropIndices(s, mSize).includes(n)) return false;
        }
        return true;
      });

      return validN.length >= totalReq;
    };

    for(const i of shuffled) {
      if (canAdd(i)) {
        let breaksOthers = false;
        for(const s of spots) {
          const neighbors = getRingNeighbors(s, mSize).filter(n => gridState[n]);
          const validCount = neighbors.filter(n => {
            const allSpots = [...spots, i];
            for(const m of allSpots) {
              if (getCropIndices(m, mSize).includes(n)) return false;
            }
            return true;
          }).length;

          if (validCount < totalReq) { breaksOthers = true; break; }
        }

        if (!breaksOthers) spots.push(i);
      }
    }

    if (spots.length > bestScore) {
      const layout = fillIngredients(spots, reqList, mSize, gridState);
      if (layout) {
        bestScore = spots.length;
        bestRes = { spots: [...spots], layout };
      }
    }
  }

  return bestRes;
};


export const runSolver = (selectedMutation, gridState) => {
  if (!selectedMutation) return { spots: [], layout: {} };

  const mSize = selectedMutation.size || 1;
  const unlockedIndices = gridState.map((u, i) => u ? i : -1).filter(i => i !== -1);

  const reqList = [];
  if (selectedMutation.requirements) {
    selectedMutation.requirements.forEach(req => {
      reqList.push({ id: req.id, count: req.amount });
    });
  }
  const totalReq = reqList.reduce((a,b)=>a+b.count,0);

  // Selector: Exact or Heuristic
  if (unlockedIndices.length <= 30 && mSize === 1) {
    return solveExact(unlockedIndices, reqList, totalReq, mSize, gridState);
  } else {
    return solveHeuristic(unlockedIndices, reqList, totalReq, mSize, gridState);
  }
};
