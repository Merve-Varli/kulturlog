import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth"; // Kimlik doğrulama için
import { getFirestore } from "firebase/firestore"; // Veritabanı için

const firebaseConfig = {
  apiKey: "AIzaSyBUhHuCxN4Nt_nUMBcPZgm3c2miEVatkDg",
  authDomain: "kulturlog-yeni.firebaseapp.com",
  projectId: "kulturlog-yeni",
  storageBucket: "kulturlog-yeni.firebasestorage.app",
  messagingSenderId: "819455753316",
  appId: "1:819455753316:web:670b75a7c59073d3afb371"
};

// Firebase'i başlat
const app = initializeApp(firebaseConfig);

// Diğer dosyaların kullanabilmesi için dışa aktar
export const auth = getAuth(app);
export const db = getFirestore(app);