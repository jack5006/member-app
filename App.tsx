
import React, { useState, useEffect, useMemo } from 'react';
import { Member, Transaction, Stats, TransactionType } from './types';
import { ICONS, TIER_COLORS } from './constants';
import { getMemberInsight } from './services/geminiService';
import { translations, Language } from './translations';
import { CartesianGrid, Tooltip, ResponsiveContainer, AreaChart, Area, XAxis, YAxis } from 'recharts';
import * as XLSX from 'xlsx';

const INITIAL_MEMBERS: Member[] = [
  { id: '1', name: '张三 (Zhang San)', phone: '13800138000', address: '北京市朝阳区', balance: 500.50, points: 1200, tier: 'Gold', joinDate: '2023-10-01' },
  { id: '2', name: '李四 (Li Si)', phone: '13911122233', address: '上海市徐汇区', balance: 120.00, points: 300, tier: 'Standard', joinDate: '2024-01-15' },
];

const App: React.FC = () => {
  const [lang, setLang] = useState<Language>(() => {
    const saved = localStorage.getItem('lang');
    return (saved as Language) || 'zh';
  });

  const t = translations[lang];

  const [activeTab, setActiveTab] = useState<'dashboard' | 'members' | 'transactions' | 'settings'>('dashboard');
  const [members, setMembers] = useState<Member[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [isLoadingData, setIsLoadingData] = useState(true);

  const [searchQuery, setSearchQuery] = useState('');
  const [isAddingMember, setIsAddingMember] = useState(false);
  const [selectedMemberId, setSelectedMemberId] = useState<string | null>(null);
  const [aiInsight, setAiInsight] = useState<string>('');
  const [isLoadingInsight, setIsLoadingInsight] = useState(false);

  const [modal, setModal] = useState<{
    isOpen: boolean;
    type: 'alert' | 'confirm';
    message: string;
    onConfirm?: () => void;
  } | null>(null);

  const showAlert = (message: string) => {
    setModal({
      isOpen: true,
      type: 'alert',
      message
    });
  };

  const showConfirm = (message: string, onConfirm: () => void) => {
    setModal({
      isOpen: true,
      type: 'confirm',
      message,
      onConfirm
    });
  };

  const selectedMember = useMemo(() => 
    members.find(m => m.id === selectedMemberId) || null
  , [members, selectedMemberId]);

  useEffect(() => {
    localStorage.setItem('lang', lang);
  }, [lang]);

  useEffect(() => {
    const loadInitialData = async () => {
      try {
        setIsLoadingData(true);
        const [membersRes, txsRes] = await Promise.all([
          fetch('/api/members'),
          fetch('/api/transactions')
        ]);
        
        if (!membersRes.ok || !txsRes.ok) throw new Error("Failed to load initial data");
        
        const dbMembers = await membersRes.json();
        const dbTxs = await txsRes.json();
        
        setMembers(dbMembers);
        setTransactions(dbTxs);
      } catch (err) {
        console.error("Error loading full-stack data:", err);
        showAlert(lang === 'zh' ? "从数据库加载数据失败！" : "Failed to load database records!");
      } finally {
        setIsLoadingData(false);
      }
    };
    loadInitialData();
  }, [lang]);

  const stats = useMemo<Stats>(() => ({
    totalMembers: members.length,
    totalBalance: members.reduce((acc, m) => acc + m.balance, 0),
    totalPoints: members.reduce((acc, m) => acc + m.points, 0),
    todayTransactions: transactions.filter(tx => tx.timestamp.startsWith(new Date().toISOString().split('T')[0])).length,
  }), [members, transactions]);

  const handleTransaction = async (memberId: string, type: TransactionType, amount: number, points: number, desc: string) => {
    const timestamp = new Date().toISOString();
    
    const amt = Number(amount);
    const pts = Math.floor(Number(points));

    const member = members.find(m => m.id === memberId);
    if (!member) return;

    let newBalance = member.balance;
    let newPoints = member.points;
    let txAmt = amt;
    let txPts = pts;
    let txDesc = desc;

    if (type === 'TOPUP') {
      newBalance += amt;
      newPoints += pts;
    }
    if (type === 'CONSUME') {
      if (newBalance < amt) {
        showAlert(t.insufficientBalance);
        return;
      }
      newBalance -= amt;
      newPoints += Math.floor(amt); 
    }
    if (type === 'POINT_EARN') {
      newPoints += pts;
    }
    if (type === 'POINT_SPEND') {
      if (newPoints < pts) {
        showAlert(t.insufficientPoints);
        return;
      }
      newPoints -= pts;
      
      if (desc.includes('余额') || desc.includes('Balance')) {
        const cashback = pts / 100;
        newBalance += cashback;
        txAmt = cashback; 
        txDesc = `${desc} (+RM ${cashback.toFixed(2)})`;
      }
    }

    let newTier = member.tier;
    if (newPoints > 10000) newTier = 'Platinum';
    else if (newPoints > 5000) newTier = 'Gold';
    else if (newPoints > 1000) newTier = 'Silver';
    else newTier = 'Standard';

    try {
      const updatedMemberRes = await fetch(`/api/members/${memberId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...member,
          balance: newBalance,
          points: newPoints,
          tier: newTier
        })
      });

      if (!updatedMemberRes.ok) throw new Error("Failed to update member in database");
      const updatedMember = await updatedMemberRes.json();

      const transactionId = Math.random().toString(36).substr(2, 9);
      const txPayload: Transaction = {
        id: transactionId,
        memberId,
        type,
        amount: txAmt,
        points: txPts,
        timestamp,
        description: txDesc
      };

      const updatedTxRes = await fetch('/api/transactions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(txPayload)
      });

      if (!updatedTxRes.ok) throw new Error("Failed to record transaction in database");
      const updatedTx = await updatedTxRes.json();

      setMembers(prev => prev.map(m => m.id === memberId ? updatedMember : m));
      setTransactions(prev => [updatedTx, ...prev]);
    } catch (err) {
      console.error("Transaction failed:", err);
      showAlert(lang === 'zh' ? "交易失败，无法保存到数据库！" : "Transaction failed, database error!");
    }
  };

  const filteredMembers = members.filter(m => 
    m.name.toLowerCase().includes(searchQuery.toLowerCase()) || 
    m.phone.includes(searchQuery)
  );

  const handleGetInsight = async (member: Member) => {
    setIsLoadingInsight(true);
    const insight = await getMemberInsight(member, lang);
    setAiInsight(insight);
    setIsLoadingInsight(false);
  };

  const handleExportMembers = () => {
    const data = members.map(m => ({
      [t.memberId]: m.id,
      [t.name]: m.name,
      [t.phone]: m.phone,
      [t.address]: m.address,
      [t.tier]: m.tier,
      [t.balance]: m.balance,
      [t.points]: m.points,
      [t.joinDate]: m.joinDate,
    }));

    const worksheet = XLSX.utils.json_to_sheet(data);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Members");
    XLSX.writeFile(workbook, "MemberPro_Members.xlsx");
  };

  const handleImportExcel = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    const file = files[0];
    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const data = event.target?.result;
        if (!data) throw new Error("No data");
        const workbook = XLSX.read(data, { type: 'binary' });
        const sheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[sheetName];
        const rawJson = XLSX.utils.sheet_to_json<any>(worksheet);

        if (rawJson.length === 0) {
          showAlert(t.importError);
          return;
        }

        const mappedMembers: Member[] = rawJson.map((row: any) => {
          const getValue = (keys: string[]) => {
            for (const key of keys) {
              if (row[key] !== undefined) return row[key];
            }
            for (const actualKey of Object.keys(row)) {
              if (keys.some(k => k.toLowerCase().trim() === actualKey.toLowerCase().trim())) {
                return row[actualKey];
              }
            }
            return undefined;
          };

          const id = String(getValue([t.memberId, "会员ID", "Member ID", "id", "ID"]) || Math.random().toString(36).substr(2, 9));
          const name = String(getValue([t.name, "姓名", "Name", "name"]) || "");
          const phone = String(getValue([t.phone, "电话", "Phone", "phone"]) || "");
          const address = String(getValue([t.address, "详细地址", "Address", "address"]) || "");
          const tierVal = String(getValue([t.tier, "等级", "Tier", "tier"]) || "Standard");
          const balance = Number(getValue([t.balance, "余额", "Balance", "balance"]) || 0);
          const points = Number(getValue([t.points, "积分", "Points", "points"]) || 0);
          const joinDate = String(getValue([t.joinDate, "加入日期", "Join Date", "joinDate", "join_date"]) || new Date().toISOString().split('T')[0]);

          const validTiers = ["Standard", "Silver", "Gold", "Platinum"];
          const tier = validTiers.includes(tierVal) ? (tierVal as any) : "Standard";

          return {
            id,
            name,
            phone,
            address,
            tier,
            balance,
            points,
            joinDate,
          };
        });

        const confirmMsg = lang === 'zh'
          ? "确认从该 Excel 备份恢复会员数据吗？这将覆盖当前的所有会员与交易数据！"
          : "Are you sure you want to restore member data from this Excel? This will overwrite all current member and transaction records!";
        
        showConfirm(confirmMsg, async () => {
          try {
            const res = await fetch('/api/import', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ members: mappedMembers })
            });

            if (!res.ok) throw new Error("Import failed");

            const [membersRes, txsRes] = await Promise.all([
              fetch('/api/members'),
              fetch('/api/transactions')
            ]);
            
            if (membersRes.ok && txsRes.ok) {
              setMembers(await membersRes.json());
              setTransactions(await txsRes.json());
            }

            showAlert(t.importSuccess.replace("{count}", mappedMembers.length.toString()));
          } catch (err) {
            console.error("Import error:", err);
            showAlert(t.importError);
          }
        });
      } catch (err) {
        console.error(err);
        showAlert(t.importError);
      }
    };
    reader.readAsBinaryString(file);
    e.target.value = "";
  };

  const handleClearAllData = () => {
    showConfirm(t.clearDataConfirm, async () => {
      try {
        const res = await fetch('/api/clear', { method: 'POST' });
        if (!res.ok) throw new Error("Clear failed");

        setMembers([]);
        setTransactions([]);
        showAlert(t.clearSuccess);
      } catch (err) {
        console.error("Clear data error:", err);
        showAlert(lang === 'zh' ? "初始化系统失败！" : "Failed to reset system!");
      }
    });
  };

  return (
    <div className="flex min-h-screen">
      <aside className="w-64 bg-indigo-900 text-white flex-shrink-0 flex flex-col hidden md:flex">
        <div className="p-6 text-2xl font-bold flex items-center gap-2">
          <div className="bg-white p-1 rounded-lg">
            <div className="w-6 h-6 bg-indigo-600 rounded-md"></div>
          </div>
          MemberPro
        </div>
        <nav className="mt-4 flex-1">
          <SidebarButton active={activeTab === 'dashboard'} onClick={() => setActiveTab('dashboard')} icon={<ICONS.Dashboard />} label={t.dashboard} />
          <SidebarButton active={activeTab === 'members'} onClick={() => setActiveTab('members')} icon={<ICONS.Users />} label={t.members} />
          <SidebarButton active={activeTab === 'transactions'} onClick={() => setActiveTab('transactions')} icon={<ICONS.History />} label={t.transactions} />
        </nav>
        
        <div className="px-6 py-4 flex gap-2 border-t border-indigo-800">
           <button onClick={() => setLang('zh')} className={`flex-1 text-xs py-1 rounded ${lang === 'zh' ? 'bg-indigo-600 text-white' : 'text-indigo-300'}`}>中文</button>
           <button onClick={() => setLang('en')} className={`flex-1 text-xs py-1 rounded ${lang === 'en' ? 'bg-indigo-600 text-white' : 'text-indigo-300'}`}>EN</button>
        </div>

        <div className="p-6 border-t border-indigo-800">
          <button
            onClick={() => setActiveTab('settings')}
            className={`flex items-center gap-3 w-full transition-colors text-sm ${activeTab === 'settings' ? 'text-white font-semibold bg-indigo-800/40 px-3 py-2 rounded-lg' : 'text-indigo-300 hover:text-white px-3 py-2'}`}
          >
            <ICONS.Settings /> {t.settings}
          </button>
        </div>
      </aside>

      <main className="flex-1 overflow-y-auto p-4 md:p-8">
        <header className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">
          <div>
            <h1 className="text-2xl font-bold text-gray-800 animate-fade-in">
              {activeTab === 'dashboard' ? t.welcome : activeTab === 'members' ? t.members : activeTab === 'transactions' ? t.transactions : t.settings}
            </h1>
            <p className="text-gray-500">
              {new Date().toLocaleDateString(lang === 'zh' ? 'zh-CN' : 'en-US', { year: 'numeric', month: 'long', day: 'numeric', weekday: 'long' })}
            </p>
          </div>
          {activeTab === 'members' && (
            <button onClick={() => setIsAddingMember(true)} className="bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-lg flex items-center gap-2 shadow-md text-sm font-semibold transition-all">
              <ICONS.Plus /> {t.addMember}
            </button>
          )}
        </header>

        {isLoadingData ? (
          <div className="flex flex-col items-center justify-center h-64 gap-3">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600"></div>
            <p className="text-gray-400 text-xs">{lang === 'zh' ? "正在从数据库加载数据..." : "Loading records from database..."}</p>
          </div>
        ) : (
          <>
            {activeTab === 'dashboard' && (
          <div className="space-y-6">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <StatCard title={t.totalMembers} value={stats.totalMembers} icon={<ICONS.Users />} color="blue" />
              <StatCard title={t.totalBalance} value={`RM ${stats.totalBalance.toFixed(2)}`} icon={<ICONS.Wallet />} color="indigo" />
              <StatCard title={t.totalPoints} value={stats.totalPoints} icon={<ICONS.Brain />} color="amber" />
              <StatCard title={t.todayTransactions} value={stats.todayTransactions} icon={<ICONS.History />} color="emerald" />
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100">
                <h3 className="text-lg font-semibold mb-4">{t.recentTrends}</h3>
                <div className="h-64">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={transactions.slice(0, 10).reverse().map(tx => ({ name: tx.timestamp.split('T')[1].slice(0, 5), amount: tx.amount }))}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                      <XAxis dataKey="name" fontSize={10} tickLine={false} axisLine={false} />
                      <YAxis fontSize={10} tickLine={false} axisLine={false} />
                      <Tooltip />
                      <Area type="monotone" dataKey="amount" stroke="#4f46e5" fill="#eef2ff" />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              </div>

              <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100">
                <h3 className="text-lg font-semibold mb-4">{t.latestMembers}</h3>
                <div className="space-y-4">
                  {members.slice(0, 5).map(m => (
                    <div key={m.id} className="flex items-center justify-between p-3 hover:bg-gray-50 rounded-xl transition-colors">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-full bg-indigo-100 text-indigo-600 flex items-center justify-center font-bold">
                          {m.name ? m.name.charAt(0) : '?'}
                        </div>
                        <div>
                          <div className="font-medium text-sm">{m.name || 'Anonymous'}</div>
                          <div className="text-[10px] text-gray-400">{m.phone || 'No Phone'}</div>
                        </div>
                      </div>
                      <div className={`px-2 py-0.5 rounded text-[10px] font-semibold ${TIER_COLORS[m.tier]}`}>
                        {m.tier}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'members' && (
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
            <div className="p-4 border-b">
              <div className="relative">
                <div className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"><ICONS.Search /></div>
                <input type="text" placeholder={t.searchPlaceholder} className="w-full pl-10 pr-4 py-2 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-indigo-500/20 outline-none" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} />
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead>
                  <tr className="bg-gray-50 text-gray-500 text-xs font-medium uppercase tracking-wider">
                    <th className="px-6 py-4">{t.name}</th>
                    <th className="px-6 py-4">{t.phone}</th>
                    <th className="px-6 py-4">{t.tier}</th>
                    <th className="px-6 py-4">{t.balance}</th>
                    <th className="px-6 py-4">{t.points}</th>
                    <th className="px-6 py-4 text-right">{t.actions}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {filteredMembers.map(m => (
                    <tr key={m.id} className="hover:bg-indigo-50/30 transition-colors">
                      <td className="px-6 py-4 font-medium text-sm">{m.name || 'Anonymous'}</td>
                      <td className="px-6 py-4 text-gray-600 text-sm">{m.phone || '-'}</td>
                      <td className="px-6 py-4"><span className={`px-2 py-1 rounded-full text-[10px] font-semibold ${TIER_COLORS[m.tier]}`}>{m.tier}</span></td>
                      <td className="px-6 py-4 font-semibold text-indigo-600 text-sm">RM {m.balance.toFixed(2)}</td>
                      <td className="px-6 py-4 text-amber-600 font-medium text-sm">{m.points}</td>
                      <td className="px-6 py-4 text-right">
                        <button onClick={() => { setSelectedMemberId(m.id); setAiInsight(''); }} className="text-indigo-600 hover:text-indigo-900 text-xs font-semibold">{t.details}</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {filteredMembers.length === 0 && <div className="p-12 text-center text-gray-400 text-sm">{t.noResults}</div>}
            </div>
          </div>
        )}

        {activeTab === 'transactions' && (
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
             <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead>
                  <tr className="bg-gray-50 text-gray-500 text-xs font-medium uppercase tracking-wider">
                    <th className="px-6 py-4">{t.time}</th>
                    <th className="px-6 py-4">{t.type}</th>
                    <th className="px-6 py-4">{t.balance}/{t.points}</th>
                    <th className="px-6 py-4">{t.description}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {transactions.map(tx => (
                    <tr key={tx.id} className="text-xs">
                      <td className="px-6 py-4 text-gray-500">{new Date(tx.timestamp).toLocaleString(lang === 'zh' ? 'zh-CN' : 'en-US')}</td>
                      <td className="px-6 py-4">
                        <span className={`px-2 py-0.5 rounded text-[9px] font-bold ${tx.type === 'TOPUP' ? 'bg-green-100 text-green-700' : tx.type === 'CONSUME' ? 'bg-red-100 text-red-700' : tx.type === 'POINT_EARN' ? 'bg-blue-100 text-blue-700' : 'bg-amber-100 text-amber-700'}`}>
                          {tx.type === 'TOPUP' ? t.topUp : tx.type === 'CONSUME' ? t.consume : tx.type === 'POINT_EARN' ? t.pointEarn : t.pointSpend}
                        </span>
                      </td>
                      <td className="px-6 py-4 font-medium">
                        {tx.amount !== 0 && (
                          <span className={tx.type === 'CONSUME' ? 'text-red-500' : 'text-green-500'}>
                            {tx.type === 'CONSUME' ? '-' : '+'} RM {Math.abs(tx.amount).toFixed(2)}
                          </span>
                        )}
                        {tx.amount !== 0 && tx.points !== 0 && <span className="mx-1">/</span>}
                        {tx.points !== 0 && (
                          <span className={tx.type === 'POINT_SPEND' ? 'text-red-500' : 'text-green-500'}>
                            {tx.type === 'POINT_SPEND' ? '-' : '+'}{Math.abs(tx.points)} P
                          </span>
                        )}
                      </td>
                      <td className="px-6 py-4 text-gray-600">{tx.description}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
          </>
        )}

        {activeTab === 'settings' && (
          <div className="space-y-6 max-w-4xl animate-fade-in">
            <div className="bg-white p-6 md:p-8 rounded-2xl shadow-sm border border-gray-100">
              <h3 className="text-lg font-bold text-gray-800 mb-2 flex items-center gap-2">
                <span className="text-indigo-600 flex items-center"><ICONS.Settings /></span>
                {t.dataManagement}
              </h3>
              <p className="text-gray-400 text-xs mb-8">
                {lang === 'zh' ? '管理系统的会员账目、数据安全备份与一键初始化选项' : 'Administrate member databases, cloud backups, and reset configurations.'}
              </p>

              <div className="space-y-8 divide-y divide-gray-100">
                {/* Export & Import backup */}
                <div className="pb-6 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
                  <div className="flex-1">
                    <h4 className="font-semibold text-sm text-gray-800 mb-1 flex items-center gap-2">
                      <span className="text-emerald-500 font-bold">📂</span> {t.exportImportLabel}
                    </h4>
                    <p className="text-xs text-gray-400 max-w-xl">{t.exportImportDesc}</p>
                  </div>
                  <div className="flex flex-wrap gap-2 shrink-0 pt-2 md:pt-0">
                    <button onClick={handleExportMembers} className="bg-green-600 hover:bg-green-700 text-white px-4 py-2.5 rounded-xl flex items-center gap-2 shadow-sm text-xs font-bold transition-all active:scale-95">
                      <ICONS.Download /> {t.exportExcel}
                    </button>
                    <input
                      type="file"
                      accept=".xlsx, .xls"
                      onChange={handleImportExcel}
                      className="hidden"
                      id="restore-excel-input"
                    />
                    <label
                      htmlFor="restore-excel-input"
                      className="bg-teal-600 hover:bg-teal-700 text-white px-4 py-2.5 rounded-xl flex items-center gap-2 shadow-sm cursor-pointer text-xs font-bold transition-all active:scale-95"
                    >
                      <ICONS.Upload /> {t.importExcel}
                    </label>
                  </div>
                </div>

                {/* Reset system / Wipe Data */}
                <div className="pt-8 pb-2 flex flex-col md:flex-row items-start md:items-center justify-between gap-4 animate-pulse-subtle">
                  <div className="flex-1">
                    <h4 className="font-semibold text-sm text-red-600 mb-1 flex items-center gap-2">
                      <span className="font-bold text-base">🚨</span> {t.clearData}
                    </h4>
                    <p className="text-xs text-gray-400 max-w-xl">{t.clearDataDesc}</p>
                  </div>
                  <div className="shrink-0 pt-2 md:pt-0">
                    <button
                      onClick={handleClearAllData}
                      className="bg-red-50 hover:bg-red-100 active:bg-red-200 text-red-600 px-4 py-2.5 rounded-xl border border-red-200 hover:border-red-300 flex items-center gap-2 text-xs font-bold transition-all active:scale-95 whitespace-nowrap shadow-sm"
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/><line x1="10" x2="10" y1="11" y2="17"/><line x1="14" x2="14" y1="11" y2="17"/></svg>
                      {lang === 'zh' ? '清空全部数据并初始化' : 'Reset App & Wipe All Data'}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
      </main>

      {isAddingMember && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl w-full max-md p-8 shadow-2xl animate-pop">
            <h2 className="text-2xl font-bold mb-6">{t.registerTitle}</h2>
            <form onSubmit={async (e) => {
              e.preventDefault();
              const formData = new FormData(e.currentTarget);
              const name = (formData.get('name') as string) || '';
              const phone = (formData.get('phone') as string) || '';
              const address = (formData.get('address') as string) || '';

              const newMember: Member = {
                id: Math.random().toString(36).substr(2, 9),
                name,
                phone,
                address,
                balance: 0,
                points: 0,
                tier: 'Standard',
                joinDate: new Date().toISOString().split('T')[0]
              };

              try {
                const res = await fetch('/api/members', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify(newMember)
                });

                if (!res.ok) throw new Error("Failed to save member");
                const savedMember = await res.json();

                setMembers(prev => [savedMember, ...prev]);
                setIsAddingMember(false);
              } catch (err) {
                console.error("Register member error:", err);
                showAlert(lang === 'zh' ? "注册会员失败，无法保存到数据库！" : "Failed to register member in database!");
              }
            }} className="space-y-4">
              <input name="name" placeholder={t.name} className="w-full px-4 py-2 border rounded-xl" />
              <input name="phone" placeholder={t.phone} className="w-full px-4 py-2 border rounded-xl" />
              <textarea name="address" placeholder={t.address} className="w-full px-4 py-2 border rounded-xl h-24"></textarea>
              <div className="flex gap-3 pt-4">
                <button type="button" onClick={() => setIsAddingMember(false)} className="flex-1 py-2 border rounded-xl text-sm">{t.cancel}</button>
                <button type="submit" className="flex-1 py-2 bg-indigo-600 text-white rounded-xl text-sm">{t.confirm}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {selectedMember && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50 p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl w-full max-w-4xl p-8 shadow-2xl animate-pop my-auto">
            <div className="flex justify-between items-start mb-8">
              <div className="flex items-center gap-4">
                <div className="w-16 h-16 rounded-full bg-indigo-600 text-white text-2xl flex items-center justify-center font-bold">
                  {selectedMember.name ? selectedMember.name.charAt(0) : '?'}
                </div>
                <div>
                  <h2 className="text-3xl font-bold">{selectedMember.name || 'Anonymous'}</h2>
                  <p className="text-gray-500">{selectedMember.phone || 'No Phone'}</p>
                </div>
              </div>
              <button onClick={() => setSelectedMemberId(null)} className="text-gray-400 hover:text-gray-600"><svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg></button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8 text-center md:text-left">
              <div className="bg-indigo-50 p-6 rounded-2xl">
                <div className="text-indigo-600 text-[10px] font-bold mb-1 uppercase tracking-widest">{t.accountBalance}</div>
                <div className="text-2xl font-bold text-indigo-900">RM {selectedMember.balance.toFixed(2)}</div>
              </div>
              <div className="bg-amber-50 p-6 rounded-2xl">
                <div className="text-amber-600 text-[10px] font-bold mb-1 uppercase tracking-widest">{t.currentPoints}</div>
                <div className="text-2xl font-bold text-amber-900">{selectedMember.points}</div>
              </div>
              <div className="bg-gray-50 p-6 rounded-2xl border border-gray-100 flex flex-col justify-center">
                <div className="text-gray-600 text-[10px] font-bold mb-1 uppercase tracking-widest">{t.memberTier}</div>
                <div className={`inline-block px-3 py-1 rounded text-xs font-bold self-center md:self-start ${TIER_COLORS[selectedMember.tier]}`}>{selectedMember.tier}</div>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
              <div className="space-y-6">
                <h3 className="text-lg font-bold">{t.quickTransaction}</h3>
                <div className="grid grid-cols-2 gap-4">
                   <TopUpAction title={t.topUp} giftPointsLabel={t.giftPoints} onSubmit={(amt, pts) => handleTransaction(selectedMember.id, 'TOPUP', amt, pts, t.offlineTopUp)} placeholder={t.amountPlaceholder} btnText={t.confirmBtn} />
                   <TransactionAction title={t.consume} color="red" onSubmit={(val) => handleTransaction(selectedMember.id, 'CONSUME', val, 0, t.productConsume)} placeholder={t.amountPlaceholder} btnText={t.confirmBtn} />
                   <TransactionAction title={t.pointEarn} color="blue" onSubmit={(val) => handleTransaction(selectedMember.id, 'POINT_EARN', 0, val, t.manualPoints)} placeholder={t.pointsPlaceholder} btnText={t.confirmBtn} />
                   <TransactionAction title={`${t.pointSpend} (100:1)`} color="amber" onSubmit={(val) => handleTransaction(selectedMember.id, 'POINT_SPEND', 0, val, lang === 'zh' ? '积分兑换余额' : 'Points to Balance')} placeholder={t.pointsPlaceholder} btnText={t.confirmBtn} colSpan="col-span-2" />
                </div>
              </div>

              <div className="space-y-4">
                <h3 className="text-lg font-bold">{t.recentActivity}</h3>
                <div className="max-h-[250px] overflow-y-auto space-y-2 pr-2 scrollbar-thin">
                  {transactions.filter(tx => tx.memberId === selectedMember.id).map(tx => (
                    <div key={tx.id} className="flex justify-between items-center p-2.5 bg-gray-50 rounded-xl border border-gray-100 text-xs">
                      <div>
                        <div className="font-semibold text-gray-800">{tx.description}</div>
                        <div className="text-[9px] text-gray-400">{new Date(tx.timestamp).toLocaleString()}</div>
                      </div>
                      <div className={`font-bold ${tx.type === 'CONSUME' || tx.type === 'POINT_SPEND' ? 'text-red-500' : 'text-green-500'}`}>
                        {tx.type === 'CONSUME' || tx.type === 'POINT_SPEND' ? '-' : '+'}
                        {tx.amount !== 0 ? `RM ${Math.abs(tx.amount).toFixed(2)}` : `${Math.abs(tx.points)}P`}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {modal && modal.isOpen && (
        <div id="custom-modal-overlay" className="fixed inset-0 bg-black/55 backdrop-blur-sm flex items-center justify-center z-[100] p-4 animate-fade-in">
          <div id="custom-modal-content" className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-6 text-center animate-pop">
            <div id="custom-modal-icon" className="mx-auto flex items-center justify-center h-12 w-12 rounded-full bg-indigo-50 text-indigo-600 mb-4 text-xl">
              {modal.type === 'confirm' ? '❓' : 'ℹ️'}
            </div>
            <h3 id="custom-modal-title" className="text-sm font-bold text-gray-800 mb-6 whitespace-pre-wrap leading-relaxed">
              {modal.message}
            </h3>
            <div id="custom-modal-actions" className="flex items-center justify-center gap-3">
              {modal.type === 'confirm' && (
                <button
                  id="custom-modal-cancel-btn"
                  onClick={() => setModal(null)}
                  className="px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 font-semibold rounded-xl text-xs flex-1 transition-all active:scale-95 border border-gray-200 cursor-pointer"
                >
                  {t.cancel || (lang === 'zh' ? '取消' : 'Cancel')}
                </button>
              )}
              <button
                id="custom-modal-confirm-btn"
                onClick={() => {
                  if (modal.onConfirm) modal.onConfirm();
                  setModal(null);
                }}
                className="px-4 py-2 text-white font-semibold rounded-xl text-xs flex-1 transition-all active:scale-95 shadow-sm bg-indigo-600 hover:bg-indigo-700 cursor-pointer"
              >
                {t.confirmBtn || (lang === 'zh' ? '确认' : 'Confirm')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

const SidebarButton: React.FC<{ active: boolean; onClick: () => void; icon: React.ReactNode; label: string }> = ({ active, onClick, icon, label }) => (
  <button onClick={onClick} className={`w-full flex items-center gap-3 px-6 py-4 transition-colors text-sm ${active ? 'bg-indigo-800' : 'hover:bg-indigo-800/50 text-indigo-200'}`}>{icon} {label}</button>
);

const StatCard: React.FC<{ title: string; value: string | number; icon: React.ReactNode; color: string }> = ({ title, value, icon, color }) => {
  const colorMap: any = { blue: 'bg-blue-50 text-blue-600', indigo: 'bg-indigo-50 text-indigo-600', amber: 'bg-amber-50 text-amber-600', emerald: 'bg-emerald-50 text-emerald-600' };
  return (
    <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100 flex items-center gap-4 transition-transform hover:-translate-y-1">
      <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${colorMap[color]}`}>{icon}</div>
      <div><div className="text-[10px] text-gray-400 font-bold uppercase tracking-wider">{title}</div><div className="text-xl font-bold text-gray-800">{value}</div></div>
    </div>
  );
};

const TopUpAction: React.FC<{
  title: string;
  giftPointsLabel: string;
  onSubmit: (amount: number, points: number) => void;
  placeholder: string;
  btnText: string;
}> = ({ title, giftPointsLabel, onSubmit, placeholder, btnText }) => {
  const [amount, setAmount] = useState('');
  const [points, setPoints] = useState('');

  const handleAmountChange = (val: string) => {
    setAmount(val);
    const num = parseFloat(val);
    if (!isNaN(num) && num > 0) {
      setPoints(Math.floor(num).toString());
    } else {
      setPoints('');
    }
  };

  return (
    <div className="bg-gray-50 p-3 rounded-xl border border-gray-100 col-span-2">
      <div className="text-[10px] font-bold mb-2 uppercase text-gray-500">{title}</div>
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="flex-1">
          <input
            type="number"
            value={amount}
            onChange={(e) => handleAmountChange(e.target.value)}
            className="w-full px-2 py-1.5 text-xs border rounded-lg outline-none bg-white font-medium focus:ring-1 focus:ring-green-500/30"
            placeholder={placeholder}
          />
        </div>
        <div className="flex items-center text-xs text-gray-400 self-center font-bold">
          =
        </div>
        <div className="flex-1 flex gap-2">
          <div className="relative flex-1">
            <input
              type="number"
              value={points}
              onChange={(e) => setPoints(e.target.value)}
              className="w-full pl-2 pr-6 py-1.5 text-xs border border-indigo-100 rounded-lg outline-none bg-indigo-50/50 text-indigo-700 font-bold focus:ring-1 focus:ring-indigo-500/30"
              placeholder={giftPointsLabel}
            />
            <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[9px] font-bold text-indigo-500">P</span>
          </div>
          <button
            onClick={() => {
              const amtNum = parseFloat(amount);
              const ptsNum = parseInt(points);
              if (!isNaN(amtNum) && amtNum > 0) {
                onSubmit(amtNum, isNaN(ptsNum) ? 0 : ptsNum);
                setAmount('');
                setPoints('');
              }
            }}
            className="px-4 py-1.5 bg-green-600 hover:bg-green-700 text-white rounded-lg text-xs font-bold transition-all active:scale-95 whitespace-nowrap"
          >
            {btnText}
          </button>
        </div>
      </div>
      <div className="text-[9px] text-gray-400 mt-1.5 flex justify-between">
        <span>※ 充值 1 元 = 1 积分 (自动计算/支持微调)</span>
        <span>※ RM 1 = 1 Point (Auto-filled)</span>
      </div>
    </div>
  );
};

const TransactionAction: React.FC<{
  title: string;
  color: 'green' | 'red' | 'blue' | 'amber';
  onSubmit: (val: number) => void;
  placeholder: string;
  btnText: string;
  colSpan?: string;
}> = ({ title, color, onSubmit, placeholder, btnText, colSpan }) => {
  const [value, setValue] = useState('');
  const colors = { green: 'bg-green-600 hover:bg-green-700', red: 'bg-red-600 hover:bg-red-700', blue: 'bg-blue-600 hover:bg-blue-700', amber: 'bg-amber-600 hover:bg-amber-700' };

  return (
    <div className={`bg-gray-50 p-3 rounded-xl border border-gray-100 ${colSpan || ''}`}>
      <div className="text-[10px] font-bold mb-2 uppercase text-gray-500">{title}</div>
      <div className="flex gap-1.5">
        <input type="number" value={value} onChange={(e) => setValue(e.target.value)} className="w-full px-2 py-1 text-xs border rounded-lg outline-none" placeholder={placeholder} />
        <button onClick={() => { const num = parseFloat(value); if (!isNaN(num) && num > 0) { onSubmit(num); setValue(''); } }} className={`px-2 py-1 text-white rounded-lg text-[10px] font-bold transition-all active:scale-95 ${colors[color]}`}>{btnText}</button>
      </div>
    </div>
  );
};

export default App;
