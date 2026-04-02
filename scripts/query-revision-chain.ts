import fs from 'fs';
import path from 'path';
import url from 'url';

const __filename = url.fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const TARGET_RUNNING_NUMBER = 'RFA-SHOP-ESNKR3-0080';

function queryRevisionChain() {
    const dumpPath = path.resolve(__dirname, '../firestore-dump.json');
    if (!fs.existsSync(dumpPath)) {
        console.log('❌ Dump file not found at:', dumpPath);
        return;
    }

    const data = JSON.parse(fs.readFileSync(dumpPath, 'utf8'));
    const rfaDocs = data.rfaDocuments || {};

    // 0. Show dump stats
    console.log(`\n📦 Dump contains ${Object.keys(rfaDocs).length} rfaDocuments total`);

    // Show all unique running numbers containing ESNKR3
    const esnkr3Docs = Object.entries(rfaDocs as Record<string, any>)
        .filter(([, d]) => (d.runningNumber || '').includes('ESNKR3') || (d.siteId || '').includes('ESNKR'));
    console.log(`\n📋 ESNKR3-related docs in dump: ${esnkr3Docs.length}`);
    if (esnkr3Docs.length > 0) {
        esnkr3Docs.slice(0, 10).forEach(([id, d]) => {
            console.log(`  - ${d.runningNumber || 'NO_RUNNING_NUM'} | Rev.${d.revisionNumber} | ${id.substring(0,10)}...`);
        });
    }

    // 1. Find all docs with this running number
    console.log(`\n🔍 Searching for runningNumber = "${TARGET_RUNNING_NUMBER}"...\n`);
    const matches: [string, any][] = [];

    for (const [docId, docData] of Object.entries(rfaDocs) as [string, any][]) {
        if (docData.runningNumber === TARGET_RUNNING_NUMBER) {
            matches.push([docId, docData]);
        }
    }

    if (matches.length === 0) {
        console.log('❌ No documents found with that running number.');
        return;
    }

    matches.sort((a, b) => (a[1].revisionNumber || 0) - (b[1].revisionNumber || 0));

    console.log(`✅ Found ${matches.length} document(s):\n`);

    for (const [docId, d] of matches) {
        console.log(`========== Rev.${d.revisionNumber ?? '?'} ==========`);
        console.log(`  docId            : ${docId}`);
        console.log(`  revisionNumber   : ${d.revisionNumber}`);
        console.log(`  parentRfaId      : ${d.parentRfaId || '❌ ไม่มี'}`);
        console.log(`  previousRevisionId: ${d.previousRevisionId || '❌ ไม่มี'}`);
        console.log(`  revisionHistory  : ${JSON.stringify(d.revisionHistory || [])}`);
        console.log(`  taskUid          : ${d.taskData?.taskUid || '❌ ไม่มี'}`);
        console.log(`  taskName         : ${d.taskData?.taskName || '-'}`);
        console.log(`  status           : ${d.status}`);
        console.log(`  isLatest         : ${d.isLatest}`);
        console.log(`  workflowSteps    : ${(d.workflow || []).length} steps`);
        if ((d.workflow || []).length > 0) {
            console.log(`  workflow actions : ${d.workflow.map((w: any) => `[Rev.${w.revisionNumber ?? '?'}] ${w.action || w.status}`).join(' → ')}`);
        }
        console.log('');
    }

    // 2. Check if revisionHistory chain is intact
    console.log(`\n🔗 Checking chain integrity for the LATEST revision...\n`);
    const latest = matches[matches.length - 1];
    const [latestId, latestData] = latest;
    const chain: string[] = latestData.revisionHistory || [];

    console.log(`Latest doc (Rev.${latestData.revisionNumber}) revisionHistory: [${chain.join(', ')}]`);

    if (chain.length === 0) {
        console.log('⚠️  revisionHistory is EMPTY — ประวัติจะไม่ถูกแสดง!');
    } else {
        console.log('\nChecking each ID in chain exists in dump:');
        for (const linkedId of chain) {
            const exists = !!rfaDocs[linkedId];
            const rev = rfaDocs[linkedId]?.revisionNumber;
            console.log(`  ${exists ? '✅' : '❌'} ${linkedId} ${exists ? `(Rev.${rev})` : '← NOT FOUND in dump!'}`);
        }
    }
}

queryRevisionChain();
