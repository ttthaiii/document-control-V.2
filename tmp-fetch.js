const fs = require('fs');

async function testFetch() {
    const url = "https://ttsdoc-cdn.ttthaiii30.workers.dev/sites/2u5Sn5xKysew0sC8yxbw/rfa/VLH-TTS-DPM-MAT-AR-039/1773043166430_VLH-TTS-DPM-MAT-AR-039-00.pdf";
    try {
        const res = await fetch(url, { headers: { "Origin": "http://localhost:3000" } });
        console.log("Status:", res.status);
        console.log("Headers:");
        res.headers.forEach((val, key) => console.log(`${key}: ${val}`));

        // Read body if it's text/json
        const contentType = res.headers.get('content-type');
        if (contentType && contentType.includes('application/json')) {
            const data = await res.json();
            console.log("JSON Body:", data);
        } else {
            console.log("Response is probably a binary PDF file, not printing body.");
        }
    } catch (e) {
        console.error("Fetch failed:", e);
    }
}
testFetch();
