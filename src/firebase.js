// firebase.js
import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";
import { getAuth } from "firebase/auth";
import { getStorage } from "firebase/storage";  // Add this import

const firebaseConfig = {
  apiKey: "AIzaSyCgtr7eJpGuiBZWRGYgWEBZkM7d7HHkKXs",
  authDomain: "chosen-generation-academy.firebaseapp.com",
  projectId: "chosen-generation-academy",
  storageBucket: "chosen-generation-academy.appspot.com",
  messagingSenderId: "997808063090",
  appId: "1:997808063090:web:18a4cbf13dd5d25fd238eb",
  measurementId: "G-3DXRQ2D9B4"
};

const app = initializeApp(firebaseConfig);

export const db = getFirestore(app);
export const auth = getAuth(app);
export const storage = getStorage(app);  // Add this export