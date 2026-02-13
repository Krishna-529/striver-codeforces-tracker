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

    // We select ALL 'a' tags. This is fast, don't worry.
    const links = document.querySelectorAll('a');
    let markedCount = 0;

    links.forEach(link => {
        // If we already marked this SPECIFIC link element, skip it.
        // If the website wiped the DOM and replaced it, this attribute is lost, so we run again. Perfect.
        if (link.dataset.cfProcessed) return;

        const href = link.href;
        
        // Regex to find Codeforces Problem Links (Case Insensitive)
        const match = href.match(/codeforces\.com\/(?:contest|problemset\/problem)\/(\d+)\/(?:.*\/)?([A-Za-z0-9]+)/);
        
        if (match) {
            // Standardize ID (e.g., 1234A)
            const problemId = `${match[1]}${match[2].toUpperCase()}`;
            
            // Mark as processed immediately so we don't duplicate badges
            link.dataset.cfProcessed = "true";

            // 1. Add Rating Badge
            if (globalRatingsMap.has(problemId)) {
                const rating = globalRatingsMap.get(problemId);
                const badge = document.createElement("span");
                badge.innerText = `${rating}`;
                
                // Badge Styles
                badge.style.cssText = `
                    font-size: 10px;
                    font-weight: bold;
                    margin-left: 8px;
                    padding: 2px 6px;
                    border-radius: 10px;
                    color: white;
                    display: inline-block;
                    vertical-align: middle;
                `;

                // Color Coding
                if (rating < 1200) badge.style.backgroundColor = "#808080";       
                else if (rating < 1400) badge.style.backgroundColor = "#008000";  
                else if (rating < 1600) badge.style.backgroundColor = "#03a89e";  
                else if (rating < 1900) badge.style.backgroundColor = "#0000ff";  
                else if (rating < 2100) badge.style.backgroundColor = "#a0a";     
                else if (rating < 2400) badge.style.backgroundColor = "#ff8c00";  
                else badge.style.backgroundColor = "#ff0000";                     

                link.appendChild(badge);
                markedCount++;
            }

            // 2. Mark Solved
            if (globalSolvedSet.has(problemId)) {
                link.style.opacity = "0.6"; 
                link.style.backgroundColor = "#e6fffa";
                
                // Add Checkmark
                const check = document.createElement("span");
                check.innerText = " ✅";
                check.style.marginLeft = "5px";
                link.appendChild(check);
            }
        }
    });
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