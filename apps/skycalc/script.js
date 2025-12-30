let inventoryData = [];
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
    const response = await fetch('../../assets/data.json');

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    inventoryData = await response.json();
    console.log("Data loaded successfully:", inventoryData.length, "items.");

    // Once data is loaded, render the sidebar list
    renderList();

  } catch (error) {
    console.error("Failed to load inventory data:", error);
    alert("Error loading data. Check console. (Note: You must use a Local Server to fetch JSON files due to CORS)");
    return; // Stop execution if data fails
  }

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

  // --- E. RESULT LIST CLICK LISTENER (Tree Generation) ---
  if (displayContainer) {
    displayContainer.addEventListener('click', function (e) {
      // 1. Find clicked row
      const clickedRow = e.target.closest('.result-row');
      if (!clickedRow) return;

      // 2. Highlight
      const currentSelected = displayContainer.querySelector('.selected-row');
      if (currentSelected) currentSelected.classList.remove('selected-row');
      clickedRow.classList.add('selected-row');

      // 3. Extract Data
      const itemName = clickedRow.dataset.name;
      // Note: We use dataset.quantity (from getSelectedItems)
      const qtyNeeded = parseInt(clickedRow.dataset.quantity) || 1;

      // 4. Save Context & Build Tree
      currentTreeContext = { name: itemName, qty: qtyNeeded };
      console.log(`Generating tree for: ${itemName} (x${qtyNeeded})`);

      const resultTree = buildRecipeTree(itemName, qtyNeeded);

      // 5. Render
      if (zoomLayer) {
        zoomLayer.innerHTML = renderTreeHTML(resultTree);

        // Reset Camera
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
    const row = document.createElement("div");
    row.className = "item-row";

    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.id = "item-" + item.id;
    checkbox.onchange = function () { toggleQty(this); };

    const label = document.createElement("label");
    label.htmlFor = "item-" + item.id;
    label.className = "item-label";
    label.innerText = item.name;
    if (item.rarity) label.classList.add("rarity-" + item.rarity);

    const qty = document.createElement("input");
    qty.type = "number";
    qty.id = "qty-" + item.id;
    qty.className = "qty-input";
    qty.value = 1;
    qty.min = 1;
    qty.disabled = true;

    row.appendChild(checkbox);
    row.appendChild(label);
    row.appendChild(qty);
    listContainer.appendChild(row);
  });
}

function toggleDropdown() {
  document.getElementById("myDropdown").classList.toggle("show");
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

// Close dropdown on outside click
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
    const cleanId = parseInt(checkbox.id.replace('item-', ''));
    const row = checkbox.closest('.item-row');
    const qtyInput = row.querySelector('.qty-input');
    const quantity = parseInt(qtyInput.value) || 1; // Default to 1 if empty
    const originalItem = inventoryData.find(item => item.id === cleanId);

    let currentItemMin = Infinity;
    let currentItemMax = 0;


    listItems.push({
      name: originalItem.name,
      rarity: originalItem.rarity,
      quantity: quantity,
      timesToCraftMin: currentItemMin,
      timesToCraftMax: currentItemMax
    });
  });

  const displayContainer = document.getElementById('itemListDisplay');
  displayContainer.innerHTML = "";
  let htmlString = "";

  listItems.forEach((entry) => {
    // Note: dataset.quantity stores the raw User Input amount
    htmlString += `
    <p class="result-row"
       data-name="${entry.name}"
       data-min="${entry.timesToCraftMin}"
       data-quantity="${entry.quantity}">

      <span class="rarity-${entry.rarity}">${entry.name}</span>
      | Min: ${entry.timesToCraftMin}
      | Max: ${entry.timesToCraftMax}
      | Amount: ${entry.quantity}
    </p>`;
  });

  renderMaterialSummary(listItems);
  updateRecipeSelectors(listItems);
  displayContainer.innerHTML = htmlString;
  return listItems;
}

/**
 * Builds a recursive tree structure based on item requirements.
 * @param {string} itemId - The ID of the item to build (e.g., "ashwreath")
 * @param {number} qtyNeeded - How many of this item are needed
 */
function buildRecipeTree(itemId, qtyNeeded = 1) {
  // Find the item by ID in your new data structure
  const item = inventoryData.find(i => i.id === itemId);

  // Fallback if item doesn't exist in data
  if (!item) {
    return {
      name: itemId, // Fallback to ID if name unknown
      id: itemId,
      quantity: qtyNeeded,
      color: 'bg-gray-400', // Default styling for unknown items
      textColor: 'text-black',
      ingredients: []
    };
  }

  const children = [];

  // Check if item has requirements (ingredients)
  if (item.requirements && item.requirements.length > 0) {
    item.requirements.forEach(req => {
      // Calculate total needed: (Amount per item) * (Total items needed)
      const totalAmountNeeded = req.amount * qtyNeeded;
      children.push(buildRecipeTree(req.id, totalAmountNeeded));
    });
  }

  return {
    name: item.name,
    id: item.id,
    quantity: qtyNeeded,
    color: item.color,      // e.g., "bg-orange-800"
    textColor: item.text,   // e.g., "text-orange-100"
    ingredients: children
  };
}

/**
 * Renders the recursive HTML for the tree.
 */
function renderTreeHTML(node) {
  if (!node) return '';

  // Use the classes directly from the data (color + text)
  const nodeClasses = `${node.color || ''} ${node.textColor || ''}`;

  let html = `
    <div class="tree-node">
      <div class="node-content ${nodeClasses}" style="padding: 8px; border-radius: 6px; display: inline-block; border: 1px solid #ccc;">
        <strong>${node.name}</strong><br>
        <small>x${node.quantity.toLocaleString()}</small>
      </div>
  `;

  // Render Children recursively
  if (node.ingredients && node.ingredients.length > 0) {
    html += '<div class="children-container" style="display: flex; gap: 20px; justify-content: center; margin-top: 10px; padding-top: 10px; border-top: 1px solid #eee;">';
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
    const item = inventoryData.find(i => i.name.trim() === cleanName);

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

    const item = inventoryData.find(i => i.name === itemName);
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
    const itemData = inventoryData.find(i => i.name === itemName);
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

// Global window function for the onclick events in the generated HTML
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
