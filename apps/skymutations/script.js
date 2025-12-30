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
      <span style="opacity: 0.7; font-size: 0.9em;">
       | Ratio: ${entry.quantity} | Amount: <span class="calc-amount" data-id="${entry.id}">0</span>
      </span>
    </p>`;
  });

  displayContainer.innerHTML = htmlString;
  return listItems;
}

function toggleHelp() {
  const overlay = document.getElementById('welcome-message');
  if (overlay) {
    overlay.classList.toggle('hidden');
  }
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

  if (displayContainer) {
    displayContainer.addEventListener('click', function (e) {
      const clickedRow = e.target.closest('.result-row');
      if (!clickedRow) return;


      const welcomeMsg = document.getElementById('welcome-message');
      if (welcomeMsg && !welcomeMsg.classList.contains('hidden')) {
        welcomeMsg.classList.add('hidden');
      }
      // 1. Visual Select Highlight
      const currentSelected = displayContainer.querySelector('.selected-row');
      if (currentSelected) currentSelected.classList.remove('selected-row');
      clickedRow.classList.add('selected-row');

      // 2. Tree Logic (Standard)
      const itemId = clickedRow.dataset.id;
      const itemName = clickedRow.dataset.name;
      const qtyNeeded = parseInt(clickedRow.dataset.quantity) || 1;

      currentTreeContext = { id: itemId, name: itemName, qty: qtyNeeded };
      const resultTree = buildRecipeTree(itemId || itemName, qtyNeeded);

      if (zoomLayer) {
        zoomLayer.innerHTML = renderTreeHTML(resultTree);
      }

      // ---------------------------------------------
      // 3. SOLVER LOGIC (Best of 5 + Count Update)
      // ---------------------------------------------
      const isMultiMode = document.getElementById('mode-multiple').checked;

      // Get Grid State
      const gridCells = document.querySelectorAll('#layoutGrid .grid-cell');
      const gridState = Array.from(gridCells).map(cell => cell.classList.contains('open'));

      let solution;
      let selectionList = [];

      // Prepare Data
      if (isMultiMode) {
        const selectedItems = getSelectedItems();
        selectionList = selectedItems.map(s => {
          const fullItem = mutations.find(m => m.id === s.id);
          return { item: fullItem, ratio: s.quantity, id: s.id };
        });
      } else {
        const fullItemData = mutations.find(i => i.id === itemId || i.name === itemName);
        selectionList = [{ item: fullItemData, ratio: 1, id: fullItemData.id }];
      }

      // RUN SOLVER (5 Times)
      console.log("Running Best-of-5 Solver...");
      solution = runSolverBestOf(5, selectionList, gridState);

      // Render Grid
      renderSolverResults(solution, gridCells);

      // ---------------------------------------------
      // 4. UPDATE SIDEBAR COUNTS
      // ---------------------------------------------
      // Reset all counts to 0 first
      const allAmountSpans = displayContainer.querySelectorAll('.calc-amount');
      allAmountSpans.forEach(span => span.innerText = "0");

      if (solution && solution.placements) {
        // Count placements: { "choconut": 12, "wheat": 5 }
        const counts = {};
        solution.placements.forEach(p => {
          const id = p.item.id;
          counts[id] = (counts[id] || 0) + 1;
        });

        // Update HTML
        Object.keys(counts).forEach(id => {
          // Find the specific span for this ID
          const targetSpan = displayContainer.querySelector(`.calc-amount[data-id="${id}"]`);
          if (targetSpan) {
            targetSpan.innerText = counts[id];
            // Optional: Make it bold/green to pop
            targetSpan.style.fontWeight = "bold";
            targetSpan.style.color = "#4ade80";
          }
        });
      }
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
   SOLVER LOGIC: ATOMIC PLACEMENT (Guaranteed Stability)
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

/* --- ATOMIC SOLVER ---
   Places Mutation + Ingredients in one step.
*/
const runMultiSolver = (selectionList, gridState) => {
  const INITIAL_DATA = mutations; // Access global data

  // 1. Setup Result Container
  let bestScore = -1;
  let bestResult = { placements: [], layout: {} };

  // 2. Prepare Targets
  const totalRatio = selectionList.reduce((acc, cur) => acc + cur.ratio, 0);
  const normalizedTargets = selectionList.map(s => ({
    ...s,
    weight: s.ratio / totalRatio,
    placedCount: 0
  }));

  const ATTEMPTS = 100; // High speed iterations

  for (let run = 0; run < ATTEMPTS; run++) {
    // Current Run State
    let currentPlacements = []; // [{index, item}]
    let currentLayout = {};     // {index: IngredientItem}
    let placedCounts = selectionList.map(() => 0);

    // Occupied Set (Tracks both Mutations AND Ingredients)
    let occupied = new Set();
    gridState.forEach((isOpen, idx) => { if(!isOpen) occupied.add(idx); }); // Add locked cells

    // Shuffle Grid Start Positions
    let openCells = gridState.map((isOpen, idx) => isOpen ? idx : -1).filter(i => i !== -1);
    openCells.sort(() => Math.random() - 0.5);

    // --- PLACEMENT LOOP ---
    for (const cellIndex of openCells) {
      if (occupied.has(cellIndex)) continue; // Skip if already taken by previous placement

      const totalPlaced = currentPlacements.length || 1;

      // Prioritize items that are "behind" on their ratio
      const candidates = selectionList.map((s, i) => ({
        id: i,
        item: s.item,
        deficit: (placedCounts[i] / totalPlaced) - normalizedTargets[i].weight
      }));

      candidates.sort((a, b) => a.deficit - b.deficit); // Highest deficit first

      // Try candidates in order
      for (const candidate of candidates) {
        const item = candidate.item;
        const mSize = item.size || 1;
        const indices = getCropIndices(cellIndex, mSize);

        // A. Basic Space Check (For the Mutation itself)
        if (!indices) continue; // Bounds check
        if (indices.some(idx => occupied.has(idx))) continue; // Overlap check

        // B. Atomic Ingredient Check (Can we satisfy needs RIGHT NOW?)
        // Calculate raw needs
        const requiredIngredients = [];
        if (item.requirements) {
          item.requirements.forEach(req => {
            for(let k=0; k<req.amount; k++) requiredIngredients.push(req.id);
          });
        }

        // If no requirements, easy placement
        if (requiredIngredients.length === 0) {
          // Success! Place it.
          indices.forEach(idx => occupied.add(idx));
          currentPlacements.push({ index: cellIndex, item: item });
          placedCounts[candidate.id]++;
          break; // Move to next cell
        }

        // C. Check Neighbors for Ingredients
        const neighbors = getRingNeighbors(cellIndex, mSize);
        const validNeighbors = neighbors.filter(n => gridState[n] && !indices.includes(n)); // Exclude self

        // We need to match requirements to neighbors.
        // 1. Use Existing: Check if a neighbor ALREADY has the needed ingredient.
        // 2. Place New: Use an empty neighbor.

        let satisfiedCount = 0;
        let spotsToFill = []; // { index: 55, itemId: "wheat" }

        // Clone needs so we can tick them off
        let pendingNeeds = [...requiredIngredients];

        // Step C1: Check Existing Layout
        for (const nIdx of validNeighbors) {
          if (currentLayout[nIdx]) {
            const existingId = currentLayout[nIdx].id;
            const needIdx = pendingNeeds.indexOf(existingId);
            if (needIdx > -1) {
              pendingNeeds.splice(needIdx, 1); // Satisfied by existing!
            }
          }
        }

        // Step C2: Fill Empty Spots
        if (pendingNeeds.length > 0) {
          // Find empty valid neighbors
          const emptyNeighbors = validNeighbors.filter(n => !occupied.has(n));

          if (emptyNeighbors.length >= pendingNeeds.length) {
            // We have enough space! Assign them.
            for (let i = 0; i < pendingNeeds.length; i++) {
              spotsToFill.push({ index: emptyNeighbors[i], itemId: pendingNeeds[i] });
            }
            pendingNeeds = []; // All accounted for
          }
        }

        // D. Final Decision
        if (pendingNeeds.length === 0) {
          // SUCCESS - COMMIT EVERYTHING

          // 1. Mark Mutation Spots
          indices.forEach(idx => occupied.add(idx));
          currentPlacements.push({ index: cellIndex, item: item });
          placedCounts[candidate.id]++;

          // 2. Mark Ingredient Spots
          spotsToFill.forEach(fill => {
            occupied.add(fill.index);
            const ingData = INITIAL_DATA.find(d => d.id === fill.itemId);
            if (ingData) {
              currentLayout[fill.index] = ingData;
            }
          });

          break; // Success, stop checking candidates for this cell
        }
      }
    }

    // End of Run - Check Score
    if (currentPlacements.length > bestScore) {
      bestScore = currentPlacements.length;
      bestResult = { placements: [...currentPlacements], layout: {...currentLayout} };
    }
  }

  return bestResult;
};

/* --- RENDERER (Ensure this matches your latest version) --- */
function renderSolverResults(solution, gridCells) {
  // 1. Reset Grid
  gridCells.forEach(cell => {
    cell.classList.remove('mutation-spot', 'ingredient-spot');
    const img = cell.querySelector('img');
    if (img) img.remove();
    cell.innerText = cell.classList.contains('locked') ? 'X' : '';
  });

  if (!solution || !solution.placements || solution.placements.length === 0) {
    console.warn("Solver: No layout generated.");
    return;
  }

  // 2. Draw Mutation Spots
  solution.placements.forEach(obj => {
    const mSize = obj.item.size || 1;
    const indices = getCropIndices(obj.index, mSize);
    if (!indices) return;

    indices.forEach(idx => {
      if (gridCells[idx]) {
        const cell = gridCells[idx];
        cell.classList.add('mutation-spot');
        cell.innerText = '';

        // Add Image
        const img = document.createElement('img');
        img.src = obj.item.image ? obj.item.image : `assets/images/${obj.item.name.toLowerCase().replace(/\s/g, '_')}.png`;
        img.onerror = function() { this.style.display = 'none'; this.parentNode.innerText = 'M'; };
        cell.appendChild(img);
      }
    });
  });

  // 3. Draw Ingredients
  Object.keys(solution.layout).forEach(key => {
    const index = parseInt(key); // Fix string key
    if (gridCells[index]) {
      const cell = gridCells[index];
      const item = solution.layout[key];

      cell.classList.add('ingredient-spot');
      cell.innerText = '';

      const img = document.createElement('img');
      img.src = item.image ? item.image : `assets/images/${item.name.toLowerCase().replace(/\s/g, '_')}.png`;
      img.onerror = function() { this.style.display = 'none'; this.parentNode.innerText = item.abbr || 'Ing'; };
      cell.appendChild(img);
    }
  });
}

function runSolverBestOf(attempts, selectionList, gridState) {
  let bestGlobalScore = -1;
  let bestGlobalResult = { placements: [], layout: {} };

  for (let i = 0; i < attempts; i++) {
    // Run the solver (which already does 100 internal attempts, so this is very thorough)
    const result = runMultiSolver(selectionList, gridState);

    if (result && result.placements.length > bestGlobalScore) {
      bestGlobalScore = result.placements.length;
      bestGlobalResult = result;
    }
  }

  return bestGlobalResult;
}
