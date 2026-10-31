import { db } from "../firebase";
import { 
  collection, 
  addDoc, 
  getDocs, 
  query, 
  where, 
  deleteDoc, 
  doc, 
  updateDoc,
  serverTimestamp,
  orderBy,
  onSnapshot 
} from "firebase/firestore";

// --- KÜTÜPHANE İŞLEMLERİ ---

export const addMediaToLibrary = async (userId, mediaData) => {
  try {
    const docRef = await addDoc(collection(db, "userLibrary"), {
      userId,
      ...mediaData,
      status: "pending",
      rating: "",
      note: "",
      addedAt: serverTimestamp()
    });
    return { success: true, docId: docRef.id };
  } catch (error) {
    console.error("Ekleme hatası:", error);
    return { success: false, error };
  }
};

export const getUserLibrary = async (userId) => {
  try {
    const q = query(collection(db, "userLibrary"), where("userId", "==", userId));
    const querySnapshot = await getDocs(q);
    return querySnapshot.docs.map(doc => ({
      docId: doc.id,
      ...doc.data()
    }));
  } catch (error) {
    console.error("Veri çekme hatası:", error);
    return [];
  }
};

export const deleteMediaFromLibrary = async (docId) => {
  try {
    await deleteDoc(doc(db, "userLibrary", docId));
    return { success: true };
  } catch (error) {
    return { success: false, error };
  }
};

export const updateMediaLog = async (docId, rating, note) => {
  try {
    const docRef = doc(db, "userLibrary", docId);
    await updateDoc(docRef, { rating, note });
    return { success: true };
  } catch (error) {
    return { success: false, error };
  }
};

export const updateMediaStatus = async (docId, status) => {
  try {
    const docRef = doc(db, "userLibrary", docId);
    await updateDoc(docRef, { status });
    return { success: true };
  } catch (error) {
    return { success: false, error };
  }
};

// --- SOSYAL AKIŞ (TIMELINE) İŞLEMLERİ ---

export const createPost = async (userId, userEmail, item, rating, note) => {
  try {
    await addDoc(collection(db, "posts"), {
      userId,
      userEmail,
      title: item.title,
      image: item.image,
      type: item.type,
      rating,
      note,
      createdAt: serverTimestamp(),
      comments: [] 
    });
    return { success: true };
  } catch (error) {
    console.error("Post oluşturma hatası:", error);
    return { success: false };
  }
};

export const getTimelinePosts = (callback) => {
  const q = query(collection(db, "posts"), orderBy("createdAt", "desc"));
  return onSnapshot(q, (snapshot) => {
    const posts = snapshot.docs.map(doc => ({
      docId: doc.id,
      ...doc.data()
    }));
    callback(posts);
  });
};

// --- ADMIN İŞLEMLERİ ---
export const deleteCommentAdmin = async (postId, commentId) => {
  try {
    const commentRef = doc(db, `posts/${postId}/comments`, commentId);
    await deleteDoc(commentRef);
    return { success: true };
  } catch (error) {
    console.error("Yorum silme hatası:", error);
    return { success: false, error };
  }
};

export const sendSupportRequest = async (userId, userEmail, message) => {
  try {
    await addDoc(collection(db, "supportRequests"), {
      userId,
      userEmail,
      message,
      createdAt: serverTimestamp(),
      status: "pending"
    });
    return { success: true };
  } catch (error) {
    console.error("Destek talebi hatası:", error);
    return { success: false };
  }
};