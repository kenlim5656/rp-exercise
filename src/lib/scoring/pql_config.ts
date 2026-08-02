export interface PQLScoringConfig {
  thresholds: {
    pql_user_min: number;
    aql_account_min: number;
  };
  weights: {
    firmographic: {
      employee_count_gt_100: number;
      target_industry: number;
      target_role: number;
      funding_stage_b_plus: number;
    };
    usage: {
      api_key_created: number;
      resource_deployed: number;
      active_seats_gte_3: number;
      quota_threshold_80_pct: number;
      sso_initiated: number;
      prod_deployment: number;
      compute_hours_gt_100: number;
    };
  };
  time_decay_half_life_days: number;
}

export const DEFAULT_PQL_CONFIG: PQLScoringConfig = {
  thresholds: {
    pql_user_min: 50,
    aql_account_min: 80,
  },
  weights: {
    firmographic: {
      employee_count_gt_100: 10,
      target_industry: 8,
      target_role: 12,
      funding_stage_b_plus: 6,
    },
    usage: {
      api_key_created: 5,
      resource_deployed: 15,
      active_seats_gte_3: 12,
      quota_threshold_80_pct: 18,
      sso_initiated: 10,
      prod_deployment: 15,
      compute_hours_gt_100: 10,
    },
  },
  time_decay_half_life_days: 14,
};

export function getConfig(): PQLScoringConfig {
  return DEFAULT_PQL_CONFIG;
}

export function applyTimeDecay(score: number, daysSinceEvent: number, halfLifeDays: number): number {
  return score * Math.pow(0.5, daysSinceEvent / halfLifeDays);
}
