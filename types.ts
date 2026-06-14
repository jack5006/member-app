
export interface Member {
  id: string;
  name: string;
  phone: string;
  address: string;
  balance: number;
  points: number;
  tier: 'Standard' | 'Silver' | 'Gold' | 'Platinum';
  joinDate: string;
}

export type TransactionType = 'TOPUP' | 'CONSUME' | 'POINT_EARN' | 'POINT_SPEND';

export interface Transaction {
  id: string;
  memberId: string;
  type: TransactionType;
  amount: number;
  points: number;
  timestamp: string;
  description: string;
}

export interface Stats {
  totalMembers: number;
  totalBalance: number;
  totalPoints: number;
  todayTransactions: number;
}
