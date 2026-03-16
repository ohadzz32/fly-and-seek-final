export interface RiskMapDetails {
  aircraft_count?: number;
  avg_alt?: number;
  [key: string]: number | string | undefined;
}

export interface RiskHexCell {
  hex: string;
  risk: number;
  label: string;
  color: string;
  details: RiskMapDetails;
}
