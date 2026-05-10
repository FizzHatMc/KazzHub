let inventoryData = [];
let minionsData = {};
let minionFuels = {};
let userMinionConfigs = {}; // Store user's minion configurations
let activeRecipeOverrides = {};
let scale = 1;
let panning = false;
let pointX = 0;
let pointY = 0;
let startX = 0;
let startY = 0;
let setTransform;
let currentTreeContext = null;

document.addEventListener('DOMContentLoaded', async function () {

            // --- A. FETCH DATA ---
            try {
              // Ensure this path matches exactly where your file is
              const [response, minionResp, fuelResp] = await Promise.all([
                fetch('../../assets/data.json'),
                fetch('data/minions_data.json'),
                fetch('data/minion_fuels.json')
              ]);

              if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
              if (!minionResp.ok) throw new Error(`HTTP error! status: ${minionResp.status}`);
              if (!fuelResp.ok) throw new Error(`HTTP error! status: ${fuelResp.status}`);

              inventoryData = await response.json();
              minionsData = await minionResp.json();
              minionFuels = await fuelResp.json();
              
              console.log("Data loaded successfully:", inventoryData.length, "items.");
              console.log("Minions loaded:", Object.keys(minionsData).length);

              // Once data is loaded, render the sidebar list
              renderList();

            } catch (error) {
              console.error("Failed to load inventory data:", error);
              alert("Error loading data. Check console. (Note: You must use a Local Server to fetch JSON files due to CORS)");
              return; // Stop execution if data fails
            }

  /*
             // Load Data
                   if (typeof DATA !== 'undefined') {
                     inventoryData = DATA;
                     console.log("Data loaded successfully:", inventoryData.length, "items.");
                     renderList();
                   } else {
                     console.error("Data source missing. Make sure mutations.js is linked in HTML.");
                   }
  */
  // --- B. SETUP UI REFERENCES ---
  const viewport = document.getElementById('panZoomViewport');
  const zoomLayer = document.getElementById('tree-display');
  const displayContainer = document.getElementById('itemListDisplay');

  // --- C. DEFINE TRANSFORM FUNCTION ---
  if (zoomLayer) {
    setTransform = function () {
      zoomLayer.style.transform = `translate(${pointX}px, ${pointY}px) scale(${scale})`;
    };
  }

  // --- D. PAN & ZOOM LISTENERS ---
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

      // Math to zoom towards cursor
      const xs = (e.clientX - pointX) / scale;
      const ys = (e.clientY - pointY) / scale;
      pointX = e.clientX - xs * scale;
      pointY = e.clientY - ys * scale;

      setTransform();
    };
  } else {
    console.warn("Pan/Zoom elements not found in HTML.");
  }
  if (displayContainer) {
    displayContainer.addEventListener('click', function (e) {
      const clickedRow = e.target.closest('.result-row');
      if (!clickedRow) return;

      const currentSelected = displayContainer.querySelector('.selected-row');
      if (currentSelected) currentSelected.classList.remove('selected-row');
      clickedRow.classList.add('selected-row');

      // NEW: Get ID instead of Name
      const itemId = clickedRow.dataset.id;
      const itemName = clickedRow.dataset.name;
      const qtyNeeded = parseInt(clickedRow.dataset.quantity) || 1;

      // Update Context to use ID
      currentTreeContext = { id: itemId, name: itemName, qty: qtyNeeded };
      console.log(`Generating tree for ID: ${itemId}`);

      const resultTree = buildRecipeTree(itemId, qtyNeeded);

      if (zoomLayer) {
        zoomLayer.classList.add('tree-container');
        zoomLayer.innerHTML = renderTreeHTML(resultTree);
        scale = 1;
        pointX = 0;
        pointY = 0;
        if (typeof setTransform === 'function') setTransform();
      }
    });
  }
});

