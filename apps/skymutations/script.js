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

// Progressive Mode State
let completedItems = new Set();
let lastContextId = null;
let currentTreeData = null;
let currentCandidates = new Set();

// Greenhouse State
let greenhouseCount = 1;
let currentGreenhouseView = 0; // 0, 1, 2
let gh1LockedState = new Set(); // Indices 0-99
// Initialize GH1 as fully locked
for(let i=0; i<100; i++) gh1LockedState.add(i);

let lastSolution = null; // Store solution to re-render on view switch

// --- CACHE & PERSISTENCE ---

const APP_STATE_KEY = 'skymutations_app_state';
const FAVORITES_KEY = 'skymutations_favorites';
const API_BASE_URL = 'https://api.kazz.wtf'; // Production Endpoint

const SolverCache = {
  KEY: 'skymutations_solver_cache',
  LIMIT: 50,

  generateKey: (selectionList, gridState) => {
    const sortedSel = [...selectionList].sort((a, b) => a.id.localeCompare(b.id));
    const selStr = sortedSel.map(s => `${s.id}:${s.ratio}`).join('|');
    const gridStr = gridState.map(b => b ? '1' : '0').join('');
    return `${selStr}#${gridStr}`;
  },

  get: (key) => {
    try {
      const raw = localStorage.getItem(SolverCache.KEY);
      if (!raw) return null;
      const cache = JSON.parse(raw);
      const entry = cache.find(e => e.key === key);
      if (entry) {
        entry.lastUsed = Date.now();
        localStorage.setItem(SolverCache.KEY, JSON.stringify(cache));
        return entry.solution;
      }
    } catch (e) {
      console.error("Cache read error", e);
    }
    return null;
  },

  save: (key, solution) => {
    try {
      const raw = localStorage.getItem(SolverCache.KEY);
      let cache = raw ? JSON.parse(raw) : [];
      cache = cache.filter(e => e.key !== key);
      cache.push({ key, solution, lastUsed: Date.now() });
      cache.sort((a, b) => b.lastUsed - a.lastUsed);
      if (cache.length > SolverCache.LIMIT) {
        cache = cache.slice(0, SolverCache.LIMIT);
      }
      localStorage.setItem(SolverCache.KEY, JSON.stringify(cache));
    } catch (e) {
      console.error("Cache save error", e);
    }
  }
};

function saveAppState() {
  const state = {
    greenhouseCount,
    gh1LockedState: Array.from(gh1LockedState),
    completedItems: Array.from(completedItems),
    gameId: document.getElementById('gameIdInput') ? document.getElementById('gameIdInput').value : ''
  };
  localStorage.setItem(APP_STATE_KEY, JSON.stringify(state));
}

function loadAppState() {
  try {
    const raw = localStorage.getItem(APP_STATE_KEY);
    if (raw) {
      const state = JSON.parse(raw);
      if (state.greenhouseCount) greenhouseCount = state.greenhouseCount;
      if (state.gh1LockedState) gh1LockedState = new Set(state.gh1LockedState);
      if (state.completedItems) completedItems = new Set(state.completedItems);
      if (state.gameId && document.getElementById('gameIdInput')) {
        document.getElementById('gameIdInput').value = state.gameId;
        // Auto-connect if ID exists
        if(state.gameId) connectGame(true);
      }
    }
    renderFavorites();
  } catch (e) {
    console.error("State load error", e);
  }
}

// --- SYNC & FAVORITES ---

