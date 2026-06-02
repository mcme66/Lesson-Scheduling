// ─────────────────────────────────────────────────────────────────────────────
// FIREBASE SETUP — fill in your project values below
//
// Steps:
//   1. Go to https://console.firebase.google.com and create a new project
//      (free Spark plan is plenty — 50K reads/day, 20K writes/day)
//   2. In your project, click "Firestore Database" → Create database
//      Choose "Start in test mode" (you can tighten rules later)
//   3. Click the gear icon → Project Settings → scroll to "Your apps"
//      Click the </> Web icon to register a web app, then copy the config below
//   4. Replace every "YOUR_..." value with the real values from Firebase
//
// NOTE: It is safe to commit this file and deploy it publicly.
// Firebase API keys are not secret — they just identify your project.
// Security comes from your Firestore rules (set in the Firebase console).
//
// Recommended Firestore rules for this app (Firestore → Rules tab):
//
//   rules_version = '2';
//   service cloud.firestore {
//     match /databases/{database}/documents {
//       match /schedule/{document} {
//         allow read: if true;
//         allow write: if true;
//       }
//     }
//   }
// ─────────────────────────────────────────────────────────────────────────────

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import { getFirestore }  from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyCTr1_8b-mj8vSZAf_a_8MgMPo-9TvZkys",
  authDomain: "lessonscheduler-78423.firebaseapp.com",
  projectId: "lessonscheduler-78423",
  storageBucket: "lessonscheduler-78423.firebasestorage.app",
  messagingSenderId: "225411957927",
  appId: "1:225411957927:web:6f9e36278bffc025e14782"
}

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);
