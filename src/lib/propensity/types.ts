export interface AccountPropensityRecord {
  accountId: string;
  domain: string;
  propensityScore: number;
  propensityPercentile: number;
  predictedAcv: number;
  nextLikelyPurchase: string;
  purchaseDrivers: string[];
  modelSource: string;
  modelVersion: string;
  lastUpdatedAt: string;
}

export interface PropensityDataProvider {
  getPropensityForAccount(accountId: string, domain: string): Promise<AccountPropensityRecord | null>;
  batchUpsertPropensityData(records: AccountPropensityRecord[]): Promise<{ ingested: number }>;
}
