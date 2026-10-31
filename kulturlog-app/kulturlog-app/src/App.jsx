import { useState, useEffect } from "react";
import { BrowserRouter as Router, Routes, Route, Link, Navigate, useNavigate, useParams, useLocation } from "react-router-dom";
import { auth, db } from "./firebase";
import { 
  signInWithEmailAndPassword, 
  createUserWithEmailAndPassword, 
  onAuthStateChanged, 
  signOut,
  sendPasswordResetEmail
} from "firebase/auth";
import { 
  collection, 
  query, 
  orderBy, 
  onSnapshot, 
  addDoc, 
  serverTimestamp, 
  doc, 
  getDoc, 
  setDoc, 
  deleteDoc,
  updateDoc,
  where,
  arrayUnion,
  arrayRemove,
  getDocs
} from "firebase/firestore";
import { searchMovies, searchTvSeries, searchBooks } from "./services/api";
import { 
  addMediaToLibrary, 
  getUserLibrary, 
  deleteMediaFromLibrary, 
  updateMediaLog,
  updateMediaStatus,
  createPost,
  deleteCommentAdmin,
  sendSupportRequest 
} from "./services/database";

const normalizeTurkish = (text) => {
  if (!text) return "";
  return text
    .replace(/Ğ/g, 'G')
    .replace(/ğ/g, 'g')
    .replace(/Ü/g, 'U')
    .replace(/ü/g, 'u')
    .replace(/Ş/g, 'S')
    .replace(/ş/g, 's')
    .replace(/İ/g, 'I')
    .replace(/ı/g, 'i')
    .replace(/Ö/g, 'O')
    .replace(/ö/g, 'o')
    .replace(/Ç/g, 'C')
    .replace(/ç/g, 'c');
};

