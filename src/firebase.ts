import { initializeApp } from "firebase/app";
import { initializeFirestore } from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyCLS9HD_RkgWtG40dGecFaUnJR3JBYalhI",
  authDomain: "gen-lang-client-0530487281.firebaseapp.com",
  projectId: "gen-lang-client-0530487281",
  storageBucket: "gen-lang-client-0530487281.firebasestorage.app",
  messagingSenderId: "779941560935",
  appId: "1:779941560935:web:6c3d59f2f37248853e0ac2"
};

const app = initializeApp(firebaseConfig);
export const db = initializeFirestore(app, {
  experimentalForceLongPolling: true,
}, "ai-studio-sistemtuntutanpe-1150ebbe-b430-4a18-87e9-c38ee78803e0");

