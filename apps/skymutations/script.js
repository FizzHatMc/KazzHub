let mutations = [];
let activeRecipeOverrides = {};
let scale = 1;
let panning = false;
let pointX = 0;
let pointY = 0;
let startX = 0;
let startY = 0;
let setTransform;
let currentTreeContext = null;

function unlockAll(){
  for(i=0;i<10;i++){
    for(j=0;j<10;j++){
      setGridState(i,j,true);
    }
  }
}

/**
 * Sets the state of a specific grid cell using X/Y coordinates.
 * @param {Number} x - The column (0-9).
 * @param {Number} y - The row (0-9).
 * @param {Boolean} isOpen - true = Green (Open), false = Red (Locked).
 */
function setGridState(x, y, isOpen) {
  // 1. Calculate the linear index (0-99)
  // Formula: Index = (Row * 10) + Column
  const index = (y * 10) + x;

  // 2. Find the cell
  const gridCells = document.querySelectorAll('#layoutGrid .grid-cell');
  if (!gridCells || !gridCells[index]) {
    console.warn(`Grid cell not found for coordinates (${x}, ${y}) -> Index ${index}`);
    return;
  }

  const cell = gridCells[index];

  // 3. Apply the state
  // We remove both classes first to be clean, then add the correct one.
  cell.classList.remove('locked', 'open');

  if (isOpen) {
    cell.classList.add('open');
    cell.innerText = ''; // Clear 'X'
  } else {
    cell.classList.add('locked');
    cell.innerText = 'X';
  }
}

/**
 * HELPER: Clears the entire grid (sets all to Locked).
 */
function resetGrid() {
  const gridCells = document.querySelectorAll('#layoutGrid .grid-cell');
  gridCells.forEach(cell => {
    cell.classList.remove('open', 'mutation-spot', 'ingredient-spot');
    cell.classList.add('locked');
    cell.innerText = 'X';
    // Remove any leftover images
    const img = cell.querySelector('img');
    if (img) img.remove();
  });
}

function selectMutations(items, clearExisting = true) {
  // 1. Clear existing selections if requested
  if (clearExisting) {
    const allCheckboxes = document.querySelectorAll('.item-row input[type="checkbox"]');
    allCheckboxes.forEach(cb => {
      if (cb.checked) {
        cb.checked = false;
        // Reset the input state using your existing helper
        if (typeof toggleQty === "function") toggleQty(cb);
      }
    });
  }

  // 2. Iterate through the requested items
  items.forEach(target => {
    // Handle both object format {id: "x", quantity: 5} and simple string format "x"
    const targetId = target.id || target;
    const targetQty = target.quantity || 1;

    // Find the DOM elements
    const checkbox = document.getElementById("item-" + targetId);
    const qtyInput = document.getElementById("qty-" + targetId);

    if (checkbox && qtyInput) {
      // Check the box
      checkbox.checked = true;

      // Enable the input (calls your existing logic)
      if (typeof toggleQty === "function") {
        toggleQty(checkbox);
      } else {
        qtyInput.disabled = false;
      }

      // Set the quantity
      qtyInput.value = targetQty;
    } else {
      console.warn(`Could not find mutation with ID: ${targetId}`);
    }
  });

  // 3. Refresh the Display Logic
  // This calls your main function that reads the checkboxes and updates the results
  if (typeof getSelectedItems === "function") {
    getSelectedItems();
  }
}

function getSelectedItems() {
  const checkedBoxes = document.querySelectorAll('.item-row input[type="checkbox"]:checked');
  const listItems = [];

  checkedBoxes.forEach(checkbox => {
    const cleanId = checkbox.id.replace('item-', '');
    const row = checkbox.closest('.item-row');
    const qtyInput = row.querySelector('.qty-input');
    const quantity = parseInt(qtyInput.value) || 1;

    // Find based on String ID
    const originalItem = mutations.find(item => item.id === cleanId);

    if (!originalItem) return;

    listItems.push({
      name: originalItem.name,
      id: originalItem.id,
      timesToCraftMin: quantity,
      timesToCraftMax: quantity,
      color: originalItem.color,
      textColor: originalItem.text,
      quantity: quantity
    });
  });

  const displayContainer = document.getElementById('itemListDisplay');
  displayContainer.innerHTML = "";
  let htmlString = "";

  listItems.forEach((entry) => {
    const itemClasses = `${entry.color || ''} ${entry.textColor || ''}`;

    htmlString += `
    <p class="result-row"
       data-name="${entry.name}"
       data-id="${entry.id}"
       data-quantity="${entry.quantity}">

      <span class="${itemClasses}" style="padding: 2px 6px; border-radius: 4px;">
        ${entry.name}
      </span>
      | Ratio: ${entry.quantity}
    </p>`;
  });

  displayContainer.innerHTML = htmlString;
  return listItems;
}

