let globalSolvedSet = new Set();
let globalRatingsMap = new Map();
let isDataReady = false;

// 1. Initialize
chrome.storage.sync.get(['cfHandle'], (data) => {
    if (data.cfHandle) {
        console.log("CF Tracker: Handle found:", data.cfHandle);
        fetchData(data.cfHandle);
    } else {
        console.log("CF Tracker: No handle saved.");
    }
});

// 2. Fetch Data
async function fetchData(handle) {
    const CACHE_SOLVED_KEY = `cf_solved_${handle}`;
    const CACHE_RATINGS_KEY = `cf_ratings_map`; 
    const SOLVED_EXPIRY = 15 * 60 * 1000;      
    const RATINGS_EXPIRY = 24 * 60 * 60 * 1000; 

    // A. Fetch Solved
    if (isCacheValid(CACHE_SOLVED_KEY, SOLVED_EXPIRY)) {
        console.log("CF Tracker: Loading Solved from Cache");
        globalSolvedSet = new Set(JSON.parse(localStorage.getItem(CACHE_SOLVED_KEY)).data);
    } else {
        console.log("CF Tracker: Fetching Solved from API");
        try {
            const res = await fetch(`https://codeforces.com/api/user.status?handle=${handle}`);
            const data = await res.json();
            if (data.status === "OK") {
                data.result.forEach(sub => {
                    if (sub.verdict === "OK" && sub.problem.contestId) {
                        globalSolvedSet.add(`${sub.problem.contestId}${sub.problem.index}`);
                    }
                });
                saveCache(CACHE_SOLVED_KEY, Array.from(globalSolvedSet));
            }
        } catch (e) { console.error("CF Tracker: Failed to fetch submissions", e); }
    }

    // B. Fetch Ratings
    if (isCacheValid(CACHE_RATINGS_KEY, RATINGS_EXPIRY)) {
        console.log("CF Tracker: Loading Ratings from Cache");
        globalRatingsMap = new Map(Object.entries(JSON.parse(localStorage.getItem(CACHE_RATINGS_KEY)).data));
    } else {
        console.log("CF Tracker: Fetching Ratings from API");
        try {
            const res = await fetch('https://codeforces.com/api/problemset.problems');
            const data = await res.json();
            if (data.status === "OK") {
                data.result.problems.forEach(prob => {
                    if (prob.contestId && prob.rating) {
                        globalRatingsMap.set(`${prob.contestId}${prob.index}`, prob.rating);
                    }
                });
                saveCache(CACHE_RATINGS_KEY, Object.fromEntries(globalRatingsMap));
            }
        } catch (e) { console.error("CF Tracker: Failed to fetch ratings", e); }
    }

    isDataReady = true;
    
    // Hide the right panel statistics
    hideRightPanelStats();
    
    // --- THE FIX: Run immediately, then Watch, AND Poll ---
    scanPage(); 
    startObserver(); 
    setInterval(scanPage, 2000); // Check every 2 seconds (The fallback safety)
}

function startObserver() {
    const observer = new MutationObserver((mutations) => {
        let shouldScan = false;
        for (const mutation of mutations) {
            if (mutation.addedNodes.length > 0) {
                shouldScan = true; 
                break;
            }
        }
        if (shouldScan) scanPage();
    });
    observer.observe(document.body, { childList: true, subtree: true });
}

