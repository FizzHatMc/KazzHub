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
        zoomLayer.classList.add('tree-container');
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
    row.className = "item-row"; // We added flex style for this in CSS

    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.id = "item-" + item.id;
    checkbox.onchange = function () { toggleQty(this); };

    // --- NEW: Create Image Element ---
    const img = document.createElement("img");
    img.src = getImagePath(item.name);
    img.className = "item-icon-small";
    // Optional: Hide image if file is missing so it doesn't show a broken icon
    img.onerror = function() { this.style.display = 'none'; };

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

    // --- Append in order: Checkbox -> Image -> Label -> Qty ---
    row.appendChild(checkbox);
    row.appendChild(img);
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
    // 1. Get User Input
    const cleanId = parseInt(checkbox.id.replace('item-', ''));
    const row = checkbox.closest('.item-row');
    const qtyInput = row.querySelector('.qty-input');
    const quantity = parseInt(qtyInput.value) || 1;

    // 2. Find Data
    // Use NAME matching if ID fails, just to be safe
    let originalItem = inventoryData.find(item => item.id === cleanId);

    if (!originalItem) return; // Skip if error

    // 3. CALCULATE Min/Max Crafts
    let minCrafts = 0;
    let maxCrafts = 0;

    if (originalItem.recipe && originalItem.recipe.length > 0) {
      // Get the "gives" amount for every recipe variant
      const yieldAmounts = originalItem.recipe.map(r => parseInt(r.gives || 1));

      // Calculate how many crafts needed for the requested quantity
      // Math.ceil(12 needed / 4 gives) = 3 crafts
      const possibleCrafts = yieldAmounts.map(yieldAmt => Math.ceil(quantity / yieldAmt));

      // Min crafts = using the high-yield recipe
      // Max crafts = using the low-yield recipe
      minCrafts = Math.min(...possibleCrafts);
      maxCrafts = Math.max(...possibleCrafts);
    }

    // 4. Push to List
    listItems.push({
      name: originalItem.name,
      rarity: originalItem.rarity,
      quantity: quantity,
      timesToCraftMin: minCrafts,
      timesToCraftMax: maxCrafts
    });
  });

  // 5. Render the List HTML
  const displayContainer = document.getElementById('itemListDisplay');
  displayContainer.innerHTML = "";
  let htmlString = "";

  listItems.forEach((entry) => {
    // Only show Min/Max if it's actually a craftable item (count > 0)
    const craftInfo = entry.timesToCraftMax > 0
      ? `| Min Crafts: ${entry.timesToCraftMin} | Max Crafts: ${entry.timesToCraftMax}`
      : `| Base Material`;

    // --- NEW: Generate Image Path ---
    const imgPath = getImagePath(entry.name);

    htmlString += `
    <p class="result-row"
       data-name="${entry.name}"
       data-quantity="${entry.quantity}"
       style="cursor:pointer; padding: 5px; border-bottom: 1px solid #333; display: flex; align-items: center;">

      <img src="${imgPath}" class="item-icon-small" onerror="this.style.display='none'">

      <span class="rarity-${entry.rarity}" style="font-weight:bold; margin-right: 5px;">${entry.name}</span>

      <span style="flex-grow: 1; font-size: 0.9em; color: #aaa;">
         ${craftInfo}
      </span>

      <strong>x${entry.quantity}</strong>
    </p>`;
  });

  displayContainer.innerHTML = htmlString;

  // 6. TRIGGER THE UPDATES
  // Because we fixed the crash above, these will now run correctly:
  renderMaterialSummary(listItems);
  updateRecipeSelectors(listItems);

  return listItems;
}