document.addEventListener('DOMContentLoaded', async function () {

  try {
    // Ensure this path matches exactly where your file is
    const response = await fetch('data/mutations.json');

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    mutations = await response.json();
    console.log("Data loaded successfully:", mutations.length, "items.");

    // Once data is loaded, render the sidebar list
    renderList();

  } catch (error) {
    console.error("Failed to load inventory data:", error);
    alert("Error loading data. Check console. (Note: You must use a Local Server to fetch JSON files due to CORS)");
    return; // Stop execution if data fails
  }
  /*
  // Load Data
  if (typeof MUTATIONS !== 'undefined') {
    mutations = MUTATIONS;
    console.log("Data loaded successfully:", mutations.length, "items.");
    renderList();
  } else {
    console.error("Data source missing. Make sure mutations.js is linked in HTML.");
  }

   */

  // Pan & Zoom Logic
  const viewport = document.getElementById('panZoomViewport');
  const zoomLayer = document.getElementById('tree-display');
  const displayContainer = document.getElementById('itemListDisplay');

  if (zoomLayer) {
    setTransform = function () {
      zoomLayer.style.transform = `translate(${pointX}px, ${pointY}px) scale(${scale})`;
    };
  }

  if (viewport && zoomLayer) {
    viewport.onmousedown = function (e) {
      e.preventDefault();
      startX = e.clientX - pointX;
      startY = e.clientY - pointY;
      panning = true;
      viewport.style.cursor = 'grabbing';
    };

    viewport.onmouseup = function (e) {
      panning = false;
      viewport.style.cursor = 'grab';
    };

    viewport.onmouseleave = function (e) {
      panning = false;
      viewport.style.cursor = 'grab';
    };

    viewport.onmousemove = function (e) {
      e.preventDefault();
      if (!panning) return;
      pointX = e.clientX - startX;
      pointY = e.clientY - startY;
      setTransform();
    };

    viewport.onwheel = function (e) {
      e.preventDefault();
      const delta = -e.deltaY;
      (delta > 0) ? (scale *= 1.1) : (scale /= 1.1);

      const xs = (e.clientX - pointX) / scale;
      const ys = (e.clientY - pointY) / scale;
      pointX = e.clientX - xs * scale;
      pointY = e.clientY - ys * scale;

      setTransform();
    };
  }

  // Click Handler for Tree Generation
  if (displayContainer) {
    displayContainer.addEventListener('click', function (e) {
      const clickedRow = e.target.closest('.result-row');
      if (!clickedRow) return;

      const currentSelected = displayContainer.querySelector('.selected-row');
      if (currentSelected) currentSelected.classList.remove('selected-row');
      clickedRow.classList.add('selected-row');

      const itemId = clickedRow.dataset.id;
      const itemName = clickedRow.dataset.name;
      const qtyNeeded = parseInt(clickedRow.dataset.quantity) || 1;

      // 1. Build Tree
      currentTreeContext = { id: itemId, name: itemName, qty: qtyNeeded };
      console.log(`Generating tree and solving for: ${itemName}`);

      const resultTree = buildRecipeTree(itemId || itemName, qtyNeeded);

      if (zoomLayer) {
        zoomLayer.innerHTML = renderTreeHTML(resultTree);
        scale = 1; pointX = 0; pointY = 0;
        if (typeof setTransform === 'function') setTransform();
      }

      // ---------------------------------------------
      // 2. TRIGGER SOLVER
      // ---------------------------------------------
      const fullItemData = mutations.find(i => i.id === itemId || i.name === itemName);

      // Get current Grid State (true = open/green, false = locked/red)
      const gridCells = document.querySelectorAll('#layoutGrid .grid-cell');
      const gridState = Array.from(gridCells).map(cell => cell.classList.contains('open'));

      // Run Solver
      const solution = runSolver(fullItemData, gridState);

      // Render Results on Grid
      renderSolverResults(solution, gridCells);
    });
  }
  initLayoutGrid();
});