function scanPage() {
    if (!isDataReady) return;

    // Add Rating column header if not already present
    addRatingColumnHeader();

    // We select ALL 'a' tags. This is fast, don't worry.
    const links = document.querySelectorAll('a');
    let markedCount = 0;

    links.forEach(link => {
        // If we already marked this SPECIFIC link element, skip it.
        if (link.dataset.cfProcessed) return;

        const href = link.href;
        
        // Regex to find Codeforces Problem Links (Case Insensitive)
        const match = href.match(/codeforces\.com\/(?:contest|problemset\/problem)\/(\d+)\/(?:.*\/)?([A-Za-z0-9]+)/);
        
        if (match) {
            // Standardize ID (e.g., 1234A)
            const problemId = `${match[1]}${match[2].toUpperCase()}`;
            
            // Mark as processed immediately
            link.dataset.cfProcessed = "true";

            // Find the row (tr) containing this link
            let row = link.closest('tr');
            if (!row) return;

            // 1. Add Rating Cell
            if (globalRatingsMap.has(problemId) && !row.querySelector('.cf-rating-cell')) {
                const rating = globalRatingsMap.get(problemId);
                
                // Create new table cell for rating
                const ratingCell = document.createElement('td');
                ratingCell.className = 'cf-rating-cell';
                ratingCell.style.cssText = `
                    text-align: center;
                    padding: 8px 4px;
                    font-weight: 700;
                    font-size: 13px;
                    vertical-align: middle;
                    width: 50px;
                    min-width: 50px;
                    max-width: 50px;
                `;
                
                ratingCell.innerText = rating;
                
                // Color coding - text color only, no background
                if (rating < 1200) ratingCell.style.color = "#808080";       
                else if (rating < 1400) ratingCell.style.color = "#008000";  
                else if (rating < 1600) ratingCell.style.color = "#03a89e";  
                else if (rating < 1900) ratingCell.style.color = "#0000ff";  
                else if (rating < 2100) ratingCell.style.color = "#a0a";     
                else if (rating < 2400) ratingCell.style.color = "#ff8c00";  
                else ratingCell.style.color = "#ff0000";
                
                // Insert rating cell at the correct position (after Practice, before Note)
                // Table structure: Status(0) | Problem(1) | Practice(2) | [Rating should be 3] | Note(4) | Revision(5)
                const cells = row.querySelectorAll('td');
                if (cells.length >= 4) {
                    // Insert before the 4th cell (index 3), making rating the new 4th column
                    row.insertBefore(ratingCell, cells[3]);
                } else {
                    row.appendChild(ratingCell);
                }
                markedCount++;
            }

            // 2. Mark Solved - Just dim the text, no checkmark
            if (globalSolvedSet.has(problemId)) {
                // Subtle styling to show solved status
                link.style.color = "#6b7280";
                link.style.textDecoration = "none";
            }
        }
    });
}

function addRatingColumnHeader() {
    // Find the table header row
    const headerRow = document.querySelector('thead tr, table tr:first-child');
    if (!headerRow || headerRow.querySelector('.cf-rating-header')) return;
    
    // Create header cell for Rating column
    const headerCell = document.createElement('th');
    headerCell.className = 'cf-rating-header';
    headerCell.innerText = 'Rating';
    headerCell.style.cssText = `
        text-align: center;
        padding: 8px 4px;
        font-weight: 600;
        vertical-align: middle;
        width: 50px;
        min-width: 50px;
        max-width: 50px;
    `;
    
    // Insert rating header at the correct position (after Practice, before Note)
    // Header structure: Status(0) | Problem(1) | Practice(2) | [Rating should be 3] | Note(4) | Revision(5)
    const headers = headerRow.querySelectorAll('th');
    if (headers.length >= 4) {
        // Insert before the 4th header (index 3), making rating the new 4th column
        headerRow.insertBefore(headerCell, headers[3]);
    } else {
        headerRow.appendChild(headerCell);
    }
}

function hideRightPanelStats() {
    // Inject CSS to hide the right panel progress statistics and widen problem column
    if (!document.getElementById('cf-tracker-hide-stats')) {
        const style = document.createElement('style');
        style.id = 'cf-tracker-hide-stats';
        style.textContent = `
            /* Hide the entire right sidebar */
            aside {
                display: none !important;
            }
            
            /* Make Problem column wider */
            td:nth-child(2),
            th:nth-child(2) {
                min-width: 300px !important;
            }
        `;
        document.head.appendChild(style);
    }
}

// Helpers
function isCacheValid(key, duration) {
    const item = localStorage.getItem(key);
    if (!item) return false;
    const parsed = JSON.parse(item);
    return (Date.now() - parsed.timestamp) < duration;
}

function saveCache(key, data) {
    localStorage.setItem(key, JSON.stringify({
        timestamp: Date.now(),
        data: data
    }));
}