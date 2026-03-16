import { getAdminDb, getAdminBucket } from './src/lib/firebase/admin';

async function verifyPath() {
    const db = getAdminDb();
    
    // Find the document that matches this specific URL
    // Looking at the error log, the URL requested is: 
    // ttsdoc-cdn.ttthaiii30.workers.dev/sites/2u5Sn5xKysew0sC8yxbw/rfa/VLH-TTS-DPM-SHOP-AR-09000/1773382816718_VLH-TTS-DPM-SHOP-AR-090-00.pdf
    const snapshot = await db.collection('rfaDocuments')
        .where('siteId', '==', '2u5Sn5xKysew0sC8yxbw')
        .where('documentNumber', '==', 'VLH-TTS-DPM-SHOP-AR-090 00')
        .get();

    if (snapshot.empty) {
        console.log("Not found with space, trying without space...");
        const snapshot2 = await db.collection('rfaDocuments')
            .where('siteId', '==', '2u5Sn5xKysew0sC8yxbw')
            .where('documentNumber', '==', 'VLH-TTS-DPM-SHOP-AR-09000')
            .get();
            
        if (snapshot2.empty) {
             console.log("Also not found without space, trying with tab...");
             const snapshot3 = await db.collection('rfaDocuments')
                .where('siteId', '==', '2u5Sn5xKysew0sC8yxbw')
                .where('documentNumber', '==', 'VLH-TTS-DPM-SHOP-AR-090\t00')
                .get();
             if (snapshot3.empty) {
                  console.log("Could not find the document.");
                  return;
             } else {
                 snapshot3.docs.forEach(doc => {
                     console.log(JSON.stringify(doc.data().files, null, 2));
                 });
             }
        } else {
            snapshot2.docs.forEach(doc => {
                 console.log(JSON.stringify(doc.data().files, null, 2));
             });
        }
    } else {
         snapshot.docs.forEach(doc => {
             console.log(JSON.stringify(doc.data().files, null, 2));
         });
    }
}

verifyPath();