function renderList() {
  const listContainer = document.getElementById("itemList");
  listContainer.innerHTML = "";

  inventoryData.forEach(item => {
    // --- NEW: Skip items with empty/missing recipes ---
    if (!item.recipe || item.recipe.length === 0) return;

    const row = document.createElement("div");
    row.className = "item-row";

    // Normalize Category: "NONE" -> "None", Title Case, etc.
    const rawCat = item.category || "None";
    row.dataset.category = rawCat.toLowerCase() === "none" ? "None" : rawCat;
    row.dataset.rarity = (item.rarity || "common").toLowerCase();

    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.id = "item-" + item.id;
    checkbox.dataset.id = item.id; // Store ID for logic
    checkbox.onchange = function () { toggleQty(this); };

    const img = document.createElement("img");
    img.src = getImagePath(item.name);
    img.className = "item-icon-small";
    img.onerror = function() { this.style.display = 'none'; };

    const label = document.createElement("label");
    label.htmlFor = "item-" + item.id;
    label.className = "item-label";
    label.innerText = item.name;
    if (item.rarity) label.classList.add("rarity-" + item.rarity.toLowerCase());

    const qty = document.createElement("input");
    qty.type = "number";
    qty.id = "qty-" + item.id;
    qty.className = "qty-input";
    qty.value = 1;
    qty.min = 1;
    qty.disabled = true;

    row.appendChild(checkbox);
    row.appendChild(img);
    row.appendChild(label);
    row.appendChild(qty);
    listContainer.appendChild(row);
  });

  // Re-populate filters (this will automatically exclude the hidden items)
  populateFilters();
}
function toggleDropdown() {
  document.getElementById("myDropdown").classList.toggle("show");
}

function populateFilters() {
  const catSelect = document.getElementById("categoryFilter");
  const rarSelect = document.getElementById("rarityFilter");
  if (!catSelect || !rarSelect) return;

  // Prevent duplicate population
  if (catSelect.options.length > 1) return;

  const rows = document.querySelectorAll('#itemList .item-row');
  const categories = new Set();
  const rarities = new Set();

  // Collect unique values from the rendered list
  rows.forEach(row => {
    if (row.dataset.category) categories.add(row.dataset.category);
    if (row.dataset.rarity) rarities.add(row.dataset.rarity);
  });

  // --- 1. POPULATE CATEGORIES (Alphabetical) ---
  [...categories].sort().forEach(cat => {
    const opt = document.createElement("option");
    opt.value = cat;
    opt.innerText = formatCategory(cat);
    catSelect.appendChild(opt);
  });

  // --- 2. POPULATE RARITIES (Custom Order) ---
  // Define your custom priority list (Lower index = Higher up in the list)
  const rarityOrder = [
    "common",
    "uncommon",
    "rare",
    "epic",
    "legendary",
    "mythic",
    "divine", // Standard SkyBlock name (matches your style.css)
    "divan",  // Included just in case your JSON uses this specific name
    "special",
    "supreme"
  ];

  [...rarities]
    .sort((a, b) => {
      const indexA = rarityOrder.indexOf(a.toLowerCase());
      const indexB = rarityOrder.indexOf(b.toLowerCase());

      // If both are in the list, compare their positions
      if (indexA !== -1 && indexB !== -1) return indexA - indexB;

      // If only A is in the list, it comes first
      if (indexA !== -1) return -1;

      // If only B is in the list, it comes first
      if (indexB !== -1) return 1;

      // If neither is in the list, fallback to alphabetical
      return a.localeCompare(b);
    })
    .forEach(rar => {
      const opt = document.createElement("option");
      opt.value = rar;
      // Capitalize first letter for display (e.g. "rare" -> "Rare")
      opt.innerText = rar.charAt(0).toUpperCase() + rar.slice(1);
      rarSelect.appendChild(opt);
    });
}

