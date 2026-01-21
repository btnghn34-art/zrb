import React, { useState, useEffect } from 'react';
import { GoogleGenAI } from "@google/genai";
import { signInAnonymously, onAuthStateChanged, User } from 'firebase/auth';
import { collection, addDoc, onSnapshot, serverTimestamp } from 'firebase/firestore';
import { Search, Book, Music, Film, AlertTriangle, CheckCircle, Info, BrainCircuit, History, Shield, Users } from 'lucide-react';

import { auth, db, isConfigValid } from './lib/firebase';
import { AnalysisResult, SearchRecord, ContentType } from './types';

// Constants
const APP_ID = 'bullying-analyzer-v1';

const BullyingAnalyzer = () => {
  // State Definitions
  const [query, setQuery] = useState('');
  const [contentType, setContentType] = useState<ContentType>('movie');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<AnalysisResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [recentSearches, setRecentSearches] = useState<SearchRecord[]>([]);

  // 1. Automatic Anonymous Auth
  useEffect(() => {
    if (!auth) return;

    const initAuth = async () => {
      try {
        await signInAnonymously(auth);
      } catch (err) {
        console.error("Kimlik doğrulama hatası:", err);
      }
    };
    initAuth();

    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
    });
    return () => unsubscribe();
  }, []);

  // 2. Listen for Recent Searches
  useEffect(() => {
    if (!user || !db) {
        // Fallback for demo mode without Firebase
        if (!isConfigValid) {
            const demoSearches: SearchRecord[] = [
                { id: '1', title: 'Örnek: Kurtlar Vadisi', riskScore: 85, riskLevel: 'Yüksek', type: 'movie' },
                { id: '2', title: 'Örnek: Küçük Prens', riskScore: 5, riskLevel: 'Düşük', type: 'book' }
            ];
            setRecentSearches(demoSearches);
        }
        return;
    }

    const searchesRef = collection(db, 'artifacts', APP_ID, 'public', 'data', 'searches');
    
    const unsubscribe = onSnapshot(searchesRef, (snapshot) => {
      const searches = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as SearchRecord[];
      
      // Sort in memory (Newest first) and slice top 5
      const sortedSearches = searches
        .sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0))
        .slice(0, 5);
        
      setRecentSearches(sortedSearches);
    }, (err) => {
      console.error("Veri çekme hatası:", err);
    });

    return () => unsubscribe();
  }, [user]);

  // ANALYSIS FUNCTION
  const analyzeContent = async () => {
    if (!query.trim()) return;
    if (!process.env.API_KEY) {
        setError("API Key eksik. Lütfen Vercel ortam değişkenlerini kontrol edin.");
        return;
    }

    setLoading(true);
    setError(null);
    setResult(null);

    try {
      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

      // 1. AI Analysis with Gemini SDK
      const prompt = `
        Sen Türkçe içerik analizinde uzmanlaşmış, kültürel hassasiyetleri bilen bir Yapay Zeka asistanısın.
        GÖREV: "${contentType}" türündeki "${query}" adlı eseri analiz et.
        
        ANALİZ KRİTERLERİ (TÜRK KÜLTÜRÜ ODAKLI):
        1. AÇIK ZORBALIK: Fiziksel şiddet, küfür.
        2. PSİKOLOJİK ZORBALIK: Aşağılama, "adam yerine koymama", dışlama.
        3. KÜLTÜREL BASKI: "El âlem ne der?", namus/erkeklik baskısı.
        
        ÇIKTI FORMATI (JSON):
        {
          "title": "Eser Adı",
          "summary": "Çok kısa özet.",
          "overall_risk_score": 0-100 (Sayı),
          "risk_level": "Düşük" | "Orta" | "Yüksek",
          "categories": [
            {"name": "Fiziksel Şiddet", "score": 0-100, "reason": "Sebep"},
            {"name": "Psikolojik Baskı", "score": 0-100, "reason": "Sebep"},
            {"name": "Kültürel Baskı", "score": 0-100, "reason": "Sebep"},
            {"name": "Dil & Argo", "score": 0-100, "reason": "Sebep"}
          ],
          "analysis_details": "Detaylı ebeveyn açıklaması.",
          "age_recommendation": "Yaş grubu (örn: 13+)",
          "positive_traits": ["Olumlu yön 1", "Olumlu yön 2"]
        }
      `;

      const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash-preview-09-2025',
        contents: [{ parts: [{ text: prompt }] }],
        config: {
            responseMimeType: "application/json"
        }
      });

      const textResponse = response.text;
      if (!textResponse) throw new Error("AI yanıtı boş döndü.");

      const parsedData: AnalysisResult = JSON.parse(textResponse);
      setResult(parsedData);

      // 2. Save result to Firestore (if configured)
      if (user && db) {
        await addDoc(collection(db, 'artifacts', APP_ID, 'public', 'data', 'searches'), {
          title: parsedData.title,
          riskScore: parsedData.overall_risk_score,
          riskLevel: parsedData.risk_level,
          type: contentType,
          createdAt: serverTimestamp(),
          summary: parsedData.summary
        });
      }

    } catch (err: any) {
      setError("Analiz sırasında bir hata oluştu veya içerik bulunamadı. Lütfen tekrar deneyin.");
      console.error("Analysis Error:", err);
    } finally {
      setLoading(false);
    }
  };

  // Helper Functions
  const getRiskColor = (score: number) => {
    if (score < 30) return 'bg-emerald-500';
    if (score < 60) return 'bg-amber-500';
    return 'bg-rose-600';
  };

  const getRiskTextColor = (score: number) => {
    if (score < 30) return 'text-emerald-700';
    if (score < 60) return 'text-amber-700';
    return 'text-rose-700';
  };

  return (
    <div className="min-h-screen bg-slate-50 font-sans text-slate-800 pb-12">
      {/* Header */}
      <header className="bg-gradient-to-r from-indigo-900 to-slate-900 text-white py-8 px-4 shadow-xl">
        <div className="max-w-5xl mx-auto">
          <div className="flex flex-col md:flex-row justify-between items-center gap-4">
            <div className="text-center md:text-left">
              <div className="flex items-center justify-center md:justify-start gap-3 mb-2">
                <Shield size={36} className="text-emerald-400" />
                <h1 className="text-3xl font-bold tracking-tight">Medya Zorbalık Analizi</h1>
              </div>
              <p className="text-indigo-200 text-sm md:text-base max-w-xl">
                Yapay zeka ile içeriklerdeki gizli zorbalığı, kültürel baskıyı ve şiddeti tespit edin.
              </p>
            </div>
            
            {/* User Status Badge */}
            <div className="bg-white/10 backdrop-blur-md px-4 py-2 rounded-full flex items-center gap-2 border border-white/20">
              <div className={`w-2 h-2 rounded-full ${user ? 'bg-emerald-400 animate-pulse' : isConfigValid ? 'bg-red-400' : 'bg-gray-400'}`}></div>
              <span className="text-xs font-medium text-indigo-100">
                {user ? 'Misafir Girişi Aktif' : isConfigValid ? 'Bağlanıyor...' : 'Demo Modu (DB Yok)'}
              </span>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 py-8 grid grid-cols-1 lg:grid-cols-3 gap-8">
        
        {/* LEFT COLUMN: Search & Results (2/3 Width) */}
        <div className="lg:col-span-2 space-y-6">
          
          {/* Search Box */}
          <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6">
            <div className="flex flex-col gap-4">
              <div className="relative">
                <input
                  type="text"
                  placeholder="İçerik adını girin (Örn: Harry Potter, Kurtlar Vadisi)..."
                  className="w-full pl-12 pr-4 py-4 rounded-xl border border-slate-200 bg-slate-50 focus:bg-white focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none text-lg transition-all"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && analyzeContent()}
                />
                <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" />
              </div>
              
              <div className="flex gap-2">
                {[
                  { id: 'movie', icon: Film, label: 'Dizi/Film' },
                  { id: 'book', icon: Book, label: 'Kitap' },
                  { id: 'song', icon: Music, label: 'Şarkı' }
                ].map((type) => (
                  <button
                    key={type.id}
                    onClick={() => setContentType(type.id as ContentType)}
                    className={`flex-1 flex items-center justify-center gap-2 py-3 rounded-xl transition-all border ${
                      contentType === type.id 
                        ? 'bg-indigo-50 border-indigo-200 text-indigo-700 shadow-sm' 
                        : 'bg-white border-slate-100 text-slate-500 hover:bg-slate-50'
                    }`}
                  >
                    <type.icon size={18} />
                    <span className="font-medium text-sm">{type.label}</span>
                  </button>
                ))}
              </div>

              <button
                onClick={analyzeContent}
                disabled={loading || !query.trim()}
                className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-4 rounded-xl transition-all shadow-lg shadow-indigo-200 flex justify-center items-center gap-3 disabled:opacity-50 disabled:shadow-none cursor-pointer"
              >
                {loading ? (
                  <>
                    <div className="animate-spin rounded-full h-5 w-5 border-2 border-white/30 border-t-white"></div>
                    Analiz Ediliyor...
                  </>
                ) : (
                  <>
                    <BrainCircuit size={20} />
                    Analizi Başlat
                  </>
                )}
              </button>
            </div>
          </div>

          {/* Error Message */}
          {error && (
            <div className="bg-rose-50 border border-rose-100 p-4 rounded-xl flex items-center gap-3 text-rose-700 animate-fade-in">
              <AlertTriangle className="shrink-0" />
              <p>{error}</p>
            </div>
          )}

          {/* Analysis Results */}
          {result && !loading && (
            <div className="space-y-6 animate-fade-in">
              
              {/* Summary Card */}
              <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
                <div className="p-6 md:p-8 flex flex-col md:flex-row gap-6 items-start">
                  <div className="flex-1">
                    <div className="flex items-center gap-3 mb-2">
                      <span className="px-3 py-1 bg-slate-100 text-slate-600 text-xs font-bold uppercase tracking-wider rounded-lg">
                        {contentType === 'movie' ? 'Dizi/Film' : contentType === 'book' ? 'Kitap' : 'Şarkı'}
                      </span>
                      <span className="text-slate-400 text-sm">AI Analiz Raporu</span>
                    </div>
                    <h2 className="text-3xl font-bold text-slate-900 mb-2">{result.title}</h2>
                    <p className="text-slate-600 leading-relaxed">{result.summary}</p>
                    
                    <div className="mt-4 flex items-center gap-2">
                      <span className="text-sm font-semibold text-slate-500">Önerilen Yaş:</span>
                      <span className="px-3 py-1 bg-indigo-50 text-indigo-700 rounded-md font-bold text-sm border border-indigo-100">
                        {result.age_recommendation}
                      </span>
                    </div>
                  </div>

                  <div className="flex flex-col items-center p-4 bg-slate-50 rounded-xl border border-slate-100 min-w-[140px]">
                    <span className="text-slate-500 text-xs font-bold uppercase mb-1">Risk Skoru</span>
                    <div className={`text-5xl font-black ${getRiskTextColor(result.overall_risk_score)}`}>
                      %{result.overall_risk_score}
                    </div>
                    <span className={`mt-2 px-3 py-1 rounded-full text-xs font-bold ${
                      result.overall_risk_score < 30 ? 'bg-emerald-100 text-emerald-800' :
                      result.overall_risk_score < 60 ? 'bg-amber-100 text-amber-800' :
                      'bg-rose-100 text-rose-800'
                    }`}>
                      {result.risk_level}
                    </span>
                  </div>
                </div>
              </div>

              {/* Detailed Description */}
              <div className="bg-gradient-to-br from-indigo-50 to-white p-6 rounded-2xl border border-indigo-100 shadow-sm">
                <div className="flex gap-4">
                  <Info className="text-indigo-600 shrink-0 mt-1" />
                  <div>
                    <h3 className="font-bold text-indigo-900 mb-2">Ebeveyn Notu</h3>
                    <p className="text-indigo-800/80 leading-relaxed text-sm md:text-base">
                      {result.analysis_details}
                    </p>
                  </div>
                </div>
              </div>

              {/* Risk Categories */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {result.categories.map((cat, idx) => (
                  <div key={idx} className="bg-white p-5 rounded-xl border border-slate-100 shadow-sm hover:border-indigo-100 transition-colors">
                    <div className="flex justify-between items-center mb-2">
                      <h4 className="font-semibold text-slate-700">{cat.name}</h4>
                      <span className={`text-sm font-bold ${getRiskTextColor(cat.score)}`}>%{cat.score}</span>
                    </div>
                    <div className="w-full bg-slate-100 rounded-full h-2 mb-3 overflow-hidden">
                      <div 
                        className={`h-full rounded-full transition-all duration-1000 ${getRiskColor(cat.score)}`} 
                        style={{ width: `${cat.score}%` }}
                      ></div>
                    </div>
                    <p className="text-xs text-slate-500">{cat.reason}</p>
                  </div>
                ))}
              </div>

              {/* Positive Traits */}
              {result.positive_traits?.length > 0 && (
                <div className="bg-emerald-50/50 p-6 rounded-2xl border border-emerald-100/50">
                  <div className="flex items-center gap-2 mb-3">
                    <CheckCircle className="text-emerald-600" size={20} />
                    <h3 className="font-bold text-emerald-900">Pozitif Temalar</h3>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {result.positive_traits.map((trait, idx) => (
                      <span key={idx} className="bg-white border border-emerald-200 text-emerald-700 px-3 py-1.5 rounded-lg text-sm font-medium shadow-sm">
                        {trait}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* RIGHT COLUMN: Recent Searches */}
        <div className="lg:col-span-1">
          <div className="sticky top-8 space-y-4">
            <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-5">
              <div className="flex items-center gap-2 mb-4 pb-4 border-b border-slate-100">
                <History className="text-indigo-500" size={20} />
                <h3 className="font-bold text-slate-800">Toplulukta Son Aramalar</h3>
              </div>
              
              {!user && isConfigValid ? (
                <div className="text-center py-8 text-slate-400 text-sm">
                  Bağlanıyor...
                </div>
              ) : recentSearches.length === 0 ? (
                <div className="text-center py-8 text-slate-400 text-sm">
                  Henüz arama yapılmadı. İlk keşfi sen yap!
                </div>
              ) : (
                <div className="space-y-3">
                  {recentSearches.map((item) => (
                    <div key={item.id || Math.random()} className="group p-3 hover:bg-slate-50 rounded-xl transition-colors border border-transparent hover:border-slate-100 cursor-default">
                      <div className="flex justify-between items-start mb-1">
                        <span className="font-medium text-slate-700 text-sm line-clamp-1">{item.title}</span>
                        <span className={`text-xs font-bold px-2 py-0.5 rounded ${
                          (item.riskScore || 0) < 30 ? 'bg-emerald-100 text-emerald-700' :
                          (item.riskScore || 0) < 60 ? 'bg-amber-100 text-amber-700' :
                          'bg-rose-100 text-rose-700'
                        }`}>
                          %{item.riskScore}
                        </span>
                      </div>
                      <div className="flex justify-between items-end">
                        <span className="text-xs text-slate-400 capitalize">
                          {item.type === 'movie' ? 'Dizi/Film' : item.type === 'book' ? 'Kitap' : 'Şarkı'}
                        </span>
                        <span className="text-[10px] text-slate-300 group-hover:text-slate-400 transition-colors">
                          {item.riskLevel}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
              
              <div className="mt-4 pt-4 border-t border-slate-100">
                <div className="flex items-center gap-2 text-xs text-slate-400 justify-center">
                  <Users size={14} />
                  <span>Veriler anonim olarak paylaşılmaktadır.</span>
                </div>
              </div>
            </div>
            
            {/* Info Card */}
            <div className="bg-indigo-900 text-indigo-100 p-5 rounded-2xl text-sm leading-relaxed opacity-90">
              <p>
                <strong>Biliyor muydunuz?</strong><br/>
                Türk kültüründe "mahalle baskısı" ve "el âlem ne der" gibi kavramlar, fiziksel şiddet kadar yaygın bir psikolojik zorbalık türüdür. Bu yapay zeka bu nüansları algılayacak şekilde eğitilmiştir.
              </p>
            </div>
          </div>
        </div>

      </main>
    </div>
  );
};

export default BullyingAnalyzer;