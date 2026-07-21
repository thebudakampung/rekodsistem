import { initializeApp } from "firebase/app";
import { initializeFirestore, enableIndexedDbPersistence, doc, getDocFromServer } from "firebase/firestore";
import { getAuth, GoogleAuthProvider } from "firebase/auth";

const firebaseConfig = {
  apiKey: "AIzaSyCLS9HD_RkgWtG40dGecFaUnJR3JBYalhI",
  authDomain: "gen-lang-client-0530487281.firebaseapp.com",
  projectId: "gen-lang-client-0530487281",
  storageBucket: "gen-lang-client-0530487281.firebasestorage.app",
  messagingSenderId: "779941560935",
  appId: "1:779941560935:web:6c3d59f2f37248853e0ac2"
};

export const app = initializeApp(firebaseConfig);
export const db = initializeFirestore(app, {
  experimentalForceLongPolling: true,
}, "ai-studio-sistemtuntutanpe-1150ebbe-b430-4a18-87e9-c38ee78803e0");

// Initialize Firebase Authentication
export const auth = getAuth(app);
export const googleProvider = new GoogleAuthProvider();

// Enable offline persistence for robust offline support
enableIndexedDbPersistence(db).catch((err) => {
  if (err.code === "failed-precondition") {
    console.warn("Multiple tabs open, persistence enabled in only one tab.");
  } else if (err.code === "unimplemented") {
    console.warn("The current browser does not support offline persistence.");
  }
});

// CRITICAL CONSTRAINT: Validate Firestore Connection on boot
async function testConnection() {
  try {
    await getDocFromServer(doc(db, "test", "connection"));
  } catch (error) {
    if (error instanceof Error && error.message.includes("the client is offline")) {
      console.error("Please check your Firebase configuration.");
    }
  }
}
testConnection();

