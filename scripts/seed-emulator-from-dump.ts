
import { initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';
import * as fs from 'fs';
import * as path from 'path';

// Force Emulator Mode
process.env.FIRESTORE_EMULATOR_HOST = '127.0.0.1:8080';
process.env.FIREBASE_AUTH_EMULATOR_HOST = '127.0.0.1:9099';
process.env.FIREBASE_STORAGE_EMULATOR_HOST = '127.0.0.1:9199';

// Initialize Admin SDK (No credentials needed for emulator)
const app = initializeApp({ projectId: "ttsdocumentcontrol" });
const db = getFirestore(app);
const auth = getAuth(app);

async function seedEmulator() {
    console.log('🌱 Seeding Emulator from firestore-dump.json...');

    const dumpPath = path.resolve(process.cwd(), 'firestore-dump.json');
    if (!fs.existsSync(dumpPath)) {
        console.error('❌ firestore-dump.json not found! Run "npm run dump-data" first.');
        process.exit(1);
    }

    const data = JSON.parse(fs.readFileSync(dumpPath, 'utf-8'));

    // 1. Seed Users (Auth + Firestore)
    console.log(`\n👥 Seeding ${data.users.length} Users...`);
    for (const user of data.users) {
        try {
            // Create Auth User
            await auth.createUser({
                uid: user.id,
                email: user.email,
                password: 'password123', // Default password for testing
                emailVerified: true
            });
            process.stdout.write('+');
        } catch (e: any) {
            if (e.code === 'auth/uid-already-exists') {
                process.stdout.write('.');
            } else {
                console.error(`\n   Failed to create auth for ${user.email}: ${e.message}`);
            }
        }

        // Create Firestore Document
        await db.collection('users').doc(user.id).set({
            ...user,
            createdAt: user.createdAt ? new Date(user.createdAt) : null
        }, { merge: true });
    }

    // 2. Seed Sites
    console.log(`\n\n🏗️ Seeding ${data.sites.length} Sites...`);
    for (const site of data.sites) {
        const { categories, ...siteData } = site;

        // Create Site Doc
        await db.collection('sites').doc(site.id).set({
            ...siteData,
            createdAt: site.createdAt ? new Date(site.createdAt) : null
        });

        // Create Sub-collections (Categories)
        if (categories && categories.length > 0) {
            for (const cat of categories) {
                await db.collection('sites').doc(site.id).collection('categories').doc(cat.id).set({
                    ...cat,
                    createdAt: cat.createdAt ? new Date(cat.createdAt) : null
                });
            }
        }
    }

    // 3. Seed Counters
    console.log(`\n🔢 Seeding ${data.counters.length} Counters...`);
    for (const counter of data.counters) {
        await db.collection('counters').doc(counter.id).set({
            ...counter,
            createdAt: counter.createdAt ? new Date(counter.createdAt) : null
        });
    }

    // 4. Seed RFA Documents
    console.log(`\n📋 Seeding ${data.rfaDocuments.length} RFA Documents...`);
    for (const doc of data.rfaDocuments) {
        await db.collection('rfaDocuments').doc(doc.id).set({
            ...doc,
            createdAt: doc.createdAt ? new Date(doc.createdAt) : null,
            updatedAt: doc.updatedAt ? new Date(doc.updatedAt) : (doc.createdAt ? new Date(doc.createdAt) : new Date())
        });
    }

    // 5. Seed RFI Documents
    console.log(`\n❓ Seeding ${data.rfiDocuments.length} RFI Documents...`);
    for (const doc of data.rfiDocuments) {
        await db.collection('rfiDocuments').doc(doc.id).set({
            ...doc,
            createdAt: doc.createdAt ? new Date(doc.createdAt) : null
        });
    }

    // 6. Seed Invitations
    console.log(`\n✉️ Seeding ${data.invitations.length} Invitations...`);
    for (const note of data.invitations) {
        await db.collection('invitations').doc(note.id).set({
            ...note,
            createdAt: note.createdAt ? new Date(note.createdAt) : null,
            expiresAt: note.expiresAt ? new Date(note.expiresAt) : null,
            acceptedAt: note.acceptedAt ? new Date(note.acceptedAt) : null
        });
    }

    console.log('\n\n✅ Seeding Complete! You can now log in with any user using password "password123"');
}

seedEmulator().catch(console.error);