async function connectGame(silent = false) {
  const gameId = document.getElementById('gameIdInput').value;
  const statusSpan = document.getElementById('syncStatus');

  if (!gameId) {
    if(!silent) alert("Please enter a Game ID");
    return;
  }

  statusSpan.innerText = "Connecting...";

  try {
    const res = await fetch(`${API_BASE_URL}/api/sync/${gameId}`);

    if (res.status === 404) {
       // ID not found on server yet (Mod hasn't sent data?)
       // We treat this as "Linked but waiting for data" or just keep local state
       statusSpan.innerText = "Linked (No Data)";
       if(!silent) console.log("Game ID linked, but no server data found yet.");
       saveAppState();
       return;
    }

    if (!res.ok) throw new Error("Connection failed");

    const data = await res.json();

    // Update State from Server
    if (data.greenhouseCount) greenhouseCount = data.greenhouseCount;
    if (data.gh1LockedState) gh1LockedState = new Set(data.gh1LockedState);

    statusSpan.innerText = "Linked ✓";
    saveAppState();

    // Refresh UI
    updateGreenhouseControls();
    renderGrid();

  } catch (e) {
    console.error(e);
    statusSpan.innerText = "Error";
    if(!silent) alert("Could not connect to server. Check your internet or Game ID.");
  }
}

function saveCurrentProfile() {
  if (!currentTreeContext) {
    alert("No active profile to save.");
    return;
  }

  const name = prompt("Enter a name for this profile:", currentTreeContext.name);
  if (!name) return;

  const profile = {
    id: Date.now().toString(),
    name: name,
    context: currentTreeContext,
    completedItems: Array.from(completedItems),
    greenhouseCount: greenhouseCount,
    gh1LockedState: Array.from(gh1LockedState)
  };

  try {
    const raw = localStorage.getItem(FAVORITES_KEY);
    const favs = raw ? JSON.parse(raw) : [];
    favs.push(profile);
    localStorage.setItem(FAVORITES_KEY, JSON.stringify(favs));
    renderFavorites();
  } catch (e) {
    console.error("Save fav error", e);
  }
}

function loadProfile(id) {
  try {
    const raw = localStorage.getItem(FAVORITES_KEY);
    if (!raw) return;
    const favs = JSON.parse(raw);
    const profile = favs.find(p => p.id === id);

    if (profile) {
      // Restore State
      greenhouseCount = profile.greenhouseCount || 1;
      gh1LockedState = new Set(profile.gh1LockedState || []);
      completedItems = new Set(profile.completedItems || []);

      // Update UI
      updateGreenhouseControls();
      renderGrid();

      // Load Context
      currentTreeContext = profile.context;
      lastContextId = currentTreeContext.id;

      // Trigger Build
      currentTreeData = buildRecipeTree(currentTreeContext.id, currentTreeContext.qty);
      const zoomLayer = document.getElementById('tree-display');
      if (zoomLayer) {
        zoomLayer.innerHTML = renderTreeHTML(currentTreeData);
      }

      runSolverForCurrentContext();
    }
  } catch (e) {
    console.error("Load fav error", e);
  }
}

function deleteProfile(id) {
  if(!confirm("Delete this profile?")) return;
  try {
    const raw = localStorage.getItem(FAVORITES_KEY);
    if (!raw) return;
    let favs = JSON.parse(raw);
    favs = favs.filter(p => p.id !== id);
    localStorage.setItem(FAVORITES_KEY, JSON.stringify(favs));
    renderFavorites();
  } catch (e) {
    console.error("Delete fav error", e);
  }
}

function renderFavorites() {
  const list = document.getElementById('favoritesList');
  if (!list) return;
  list.innerHTML = '';

  try {
    const raw = localStorage.getItem(FAVORITES_KEY);
    const favs = raw ? JSON.parse(raw) : [];

    if (favs.length === 0) {
      list.innerHTML = '<div style="text-align: center; color: #555; font-size: 0.8rem; padding: 10px;">No saved profiles</div>';
      return;
    }

    favs.forEach(fav => {
      const item = document.createElement('div');
      item.className = 'favorite-item';
      item.innerHTML = `
        <span onclick="loadProfile('${fav.id}')">${fav.name}</span>
        <div class="fav-actions">
          <button class="fav-btn" onclick="loadProfile('${fav.id}')" title="Load">📂</button>
          <button class="fav-btn" onclick="deleteProfile('${fav.id}')" title="Delete">🗑</button>
        </div>
      `;
      list.appendChild(item);
    });
  } catch (e) {
    console.error("Render fav error", e);
  }
}