function filterItems() {
  const nameInput = document.getElementById("searchInput").value.toUpperCase();
  const catInput = document.getElementById("categoryFilter").value;
  const rarInput = document.getElementById("rarityFilter").value;

  const items = document.getElementsByClassName("item-row");

  for (let i = 0; i < items.length; i++) {
    const row = items[i];
    const label = row.getElementsByTagName("label")[0];
    const txtValue = label.textContent || label.innerText;

    // Check all 3 conditions
    const matchesName = txtValue.toUpperCase().indexOf(nameInput) > -1;
    const matchesCat = catInput === "" || row.dataset.category === catInput;
    const matchesRar = rarInput === "" || row.dataset.rarity === rarInput;

    if (matchesName && matchesCat && matchesRar) {
      row.style.display = "";
    } else {
      row.style.display = "none";
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

function resetSelection() {
  const checkboxes = document.querySelectorAll('.item-row input[type="checkbox"]');
  checkboxes.forEach(cb => {
    cb.checked = false;
    toggleQty(cb); // Will disable input
  });

  // Reset inputs
  document.querySelectorAll('.item-row input[type="number"]').forEach(i => i.value = 1);
  document.getElementById("searchInput").value = "";
  document.getElementById("categoryFilter").value = "";
  document.getElementById("rarityFilter").value = "";

  // Refresh view
  filterItems();
}

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

function getSelectedItems() {
  const checkedBoxes = document.querySelectorAll('.item-row input[type="checkbox"]:checked');
  const listItems = [];

  checkedBoxes.forEach(checkbox => {
    const cleanId = checkbox.dataset.id || checkbox.id.replace('item-', '');

    // Find Data by ID
    let originalItem = inventoryData.find(item => item.id == cleanId);

    if (!originalItem) return;

    const row = checkbox.closest('.item-row');
    const qtyInput = row.querySelector('.qty-input');
    const quantity = parseInt(qtyInput.value) || 1;

    let minCrafts = 0;
    let maxCrafts = 0;

    if (originalItem.recipe && originalItem.recipe.length > 0) {
      const yieldAmounts = originalItem.recipe.map(r => parseInt(r.gives || 1));
      const possibleCrafts = yieldAmounts.map(yieldAmt => Math.ceil(quantity / yieldAmt));
      minCrafts = Math.min(...possibleCrafts);
      maxCrafts = Math.max(...possibleCrafts);
    }

    listItems.push({
      id: originalItem.id, // NEW: Store ID
      name: originalItem.name,
      rarity: originalItem.rarity,
      quantity: quantity,
      timesToCraftMin: minCrafts,
      timesToCraftMax: maxCrafts
    });
  });

  const displayContainer = document.getElementById('itemListDisplay');
  displayContainer.innerHTML = "";
  let htmlString = "";

  listItems.forEach((entry) => {
    const craftInfo = entry.timesToCraftMax > 0
      ? `| Min Crafts: ${entry.timesToCraftMin} | Max Crafts: ${entry.timesToCraftMax}`
      : `| Base Material`;

    const imgPath = getImagePath(entry.name);


    htmlString += `
    <p class="result-row"
       data-id="${entry.id}"
       data-name="${entry.name}"
       data-quantity="${entry.quantity}"
       style="cursor:pointer; padding: 5px; border-bottom: 1px solid #333; display: flex; align-items: center;">

      <img src="${imgPath}" class="item-icon-small" onerror="this.style.display='none'">

      <span class="rarity-${entry.rarity ? entry.rarity.toLowerCase() : 'common'}" style="font-weight:bold; margin-right: 5px;">${entry.name}</span>

      <span style="flex-grow: 1; font-size: 0.9em; color: #aaa;">
         ${craftInfo}
      </span>

      <strong>x${entry.quantity}</strong>
    </p>`;
  });

  displayContainer.innerHTML = htmlString;

  renderMaterialSummary(listItems);
  updateRecipeSelectors(listItems);

  return listItems;
}

function formatCategory(cat) {
  // 1. Handle None/null/undefined
  if (!cat || cat.toLowerCase() === 'none') return "None";

  // 2. Replace underscores with spaces, split words
  return cat.toLowerCase().split('_')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1)) // Capitalize first letter
    .join(' '); // Join back with spaces
}

function buildRecipeTree(identifier, qtyNeeded = 1, visited = new Set()) {
  // 1. RECURSION GUARD: Check if we've already seen this ID in this branch
  // This prevents the "Too much recursion" crash
  if (visited.has(identifier)) {
    return {
      name: "Loop Detected",
      id: identifier,
      quantity: qtyNeeded,
      rarity: 'common',
      color: 'bg-red-900', // Make it red to warn the user
      ingredients: []
    };
  }

  // Create a new set for the next level (allows diamonds, prevents circles)
  const newVisited = new Set(visited);
  newVisited.add(identifier);

  // 2. Find Item Data (Try ID first, then Name)
  let item = inventoryData.find(i => i.id == identifier);
  if (!item) item = inventoryData.find(i => i.name === identifier);

  // Fallback for base materials or unknown items
  if (!item) {
    return {
      name: identifier,
      id: null,
      quantity: qtyNeeded,
      rarity: 'common',
      ingredients: []
    };
  }

  const children = [];
  let actualAmountProduced = qtyNeeded;

  // 3. Process Recipe
  if (item.recipe && item.recipe.length > 0) {
    // Check overrides using NAME (since keys are names)
    const recipeIndex = activeRecipeOverrides[item.name] || 0;
    const activeRecipe = item.recipe[recipeIndex];

    if (activeRecipe) {
      const gives = activeRecipe.gives ? parseInt(activeRecipe.gives) : 1;
      const craftsRequired = Math.ceil(qtyNeeded / gives);
      actualAmountProduced = craftsRequired * gives;

      Object.keys(activeRecipe).forEach(ingredientName => {
        if (ingredientName === 'gives') return;

        const amountPerCraft = parseInt(activeRecipe[ingredientName]);
        const totalAmountNeeded = amountPerCraft * craftsRequired;

        // Resolve Ingredient Name -> Ingredient ID
        const ingredientItem = inventoryData.find(i => i.name === ingredientName);

        // RECURSIVE CALL: Pass 'newVisited' to the child
        if (ingredientItem) {
          children.push(buildRecipeTree(ingredientItem.id, totalAmountNeeded, newVisited));
        } else {
          children.push(buildRecipeTree(ingredientName, totalAmountNeeded, newVisited));
        }
      });
    }
  }

  return {
    name: item.name,
    id: item.id,
    quantity: actualAmountProduced,
    rarity: item.rarity || 'common',
    ingredients: children
  };
}

function renderTreeHTML(node) {
  if (!node) return '';

  let html = `<div class="tree-node">`;

  // Use a dark background for the box itself
  const colorClass = 'bg-gray-800';
  const rarityClass = node.rarity ? `rarity-${node.rarity.toLowerCase()}` : 'rarity-common';

  const imgPath = getImagePath(node.name);

  html += `
    <div class="node-content ${colorClass}" style="border: 1px solid #444; background: #1f2937;">
      <img src="${imgPath}" class="tree-icon" onerror="this.style.display='none'">

      <div class="item-name ${rarityClass}" style="font-weight: bold;">${node.name}</div>

      <div class="item-qty" style="color: #ccc;">x${node.quantity.toLocaleString()}</div>
    </div>
  `;

  if (node.ingredients && node.ingredients.length > 0) {
    html += `<div class="children-container">`;
    node.ingredients.forEach(child => {
      html += renderTreeHTML(child);
    });
    html += `</div>`;
  }

  html += `</div>`;
  return html;
}

function renderMaterialSummary(selectedItems) {
  const resultsDiv = document.querySelector('.results-panel');
  if (!resultsDiv) return;

  const totals = {};

  // Helper to handle both ID and Name lookups
  function decompose(identifier, qtyNeeded) {
    if (!qtyNeeded || isNaN(qtyNeeded)) qtyNeeded = 0;
    const cleanId = identifier.trim();

    // 1. Try to find the item in data (Try ID first, then Name)
    // This fixes the issue where recipes using IDs weren't being found
    let item = inventoryData.find(i => i.id == cleanId);
    if (!item) item = inventoryData.find(i => i.name === cleanId);

    // 2. Base Case: Item not found OR No recipes -> Add to Totals
    // We store the ID (or name if ID missing) in totals to ensure uniqueness
    if (!item || !item.recipe || item.recipe.length === 0) {
      // Use the ID if we found an item, otherwise use the raw identifier string
      const key = item ? item.id : cleanId;
      if (!totals[key]) totals[key] = 0;
      totals[key] += qtyNeeded;
      return;
    }

    // 3. Recursive Step (Process Recipe)
    const recipeIndex = activeRecipeOverrides[item.name] || 0; // overrides use Name keys
    const recipe = item.recipe[recipeIndex];

    if (!recipe) {
      const key = item.id;
      if (!totals[key]) totals[key] = 0;
      totals[key] += qtyNeeded;
      return;
    }

    const gives = recipe.gives ? parseInt(recipe.gives) : 1;
    const craftsRequired = Math.ceil(qtyNeeded / gives);

    // Loop through ingredients
    for (const [ingKey, ingQtyStr] of Object.entries(recipe)) {
      if (ingKey === 'gives') continue;

      const amountPerCraft = parseInt(ingQtyStr);
      const totalIngNeeded = amountPerCraft * craftsRequired;

      // Recurse using the ingredient key (which is likely an ID in your new JSON)
      decompose(ingKey, totalIngNeeded);
    }
  }

  // Run calculation for all selected items
  selectedItems.forEach(entry => {
    // Start with ID if available, otherwise Name
    decompose(entry.id || entry.name, entry.quantity);
  });

  // --- RENDER HTML ---
  const sortedKeys = Object.keys(totals).sort();

  let html = `<h3 style="margin-bottom:15px; color:#fff; border-bottom: 1px solid #444; padding-bottom: 10px;">Total Base Resources</h3>`;

  if (sortedKeys.length === 0) {
    html += `<p style="color: #888;">No base resources to display.</p>`;
  } else {
    html += `<div style="display: grid; grid-template-columns: repeat(auto-fill, minmax(220px, 1fr)); gap: 10px;">`;

    sortedKeys.forEach(key => {
      // 4. DISPLAY FIX: Convert the Key (ID) back to a Display Name
      let displayName = key;
      let displayRarity = "common";

      // Look up the item info for this ID
      const itemData = inventoryData.find(i => i.id == key || i.name === key);

      if (itemData) {
        displayName = itemData.name;
        if(itemData.rarity) displayRarity = itemData.rarity.toLowerCase();
      } else {
        // Fallback: Make the ID look pretty (ENCHANTED_POTATO -> Enchanted Potato)
        displayName = key.toLowerCase().split('_')
          .map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
      }

      const imgPath = getImagePath(displayName);

      html += `
        <div style="background: #161b22; padding: 10px; border-radius: 6px; border: 1px solid #30363d; display: flex; align-items:center; gap: 10px;">
           <img src="${imgPath}" class="item-icon-small" onerror="this.style.display='none'" style="width: 24px; height: 24px;">
           <span class="rarity-${displayRarity}" style="font-size:0.9rem; flex-grow: 1;">${displayName}</span>
           <span style="color: #3b82f6; font-weight: bold; font-family: monospace; font-size:1rem;">x${totals[key].toLocaleString()}</span>
        </div>`;
    });

    html += `</div>`;
  }

  resultsDiv.innerHTML = html;
  
  // Render Minion Calculator based on these base materials
  renderMinionCalculator(totals);
}

function findMinionsForMaterial(materialNameOrId) {
  let displayName = materialNameOrId;
  const itemData = inventoryData.find(i => i.id == materialNameOrId || i.name === materialNameOrId);
  if (itemData) displayName = itemData.name;

  // The materials in minions_data.json have underscores and exact names
  // e.g. "Blaze_Rod", "Enchanted_Glowstone_Dust" ? 
  // Let's format the display name to match Minion material keys
  const minionMaterialKey = displayName.replace(/ /g, '_');

  const matchingMinions = [];
  for (const [minionName, minionData] of Object.entries(minionsData)) {
    if (minionData.Materials && minionData.Materials[minionMaterialKey]) {
      matchingMinions.push({
        minionName: minionName,
        materialData: minionData.Materials[minionMaterialKey]
      });
    } else {
      // sometimes minion keys have different formats, try case insensitive
      const materialKeys = Object.keys(minionData.Materials || {});
      const matchedKey = materialKeys.find(k => k.toLowerCase() === minionMaterialKey.toLowerCase());
      if (matchedKey) {
        matchingMinions.push({
          minionName: minionName,
          materialData: minionData.Materials[matchedKey]
        });
      }
    }
  }
  return matchingMinions;
}

function renderMinionCalculator(totals) {
  const minionPanel = document.getElementById('minion-calculator-panel');
  if (!minionPanel) return;
  
  // Find all required materials and their minions
  const materialsWithMinions = {};
  
  Object.keys(totals).forEach(key => {
    const qty = totals[key];
    const minions = findMinionsForMaterial(key);
    
    if (minions.length > 0) {
      // Just use the first minion found for this material for simplicity,
      // or group by minion. Let's group by minion.
      minions.forEach(m => {
        if (!materialsWithMinions[m.minionName]) {
          materialsWithMinions[m.minionName] = [];
        }
        
        // Find display name
        let displayName = key;
        const itemData = inventoryData.find(i => i.id == key || i.name === key);
        if (itemData) displayName = itemData.name;
        
        materialsWithMinions[m.minionName].push({
          materialKey: key,
          displayName: displayName,
          requiredQty: qty,
          amountPerHarvest: m.materialData.Amount,
          chance: m.materialData.Chance
        });
      });
    }
  });
  
  if (Object.keys(materialsWithMinions).length === 0) {
    minionPanel.style.display = 'none';
    return;
  }
  
  minionPanel.style.display = 'block';
  
  let html = `<h2 style="margin-bottom:20px; color:#fff; border-bottom: 2px solid #444; padding-bottom: 10px;">Minion Requirements</h2>`;
  html += `<div class="minion-cards-container">`;
  
  for (const [minionName, materials] of Object.entries(materialsWithMinions)) {
    // Initialize config if not exists
    if (!userMinionConfigs[minionName]) {
      userMinionConfigs[minionName] = [{ tier: 11, amount: 1, fuel: 'None' }];
    }
    
    const displayMinionName = minionName.replace(/_/g, ' ');
    const imgPath = getImagePath(displayMinionName);
    
    html += `
      <div class="minion-card" data-minion="${minionName}">
        <div class="minion-header">
          <img src="${imgPath}" class="item-icon-small" onerror="this.src='images/Minion.png'; this.onerror=null;">
          <span style="font-size: 1.2rem;">${displayMinionName}</span>
        </div>
        <div class="minion-materials-needed" style="font-size: 0.85rem; color: #8b949e; margin-bottom: 15px;">
          <strong>Produces:</strong> ${materials.map(m => `${m.displayName} (${m.requiredQty.toLocaleString()})`).join(', ')}
        </div>
        <div class="minion-configs" id="configs-${minionName}" style="flex-grow: 1;">
          ${renderMinionConfigs(minionName)}
        </div>
        <button class="minion-add-btn" onclick="addMinionConfig('${minionName}')" style="margin-top: 10px; width: 100%;">+ Add Setup</button>
        <div class="minion-result" id="result-${minionName}">
          ${calculateMinionProduction(minionName, materials)}
        </div>
      </div>
    `;
  }
  
  html += `</div>`;
  minionPanel.innerHTML = html;
}

window.addMinionConfig = function(minionName) {
  if (!userMinionConfigs[minionName]) userMinionConfigs[minionName] = [];
  userMinionConfigs[minionName].push({ tier: 11, amount: 1, fuel: 'None' });
  refreshMinionUI();
};

window.removeMinionConfig = function(minionName, index) {
  if (userMinionConfigs[minionName]) {
    userMinionConfigs[minionName].splice(index, 1);
    if (userMinionConfigs[minionName].length === 0) {
      userMinionConfigs[minionName].push({ tier: 11, amount: 1, fuel: 'None' });
    }
  }
  refreshMinionUI();
};

window.updateMinionConfig = function(minionName, index, field, value) {
  if (userMinionConfigs[minionName] && userMinionConfigs[minionName][index]) {
    if (field === 'tier' || field === 'amount') value = parseInt(value) || 1;
    userMinionConfigs[minionName][index][field] = value;
    refreshMinionUI();
  }
};

function refreshMinionUI() {
  getSelectedItems(); // Recalculate everything and re-render
}

function renderMinionConfigs(minionName) {
  const configs = userMinionConfigs[minionName] || [];
  let html = '';
  
  // Find max tier for this minion
  const minionData = minionsData[minionName];
  const maxTier = Object.keys(minionData).filter(k => !isNaN(parseInt(k))).map(k => parseInt(k)).reduce((a, b) => Math.max(a, b), 1);
  
  configs.forEach((config, index) => {
    let tierOptions = '';
    for (let i = 1; i <= maxTier; i++) {
      tierOptions += `<option value="${i}" ${config.tier === i ? 'selected' : ''}>T${i}</option>`;
    }
    
    let fuelOptions = '';
    for (const fuelKey of Object.keys(minionFuels)) {
      fuelOptions += `<option value="${fuelKey}" ${config.fuel === fuelKey ? 'selected' : ''}>${fuelKey.replace(/_/g, ' ')}</option>`;
    }
    
    html += `
      <div class="minion-config-row">
        <span>Amount:</span>
        <input type="number" min="1" value="${config.amount}" onchange="updateMinionConfig('${minionName}', ${index}, 'amount', this.value)">
        <select onchange="updateMinionConfig('${minionName}', ${index}, 'tier', this.value)">
          ${tierOptions}
        </select>
        <select onchange="updateMinionConfig('${minionName}', ${index}, 'fuel', this.value)">
          ${fuelOptions}
        </select>
        <button class="minion-remove-btn" onclick="removeMinionConfig('${minionName}', ${index})">X</button>
      </div>
    `;
  });
  
  return html;
}

function parseAmount(amountStr) {
  if (typeof amountStr === 'number') return amountStr;
  if (typeof amountStr !== 'string') return 1;
  if (amountStr.includes('-')) {
    const parts = amountStr.split('-');
    return (parseFloat(parts[0]) + parseFloat(parts[1])) / 2;
  }
  return parseFloat(amountStr) || 1;
}

function formatTime(seconds) {
  if (!isFinite(seconds) || seconds <= 0) return "0s";
  
  const d = Math.floor(seconds / (3600 * 24));
  const h = Math.floor(seconds % (3600 * 24) / 3600);
  const m = Math.floor(seconds % 3600 / 60);
  const s = Math.floor(seconds % 60);
  
  let result = [];
  if (d > 0) result.push(`${d} Days`);
  if (h > 0) result.push(`${h} Hours`);
  if (m > 0 && d === 0) result.push(`${m} Mins`); // only show mins if no days
  if (s > 0 && d === 0 && h === 0) result.push(`${s} Secs`);
  
  return result.join(' ') || "0s";
}

function calculateMinionProduction(minionName, materials) {
  const configs = userMinionConfigs[minionName] || [];
  const minionData = minionsData[minionName];
  if (!minionData) return "Minion data not found.";
  
  let html = '';
  
  materials.forEach(mat => {
    let totalItemsPerSecond = 0;
    let fuelNeededDetails = {};
    
    configs.forEach(config => {
      const tierData = minionData[config.tier];
      if (!tierData) return;
      
      const speed = parseFloat(tierData.Speed); // seconds per action
      if (isNaN(speed) || speed <= 0) return;
      
      const fuelData = minionFuels[config.fuel] || minionFuels['None'];
      
      // Speed multiplier reduces time per action
      const actualSpeed = speed / (fuelData.speed_multiplier || 1);
      
      // Time between harvests (2 actions: spawn + kill)
      const harvestTime = actualSpeed * 2;
      
      // Items per harvest
      const amount = parseAmount(mat.amountPerHarvest);
      const chance = parseFloat(mat.chance) / 100 || 1;
      let itemsPerHarvest = amount * chance;
      
      // Apply fuel output multiplier
      itemsPerHarvest *= (fuelData.output_multiplier || 1);
      
      // Production rate
      const itemsPerSecond = (itemsPerHarvest / harvestTime) * config.amount;
      totalItemsPerSecond += itemsPerSecond;
    });
    
    if (totalItemsPerSecond > 0) {
      const timeRequiredSeconds = mat.requiredQty / totalItemsPerSecond;
      html += `<div style="margin-bottom: 5px;"><strong>${mat.displayName}:</strong> takes ${formatTime(timeRequiredSeconds)}</div>`;
      
      // Calculate specific finite fuels
      configs.forEach(config => {
        const fuelData = minionFuels[config.fuel];
        if (fuelData && fuelData.duration !== "infinite") {
          const durationSeconds = fuelData.duration;
          const fuelNeeded = (timeRequiredSeconds / durationSeconds) * config.amount;
          if (fuelNeeded > 0) {
             const formattedFuelName = config.fuel.replace(/_/g, ' ');
             // Store or accumulate to avoid printing the same fuel multiple times, 
             // but here we just list it
             html += `<div style="color:#d29922; font-size: 0.75rem; margin-left: 10px;">↳ Needs ${Math.ceil(fuelNeeded).toLocaleString()}x ${formattedFuelName} (for ${config.amount}x T${config.tier})</div>`;
          }
        }
      });
      
    } else {
      html += `<div><strong>${mat.displayName}:</strong> Not produced with current setup.</div>`;
    }
  });
  
  return html || "No materials calculated.";
}

function updateRecipeSelectors(selectedItems) {
  const container = document.getElementById('recipe-variant-container');
  if (!container) return;

  container.innerHTML = ""; // Clear previous

  const itemsWithMultipleRecipes = new Set();
  const processedIds = new Set(); // Track IDs to prevent infinite loops

  // Recursive scanner
  function scanForAlternates(identifier) {
    // 1. Resolve the item (Try ID, then Name)
    let item = inventoryData.find(i => i.id == identifier);
    if (!item) item = inventoryData.find(i => i.name === identifier);

    // If item doesn't exist in data, we can't check its recipes
    if (!item) return;

    // 2. Loop Protection: Check if we already scanned this ITEM ID
    if (processedIds.has(item.id)) return;
    processedIds.add(item.id);

    if (!item.recipe) return;

    // 3. If it has multiple recipes, add to the list
    if (item.recipe.length > 1) {
      itemsWithMultipleRecipes.add(item.name);
    }

    // 4. Continue scanning down the CURRENT active recipe
    // We use item.name for the override key
    const activeIndex = activeRecipeOverrides[item.name] || 0;
    const activeRecipe = item.recipe[activeIndex];

    if (activeRecipe) {
      Object.keys(activeRecipe).forEach(key => {
        if (key !== 'gives') {
          // Recurse using the key from the recipe (which might be ID or Name)
          scanForAlternates(key);
        }
      });
    }
  }

  // Start scan from selected items
  selectedItems.forEach(entry => {
    // Pass ID if we have it, otherwise Name
    scanForAlternates(entry.id || entry.name);
  });

  if (itemsWithMultipleRecipes.size === 0) {
    container.innerHTML = "<p style='color:#888; font-size:0.8rem; padding:10px;'>No alternative recipes available for this selection.</p>";
    return;
  }

  // Render the Dropdowns
  itemsWithMultipleRecipes.forEach(itemName => {
    const itemData = inventoryData.find(i => i.name === itemName);
    // If we found it via ID scan but can't find it by name here, safety check:
    if (!itemData) return;

    const currentIndex = activeRecipeOverrides[itemName] || 0;

    const wrapper = document.createElement('div');
    wrapper.style.marginBottom = "15px";
    wrapper.style.padding = "10px";
    wrapper.style.background = "#1f2937";
    wrapper.style.borderRadius = "8px";
    wrapper.style.border = "1px solid #374151";

    const title = document.createElement('div');
    title.innerText = `Recipe for: ${itemName}`;
    title.style.color = "#fff";
    title.style.fontWeight = "bold";
    title.style.marginBottom = "5px";
    wrapper.appendChild(title);

    const select = document.createElement('select');
    select.style.width = "100%";
    select.style.padding = "5px";
    select.style.background = "#111827";
    select.style.color = "#fff";
    select.style.border = "1px solid #4b5563";
    select.style.borderRadius = "4px";

    // Create options
    itemData.recipe.forEach((recipe, index) => {
      const option = document.createElement('option');
      option.value = index;

      const gives = recipe.gives || 1;

      // Attempt to make ingredient list pretty
      const ingredients = Object.keys(recipe)
        .filter(k => k !== 'gives')
        .map(k => {
          // Try to convert ID to Name for the dropdown label
          const ingItem = inventoryData.find(i => i.id == k || i.name === k);
          const displayName = ingItem ? ingItem.name : k;
          return `${recipe[k]} ${displayName}`;
        })
        .join(', ');

      option.text = `Var ${index + 1} (x${gives}): ${ingredients}`;
      if (index === currentIndex) option.selected = true;
      select.appendChild(option);
    });

    select.onchange = function() {
      window.selectRecipe(itemName, parseInt(this.value));
    };

    wrapper.appendChild(select);
    container.appendChild(wrapper);
  });
}
window.selectRecipe = function (itemName, index) {
  console.log(`Switched ${itemName} to recipe option ${index}`);
  activeRecipeOverrides[itemName] = index;

  getSelectedItems();

  if (currentTreeContext) {
    const zoomLayer = document.getElementById('tree-display');
    if (zoomLayer) {
      // NEW: Use the stored ID to rebuild
      // Use fallback to name if ID is missing (for safety)
      const identifier = currentTreeContext.id || currentTreeContext.name;
      const newTree = buildRecipeTree(identifier, currentTreeContext.qty);

      zoomLayer.innerHTML = renderTreeHTML(newTree);
    }
  }
};

function getImagePath(itemName) {
  if (!itemName) return '';
  // Replace all spaces with underscores
  const formattedName = itemName.replace(/ /g, '_');
  return `images/${formattedName}.png`;
}