function renderList() {
  const listContainer = document.getElementById("itemList");
  listContainer.innerHTML = "";

  mutations.forEach(item => {
    if(item.type === "base") return;

    const row = document.createElement("div");
    row.className = "item-row";
    // Flexbox ensures items align vertically in the center
    row.style.display = "flex";
    row.style.alignItems = "center";
    row.style.gap = "8px"; // Spacing between elements

    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.id = "item-" + item.id;
    checkbox.onchange = function () { toggleQty(this); };

    const img = document.createElement("img");
    // Use item.image if present, else generate path from name
    img.src = item.image ? item.image : `assets/images/${item.name.toLowerCase().replace(/\s/g, '_')}.png`;
    img.alt = item.name;
    img.style.width = "24px";
    img.style.height = "24px";
    img.style.objectFit = "contain";
    img.style.borderRadius = "2px";
    // Hide image if it fails to load
    img.onerror = function() { this.style.display = 'none'; };
    // -----------------------

    const label = document.createElement("label");
    label.htmlFor = "item-" + item.id;
    label.className = "item-label";
    label.innerText = item.name;
    // Make label take up remaining space so text aligns left
    label.style.flexGrow = "1";

    if (item.rarity) label.classList.add("rarity-" + item.rarity);

    const qty = document.createElement("input");
    qty.type = "number";
    qty.id = "qty-" + item.id;
    qty.className = "qty-input";
    qty.value = 1;
    qty.min = 1;
    qty.disabled = true;
    qty.style.width = "50px"; // Ensure input doesn't get too wide

    // Append in order: Checkbox -> Image -> Label -> Quantity
    row.appendChild(checkbox);
    row.appendChild(img);
    row.appendChild(label);
    row.appendChild(qty);

    listContainer.appendChild(row);
  });
}

function filterItems() {
  var input, filter, list, items, label, i, txtValue;
  input = document.getElementById("searchInput");
  filter = input.value.toUpperCase();
  list = document.getElementById("itemList");
  items = list.getElementsByClassName("item-row");

  for (i = 0; i < items.length; i++) {
    label = items[i].getElementsByTagName("label")[0];
    txtValue = label.textContent || label.innerText;
    if (txtValue.toUpperCase().indexOf(filter) > -1) {
      items[i].style.display = "";
    } else {
      items[i].style.display = "none";
    }
  }
}

function toggleQty(checkbox) {
  var qtyInput = checkbox.parentNode.querySelector('input[type="number"]');
  if (checkbox.checked) {
    qtyInput.disabled = false;
    qtyInput.focus();
  } else {
    qtyInput.disabled = true;
  }
}

/**
 * Recursive function to build tree data.
 * FIXED: Specifically handles your JSON structure where requirements only have 'id'.
 */
function buildRecipeTree(identifier, qtyNeeded = 1) {
  // Find item by ID (preferred) or Name
  const item = mutations.find(i => String(i.id) === String(identifier) || i.name === identifier);

  if (!item) {
    return {
      name: identifier || "Unknown",
      id: identifier,
      quantity: qtyNeeded,
      image: null,
      rarityClass: 'rarity-common', // Default fallback
      ingredients: []
    };
  }

  const children = [];

  if (item.requirements && item.requirements.length > 0) {
    item.requirements.forEach(req => {
      // FIX: Use req.id first. This solves the "undefined" bug.
      const childId = req.id || req.name;
      const childQty = req.amount; // Static quantity

      if (childId) {
        children.push(buildRecipeTree(childId, childQty));
      }
    });
  }

  return {
    name: item.name,
    id: item.id,
    quantity: qtyNeeded,
    image: item.image ? item.image : `assets/images/${item.name.toLowerCase().replace(' ', '_')}.png`,
    rarityClass: item.rarity ? "rarity-" + item.rarity : "rarity-common",
    ingredients: children
  };
}

function renderTreeHTML(node) {
  if (!node) return '';

  // 1. Image
  // Using the 'tree-icon' class from your CSS
  const imgHtml = `
    <img src="${node.image}"
         alt="${node.name}"
         class="tree-icon"
         onerror="this.style.display='none'">`;

  // 2. The Node HTML
  // We apply the rarity class (e.g., rarity-legendary) to the name
  let html = `
    <div class="tree-node">
      <div class="node-content">
        ${imgHtml}
        <div class="item-name ${node.rarityClass}">${node.name}</div>
        <div class="item-qty">x${node.quantity.toLocaleString()}</div>
      </div>
  `;

  // 3. Children
  if (node.ingredients && node.ingredients.length > 0) {
    html += '<div class="children-container">';
    node.ingredients.forEach(child => {
      html += renderTreeHTML(child);
    });
    html += '</div>';
  }

  html += '</div>';
  return html;
}

