document.addEventListener('DOMContentLoaded', () => {
  const handleInput = document.getElementById('handle');
  const statusDiv = document.getElementById('status');

  // Load saved handle if it exists
  chrome.storage.sync.get(['cfHandle'], (result) => {
    if (result.cfHandle) {
      handleInput.value = result.cfHandle;
      loadStats(result.cfHandle);
    }
  });

  // Save handle when button is clicked
  document.getElementById('saveBtn').addEventListener('click', () => {
    const handle = handleInput.value.trim();
    if (handle) {
      chrome.storage.sync.set({ cfHandle: handle }, () => {
        statusDiv.textContent = 'Saved! Refresh the sheet.';
        setTimeout(() => { statusDiv.textContent = ''; }, 2000);
        loadStats(handle);
      });
    }
  });
});

async function loadStats(handle) {
  const solvedCountEl = document.getElementById('solvedCount');
  const totalCountEl = document.getElementById('totalCount');
  
  try {
    // Try to load from cache first
    const cacheKey = `cf_solved_${handle}`;
    const cached = localStorage.getItem(cacheKey);
    
    if (cached) {
      const data = JSON.parse(cached);
      solvedCountEl.textContent = data.data.length || 0;
    } else {
      // Fetch from API
      const res = await fetch(`https://codeforces.com/api/user.status?handle=${handle}`);
      const data = await res.json();
      
      if (data.status === "OK") {
        const solvedSet = new Set();
        data.result.forEach(sub => {
          if (sub.verdict === "OK" && sub.problem.contestId) {
            solvedSet.add(`${sub.problem.contestId}${sub.problem.index}`);
          }
        });
        solvedCountEl.textContent = solvedSet.size;
      }
    }
    
    // Set total count (approximate for Striver's sheet)
    totalCountEl.textContent = '297';
  } catch (e) {
    console.error('Failed to load stats:', e);
  }
}