function App() {
  const [user, setUser] = useState(null);
  const [darkMode, setDarkMode] = useState(true);
  const [toast, setToast] = useState({ show: false, message: "", type: "success" });
  
  const [leaderboard, setLeaderboard] = useState([]);
  const [bannedEmails, setBannedEmails] = useState([]);
  const [warnings, setWarnings] = useState([]);

  const [notifications, setNotifications] = useState([]);
  const [showNotifs, setShowNotifs] = useState(false);
  
  // YENİ: Profesyonel Yasaklama Bildirimi State'i
  const [bannedModalOpen, setBannedModalOpen] = useState(false);

  const showToast = (message, type = "success") => {
    setToast({ show: true, message, type });
    setTimeout(() => setToast({ show: false, message: "", type: "success" }), 4000);
  };

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      setUser(currentUser);
      if (currentUser && currentUser.uid !== "guest") {
        await setDoc(doc(db, "users", currentUser.uid), { email: currentUser.email, uid: currentUser.uid }, { merge: true });
      }
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    const unsub = onSnapshot(collection(db, "bannedUsers"), s => {
      setBannedEmails(s.docs.map(d => d.data().email));
    });
    return () => unsub();
  }, []);

  useEffect(() => {
    const unsub = onSnapshot(collection(db, "posts"), async (s) => {
      const counts = {};
      const oneWeekAgo = new Date();
      oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);

      s.docs.forEach(d => {
        const post = d.data();
        const postDate = post.createdAt?.toDate();
        if (postDate && postDate >= oneWeekAgo) {
          const uid = post.userId;
          if (!counts[uid]) counts[uid] = { email: post.userEmail, count: 0, uid: uid };
          counts[uid].count++;
        }
      });
      
      const sorted = Object.values(counts).sort((a,b) => b.count - a.count).slice(0, 3);
      const topUsers = await Promise.all(sorted.map(async (u) => {
        const p = await getDoc(doc(db, "profiles", u.uid));
        return { ...u, avatar: p.exists() ? p.data().avatar : "" };
      }));

      setLeaderboard(topUsers);
    });
    return () => unsub();
  }, []);

  useEffect(() => {
    if (user && user.uid !== "guest") {
      if (bannedEmails.includes(user.email)) {
        setBannedModalOpen(true);
        return;
      }
      const q = query(collection(db, "warnings"), where("toEmail", "==", user.email));
      const unsub = onSnapshot(q, s => setWarnings(s.docs.map(d => ({id: d.id, ...d.data()}))));
      return () => unsub();
    }
  }, [user, bannedEmails]);

  useEffect(() => {
    if (user && user.uid !== "guest") {
      const q = query(collection(db, "notifications"), where("toUserId", "==", user.uid));
      const unsub = onSnapshot(q, s => {
        const notifs = s.docs.map(d => ({id: d.id, ...d.data()}));
        notifs.sort((a, b) => (b.createdAt?.toMillis() || 0) - (a.createdAt?.toMillis() || 0));
        setNotifications(notifs);
      });
      return () => unsub();
    }
  }, [user]);

  const handleLogout = async () => {
    if (user?.uid !== "guest") await signOut(auth);
    setUser(null);
  };

  const markNotifAsRead = async (id) => {
    await updateDoc(doc(db, "notifications", id), { read: true });
  };

  const markAllNotifsAsRead = async () => {
    notifications.filter(n => !n.read).forEach(n => {
      updateDoc(doc(db, "notifications", n.id), { read: true });
    });
  };

  const theme = {
    bg: darkMode ? "#0F172A" : "#F8FAFC",       
    card: darkMode ? "#1E293B" : "#FFFFFF",     
    text: darkMode ? "#F8FAFC" : "#0F172A",     
    subText: darkMode ? "#94A3B8" : "#64748B",  
    accent: "#6366F1",                          
    border: darkMode ? "#334155" : "#E2E8F0",   
    star: "#FBBF24",                            
    green: "#10B981",                           
    red: "#EF4444"                              
  };

  if (!user) return <AuthPage theme={theme} setUser={setUser} showToast={showToast} darkMode={darkMode} setDarkMode={setDarkMode} />;

  const username = user.uid === "guest" ? "Misafir" : user.email.split("@")[0];
  const isAdmin = user.email === "admin@kulturlog.com";
  const unreadCount = notifications.filter(n => !n.read).length;

  return (
    <Router>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&display=swap');
        * { font-family: 'Inter', sans-serif !important; }
        ::-webkit-scrollbar { width: 8px; }
        ::-webkit-scrollbar-track { background: ${theme.bg}; }
        ::-webkit-scrollbar-thumb { background: ${theme.border}; border-radius: 10px; }
        ::-webkit-scrollbar-thumb:hover { background: ${theme.subText}; }
      `}</style>

      <div style={{ minHeight: "100vh", backgroundColor: theme.bg, color: theme.text, transition: "all 0.3s", position: "relative" }}>
        
        {toast.show && (
          <div style={{ position: "fixed", top: "85px", right: "25px", zIndex: 1000, padding: "14px 25px", borderRadius: "8px", color: "#FFFFFF", fontWeight: "bold", backgroundColor: toast.type === "success" ? theme.green : theme.red, boxShadow: "0 5px 20px rgba(0,0,0,0.3)" }}>
            {toast.message}
          </div>
        )}

        {bannedModalOpen && (
          <div style={{ position: "fixed", top: 0, left: 0, right: 0, bottom: 0, backgroundColor: "rgba(0,0,0,0.85)", zIndex: 9999, display: "flex", justifyContent: "center", alignItems: "center" }}>
            <div style={{ backgroundColor: theme.card, padding: "40px", borderRadius: "12px", maxWidth: "400px", textAlign: "center", border: `2px solid ${theme.red}`, boxShadow: "0 20px 50px rgba(0,0,0,0.5)" }}>
              <div style={{ fontSize: "50px", marginBottom: "15px" }}>🚫</div>
              <h2 style={{ color: theme.red, marginTop: 0 }}>Hesabınız Devre Dışı</h2>
              <p style={{ color: theme.text, marginBottom: "25px", lineHeight: "1.5" }}>Hesabınız topluluk kurallarını ihlal ettiği gerekçesiyle yöneticiler tarafından kalıcı olarak uzaklaştırılmıştır.</p>
              <button onClick={() => { setBannedModalOpen(false); signOut(auth); setUser(null); }} style={{ ...primaryBtnStyle(theme), backgroundColor: theme.red, width: "100%" }}>Sistemden Çıkış Yap</button>
            </div>
          </div>
        )}

        {warnings.length > 0 && !bannedModalOpen && (
          <div style={{ position: "fixed", top: 0, left: 0, right: 0, bottom: 0, backgroundColor: "rgba(0,0,0,0.85)", zIndex: 9998, display: "flex", justifyContent: "center", alignItems: "center" }}>
            <div style={{ backgroundColor: theme.card, padding: "40px", borderRadius: "12px", maxWidth: "450px", textAlign: "center", border: `2px solid ${theme.red}` }}>
              <h2 style={{ color: theme.red, marginTop: 0, fontSize: "28px" }}>⚠️ YÖNETİCİ UYARISI</h2>
              <p style={{ fontSize: "16px", lineHeight: "1.6", color: theme.text, marginBottom: "25px" }}>{warnings[0].message}</p>
              <button onClick={() => deleteDoc(doc(db, "warnings", warnings[0].id))} style={{ ...primaryBtnStyle(theme), backgroundColor: theme.red, color: "white", border: "none", width: "100%", fontSize: "16px", padding: "12px" }}>Okudum ve Anladım</button>
            </div>
          </div>
        )}

        <header style={{ backgroundColor: theme.card, padding: "18px 50px", display: "flex", justifyContent: "space-between", alignItems: "center", position: "sticky", top: 0, zIndex: 100, borderBottom: `1px solid ${theme.border}`, boxShadow: "0 4px 6px -1px rgba(0, 0, 0, 0.05)" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "40px" }}>
            <h2 style={{ color: theme.accent, margin: 0, fontSize: "28px", fontWeight: "900", letterSpacing: "-0.5px" }}>KültürLog</h2>
            <nav style={{ display: "flex", gap: "25px", alignItems: "center" }}>
              <Link to="/" style={{ color: theme.text, textDecoration: "none", fontWeight: "600", fontSize: "16px" }}>Ana Sayfa</Link>
              {!isAdmin && user.uid !== "guest" && (
                <Link to="/profile" style={{ color: theme.text, textDecoration: "none", fontWeight: "600", fontSize: "16px" }}>Profilim</Link>
              )}
              {isAdmin && (
                <Link to="/admin" style={{ color: theme.accent, textDecoration: "none", fontWeight: "800", fontSize: "16px", display: "flex", alignItems: "center", gap: "6px" }}>
                  🛡️ Admin Paneli
                </Link>
              )}
            </nav>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: "20px" }}>
            <span style={{ color: theme.subText, fontSize: "15px", fontWeight: "500" }}>Hoş geldin, <b style={{ color: theme.text }}>{username}</b></span>
            
            {!isAdmin && user.uid !== "guest" && (
              <div style={{ position: "relative" }}>
                <button onClick={() => setShowNotifs(!showNotifs)} style={{ background: "none", border: `1px solid ${theme.border}`, color: theme.text, padding: "8px 12px", borderRadius: "8px", cursor: "pointer", display: "flex", alignItems: "center", transition: "all 0.2s" }}>
                  🔔 {unreadCount > 0 && <span style={{ background: theme.red, color: "white", borderRadius: "50%", padding: "2px 6px", fontSize: "11px", marginLeft: "5px", fontWeight: "bold" }}>{unreadCount}</span>}
                </button>
                {showNotifs && (
                  <div style={{ position: "absolute", top: "100%", right: 0, marginTop: "10px", width: "320px", background: theme.card, border: `1px solid ${theme.border}`, borderRadius: "12px", boxShadow: "0 10px 30px rgba(0,0,0,0.3)", zIndex: 1000, maxHeight: "400px", overflowY: "auto" }}>
                    <div style={{ padding: "15px", borderBottom: `1px solid ${theme.border}`, display: "flex", justifyContent: "space-between", alignItems: "center", backgroundColor: theme.bg }}>
                      <h4 style={{ margin: 0, fontSize: "15px", color: theme.text }}>Bildirimler</h4>
                      {unreadCount > 0 && <button onClick={markAllNotifsAsRead} style={{ background: "none", border: "none", color: theme.accent, cursor: "pointer", fontSize: "12px", fontWeight: "bold" }}>Tümünü Okundu İşaretle</button>}
                    </div>
                    {notifications.length === 0 ? (
                      <div style={{ padding: "20px", textAlign: "center", color: theme.subText, fontSize: "14px" }}>Henüz bir bildiriminiz yok.</div>
                    ) : (
                      notifications.map(n => (
                        <div key={n.id} onClick={() => markNotifAsRead(n.id)} style={{ padding: "15px", borderBottom: `1px solid ${theme.border}`, background: n.read ? "transparent" : `${theme.accent}15`, cursor: "pointer", transition: "background 0.2s" }}>
                          <div style={{ fontSize: "13px", color: theme.text, lineHeight: "1.5" }}>
                            <b style={{color: theme.accent}}>{n.fromUserEmail.split('@')[0]}</b> 
                            {n.type === "like" ? " gönderini beğendi: " : n.type === "dislike" ? " gönderini beğenmedi: " : n.type === "broadcast" ? " genel sistem duyurusu: " : " gönderine yorum yaptı: "}
                            <i style={{fontWeight: "600"}}>"{n.postTitle}"</i>
                          </div>
                          <div style={{ fontSize: "11px", color: theme.subText, marginTop: "6px" }}>{n.createdAt?.toDate().toLocaleString()}</div>
                        </div>
                      ))
                    )}
                  </div>
                )}
              </div>
            )}

            <button onClick={() => setDarkMode(!darkMode)} style={{ background: "none", border: `1px solid ${theme.border}`, color: theme.text, padding: "8px 12px", borderRadius: "8px", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
              {darkMode ? "☀️" : "🌙"}
            </button>
            <button onClick={handleLogout} style={{ backgroundColor: `${theme.red}15`, color: theme.red, border: "none", padding: "8px 16px", borderRadius: "8px", cursor: "pointer", fontWeight: "bold", transition: "all 0.2s" }}>Çıkış</button>
          </div>
        </header>

        <main style={{ padding: "40px 50px", maxWidth: "1300px", margin: "0 auto", paddingBottom: "100px" }}>
          <Routes>
            <Route path="/" element={<Timeline theme={theme} user={user} username={username} showToast={showToast} isAdmin={isAdmin} bannedEmails={bannedEmails} leaderboard={leaderboard} />} />
            <Route path="/profile" element={user.uid === "guest" || isAdmin ? <Navigate to="/" /> : <ProfilePage theme={theme} user={user} username={username} showToast={showToast} />} />
            <Route path="/user/:userId" element={<OtherUserProfile theme={theme} user={user} bannedEmails={bannedEmails} />} />
            <Route path="/weekly/:userId" element={<WeeklyUserPosts theme={theme} user={user} showToast={showToast} bannedEmails={bannedEmails} />} />
            <Route path="/admin" element={isAdmin ? <AdminPanel theme={theme} showToast={showToast} bannedEmails={bannedEmails} /> : <Navigate to="/" />} />
            <Route path="*" element={<Navigate to="/" />} />
          </Routes>
        </main>
      </div>
    </Router>
  );
}

// YENİ: Profesyonel Özel Onay Modalı (Tüm silme ve ban işlemleri için)
function CustomConfirm({ isOpen, title, text, onConfirm, onCancel, theme, confirmText = "Evet, Onaylıyorum", cancelText = "İptal", isDanger = true }) {
  if (!isOpen) return null;
  return (
    <div style={{ position: "fixed", top: 0, left: 0, right: 0, bottom: 0, backgroundColor: "rgba(0,0,0,0.7)", zIndex: 9999, display: "flex", justifyContent: "center", alignItems: "center" }}>
      <div style={{ backgroundColor: theme.card, padding: "30px", borderRadius: "16px", maxWidth: "400px", width: "90%", textAlign: "center", border: `1px solid ${theme.border}`, boxShadow: "0 20px 40px rgba(0,0,0,0.3)" }}>
        {isDanger && <div style={{ fontSize: "45px", marginBottom: "15px" }}>⚠️</div>}
        <h3 style={{ margin: "0 0 10px 0", color: theme.text, fontSize: "20px", fontWeight: "900" }}>{title}</h3>
        <p style={{ color: theme.subText, fontSize: "15px", marginBottom: "25px", lineHeight: "1.5" }}>{text}</p>
        <div style={{ display: "flex", gap: "15px" }}>
          <button onClick={onCancel} style={{ flex: 1, padding: "12px", backgroundColor: theme.bg, color: theme.text, border: `1px solid ${theme.border}`, borderRadius: "8px", cursor: "pointer", fontWeight: "bold" }}>{cancelText}</button>
          <button onClick={onConfirm} style={{ flex: 1, padding: "12px", backgroundColor: isDanger ? theme.red : theme.accent, color: "#FFFFFF", border: "none", borderRadius: "8px", cursor: "pointer", fontWeight: "bold" }}>{confirmText}</button>
        </div>
      </div>
    </div>
  );
}

// YENİ: Profesyonel Giriş İsteme Modalı (Uyarı yazısı için)
function CustomPrompt({ isOpen, title, text, placeholder, onConfirm, onCancel, theme }) {
  const [inputValue, setInputValue] = useState("");
  useEffect(() => { setInputValue(""); }, [isOpen]);
  if (!isOpen) return null;
  return (
    <div style={{ position: "fixed", top: 0, left: 0, right: 0, bottom: 0, backgroundColor: "rgba(0,0,0,0.7)", zIndex: 9999, display: "flex", justifyContent: "center", alignItems: "center" }}>
      <div style={{ backgroundColor: theme.card, padding: "30px", borderRadius: "16px", maxWidth: "450px", width: "90%", textAlign: "center", border: `1px solid ${theme.border}`, boxShadow: "0 20px 40px rgba(0,0,0,0.3)" }}>
        <h3 style={{ margin: "0 0 10px 0", color: theme.text, fontSize: "20px", fontWeight: "900" }}>{title}</h3>
        <p style={{ color: theme.subText, fontSize: "14px", marginBottom: "20px", lineHeight: "1.5" }}>{text}</p>
        <textarea 
          value={inputValue} 
          onChange={e => setInputValue(e.target.value)} 
          placeholder={placeholder} 
          style={{ ...inputStyle(theme), height: "80px", resize: "none", marginBottom: "25px" }} 
          autoFocus 
        />
        <div style={{ display: "flex", gap: "15px" }}>
          <button onClick={onCancel} style={{ flex: 1, padding: "12px", backgroundColor: theme.bg, color: theme.text, border: `1px solid ${theme.border}`, borderRadius: "8px", cursor: "pointer", fontWeight: "bold" }}>İptal</button>
          <button onClick={() => onConfirm(inputValue)} style={{ flex: 1, padding: "12px", backgroundColor: theme.accent, color: "#FFFFFF", border: "none", borderRadius: "8px", cursor: "pointer", fontWeight: "bold" }}>Gönder</button>
        </div>
      </div>
    </div>
  );
}

// GÜNCELLENDİ: Sağ sütuna uyumlu olması için fixed pozisyonu kaldırıldı.
function LeaderboardWidget({ leaderboard, bannedEmails, theme }) {
  const navigate = useNavigate();
  return (
    <div style={{ backgroundColor: theme.card, padding: "20px", borderRadius: "16px", border: `1px solid ${theme.border}`, boxShadow: "0 4px 6px -1px rgba(0,0,0,0.05)" }}>
      <h3 style={{ margin: "0 0 15px 0", color: theme.text, fontSize: "15px", textAlign: "center", paddingBottom: "10px", fontWeight: "800", borderBottom: `1px solid ${theme.border}` }}>🏆 Öne Çıkan Kullanıcılar</h3>
      {leaderboard.map((u, i) => (
        <div key={i} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "12px", fontSize: "14px" }}>
          <div onClick={() => navigate(`/weekly/${u.uid}`)} style={{ display: "flex", alignItems: "center", gap: "8px", cursor: "pointer" }}>
            <span style={{ color: theme.subText, fontWeight: "bold" }}>{i+1}.</span> 
            {u.avatar ? (
              <img src={u.avatar} style={{ width: "28px", height: "28px", borderRadius: "50%", objectFit: "cover", filter: bannedEmails.includes(u.email) ? "grayscale(100%) brightness(60%)" : "none" }} />
            ) : (
              <div style={{ width: "28px", height: "28px", borderRadius: "50%", backgroundColor: bannedEmails.includes(u.email) ? theme.red : theme.accent, display: "flex", justifyContent: "center", alignItems: "center", fontWeight: "bold", color: "#FFFFFF", fontSize: "13px", filter: bannedEmails.includes(u.email) ? "grayscale(100%)" : "none" }}>
                {u.email[0].toUpperCase()}
              </div>
            )}
            <span style={{ fontWeight: "600", opacity: bannedEmails.includes(u.email) ? 0.6 : 1 }}>
              {bannedEmails.includes(u.email) ? <del style={{color: theme.red}}>{u.email.split("@")[0]}</del> : u.email.split("@")[0]}
            </span>
          </div>
          <span style={{ color: theme.accent, fontWeight: "bold", backgroundColor: `${theme.accent}15`, padding: "4px 8px", borderRadius: "6px", fontSize: "11px" }}>{u.count} İçerik</span>
        </div>
      ))}
      {leaderboard.length === 0 && <p style={{ fontSize: "13px", textAlign: "center", color: theme.subText }}>Bu hafta henüz gönderi yok.</p>}
    </div>
  );
}

function WeeklyUserPosts({ theme, user, showToast, bannedEmails }) {
  const { userId } = useParams();
  const [posts, setPosts] = useState([]);
  const [authorMail, setAuthorMail] = useState("");
  const navigate = useNavigate();

  useEffect(() => {
    const q = query(collection(db, "posts"), orderBy("createdAt", "desc"));
    const unsub = onSnapshot(q, (snapshot) => {
      const oneWeekAgo = new Date();
      oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);
      
      const filtered = snapshot.docs
        .map(d => ({ docId: d.id, ...d.data() }))
        .filter(p => p.userId === userId && p.createdAt?.toDate() >= oneWeekAgo)
        .filter(p => !p.hidden || p.userEmail === user?.email || (user?.email === "admin@kulturlog.com"));
        
      setPosts(filtered);
      
      if (filtered.length > 0) {
        setAuthorMail(filtered[0].userEmail);
      } else {
        getDoc(doc(db, "profiles", userId)).then(d => {
           if(d.exists() && !authorMail) setAuthorMail("Bu Kullanıcı");
        });
      }
    });
    return () => unsub();
  }, [userId, user]);

  return (
    <div>
      <button onClick={() => navigate("/")} style={{ background: "none", border: "none", color: theme.accent, cursor: "pointer", marginBottom: "20px", fontWeight: "bold", fontSize: "16px" }}>← Ana Sayfaya Dön</button>
      <h2 style={{ borderBottom: `1px solid ${theme.border}`, paddingBottom: "15px", marginBottom: "30px", fontSize: "24px" }}>📅 {authorMail ? authorMail.split("@")[0] : "Kullanıcı"} - Bu Haftaki Gönderileri</h2>
      <div style={{ maxWidth: "800px", margin: "0 auto" }}>
        {posts.length === 0 ? (
          <div style={{ textAlign: "center", padding: "40px", backgroundColor: theme.card, borderRadius: "12px", border: `1px solid ${theme.border}` }}>
            <p style={{ color: theme.subText, fontStyle: "italic", fontSize: "16px" }}>Bu hafta paylaşılan bir gönderi bulunmuyor.</p>
          </div>
        ) : (
          posts.map(post => <PostCard key={post.docId} post={post} theme={theme} user={user} navigate={navigate} showToast={showToast} bannedEmails={bannedEmails} isAdmin={user?.email === "admin@kulturlog.com"} />)
        )}
      </div>
    </div>
  );
}

function RatingStars({ rating, theme }) {
  return (
    <div style={{ display: "flex", justifyContent: "center", gap: "3px", margin: "5px 0" }}>
      {[...Array(10)].map((_, i) => (
        <span key={i} style={{ color: i < (rating || 0) ? theme.star : theme.border, fontSize: "16px" }}>★</span>
      ))}
    </div>
  );
}

// GÜNCELLENDİ: 3 Sütunlu Sosyal Medya Mimarisi
function Timeline({ theme, user, username, showToast, isAdmin, bannedEmails, leaderboard }) {
  const [posts, setPosts] = useState([]);
  const [category, setCategory] = useState("movie");
  const [queryStr, setQueryStr] = useState("");
  const [results, setResults] = useState([]);
  const [loadingSearch, setLoadingSearch] = useState(false);
  const [supportMsg, setSupportMsg] = useState("");
  const [isSupportOpen, setIsSupportOpen] = useState(false);
  
  const [myLibIds, setMyLibIds] = useState([]);
  const navigate = useNavigate();

  useEffect(() => {
    const q = query(collection(db, "posts"), orderBy("createdAt", "desc"));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const allFetchedPosts = snapshot.docs.map(doc => ({ docId: doc.id, ...doc.data() }));
      const visiblePosts = allFetchedPosts.filter(p => !p.hidden || p.userEmail === user?.email || isAdmin);
      setPosts(visiblePosts);
    });
    return () => unsubscribe();
  }, [user, isAdmin]);

  useEffect(() => {
    if (user && user.uid !== "guest") {
      getUserLibrary(user.uid).then(lib => setMyLibIds(lib.map(item => item.id)));
    }
  }, [user]);

  const handleSupportSubmit = async (e) => {
    e.preventDefault();
    if (user.uid === "guest") { showToast("Giriş yapmalısınız.", "error"); return; }
    if (!supportMsg.trim()) return;
    const res = await sendSupportRequest(user.uid, user.email, supportMsg);
    if (res.success) {
      showToast("Destek talebiniz admin'e iletildi.");
      setSupportMsg("");
      setIsSupportOpen(false);
    }
  };

  const handleSearch = async (e) => {
    e.preventDefault();
    if (!queryStr.trim()) return;
    setLoadingSearch(true);
    setResults([]); 
    try {
      let data;
      if (category === "movie") data = await searchMovies(queryStr);
      else if (category === "tv") data = await searchTvSeries(queryStr);
      else data = await searchBooks(queryStr);
      
      setResults(data || []);
    } catch (error) { 
      showToast("Arama başarısız.", "error"); 
    } finally { 
      setLoadingSearch(false); 
    }
  };

  const handleAddRequest = (r) => {
    if (isAdmin) { showToast("Admin yetkisiyle arşive ekleme yapılamaz.", "error"); return; }
    if (user.uid === "guest") { showToast("İçerik eklemek için kayıt olun.", "error"); return; }
    
    if (myLibIds.includes(r?.id)) {
      return showToast("Bu içerik zaten arşivinizde!", "error");
    }

    addMediaToLibrary(user.uid, { 
      id: r?.id, 
      title: category === "movie" ? r?.title : (category === "tv" ? r?.name : (r?.volumeInfo?.title || "Bilinmeyen Kitap")), 
      image: (category === "movie" || category === "tv") ? (r?.poster_path ? `https://image.tmdb.org/t/p/w500${r?.poster_path}` : "https://via.placeholder.com/500x750?text=Resim+Yok") : (r?.volumeInfo?.imageLinks?.thumbnail || "https://via.placeholder.com/128x192?text=Resim+Yok"), 
      type: category, 
      userEmail: user.email,
      status: "not-started"
    }).then(() => {
      setMyLibIds(prev => [...prev, r?.id]); 
      showToast("Arşive eklendi!");
    });
  };

  return (
    <div style={{ position: "relative", display: "grid", gridTemplateColumns: "260px 1fr 280px", gap: "30px", alignItems: "start", maxWidth: "1200px", margin: "0 auto" }}>
      
      {/* SOL SÜTUN: Kullanıcı Bilgileri (Temiz ve Sabit) */}
      <aside style={{ position: "sticky", top: "100px", backgroundColor: theme.card, padding: "25px", borderRadius: "16px", border: `1px solid ${theme.border}`, boxShadow: "0 4px 6px -1px rgba(0,0,0,0.05)", display: "flex", flexDirection: "column", alignItems: "center", textAlign: "center" }}>
        <div style={{ width: "80px", height: "80px", borderRadius: "50%", backgroundColor: theme.bg, border: `2px solid ${theme.border}`, display: "flex", justifyContent: "center", alignItems: "center", fontSize: "32px", fontWeight: "bold", color: theme.text, marginBottom: "15px" }}>
          {username[0]?.toUpperCase()}
        </div>
        <h3 style={{ margin: "0 0 5px 0", color: theme.text, fontSize: "18px", fontWeight: "900" }}>{username}</h3>
        <span style={{ fontSize: "13px", color: theme.subText, fontWeight: "600", marginBottom: "20px", backgroundColor: theme.bg, padding: "4px 10px", borderRadius: "12px" }}>KültürLog Üyesi</span>
        {!isAdmin && user.uid !== "guest" && (
           <button onClick={() => navigate("/profile")} style={{ ...primaryBtnStyle(theme), width: "100%", fontSize: "14px", padding: "10px" }}>Arşivime Git</button>
        )}
      </aside>

      {/* ORTA SÜTUN: Ana Akış */}
      <section style={{ display: "flex", flexDirection: "column", gap: "25px", minWidth: 0 }}>
        
        {/* Arama Alanı */}
        <div style={{ backgroundColor: theme.card, padding: "25px", borderRadius: "16px", border: `1px solid ${theme.border}`, boxShadow: "0 4px 6px -1px rgba(0,0,0,0.05)" }}>
          <div style={{ display: "flex", gap: "15px", justifyContent: "center", marginBottom: "20px" }}>
            <button onClick={() => { setCategory("movie"); setResults([]); }} style={toggleBtnStyle(category === "movie", theme)}>Film Ara</button>
            <button onClick={() => { setCategory("tv"); setResults([]); }} style={toggleBtnStyle(category === "tv", theme)}>Dizi Ara</button>
            <button onClick={() => { setCategory("book"); setResults([]); }} style={toggleBtnStyle(category === "book", theme)}>Kitap Ara</button>
          </div>
          <form onSubmit={handleSearch} style={{ display: "flex", gap: "15px", maxWidth: "100%" }}>
            <input type="text" value={queryStr} onChange={e => setQueryStr(e.target.value)} placeholder="Yeni içerik bul..." style={inputStyle(theme)} />
            <button type="submit" disabled={loadingSearch} style={{ ...primaryBtnStyle(theme), width: "130px" }}>
              {loadingSearch ? "Aranıyor..." : "Ara"}
            </button>
          </form>
          {results.length > 0 && (
            <div style={{ display: "flex", gap: "15px", overflowX: "auto", marginTop: "25px", paddingBottom: "15px" }}>
              {results.map(r => (
                <div key={r?.id || Math.random()} style={{ minWidth: "110px", textAlign: "center" }}>
                  <img src={(category === "movie" || category === "tv") ? (r?.poster_path ? `https://image.tmdb.org/t/p/w200${r.poster_path}` : "https://via.placeholder.com/200x300") : (r?.volumeInfo?.imageLinks?.thumbnail || "https://via.placeholder.com/128x192?text=Resim+Yok")} style={{ width: "100px", height: "150px", borderRadius: "8px", objectFit: "cover", boxShadow: "0 4px 8px rgba(0,0,0,0.1)" }} />
                  {!isAdmin && (
                    <button onClick={() => handleAddRequest(r)} style={{ fontSize: "13px", marginTop: "12px", width: "100%", cursor: "pointer", padding: "8px", backgroundColor: theme.accent, border: "none", borderRadius: "8px", fontWeight: "700", color: "#FFFFFF", transition: "all 0.2s" }}>
                      Ekle
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Gönderiler */}
        <div style={{ display: "flex", flexDirection: "column", gap: "25px" }}>
          {posts.map(post => <PostCard key={post.docId} post={post} theme={theme} user={user} navigate={navigate} showToast={showToast} bannedEmails={bannedEmails} isAdmin={isAdmin} />)}
        </div>
      </section>

      {/* SAĞ SÜTUN: Ayın Önerileri + Leaderboard (Sabit) */}
      <aside style={{ position: "sticky", top: "100px", display: "flex", flexDirection: "column", gap: "20px" }}>
        
        {/* Ayın Önerileri Kartı */}
        <div style={{ backgroundColor: theme.card, padding: "20px", borderRadius: "16px", border: `1px solid ${theme.border}`, boxShadow: "0 4px 6px -1px rgba(0,0,0,0.05)" }}>
          <h3 style={{ margin: "0 0 15px 0", color: theme.accent, fontSize: "16px", fontWeight: "900", display: "flex", alignItems: "center", gap: "8px" }}>
            🌟 Ayın Önerileri
          </h3>
          <p style={{ fontSize: "12px", color: theme.subText, marginBottom: "15px", marginTop: "-5px" }}>IMDb ve Topluluk Puanlarına Göre</p>
          
          <div style={{ display: "flex", flexDirection: "column", gap: "15px" }}>
            {/* Film Önerisi */}
            <div style={{ display: "flex", gap: "12px" }}>
              <img src="https://image.tmdb.org/t/p/w200/9O7gLzmreU0nGkIB6K3BsJbzvNv.jpg" style={{ width: "55px", height: "80px", borderRadius: "6px", objectFit: "cover", boxShadow: "0 2px 5px rgba(0,0,0,0.1)" }} alt="Film" />
              <div style={{ display: "flex", flexDirection: "column", justifyContent: "center" }}>
                <span style={{ fontSize: "11px", fontWeight: "800", color: "#F43F5E", letterSpacing: "0.5px" }}>FİLM</span>
                <strong style={{ fontSize: "14px", color: theme.text, lineHeight: "1.2", margin: "4px 0" }}>Esaretin Bedeli</strong>
                <span style={{ fontSize: "12px", color: theme.star, fontWeight: "bold" }}>⭐ 9.3/10</span>
              </div>
            </div>

            {/* Dizi Önerisi */}
            <div style={{ display: "flex", gap: "12px" }}>
              <img src="https://image.tmdb.org/t/p/w200/ggFHVNu6YYI5L9pCfOacjizRGt.jpg" style={{ width: "55px", height: "80px", borderRadius: "6px", objectFit: "cover", boxShadow: "0 2px 5px rgba(0,0,0,0.1)" }} alt="Dizi" />
              <div style={{ display: "flex", flexDirection: "column", justifyContent: "center" }}>
                <span style={{ fontSize: "11px", fontWeight: "800", color: "#8B5CF6", letterSpacing: "0.5px" }}>DİZİ</span>
                <strong style={{ fontSize: "14px", color: theme.text, lineHeight: "1.2", margin: "4px 0" }}>Breaking Bad</strong>
                <span style={{ fontSize: "12px", color: theme.star, fontWeight: "bold" }}>⭐ 9.5/10</span>
              </div>
            </div>

            {/* Kitap Önerisi */}
            <div style={{ display: "flex", gap: "12px" }}>
              <img src="https://books.google.com/books/publisher/content/images/frontcover/t5Z9EAAAQBAJ?fife=w200-h300" style={{ width: "55px", height: "80px", borderRadius: "6px", objectFit: "cover", boxShadow: "0 2px 5px rgba(0,0,0,0.1)" }} alt="Kitap" />
              <div style={{ display: "flex", flexDirection: "column", justifyContent: "center" }}>
                <span style={{ fontSize: "11px", fontWeight: "800", color: "#3B82F6", letterSpacing: "0.5px" }}>KİTAP</span>
                <strong style={{ fontSize: "14px", color: theme.text, lineHeight: "1.2", margin: "4px 0" }}>Suç ve Ceza</strong>
                <span style={{ fontSize: "12px", color: theme.star, fontWeight: "bold" }}>⭐ 9.8/10</span>
              </div>
            </div>
          </div>
        </div>

        {/* Liderlik Tablosu Artık Sağ Sütunda */}
        <LeaderboardWidget leaderboard={leaderboard} bannedEmails={bannedEmails} theme={theme} />
      </aside>

      {/* Destek Butonu (Sağ Alt Sabit) */}
      {!isAdmin && (
        <div style={{ position: "fixed", bottom: "30px", right: "30px", zIndex: 1000, display: "flex", flexDirection: "column", alignItems: "flex-end" }}>
          {isSupportOpen && (
            <div style={{ backgroundColor: theme.card, padding: "20px", borderRadius: "16px", border: `1px solid ${theme.border}`, width: "320px", marginBottom: "15px", boxShadow: "0 10px 30px rgba(0,0,0,0.2)" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "15px" }}>
                <h3 style={{ fontSize: "16px", color: theme.text, margin: 0 }}>💬 Destek / Öneri</h3>
                <button onClick={() => setIsSupportOpen(false)} style={{ background: "none", border: "none", color: theme.subText, cursor: "pointer", fontSize: "20px" }}>×</button>
              </div>
              <form onSubmit={handleSupportSubmit}>
                <textarea value={supportMsg} onChange={e => setSupportMsg(e.target.value)} placeholder="Admin'e mesajınızı iletin..." style={{ ...inputStyle(theme), height: "100px", resize: "none", fontSize: "14px", marginBottom: "10px" }} />
                <button type="submit" style={{ ...primaryBtnStyle(theme), padding: "10px", width: "100%", fontSize: "15px" }}>Gönder</button>
              </form>
            </div>
          )}
          <button onClick={() => setIsSupportOpen(!isSupportOpen)} style={{ backgroundColor: theme.text, color: theme.bg, border: "none", width: "60px", height: "60px", borderRadius: "50%", cursor: "pointer", fontSize: "24px", boxShadow: "0 5px 15px rgba(0,0,0,0.2)", fontWeight: "bold", display: "flex", justifyContent: "center", alignItems: "center" }}>
            {isSupportOpen ? "↓" : "💬"}
          </button>
        </div>
      )}
    </div>
  );
}

function PostCard({ post, theme, user, navigate, showToast, bannedEmails, isAdmin }) {
  const [comment, setComment] = useState("");
  const [comments, setComments] = useState([]);
  const [postAvatar, setPostAvatar] = useState("");
  
  const [isEditingPost, setIsEditingPost] = useState(false);
  const [editedPostNote, setEditedPostNote] = useState(post.note || "");
  const [editingCommentId, setEditingCommentId] = useState(null);
  const [editedCommentText, setEditedCommentText] = useState("");
  
  const [replyingTo, setReplyingTo] = useState(null);
  
  // YENİ: Timeline Silme Modalı State'i
  const [confirmDialog, setConfirmDialog] = useState({ isOpen: false, title: "", text: "", action: null });

  const isPostOwner = user && user.email === post.userEmail;
  const isPostBanned = bannedEmails.includes(post.userEmail);

  useEffect(() => {
    if (post.userId) {
      getDoc(doc(db, "profiles", post.userId)).then(d => {
        if(d.exists()) setPostAvatar(d.data().avatar || "");
      });
    }
    const q = query(collection(db, `posts/${post.docId}/comments`), orderBy("createdAt", "asc"));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      setComments(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    });
    return () => unsubscribe();
  }, [post.docId, post.userId]);

  const handleAddToMyLibrary = async () => {
    if (!user || user.uid === "guest") return showToast("Kayıt olmanız gerekiyor.", "error");
    
    const targetId = post.mediaId || post.id || post.title;
    const myLib = await getUserLibrary(user.uid);
    if (myLib.some(item => item.id === targetId)) {
      return showToast("Bu içerik zaten arşivinizde bulunuyor!", "error");
    }

    await addMediaToLibrary(user.uid, {
      id: targetId, title: post.title, image: post.image, type: post.type, userEmail: user.email, status: "not-started"
    });
    showToast("İçerik arşivinize eklendi! 🚀");
  };

  const handleUpdatePost = async () => {
    await updateDoc(doc(db, "posts", post.docId), { note: editedPostNote });
    setIsEditingPost(false);
    showToast("Gönderi güncellendi.");
  };

  const handleDeletePost = () => {
    setConfirmDialog({
      isOpen: true,
      title: "Gönderiyi Sil",
      text: "Bu gönderiyi kalıcı olarak silmek istediğinize emin misiniz? Bu işlem geri alınamaz.",
      action: async () => {
        await deleteDoc(doc(db, "posts", post.docId));
        showToast("Gönderi silindi.", "error");
        setConfirmDialog({ isOpen: false });
      }
    });
  };

  const handleUpdateComment = async (cId) => {
    await updateDoc(doc(db, `posts/${post.docId}/comments`, cId), { text: editedCommentText });
    setEditingCommentId(null);
    showToast("Yorum güncellendi.");
  };

  const handleDeleteComment = (cId) => {
    setConfirmDialog({
      isOpen: true,
      title: "Yorumu Sil",
      text: "Bu yorumu silmek istediğinize emin misiniz?",
      action: async () => {
        await deleteDoc(doc(db, `posts/${post.docId}/comments`, cId));
        showToast("Yorum silindi.", "error");
        setConfirmDialog({ isOpen: false });
      }
    });
  };

  const handleLikePost = async () => {
    if (!user || user.uid === "guest") return showToast("Giriş yapmalısınız", "error");
    const postRef = doc(db, "posts", post.docId);
    const hasLiked = post.likes?.includes(user.uid);
    const hasDisliked = post.dislikes?.includes(user.uid);

    if (hasLiked) {
      await updateDoc(postRef, { likes: arrayRemove(user.uid) });
    } else {
      await updateDoc(postRef, { 
        likes: arrayUnion(user.uid),
        ...(hasDisliked ? { dislikes: arrayRemove(user.uid) } : {})
      });
      if (post.userId && post.userId !== user.uid) {
        addDoc(collection(db, "notifications"), {
          toUserId: post.userId, fromUserEmail: user.email, type: "like", postTitle: post.title, createdAt: serverTimestamp(), read: false
        });
      }
    }
  };

  const handleDislikePost = async () => {
    if (!user || user.uid === "guest") return showToast("Giriş yapmalısınız", "error");
    const postRef = doc(db, "posts", post.docId);
    const hasLiked = post.likes?.includes(user.uid);
    const hasDisliked = post.dislikes?.includes(user.uid);

    if (hasDisliked) {
      await updateDoc(postRef, { dislikes: arrayRemove(user.uid) });
    } else {
      await updateDoc(postRef, { 
        dislikes: arrayUnion(user.uid),
        ...(hasLiked ? { likes: arrayRemove(user.uid) } : {})
      });
      if (post.userId && post.userId !== user.uid) {
        addDoc(collection(db, "notifications"), {
          toUserId: post.userId, fromUserEmail: user.email, type: "dislike", postTitle: post.title, createdAt: serverTimestamp(), read: false
        });
      }
    }
  };

  const handleToggleCommentLike = async (cId, isLike) => {
    if (!user || user.uid === "guest") return showToast("Giriş yapmalısınız", "error");
    const cRef = doc(db, `posts/${post.docId}/comments`, cId);
    const cObj = comments.find(c => c.id === cId);
    const hasLiked = cObj?.likes?.includes(user.uid);
    const hasDisliked = cObj?.dislikes?.includes(user.uid);

    if (isLike) {
      if (hasLiked) await updateDoc(cRef, { likes: arrayRemove(user.uid) });
      else await updateDoc(cRef, { likes: arrayUnion(user.uid), dislikes: hasDisliked ? arrayRemove(user.uid) : cObj?.dislikes || [] });
    } else {
      if (hasDisliked) await updateDoc(cRef, { dislikes: arrayRemove(user.uid) });
      else await updateDoc(cRef, { dislikes: arrayUnion(user.uid), likes: hasLiked ? arrayRemove(user.uid) : cObj?.likes || [] });
    }
  };

  const topLevelComments = comments.filter(c => !c.parentId);

  return (
    <div style={{ backgroundColor: theme.card, borderRadius: "16px", padding: "25px", marginBottom: "25px", border: `1px solid ${theme.border}`, boxShadow: "0 2px 10px rgba(0,0,0,0.03)" }}>
      
      <CustomConfirm 
        isOpen={confirmDialog.isOpen} 
        title={confirmDialog.title} 
        text={confirmDialog.text} 
        theme={theme} 
        onCancel={() => setConfirmDialog({ isOpen: false })} 
        onConfirm={confirmDialog.action} 
      />

      {post.hidden && (
         <div style={{ backgroundColor: `${theme.red}15`, color: theme.red, padding: "12px 15px", borderRadius: "8px", marginBottom: "20px", fontSize: "14px", fontWeight: "bold", border: `1px solid ${theme.red}`, display: "flex", alignItems: "center", gap: "10px" }}>
            <span>⚠️</span> Bu gönderi topluluk kuralları gereği yöneticiler tarafından gizlenmiştir. Şu an sadece siz görebilirsiniz.
         </div>
      )}

      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "20px" }}>
        
        <div onClick={() => navigate(`/user/${post.userId}`, { state: { email: post.userEmail } })} style={{ display: "flex", gap: "12px", alignItems: "center", cursor: "pointer" }}>
          {postAvatar ? (
             <img src={postAvatar} style={{ width: "45px", height: "45px", borderRadius: "50%", objectFit: "cover", border: `2px solid ${isPostBanned ? theme.red : theme.border}`, filter: isPostBanned ? "grayscale(100%) brightness(50%)" : "none", opacity: isPostBanned ? 0.6 : 1 }} />
          ) : (
             <div style={{ width: "45px", height: "45px", borderRadius: "50%", backgroundColor: isPostBanned ? theme.red : theme.bg, border: `1px solid ${theme.border}`, display: "flex", justifyContent: "center", alignItems: "center", fontWeight: "bold", color: theme.text, fontSize: "18px", opacity: isPostBanned ? 0.6 : 1, filter: isPostBanned ? "grayscale(100%)" : "none" }}>
               {post.userEmail?.[0].toUpperCase()}
             </div>
          )}
          <div>
            <div style={{ fontWeight: "700", fontSize: "16px", color: isPostBanned ? theme.red : theme.text, opacity: isPostBanned ? 0.6 : 1 }}>
              {isPostBanned ? <del>{post.userEmail?.split("@")[0]}</del> : post.userEmail?.split("@")[0]}
            </div>
            <small style={{ color: theme.subText, fontSize: "13px", fontWeight: "500" }}>{post.createdAt?.toDate().toLocaleString()}</small>
          </div>
        </div>
        
        <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
          <div style={{ backgroundColor: theme.bg, color: theme.text, border: `1px solid ${theme.border}`, padding: "6px 14px", borderRadius: "8px", fontSize: "12px", fontWeight: "800", letterSpacing: "0.5px" }}>
            {post.type === "movie" ? "FİLM" : (post.type === "tv" ? "DİZİ" : "KİTAP")}
          </div>

          {!isPostOwner && !isAdmin && user?.uid !== "guest" && (
             <button onClick={handleAddToMyLibrary} style={{ backgroundColor: theme.accent, color: "#FFFFFF", border: "none", padding: "6px 12px", borderRadius: "8px", fontSize: "12px", fontWeight: "800", cursor: "pointer", transition: "all 0.2s" }}>
               ➕ Arşive Ekle
             </button>
          )}

          {isPostOwner && (
            <div style={{ display: "flex", gap: "8px" }}>
              <button onClick={() => setIsEditingPost(!isEditingPost)} style={{ background: "none", border: "none", color: theme.subText, cursor: "pointer", fontSize: "13px", fontWeight: "700" }}>Düzenle</button>
              <button onClick={handleDeletePost} style={{ background: "none", border: "none", color: theme.red, cursor: "pointer", fontSize: "13px", fontWeight: "700" }}>Sil</button>
            </div>
          )}
        </div>
      </div>
      
      <div style={{ display: "flex", gap: "25px" }}>
        <img src={post.image} style={{ width: "110px", height: "160px", borderRadius: "8px", objectFit: "cover", boxShadow: "0 4px 12px rgba(0,0,0,0.15)" }} />
        <div style={{ flex: 1 }}>
          <h3 style={{ margin: "0 0 8px 0", color: theme.text, fontSize: "22px", fontWeight: "800", lineHeight: "1.3" }}>{post.title}</h3>
          
          <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "12px" }}>
            <RatingStars rating={post.rating} theme={theme} />
            <b style={{ fontSize: "18px", color: theme.star }}>{post.rating}/10</b>
          </div>
          
          {isEditingPost ? (
            <div style={{ marginTop: "10px" }}>
              <textarea value={editedPostNote} onChange={e => setEditedPostNote(e.target.value)} style={{ ...inputStyle(theme), height: "80px", marginBottom: "8px", fontSize: "15px" }} />
              <button onClick={handleUpdatePost} style={{ ...primaryBtnStyle(theme), padding: "8px 15px", fontSize: "13px" }}>Kaydet</button>
              <button onClick={() => setIsEditingPost(false)} style={{ background: "none", border: "none", color: theme.subText, marginLeft: "10px", cursor: "pointer", fontSize: "13px", fontWeight: "bold" }}>İptal</button>
            </div>
          ) : (
            <p style={{ fontSize: "16px", fontStyle: "italic", lineHeight: "1.6", color: theme.text, marginTop: "5px", opacity: 0.9 }}>"{post.note}"</p>
          )}

          <div style={{ display: "flex", gap: "12px", marginTop: "18px", alignItems: "center" }}>
            <button onClick={handleLikePost} style={actionBtnStyle(post.likes?.includes(user?.uid), theme, true)}>
              👍 <span style={{marginLeft: "4px"}}>{post.likes?.length || 0}</span>
            </button>
            <button onClick={handleDislikePost} style={actionBtnStyle(post.dislikes?.includes(user?.uid), theme, false)}>
              👎 <span style={{marginLeft: "4px"}}>{post.dislikes?.length || 0}</span>
            </button>
          </div>
        </div>
      </div>
      
      <div style={{ marginTop: "25px", paddingTop: "15px", borderTop: `1px solid ${theme.border}` }}>
        {topLevelComments.map(c => {
          const isCommentOwner = user && user.email === c.userEmail;
          const isCommentBanned = bannedEmails.includes(c.userEmail);
          const replies = comments.filter(r => r.parentId === c.id);

          return (
            <div key={c.id} style={{ marginBottom: "18px" }}>
              
              <div style={{ fontSize: "15px", display: "flex", justifyContent: "space-between", alignItems: "flex-start", lineHeight: "1.5" }}>
                <div style={{ flex: 1 }}>
                  {editingCommentId === c.id ? (
                    <div style={{ display: "flex", gap: "8px", marginTop: "5px" }}>
                      <input type="text" value={editedCommentText} onChange={e => setEditedCommentText(e.target.value)} style={{ ...inputStyle(theme), padding: "8px", flex: 1, height: "auto", fontSize: "15px" }} />
                      <button onClick={() => handleUpdateComment(c.id)} style={{ backgroundColor: theme.accent, color: "#FFFFFF", border: "none", borderRadius: "6px", padding: "6px 12px", fontWeight: "bold", cursor: "pointer", fontSize: "14px" }}>✓</button>
                      <button onClick={() => setEditingCommentId(null)} style={{ backgroundColor: theme.red, color: "#FFFFFF", border: "none", borderRadius: "6px", padding: "6px 12px", fontWeight: "bold", cursor: "pointer", fontSize: "14px" }}>X</button>
                    </div>
                  ) : (
                    <>
                      <b style={{ color: isCommentBanned ? theme.red : theme.text, opacity: isCommentBanned ? 0.6 : 1, fontWeight: "700" }}>
                        {isCommentBanned ? <del>{c.userEmail?.split("@")[0]}</del> : c.userEmail?.split("@")[0]}
                      </b> 
                      <span style={{color: theme.subText, margin: "0 8px", fontSize: "13px"}}>•</span>
                      <span style={{color: theme.text, opacity: isCommentBanned ? 0.6 : 1}}>{c.text}</span>
                      
                      <div style={{ display: "flex", gap: "10px", marginTop: "8px", alignItems: "center" }}>
                        <span onClick={() => handleToggleCommentLike(c.id, true)} style={commentActionStyle(c.likes?.includes(user?.uid), theme, true)}>👍 {c.likes?.length || 0}</span>
                        <span onClick={() => handleToggleCommentLike(c.id, false)} style={commentActionStyle(c.dislikes?.includes(user?.uid), theme, false)}>👎 {c.dislikes?.length || 0}</span>
                        
                        {user && user.uid !== "guest" && (
                          <span onClick={() => setReplyingTo({ id: c.id, userEmail: c.userEmail })} style={{ color: theme.subText, cursor: "pointer", fontSize: "13px", fontWeight: "600", marginLeft: "10px", transition: "color 0.2s" }}>Yanıtla</span>
                        )}
                        {isCommentOwner && editingCommentId !== c.id && (
                          <>
                            <span onClick={() => { setEditingCommentId(c.id); setEditedCommentText(c.text); }} style={{ color: theme.subText, cursor: "pointer", fontSize: "13px", fontWeight: "600", marginLeft: "5px" }}>Düzenle</span>
                            <span onClick={() => handleDeleteComment(c.id)} style={{ color: theme.red, cursor: "pointer", fontSize: "13px", fontWeight: "600", marginLeft: "5px" }}>Sil</span>
                          </>
                        )}
                      </div>
                    </>
                  )}
                </div>
              </div>

              {replies.length > 0 && (
                <div style={{ marginLeft: "15px", marginTop: "12px", borderLeft: `2px solid ${theme.border}`, paddingLeft: "15px" }}>
                  {replies.map(r => {
                    const isReplyOwner = user && user.email === r.userEmail;
                    const isReplyBanned = bannedEmails.includes(r.userEmail);
                    return (
                      <div key={r.id} style={{ fontSize: "14px", display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "12px", lineHeight: "1.5" }}>
                        <div style={{ flex: 1 }}>
                          {editingCommentId === r.id ? (
                            <div style={{ display: "flex", gap: "8px", marginTop: "5px" }}>
                              <input type="text" value={editedCommentText} onChange={e => setEditedCommentText(e.target.value)} style={{ ...inputStyle(theme), padding: "6px", flex: 1, height: "auto", fontSize: "14px" }} />
                              <button onClick={() => handleUpdateComment(r.id)} style={{ backgroundColor: theme.accent, color: "#FFFFFF", border: "none", borderRadius: "6px", padding: "4px 10px", fontWeight: "bold", cursor: "pointer", fontSize: "13px" }}>✓</button>
                              <button onClick={() => setEditingCommentId(null)} style={{ backgroundColor: theme.red, color: "#FFFFFF", border: "none", borderRadius: "6px", padding: "4px 10px", fontWeight: "bold", cursor: "pointer", fontSize: "13px" }}>X</button>
                            </div>
                          ) : (
                            <>
                              <b style={{ color: isReplyBanned ? theme.red : theme.text, opacity: isReplyBanned ? 0.6 : 1, fontWeight: "600" }}>
                                {isReplyBanned ? <del>{r.userEmail?.split("@")[0]}</del> : r.userEmail?.split("@")[0]}
                              </b> 
                              <span style={{color: theme.subText, margin: "0 6px", fontSize: "12px"}}>•</span>
                              <span style={{color: theme.text, opacity: isReplyBanned ? 0.6 : 1}}>
                                {r.replyToEmail && r.replyToEmail !== c.userEmail && <span style={{color: theme.accent, fontWeight: "600"}}>@{r.replyToEmail.split('@')[0]} </span>}
                                {r.text}
                              </span>

                              <div style={{ display: "flex", gap: "10px", marginTop: "8px", alignItems: "center" }}>
                                <span onClick={() => handleToggleCommentLike(r.id, true)} style={commentActionStyle(r.likes?.includes(user?.uid), theme, true)}>👍 {r.likes?.length || 0}</span>
                                <span onClick={() => handleToggleCommentLike(r.id, false)} style={commentActionStyle(r.dislikes?.includes(user?.uid), theme, false)}>👎 {r.dislikes?.length || 0}</span>
                                
                                {user && user.uid !== "guest" && (
                                  <span onClick={() => setReplyingTo({ id: c.id, userEmail: r.userEmail })} style={{ color: theme.subText, cursor: "pointer", fontSize: "12px", fontWeight: "600", marginLeft: "10px" }}>Yanıtla</span>
                                )}
                                {isReplyOwner && editingCommentId !== r.id && (
                                  <>
                                    <span onClick={() => { setEditingCommentId(r.id); setEditedCommentText(r.text); }} style={{ color: theme.subText, cursor: "pointer", fontSize: "12px", fontWeight: "600", marginLeft: "5px" }}>Düzenle</span>
                                    <span onClick={() => handleDeleteComment(r.id)} style={{ color: theme.red, cursor: "pointer", fontSize: "12px", fontWeight: "600", marginLeft: "5px" }}>Sil</span>
                                  </>
                                )}
                              </div>
                            </>
                          )}
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}

            </div>
          );
        })}

        {user.uid !== "guest" && (
          <form onSubmit={async (e) => { 
            e.preventDefault(); 
            if(!comment.trim()) return; 
            
            await addDoc(collection(db, `posts/${post.docId}/comments`), { 
              text: comment, 
              userEmail: user.email, 
              createdAt: serverTimestamp(),
              parentId: replyingTo ? replyingTo.id : null,
              replyToEmail: replyingTo ? replyingTo.userEmail : null,
              likes: [],
              dislikes: []
            }); 

            if (post.userId && post.userId !== user.uid) {
               addDoc(collection(db, "notifications"), {
                  toUserId: post.userId, fromUserEmail: user.email, type: "comment", postTitle: post.title, createdAt: serverTimestamp(), read: false
               });
            }

            setComment(""); 
            setReplyingTo(null);
          }} style={{ marginTop: "20px" }}>
            
            {replyingTo && (
              <div style={{ fontSize: "13px", color: theme.accent, marginBottom: "10px", display: "flex", justifyContent: "space-between", backgroundColor: theme.bg, padding: "10px 14px", borderRadius: "8px", fontWeight: "600", border: `1px solid ${theme.border}` }}>
                <span>@{replyingTo.userEmail.split('@')[0]} kullanıcısına yanıt veriliyor...</span>
                <button type="button" onClick={() => setReplyingTo(null)} style={{ background: "none", border: "none", color: theme.red, cursor: "pointer", fontWeight: "bold" }}>Vazgeç</button>
              </div>
            )}
            
            <div style={{ display: "flex", gap: "12px" }}>
              <input type="text" placeholder={replyingTo ? "Yanıtını yaz..." : "Düşünceni paylaş..."} value={comment} onChange={e => setComment(e.target.value)} style={{ ...inputStyle(theme), padding: "14px", fontSize: "15px" }} />
              <button type="submit" style={{ ...primaryBtnStyle(theme), width: "120px", fontSize: "15px" }}>Gönder</button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}

function StatsPanel({ theme, stats }) {
  return (
    <div style={{ display: "flex", gap: "20px", marginBottom: "30px", flexWrap: "wrap" }}>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "15px", flex: 2, minWidth: "600px" }}>
        <div style={{ backgroundColor: "#F43F5E", color: "#FFFFFF", padding: "20px", borderRadius: "12px", display: "flex", justifyContent: "space-between", alignItems: "center", boxShadow: "0 4px 10px rgba(244, 63, 94, 0.2)" }}>
          <div>
            <small style={{fontWeight: "700", opacity: 0.9, letterSpacing: "0.5px"}}>FİLMLER</small>
            <div style={{fontSize: "30px", fontWeight: "900"}}>{stats.wm}/{stats.tm}</div>
          </div>
          <div style={{textAlign: "right"}}>
            <div style={{fontSize: "22px", fontWeight: "bold", color: theme.star}}>⭐ {stats.mAvg}</div>
            <small style={{opacity: 0.9}}>Ortalama</small>
          </div>
        </div>

        <div style={{ backgroundColor: "#8B5CF6", color: "#FFFFFF", padding: "20px", borderRadius: "12px", display: "flex", justifyContent: "space-between", alignItems: "center", boxShadow: "0 4px 10px rgba(139, 92, 246, 0.2)" }}>
          <div>
            <small style={{fontWeight: "700", opacity: 0.9, letterSpacing: "0.5px"}}>DİZİLER</small>
            <div style={{fontSize: "30px", fontWeight: "900"}}>{stats.wt}/{stats.tt}</div>
          </div>
          <div style={{textAlign: "right"}}>
            <div style={{fontSize: "22px", fontWeight: "bold", color: theme.star}}>⭐ {stats.tAvg}</div>
            <small style={{opacity: 0.9}}>Ortalama</small>
          </div>
        </div>

        <div style={{ backgroundColor: "#3B82F6", color: "#FFFFFF", padding: "20px", borderRadius: "12px", display: "flex", justifyContent: "space-between", alignItems: "center", boxShadow: "0 4px 10px rgba(59, 130, 246, 0.2)" }}>
          <div>
            <small style={{fontWeight: "700", opacity: 0.9, letterSpacing: "0.5px"}}>KİTAPLAR</small>
            <div style={{fontSize: "30px", fontWeight: "900"}}>{stats.rb}/{stats.tb}</div>
          </div>
          <div style={{textAlign: "right"}}>
            <div style={{fontSize: "22px", fontWeight: "bold", color: theme.star}}>⭐ {stats.bAvg}</div>
            <small style={{opacity: 0.9}}>Ortalama</small>
          </div>
        </div>
      </div>
      
      <div style={{ flex: 1, minWidth: "250px", backgroundColor: theme.card, padding: "20px", borderRadius: "12px", border: `1px solid ${theme.border}`, display: "flex", flexDirection: "column", justifyContent: "center" }}>
        <div style={{textAlign: "center", marginBottom: "15px", fontWeight: "900", color: theme.text, fontSize: "18px"}}>{stats.rank.toUpperCase()}</div>
        
        <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "8px" }}>
           <small style={{width: "60px", fontSize: "11px", fontWeight: "bold", color: "#F43F5E"}}>FİLM %{stats.mPerc}</small>
           <div style={{ flex: 1, height: "8px", backgroundColor: theme.bg, borderRadius: "10px" }}>
             <div style={{ width: `${stats.mPerc}%`, height: "100%", backgroundColor: "#F43F5E", borderRadius: "10px", transition: "width 0.5s ease" }}></div>
           </div>
        </div>
        
        <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "8px" }}>
           <small style={{width: "60px", fontSize: "11px", fontWeight: "bold", color: "#8B5CF6"}}>DİZİ %{stats.tPerc}</small>
           <div style={{ flex: 1, height: "8px", backgroundColor: theme.bg, borderRadius: "10px" }}>
             <div style={{ width: `${stats.tPerc}%`, height: "100%", backgroundColor: "#8B5CF6", borderRadius: "10px", transition: "width 0.5s ease" }}></div>
           </div>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
           <small style={{width: "60px", fontSize: "11px", fontWeight: "bold", color: "#3B82F6"}}>KİTAP %{stats.bPerc}</small>
           <div style={{ flex: 1, height: "8px", backgroundColor: theme.bg, borderRadius: "10px" }}>
             <div style={{ width: `${stats.bPerc}%`, height: "100%", backgroundColor: "#3B82F6", borderRadius: "10px", transition: "width 0.5s ease" }}></div>
           </div>
        </div>
      </div>
    </div>
  );
}

function ProfilePage({ theme, user, username, showToast }) {
  const [myLibrary, setMyLibrary] = useState([]);
  const [category, setCategory] = useState("movie");
  
  const [localSearch, setLocalSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");

  const [apiSearch, setApiSearch] = useState("");
  const [apiResults, setApiResults] = useState([]);
  const [apiLoading, setApiLoading] = useState(false);
  
  const [bio, setBio] = useState("");
  const [avatar, setAvatar] = useState("");
  const [isEditingBio, setIsEditingBio] = useState(false);

  const [itemToDelete, setItemToDelete] = useState(null);

  useEffect(() => { 
    getUserLibrary(user.uid).then(setMyLibrary);
    getDoc(doc(db, "profiles", user.uid)).then(d => {
      if(d.exists()) {
        setBio(d.data().bio || "");
        setAvatar(d.data().avatar || "");
      }
    });
  }, [user.uid]);

  const handleExportPDF = () => {
    if (myLibrary.length === 0) {
      showToast("Arşivinizde dışa aktarılacak içerik yok.", "error");
      return;
    }
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF();

    doc.setFontSize(18);
    doc.text(normalizeTurkish(`${username} - KulturLog Arsivi`), 14, 20);

    const tableData = myLibrary.map(item => {
      const actualStatus = (item.status === "watching" || item.status === "completed") ? item.status : "not-started";
      const typeName = item.type === "movie" ? "Film" : (item.type === "tv" ? "Dizi" : "Kitap");
      
      return [
        normalizeTurkish(item.title),
        normalizeTurkish(typeName),
        normalizeTurkish(actualStatus === "completed" ? "Bitti" : (actualStatus === "watching" ? "Devam Ediyor" : "Baslamadim")),
        item.rating ? `${item.rating}/10` : "-"
      ]
    });

    doc.autoTable({
      startY: 30,
      head: [[normalizeTurkish('Icerik Adi'), normalizeTurkish('Tur'), normalizeTurkish('Durum'), 'Puan']],
      body: tableData,
    });

    doc.save(`${username}_kulturlog_arsivi.pdf`);
    showToast("PDF Başarıyla İndirildi!");
  };

  const stats = (() => {
    const m = myLibrary.filter(i => i.type === "movie");
    const t = myLibrary.filter(i => i.type === "tv"); 
    const b = myLibrary.filter(i => i.type === "book");
    
    const cm = m.filter(i => i.status === "completed");
    const ct = t.filter(i => i.status === "completed");
    const cb = b.filter(i => i.status === "completed");
    
    const mAvg = cm.length ? (cm.reduce((a, c) => a + Number(c.rating || 0), 0) / cm.length).toFixed(1) : "0.0";
    const tAvg = ct.length ? (ct.reduce((a, c) => a + Number(c.rating || 0), 0) / ct.length).toFixed(1) : "0.0";
    const bAvg = cb.length ? (cb.reduce((a, c) => a + Number(c.rating || 0), 0) / cb.length).toFixed(1) : "0.0";

    const total = cm.length + ct.length + cb.length;
    let rank = "Bronz Üye";
    if (total >= 30) rank = "Efsanevi Arşivci"; else if (total >= 20) rank = "Kültür Elçisi"; else if (total >= 10) rank = "Gümüş Okur";
    
    return { 
      tm: m.length, wm: cm.length, mAvg, mPerc: m.length ? Math.round((cm.length/m.length)*100) : 0, 
      tt: t.length, wt: ct.length, tAvg, tPerc: t.length ? Math.round((ct.length/t.length)*100) : 0, 
      tb: b.length, rb: cb.length, bAvg, bPerc: b.length ? Math.round((cb.length/b.length)*100) : 0, 
      rank
    };
  })();

  const handleApiSearch = async (e) => {
    e.preventDefault();
    if (!apiSearch.trim()) return;
    setApiLoading(true);
    try {
      let data;
      if (category === "movie") data = await searchMovies(apiSearch);
      else if (category === "tv") data = await searchTvSeries(apiSearch);
      else data = await searchBooks(apiSearch);
      
      setApiResults(data || []);
    } catch (err) {
      showToast("Arama sırasında hata oluştu.", "error");
    } finally {
      setApiLoading(false);
    }
  };

  const handleNoteUpdate = (itemDocId, itemRating, newNote) => {
    const newLib = [...myLibrary];
    const idx = newLib.findIndex(x => x.docId === itemDocId);
    newLib[idx].note = newNote;
    setMyLibrary(newLib);
    updateMediaLog(itemDocId, itemRating, newNote);
  };

  const filtered = myLibrary.filter(i => {
    const isMatchingCategory = i.type === category;
    const isMatchingSearch = (i.title || "").toLowerCase().includes(localSearch.toLowerCase());
    const actualStatus = (i.status === "watching" || i.status === "completed") ? i.status : "not-started";
    const isMatchingStatus = statusFilter === "all" || actualStatus === statusFilter;
    
    return isMatchingCategory && isMatchingSearch && isMatchingStatus;
  });

  return (
    <div>
      <CustomConfirm 
        isOpen={!!itemToDelete} 
        title="İçeriği Kaldır" 
        text="Bu içeriği arşivinizden kalıcı olarak çıkarmak istediğinize emin misiniz?" 
        theme={theme} 
        onCancel={() => setItemToDelete(null)} 
        onConfirm={() => {
          deleteMediaFromLibrary(itemToDelete).then(() => { 
            getUserLibrary(user.uid).then(setMyLibrary); 
            showToast("Arşivden başarıyla kaldırıldı", "error"); 
            setItemToDelete(null); 
          });
        }} 
      />

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "30px" }}>
        <div style={{ display: "flex", gap: "20px", alignItems: "center" }}>
          {avatar ? (
            <img src={avatar} style={{ width: "80px", height: "80px", borderRadius: "50%", objectFit: "cover", border: `3px solid ${theme.border}`, boxShadow: "0 4px 10px rgba(0,0,0,0.1)" }} />
          ) : (
            <div style={{ width: "80px", height: "80px", borderRadius: "50%", backgroundColor: theme.bg, border: `2px solid ${theme.border}`, display: "flex", justifyContent: "center", alignItems: "center", fontSize: "32px", fontWeight: "bold", color: theme.text }}>
              {username[0].toUpperCase()}
            </div>
          )}
          <h2 style={{ margin: 0, fontSize: "32px", fontWeight: "900", color: theme.text }}>{username}</h2>
        </div>
        
        <div style={{display: "flex", gap: "10px"}}>
          <button onClick={handleExportPDF} style={{...primaryBtnStyle(theme), backgroundColor: theme.card, color: theme.text, border: `1px solid ${theme.border}`}}>
            📄 PDF İndir
          </button>
          <button onClick={() => { if(isEditingBio) setDoc(doc(db, "profiles", user.uid), { bio, avatar }, { merge: true }); setIsEditingBio(!isEditingBio); }} style={primaryBtnStyle(theme)}>
            {isEditingBio ? "Değişiklikleri Kaydet" : "Profili Düzenle"}
          </button>
        </div>
      </div>

      <div style={{ backgroundColor: theme.card, padding: "20px", borderRadius: "12px", marginBottom: "30px", border: `1px solid ${theme.border}` }}>
        {isEditingBio ? (
          <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
            <input type="text" value={avatar} onChange={e => setAvatar(e.target.value)} placeholder="Profil Fotoğrafı URL'si (Örn: https://...jpg)" style={inputStyle(theme)} />
            <textarea value={bio} onChange={e => setBio(e.target.value)} style={{ ...inputStyle(theme), minHeight: "80px", fontSize: "15px" }} placeholder="Kendinden bahset..." />
          </div>
        ) : (
          <p style={{ margin: 0, fontStyle: "italic", color: theme.subText, fontSize: "16px", lineHeight: "1.5" }}>"{bio || "Henüz bir biyografi eklenmemiş."}"</p>
        )}
      </div>
      
      <StatsPanel theme={theme} stats={stats} />
      
      <div style={{ backgroundColor: theme.card, padding: "25px", borderRadius: "12px", marginBottom: "35px", border: `1px solid ${theme.border}` }}>
        <div style={{ display: "flex", gap: "15px", marginBottom: "25px", borderBottom: `1px solid ${theme.border}`, paddingBottom: "20px" }}>
          <button onClick={() => { setCategory("movie"); setApiResults([]); }} style={toggleBtnStyle(category === "movie", theme)}>Filmlerim</button>
          <button onClick={() => { setCategory("tv"); setApiResults([]); }} style={toggleBtnStyle(category === "tv", theme)}>Dizilerim</button>
          <button onClick={() => { setCategory("book"); setApiResults([]); }} style={toggleBtnStyle(category === "book", theme)}>Kitaplarım</button>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "30px" }}>
          <div>
            <label style={{ fontSize: "14px", fontWeight: "700", display: "block", marginBottom: "10px", color: theme.subText }}>Arşivimde Ara ve Filtrele</label>
            <div style={{ display: "flex", gap: "10px" }}>
              <input type="text" placeholder="İçeriklerde bul..." value={localSearch} onChange={e => setLocalSearch(e.target.value)} style={{ ...inputStyle(theme), flex: 2 }} />
              
              <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)} style={{ ...inputStyle(theme), flex: 1, cursor: "pointer", padding: "10px" }}>
                <option value="all">Tüm Durumlar</option>
                <option value="not-started">Başlamadım</option>
                <option value="watching">Devam Ediyor</option>
                <option value="completed">Bitti</option>
              </select>
            </div>
          </div>
          <div>
            <label style={{ fontSize: "14px", fontWeight: "700", display: "block", marginBottom: "10px", color: theme.subText }}>Yeni İçerik Ekle</label>
            <form onSubmit={handleApiSearch} style={{ display: "flex", gap: "10px" }}>
              <input type="text" placeholder="Dışarıda ara ve arşive kat..." value={apiSearch} onChange={e => setApiSearch(e.target.value)} style={inputStyle(theme)} />
              <button type="submit" disabled={apiLoading} style={primaryBtnStyle(theme)}>{apiLoading ? "Aranıyor..." : "Ara"}</button>
            </form>
          </div>
        </div>

        {apiResults.length > 0 && (
          <div style={{ display: "flex", gap: "15px", overflowX: "auto", marginTop: "25px", paddingTop: "20px", borderTop: `1px solid ${theme.border}` }}>
            {apiResults.map(r => (
              <div key={r.id || Math.random()} style={{ minWidth: "100px", textAlign: "center" }}>
                <img src={(category === "movie" || category === "tv") ? (r?.poster_path ? `https://image.tmdb.org/t/p/w200${r.poster_path}` : "https://via.placeholder.com/200x300") : (r?.volumeInfo?.imageLinks?.thumbnail || "https://via.placeholder.com/128x192?text=Resim+Yok")} style={{ width: "90px", height: "135px", borderRadius: "6px", objectFit: "cover", boxShadow: "0 4px 8px rgba(0,0,0,0.1)" }} />
                
                <button 
                  onClick={() => {
                    if (myLibrary.some(item => item.id === r.id)) {
                      return showToast("Bu içerik zaten arşivinizde!", "error");
                    }
                    addMediaToLibrary(user.uid, { 
                      id: r.id, 
                      title: category === "movie" ? r.title : (category === "tv" ? r.name : (r?.volumeInfo?.title || "Bilinmeyen Kitap")), 
                      image: (category === "movie" || category === "tv") ? (r?.poster_path ? `https://image.tmdb.org/t/p/w500${r.poster_path}` : "https://via.placeholder.com/500x750?text=Resim+Yok") : (r?.volumeInfo?.imageLinks?.thumbnail || "https://via.placeholder.com/128x192?text=Resim+Yok"), 
                      type: category, 
                      userEmail: user.email, 
                      status: "not-started"
                    }).then(() => { getUserLibrary(user.uid).then(setMyLibrary); showToast("Eklendi"); })
                  }} 
                  style={{ fontSize: "12px", width: "100%", marginTop: "10px", padding: "8px", backgroundColor: theme.bg, border: `1px solid ${theme.border}`, color: theme.text, borderRadius: "6px", fontWeight: "bold", cursor: "pointer", transition: "all 0.2s" }}
                >
                  Ekle
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: "25px" }}>
        {filtered.map(item => (
          <div key={item.docId} style={{ backgroundColor: theme.card, padding: "20px", borderRadius: "12px", border: `1px solid ${theme.border}`, textAlign: "center", position: "relative", boxShadow: "0 4px 12px rgba(0,0,0,0.05)" }}>
            
            <button onClick={() => setItemToDelete(item.docId)} style={{ position: "absolute", top: "10px", right: "10px", background: theme.red, color: "#FFFFFF", border: "none", borderRadius: "50%", width: "26px", height: "26px", cursor: "pointer", fontWeight: "bold", display: "flex", justifyContent: "center", alignItems: "center" }}>×</button>
            
            <img src={item.image} style={{ width: "100%", height: "280px", objectFit: "cover", borderRadius: "8px", marginBottom: "15px", boxShadow: "0 4px 10px rgba(0,0,0,0.1)" }} />
            
            <h4 style={{ fontSize: "16px", margin: "0 0 10px 0", height: "45px", overflow: "hidden", fontWeight: "800", color: theme.text, lineHeight: "1.4" }}>{item.title}</h4>
            
            <div style={{ fontWeight: "bold", color: theme.star, fontSize: "18px", marginBottom: "12px" }}>⭐ {item.rating || "0"}/10</div>
            
            <select 
              value={(item.status === 'watching' || item.status === 'completed') ? item.status : 'not-started'} 
              onChange={e => {
                const val = e.target.value;
                const newLib = [...myLibrary];
                const idx = newLib.findIndex(x => x.docId === item.docId);
                newLib[idx].status = val;
                setMyLibrary(newLib);
                updateMediaStatus(item.docId, val);
              }}
              style={{ width: "100%", padding: "12px", marginBottom: "10px", borderRadius: "6px", border: `1px solid ${item.status === 'completed' ? theme.green : theme.border}`, backgroundColor: item.status === 'completed' ? `${theme.green}15` : theme.bg, color: item.status === 'completed' ? theme.green : theme.text, fontWeight: item.status === 'completed' ? 'bold' : 'normal', outline: 'none', cursor: 'pointer', fontSize: "14px" }}
            >
              <option value="not-started">Başlamadım</option>
              <option value="watching">{item.type === "tv" ? "İzliyorum" : "Devam Ediyor"}</option>
              <option value="completed">✓ Bitti</option>
            </select>

            <div style={{ display: "flex", gap: "10px", marginBottom: "12px" }}>
              <select value={item.rating || ""} onChange={e => { const val = e.target.value; const newLib = [...myLibrary]; const idx = newLib.findIndex(x => x.docId === item.docId); newLib[idx].rating = val; setMyLibrary(newLib); updateMediaLog(item.docId, val, item.note); }} style={{ flex: 1, padding: "12px", borderRadius: "6px", border: `1px solid ${theme.border}`, backgroundColor: theme.bg, color: theme.text, fontSize: "14px" }}>
                <option value="">Puan Ver</option>
                {[1,2,3,4,5,6,7,8,9,10].map(n => <option key={n} value={n}>{n}</option>)}
              </select>
            </div>

            <textarea placeholder="Düşüncelerini buraya yaz..." defaultValue={item.note || ""} onBlur={e => handleNoteUpdate(item.docId, item.rating, e.target.value)} style={{ ...inputStyle(theme), height: "75px", fontSize: "13px", marginBottom: "15px", padding: "12px" }} />
            
            <button onClick={() => { if(!item.rating || !item.note) { showToast("Paylaşmak için puan vermeli ve bir not yazmalısın!", "error"); return; } createPost(user.uid, user.email, item, item.rating, item.note).then(() => showToast("Akışta Paylaşıldı! 🚀")); }} style={{ ...primaryBtnStyle(theme), width: "100%", padding: "12px", fontSize: "14px" }}>
              Hemen Paylaş
            </button>
          </div>
        ))}
        {filtered.length === 0 && (
           <div style={{ gridColumn: "1 / -1", textAlign: "center", padding: "30px", color: theme.subText, fontSize: "15px" }}>
             Seçtiğiniz filtreye uygun içerik bulunamadı.
           </div>
        )}
      </div>
    </div>
  );
}

function OtherUserProfile({ theme, bannedEmails }) {
  const { userId } = useParams();
  const location = useLocation();
  
  const [lib, setLib] = useState([]);
  const [cat, setCat] = useState("movie");
  const [statusFilter, setStatusFilter] = useState("all");
  
  const [userMail, setUserMail] = useState(location.state?.email || "");
  const [avatar, setAvatar] = useState("");
  const [bio, setBio] = useState("");
  const navigate = useNavigate();

  useEffect(() => { 
    getUserLibrary(userId).then(data => {
      setLib(data || []);
      if(data.length > 0 && !userMail) setUserMail(data[0].userEmail);
    }); 
    
    getDoc(doc(db, "profiles", userId)).then(d => {
      if(d.exists()) {
        setAvatar(d.data().avatar || "");
        setBio(d.data().bio || "");
      }
    });
  }, [userId]);

  const isUserBanned = bannedEmails.includes(userMail);

  if (isUserBanned) {
    return (
      <div style={{ textAlign: "center", padding: "50px", backgroundColor: theme.card, borderRadius: "12px", border: `1px solid ${theme.red}`, opacity: 0.8, filter: "grayscale(80%)" }}>
        <h1 style={{ color: theme.red, margin: "0 0 10px 0" }}><del>{userMail.split("@")[0]}</del></h1>
        <p style={{ fontSize: "16px", color: theme.subText }}>Bu hesap topluluk kuralları ihlali sebebiyle devre dışı bırakılmıştır.</p>
        <button onClick={() => navigate("/")} style={{ ...primaryBtnStyle(theme), marginTop: "20px" }}>Ana Sayfaya Dön</button>
      </div>
    );
  }

  const otherUsername = userMail ? userMail.split("@")[0] : "Kullanıcı";

  const filteredLib = lib.filter(i => {
    const isMatchingCat = i.type === cat;
    const actualStatus = (i.status === "watching" || i.status === "completed") ? i.status : "not-started";
    const isMatchingStatus = statusFilter === "all" || actualStatus === statusFilter;
    return isMatchingCat && isMatchingStatus;
  });

  return (
    <div>
      <button onClick={() => navigate("/")} style={{ background: "none", border: "none", color: theme.accent, cursor: "pointer", marginBottom: "25px", fontWeight: "bold", fontSize: "16px" }}>← Geri Dön</button>
      
      <div style={{ display: "flex", gap: "20px", alignItems: "center", marginBottom: "30px", borderBottom: `1px solid ${theme.border}`, paddingBottom: "20px" }}>
        {avatar ? (
          <img src={avatar} style={{ width: "80px", height: "80px", borderRadius: "50%", objectFit: "cover", border: `3px solid ${theme.border}` }} />
        ) : (
          <div style={{ width: "80px", height: "80px", borderRadius: "50%", backgroundColor: theme.bg, border: `2px solid ${theme.border}`, display: "flex", justifyContent: "center", alignItems: "center", fontSize: "32px", fontWeight: "bold", color: theme.text }}>
            {otherUsername[0]?.toUpperCase()}
          </div>
        )}
        <h2 style={{ margin: "0", fontSize: "32px", fontWeight: "900", color: theme.text }}>👤 {otherUsername}</h2>
      </div>

      <div style={{ backgroundColor: theme.card, padding: "20px", borderRadius: "12px", marginBottom: "30px", border: `1px solid ${theme.border}` }}>
         <p style={{ margin: 0, fontStyle: "italic", color: theme.subText, fontSize: "16px", lineHeight: "1.5" }}>"{bio || "Bu kullanıcı henüz bir biyografi eklememiş."}"</p>
      </div>
      
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "25px" }}>
        <div style={{ display: "flex", gap: "10px" }}>
          <button onClick={() => setCat("movie")} style={toggleBtnStyle(cat === "movie", theme)}>Filmleri</button>
          <button onClick={() => setCat("tv")} style={toggleBtnStyle(cat === "tv", theme)}>Dizileri</button>
          <button onClick={() => setCat("book")} style={toggleBtnStyle(cat === "book", theme)}>Kitapları</button>
        </div>
        
        <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)} style={{ ...inputStyle(theme), width: "180px", cursor: "pointer", fontSize: "14px" }}>
          <option value="all">Tüm Durumlar</option>
          <option value="not-started">Başlamadım</option>
          <option value="watching">Devam Ediyor</option>
          <option value="completed">Bitti</option>
        </select>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))", gap: "25px" }}>
        {filteredLib.map(item => {
          const itemStatus = (item.status === 'watching' || item.status === 'completed') ? item.status : 'not-started';
          return (
            <div key={item.docId} style={{ backgroundColor: theme.card, padding: "15px", borderRadius: "12px", textAlign: "center", border: `1px solid ${theme.border}`, boxShadow: "0 2px 8px rgba(0,0,0,0.05)" }}>
              <img src={item.image} style={{ width: "100%", height: "240px", objectFit: "cover", borderRadius: "6px", marginBottom: "15px" }} />
              <p style={{ fontWeight: "800", fontSize: "15px", margin: "0 0 10px 0", color: theme.text, lineHeight: "1.4" }}>{item.title}</p>
              <div style={{ color: itemStatus === "completed" ? theme.star : theme.subText, fontWeight: "bold", fontSize: "15px" }}>
                {itemStatus === "completed" ? `⭐ ${item.rating || "0"}/10` : (itemStatus === "watching" ? "Devam Ediyor" : "Başlamadım")}
              </div>
            </div>
          )
        })}
        {filteredLib.length === 0 && (
          <div style={{ gridColumn: "1 / -1", textAlign: "center", padding: "30px", color: theme.subText, fontSize: "15px" }}>
            Bu filtreye uygun içerik bulunamadı.
          </div>
        )}
      </div>
    </div>
  );
}