function renderMaterialSummary(selectedItems) {
  const totals = {};

  function decompose(itemName, qtyNeeded) {
    if (!qtyNeeded || isNaN(qtyNeeded)) qtyNeeded = 0;
    const cleanName = itemName.trim();
    const item = mutations.find(i => i.name.trim() === cleanName);

    // Base Case: Item not found OR No recipes -> Base Material
    if (!item || !item.recipe || item.recipe.length === 0) {
      if (!totals[cleanName]) totals[cleanName] = 0;
      totals[cleanName] += qtyNeeded;
      return;
    }

    // Recursive Step
    const recipeIndex = activeRecipeOverrides[item.name] || 0;
    const recipe = item.recipe[recipeIndex];
    const gives = recipe.gives ? parseInt(recipe.gives) : 1;
    const craftsRequired = Math.ceil(qtyNeeded / gives);

    for (const [ingName, ingQtyStr] of Object.entries(recipe)) {
      if (ingName === 'gives') continue;
      const amountPerCraft = parseInt(ingQtyStr);
      const totalIngNeeded = amountPerCraft * craftsRequired;
      decompose(ingName, totalIngNeeded);
    }
  }

  selectedItems.forEach(entry => {
    decompose(entry.name, entry.quantity);
  });

  const resultsDiv = document.querySelector('.results-panel');
  // Check if summary box exists, if not create it inside results-panel
  let summaryBox = document.getElementById('base-materials-summary');
  if (!summaryBox) {
    summaryBox = document.createElement('div');
    summaryBox.id = 'base-materials-summary';
    summaryBox.style.marginTop = "20px";
    summaryBox.style.paddingTop = "20px";
    summaryBox.style.borderTop = "1px solid #444";
    resultsDiv.appendChild(summaryBox);
  }

  let html = `<h3 style="margin-bottom:15px; color:#fff;">Total Base Resources</h3>`;
  html += `<div style="display: grid; grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)); gap: 10px;">`;

  const sortedMaterials = Object.keys(totals).sort();

  if (sortedMaterials.length === 0) {
    html += `<p style="color: #888;">No base resources found.</p>`;
  } else {
    sortedMaterials.forEach(matName => {
      html += `
          <div style="background: #161b22; padding: 10px; border-radius: 6px; border: 1px solid #30363d; display: flex; justify-content: space-between; align-items:center;">
             <span style="font-size:0.9rem; color:#c9d1d9;">${matName}</span>
             <span style="color: #3b82f6; font-weight: bold; font-family: monospace; font-size:1rem;">x${totals[matName].toLocaleString()}</span>
          </div>`;
    });
  }

  html += `</div>`;
  summaryBox.innerHTML = html;
}

function updateRecipeSelectors(selectedItems) {
  const container = document.getElementById('recipe-variant-container');
  if (!container) return;

  const itemsWithMultipleRecipes = new Set();
  const processed = new Set();

  function scanRecipes(itemName) {
    if (processed.has(itemName)) return;
    processed.add(itemName);

    const item = mutations.find(i => i.name === itemName);
    if (!item || !item.recipe) return;

    if (item.recipe.length > 1) {
      itemsWithMultipleRecipes.add(item.name);
    }

    const activeIndex = activeRecipeOverrides[item.name] || 0;
    const activeRecipe = item.recipe[activeIndex];

    if(activeRecipe) {
      Object.keys(activeRecipe).forEach(key => {
        if (key !== 'gives') scanRecipes(key);
      });
    }
  }

  selectedItems.forEach(entry => scanRecipes(entry.name));

  container.innerHTML = "";

  if (itemsWithMultipleRecipes.size === 0) return;

  itemsWithMultipleRecipes.forEach(itemName => {
    const itemData = mutations.find(i => i.name === itemName);
    const currentIndex = activeRecipeOverrides[itemName] || 0;

    const card = document.createElement('div');
    card.className = 'variant-card';

    let html = `<div class="variant-title">Select Recipe: ${itemName}</div>`;

    itemData.recipe.forEach((recipe, index) => {
      const isSelected = index === currentIndex;
      const ingredientsList = Object.entries(recipe)
        .filter(([k]) => k !== 'gives')
        .map(([k, v]) => `${v} ${k}`)
        .join(', ');
      const givesAmount = recipe.gives || 1;

      html += `
        <div class="recipe-option ${isSelected ? 'active-recipe' : ''}"
             onclick="selectRecipe('${itemName}', ${index})">
          <div><strong>Option ${index + 1}</strong> (Gives ${givesAmount})</div>
          <div class="recipe-details">${ingredientsList}</div>
        </div>`;
    });

    card.innerHTML = html;
    container.appendChild(card);
  });
}

