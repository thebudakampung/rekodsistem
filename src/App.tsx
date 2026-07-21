import React, { useState, useEffect, useRef, ChangeEvent, DragEvent } from "react";
import { 
  FileText, 
  Plus, 
  Trash2, 
  Printer, 
  Save, 
  RefreshCw, 
  Upload, 
  FileImage, 
  Search, 
  CreditCard, 
  User, 
  Building, 
  Check, 
  Eye, 
  X, 
  FileSpreadsheet,
  AlertCircle,
  Clock,
  ShieldCheck,
  Database,
  Users,
  Lock,
  Unlock,
  CheckCircle,
  Download
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { ExpenseItem, ReceiptAttachment, ClaimRecord } from "./types";
import { db, auth, googleProvider } from "./firebase";
import { collection, doc, setDoc, getDocs, deleteDoc, query, orderBy, updateDoc } from "firebase/firestore";
import { 
  onAuthStateChanged,
  signInWithPopup,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut,
  updateProfile,
  User as FirebaseUser
} from "firebase/auth";

// --- FIRESTORE ERROR HANDLING (SKILL COMPLIANT) ---
export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
  };
}

export function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {},
    operationType,
    path
  };
  console.error('Firestore Error Detailed: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

// Helper to convert number to Malay words for official payment voucher
export function numberToMalayWords(num: number): string {
  const units = ["", "Satu", "Dua", "Tiga", "Empat", "Lima", "Enam", "Tujuh", "Lapan", "Sembilan"];
  const teens = ["Sepuluh", "Sebelas", "Dua Belas", "Tiga Belas", "Empat Belas", "Lima Belas", "Enam Belas", "Tujuh Belas", "Lapan Belas", "Sembilan Belas"];
  const tens = ["", "Sepuluh", "Dua Puluh", "Tiga Puluh", "Empat Puluh", "Lima Puluh", "Enam Puluh", "Tujuh Puluh", "Lapan Puluh", "Sembilan Puluh"];

  const formatHundreds = (n: number): string => {
    let str = "";
    if (n >= 100) {
      const h = Math.floor(n / 100);
      if (h === 1) {
        str += "Seratus ";
      } else {
        str += units[h] + " Ratus ";
      }
      n %= 100;
    }
    if (n >= 10 && n < 20) {
      str += teens[n - 10] + " ";
    } else {
      if (n >= 20) {
        str += tens[Math.floor(n / 10)] + " ";
        n %= 10;
      }
      if (n > 0) {
        str += units[n] + " ";
      }
    }
    return str.trim();
  };

  const ringgit = Math.floor(num);
  const sen = Math.round((num - ringgit) * 100);

  let result = "";

  if (ringgit === 0) {
    result = "Kosong Ringgit";
  } else {
    let temp = ringgit;
    const parts = [];
    const scale = ["", "Ribu", "Juta"];
    let i = 0;
    while (temp > 0) {
      const part = temp % 1000;
      if (part > 0) {
        let partStr = formatHundreds(part);
        if (i === 1 && part === 1) {
          partStr = "Se";
        }
        parts.push(partStr + (scale[i] ? (part === 1 && i === 1 ? "ribu" : " " + scale[i]) : ""));
      }
      temp = Math.floor(temp / 1000);
      i++;
    }
    result = parts.reverse().join(" ").trim() + " Ringgit";
    result = result.replace(/\s+/g, " ");
  }

  if (sen > 0) {
    let senStr = "";
    if (sen >= 10 && sen < 20) {
      senStr = teens[sen - 10];
    } else {
      if (sen >= 20) {
        senStr = tens[Math.floor(sen / 10)];
        if (sen % 10 > 0) {
          senStr += " " + units[sen % 10];
        }
      } else {
        senStr = units[sen];
      }
    }
    result += " Dan " + senStr + " Sen";
  }

  return result + " Sahaja";
}

// Compress base64 image using canvas to ensure total file sizes are well within Firestore limits (max 1MB per document)
export function compressImage(base64Str: string, maxWidth = 800, maxHeight = 800, quality = 0.5): Promise<string> {
  return new Promise((resolve) => {
    // Only compress actual data URL images
    if (!base64Str.startsWith("data:image/")) {
      resolve(base64Str);
      return;
    }
    const img = new Image();
    img.src = base64Str;
    img.onload = () => {
      let width = img.width;
      let height = img.height;

      // Calculate new dimensions while maintaining aspect ratio
      if (width > height) {
        if (width > maxWidth) {
          height = Math.round((height * maxWidth) / width);
          width = maxWidth;
        }
      } else {
        if (height > maxHeight) {
          width = Math.round((width * maxHeight) / height);
          height = maxHeight;
        }
      }

      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;

      const ctx = canvas.getContext("2d");
      if (!ctx) {
        resolve(base64Str);
        return;
      }

      ctx.drawImage(img, 0, 0, width, height);
      // Export as a lightweight JPEG to save space
      const compressedDataUrl = canvas.toDataURL("image/jpeg", quality);
      resolve(compressedDataUrl);
    };
    img.onerror = () => {
      resolve(base64Str);
    };
  });
}

interface VoucherPrintSheetProps {
  record: any;
}

export function VoucherPrintSheet({ record }: VoucherPrintSheetProps) {
  // Pad items list to always have exactly 5 rows
  const activeItems = (record.items || []).filter(
    (item: any) => item.description.trim() !== "" || item.amount.trim() !== ""
  );
  
  const paddedItems = [...activeItems];
  while (paddedItems.length < 5) {
    paddedItems.push({
      id: `empty-${paddedItems.length}`,
      description: "",
      amount: ""
    });
  }

  return (
    <div className="w-full bg-[#f2f5f2] p-6 text-slate-800 leading-normal font-sans border-2 border-[#8ca68c] relative rounded-xs text-xs text-left">
      {/* Decorative Stamp Watermark */}
      {record.isApproved && (
        <div className="absolute left-[33%] top-[115px] border-4 border-red-600/85 text-red-600/85 bg-white/40 uppercase text-[11px] font-black px-4 py-1.5 rounded-md rotate-12 select-none pointer-events-none z-10 tracking-widest shadow-xs">
          DILULUSKAN / APPROVED
        </div>
      )}

      {/* Header Container */}
      <div className="flex justify-between items-start pb-4 border-b-2 border-[#8ca68c] gap-4">
        {/* Company Info */}
        <div className="space-y-1 max-w-[60%]">
          <h1 className="text-sm md:text-base font-black tracking-wide text-slate-900 uppercase leading-snug">
            Pertubuhan IKRAM Malaysia (IKRAM)
          </h1>
          <p className="text-xs font-black text-[#2d472d] uppercase">
            Kawasan Perak Tengah
          </p>
        </div>

        {/* Voucher Title Badge on Right */}
        <div className="flex flex-col items-end shrink-0 gap-2">
          <div className="bg-[#b6cbb6] border border-[#8ca68c] px-4 py-2 text-center rounded-sm">
            <h2 className="text-xs md:text-sm font-black tracking-widest text-[#233823] leading-tight">
              PAYMENT<br />VOUCHER
            </h2>
          </div>
          
          {/* Voucher Meta Info block */}
          <div className="border border-[#8ca68c] bg-white p-2 rounded-xs min-w-[150px] space-y-1 text-[9px] font-semibold text-slate-700">
            <div className="flex justify-between">
              <span className="text-slate-400">PV#:</span>
              <span className="font-mono text-slate-900 font-extrabold">{record.pvNumber || "—"}</span>
            </div>
            <div className="flex justify-between border-t border-[#e2e8e2] pt-1">
              <span className="text-slate-400">Date:</span>
              <span className="font-mono text-slate-900">{record.date || "—"}</span>
            </div>
            <div className="flex justify-between border-t border-[#e2e8e2] pt-1">
              <span className="text-slate-400">CHQ#:</span>
              <span className="text-slate-900 uppercase font-bold">ONLINE</span>
            </div>
          </div>
        </div>
      </div>

      {/* Pay to field */}
      <div className="py-4 flex items-center border-b border-[#a3bfa3] text-xs">
        <span className="font-extrabold text-[#2d472d] uppercase mr-2 shrink-0">Pay to:</span>
        <div className="flex-1 border-b border-[#2d472d] pb-0.5 font-bold text-slate-900 uppercase tracking-wide">
          {record.claimantName || "—"}
        </div>
      </div>

      {/* Ledger Items Table */}
      <div className="mt-4">
        <table className="w-full border-collapse border border-[#8ca68c] text-left">
          <thead>
            <tr className="bg-[#b8cbb8] text-[9px] font-black uppercase tracking-wider text-[#1f301f] border-b border-[#8ca68c]">
              <th className="p-2 border-r border-[#8ca68c] w-12 text-center">No.</th>
              <th className="p-2 border-r border-[#8ca68c]">Item Description</th>
              <th className="p-2 w-32 text-right">Amount (RM)</th>
            </tr>
          </thead>
          <tbody>
            {paddedItems.map((item, idx) => {
              const parsedAmt = parseFloat(item.amount);
              return (
                <tr key={item.id} className="border-b border-[#a3bfa3] bg-white/50 last:border-b-0 h-8">
                  <td className="p-2 border-r border-[#8ca68c] text-center font-mono font-bold text-slate-600">
                    {idx + 1}
                  </td>
                  <td className="p-2 border-r border-[#8ca68c] font-medium text-slate-800">
                    {item.description}
                  </td>
                  <td className="p-2 text-right font-mono font-semibold text-slate-900">
                    {!isNaN(parsedAmt) ? parsedAmt.toFixed(2) : ""}
                  </td>
                </tr>
              );
            })}
            {/* Totals row */}
            <tr className="bg-[#b8cbb8] font-extrabold border-t-2 border-[#8ca68c] text-[#1f301f]">
              <td colSpan={2} className="p-2 border-r border-[#8ca68c] text-center uppercase text-[9px] tracking-wider">
                TOTAL
              </td>
              <td className="p-2 text-right font-mono text-xs text-slate-950">
                {record.totalAmount ? record.totalAmount.toFixed(2) : "0.00"}
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      {/* Amount in words */}
      <div className="mt-4 p-2 bg-white/60 border border-[#a3bfa3] rounded-sm italic">
        <span className="font-bold text-[#2d472d] uppercase text-[8px] block not-italic">
          Ringgit Malaysia Dalam Perkataan / Amount in Words:
        </span>
        <span className="text-slate-900 font-extrabold text-[11px] block mt-0.5">
          {numberToMalayWords(record.totalAmount || 0)}
        </span>
      </div>

      {/* Authorizations / Signatures Section */}
      <div className="grid grid-cols-3 gap-4 mt-8 text-left text-[9px] font-medium leading-normal">
        <div>
          <span className="font-black text-[#2d472d] uppercase tracking-wider text-[8px] block mb-1">Prepared by:</span>
          <div className="h-14 flex items-end pb-1 pl-1">
            <span className="font-signature font-normal text-[#1f301f] text-2xl leading-none block">
              Veddin
            </span>
          </div>
          <div className="border-t border-slate-400 w-full pt-1 text-[8px] text-slate-500 font-medium">
            Bendahari Kawasan
          </div>
        </div>
        
        <div>
          <span className="font-black text-[#2d472d] uppercase tracking-wider text-[8px] block mb-1">Authorized by:</span>
          <div className="h-14 flex items-end pb-1 pl-1">
            {record.isApproved && (
              <span className="font-signature font-normal text-[#1f301f] text-2xl leading-none block">
                Dr. Mohamad Rizza
              </span>
            )}
          </div>
          <div className="border-t border-slate-400 w-full pt-1 text-[8px] text-slate-500 font-medium">
            YDP Kawasan
          </div>
        </div>

        <div>
          <span className="font-black text-[#2d472d] uppercase tracking-wider text-[8px] block mb-1">Received by:</span>
          <div className="h-14 flex items-end pb-1">
            <span className="font-bold text-slate-800 truncate italic block pb-1">
              {record.claimantName || ""}
            </span>
          </div>
          <div className="border-t border-slate-400 w-full pt-1 text-[8px] text-slate-500 font-medium">
            Recipient Signature & Date
          </div>
        </div>
      </div>
    </div>
  );
}

export default function App() {
  // --- STATE ---
  const [orgName, setOrgName] = useState("IKRAM Perak Tengah");
  const [pvNumber, setPvNumber] = useState("");
  const [pvDate, setPvDate] = useState("");
  
  const [claimantName, setClaimantName] = useState("");
  const [claimantPosition, setClaimantPosition] = useState("");
  const [bankName, setBankName] = useState("");
  const [bankAccount, setBankAccount] = useState("");
  const [purpose, setPurpose] = useState("");

  const [items, setItems] = useState<ExpenseItem[]>([
    { id: "1", description: "Contoh: Tuntutan perjalanan & tol (Lampiran 1)", amount:"120.00" },
    { id: "2", description: "Contoh: Pembelian barangan program sukan komuniti", amount: "45.50" },
    { id: "3", description: "", amount: "" }
  ]);
  
  const [receipts, setReceipts] = useState<ReceiptAttachment[]>([]);
  
  const [preparedBy, setPreparedBy] = useState("Veddin");
  const [reviewedBy, setReviewedBy] = useState("");
  const [approvedBy, setApprovedBy] = useState("Dr. Mohamad Rizza");
  
  const [formIsLocked, setFormIsLocked] = useState(false);
  const [formAdminNote, setFormAdminNote] = useState("");

  const [records, setRecords] = useState<ClaimRecord[]>([]);
  const [activeRecordId, setActiveRecordId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [lightboxImage, setLightboxImage] = useState<string | null>(null);
  const [dragActive, setDragActive] = useState(false);
  const [lastSavedTime, setLastSavedTime] = useState<string>("Sesi baru bermula");
  const [showNotification, setShowNotification] = useState<{ message: string; type: "success" | "error" | "info" } | null>(null);
  
  // --- CLOUD DB & ADMIN STATES ---
  const [currentClientId, setCurrentClientId] = useState<string>("");
  const [selectedRecordTab, setSelectedRecordTab] = useState<"personal" | "all" | "users">("personal");
  const [isDbLoading, setIsDbLoading] = useState<boolean>(false);
  const [usersList, setUsersList] = useState<any[]>([]);
  const [isUsersLoading, setIsUsersLoading] = useState<boolean>(false);
  const [isAdminLoggedIn, setIsAdminLoggedIn] = useState<boolean>(() => {
    return localStorage.getItem("sistem_tuntutan_is_admin") === "true";
  });
  const [adminEmail, setAdminEmail] = useState<string>(() => {
    return localStorage.getItem("sistem_tuntutan_admin_email") || "";
  });
  const [adminEmailInput, setAdminEmailInput] = useState<string>("");
  const [printingVoucherRecord, setPrintingVoucherRecord] = useState<ClaimRecord | null>(null);
  const [isPrintActive, setIsPrintActive] = useState<boolean>(false);

  const fileInputRef = useRef<HTMLInputElement>(null);

  // --- PROFILE REGISTRATION IN FIRESTORE ---
  const registerUserInFirestore = async (user: any) => {
    try {
      const userRef = doc(db, "users", user.uid);
      const isEmailAdmin = verifyAdminEmail(user.email || "");
      await setDoc(userRef, {
        uid: user.uid,
        name: user.displayName || user.email?.split("@")[0] || "Tiada Nama",
        email: user.email || "",
        photoURL: user.photoURL || "",
        lastActive: new Date().toISOString(),
        role: isEmailAdmin ? "admin" : (user.isGuest ? "tetamu" : "user")
      }, { merge: true });
    } catch (err) {
      console.error("Gagal mendaftarkan profil pengguna di Firestore:", err);
    }
  };

  const fetchFirestoreUsers = async () => {
    if (!isAdminLoggedIn) return;
    setIsUsersLoading(true);
    try {
      const qSnapshot = await getDocs(collection(db, "users"));
      const list: any[] = [];
      qSnapshot.forEach((doc) => {
        list.push(doc.data());
      });
      // Sort by lastActive desc
      list.sort((a, b) => new Date(b.lastActive || 0).getTime() - new Date(a.lastActive || 0).getTime());
      setUsersList(list);
    } catch (error) {
      console.error("Gagal mendapatkan senarai pengguna dari Firestore:", error);
      triggerNotification("Gagal mendapatkan senarai pengguna dari Firestore.", "error");
    } finally {
      setIsUsersLoading(false);
    }
  };

  useEffect(() => {
    if (isAdminLoggedIn && selectedRecordTab === "users") {
      fetchFirestoreUsers();
    }
  }, [isAdminLoggedIn, selectedRecordTab]);

  // --- AUTH STATES & HANDLERS ---
  const [currentUser, setCurrentUser] = useState<any | null>(null);
  const [authLoading, setAuthLoading] = useState<boolean>(true);
  const [authModalMode, setAuthModalMode] = useState<"login" | "register">("login");
  const [authEmail, setAuthEmail] = useState<string>("");
  const [authPassword, setAuthPassword] = useState<string>("");
  const [authName, setAuthName] = useState<string>("");
  const [authError, setAuthError] = useState<string>("");

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      if (user) {
        setCurrentUser(user);
        setAuthLoading(false);
        // Register or update user profile details in Firestore
        registerUserInFirestore(user);

        const isAdmin = verifyAdminEmail(user.email || "");
        setIsAdminLoggedIn(isAdmin);
        if (isAdmin) {
          setAdminEmail(user.email || "");
          localStorage.setItem("sistem_tuntutan_is_admin", "true");
          localStorage.setItem("sistem_tuntutan_admin_email", user.email || "");
          setSelectedRecordTab("all");
        } else {
          setIsAdminLoggedIn(false);
          setAdminEmail("");
          localStorage.removeItem("sistem_tuntutan_is_admin");
          localStorage.removeItem("sistem_tuntutan_admin_email");
          setSelectedRecordTab("personal");
        }
        
        // Auto pre-fill claimant name if not yet filled
        setClaimantName(prev => prev || user.displayName || user.email?.split("@")[0] || "");
        setPreparedBy(prev => prev || user.displayName || user.email?.split("@")[0] || "Veddin");
      } else {
        // If no authenticated Firebase user, check if there is a guest session
        const savedGuest = localStorage.getItem("sistem_tuntutan_guest_user");
        if (savedGuest) {
          try {
            const guest = JSON.parse(savedGuest);
            setCurrentUser(guest);
            setClaimantName(prev => prev || guest.displayName || "");
            setPreparedBy(prev => prev || guest.displayName || "Veddin");
          } catch (e) {
            console.error("Ralat parsing guest session:", e);
            setCurrentUser(null);
          }
        } else {
          setCurrentUser(null);
        }
        setAuthLoading(false);

        const isLocalAdmin = localStorage.getItem("sistem_tuntutan_is_admin") === "true";
        if (!isLocalAdmin) {
          setIsAdminLoggedIn(false);
          setAdminEmail("");
          localStorage.removeItem("sistem_tuntutan_is_admin");
          localStorage.removeItem("sistem_tuntutan_admin_email");
          setSelectedRecordTab("personal");
        }
      }
    });
    return () => unsubscribe();
  }, []);

  const handleGoogleSignIn = async () => {
    setAuthError("");
    setAuthLoading(true);
    try {
      const result = await signInWithPopup(auth, googleProvider);
      triggerNotification(`Selamat datang, ${result.user.displayName || "Pengguna"}!`, "success");
    } catch (err: any) {
      console.error("Ralat log masuk Google:", err);
      let errorMsg = "Gagal log masuk dengan Google.";
      if (err.code === "auth/popup-blocked") {
        errorMsg = "Popup disekat oleh pelayar anda. Sila benarkan popup untuk laman ini.";
      } else if (err.code === "auth/cancelled-popup-request") {
        errorMsg = "Log masuk Google dibatalkan.";
      } else if (err.code === "auth/unauthorized-domain" || (err.message && err.message.includes("unauthorized-domain"))) {
        errorMsg = `Ralat: Domain ini (${window.location.hostname}) tidak dibenarkan oleh Firebase. Sila tambah domain ini ke 'Authorized domains' di: Firebase Console > Authentication > Settings > Authorized domains.`;
      } else if (err.code === "auth/operation-not-allowed" || (err.message && err.message.includes("operation-not-allowed"))) {
        errorMsg = "Ralat: Kaedah Google Sign-In belum diaktifkan dalam Konsol Firebase anda. Sila aktifkan 'Google' di: Firebase Console > Authentication > Sign-in method.";
      } else if (err.message) {
        errorMsg = `Ralat Google: ${err.message}`;
      }
      setAuthError(errorMsg);
      triggerNotification(errorMsg, "error");
    } finally {
      setAuthLoading(false);
    }
  };

  const handleGuestSignIn = async () => {
    setAuthError("");
    setAuthLoading(true);
    try {
      const guestName = authName.trim() || "Pengguna Tetamu";
      
      // Get or generate client id
      let localClientId = localStorage.getItem("sistem_tuntutan_client_id");
      if (!localClientId) {
        localClientId = `client-${Math.random().toString(36).substring(2, 11)}`;
        localStorage.setItem("sistem_tuntutan_client_id", localClientId);
      }
      
      const guestUser = {
        uid: localClientId,
        displayName: guestName,
        email: `${guestName.toLowerCase().replace(/\s+/g, "") || "tetamu"}@tetamu.local`,
        photoURL: "",
        isGuest: true
      };
      
      localStorage.setItem("sistem_tuntutan_guest_user", JSON.stringify(guestUser));
      setCurrentUser(guestUser);
      setClaimantName(guestName);
      setPreparedBy(guestName);
      
      // Register guest profile in Firestore so administrators can keep track of active sessions
      await registerUserInFirestore(guestUser);
      
      triggerNotification(`Berjaya masuk sebagai Tetamu: ${guestName}!`, "success");
    } catch (err: any) {
      console.error("Ralat log masuk Tetamu:", err);
      triggerNotification("Gagal memulakan Mod Tetamu.", "error");
    } finally {
      setAuthLoading(false);
    }
  };

  const handleEmailPasswordAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError("");
    setAuthLoading(true);

    const email = authEmail.trim();
    const password = authPassword;

    if (!email || !password) {
      setAuthError("Sila isi e-mel dan kata laluan.");
      setAuthLoading(false);
      return;
    }

    try {
      if (authModalMode === "login") {
        // Sign In
        const result = await signInWithEmailAndPassword(auth, email, password);
        triggerNotification(`Log masuk berjaya! Selamat kembali, ${result.user.displayName || result.user.email}!`, "success");
      } else {
        // Register
        if (!authName.trim()) {
          setAuthError("Sila isi nama penuh anda.");
          setAuthLoading(false);
          return;
        }
        const result = await createUserWithEmailAndPassword(auth, email, password);
        
        // Update display name
        await updateProfile(result.user, {
          displayName: authName.trim()
        });

        // Force a reload of the current user profile from the server to guarantee display name is populated
        try {
          await result.user.reload();
        } catch (reloadErr) {
          console.warn("Gagal reload profil user, meneruskan proses:", reloadErr);
        }

        // Get the fresh user reference
        const freshUser = auth.currentUser || result.user;
        setCurrentUser(freshUser);

        // Explicitly register in Firestore now that we have the proper display name
        await registerUserInFirestore(freshUser);
        
        // Update claimant names states
        setClaimantName(authName.trim());
        setPreparedBy(authName.trim());

        triggerNotification("Akaun berjaya didaftarkan! Selamat datang.", "success");
      }
      
      // Clear inputs
      setAuthEmail("");
      setAuthPassword("");
      setAuthName("");
    } catch (err: any) {
      console.error("Ralat pengesahan:", err);
      let errorMsg = "Gagal melakukan proses pengesahan.";
      if (err.code === "auth/invalid-credential" || err.code === "auth/user-not-found" || err.code === "auth/wrong-password") {
        errorMsg = "E-mel atau kata laluan tidak sah.";
      } else if (err.code === "auth/email-already-in-use") {
        errorMsg = "E-mel ini sudah pun didaftarkan.";
      } else if (err.code === "auth/weak-password") {
        errorMsg = "Kata laluan mestilah sekurang-kurangnya 6 aksara.";
      } else if (err.code === "auth/invalid-email") {
        errorMsg = "Format e-mel tidak sah.";
      } else if (err.code === "auth/operation-not-allowed") {
        errorMsg = "Ralat: Kaedah Daftar E-mel/Kata Laluan belum diaktifkan dalam Konsol Firebase Auth anda. Sila aktifkan 'Email/Password' di: Firebase Console > Authentication > Sign-in method.";
      } else {
        errorMsg = `Gagal melakukan pengesahan: ${err.message || err.code || err}`;
      }
      setAuthError(errorMsg);
      triggerNotification(errorMsg, "error");
    } finally {
      setAuthLoading(false);
    }
  };

  const handleLogOut = async () => {
    try {
      localStorage.removeItem("sistem_tuntutan_guest_user");
      setCurrentUser(null);
      await signOut(auth);
      triggerNotification("Anda telah log keluar dengan selamat.", "info");
      handleResetForm(false);
    } catch (err) {
      console.error("Ralat log keluar:", err);
      triggerNotification("Gagal log keluar.", "error");
    }
  };

  // --- INITIALIZATION ---
  useEffect(() => {
    // Set default date
    const today = new Date();
    const formattedDate = today.toISOString().split("T")[0];
    setPvDate(formattedDate);
    
    // Generate initial PV number
    generateNewPV();

    // Set up unique Client ID for personal filtering
    let localClientId = localStorage.getItem("sistem_tuntutan_client_id");
    if (!localClientId) {
      localClientId = `client-${Math.random().toString(36).substring(2, 11)}`;
      localStorage.setItem("sistem_tuntutan_client_id", localClientId);
    }
    setCurrentClientId(localClientId);

    // Default tab based on admin status
    const isAlreadyAdmin = localStorage.getItem("sistem_tuntutan_is_admin") === "true";
    setSelectedRecordTab(isAlreadyAdmin ? "all" : "personal");
    
    // Load existing records from Firestore as first choice, falling back to local
    fetchFirestoreRecords();
  }, []);

  // Print effect for beautiful payment voucher
  useEffect(() => {
    if (isPrintActive && printingVoucherRecord) {
      const timer = setTimeout(() => {
        try {
          window.focus();
          window.print();
        } catch (e) {
          console.error("Gagal cetak:", e);
        } finally {
          setIsPrintActive(false);
        }
      }, 800);
      return () => clearTimeout(timer);
    }
  }, [isPrintActive, printingVoucherRecord]);

  const generateNewPV = () => {
    const rand = Math.floor(100000 + Math.random() * 900000);
    setPvNumber(`TP-${rand}`);
  };

  const fetchFirestoreRecords = async () => {
    setIsDbLoading(true);
    try {
      const q = query(collection(db, "claims"), orderBy("createdAt", "desc"));
      const querySnapshot = await getDocs(q);
      const fetched: ClaimRecord[] = [];
      querySnapshot.forEach((doc) => {
        const data = doc.data() as ClaimRecord;
        fetched.push(data);
      });
      setRecords(fetched);
      if (fetched.length > 0) {
        // Find the latest saved date
        const latestDate = new Date(fetched[0].createdAt);
        setLastSavedTime(latestDate.toLocaleString("ms-MY"));
      }
    } catch (e) {
      console.error("Gagal memuat naik rekod daripada Firestore:", e);
      triggerNotification("Gagal memuat naik rekod awan. Membaca fail tempatan...", "error");
      loadRecordsFromStorage();
      try {
        handleFirestoreError(e, OperationType.LIST, "claims");
      } catch (err) {
        // Log to console but continue fallback gracefully
      }
    } finally {
      setIsDbLoading(false);
    }
  };

  const verifyAdminEmail = (email: string): boolean => {
    const cleanEmail = email.trim().toLowerCase();
    if (!cleanEmail) return false;
    // Authorized emails
    if (cleanEmail === "budakampung7@gmail.com") return true;
    if (cleanEmail.includes("admin")) return true;
    if (cleanEmail.endsWith("@ikram.org.my") || cleanEmail.endsWith("@ikram.org")) return true;
    return false;
  };

  const handleAdminLogin = (e: React.FormEvent) => {
    e.preventDefault();
    if (verifyAdminEmail(adminEmailInput)) {
      setIsAdminLoggedIn(true);
      setAdminEmail(adminEmailInput.trim().toLowerCase());
      localStorage.setItem("sistem_tuntutan_is_admin", "true");
      localStorage.setItem("sistem_tuntutan_admin_email", adminEmailInput.trim().toLowerCase());
      setSelectedRecordTab("all");
      triggerNotification("Log masuk admin berjaya!", "success");
      setAdminEmailInput("");
    } else {
      triggerNotification("E-mel tidak sah atau tiada kebenaran Admin.", "error");
    }
  };

  const handleAdminLogout = () => {
    setIsAdminLoggedIn(false);
    setAdminEmail("");
    localStorage.removeItem("sistem_tuntutan_is_admin");
    localStorage.removeItem("sistem_tuntutan_admin_email");
    setSelectedRecordTab("personal");
    handleResetForm(false);
    triggerNotification("Log keluar dari Mod Admin.", "info");
  };

  const loadRecordsFromStorage = () => {
    try {
      const stored = localStorage.getItem("sistem_tuntutan_records");
      if (stored) {
        const parsed: ClaimRecord[] = JSON.parse(stored);
        setRecords(parsed);
        if (parsed.length > 0) {
          const latestDate = new Date(parsed[0].createdAt);
          setLastSavedTime(latestDate.toLocaleString("ms-MY"));
        }
      }
    } catch (e) {
      triggerNotification("Gagal memuat naik rekod daripada memori tempatan", "error");
    }
  };

  const triggerNotification = (message: string, type: "success" | "error" | "info" = "success") => {
    setShowNotification({ message, type });
    setTimeout(() => {
      setShowNotification(null);
    }, 3500);
  };

  const handleToggleLock = async () => {
    const newLockState = !formIsLocked;
    
    // Set default note if locking and note is empty
    let finalNote = formAdminNote;
    if (newLockState && !finalNote.trim()) {
      finalNote = "Permohonan telah diluluskan dan dalam proses bayaran.";
      setFormAdminNote(finalNote);
    }
    
    setFormIsLocked(newLockState);

    if (activeRecordId) {
      setIsDbLoading(true);
      try {
        const docRef = doc(db, "claims", activeRecordId);
        
        // Check if we have the full record in local state list
        const localRecord = records.find(r => r.id === activeRecordId);
        if (localRecord) {
          // If we have local record, setDoc with merge: true restores it fully if missing, or updates it safely
          await setDoc(docRef, {
            ...localRecord,
            isLocked: newLockState,
            adminNote: finalNote
          }, { merge: true });
        } else {
          // Fallback to updateDoc if not found in records state
          await updateDoc(docRef, {
            isLocked: newLockState,
            adminNote: finalNote
          });
        }
        
        triggerNotification(
          newLockState 
            ? "Rekod berjaya DIKUNCI di awan! Pemohon tidak boleh mengubah data." 
            : "Rekod berjaya DIBUKA KUNCI di awan! Pemohon boleh mengedit semula.",
          "success"
        );
        
        await fetchFirestoreRecords();
      } catch (error) {
        console.error("Gagal mengemaskini status kunci di Firestore:", error);
        triggerNotification("Gagal mengemaskini status kunci di awan.", "error");
      } finally {
        setIsDbLoading(false);
      }
    } else {
      triggerNotification(
        newLockState 
          ? "Status kunci diaktifkan secara tempatan. Klik SIMPAN untuk rekod baru." 
          : "Status kunci dinyahaktifkan secara tempatan.",
        "info"
      );
    }
  };

  const handleUpdateAdminNoteOnly = async () => {
    if (!activeRecordId) return;
    
    setIsDbLoading(true);
    try {
      const docRef = doc(db, "claims", activeRecordId);
      const localRecord = records.find(r => r.id === activeRecordId);
      
      if (localRecord) {
        await setDoc(docRef, {
          ...localRecord,
          adminNote: formAdminNote
        }, { merge: true });
      } else {
        await updateDoc(docRef, {
          adminNote: formAdminNote
        });
      }
      
      triggerNotification("Nota admin berjaya dikemaskini di awan!", "success");
      await fetchFirestoreRecords();
    } catch (error) {
      console.error("Gagal mengemaskini nota admin di Firestore:", error);
      triggerNotification("Gagal mengemaskini nota di awan.", "error");
    } finally {
      setIsDbLoading(false);
    }
  };

  // --- FORM OPERATIONS ---
  const handleResetForm = (confirmAction = true) => {
    if (confirmAction && !window.confirm("Kosongkan borang? Sebarang data yang belum disimpan akan hilang.")) {
      return;
    }
    
    // Clear claimant
    setClaimantName("");
    setClaimantPosition("");
    setBankName("");
    setBankAccount("");
    setPurpose("");
    
    // Reset items
    setItems([
      { id: "1", description: "", amount: "" },
      { id: "2", description: "", amount: "" },
      { id: "3", description: "", amount: "" }
    ]);
    
    // Reset receipts
    setReceipts([]);
    
    // Reset signatures
    setPreparedBy("");
    setReviewedBy("");
    setApprovedBy("");
    
    setFormIsLocked(false);
    setFormAdminNote("");
    
    // Generate new PV metadata
    generateNewPV();
    const today = new Date();
    setPvDate(today.toISOString().split("T")[0]);
    
    setActiveRecordId(null);
    triggerNotification("Borang telah dikosongkan dan sedia digunakan", "info");
  };

  const handleAddRow = () => {
    if (isReadOnly) return;
    const newId = Math.random().toString(36).substring(2, 9);
    setItems([...items, { id: newId, description: "", amount: "" }]);
  };

  const handleDeleteRow = (id: string) => {
    if (isReadOnly) return;
    if (items.length <= 1) {
      triggerNotification("Perlu ada sekurang-kurangnya satu baris tuntutan", "info");
      return;
    }
    setItems(items.filter(item => item.id !== id));
  };

  const handleUpdateItem = (id: string, field: keyof ExpenseItem, value: string) => {
    if (isReadOnly) return;
    let finalValue = value;
    if (field === "amount") {
      // Allow only numbers and a single decimal point
      finalValue = value.replace(/[^0-9.]/g, "");
      const parts = finalValue.split(".");
      if (parts.length > 2) {
        finalValue = parts[0] + "." + parts.slice(1).join("");
      }
    }
    setItems(items.map(item => {
      if (item.id === id) {
        return { ...item, [field]: finalValue };
      }
      return item;
    }));
  };

  const handleAmountBlur = (id: string) => {
    if (isReadOnly) return;
    setItems(items.map(item => {
      if (item.id === id) {
        const parsed = parseFloat(item.amount);
        if (!isNaN(parsed)) {
          return { ...item, amount: parsed.toFixed(2) };
        }
      }
      return item;
    }));
  };

  const calcTotalAmount = (): number => {
    return items.reduce((sum, item) => {
      const parsed = parseFloat(item.amount);
      return sum + (isNaN(parsed) ? 0 : parsed);
    }, 0);
  };

  // --- FILE ATTACHMENTS (DRAG & DROP / SELECT) ---
  const handleDrag = (e: DragEvent<HTMLDivElement>) => {
    if (isReadOnly) return;
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  };

  const processFiles = (files: FileList) => {
    if (isReadOnly) return;
    const validImageFiles = Array.from(files).filter(file => file.type.startsWith("image/"));
    
    if (validImageFiles.length === 0) {
      triggerNotification("Sila muat naik fail imej resit sahaja (PNG, JPG, JPEG)", "error");
      return;
    }

    triggerNotification(`Sedang memproses & mampatkan ${validImageFiles.length} resit...`, "info");

    validImageFiles.forEach(file => {
      const reader = new FileReader();
      reader.onload = (e) => {
        if (e.target?.result) {
          const rawData = e.target.result as string;
          // Compressing to max 800px width/height and 0.5 quality produces highly legible images under 60KB
          compressImage(rawData, 800, 800, 0.5)
            .then(compressedData => {
              const newAttachment: ReceiptAttachment = {
                id: Math.random().toString(36).substring(2, 9) + Date.now(),
                name: file.name,
                data: compressedData
              };
              setReceipts(prev => [...prev, newAttachment]);
              triggerNotification(`Berjaya mampat & menambah: ${file.name}`, "success");
            })
            .catch((err) => {
              console.error("Mampatan gagal, guna fail asal:", err);
              const newAttachment: ReceiptAttachment = {
                id: Math.random().toString(36).substring(2, 9) + Date.now(),
                name: file.name,
                data: rawData
              };
              setReceipts(prev => [...prev, newAttachment]);
              triggerNotification(`Berjaya menambah: ${file.name}`, "success");
            });
        }
      };
      reader.onerror = () => {
        triggerNotification(`Gagal membaca fail ${file.name}`, "error");
      };
      reader.readAsDataURL(file);
    });
  };

  const handleDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      processFiles(e.dataTransfer.files);
    }
  };

  const handleFileChange = (e: ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      processFiles(e.target.files);
    }
  };

  const handleRemoveReceipt = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (isReadOnly) return;
    setReceipts(receipts.filter(r => r.id !== id));
    triggerNotification("Resit berjaya dibuang", "info");
  };

  // --- PERSISTENCE ---
  const handleSaveRecord = async () => {
    // Prevent saving if form is locked and user is not admin
    if (isReadOnly) {
      triggerNotification("Ralat: Rekod ini telah dikunci oleh Admin dan tidak boleh diubah suai.", "error");
      return;
    }

    // Find if we are editing an existing record to preserve its original clientId if it exists
    const existingRec = records.find(r => r.id === activeRecordId);
    if (existingRec?.isLocked && !isAdminLoggedIn) {
      triggerNotification("Ralat: Rekod ini telah dikunci oleh Admin dan tidak boleh diubah suai.", "error");
      return;
    }

    if (!claimantName.trim()) {
      triggerNotification("Ralat: Nama Pemohon (Nama Penuh) adalah mandatori dan wajib diisi.", "error");
      return;
    }
    if (!bankName.trim()) {
      triggerNotification("Ralat: Nama Bank adalah mandatori dan wajib diisi.", "error");
      return;
    }
    if (!bankAccount.trim()) {
      triggerNotification("Ralat: No. Akaun Bank adalah mandatori dan wajib diisi.", "error");
      return;
    }
    // Verify bank account contains only numbers
    if (!/^\d+$/.test(bankAccount.trim())) {
      triggerNotification("Ralat: No. Akaun Bank mestilah mengandungi nombor sahaja.", "error");
      return;
    }
    if (!purpose.trim()) {
      triggerNotification("Ralat: Tujuan / Perkara Tuntutan adalah mandatori dan wajib diisi.", "error");
      return;
    }
    if (!claimantPosition.trim()) {
      triggerNotification("Ralat: Jawatan Pemohon adalah mandatori dan wajib diisi.", "error");
      return;
    }
    if (!pvNumber.trim()) {
      triggerNotification("Ralat: Sila pastikan No. Tuntutan/PV tidak kosong.", "error");
      return;
    }

    // Validate Bill 1 (First Row)
    const firstItem = items[0];
    if (!firstItem || !firstItem.description.trim()) {
      triggerNotification("Ralat: Butiran Perbelanjaan Bil 1 adalah mandatori dan wajib diisi.", "error");
      return;
    }
    const firstAmountVal = parseFloat(firstItem.amount);
    if (!firstItem.amount.trim() || isNaN(firstAmountVal) || firstAmountVal <= 0) {
      triggerNotification("Ralat: Sila isi Amaun (RM) yang sah dan bernilai lebih dari 0 untuk Bil 1.", "error");
      return;
    }

    // Filter items to save
    const nonCanceledItems = items.filter(item => item.description.trim() !== "" || item.amount.trim() !== "");

    // Validate any other non-empty rows for both description and valid amount
    for (let i = 0; i < nonCanceledItems.length; i++) {
      const item = nonCanceledItems[i];
      if (!item.description.trim()) {
        triggerNotification(`Ralat: Sila isi Butiran Perbelanjaan untuk baris ke-${i + 1}.`, "error");
        return;
      }
      const val = parseFloat(item.amount);
      if (!item.amount.trim() || isNaN(val) || val <= 0) {
        triggerNotification(`Ralat: Sila isi Amaun (RM) nombor yang sah dan lebih dari 0 untuk baris ke-${i + 1}.`, "error");
        return;
      }
    }

    setIsDbLoading(true);
    const total = calcTotalAmount();
    const rightNow = new Date().toISOString();
    
    const recordClientId = existingRec?.clientId || currentUser?.uid || currentUser?.email || currentClientId || "unknown";

    const recordToSave: ClaimRecord = {
      id: activeRecordId || Math.random().toString(36).substring(2, 9) + Date.now(),
      pvNumber,
      date: pvDate,
      claimantName,
      claimantPosition,
      bankName,
      bankAccount,
      purpose,
      items: nonCanceledItems,
      receipts,
      preparedBy,
      reviewedBy,
      approvedBy,
      totalAmount: total,
      organizationName: orgName,
      organizationSub: "",
      createdAt: rightNow,
      clientId: recordClientId,
      isLocked: formIsLocked,
      adminNote: formAdminNote
    };

    try {
      // Save directly to Firestore cloud database
      await setDoc(doc(db, "claims", recordToSave.id), recordToSave);
      
      triggerNotification(
        activeRecordId 
          ? "Berjaya disimpan! Rekod telah dikemaskini di Pangkalan Data Awan (Firestore)." 
          : "Berjaya disimpan! Rekod baru telah didaftarkan ke Pangkalan Data Awan (Firestore).", 
        "success"
      );

      // Save to local cache as fallback
      const localStored = localStorage.getItem("sistem_tuntutan_records");
      let localRecords: ClaimRecord[] = [];
      if (localStored) {
        try {
          localRecords = JSON.parse(localStored);
        } catch (_) {}
      }
      const updatedLocal = activeRecordId 
        ? localRecords.map(r => r.id === activeRecordId ? recordToSave : r)
        : [recordToSave, ...localRecords];
      localStorage.setItem("sistem_tuntutan_records", JSON.stringify(updatedLocal));

      setActiveRecordId(recordToSave.id);
      
      // Refresh state from Firestore
      await fetchFirestoreRecords();
    } catch (error) {
      console.error("Gagal menyimpan ke Firestore:", error);
      triggerNotification("Gagal menyimpan ke Awan. Disimpan secara Tempatan sahaja.", "error");

      // Local state fallback
      let updatedRecords: ClaimRecord[] = [];
      if (activeRecordId) {
        updatedRecords = records.map(r => r.id === activeRecordId ? recordToSave : r);
      } else {
        updatedRecords = [recordToSave, ...records];
        setActiveRecordId(recordToSave.id);
      }
      setRecords(updatedRecords);
      localStorage.setItem("sistem_tuntutan_records", JSON.stringify(updatedRecords));
      setLastSavedTime(new Date(rightNow).toLocaleString("ms-MY"));
      try {
        handleFirestoreError(error, OperationType.WRITE, `claims/${recordToSave.id}`);
      } catch (err) {
        // Keep running in offline / fallback mode
      }
    } finally {
      setIsDbLoading(false);
    }
  };

  const handleLoadRecord = (record: ClaimRecord) => {
    setActiveRecordId(record.id);
    setOrgName(record.organizationName || "Pertubuhan IKRAM Malaysia (IKRAM)");
    setPvNumber(record.pvNumber);
    setPvDate(record.date);
    setClaimantName(record.claimantName);
    setClaimantPosition(record.claimantPosition);
    setBankName(record.bankName);
    setBankAccount(record.bankAccount);
    setPurpose(record.purpose);
    setPreparedBy(record.preparedBy || "");
    setReviewedBy(record.reviewedBy || "");
    setApprovedBy(record.approvedBy || "");
    setFormIsLocked(record.isLocked || false);
    setFormAdminNote(record.adminNote || "");
    
    // Ensure we always have at least 3 rows for editing comfort
    let loadedItems = [...record.items];
    while (loadedItems.length < 3) {
      loadedItems.push({ id: Math.random().toString(36).substring(2, 9), description: "", amount: "" });
    }
    setItems(loadedItems);
    setReceipts(record.receipts || []);

    // Scroll back to top smoothly to allow viewing
    window.scrollTo({ top: 0, behavior: "smooth" });
    triggerNotification(`Berjaya membuka No. PV: ${record.pvNumber}`, "success");
  };

  const handleDeleteRecord = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    
    // Check if the record is locked
    const targetRecord = records.find(r => r.id === id);
    if (targetRecord?.isLocked && !isAdminLoggedIn) {
      triggerNotification("Ralat: Rekod ini telah dikunci oleh Admin dan tidak boleh dipadam.", "error");
      return;
    }

    if (!window.confirm("Adakah anda pasti untuk memadam rekod ini secara kekal dari Firestore?")) {
      return;
    }
    
    setIsDbLoading(true);
    try {
      // Delete from Firestore
      await deleteDoc(doc(db, "claims", id));
      triggerNotification("Rekod berjaya dipadam daripada Pangkalan Data Awan (Firestore)", "info");

      // Update local storage cache
      const localStored = localStorage.getItem("sistem_tuntutan_records");
      if (localStored) {
        try {
          const localRecords: ClaimRecord[] = JSON.parse(localStored);
          const updatedLocal = localRecords.filter(r => r.id !== id);
          localStorage.setItem("sistem_tuntutan_records", JSON.stringify(updatedLocal));
        } catch (_) {}
      }

      // Refresh records
      await fetchFirestoreRecords();

      if (activeRecordId === id) {
        handleResetForm(false);
      }
    } catch (error) {
      console.error("Gagal memadam dari Firestore:", error);
      triggerNotification("Gagal memadam dari Awan. Memadam secara Tempatan sahaja.", "error");

      const updated = records.filter(r => r.id !== id);
      setRecords(updated);
      localStorage.setItem("sistem_tuntutan_records", JSON.stringify(updated));
      
      if (activeRecordId === id) {
        handleResetForm(false);
      }
      try {
        handleFirestoreError(error, OperationType.DELETE, `claims/${id}`);
      } catch (err) {
        // Keep running in offline / fallback mode
      }
    } finally {
      setIsDbLoading(false);
    }
  };

  // --- APPROVE VOUCHER (ADMIN ONLY) ---
  const handleApproveVoucher = async (id: string) => {
    setIsDbLoading(true);
    try {
      // Update in Firestore
      await updateDoc(doc(db, "claims", id), {
        isApproved: true
      });
      triggerNotification("Baucar berjaya diluluskan dan cop rasmi telah dimuatkan!", "success");

      // Update local storage cache
      const localStored = localStorage.getItem("sistem_tuntutan_records");
      if (localStored) {
        try {
          const localRecords: ClaimRecord[] = JSON.parse(localStored);
          const updatedLocal = localRecords.map(r => r.id === id ? { ...r, isApproved: true } : r);
          localStorage.setItem("sistem_tuntutan_records", JSON.stringify(updatedLocal));
        } catch (_) {}
      }

      // Also update printingVoucherRecord in state to reflect the change in the modal instantly
      if (printingVoucherRecord && printingVoucherRecord.id === id) {
        setPrintingVoucherRecord(prev => prev ? { ...prev, isApproved: true } : null);
      }

      // Refresh records list
      await fetchFirestoreRecords();
    } catch (error) {
      console.error("Gagal meluluskan baucar:", error);
      triggerNotification("Gagal meluluskan di Pangkalan Data Awan. Mengemaskini secara Tempatan.", "error");

      // Fallback local update
      const updated = records.map(r => r.id === id ? { ...r, isApproved: true } : r);
      setRecords(updated);
      
      const localStored = localStorage.getItem("sistem_tuntutan_records");
      if (localStored) {
        try {
          const localRecords: ClaimRecord[] = JSON.parse(localStored);
          const updatedLocal = localRecords.map(r => r.id === id ? { ...r, isApproved: true } : r);
          localStorage.setItem("sistem_tuntutan_records", JSON.stringify(updatedLocal));
        } catch (_) {}
      }

      if (printingVoucherRecord && printingVoucherRecord.id === id) {
        setPrintingVoucherRecord(prev => prev ? { ...prev, isApproved: true } : null);
      }
    } finally {
      setIsDbLoading(false);
    }
  };

  // --- CSV EXPORT ---
  const handleExportCSV = () => {
    if (!isAdminLoggedIn) {
      triggerNotification("Ralat: Hanya Admin yang dibenarkan mengeksport data ke CSV.", "error");
      return;
    }

    // Export according to the selected view tab (Personal or All)
    const exportableRecords = records.filter(r => {
      if (selectedRecordTab === "personal") {
        return r.clientId === currentUser?.uid || r.clientId === currentUser?.email || r.clientId === currentClientId;
      }
      return true;
    });

    if (exportableRecords.length === 0) {
      triggerNotification("Tiada rekod disimpan untuk dieksport", "error");
      return;
    }

    // Prepare CSV Content (UTF-8 with BOM to ensure Malay characters & Excel compatibility)
    let csvContent = "\uFEFF";
    csvContent += "No. PV,Tarikh,Nama Pemohon,Jawatan,Bank,No. Akaun,Tujuan/Perkara,Jumlah (RM),Tarikh Simpanan\n";

    exportableRecords.forEach(r => {
      const sanitizedName = r.claimantName.replace(/"/g, '""');
      const sanitizedPosition = r.claimantPosition.replace(/"/g, '""');
      const sanitizedBank = r.bankName.replace(/"/g, '""');
      const sanitizedAcc = r.bankAccount.replace(/"/g, '""');
      const sanitizedPurpose = r.purpose.replace(/"/g, '""');
      const savedDate = new Date(r.createdAt).toLocaleString("ms-MY");

      csvContent += `"${r.pvNumber}","${r.date}","${sanitizedName}","${sanitizedPosition}","${sanitizedBank}","${sanitizedAcc}","${sanitizedPurpose}",${r.totalAmount.toFixed(2)},"${savedDate}"\n`;
    });

    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    const suffix = !isAdminLoggedIn ? "Peribadi" : (selectedRecordTab === "personal" ? "Peribadi" : "Penuh");
    link.setAttribute("download", `Laporan_Rekod_Tuntutan_${suffix}_${new Date().toISOString().split("T")[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    triggerNotification("Laporan CSV berjaya dimuat turun!", "success");
  };

  // --- EXPORT APPROVED VOUCHERS (FOR TREASURER / BENDAHARI) ---
  const handleExportApprovedCSV = () => {
    if (!isAdminLoggedIn) {
      triggerNotification("Ralat: Hanya Admin yang dibenarkan mengeksport data ke CSV.", "error");
      return;
    }

    // Only export records where isApproved is true
    const approvedRecords = records.filter(r => r.isApproved);

    if (approvedRecords.length === 0) {
      triggerNotification("Tiada rekod baucar yang disahkan (Approved) ditemui untuk dieksport.", "error");
      return;
    }

    // Prepare CSV Content (UTF-8 with BOM to ensure Malay characters & Excel compatibility)
    let csvContent = "\uFEFF";
    csvContent += "No. PV,Tarikh Baucar,Nama Pemohon,Jawatan,Nama Bank,No. Akaun Bank,Tujuan/Perkara,Jumlah (RM),Status Kelulusan,Tarikh Disimpan\n";

    approvedRecords.forEach(r => {
      const sanitizedName = r.claimantName.replace(/"/g, '""');
      const sanitizedPosition = (r.claimantPosition || "").replace(/"/g, '""');
      const sanitizedBank = r.bankName.replace(/"/g, '""');
      const sanitizedAcc = r.bankAccount.replace(/"/g, '""');
      const sanitizedPurpose = r.purpose.replace(/"/g, '""');
      const savedDate = new Date(r.createdAt).toLocaleString("ms-MY");

      csvContent += `"${r.pvNumber}","${r.date}","${sanitizedName}","${sanitizedPosition}","${sanitizedBank}","${sanitizedAcc}","${sanitizedPurpose}",${r.totalAmount.toFixed(2)},"DILULUSKAN / APPROVED","${savedDate}"\n`;
    });

    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", `Rekod_Baucar_Diluluskan_Bendahari_${new Date().toISOString().split("T")[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    triggerNotification(`Berjaya mengeksport ${approvedRecords.length} baucar diluluskan untuk rujukan bendahari!`, "success");
  };

  // --- PRINT DOCUMENT ---
  const handlePrint = () => {
    const isInIframe = window.self !== window.top;
    if (isInIframe) {
      triggerNotification(
        "Sila buka aplikasi di Tab Baru (klik ikon 'Open in new tab' di bucu kanan atas skrin preview) untuk membolehkan fungsi Cetak PDF!",
        "info"
      );
    }
    setTimeout(() => {
      try {
        window.focus();
        window.print();
      } catch (e) {
        triggerNotification("Tindakan cetak disekat di dalam iframe. Sila buka di Tab Baru.", "error");
      }
    }, 300);
  };

  // --- FILTERED RECORDS ---
  const filteredRecords = records
    .filter(r => {
      // Force personal filtering if not logged in as Admin, regardless of the tab selection
      if (!isAdminLoggedIn || selectedRecordTab === "personal") {
        if (currentUser) {
          return r.clientId === currentUser.uid || r.clientId === currentUser.email || r.clientId === currentClientId;
        }
        return r.clientId === currentClientId;
      }
      return true; // Show all only if logged in as Admin and selected all tab
    })
    .filter(r => 
      r.pvNumber.toLowerCase().includes(searchQuery.toLowerCase()) ||
      r.claimantName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (r.purpose && r.purpose.toLowerCase().includes(searchQuery.toLowerCase()))
    );

  const total = calcTotalAmount();
  const isReadOnly = formIsLocked && !isAdminLoggedIn;

  if (authLoading) {
    return (
      <div className="w-full min-h-screen bg-slate-950 flex flex-col items-center justify-center text-white font-sans gap-3">
        <RefreshCw className="w-8 h-8 animate-spin text-emerald-400" />
        <span className="text-xs font-bold tracking-wider uppercase text-slate-500">Menyediakan Sistem...</span>
      </div>
    );
  }

  if (!currentUser) {
    return (
      <div className="w-full min-h-screen bg-slate-950 flex items-center justify-center p-4 font-sans relative overflow-hidden">
        {/* Abstract Background Accents */}
        <div className="absolute top-[-20%] left-[-20%] w-[60%] h-[60%] rounded-full bg-emerald-600/10 blur-[120px] pointer-events-none" />
        <div className="absolute bottom-[-20%] right-[-20%] w-[60%] h-[60%] rounded-full bg-blue-600/10 blur-[120px] pointer-events-none" />

        <div className="w-full max-w-md bg-slate-900 border border-slate-800 rounded-xl shadow-2xl p-6 relative z-10 text-white">
          <div className="text-center mb-6">
            <div className="inline-flex items-center justify-center w-12 h-12 rounded-lg bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 font-bold text-2xl mb-3 shadow-inner">
              IK
            </div>
            <h1 className="text-lg font-black uppercase tracking-wider text-slate-100">Sistem Pengurusan Bendahari</h1>
            <p className="text-[11px] text-slate-400 mt-1 uppercase font-semibold tracking-widest text-emerald-400">IKRAM Perak Tengah</p>
          </div>

          {authError && (
            <div className="mb-4 p-3 bg-rose-950/40 border border-rose-900 text-rose-300 rounded text-[11px] font-semibold flex items-start gap-2 animate-shake">
              <AlertCircle className="w-4.5 h-4.5 text-rose-500 shrink-0 mt-0.5" />
              <span>{authError}</span>
            </div>
          )}

          {/* Primary Action: Google Sign In */}
          <div className="space-y-4">
            <div>
              <button
                onClick={handleGoogleSignIn}
                className="w-full bg-white hover:bg-slate-50 text-slate-900 font-extrabold text-xs uppercase tracking-wider py-3 px-4 rounded-lg transition-all cursor-pointer flex items-center justify-center gap-3 shadow-md hover:shadow-lg active:scale-98"
              >
                {/* Custom Google Icon */}
                <svg className="w-4 h-4 shrink-0" viewBox="0 0 24 24" fill="none">
                  <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4" />
                  <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
                  <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l3.66-2.85z" fill="#FBBC05" />
                  <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.85c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
                </svg>
                <span>Log Masuk dengan Google</span>
              </button>
              <p className="text-[10px] text-center text-slate-500 mt-2">
                Pilihan terpantas & selamat untuk pemohon yang memiliki e-mel Gmail peribadi (95% pengguna).
              </p>
            </div>

            {/* Elegant Divider */}
            <div className="flex items-center gap-3 py-1">
              <div className="flex-1 h-px bg-slate-800" />
              <span className="text-[9px] font-black uppercase tracking-widest text-slate-500">atau kaedah e-mel</span>
              <div className="flex-1 h-px bg-slate-800" />
            </div>

            {/* Email & Password traditional form */}
            <form onSubmit={handleEmailPasswordAuth} className="space-y-3">
              {authModalMode === "register" && (
                <div className="space-y-1">
                  <label className="text-[9px] font-bold uppercase tracking-wider text-slate-400 block pl-1">Nama Penuh</label>
                  <div className="relative">
                    <User className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-500" />
                    <input
                      type="text"
                      required
                      placeholder="Masukkan nama penuh anda"
                      value={authName}
                      onChange={(e) => setAuthName(e.target.value)}
                      className="w-full pl-9 pr-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-xs font-medium text-slate-100 outline-none focus:border-emerald-500 focus:bg-slate-950/70 transition-all placeholder:text-slate-600"
                    />
                  </div>
                </div>
              )}

              <div className="space-y-1">
                <label className="text-[9px] font-bold uppercase tracking-wider text-slate-400 block pl-1">Alamat E-mel</label>
                <div className="relative">
                  <input
                    type="email"
                    required
                    placeholder="contoh@mel.com"
                    value={authEmail}
                    onChange={(e) => setAuthEmail(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-xs font-mono text-slate-100 outline-none focus:border-emerald-500 focus:bg-slate-950/70 transition-all placeholder:text-slate-600"
                  />
                </div>
              </div>

              <div className="space-y-1">
                <div className="flex justify-between items-center px-1">
                  <label className="text-[9px] font-bold uppercase tracking-wider text-slate-400 block">Kata Laluan</label>
                </div>
                <div className="relative">
                  <input
                    type="password"
                    required
                    placeholder="••••••••"
                    value={authPassword}
                    onChange={(e) => setAuthPassword(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-xs font-mono text-slate-100 outline-none focus:border-emerald-500 focus:bg-slate-950/70 transition-all placeholder:text-slate-600"
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={authLoading}
                className="w-full bg-emerald-600 hover:bg-emerald-700 disabled:bg-emerald-800 disabled:cursor-not-allowed text-white font-extrabold text-xs uppercase tracking-wider py-2.5 px-4 rounded-lg transition-all cursor-pointer flex items-center justify-center gap-2 shadow-sm active:scale-98 mt-2"
              >
                {authLoading ? (
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                ) : authModalMode === "login" ? (
                  "Log Masuk"
                ) : (
                  "Daftar Akaun Baru"
                )}
              </button>
            </form>

            {/* Toggle Mode */}
            <div className="text-center pt-2">
              <button
                type="button"
                onClick={() => {
                  setAuthModalMode(authModalMode === "login" ? "register" : "login");
                  setAuthError("");
                }}
                className="text-[10px] text-emerald-400 hover:text-emerald-300 font-bold hover:underline transition-all cursor-pointer"
              >
                {authModalMode === "login"
                  ? "Tiada akaun? Daftar Akaun Baru di sini"
                  : "Sudah mendaftar? Log Masuk ke akaun anda"}
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full min-h-screen bg-slate-100 flex flex-col font-sans text-slate-900 print:bg-white print:text-black">
      
      {/* Dynamic Notification Popup */}
      <AnimatePresence>
        {showNotification && (
          <motion.div
            initial={{ opacity: 0, y: -20, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -20, scale: 0.95 }}
            className="fixed top-4 left-1/2 -translate-x-1/2 z-50 flex items-center gap-2.5 px-4 py-2.5 rounded-md shadow-md border text-xs max-w-sm w-[90%] bg-white border-slate-300"
          >
            {showNotification.type === "success" && (
              <div className="flex-shrink-0 w-5 h-5 rounded-full bg-emerald-100 flex items-center justify-center text-emerald-600">
                <Check className="w-3.5 h-3.5" />
              </div>
            )}
            {showNotification.type === "info" && (
              <div className="flex-shrink-0 w-5 h-5 rounded-full bg-blue-100 flex items-center justify-center text-blue-600">
                <FileText className="w-3.5 h-3.5" />
              </div>
            )}
            {showNotification.type === "error" && (
              <div className="flex-shrink-0 w-5 h-5 rounded-full bg-rose-100 flex items-center justify-center text-rose-600">
                <AlertCircle className="w-3.5 h-3.5" />
              </div>
            )}
            <p className="font-semibold text-slate-700 leading-snug">{showNotification.message}</p>
          </motion.div>
        )}
      </AnimatePresence>

      {/* --- Top Navigation Bar --- */}
      <header className="h-auto sm:h-14 bg-slate-900 text-white flex flex-col sm:flex-row items-center justify-between px-4 sm:px-6 py-3 sm:py-0 shrink-0 no-print gap-3 sm:gap-2">
        <div className="flex items-center gap-3 w-full sm:w-auto">
          <div className="w-8 h-8 bg-blue-500 rounded flex items-center justify-center font-black text-lg italic text-white shrink-0 shadow-xs">i</div>
          <div>
            <h1 className="text-xs sm:text-sm font-extrabold uppercase tracking-wider leading-none">Pertubuhan IKRAM Malaysia</h1>
            <p className="text-[9px] sm:text-[10px] text-slate-400 mt-0.5 font-medium flex flex-wrap items-center gap-1.5">
              <span>Sistem Pengurusan Bendahari Pro v2.5</span>
              <span className="inline-block w-1.5 h-1.5 bg-emerald-500 rounded-full animate-pulse"></span>
              <span className="text-emerald-400 text-[8px] sm:text-[9px] font-bold tracking-wider uppercase bg-emerald-950/50 border border-emerald-900/50 px-1 rounded-sm">Cloud Firestore</span>
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2.5 w-full sm:w-auto justify-between sm:justify-end overflow-x-auto scrollbar-none pb-0.5 sm:pb-0">
          <button 
            onClick={() => handleResetForm(true)}
            className="bg-slate-800 hover:bg-slate-700 text-white px-2.5 py-1.5 rounded text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer shrink-0"
          >
            <RefreshCw className="w-3 h-3 text-emerald-400 shrink-0" />
            <span className="hidden sm:inline">Borang Baru</span>
            <span className="sm:hidden">Baru</span>
          </button>
          
          {!isReadOnly && (
            <button 
              onClick={handleSaveRecord}
              className="bg-slate-700 hover:bg-slate-600 text-white px-2.5 py-1.5 rounded text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer shrink-0"
            >
              <Save className="w-3 h-3 text-blue-400 shrink-0" />
              <span>Simpan</span>
            </button>
          )}

          <button 
            onClick={handlePrint}
            className="bg-blue-600 hover:bg-blue-700 text-white px-2.5 py-1.5 rounded text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer shrink-0"
          >
            <Printer className="w-3 h-3 text-white shrink-0" />
            <span className="hidden sm:inline">Cetak PDF</span>
            <span className="sm:hidden">Cetak</span>
          </button>

          {isAdminLoggedIn && activeRecordId && (
            <button 
              onClick={() => {
                const rec = records.find(r => r.id === activeRecordId);
                if (rec) {
                  setPrintingVoucherRecord(rec);
                } else {
                  triggerNotification("Ralat: Tidak dapat menemui rekod aktif.", "error");
                }
              }}
              className="bg-amber-600 hover:bg-amber-700 text-white px-2.5 py-1.5 rounded text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer shrink-0"
              title="Jana Baucar Bayaran rasmi untuk rekod ini"
            >
              <ShieldCheck className="w-3.5 h-3.5 text-white shrink-0" />
              <span className="hidden sm:inline">Jana Baucar</span>
              <span className="sm:hidden">Baucar</span>
            </button>
          )}

          {/* User profile & Log Out */}
          {currentUser && (
            <div className="flex items-center gap-2 border-l border-slate-850 pl-2 sm:pl-3.5 py-1 shrink-0">
              <div className="text-right hidden md:block">
                <span className="text-[10px] font-extrabold text-slate-200 block max-w-[100px] truncate leading-none">
                  {currentUser.displayName || currentUser.email?.split("@")[0]}
                </span>
                <span className="text-[8px] font-bold text-emerald-400 block mt-0.5 truncate max-w-[100px] uppercase tracking-wider">
                  {isAdminLoggedIn ? "Admin" : "Pemohon"}
                </span>
              </div>
              
              {currentUser.photoURL ? (
                <img 
                  src={currentUser.photoURL} 
                  alt="Avatar" 
                  className="w-6 h-6 sm:w-7 sm:h-7 rounded-full border border-slate-700 object-cover shadow-2xs referrerPolicy='no-referrer' shrink-0" 
                  referrerPolicy="no-referrer"
                />
              ) : (
                <div className="w-6 h-6 sm:w-7 sm:h-7 rounded-full bg-emerald-500/20 border border-emerald-500/40 text-emerald-400 flex items-center justify-center font-bold text-[9px] sm:text-[10px] uppercase shadow-2xs shrink-0">
                  {(currentUser.displayName || currentUser.email || "?")[0]}
                </div>
              )}
              
              <button 
                onClick={handleLogOut}
                className="bg-rose-950/80 hover:bg-rose-900 text-rose-200 border border-rose-900/50 px-2 py-1 rounded text-[9px] font-black uppercase tracking-wider transition-colors cursor-pointer shrink-0"
                title="Log keluar dari akaun anda"
              >
                Keluar
              </button>
            </div>
          )}
        </div>
      </header>

      {/* --- Main Section with High Density Split Columns Layout --- */}
      <main className="flex-1 flex flex-col lg:flex-row gap-4 p-4 overflow-y-auto lg:overflow-hidden print:p-0 print:overflow-visible">
        
        {/* Left Column: The Interactive Voucher Form Document */}
        <section className="flex-1 lg:flex-[2.2] bg-white border border-slate-300 shadow-xs flex flex-col rounded-sm overflow-hidden print:border-none print:shadow-none print:overflow-visible">
          
          {/* Form Lock Banner */}
          {(formIsLocked || isAdminLoggedIn) && (
            <div className={`px-5 py-3 border-b flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 ${formIsLocked ? "bg-amber-50 border-amber-200" : "bg-blue-50 border-blue-200"} print:hidden`}>
              <div className="flex items-center gap-2">
                {formIsLocked ? (
                  <Lock className={`w-4 h-4 ${formIsLocked && !isAdminLoggedIn ? "text-amber-600" : "text-amber-500"}`} />
                ) : (
                  <Unlock className="w-4 h-4 text-blue-500" />
                )}
                <div>
                  <h3 className={`text-xs font-bold ${formIsLocked ? "text-amber-800" : "text-blue-800"}`}>
                    {formIsLocked ? "Rekod Telah Dikunci" : "Mod Admin: Boleh Edit & Kunci"}
                  </h3>
                  {!isAdminLoggedIn && formIsLocked && formAdminNote && (
                    <p className="text-[11px] text-amber-700 mt-0.5"><span className="font-semibold">Nota:</span> {formAdminNote}</p>
                  )}
                  {!isAdminLoggedIn && formIsLocked && !formAdminNote && (
                    <p className="text-[11px] text-amber-700 mt-0.5">Permohonan ini telah diluluskan dan dalam proses bayaran.</p>
                  )}
                </div>
              </div>
              
              {isAdminLoggedIn && (
                <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 w-full sm:w-auto">
                  <div className="relative flex-1 min-w-[200px] sm:w-64">
                    <input 
                      type="text"
                      value={formAdminNote}
                      onChange={(e) => setFormAdminNote(e.target.value)}
                      placeholder="Nota (Contoh: Permohonan diluluskan & dalam proses bayaran)"
                      className="w-full text-[10px] px-2 py-1.5 border border-slate-300 bg-white rounded outline-none focus:border-blue-500 text-slate-800"
                    />
                  </div>
                  {formIsLocked && activeRecordId && (
                    <button
                      onClick={handleUpdateAdminNoteOnly}
                      className="shrink-0 px-2.5 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded text-[10px] font-bold uppercase tracking-wider transition-colors cursor-pointer border border-slate-300"
                      title="Kemaskini Nota Sahaja ke Firestore"
                    >
                      Kemaskini Nota
                    </button>
                  )}
                  <button
                    onClick={handleToggleLock}
                    className={`shrink-0 px-3 py-1.5 rounded text-[10px] font-bold uppercase tracking-wider flex items-center justify-center gap-1.5 transition-colors cursor-pointer ${
                      formIsLocked 
                        ? "bg-amber-600 hover:bg-amber-700 text-white shadow-xs" 
                        : "bg-blue-600 hover:bg-blue-700 text-white shadow-xs"
                    }`}
                  >
                    {formIsLocked ? (
                      <>
                        <Unlock className="w-3 h-3" /> Buka Kunci
                      </>
                    ) : (
                      <>
                        <Lock className="w-3 h-3" /> Kunci Rekod
                      </>
                    )}
                  </button>
                </div>
              )}
            </div>
          )}

          {/* Header Area of Document */}
          <div className="p-5 md:p-6 border-b border-slate-200">
            <div className="flex flex-col md:flex-row md:justify-between md:items-start gap-4 mb-6">
              <div>
                <div className="flex items-center gap-2 mb-1 print:hidden">
                  <span className="text-[9px] font-extrabold bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded border border-slate-200 uppercase tracking-widest">Baucar Rasmi</span>
                </div>
                <input
                  type="text"
                  value={orgName}
                  disabled={isReadOnly}
                  onChange={(e) => setOrgName(e.target.value)}
                  className="text-lg md:text-xl font-black text-slate-800 tracking-tight uppercase w-full bg-transparent border-b border-transparent hover:border-slate-300 focus:border-blue-500 outline-none transition-all py-0.5 rounded disabled:opacity-75 disabled:cursor-not-allowed"
                  placeholder="NAMA ORGANISASI UTAMA"
                />
              </div>

              {/* No. Tuntutan / Tarikh Metadata block */}
              <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 bg-slate-50 p-3 border border-slate-200 rounded text-xs font-medium print:bg-white print:p-2 min-w-[200px]">
                <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wider">No. Tuntutan</span>
                <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wider">Tarikh</span>
                
                <input 
                  type="text" 
                  value={pvNumber} 
                  disabled={true}
                  className="text-xs font-mono font-bold text-slate-900 bg-transparent border-b border-transparent outline-none py-0.5 opacity-70 cursor-not-allowed"
                  placeholder="No. Tuntutan"
                />

                <input 
                  type="date" 
                  value={pvDate} 
                  disabled={isReadOnly}
                  onChange={(e) => setPvDate(e.target.value)}
                  className="text-xs font-bold text-slate-900 bg-transparent border-b border-transparent hover:border-slate-300 focus:border-blue-500 outline-none py-0.5 disabled:opacity-75 disabled:cursor-not-allowed"
                />
              </div>
            </div>

            {/* Claimant Details Grid */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-1">
              
              <div className="flex flex-col gap-0.5">
                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Nama Pemohon</label>
                <input 
                  type="text"
                  value={claimantName}
                  disabled={isReadOnly}
                  onChange={(e) => setClaimantName(e.target.value)}
                  className="px-2 py-1.5 bg-slate-50 hover:bg-slate-100/50 focus:bg-white border border-slate-200 rounded text-xs font-semibold text-slate-800 outline-none transition-colors disabled:opacity-75 disabled:cursor-not-allowed"
                  placeholder="Sila isi nama penuh"
                />
              </div>

              <div className="flex flex-col gap-0.5">
                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Nama Bank</label>
                <input 
                  type="text"
                  value={bankName}
                  disabled={isReadOnly}
                  onChange={(e) => setBankName(e.target.value)}
                  className="px-2 py-1.5 bg-slate-50 hover:bg-slate-100/50 focus:bg-white border border-slate-200 rounded text-xs font-semibold text-slate-800 outline-none transition-colors disabled:opacity-75 disabled:cursor-not-allowed"
                  placeholder="Contoh: Maybank Berhad"
                />
              </div>

              <div className="flex flex-col gap-0.5">
                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">No. Akaun Bank</label>
                <input 
                  type="text"
                  value={bankAccount}
                  disabled={isReadOnly}
                  onChange={(e) => setBankAccount(e.target.value.replace(/\D/g, ""))}
                  className="px-2 py-1.5 bg-slate-50 hover:bg-slate-100/50 focus:bg-white border border-slate-200 rounded text-xs font-mono font-semibold text-slate-800 outline-none transition-colors disabled:opacity-75 disabled:cursor-not-allowed"
                  placeholder="Sila isi nombor akaun"
                />
              </div>

              <div className="md:col-span-3 flex flex-col gap-0.5 mt-1.5">
                <div className="flex items-center justify-between">
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Tujuan / Perkara Tuntutan</label>
                  {claimantPosition && (
                    <span className="text-[9px] text-slate-400 font-bold">Jawatan: {claimantPosition}</span>
                  )}
                </div>
                <div className="flex gap-2">
                  <input 
                    type="text"
                    value={purpose}
                    disabled={isReadOnly}
                    onChange={(e) => setPurpose(e.target.value)}
                    className="flex-1 px-2 py-1.5 bg-slate-50 hover:bg-slate-100/50 focus:bg-white border border-slate-200 rounded text-xs font-medium text-slate-800 outline-none transition-colors disabled:opacity-75 disabled:cursor-not-allowed"
                    placeholder="Contoh: Tuntutan perjalanan & penginapan Program Ihya Ramadhan Peringkat Kawasan"
                  />
                  <input
                    type="text"
                    value={claimantPosition}
                    disabled={isReadOnly}
                    onChange={(e) => setClaimantPosition(e.target.value)}
                    className="w-1/4 px-2 py-1.5 bg-slate-50 hover:bg-slate-100/50 focus:bg-white border border-slate-200 rounded text-xs font-medium text-slate-800 outline-none transition-colors print:hidden disabled:opacity-75 disabled:cursor-not-allowed"
                    placeholder="Jawatan pemohon"
                    title="Jawatan Pemohon"
                  />
                </div>
              </div>

            </div>
          </div>

          {/* Line Items Table Container */}
          <div className="flex-1 overflow-y-auto min-h-[220px]">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-slate-100 border-b border-slate-300 font-bold text-slate-600">
                  <th className="w-12 px-4 py-2 font-black text-center text-[10px] tracking-wider uppercase border-r border-slate-200">BIL</th>
                  <th className="px-4 py-2 font-black text-[10px] tracking-wider uppercase">Butiran Perbelanjaan</th>
                  <th className="w-32 px-4 py-2 font-black text-right text-[10px] tracking-wider uppercase border-l border-slate-200">Amaun (RM)</th>
                  {!isReadOnly && <th className="w-12 px-2 py-2 text-center border-l border-slate-200 no-print">PADAM</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {items.map((item, index) => (
                  <tr key={item.id} className="hover:bg-slate-50/50 group transition-colors">
                    <td className="px-4 py-1.5 text-center font-bold text-slate-400 border-r border-slate-200 font-mono">
                      {index + 1}
                    </td>
                    <td className="px-3 py-1">
                      <input 
                        type="text"
                        value={item.description}
                        disabled={isReadOnly}
                        onChange={(e) => handleUpdateItem(item.id, "description", e.target.value)}
                        className="w-full bg-transparent py-1 px-1.5 text-xs text-slate-800 hover:bg-slate-50 focus:bg-white focus:ring-1 focus:ring-slate-300 border border-transparent rounded outline-none transition-all disabled:opacity-75 disabled:cursor-not-allowed"
                        placeholder="Butiran perbelanjaan atau keterangan transaksi..."
                      />
                    </td>
                    <td className="px-3 py-1 text-right border-l border-slate-200 font-mono">
                      <div className="flex items-center justify-end">
                        <span className="text-[10px] text-slate-400 mr-1 select-none font-bold">RM</span>
                        <input 
                          type="text"
                          value={item.amount}
                          disabled={isReadOnly}
                          onChange={(e) => handleUpdateItem(item.id, "amount", e.target.value)}
                          onBlur={() => handleAmountBlur(item.id)}
                          className="w-20 bg-transparent py-1 px-1 text-right text-xs font-bold text-slate-800 hover:bg-slate-50 focus:bg-white focus:ring-1 focus:ring-slate-300 border border-transparent rounded outline-none transition-all font-mono disabled:opacity-75 disabled:cursor-not-allowed"
                          placeholder="0.00"
                        />
                      </div>
                    </td>
                    {!isReadOnly && (
                      <td className="px-2 py-1 text-center border-l border-slate-200 no-print">
                        <button 
                          onClick={() => handleDeleteRow(item.id)}
                          className="p-1 text-slate-400 hover:text-rose-600 rounded transition-colors cursor-pointer"
                          title="Padam baris"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>

            {/* Quick Row Add Action (Inline/Compact) */}
            {!isReadOnly && (
              <div className="p-3 border-t border-slate-100 bg-slate-50/40 flex justify-start no-print">
                <button 
                  onClick={handleAddRow}
                  className="flex items-center gap-1 text-[10px] font-bold text-blue-600 hover:text-blue-800 transition-colors cursor-pointer"
                >
                  <Plus className="w-3 h-3" /> Tambah Baris Baru
                </button>
              </div>
            )}
          </div>

          {/* Summary & Signatures Column Footer */}
          <div className="mt-auto border-t-2 border-slate-900 bg-slate-50 print:bg-white shrink-0">
            <div className="flex justify-between items-center px-6 py-2.5 border-b border-slate-200">
              <span className="text-[10px] font-black uppercase tracking-widest text-slate-500">Jumlah Keseluruhan</span>
              <span className="text-xl font-black text-slate-950 font-mono tracking-tight">
                RM {calcTotalAmount().toFixed(2)}
              </span>
            </div>
            
            <div className="grid grid-cols-3 gap-4 px-5 py-4 border-t border-slate-200">
              <div className="text-center">
                <input 
                  type="text"
                  value={preparedBy}
                  disabled={isReadOnly}
                  onChange={(e) => setPreparedBy(e.target.value)}
                  className="w-full text-center text-xs font-bold text-slate-800 bg-transparent border-b border-dashed border-slate-300 hover:border-slate-500 focus:border-blue-500 focus:bg-white py-1 outline-none transition-all rounded mb-0.5 italic disabled:opacity-75 disabled:cursor-not-allowed"
                  placeholder="Nama Penyedia"
                />
                <span className="text-[9px] font-black text-slate-400 uppercase tracking-wider block mt-0.5">Disediakan Oleh</span>
              </div>
              
              <div className="text-center">
                <input 
                  type="text"
                  value={reviewedBy}
                  disabled={isReadOnly}
                  onChange={(e) => setReviewedBy(e.target.value)}
                  className="w-full text-center text-xs font-bold text-slate-800 bg-transparent border-b border-dashed border-slate-300 hover:border-slate-500 focus:border-blue-500 focus:bg-white py-1 outline-none transition-all rounded mb-0.5 italic disabled:opacity-75 disabled:cursor-not-allowed"
                  placeholder="Ulasan / Tindakan"
                />
                <span className="text-[9px] font-black text-slate-400 uppercase tracking-wider block mt-0.5">Disemak (Bendahari)</span>
              </div>
              
              <div className="text-center">
                <input 
                  type="text"
                  value={approvedBy}
                  disabled={isReadOnly}
                  onChange={(e) => setApprovedBy(e.target.value)}
                  className="w-full text-center text-xs font-bold text-slate-800 bg-transparent border-b border-dashed border-slate-300 hover:border-slate-500 focus:border-blue-500 focus:bg-white py-1 outline-none transition-all rounded mb-0.5 italic disabled:opacity-75 disabled:cursor-not-allowed"
                  placeholder="Ulasan / Tindakan"
                />
                <span className="text-[9px] font-black text-slate-400 uppercase tracking-wider block mt-0.5">Diluluskan (YDP)</span>
              </div>
            </div>
          </div>

          {/* Lampiran Resit untuk Cetakan (Hanya muncul semasa Cetak PDF) */}
          {receipts.length > 0 && (
            <div className="hidden print:block print:break-before-page border-t border-slate-200 pt-6 mt-8">
              <div className="border-b-2 border-slate-800 pb-3 mb-6">
                <h3 className="text-sm font-extrabold text-slate-900 uppercase tracking-wider">
                  LAMPIRAN RESIT RUJUKAN
                </h3>
                <p className="text-[10px] text-slate-500 mt-0.5">
                  Dokumen rujukan lampiran bagi No. Tuntutan / PV: <span className="font-mono font-bold">{pvNumber}</span>
                </p>
              </div>

              <div className="grid grid-cols-1 gap-8">
                {receipts.map((r, i) => (
                  <div key={r.id} className="border border-slate-300 rounded-md p-4 bg-white break-inside-avoid">
                    <div className="flex justify-between items-center pb-2 border-b border-slate-200 mb-4">
                      <span className="text-xs font-bold text-slate-700 uppercase tracking-wide">
                        Resit {i + 1}: {r.name}
                      </span>
                    </div>
                    <div className="flex justify-center bg-slate-50 border border-slate-100 rounded-lg p-3">
                      <img 
                        src={r.data} 
                        alt={r.name} 
                        className="max-h-[480px] w-auto object-contain rounded" 
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </section>

        {/* Right Column: High Density Sidebar Panels (Hidden on Print) */}
        <aside className="flex-1 lg:max-w-xs xl:max-w-sm flex flex-col gap-4 no-print shrink-0">
          
          {/* Panel 1: Stored Records Panel */}
          <div className="bg-white border border-slate-300 shadow-xs p-4 flex-1 flex flex-col overflow-hidden rounded-sm">
            <div className="flex justify-between items-center pb-2 border-b border-slate-100 mb-2">
              <h3 className="text-xs font-black text-slate-700 uppercase tracking-wider flex items-center gap-1.5">
                <Database className="w-3.5 h-3.5 text-blue-500" />
                <span>Pangkalan Data Awan</span>
                {isAdminLoggedIn && (
                  <span className="text-[8px] font-bold text-blue-700 bg-blue-50 border border-blue-200/50 px-1 rounded flex items-center gap-0.5" title={`Log masuk sebagai ${adminEmail}`}>
                    ADMIN
                  </span>
                )}
              </h3>
              
              <div className="flex items-center gap-2">
                <button
                  onClick={fetchFirestoreRecords}
                  disabled={isDbLoading}
                  className="p-1 hover:bg-slate-100 rounded text-slate-500 transition-colors cursor-pointer disabled:opacity-50"
                  title="Segarkan data dari Firestore"
                >
                  <RefreshCw className={`w-3 h-3 ${isDbLoading ? "animate-spin text-blue-500" : ""}`} />
                </button>
                {isAdminLoggedIn && (
                  <button 
                    onClick={handleExportCSV}
                    className="text-[10px] text-blue-600 font-extrabold hover:underline flex items-center gap-1 cursor-pointer"
                    title="Sila eksport semua rekod ke fail Excel (CSV)"
                  >
                    <FileSpreadsheet className="w-3 h-3 text-emerald-600" />
                    Eksport
                  </button>
                )}
              </div>
            </div>

            {/* Segmented Controls (Personal vs All/Admin vs Users/Admin) */}
            <div className={`grid ${isAdminLoggedIn ? "grid-cols-3" : "grid-cols-2"} bg-slate-100 p-0.5 rounded-md text-[10px] font-bold mb-3`}>
              <button
                onClick={() => setSelectedRecordTab("personal")}
                className={`py-1 rounded-sm transition-all cursor-pointer flex flex-col sm:flex-row items-center justify-center gap-1 ${
                  selectedRecordTab === "personal"
                    ? "bg-white text-slate-900 shadow-3xs"
                    : "text-slate-500 hover:text-slate-800"
                }`}
              >
                <User className="w-3 h-3" />
                <span>Tuntutan Saya</span>
              </button>
              
              <button
                onClick={() => setSelectedRecordTab("all")}
                className={`py-1 rounded-sm transition-all cursor-pointer flex flex-col sm:flex-row items-center justify-center gap-1 ${
                  selectedRecordTab === "all"
                    ? "bg-white text-blue-700 shadow-3xs border border-blue-100/50"
                    : "text-slate-500 hover:text-slate-800"
                }`}
              >
                <Users className="w-3 h-3" />
                <span>Semua Rekod</span>
              </button>

              {isAdminLoggedIn && (
                <button
                  onClick={() => setSelectedRecordTab("users")}
                  className={`py-1 rounded-sm transition-all cursor-pointer flex flex-col sm:flex-row items-center justify-center gap-1 ${
                    selectedRecordTab === "users"
                      ? "bg-white text-emerald-700 shadow-3xs border border-emerald-100/50"
                      : "text-slate-500 hover:text-slate-800"
                  }`}
                >
                  <ShieldCheck className="w-3 h-3 text-emerald-500" />
                  <span>Pengguna</span>
                  <span className="bg-emerald-100 text-emerald-700 rounded-full px-1 py-0.2 text-[8px] ml-0.5">
                    {usersList.length}
                  </span>
                </button>
              )}
            </div>

            {isAdminLoggedIn && (
              <div className="flex justify-between items-center text-[9px] bg-blue-50/50 border border-blue-100 rounded px-2 py-1 mb-3 shrink-0">
                <span className="text-slate-500 truncate">Admin: <span className="font-bold text-slate-700">{adminEmail}</span></span>
                <button 
                  onClick={handleAdminLogout} 
                  className="text-rose-600 font-extrabold hover:underline flex items-center gap-0.5 cursor-pointer shrink-0"
                >
                  <Lock className="w-2.5 h-2.5" /> Log Keluar
                </button>
              </div>
            )}

            {(selectedRecordTab === "all" || selectedRecordTab === "users") && !isAdminLoggedIn ? (
              <div className="flex-1 flex flex-col justify-center items-center p-4 text-center">
                <div className="w-10 h-10 bg-amber-50 border border-amber-200 rounded-full flex items-center justify-center text-amber-500 mb-3 animate-pulse">
                  <Lock className="w-5 h-5" />
                </div>
                <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wider mb-4">Mod Admin Dikunci</h4>
                <form onSubmit={handleAdminLogin} className="w-full space-y-2">
                  <div>
                    <input 
                      type="email"
                      required
                      value={adminEmailInput}
                      onChange={(e) => setAdminEmailInput(e.target.value)}
                      className="w-full text-center text-xs font-mono border border-slate-200 focus:border-blue-500 focus:bg-white bg-slate-50 py-1.5 px-3 rounded outline-none transition-all text-slate-800"
                    />
                  </div>
                  <button
                    type="submit"
                    className="w-full bg-blue-600 hover:bg-blue-700 text-white font-extrabold text-[10px] uppercase tracking-wider py-1.5 rounded transition-colors cursor-pointer flex items-center justify-center gap-1 shadow-3xs"
                  >
                    <Unlock className="w-3 h-3" />
                    Buka Kunci Admin
                  </button>
                </form>
              </div>
            ) : selectedRecordTab === "users" ? (
              <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
                <div className="flex justify-between items-center text-[10px] text-slate-500 mb-2 font-bold uppercase tracking-wider shrink-0">
                  <span>Senarai Pengguna ({usersList.length})</span>
                  <button 
                    onClick={fetchFirestoreUsers} 
                    disabled={isUsersLoading}
                    className="text-emerald-600 hover:underline flex items-center gap-1 cursor-pointer disabled:opacity-50"
                  >
                    <RefreshCw className={`w-2.5 h-2.5 ${isUsersLoading ? "animate-spin" : ""}`} /> Segarkan
                  </button>
                </div>
                
                <div className="flex-1 overflow-y-auto space-y-1.5 pr-0.5">
                  {isUsersLoading && usersList.length === 0 ? (
                    <div className="text-center py-6 text-slate-400 text-[10px] flex flex-col items-center gap-2">
                      <RefreshCw className="w-4 h-4 animate-spin text-emerald-500" />
                      <span>Memuatkan senarai pengguna...</span>
                    </div>
                  ) : usersList.length === 0 ? (
                    <div className="text-center py-6 text-slate-400 text-[10px]">
                      Tiada pengguna berdaftar ditemui.
                    </div>
                  ) : (
                    usersList.map((usr) => (
                      <div 
                        key={usr.uid} 
                        className="p-2 bg-slate-50 border border-slate-200 rounded flex items-center justify-between gap-2.5"
                      >
                        <div className="flex items-center gap-2 min-w-0 flex-1">
                          {usr.photoURL ? (
                            <img 
                              src={usr.photoURL} 
                              alt={usr.name} 
                              className="w-7 h-7 rounded-full border border-slate-200 shrink-0" 
                              referrerPolicy="no-referrer"
                            />
                          ) : (
                            <div className="w-7 h-7 rounded-full bg-emerald-50 border border-emerald-200 text-emerald-700 flex items-center justify-center font-bold text-[10px] uppercase shrink-0">
                              {(usr.name || usr.email || "?")[0]}
                            </div>
                          )}
                          <div className="min-w-0 flex-1">
                            <p className="text-[11px] font-bold text-slate-900 truncate leading-tight">
                              {usr.name}
                            </p>
                            <p className="text-[9px] text-slate-500 font-mono truncate leading-none mt-0.5">
                              {usr.email}
                            </p>
                          </div>
                        </div>
                        
                        <div className="text-right shrink-0">
                          <span className={`inline-block text-[8px] font-black uppercase px-1 rounded border leading-normal ${
                            usr.role === "admin" 
                              ? "text-blue-700 bg-blue-50 border-blue-200" 
                              : "text-slate-600 bg-slate-100 border-slate-200"
                          }`}>
                            {usr.role === "admin" ? "Admin" : "Pemohon"}
                          </span>
                          <span className="block text-[8px] text-slate-400 mt-1" title={usr.lastActive}>
                            {usr.lastActive ? new Date(usr.lastActive).toLocaleDateString("ms-MY") : "-"}
                          </span>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            ) : (
              <>
                {/* Micro search input */}
                <div className="relative mb-2 shrink-0">
                  <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
                  <input 
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="w-full pl-8 pr-2.5 py-1 text-[11px] bg-slate-50 border border-slate-200 rounded text-slate-700 outline-none focus:bg-white focus:border-slate-300 transition-colors"
                    placeholder={selectedRecordTab === "personal" ? "Cari permohonan saya..." : "Cari nama pemohon, PV..."}
                  />
                </div>

                {/* Scrollable Mini List */}
                <div className="flex-1 overflow-y-auto space-y-1.5 pr-0.5">
                  {isDbLoading && records.length === 0 ? (
                    <div className="text-center py-6 text-slate-400 text-[10px] flex flex-col items-center gap-2">
                      <RefreshCw className="w-4 h-4 animate-spin text-blue-500" />
                      <span>Memuat naik data dari awan...</span>
                    </div>
                  ) : filteredRecords.length === 0 ? (
                    <div className="text-center py-6 text-slate-400 text-[10px]">
                      {selectedRecordTab === "personal" 
                        ? "Tiada rekod tuntutan peribadi disimpan di awan." 
                        : "Tiada sebarang rekod ditemui di dalam Firestore."}
                    </div>
                  ) : (
                    filteredRecords.map((rec) => (
                      <div 
                        key={rec.id}
                        onClick={() => handleLoadRecord(rec)}
                        className={`p-2 bg-slate-50 border rounded flex justify-between items-center transition-all cursor-pointer hover:bg-slate-100/80 ${
                          activeRecordId === rec.id 
                            ? "border-blue-500 bg-blue-50/20 shadow-2xs" 
                            : "border-slate-200"
                        }`}
                      >
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span className="text-[11px] font-mono font-black text-slate-900 truncate">
                              {rec.pvNumber}
                            </span>
                            {activeRecordId === rec.id && (
                              <span className="text-[8px] font-extrabold text-blue-600 uppercase tracking-widest bg-blue-50 px-1 rounded border border-blue-100">
                                Aktif
                              </span>
                            )}
                            {rec.clientId === currentUser?.uid || rec.clientId === currentUser?.email || rec.clientId === currentClientId ? (
                              <span className="text-[8px] font-bold text-emerald-700 bg-emerald-50 border border-emerald-200/50 px-1 rounded shrink-0">
                                Saya
                              </span>
                            ) : (
                              <span className="text-[8px] font-bold text-amber-700 bg-amber-50 border border-amber-200/50 px-1 rounded flex items-center gap-0.5 shrink-0">
                                <Users className="w-2 h-2" /> Ahli Lain
                              </span>
                            )}
                            {rec.isLocked && (
                              <span className="text-[8px] font-bold text-rose-700 bg-rose-50 border border-rose-200/50 px-1 rounded flex items-center gap-0.5 shrink-0" title="Rekod ini telah dikunci oleh Admin">
                                <Lock className="w-2 h-2" /> Dikunci
                              </span>
                            )}
                          </div>
                          <p className="text-[10px] text-slate-500 truncate mt-0.5">
                            {rec.date} — <span className="font-medium text-slate-700">{rec.claimantName || "Tanpa Nama"}</span>
                          </p>
                          {rec.adminNote && (
                            <div className="mt-1 max-w-full">
                              <span className="inline-flex items-center gap-1 text-[9px] text-amber-700 bg-amber-50 border border-amber-200/40 rounded px-1.5 py-0.5 font-medium leading-none max-w-full truncate" title={rec.adminNote}>
                                <span className="font-extrabold text-amber-800 shrink-0">Nota:</span> 
                                <span className="truncate">{rec.adminNote}</span>
                              </span>
                            </div>
                          )}
                        </div>
                        <div className="text-right pl-2 shrink-0 flex flex-col items-end gap-1">
                          <span className="text-xs font-mono font-black text-slate-900 leading-none">
                            RM {rec.totalAmount.toFixed(2)}
                          </span>
                          <div className="flex items-center justify-end gap-2 mt-0.5">
                            {isAdminLoggedIn && (
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setPrintingVoucherRecord(rec);
                                }}
                                className="text-[9.5px] font-black text-blue-600 hover:text-blue-800 hover:underline transition-colors cursor-pointer"
                                title="Lihat & Cetak Baucar Bayaran"
                              >
                                Baucar
                              </button>
                            )}
                            {!rec.isLocked || isAdminLoggedIn ? (
                              <button
                                onClick={(e) => handleDeleteRecord(rec.id, e)}
                                className="text-[9px] font-extrabold text-slate-400 hover:text-rose-600 transition-colors cursor-pointer"
                                title="Padam rekod secara kekal"
                              >
                                Padam
                              </button>
                            ) : (
                              <span className="text-[9px] font-bold text-slate-400 flex items-center gap-0.5 select-none" title="Dikunci oleh Admin">
                                <Lock className="w-2 h-2" /> Dikunci
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </>
            )}
          </div>

          {/* Panel 2: Receipt Attachments Panel */}
          <div className="bg-white border border-slate-300 shadow-xs p-4 flex-1 flex flex-col overflow-hidden rounded-sm">
            <div className="flex items-center justify-between pb-2 border-b border-slate-100 mb-2">
              <h3 className="text-xs font-black text-slate-700 uppercase tracking-wider">
                📁 Lampiran Resit ({receipts.length})
              </h3>
              
              {!isReadOnly && (
                <label className="text-[10px] text-blue-600 font-extrabold hover:underline cursor-pointer flex items-center gap-1">
                  <Upload className="w-3 h-3" />
                  <span>Muat Naik</span>
                  <input
                    ref={fileInputRef}
                    type="file"
                    multiple
                    accept="image/*"
                    onChange={handleFileChange}
                    className="hidden"
                  />
                </label>
              )}
            </div>

            {/* Grid of uploaded receipts / dropzone area */}
            <div 
              onDragEnter={!isReadOnly ? handleDrag : undefined}
              onDragOver={!isReadOnly ? handleDrag : undefined}
              onDragLeave={!isReadOnly ? handleDrag : undefined}
              onDrop={!isReadOnly ? handleDrop : undefined}
              className={`flex-1 overflow-y-auto p-2 rounded-md transition-all ${
                !isReadOnly ? "border-2 border-dashed" : ""
              } ${
                dragActive 
                  ? "border-emerald-500 bg-emerald-50/30" 
                  : "border-slate-200 bg-slate-50/20 hover:border-slate-300"
              }`}
            >
              {receipts.length === 0 ? (
                <div className="h-full flex flex-col items-center justify-center py-6 text-center select-none">
                  <FileImage className="w-6 h-6 text-slate-300 mb-1" />
                  <p className="text-[10px] text-slate-400 max-w-[150px] leading-snug">
                    {isReadOnly ? "Tiada lampiran resit." : "Seret & lepas imej resit di sini untuk lampiran automatik."}
                  </p>
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-2">
                  
                  {/* Upload box placeholder inside grid */}
                  {!isReadOnly && (
                    <div 
                      onClick={() => fileInputRef.current?.click()}
                      className="aspect-square bg-slate-50 hover:bg-slate-100 border border-dashed border-slate-300 rounded flex flex-col items-center justify-center gap-1 cursor-pointer transition-all"
                    >
                      <span className="text-lg font-bold text-slate-400 leading-none">+</span>
                      <span className="text-[8px] text-slate-500 uppercase font-black tracking-wider">Tambah</span>
                    </div>
                  )}

                  {receipts.map((r) => (
                    <div 
                      key={r.id} 
                      className="aspect-square bg-slate-100 rounded border border-slate-200 relative overflow-hidden group shadow-2xs hover:shadow-xs transition-shadow"
                    >
                      <img 
                        src={r.data} 
                        alt={r.name} 
                        className="w-full h-full object-cover cursor-zoom-in"
                        onClick={() => setLightboxImage(r.data)}
                      />
                      <div className="absolute inset-0 bg-slate-900/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => setLightboxImage(r.data)}
                          className="p-1 bg-white text-slate-800 rounded-full hover:bg-slate-100 transition-colors cursor-pointer"
                        >
                          <Eye className="w-3 h-3" />
                        </button>
                        {!isReadOnly && (
                          <button
                            type="button"
                            onClick={(e) => handleRemoveReceipt(r.id, e)}
                            className="p-1 bg-rose-600 text-white rounded-full hover:bg-rose-500 transition-colors cursor-pointer"
                          >
                            <X className="w-3 h-3" />
                          </button>
                        )}
                      </div>
                      <div className="absolute bottom-1 left-1 right-1 bg-slate-950/80 text-white text-[8px] p-0.5 rounded truncate select-none font-mono">
                        {r.name}
                      </div>
                    </div>
                  ))}

                </div>
              )}
            </div>

          </div>

          {/* Panel 3: Panel Rujukan Bendahari */}
          {isAdminLoggedIn && (
            <div className="bg-gradient-to-br from-emerald-50/50 to-teal-50/20 border border-emerald-300 shadow-xs p-4 rounded-sm flex flex-col shrink-0 gap-2.5">
              <div className="flex items-center justify-between pb-1.5 border-b border-emerald-100/70">
                <h3 className="text-xs font-black text-emerald-800 uppercase tracking-wider flex items-center gap-1.5">
                  <ShieldCheck className="w-4 h-4 text-emerald-600" />
                  <span>Rujukan Bendahari</span>
                </h3>
                <span className="text-[8px] font-extrabold bg-emerald-100 text-emerald-800 border border-emerald-200/50 px-1.5 py-0.5 rounded uppercase tracking-widest">
                  Kewangan
                </span>
              </div>

              <p className="text-[10px] text-slate-600 leading-relaxed">
                Memudahkan bendahari memantau dan memuat turun senarai semua baucar bayaran yang telah diperaku dan disahkan kelulusannya.
              </p>

              <div className="bg-white/80 border border-emerald-100 rounded-lg p-2.5 flex items-center justify-between shadow-3xs">
                <div>
                  <span className="text-[9px] text-slate-400 font-bold uppercase tracking-wider block leading-none mb-1">
                    Jumlah Baucar Sah
                  </span>
                  <span className="text-lg font-black text-slate-800 font-mono leading-none">
                    {records.filter(r => r.isApproved).length} <span className="text-xs font-medium text-slate-500">rekod</span>
                  </span>
                </div>
                <div className="bg-emerald-50 text-emerald-700 p-2 rounded-full border border-emerald-100 shadow-3xs">
                  <FileSpreadsheet className="w-4 h-4" />
                </div>
              </div>

              <button
                onClick={handleExportApprovedCSV}
                className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold text-[10px] uppercase tracking-wider py-2.5 rounded transition-all cursor-pointer flex items-center justify-center gap-1.5 shadow-2xs hover:shadow-xs active:scale-98"
                title="Eksport senarai baucar diluluskan ke format fail Excel (.CSV)"
              >
                <Download className="w-3.5 h-3.5" />
                Eksport Baucar Sah (CSV)
              </button>
            </div>
          )}
        </aside>
      </main>

      {/* --- Footer Status Bar --- */}
      <footer className="h-8 bg-slate-200 border-t border-slate-300 flex items-center justify-between px-4 text-[10px] text-slate-600 shrink-0 no-print">
        <div className="flex gap-4">
          <span className="flex items-center gap-1">
            <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
            Status: <span className="text-emerald-700 font-bold uppercase tracking-wider">Online & Selamat</span>
          </span>
          <span>Pengguna: Bendahari Kawasan</span>
        </div>
        <div className="flex items-center gap-1 font-medium text-slate-500">
          <Clock className="w-3 h-3" />
          <span>Terakhir Disimpan: {lastSavedTime}</span>
        </div>
      </footer>

      {/* --- LIGHTBOX IMAGE MODAL --- */}
      <AnimatePresence>
        {lightboxImage && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setLightboxImage(null)}
            className="fixed inset-0 bg-black/90 z-50 flex items-center justify-center p-4 cursor-zoom-out no-print"
          >
            <button
              onClick={() => setLightboxImage(null)}
              className="absolute top-5 right-5 p-2 bg-white/10 hover:bg-white/20 text-white rounded-full transition-colors cursor-pointer"
            >
              <X className="w-6 h-6" />
            </button>
            <motion.img
              initial={{ scale: 0.95 }}
              animate={{ scale: 1 }}
              exit={{ scale: 0.95 }}
              src={lightboxImage}
              alt="Receipt Preview"
              className="max-w-full max-h-[90vh] object-contain rounded-md shadow-2xl"
            />
          </motion.div>
        )}
      </AnimatePresence>

      {/* --- PAYMENT VOUCHER MODAL (ADMIN ONLY) --- */}
      {printingVoucherRecord && !isPrintActive && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs z-50 flex items-center justify-center p-4 overflow-y-auto no-print">
          <div className="bg-white rounded-md shadow-xl border border-slate-300 w-full max-w-3xl flex flex-col max-h-[90vh]">
            
            {/* Modal Header */}
            <div className="flex items-center justify-between px-5 py-3 border-b border-slate-200 bg-slate-50 shrink-0">
              <div className="flex items-center gap-2 text-slate-800">
                <ShieldCheck className="w-4 h-4 text-emerald-600" />
                <h3 className="text-xs font-black uppercase tracking-wider">Pratinjau Baucar Bayaran (Mod Admin)</h3>
              </div>
              <div className="flex items-center gap-2">
                {!printingVoucherRecord.isApproved ? (
                  <button
                    onClick={() => handleApproveVoucher(printingVoucherRecord.id)}
                    className="bg-emerald-600 hover:bg-emerald-700 text-white px-3 py-1.5 rounded text-[10px] font-bold uppercase tracking-wider flex items-center gap-1.5 cursor-pointer transition-colors"
                  >
                    <CheckCircle className="w-3.5 h-3.5" />
                    Luluskan Baucar
                  </button>
                ) : (
                  <div className="bg-emerald-50 text-emerald-700 border border-emerald-200 px-2.5 py-1.5 rounded text-[10px] font-bold uppercase tracking-wider flex items-center gap-1">
                    <CheckCircle className="w-3.5 h-3.5" />
                    Telah Diluluskan
                  </div>
                )}

                <button
                  onClick={() => {
                    if (printingVoucherRecord.isApproved) {
                      setIsPrintActive(true);
                    }
                  }}
                  disabled={!printingVoucherRecord.isApproved}
                  className={`px-3 py-1.5 rounded text-[10px] font-bold uppercase tracking-wider flex items-center gap-1.5 transition-all ${
                    printingVoucherRecord.isApproved
                      ? "bg-blue-600 hover:bg-blue-700 text-white cursor-pointer"
                      : "bg-slate-100 text-slate-400 border border-slate-200 cursor-not-allowed opacity-60"
                  }`}
                  title={!printingVoucherRecord.isApproved ? "Luluskan baucar dahulu untuk membolehkan cetakan" : "Cetak / Simpan PDF"}
                >
                  <Printer className="w-3.5 h-3.5" />
                  Cetak & Simpan PDF
                </button>
                <button
                  onClick={() => setPrintingVoucherRecord(null)}
                  className="p-1.5 hover:bg-slate-200 text-slate-400 hover:text-slate-700 rounded transition-colors cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Modal Body: The scrollable formal voucher layout */}
            <div className="flex-1 overflow-y-auto p-8 bg-slate-100 flex flex-col items-center gap-4">
              {!printingVoucherRecord.isApproved && (
                <div className="w-full max-w-2xl bg-amber-50 border border-amber-200 text-amber-800 rounded px-4 py-2.5 text-[10px] font-bold flex items-center gap-2 shadow-xs">
                  <AlertCircle className="w-4 h-4 text-amber-600 shrink-0" />
                  <span>
                    Sila klik butang <strong className="text-amber-950">"LULUSKAN BAUCAR"</strong> di atas terlebih dahulu untuk memaparkan cop rasmi <strong className="text-emerald-800">"DILULUSKAN / APPROVED"</strong> dan membolehkan cetakan dibuat.
                  </span>
                </div>
              )}
              {printingVoucherRecord.isApproved && (
                <div className="w-full max-w-2xl bg-emerald-50 border border-emerald-200 text-emerald-800 rounded px-4 py-2.5 text-[10px] font-bold flex items-center gap-2 shadow-xs">
                  <CheckCircle className="w-4 h-4 text-emerald-600 shrink-0" />
                  <span>
                    Baucar telah diluluskan dengan jayanya! Anda kini boleh klik butang <strong className="text-blue-950">"CETAK & SIMPAN PDF"</strong> untuk mencetak baucar lengkap berserta cop rasmi.
                  </span>
                </div>
              )}
              <div className="w-full max-w-2xl bg-white shadow-md p-1 rounded">
                <VoucherPrintSheet record={printingVoucherRecord} />
              </div>
            </div>

            {/* Modal Footer */}
            <div className="flex justify-end gap-2 px-5 py-3 border-t border-slate-200 bg-slate-50 shrink-0">
              <button
                onClick={() => setPrintingVoucherRecord(null)}
                className="px-4 py-1.5 bg-slate-200 hover:bg-slate-300 text-slate-700 rounded text-[10px] font-bold uppercase tracking-wider transition-colors cursor-pointer"
              >
                Tutup
              </button>
            </div>

          </div>
        </div>
      )}

      {/* --- PURE PRINT VIEW FOR PAYMENT VOUCHER (FOR HIGH-FIDELITY PDF SAVE/PRINT) --- */}
      {isPrintActive && printingVoucherRecord && (
        <div className="fixed inset-0 bg-white z-[9999] overflow-auto flex justify-center p-4 m-0">
          <div className="w-full max-w-2xl">
            <VoucherPrintSheet record={printingVoucherRecord} />
            
            {/* Floating button to exit print view */}
            <div className="mt-6 flex justify-center gap-3 no-print">
              <button
                onClick={() => window.print()}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded text-xs font-bold uppercase tracking-wider transition-colors cursor-pointer flex items-center gap-1.5"
              >
                <Printer className="w-4 h-4" />
                Sahkan Cetakan (Print / PDF)
              </button>
              <button 
                onClick={() => setIsPrintActive(false)} 
                className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-white rounded text-xs font-bold uppercase tracking-wider transition-colors cursor-pointer"
              >
                Kembali ke Aplikasi
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
