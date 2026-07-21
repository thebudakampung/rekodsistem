export interface ExpenseItem {
  id: string;
  description: string;
  amount: string; // Keep as string for friendly typing/editing
}

export interface ReceiptAttachment {
  id: string;
  name: string;
  data: string; // Base64 data URL
}

export interface ClaimRecord {
  id: string;
  pvNumber: string;
  date: string;
  claimantName: string;
  claimantPosition: string;
  bankName: string;
  bankAccount: string;
  purpose: string;
  items: ExpenseItem[];
  receipts: ReceiptAttachment[];
  preparedBy: string;
  reviewedBy: string;
  approvedBy: string;
  totalAmount: number;
  organizationName: string;
  organizationSub: string;
  createdAt: string;
  clientId?: string;
  isLocked?: boolean;
  adminNote?: string;
  isApproved?: boolean;
}
