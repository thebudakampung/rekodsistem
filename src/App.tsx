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
  Unlock
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { ExpenseItem, ReceiptAttachment, ClaimRecord } from "./types";
import { db } from "./firebase";
import { collection, doc, setDoc, getDocs, deleteDoc, query, orderBy, updateDoc } from "firebase/firestore";

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
  
  const [preparedBy, setPreparedBy] = useState("");
  const [reviewedBy, setReviewedBy] = useState("");
  const [approvedBy, setApprovedBy] = useState("");
  
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
  const [selectedRecordTab, setSelectedRecordTab] = useState<"personal" | "all">("personal");
  const [isDbLoading, setIsDbLoading] = useState<boolean>(false);
  const [isAdminLoggedIn, setIsAdminLoggedIn] = useState<boolean>(() => {
    return localStorage.getItem("sistem_tuntutan_is_admin") === "true";
  });
  const [adminEmail, setAdminEmail] = useState<string>(() => {
    return localStorage.getItem("sistem_tuntutan_admin_email") || "";
  });
  const [adminEmailInput, setAdminEmailInput] = useState<string>("");

  const fileInputRef = useRef<HTMLInputElement>(null);

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
        await updateDoc(docRef, {
          isLocked: newLockState,
          adminNote: finalNote
        });
        
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
      await updateDoc(docRef, {
        adminNote: formAdminNote
      });
      
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

    validImageFiles.forEach(file => {
      const reader = new FileReader();
      reader.onload = (e) => {
        if (e.target?.result) {
          const newAttachment: ReceiptAttachment = {
            id: Math.random().toString(36).substring(2, 9) + Date.now(),
            name: file.name,
            data: e.target.result as string
          };
          setReceipts(prev => [...prev, newAttachment]);
        }
      };
      reader.onerror = () => {
        triggerNotification(`Gagal membaca fail ${file.name}`, "error");
      };
      reader.readAsDataURL(file);
    });
    
    triggerNotification(`Berjaya memproses ${validImageFiles.length} resit`, "success");
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
    
    const recordClientId = existingRec?.clientId || currentClientId || "unknown";

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

  // --- CSV EXPORT ---
  const handleExportCSV = () => {
    // Only allow export of filtered records so that normal users can only export their personal records
    const exportableRecords = records.filter(r => {
      if (!isAdminLoggedIn) {
        return r.clientId === currentClientId;
      }
      if (selectedRecordTab === "personal") {
        return r.clientId === currentClientId;
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
      <header className="h-14 bg-slate-900 text-white flex items-center justify-between px-6 shrink-0 no-print">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 bg-blue-500 rounded flex items-center justify-center font-black text-lg italic text-white shadow-xs">i</div>
          <div>
            <h1 className="text-sm font-extrabold uppercase tracking-wider leading-none">Pertubuhan IKRAM Malaysia</h1>
            <p className="text-[10px] text-slate-400 mt-0.5 font-medium flex items-center gap-1.5">
              <span>Sistem Tuntutan Perbelanjaan Pro v2.5</span>
              <span className="inline-block w-1.5 h-1.5 bg-emerald-500 rounded-full animate-pulse"></span>
              <span className="text-emerald-400 text-[9px] font-bold tracking-wider uppercase bg-emerald-950/50 border border-emerald-900/50 px-1 rounded-sm">Cloud Firestore</span>
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button 
            onClick={() => handleResetForm(true)}
            className="bg-slate-800 hover:bg-slate-700 text-white px-3 py-1.5 rounded text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer"
          >
            <RefreshCw className="w-3 h-3 text-emerald-400" />
            <span>Borang Baru</span>
          </button>
          
          {!isReadOnly && (
            <button 
              onClick={handleSaveRecord}
              className="bg-slate-700 hover:bg-slate-600 text-white px-3 py-1.5 rounded text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer"
            >
              <Save className="w-3 h-3 text-blue-400" />
              <span>💾 Simpan</span>
            </button>
          )}

          <button 
            onClick={handlePrint}
            className="bg-blue-600 hover:bg-blue-700 text-white px-3 py-1.5 rounded text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer"
          >
            <Printer className="w-3 h-3 text-white" />
            <span>Cetak PDF</span>
          </button>
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
                  disabled={isReadOnly}
                  onChange={(e) => setPvNumber(e.target.value)}
                  className="text-xs font-mono font-bold text-slate-900 bg-transparent border-b border-transparent hover:border-slate-300 focus:border-blue-500 outline-none py-0.5 disabled:opacity-75 disabled:cursor-not-allowed"
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
                  placeholder="Nama Bendahari"
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
                  placeholder="Nama YDP / Ketua"
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
                <button 
                  onClick={handleExportCSV}
                  className="text-[10px] text-blue-600 font-extrabold hover:underline flex items-center gap-1 cursor-pointer"
                  title="Sila eksport semua rekod ke fail Excel (CSV)"
                >
                  <FileSpreadsheet className="w-3 h-3 text-emerald-600" />
                  Eksport
                </button>
              </div>
            </div>

            {/* Segmented Controls (Personal vs All/Admin) */}
            <div className="grid grid-cols-2 bg-slate-100 p-0.5 rounded-md text-[10px] font-bold mb-3">
              <button
                onClick={() => setSelectedRecordTab("personal")}
                className={`py-1 rounded-sm transition-all cursor-pointer flex items-center justify-center gap-1 ${
                  selectedRecordTab === "personal"
                    ? "bg-white text-slate-900 shadow-3xs"
                    : "text-slate-500 hover:text-slate-800"
                }`}
              >
                <User className="w-3 h-3" />
                <span>Tuntutan Saya</span>
                <span className="bg-slate-200 text-slate-700 rounded-full px-1 py-0.2 text-[8px]">
                  {records.filter(r => r.clientId === currentClientId).length}
                </span>
              </button>
              
              <button
                onClick={() => setSelectedRecordTab("all")}
                className={`py-1 rounded-sm transition-all cursor-pointer flex items-center justify-center gap-1 ${
                  selectedRecordTab === "all"
                    ? "bg-white text-blue-700 shadow-3xs border border-blue-100/50"
                    : "text-slate-500 hover:text-slate-800"
                }`}
              >
                <Users className="w-3 h-3" />
                <span>Semua (Mod Admin)</span>
                <span className="bg-blue-100 text-blue-700 rounded-full px-1 py-0.2 text-[8px]">
                  {records.length}
                </span>
              </button>
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

            {selectedRecordTab === "all" && !isAdminLoggedIn ? (
              <div className="flex-1 flex flex-col justify-center items-center p-4 text-center">
                <div className="w-10 h-10 bg-amber-50 border border-amber-200 rounded-full flex items-center justify-center text-amber-500 mb-3 animate-pulse">
                  <Lock className="w-5 h-5" />
                </div>
                <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wider mb-1">Mod Admin Dikunci</h4>
                <p className="text-[10px] text-slate-400 max-w-[200px] leading-relaxed mb-4">
                  Sila log masuk dengan E-mel Admin anda untuk melihat semua rekod pengguna lain di pangkalan data awan.
                </p>
                <form onSubmit={handleAdminLogin} className="w-full space-y-2">
                  <div>
                    <input 
                      type="email"
                      required
                      value={adminEmailInput}
                      onChange={(e) => setAdminEmailInput(e.target.value)}
                      className="w-full text-center text-xs font-mono border border-slate-200 focus:border-blue-500 focus:bg-white bg-slate-50 py-1.5 px-3 rounded outline-none transition-all text-slate-800"
                      placeholder="Masukkan e-mel admin..."
                    />
                    <span className="text-[8px] text-slate-400 mt-1 block">Contoh: budakampung7@gmail.com</span>
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
                            {rec.clientId !== currentClientId ? (
                              <span className="text-[8px] font-bold text-amber-700 bg-amber-50 border border-amber-200/50 px-1 rounded flex items-center gap-0.5 shrink-0">
                                <Users className="w-2 h-2" /> Ahli Lain
                              </span>
                            ) : (
                              <span className="text-[8px] font-bold text-emerald-700 bg-emerald-50 border border-emerald-200/50 px-1 rounded shrink-0">
                                Saya
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

    </div>
  );
}
