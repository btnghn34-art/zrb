export interface RiskCategory {
  name: string;
  score: number;
  reason: string;
}

export interface AnalysisResult {
  title: string;
  summary: string;
  overall_risk_score: number;
  risk_level: 'Düşük' | 'Orta' | 'Yüksek';
  categories: RiskCategory[];
  analysis_details: string;
  age_recommendation: string;
  positive_traits: string[];
}

export interface SearchRecord extends Partial<AnalysisResult> {
  id?: string;
  riskScore: number;
  riskLevel: string;
  type: string;
  createdAt?: any;
}

export type ContentType = 'movie' | 'book' | 'song';