function AdminPanel({ theme, showToast, bannedEmails }) {
  const [allPosts, setAllPosts] = useState([]);
  const [supportRequests, setSupportRequests] = useState([]);
  const [adminLogs, setAdminLogs] = useState([]);
  
  const [view, setView] = useState("dashboard");
  const [broadcastMsg, setBroadcastMsg] = useState("");
  const [expandedPosts, setExpandedPosts] = useState({});

  // YENİ: Profesyonel Admin Dialog State'leri
  const [confirmDialog, setConfirmDialog] = useState({ isOpen: false, title: "", text: "", action: null });
  const [promptDialog, setPromptDialog] = useState({ isOpen: false, title: "", text: "", placeholder: "", action: null });

  useEffect(() => {
    const unsubP = onSnapshot(query(collection(db, "posts"), orderBy("createdAt", "desc")), s => setAllPosts(s.docs.map(d => ({ docId: d.id, ...d.data() }))));
    const unsubS = onSnapshot(query(collection(db, "supportRequests"), orderBy("createdAt", "desc")), s => setSupportRequests(s.docs.map(d => ({ id: d.id, ...d.data() }))));
    const unsubL = onSnapshot(query(collection(db, "adminLogs"), orderBy("createdAt", "desc")), s => setAdminLogs(s.docs.map(d => ({ id: d.id, ...d.data() }))));
    
    return () => { unsubP(); unsubS(); unsubL(); };
  }, []);

  const handleWarnUser = (email) => {
    setPromptDialog({
      isOpen: true,
      title: "Kullanıcıyı Uyar",
      text: `"${email}" e-posta adresine sahip kullanıcıya gönderilecek uyarı mesajını aşağıya yazınız:`,
      placeholder: "Lütfen topluluk kurallarına uyunuz...",
      action: async (msg) => {
        if (!msg.trim()) return;
        await addDoc(collection(db, "warnings"), { toEmail: email, message: msg, createdAt: serverTimestamp() });
        await addDoc(collection(db, "adminLogs"), { action: "Kullanıcı Uyarıldı", targetUser: email, details: msg, createdAt: serverTimestamp() });
        showToast("Uyarı gönderildi.");
        setPromptDialog({ isOpen: false });
      }
    });
  };

  const handleBanUser = (email) => {
    setConfirmDialog({
      isOpen: true,
      title: "Hesabı Devre Dışı Bırak",
      text: `DİKKAT! "${email}" hesabını sistemden kalıcı olarak uzaklaştırmak istediğinize emin misiniz? Kullanıcı bir daha giriş yapamayacaktır.`,
      action: async () => {
        await addDoc(collection(db, "bannedUsers"), { email });
        await addDoc(collection(db, "adminLogs"), { action: "Hesap Devre Dışı Bırakıldı", targetUser: email, details: "Kalıcı uzaklaştırma", createdAt: serverTimestamp() });
        showToast("Hesap başarıyla devre dışı bırakıldı.", "error");
        setConfirmDialog({ isOpen: false });
      }
    });
  };

  const handleUnbanUser = (email) => {
    setConfirmDialog({
      isOpen: true,
      title: "Engeli Kaldır",
      text: `"${email}" kullanıcısının engeli kaldırılacak ve sisteme tekrar erişimi sağlanacak. Onaylıyor musunuz?`,
      action: async () => {
        const q = query(collection(db, "bannedUsers"), where("email", "==", email));
        const snap = await getDocs(q);
        snap.forEach(d => deleteDoc(d.ref));
        
        await addDoc(collection(db, "adminLogs"), { action: "Engel Kaldırıldı", targetUser: email, details: "Kullanıcının sisteme erişimi geri verildi.", createdAt: serverTimestamp() });
        showToast("Kullanıcının engeli başarıyla kaldırıldı!");
        setConfirmDialog({ isOpen: false });
      }
    });
  };

  const handleBroadcast = async (e) => {
    e.preventDefault();
    if (!broadcastMsg.trim()) return;

    const EMAILJS_SERVICE_ID = "service_fjn66x6";   
    const EMAILJS_TEMPLATE_ID = "template_tidg6ae"; 
    const EMAILJS_PUBLIC_KEY = "LiGVZEzkQAuqCxY94";   
    
    const usersSnap = await getDocs(collection(db, "users"));
    const usersList = usersSnap.docs.map(d => d.data());

    usersList.forEach(async (u) => {
      await addDoc(collection(db, "notifications"), {
        toUserId: u.uid,
        fromUserEmail: "Sistem (Admin)",
        type: "broadcast",
        postTitle: broadcastMsg, 
        createdAt: serverTimestamp(),
        read: false
      });

      try {
        await fetch('https://api.emailjs.com/api/v1.0/email/send', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            service_id: EMAILJS_SERVICE_ID,
            template_id: EMAILJS_TEMPLATE_ID,
            user_id: EMAILJS_PUBLIC_KEY,
            template_params: {
              to_email: u.email,
              message: broadcastMsg
            }
          })
        });
      } catch(err) {
        console.error("Mail gönderilemedi", err);
      }
    });

    await addDoc(collection(db, "adminLogs"), { action: "Genel Duyuru Gönderildi", targetUser: "Tüm Kullanıcılar", details: broadcastMsg, createdAt: serverTimestamp() });
    showToast("📣 Duyuru tüm kullanıcılara hem site içi hem gerçek mail olarak gönderildi!");
    setBroadcastMsg("");
  };

  const toggleComments = (postId) => {
    setExpandedPosts(prev => ({ ...prev, [postId]: !prev[postId] }));
  };

  return (
    <div style={{ maxWidth: "1000px", margin: "0 auto" }}>
      <h2 style={{ color: theme.text, borderBottom: `1px solid ${theme.border}`, paddingBottom: "15px", fontSize: "28px", fontWeight: "900" }}>🛡️ Yönetim Merkezi</h2>
      
      <CustomConfirm isOpen={confirmDialog.isOpen} title={confirmDialog.title} text={confirmDialog.text} theme={theme} onCancel={() => setConfirmDialog({ isOpen: false })} onConfirm={confirmDialog.action} />
      <CustomPrompt isOpen={promptDialog.isOpen} title={promptDialog.title} text={promptDialog.text} placeholder={promptDialog.placeholder} theme={theme} onCancel={() => setPromptDialog({ isOpen: false })} onConfirm={promptDialog.action} />

      <div style={{ display: "flex", gap: "10px", margin: "25px 0" }}>
        <button onClick={() => setView("dashboard")} style={miniToggleStyle(view === "dashboard", theme)}>📊 İstatistik & Yönetim</button>
        <button onClick={() => setView("posts")} style={miniToggleStyle(view === "posts", theme)}>Gönderileri Denetle</button>
        <button onClick={() => setView("support")} style={miniToggleStyle(view === "support", theme)}>Destek Mesajları ({supportRequests.length})</button>
        <button onClick={() => setView("logs")} style={miniToggleStyle(view === "logs", theme)}>İşlem Geçmişi</button>
      </div>

      {view === "dashboard" && (
        <div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: "20px", marginBottom: "30px" }}>
            <div style={{ backgroundColor: theme.card, padding: "20px", borderRadius: "12px", border: `1px solid ${theme.border}` }}>
              <div style={{ fontSize: "14px", color: theme.subText, fontWeight: "bold" }}>📄 Toplam Gönderi</div>
              <div style={{ fontSize: "32px", fontWeight: "900", color: theme.text, marginTop: "5px" }}>{allPosts.length}</div>
            </div>
            <div style={{ backgroundColor: theme.card, padding: "20px", borderRadius: "12px", border: `1px solid ${theme.border}` }}>
              <div style={{ fontSize: "14px", color: theme.subText, fontWeight: "bold" }}>👍 Toplam Beğeni</div>
              <div style={{ fontSize: "32px", fontWeight: "900", color: theme.text, marginTop: "5px" }}>{allPosts.reduce((acc, p) => acc + (p.likes?.length || 0), 0)}</div>
            </div>
            <div style={{ backgroundColor: theme.card, padding: "20px", borderRadius: "12px", border: `1px solid ${theme.border}` }}>
              <div style={{ fontSize: "14px", color: theme.subText, fontWeight: "bold" }}>💬 Destek Talepleri</div>
              <div style={{ fontSize: "32px", fontWeight: "900", color: theme.text, marginTop: "5px" }}>{supportRequests.length}</div>
            </div>
            <div style={{ backgroundColor: theme.card, padding: "20px", borderRadius: "12px", border: `1px solid ${theme.border}` }}>
              <div style={{ fontSize: "14px", color: theme.red, fontWeight: "bold" }}>🚫 Yasaklı Hesaplar</div>
              <div style={{ fontSize: "32px", fontWeight: "900", color: theme.red, marginTop: "5px" }}>{bannedEmails.length}</div>
            </div>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "20px", marginBottom: "30px" }}>
            <div style={{ backgroundColor: theme.card, padding: "20px", borderRadius: "12px", border: `1px solid ${theme.border}` }}>
              <h3 style={{ marginTop: 0, color: theme.text, fontSize: "18px" }}>📣 Genel Duyuru Gönder</h3>
              <p style={{ fontSize: "13px", color: theme.subText, marginBottom: "15px" }}>Bu mesaj tüm kullanıcıların bildirim ziline ve E-posta adreslerine iletilir.</p>
              <form onSubmit={handleBroadcast}>
                <textarea value={broadcastMsg} onChange={e => setBroadcastMsg(e.target.value)} placeholder="Tüm sisteme gönderilecek duyuruyu yazın..." style={{ ...inputStyle(theme), height: "100px", resize: "none", marginBottom: "10px" }} />
                <button type="submit" style={{ ...primaryBtnStyle(theme), width: "100%" }}>Herkese Gönder</button>
              </form>
            </div>

            <div style={{ backgroundColor: theme.card, padding: "20px", borderRadius: "12px", border: `1px solid ${theme.border}`, maxHeight: "250px", overflowY: "auto" }}>
              <h3 style={{ marginTop: 0, color: theme.red, fontSize: "18px" }}>🚫 Yasaklı Kullanıcılar</h3>
              {bannedEmails.length === 0 ? (
                <p style={{ fontSize: "14px", color: theme.subText }}>Şu an yasaklı kullanıcı bulunmuyor.</p>
              ) : (
                bannedEmails.map(email => (
                  <div key={email} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "12px", backgroundColor: theme.bg, borderRadius: "8px", marginBottom: "10px", border: `1px solid ${theme.border}` }}>
                    <span style={{ fontSize: "14px", fontWeight: "bold", color: theme.text }}>{email}</span>
                    <button onClick={() => handleUnbanUser(email)} style={{ backgroundColor: theme.green, color: "white", border: "none", padding: "6px 12px", borderRadius: "6px", cursor: "pointer", fontWeight: "bold", fontSize: "12px" }}>Engeli Kaldır</button>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {view === "posts" && (
        allPosts.map(post => (
          <div key={post.docId} style={{ backgroundColor: theme.card, padding: "20px", borderRadius: "12px", marginBottom: "20px", border: `1px solid ${theme.border}` }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "15px", backgroundColor: theme.bg, padding: "12px", borderRadius: "8px", fontSize: "14px", border: `1px solid ${theme.border}` }}>
              <div>
                <b style={{color: bannedEmails.includes(post.userEmail) ? theme.red : theme.accent, opacity: bannedEmails.includes(post.userEmail) ? 0.6 : 1}}>
                  {bannedEmails.includes(post.userEmail) ? <del>{post.userEmail}</del> : post.userEmail}
                </b> 
                <span style={{marginLeft: "10px", color: theme.subText}}>İçerik: <b style={{color: theme.text}}>{post.title}</b></span>
              </div>
              <div style={{ display: "flex", gap: "10px" }}>
                {!bannedEmails.includes(post.userEmail) && (
                  <>
                    <button onClick={() => handleWarnUser(post.userEmail)} style={{ backgroundColor: theme.bg, color: theme.text, border: `1px solid ${theme.border}`, padding: "6px 12px", borderRadius: "6px", cursor: "pointer", fontWeight: "bold", fontSize: "12px" }}>UYAR</button>
                    <button onClick={() => handleBanUser(post.userEmail)} style={{ backgroundColor: `${theme.red}15`, color: theme.red, border: "none", padding: "6px 12px", borderRadius: "6px", cursor: "pointer", fontWeight: "bold", fontSize: "12px" }}>DEVRE DIŞI BIRAK</button>
                  </>
                )}
                <button 
                  onClick={async () => {
                    await updateDoc(doc(db, "posts", post.docId), { hidden: !post.hidden });
                    showToast(post.hidden ? "Gönderi tekrar herkese açık." : "Gönderi gizlendi (Shadowban).");
                  }} 
                  style={{ backgroundColor: post.hidden ? theme.green : theme.accent, color: "#FFFFFF", border: "none", padding: "6px 12px", borderRadius: "6px", cursor: "pointer", fontWeight: "bold", fontSize: "12px" }}
                >
                  {post.hidden ? "GİZLİLİĞİ KALDIR" : "GİZLE (Shadowban)"}
                </button>
                <button 
                  onClick={() => { 
                    setConfirmDialog({
                      isOpen: true,
                      title: "Gönderiyi Sil",
                      text: "Bu gönderi sistemden kalıcı olarak silinecek. Onaylıyor musunuz?",
                      action: async () => {
                        await deleteDoc(doc(db, "posts", post.docId)); 
                        await addDoc(collection(db, "adminLogs"), { action: "Gönderi Silindi", targetUser: post.userEmail, details: `İçerik: ${post.title}`, createdAt: serverTimestamp() });
                        showToast("Gönderi silindi", "error"); 
                        setConfirmDialog({ isOpen: false });
                      }
                    });
                  }} 
                  style={{ backgroundColor: theme.red, color: "#FFFFFF", border: "none", padding: "6px 12px", borderRadius: "6px", cursor: "pointer", fontWeight: "bold", fontSize: "12px" }}
                >
                  SİL
                </button>
              </div>
            </div>
            
            {post.hidden && <div style={{ marginBottom: "15px", fontSize: "13px", color: theme.red, fontWeight: "bold" }}>⚠️ Bu gönderi gizlenmiştir. Diğer kullanıcıların akışında görünmüyor.</div>}
            
            <button 
               onClick={() => toggleComments(post.docId)} 
               style={{ background: "none", border: "none", color: theme.accent, cursor: "pointer", fontSize: "14px", fontWeight: "800", padding: "5px 0", display: "flex", alignItems: "center", gap: "5px" }}
            >
               {expandedPosts[post.docId] ? "▲ Detayları Kapat" : "▼ Gönderi Notunu ve Yorumları Gör"}
            </button>

            {expandedPosts[post.docId] && (
               <div style={{ marginTop: "15px", padding: "15px", backgroundColor: theme.bg, borderRadius: "8px", border: `1px dashed ${theme.border}` }}>
                  <div style={{ marginBottom: "20px", paddingBottom: "15px", borderBottom: `1px solid ${theme.border}` }}>
                     <h4 style={{ margin: "0 0 8px 0", fontSize: "13px", color: theme.subText, textTransform: "uppercase" }}>Kullanıcı Notu:</h4>
                     <p style={{ margin: 0, fontSize: "15px", color: theme.text, fontStyle: "italic", lineHeight: "1.5" }}>
                        "{post.note || "Kullanıcı bir not eklememiş."}"
                     </p>
                  </div>
                  <h4 style={{ margin: "0 0 10px 0", fontSize: "13px", color: theme.subText, textTransform: "uppercase" }}>Yorumlar:</h4>
                  <AdminCommentList post={post} theme={theme} showToast={showToast} bannedEmails={bannedEmails} handleWarnUser={handleWarnUser} handleBanUser={handleBanUser} />
               </div>
            )}
          </div>
        ))
      )}

      {view === "support" && (
        supportRequests.map(req => (
          <div key={req.id} style={{ backgroundColor: theme.card, padding: "20px", borderRadius: "12px", marginBottom: "15px", borderLeft: `5px solid ${theme.accent}`, borderTop: `1px solid ${theme.border}`, borderRight: `1px solid ${theme.border}`, borderBottom: `1px solid ${theme.border}` }}>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: "15px" }}>
              <b style={{fontWeight: "700", color: theme.text}}>{req.userEmail}</b>
              <small style={{color: theme.subText}}>{req.createdAt?.toDate()?.toLocaleString()}</small>
            </div>
            <p style={{marginTop: "10px", lineHeight: "1.6", fontSize: "15px", color: theme.text}}>{req.message}</p>
            <button onClick={() => deleteDoc(doc(db, "supportRequests", req.id)).then(()=>showToast("Mesaj Arşivlendi"))} style={{ color: theme.red, background: "none", border: "none", cursor: "pointer", textDecoration: "underline", padding: 0, marginTop: "10px", fontWeight: "bold", fontSize: "14px" }}>Talebi Kapat</button>
          </div>
        ))
      )}

      {view === "logs" && (
        <div style={{ backgroundColor: theme.card, borderRadius: "12px", border: `1px solid ${theme.border}`, overflow: "hidden" }}>
          {adminLogs.length === 0 ? (
             <div style={{ padding: "30px", textAlign: "center", color: theme.subText, fontSize: "15px" }}>Henüz kaydedilmiş bir admin işlemi yok.</div>
          ) : (
            <table style={{ width: "100%", borderCollapse: "collapse", textAlign: "left", fontSize: "14px", color: theme.text }}>
              <thead style={{ backgroundColor: theme.bg }}>
                <tr>
                  <th style={{ padding: "15px", borderBottom: `1px solid ${theme.border}` }}>Tarih</th>
                  <th style={{ padding: "15px", borderBottom: `1px solid ${theme.border}` }}>İşlem Tipi</th>
                  <th style={{ padding: "15px", borderBottom: `1px solid ${theme.border}` }}>Hedef Kullanıcı</th>
                  <th style={{ padding: "15px", borderBottom: `1px solid ${theme.border}` }}>Detay / Not</th>
                </tr>
              </thead>
              <tbody>
                {adminLogs.map(log => (
                  <tr key={log.id} style={{ borderBottom: `1px solid ${theme.border}` }}>
                    <td style={{ padding: "15px", color: theme.subText }}>{log.createdAt?.toDate()?.toLocaleString()}</td>
                    <td style={{ padding: "15px", fontWeight: "bold", color: log.action.includes("Devre Dışı") || log.action.includes("Silindi") ? theme.red : (log.action.includes("Engel") || log.action.includes("Duyuru") ? theme.green : theme.accent) }}>{log.action}</td>
                    <td style={{ padding: "15px" }}>{log.targetUser}</td>
                    <td style={{ padding: "15px", fontStyle: "italic", color: theme.subText }}>{log.details}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}
    </div>
  );
}

function AdminCommentList({ post, theme, showToast, bannedEmails, handleWarnUser, handleBanUser }) {
  const [comments, setComments] = useState([]);
  const [confirmDialog, setConfirmDialog] = useState({ isOpen: false, title: "", text: "", action: null });
  
  useEffect(() => {
    return onSnapshot(query(collection(db, `posts/${post.docId}/comments`), orderBy("createdAt", "asc")), s => setComments(s.docs.map(d => ({ id: d.id, ...d.data() }))));
  }, [post.docId]);

  return (
    <div style={{ paddingLeft: "10px", marginTop: "10px" }}>
      <CustomConfirm isOpen={confirmDialog.isOpen} title={confirmDialog.title} text={confirmDialog.text} theme={theme} onCancel={() => setConfirmDialog({ isOpen: false })} onConfirm={confirmDialog.action} />
      
      {comments.length === 0 && <small style={{color: theme.subText, fontSize: "14px"}}>Bu gönderiye henüz yorum yapılmamış.</small>}
      {comments.map(c => (
        <div key={c.id} style={{ display: "flex", justifyContent: "space-between", padding: "12px 0", borderTop: `1px solid ${theme.border}`, fontSize: "14px" }}>
          <span>
            <b style={{color: bannedEmails.includes(c.userEmail) ? theme.red : theme.accent, opacity: bannedEmails.includes(c.userEmail) ? 0.6 : 1, fontWeight: "700"}}>
              {bannedEmails.includes(c.userEmail) ? <del>{c.userEmail?.split("@")[0]}</del> : c.userEmail?.split("@")[0]}:
            </b> <span style={{opacity: bannedEmails.includes(c.userEmail) ? 0.6 : 1, marginLeft: "6px", color: theme.text}}>{c.text}</span>
          </span>
          <div style={{ display: "flex", gap: "10px" }}>
             {!bannedEmails.includes(c.userEmail) && (
                <>
                  <button onClick={() => handleWarnUser(c.userEmail)} style={{ color: theme.text, border: "none", background: "none", cursor: "pointer", fontSize: "12px", fontWeight: "bold" }}>Uyar</button>
                  <button onClick={() => handleBanUser(c.userEmail)} style={{ color: theme.red, border: "none", background: "none", cursor: "pointer", fontSize: "12px", fontWeight: "bold" }}>Devre Dışı</button>
                </>
             )}
            <button 
               onClick={() => {
                 setConfirmDialog({
                   isOpen: true,
                   title: "Yorumu Sil",
                   text: "Bu yorum kalıcı olarak silinecek. Onaylıyor musunuz?",
                   action: async () => {
                     await deleteCommentAdmin(post.docId, c.id);
                     showToast("Yorum silindi", "error");
                     setConfirmDialog({ isOpen: false });
                   }
                 })
               }} 
               style={{ color: theme.red, border: "none", background: "none", cursor: "pointer", fontSize: "12px", fontWeight: "bold", textDecoration: "underline" }}
            >
               Yorumu Sil
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}

function AuthPage({ theme, setUser, showToast, darkMode, setDarkMode }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isReg, setIsReg] = useState(false);
  const [showPwd, setShowPwd] = useState(false); 
  
  // YENİ: Profesyonel Şifre Sıfırlama Bildirimi State'i
  const [resetModalOpen, setResetModalOpen] = useState(false);

  const handleAuth = async (e) => {
    e.preventDefault();
    try {
      if (isReg) { 
        const res = await createUserWithEmailAndPassword(auth, email.trim(), password); 
        await setDoc(doc(db, "users", res.user.uid), { email: email.trim(), uid: res.user.uid });
        showToast("KültürLog'a Hoş Geldin!"); 
      } else { 
        const res = await signInWithEmailAndPassword(auth, email.trim(), password); 
        await setDoc(doc(db, "users", res.user.uid), { email: email.trim(), uid: res.user.uid }, { merge: true });
        showToast("Giriş Başarılı!"); 
      }
    } catch (e) { 
      showToast("Bilgileri kontrol ediniz!", "error"); 
    }
  };

  const handleResetPassword = async () => {
    if (!email.trim()) {
      showToast("Lütfen önce e-posta adresinizi yukarıdaki kutuya girin.", "error");
      return;
    }
    try {
      await sendPasswordResetEmail(auth, email.trim());
      setResetModalOpen(true); // Toast yerine profesyonel Modal açılır
    } catch (error) {
      showToast("Böyle bir hesap bulunamadı veya bir hata oluştu.", "error");
    }
  };

  return (
    <div style={{ height: "100vh", display: "flex", justifyContent: "center", alignItems: "center", backgroundColor: theme.bg, position: "relative" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&display=swap');
        * { font-family: 'Inter', sans-serif !important; }
      `}</style>
      
      {/* YENİ: Şifre Sıfırlama Yönlendirme Modalı */}
      {resetModalOpen && (
        <div style={{ position: "fixed", top: 0, left: 0, right: 0, bottom: 0, backgroundColor: "rgba(0,0,0,0.7)", zIndex: 9999, display: "flex", justifyContent: "center", alignItems: "center" }}>
          <div style={{ backgroundColor: theme.card, padding: "40px", borderRadius: "16px", maxWidth: "420px", width: "90%", textAlign: "center", border: `1px solid ${theme.border}`, boxShadow: "0 20px 40px rgba(0,0,0,0.3)" }}>
            <div style={{ fontSize: "50px", marginBottom: "15px" }}>✉️</div>
            <h3 style={{ color: theme.text, margin: "0 0 10px 0", fontSize: "22px", fontWeight: "900" }}>E-postanızı Kontrol Edin</h3>
            <p style={{ color: theme.subText, lineHeight: "1.6", marginBottom: "30px", fontSize: "15px" }}>
              Şifre sıfırlama bağlantısı güvenli bir şekilde <b>{email}</b> adresinize gönderildi. Lütfen gelen kutunuzu (ve gerekiyorsa spam klasörünü) kontrol edip şifrenizi yenileyin.
            </p>
            <button onClick={() => setResetModalOpen(false)} style={{ ...primaryBtnStyle(theme), width: "100%", fontSize: "16px" }}>Anladım, Teşekkürler</button>
          </div>
        </div>
      )}

      <div style={{ position: "absolute", top: "30px", right: "30px" }}>
        <button onClick={() => setDarkMode(!darkMode)} style={{ background: theme.card, border: `1px solid ${theme.border}`, color: theme.text, padding: "10px 15px", borderRadius: "8px", cursor: "pointer", fontSize: "16px", boxShadow: "0 4px 12px rgba(0,0,0,0.05)", display: "flex", alignItems: "center", gap: "8px", fontWeight: "600" }}>
          {darkMode ? "☀️ Aydınlık Mod" : "🌙 Karanlık Mod"}
        </button>
      </div>

      <div style={{ backgroundColor: theme.card, padding: "45px", borderRadius: "16px", width: "380px", textAlign: "center", boxShadow: "0 20px 40px -10px rgba(0,0,0,0.1)", border: `1px solid ${theme.border}` }}>
        <h1 style={{ color: theme.accent, fontSize: "40px", marginBottom: "30px", margin: "0 0 30px 0", fontWeight: "900", letterSpacing: "-1px" }}>KültürLog</h1>
        <form onSubmit={handleAuth} style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
          <input type="email" placeholder="E-posta Adresiniz" value={email} onChange={e => setEmail(e.target.value)} style={inputStyle(theme)} required />
          
          <div style={{ position: "relative", width: "100%" }}>
            <input 
              type={showPwd ? "text" : "password"} 
              placeholder="Şifreniz" 
              value={password} 
              onChange={e => setPassword(e.target.value)} 
              style={{...inputStyle(theme), paddingRight: "40px"}} 
              required={!isReg && email === ""} 
            />
            <button 
              type="button" 
              onClick={() => setShowPwd(!showPwd)} 
              style={{ position: "absolute", right: "12px", top: "50%", transform: "translateY(-50%)", background: "none", border: "none", cursor: "pointer", fontSize: "16px", color: theme.subText }}
            >
              {showPwd ? "🙈" : "👁️"}
            </button>
          </div>
          
          {!isReg && (
            <div style={{ textAlign: "right", marginTop: "-10px" }}>
              <button 
                type="button" 
                onClick={handleResetPassword} 
                style={{ background: "none", border: "none", color: theme.subText, fontSize: "13px", textDecoration: "underline", cursor: "pointer", padding: 0 }}
              >
                Şifremi Unuttum
              </button>
            </div>
          )}

          <button type="submit" style={{ ...primaryBtnStyle(theme), fontSize: "16px", padding: "14px" }}>
            {isReg ? "Kayıt Ol" : "Giriş Yap"}
          </button>
        </form>
        <p onClick={() => setIsReg(!isReg)} style={{ cursor: "pointer", color: theme.accent, marginTop: "25px", fontWeight: "bold", fontSize: "15px" }}>
          {isReg ? "Zaten üyeyim, giriş yap" : "Hesabın yok mu? Kayıt Ol"}
        </p>
        <div style={{marginTop: "25px", borderTop: `1px solid ${theme.border}`, paddingTop: "20px"}}>
          <button onClick={() => setUser({ uid: "guest", email: "misafir@kulturlog.com" })} style={{ background: "none", border: "none", color: theme.subText, cursor: "pointer", fontSize: "14px", fontWeight: "600" }}>
            Kayıt olmadan devam et (Misafir)
          </button>
        </div>
      </div>
    </div>
  );
}

const inputStyle = (theme) => ({ padding: "14px", borderRadius: "8px", border: `1px solid ${theme.border}`, backgroundColor: theme.bg, color: theme.text, width: "100%", boxSizing: "border-box", outline: "none", fontSize: "15px", transition: "border 0.2s" });
const primaryBtnStyle = (theme) => ({ padding: "12px", backgroundColor: theme.accent, color: "#FFFFFF", border: `none`, borderRadius: "8px", cursor: "pointer", fontWeight: "800", transition: "all 0.2s", fontSize: "15px" });
const toggleBtnStyle = (active, theme) => ({ padding: "12px 25px", border: active ? `1px solid ${theme.accent}` : `1px solid ${theme.border}`, borderRadius: "8px", cursor: "pointer", backgroundColor: active ? theme.accent : theme.card, color: active ? "#FFFFFF" : theme.text, fontWeight: "800", fontSize: "15px", transition: "all 0.2s" });
const miniToggleStyle = (active, theme) => ({ padding: "10px 18px", border: active ? `1px solid ${theme.accent}` : `1px solid ${theme.border}`, borderRadius: "6px", cursor: "pointer", backgroundColor: active ? theme.accent : theme.bg, color: active ? "#FFFFFF" : theme.text, fontWeight: "700", fontSize: "14px" });
const actionBtnStyle = (active, theme, isLike) => ({ padding: "6px 16px", border: `1px solid ${active ? (isLike ? theme.green : theme.red) : theme.border}`, borderRadius: "8px", background: active ? (isLike ? `${theme.green}22` : `${theme.red}22`) : theme.bg, color: active ? (isLike ? theme.green : theme.red) : theme.subText, cursor: "pointer", fontWeight: "bold", fontSize: "14px", transition: "all 0.2s" });
const commentActionStyle = (active, theme, isLike) => ({ cursor: "pointer", fontSize: "13px", fontWeight: "700", color: active ? (isLike ? theme.accent : theme.red) : theme.subText, marginRight: "5px", padding: "4px 8px", borderRadius: "6px", background: active ? (isLike ? `${theme.accent}15` : `${theme.red}15`) : "transparent", transition: "all 0.2s" });

export default App;