async function uploadToGame() {
  const gameId = document.getElementById('gameIdInput').value;
  if (!gameId) {
    alert("Please link a Game ID first.");
    return;
  }

  if (!lastSolution) {
    alert("No active solution to upload.");
    return;
  }

  try {
    const res = await fetch(`${API_BASE_URL}/api/layout/${gameId}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        profileName: currentTreeContext ? currentTreeContext.name : 'Custom Layout',
        greenhouseView: currentGreenhouseView,
        placements: lastSolution.placements,
        layout: lastSolution.layout
      })
    });

    if (res.ok) {
      alert("Layout uploaded to Minecraft!");
    } else {
      throw new Error("Server error");
    }
  } catch (e) {
    console.error(e);
    alert("Failed to upload layout. Check connection.");
  }
}

// ---

function unlockAll(){
  if (currentGreenhouseView !== 0) return; // Only GH1 can be locked/unlocked
  gh1LockedState.clear();
  renderGrid();
  saveAppState();
}

function resetGrid() {
  if (currentGreenhouseView !== 0) return;
  gh1LockedState.clear();
  for(let i=0; i<100; i++) gh1LockedState.add(i);
  renderGrid();
  saveAppState();
}

// --- Greenhouse Management ---

function addGreenhouse() {
  if (greenhouseCount >= 3) return;

  // Check if GH1 is fully unlocked
  if (gh1LockedState.size > 0) {
    alert("You must fully unlock Greenhouse 1 before adding more!");
    return;
  }

  greenhouseCount++;
  updateGreenhouseControls();
  // Switch to new greenhouse
  viewGreenhouse(greenhouseCount - 1);
  saveAppState();

  // Re-run solver to utilize new space
  runSolverForCurrentContext();
}

function removeGreenhouse() {
  if (greenhouseCount <= 1) return;
  greenhouseCount--;
  if (currentGreenhouseView >= greenhouseCount) {
    currentGreenhouseView = greenhouseCount - 1;
  }
  updateGreenhouseControls();
  viewGreenhouse(currentGreenhouseView);
  saveAppState();

  // Re-run solver
  runSolverForCurrentContext();
}

function viewGreenhouse(index) {
  if (index < 0 || index >= greenhouseCount) return;
  currentGreenhouseView = index;
  updateGreenhouseControls();
  renderGrid();

  // Re-render solution for this view
  if (lastSolution) {
    const gridCells = document.querySelectorAll('#layoutGrid .grid-cell');
    renderSolverResults(lastSolution, gridCells);
  }
}

function updateGreenhouseControls() {
  const selector = document.getElementById('gh-selector');
  selector.innerHTML = '';

  for(let i=0; i<greenhouseCount; i++) {
    const btn = document.createElement('button');
    btn.className = `view-btn ${i === currentGreenhouseView ? 'active' : ''}`;
    btn.innerText = i + 1;
    btn.onclick = () => viewGreenhouse(i);
    selector.appendChild(btn);
  }

  document.getElementById('gh-add-btn').disabled = (greenhouseCount >= 3);
  document.getElementById('gh-remove-btn').disabled = (greenhouseCount <= 1);
}

// --- Grid Logic ---

function initLayoutGrid() {
  renderGrid();
  updateGreenhouseControls();
}

function renderGrid() {
  const gridContainer = document.getElementById('layoutGrid');
  if (!gridContainer) return;
  gridContainer.innerHTML = '';

  for (let i = 0; i < 100; i++) {
    const cell = document.createElement('div');
    cell.dataset.index = i;

    // Determine state
    let isLocked = false;
    if (currentGreenhouseView === 0) {
      isLocked = gh1LockedState.has(i);
    } else {
      isLocked = false; // GH2/3 always open
    }

    cell.className = `grid-cell ${isLocked ? 'locked' : 'open'}`;
    cell.innerText = isLocked ? 'X' : '';

    cell.addEventListener('click', function() {
      toggleGridCell(i);
    });

    gridContainer.appendChild(cell);
  }
}

function toggleGridCell(index) {
  // Only GH1 is editable
  if (currentGreenhouseView !== 0) return;

  if (gh1LockedState.has(index)) {
    gh1LockedState.delete(index);
  } else {
    gh1LockedState.add(index);
  }

  saveAppState();

  // Update UI directly for performance
  const cell = document.querySelector(`#layoutGrid .grid-cell[data-index="${index}"]`);
  if (cell) {
    const isLocked = gh1LockedState.has(index);
    cell.className = `grid-cell ${isLocked ? 'locked' : 'open'}`;
    cell.innerText = isLocked ? 'X' : '';
  }
}

function setGridState(x, y, isOpen) {
  if (currentGreenhouseView !== 0) return;
  const index = (y * 10) + x;
  if (isOpen) gh1LockedState.delete(index);
  else gh1LockedState.add(index);

  saveAppState();

  // Update UI
  const cell = document.querySelector(`#layoutGrid .grid-cell[data-index="${index}"]`);
  if (cell) {
    cell.className = `grid-cell ${isOpen ? 'open' : 'locked'}`;
    cell.innerText = isOpen ? '' : 'X';
  }
}

// --- Selection Logic ---

function selectMutations(items, clearExisting = true) {
  if (clearExisting) {
    const allCheckboxes = document.querySelectorAll('.item-row input[type="checkbox"]');
    allCheckboxes.forEach(cb => {
      if (cb.checked) {
        cb.checked = false;
        if (typeof toggleQty === "function") toggleQty(cb);
      }
    });
  }

  items.forEach(target => {
    const targetId = target.id || target;
    const targetQty = target.quantity || 1;
    const checkbox = document.getElementById("item-" + targetId);
    const qtyInput = document.getElementById("qty-" + targetId);

    if (checkbox && qtyInput) {
      checkbox.checked = true;
      if (typeof toggleQty === "function") {
        toggleQty(checkbox);
      } else {
        qtyInput.disabled = false;
      }
      qtyInput.value = targetQty;
    }
  });

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

function toggleDropdown() {
  document.getElementById("myDropdown").classList.toggle("show");
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

document.addEventListener('DOMContentLoaded', async function () {
    // Load persisted state
    loadAppState();

    try {
      const response = await fetch('data/mutations.json');
      if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
      mutations = await response.json();
      renderList();
    } catch (error) {
      console.error("Failed to load inventory data:", error);
      alert("Error loading data. Check console.");
      return;
    }

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

  document.querySelectorAll('input[name="solver-mode"]').forEach(radio => {
    radio.addEventListener('change', runSolverForCurrentContext);
  });

  if (displayContainer) {
    displayContainer.addEventListener('click', function (e) {
      const clickedRow = e.target.closest('.result-row');
      if (!clickedRow) return;

      const welcomeMsg = document.getElementById('welcome-message');
      if (welcomeMsg && !welcomeMsg.classList.contains('hidden')) {
        welcomeMsg.classList.add('hidden');
      }

      const currentSelected = displayContainer.querySelector('.selected-row');
      if (currentSelected) currentSelected.classList.remove('selected-row');
      clickedRow.classList.add('selected-row');

      const itemId = clickedRow.dataset.id;
      const itemName = clickedRow.dataset.name;
      const qtyNeeded = parseInt(clickedRow.dataset.quantity) || 1;

      currentTreeContext = { id: itemId, name: itemName, qty: qtyNeeded };

      if (lastContextId !== itemId) {
         if (lastContextId !== null) {
             completedItems.clear();
             currentCandidates.clear();
             saveAppState();
         }
         lastContextId = itemId;
      }

      currentTreeData = buildRecipeTree(itemId || itemName, qtyNeeded);

      if (zoomLayer) {
        zoomLayer.innerHTML = renderTreeHTML(currentTreeData);
      }

      runSolverForCurrentContext();
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
    row.style.display = "flex";
    row.style.alignItems = "center";
    row.style.gap = "8px";

    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.id = "item-" + item.id;
    checkbox.onchange = function () { toggleQty(this); };

    const img = document.createElement("img");
    img.src = item.image ? item.image : `assets/images/${item.name.toLowerCase().replace(/\s/g, '_')}.png`;
    img.alt = item.name;
    img.style.width = "24px";
    img.style.height = "24px";
    img.style.objectFit = "contain";
    img.style.borderRadius = "2px";
    img.onerror = function() { this.style.display = 'none'; };

    const label = document.createElement("label");
    label.htmlFor = "item-" + item.id;
    label.className = "item-label";
    label.innerText = item.name;
    label.style.flexGrow = "1";

    if (item.rarity) label.classList.add("rarity-" + item.rarity);

    const qty = document.createElement("input");
    qty.type = "number";
    qty.id = "qty-" + item.id;
    qty.className = "qty-input";
    qty.value = 1;
    qty.min = 1;
    qty.disabled = true;
    qty.style.width = "50px";

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

function buildRecipeTree(identifier, qtyMin = 1, qtyMax = null) {
  if (qtyMax === null) qtyMax = qtyMin;
  const item = mutations.find(i => String(i.id) === String(identifier) || i.name === identifier);

  if (!item) {
    return {
      name: identifier || "Unknown",
      id: identifier,
      min: qtyMin,
      max: qtyMax,
      image: null,
      rarityClass: 'rarity-common',
      ingredients: []
    };
  }

  const children = [];
  if (item.requirements && item.requirements.length > 0) {
    item.requirements.forEach(req => {
      const childId = req.id || req.name;
      const amount = req.amount || 1;
      const childMin = amount;
      const childMax = amount * qtyMax;
      if (childId) {
        children.push(buildRecipeTree(childId, childMin, childMax));
      }
    });
  }

  return {
    name: item.name,
    id: item.id,
    min: qtyMin,
    max: qtyMax,
    image: item.image ? item.image : `assets/images/${item.name.toLowerCase().replace(' ', '_')}.png`,
    rarityClass: item.rarity ? "rarity-" + item.rarity : "rarity-common",
    ingredients: children
  };
}

function renderTreeHTML(node) {
  if (!node) return '';

  const imgHtml = `
    <img src="${node.image}"
         alt="${node.name}"
         class="tree-icon"
         onerror="this.style.display='none'">`;

  let qtyText = `x${node.min.toLocaleString()}`;
  if (node.min !== node.max) {
    qtyText += `-${node.max.toLocaleString()}`;
  }

  const isCompleted = completedItems.has(node.id);
  const isCandidate = currentCandidates.has(node.id);
  const isProgressive = document.getElementById('mode-progressive').checked;

  let nodeClasses = 'node-content';
  if (isCompleted) nodeClasses += ' completed-node';
  if (isProgressive && isCandidate && !isCompleted) nodeClasses += ' active-candidate';

  let html = `
    <div class="tree-node">
      <div class="${nodeClasses}" onclick="toggleItemCompletion('${node.id}')">
        ${imgHtml}
        <div class="item-name ${node.rarityClass}">${node.name}</div>
        <div class="item-qty">${qtyText}</div>
        ${isCompleted ? '<div class="checkmark">✔</div>' : ''}
      </div>
  `;

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

function toggleItemCompletion(id) {
  if (completedItems.has(id)) {
    completedItems.delete(id);
  } else {
    completedItems.add(id);
  }
  saveAppState();

  const isProgressive = document.getElementById('mode-progressive').checked;
  if (isProgressive) {
    runSolverForCurrentContext();
  }

  const zoomLayer = document.getElementById('tree-display');
  if (zoomLayer && currentTreeData) {
    zoomLayer.innerHTML = renderTreeHTML(currentTreeData);
  }
}

function getProgressiveCandidates(node, candidates = []) {
  if (!node) return candidates;

  const isDone = completedItems.has(node.id);
  if (isDone) return candidates;

  let allChildrenReady = true;
  if (node.ingredients && node.ingredients.length > 0) {
    for (const child of node.ingredients) {
       const isBase = (!child.ingredients || child.ingredients.length === 0);
       const isChildDone = completedItems.has(child.id);

       if (!isBase && !isChildDone) {
         allChildrenReady = false;
         getProgressiveCandidates(child, candidates);
       }
    }
  }

  if (allChildrenReady) {
    const existing = candidates.find(c => c.id === node.id);
    if (existing) {
      existing.quantity += node.min;
    } else {
      candidates.push({
        id: node.id,
        name: node.name,
        quantity: node.min,
        item: mutations.find(m => m.id === node.id)
      });
    }
  }

  return candidates;
}

function runSolverForCurrentContext() {
  if (!currentTreeContext) return;

  const modeSingle = document.getElementById('mode-single').checked;
  const modeMulti = document.getElementById('mode-multiple').checked;
  const modeProgressive = document.getElementById('mode-progressive').checked;

  const gridCells = document.querySelectorAll('#layoutGrid .grid-cell');
  const displayContainer = document.getElementById('itemListDisplay');

  let selectionList = [];
  currentCandidates.clear();

  if (modeProgressive) {
     if (!currentTreeData) {
        currentTreeData = buildRecipeTree(currentTreeContext.id, currentTreeContext.qty);
     }
     const candidates = getProgressiveCandidates(currentTreeData, []);
     selectionList = candidates.map(c => {
       return { item: c.item, ratio: c.quantity, id: c.id };
     });

  } else if (modeMulti) {
     const selectedItems = getSelectedItems();
     selectionList = selectedItems.map(s => {
        const fullItem = mutations.find(m => m.id === s.id);
        return { item: fullItem, ratio: s.quantity, id: s.id };
     });
  } else {
     const fullItemData = mutations.find(i => i.id === currentTreeContext.id);
     selectionList = [{ item: fullItemData, ratio: 1, id: fullItemData.id }];
  }

  // Construct Combined Grid State
  let combinedGridState = [];
  for(let i=0; i<100; i++) {
    combinedGridState.push(!gh1LockedState.has(i));
  }
  if (greenhouseCount >= 2) {
    for(let i=0; i<100; i++) combinedGridState.push(true);
  }
  if (greenhouseCount >= 3) {
    for(let i=0; i<100; i++) combinedGridState.push(true);
  }

  // --- CACHE CHECK ---
  const cacheKey = SolverCache.generateKey(selectionList, combinedGridState);
  const cachedSolution = SolverCache.get(cacheKey);

  let solution;
  if (cachedSolution) {
    console.log("Using Cached Solution");
    solution = cachedSolution;
  } else {
    console.log("Running Solver...", selectionList, "Grid Size:", combinedGridState.length);
    solution = runSolverBestOf(5, selectionList, combinedGridState);
    SolverCache.save(cacheKey, solution);
  }

  lastSolution = solution;

  renderSolverResults(solution, gridCells);

  // Update Highlights based on ACTUAL placements
  if (modeProgressive && solution && solution.placements) {
    const placedIds = new Set(solution.placements.map(p => p.item.id));
    selectionList.forEach(s => {
      if (placedIds.has(s.id)) {
        currentCandidates.add(s.id);
      }
    });
  }

  // Update Sidebar Counts
  const allAmountSpans = displayContainer.querySelectorAll('.calc-amount');
  allAmountSpans.forEach(span => span.innerText = "0");

  if (solution && solution.placements) {
    const counts = {};
    solution.placements.forEach(p => {
      const id = p.item.id;
      counts[id] = (counts[id] || 0) + 1;
    });

    Object.keys(counts).forEach(id => {
      const targetSpan = displayContainer.querySelector(`.calc-amount[data-id="${id}"]`);
      if (targetSpan) {
        targetSpan.innerText = counts[id];
        targetSpan.style.fontWeight = "bold";
        targetSpan.style.color = "#4ade80";
      }
    });
  }

  const zoomLayer = document.getElementById('tree-display');
  if (zoomLayer && currentTreeData) {
    zoomLayer.innerHTML = renderTreeHTML(currentTreeData);
  }
}

// --- Geometry Helpers (Updated for Multi-Grid) ---

const getCropIndices = (globalIndex, size) => {
  const gridIdx = Math.floor(globalIndex / 100);
  const localIdx = globalIndex % 100;
  const tx = localIdx % 10;
  const ty = Math.floor(localIdx / 10);

  const indices = [];
  for (let dy = 0; dy < size; dy++) {
    for (let dx = 0; dx < size; dx++) {
      const nx = tx + dx;
      const ny = ty + dy;
      // Check bounds within the 10x10 subgrid
      if (nx > 9 || ny > 9) return null;

      indices.push(gridIdx * 100 + ny * 10 + nx);
    }
  }
  return indices;
};

const getRingNeighbors = (globalIndex, size) => {
  const gridIdx = Math.floor(globalIndex / 100);
  const localIdx = globalIndex % 100;
  const tx = localIdx % 10;
  const ty = Math.floor(localIdx / 10);

  const neighbors = [];
  for (let dy = -1; dy <= size; dy++) {
    for (let dx = -1; dx <= size; dx++) {
      if (dx >= 0 && dx < size && dy >= 0 && dy < size) continue;
      const nx = tx + dx;
      const ny = ty + dy;
      if (nx >= 0 && nx <= 9 && ny >= 0 && ny <= 9) {
        neighbors.push(gridIdx * 100 + ny * 10 + nx);
      }
    }
  }
  return neighbors;
};

/* --- ATOMIC SOLVER --- */
const runMultiSolver = (selectionList, gridState) => {
  const INITIAL_DATA = mutations;

  let bestScore = -1;
  let bestResult = { placements: [], layout: {} };

  const totalRatio = selectionList.reduce((acc, cur) => acc + cur.ratio, 0);
  const normalizedTargets = selectionList.map(s => ({
    ...s,
    weight: s.ratio / totalRatio,
    placedCount: 0
  }));

  const ATTEMPTS = 100;

  for (let run = 0; run < ATTEMPTS; run++) {
    let currentPlacements = [];
    let currentLayout = {};
    let placedCounts = selectionList.map(() => 0);

    let occupied = new Set();
    gridState.forEach((isOpen, idx) => { if(!isOpen) occupied.add(idx); });

    let openCells = gridState.map((isOpen, idx) => isOpen ? idx : -1).filter(i => i !== -1);
    openCells.sort(() => Math.random() - 0.5);

    const passes = ['STRICT', 'FILL'];

    for (const pass of passes) {
        for (const cellIndex of openCells) {
          if (occupied.has(cellIndex)) continue;

          const totalPlaced = currentPlacements.length || 1;

          const candidates = selectionList.map((s, i) => ({
            id: i,
            item: s.item,
            deficit: (placedCounts[i] / totalPlaced) - normalizedTargets[i].weight,
            isCapped: placedCounts[i] >= s.ratio
          }));

          let validCandidates = candidates;
          if (pass === 'STRICT') {
             validCandidates = candidates.filter(c => !c.isCapped);
          }

          if (validCandidates.length === 0) continue;

          validCandidates.sort((a, b) => a.deficit - b.deficit);

          for (const candidate of validCandidates) {
            const item = candidate.item;
            const mSize = item.size || 1;
            const indices = getCropIndices(cellIndex, mSize);

            if (!indices) continue;
            if (indices.some(idx => occupied.has(idx))) continue;

            const requiredIngredients = [];
            if (item.requirements) {
              item.requirements.forEach(req => {
                for(let k=0; k<req.amount; k++) requiredIngredients.push(req.id);
              });
            }

            if (requiredIngredients.length === 0) {
              indices.forEach(idx => occupied.add(idx));
              currentPlacements.push({ index: cellIndex, item: item });
              placedCounts[candidate.id]++;
              break;
            }

            const neighbors = getRingNeighbors(cellIndex, mSize);
            const validNeighbors = neighbors.filter(n => gridState[n] && !indices.includes(n));

            let satisfiedCount = 0;
            let spotsToFill = [];
            let pendingNeeds = [...requiredIngredients];

            for (const nIdx of validNeighbors) {
              if (currentLayout[nIdx]) {
                const existingId = currentLayout[nIdx].id;
                const needIdx = pendingNeeds.indexOf(existingId);
                if (needIdx > -1) {
                  pendingNeeds.splice(needIdx, 1);
                }
              }
            }

            if (pendingNeeds.length > 0) {
              const emptyNeighbors = validNeighbors.filter(n => !occupied.has(n));

              if (emptyNeighbors.length >= pendingNeeds.length) {
                for (let i = 0; i < pendingNeeds.length; i++) {
                  spotsToFill.push({ index: emptyNeighbors[i], itemId: pendingNeeds[i] });
                }
                pendingNeeds = [];
              }
            }

            if (pendingNeeds.length === 0) {
              indices.forEach(idx => occupied.add(idx));
              currentPlacements.push({ index: cellIndex, item: item });
              placedCounts[candidate.id]++;

              spotsToFill.forEach(fill => {
                occupied.add(fill.index);
                const ingData = INITIAL_DATA.find(d => d.id === fill.itemId);
                if (ingData) {
                  currentLayout[fill.index] = ingData;
                }
              });

              break;
            }
          }
        }
    }

    if (currentPlacements.length > bestScore) {
      bestScore = currentPlacements.length;
      bestResult = { placements: [...currentPlacements], layout: {...currentLayout} };
    }
  }

  return bestResult;
};

function renderSolverResults(solution, gridCells) {
  // Reset Grid (Only current view)
  gridCells.forEach(cell => {
    cell.classList.remove('mutation-spot', 'ingredient-spot');
    const img = cell.querySelector('img');
    if (img) img.remove();
    // Restore lock state visual
    const index = parseInt(cell.dataset.index);
    if (currentGreenhouseView === 0 && gh1LockedState.has(index)) {
       cell.innerText = 'X';
    } else {
       cell.innerText = '';
    }
  });

  if (!solution || !solution.placements || solution.placements.length === 0) {
    return;
  }

  // Filter placements for current view
  const viewStart = currentGreenhouseView * 100;
  const viewEnd = viewStart + 100;

  // Draw Mutation Spots
  solution.placements.forEach(obj => {
    // Check if this placement belongs to current view
    // Note: A placement might span boundaries? No, getCropIndices prevents that.
    if (obj.index < viewStart || obj.index >= viewEnd) return;

    const localIndex = obj.index - viewStart;
    const mSize = obj.item.size || 1;
    // We need local indices for rendering
    const indices = getCropIndices(localIndex, mSize); // Use local index for geometry relative to 0-99
    if (!indices) return;

    indices.forEach(idx => {
      if (gridCells[idx]) {
        const cell = gridCells[idx];
        cell.classList.add('mutation-spot');
        cell.innerText = '';

        const img = document.createElement('img');
        img.src = obj.item.image ? obj.item.image : `assets/images/${obj.item.name.toLowerCase().replace(/\s/g, '_')}.png`;
        img.onerror = function() { this.style.display = 'none'; this.parentNode.innerText = 'M'; };
        cell.appendChild(img);
      }
    });
  });

  // Draw Ingredients
  Object.keys(solution.layout).forEach(key => {
    const globalIndex = parseInt(key);
    if (globalIndex < viewStart || globalIndex >= viewEnd) return;

    const localIndex = globalIndex - viewStart;

    if (gridCells[localIndex]) {
      const cell = gridCells[localIndex];
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
    const result = runMultiSolver(selectionList, gridState);

    if (result && result.placements.length > bestGlobalScore) {
      bestGlobalScore = result.placements.length;
      bestGlobalResult = result;
    }
  }

  return bestGlobalResult;
}