window.selectRecipe = function (itemName, index) {
  console.log(`Switched ${itemName} to recipe option ${index}`);
  activeRecipeOverrides[itemName] = index;

  // Recalculate everything
  getSelectedItems();

  // If a tree is open, refresh it
  if (currentTreeContext) {
    const zoomLayer = document.getElementById('tree-display');
    if (zoomLayer) {
      const newTree = buildRecipeTree(currentTreeContext.name, currentTreeContext.qty);
      zoomLayer.innerHTML = renderTreeHTML(newTree);
      // We do NOT reset pan/zoom here so the user context stays stable
    }
  }
};

window.onclick = function (event) {
  if (!event.target.matches('.drop-btn') && !event.target.closest('.dropdown-content')) {
    var dropdowns = document.getElementsByClassName("dropdown-content");
    for (var i = 0; i < dropdowns.length; i++) {
      var openDropdown = dropdowns[i];
      if (openDropdown.classList.contains('show')) {
        openDropdown.classList.remove('show');
      }
    }
  }
}

function toggleDropdown() {
  document.getElementById("myDropdown").classList.toggle("show");
}


function initLayoutGrid() {
  const gridContainer = document.getElementById('layoutGrid');
  if (!gridContainer) return;

  gridContainer.innerHTML = ''; // Clear any existing content

  // Create 100 Cells (10x10)
  for (let i = 0; i < 100; i++) {
    const cell = document.createElement('div');

    // Default State: Locked
    cell.classList.add('grid-cell', 'locked');
    cell.innerText = 'X';
    cell.dataset.index = i; // Store index if you need to save logic later

    // Click Event
    cell.addEventListener('click', function() {
      toggleGridCell(this);
    });

    gridContainer.appendChild(cell);
  }
}

function toggleGridCell(cell) {
  if (cell.classList.contains('locked')) {
    // Switch to OPEN
    cell.classList.remove('locked');
    cell.classList.add('open');
    cell.innerText = ''; // Clear the X
  } else {
    // Switch back to LOCKED
    cell.classList.remove('open');
    cell.classList.add('locked');
    cell.innerText = 'X';
  }
}

/* =========================================
   SOLVER LOGIC INTEGRATION
   Adapted from mutationsSolver.js
   ========================================= */

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
  // ADAPTATION: Use global 'mutations' instead of INITIAL_DATA import
  const INITIAL_DATA = mutations;

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

    if (emptyN.length === 0) return null;

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

    for (const s of currentSpots) {
      const sIndices = getCropIndices(s, mSize);
      if (indices.some(i => sIndices.includes(i))) return false;
    }

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

// Main function to call
const runSolver = (selectedMutation, gridState) => {
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

  if (unlockedIndices.length <= 30 && mSize === 1) {
    return solveExact(unlockedIndices, reqList, totalReq, mSize, gridState);
  } else {
    return solveHeuristic(unlockedIndices, reqList, totalReq, mSize, gridState);
  }
};

function renderSolverResults(solution, gridCells) {
  // 1. Reset Grid (Clear previous results but keep Open/Locked state)
  gridCells.forEach(cell => {
    // Reset styling classes
    cell.classList.remove('mutation-spot', 'ingredient-spot');
    // Remove images
    const img = cell.querySelector('img');
    if (img) img.remove();

    // Restore text content based on state
    if (cell.classList.contains('locked')) {
      cell.innerText = 'X';
    } else {
      cell.innerText = '';
    }
  });

  if (!solution || !solution.spots) return;

  // 2. Draw Mutation Spots (The main crops)
  solution.spots.forEach(index => {
    if (gridCells[index]) {
      const cell = gridCells[index];
      cell.classList.add('mutation-spot');
      cell.innerText = 'M'; // Or use an icon
    }
  });

  // 3. Draw Ingredients (The surrounding crops)
  // solution.layout is an object: { index: itemDataObject, ... }
  Object.keys(solution.layout).forEach(index => {
    if (gridCells[index]) {
      const cell = gridCells[index];
      const item = solution.layout[index];

      cell.classList.add('ingredient-spot');
      cell.innerText = ''; // Clear text to show image

      // Create Image
      const img = document.createElement('img');
      img.src = item.image ? item.image : `assets/images/${item.name.toLowerCase().replace(/\s/g, '_')}.png`;
      img.onerror = function() { this.style.display = 'none'; this.parentNode.innerText = item.abbr || item.name.substring(0,2); };
      cell.appendChild(img);
    }
  });
}
