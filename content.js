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
                    padding: 8px 12px;
                    font-weight: 700;
                    font-size: 13px;
                    vertical-align: middle;
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
                
                // Insert the rating cell after the "Revision" column (last column)
                row.appendChild(ratingCell);
                markedCount++;
            }

            // 2. Mark Solved - Just add checkmark before the problem name once
            if (globalSolvedSet.has(problemId)) {
                if (!link.querySelector('.cf-check-mark')) {
                    link.style.position = "relative";
                    link.style.paddingLeft = "20px";
                    
                    // Add a subtle checkmark icon before the link
                    const check = document.createElement("span");
                    check.className = "cf-check-mark";
                    check.innerText = "✓";
                    check.style.cssText = `
                        position: absolute;
                        left: 2px;
                        top: 50%;
                        transform: translateY(-50%);
                        color: #10b981;
                        font-weight: bold;
                        font-size: 14px;
                    `;
                    link.insertBefore(check, link.firstChild);
                    
                    // Subtle styling without overwhelming the UI
                    link.style.color = "#6b7280";
                    link.style.textDecoration = "none";
                }
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
        padding: 8px 12px;
        font-weight: 600;
        vertical-align: middle;
    `;
    
    // Append to the header row
    headerRow.appendChild(headerCell);
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