function buildRecipeTree(identifier, qtyNeeded = 1) {
  // 1. Find the item
  let item = inventoryData.find(i => i.name === identifier);
  if (!item) item = inventoryData.find(i => i.id == identifier);

  if (!item) {
    return {
      name: identifier,
      id: null,
      quantity: qtyNeeded,
      color: 'bg-red-800',
      textColor: 'text-white',
      ingredients: []
    };
  }

  const children = [];

  // Variable to track how many items we ACTUALLY create.
  // If we need 1 but recipe makes 4, this becomes 4.
  let actualAmountProduced = qtyNeeded;

  // 2. Process Recipe
  if (item.recipe && item.recipe.length > 0) {
    const recipeIndex = activeRecipeOverrides[item.name] || 0;
    const activeRecipe = item.recipe[recipeIndex];

    if (activeRecipe) {
      const gives = activeRecipe.gives ? parseInt(activeRecipe.gives) : 1;

      const craftsRequired = Math.ceil(qtyNeeded / gives);

      // Update the display amount to reflect the full batch
      actualAmountProduced = craftsRequired * gives;

      Object.keys(activeRecipe).forEach(ingredientName => {
        if (ingredientName === 'gives') return;

        const amountPerCraft = parseInt(activeRecipe[ingredientName]);
        // Total needed is simple multiplication now (integers only)
        const totalAmountNeeded = amountPerCraft * craftsRequired;

        children.push(buildRecipeTree(ingredientName, totalAmountNeeded));
      });
    }
  }

  return {
    name: item.name,
    id: item.id,
    quantity: actualAmountProduced,
    color: item.color,
    textColor: item.text || 'text-white',
    ingredients: children
  };
}

/**
 * Renders the recursive HTML for the tree.
 * Matches CSS structure: .tree-node > .node-content + .children-container
 */
function renderTreeHTML(node) {
  if (!node) return '';

  let html = `<div class="tree-node">`;

  const colorClass = node.color || 'bg-gray-700';
  const textClass = node.textColor || 'text-white';

  // --- NEW: Get Image ---
  const imgPath = getImagePath(node.name);

  html += `
    <div class="node-content ${colorClass} ${textClass}">
      <img src="${imgPath}" class="tree-icon" onerror="this.style.display='none'">

      <div class="item-name">${node.name}</div>
      <div class="item-qty">x${node.quantity.toLocaleString()}</div>
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

  // Debug check:
  if (!container) {
    console.error("HTML Error: Could not find <div id='recipe-variant-container'> in your HTML.");
    return;
  }

  container.innerHTML = ""; // Clear previous

  // Track which items we have already created a dropdown for
  const itemsWithMultipleRecipes = new Set();
  const processedItems = new Set();

  // Recursive scanner to find ALL items in the tree that have multiple recipes
  function scanForAlternates(itemName) {
    if (processedItems.has(itemName)) return;
    processedItems.add(itemName);

    const item = inventoryData.find(i => i.name === itemName);
    if (!item || !item.recipe) return;

    // If item has 2+ recipes, mark it for a dropdown
    if (item.recipe.length > 1) {
      itemsWithMultipleRecipes.add(item.name);
    }

    // Continue scanning down the CURRENT active recipe
    const activeIndex = activeRecipeOverrides[item.name] || 0;
    const activeRecipe = item.recipe[activeIndex];

    if (activeRecipe) {
      Object.keys(activeRecipe).forEach(key => {
        if (key !== 'gives') scanForAlternates(key);
      });
    }
  }

  // Start scan from selected items
  selectedItems.forEach(entry => scanForAlternates(entry.name));

  if (itemsWithMultipleRecipes.size === 0) {
    container.innerHTML = "<p style='color:#888; font-size:0.8rem; padding:10px;'>No alternative recipes available for this selection.</p>";
    return;
  }

  // Render the Dropdowns
  itemsWithMultipleRecipes.forEach(itemName => {
    const itemData = inventoryData.find(i => i.name === itemName);
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

      // Create a nice label: "Option 1 (Gives 4) - Cost: 16 Coal..."
      const gives = recipe.gives || 1;
      const ingredients = Object.keys(recipe)
        .filter(k => k !== 'gives')
        .map(k => `${recipe[k]} ${k}`)
        .join(', ');

      option.text = `Var ${index + 1} (x${gives}): ${ingredients}`;
      if (index === currentIndex) option.selected = true;
      select.appendChild(option);
    });

    // Handle Change
    select.onchange = function() {
      window.selectRecipe(itemName, parseInt(this.value));
    };

    wrapper.appendChild(select);
    container.appendChild(wrapper);
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

function getImagePath(itemName) {
  if (!itemName) return '';
  // Replace all spaces with underscores
  const formattedName = itemName.replace(/ /g, '_');
  return `images/${formattedName}.png`;
}
