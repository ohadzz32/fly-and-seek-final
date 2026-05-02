import { useEffect, useMemo, useState } from 'react';
import type { RiskHexCell } from '../types/RiskMap.types';

interface UseGlobalRiskMapReturn {
	riskCells: RiskHexCell[];
	loading: boolean;
	error: string | null;
}

export function useGlobalRiskMap(): UseGlobalRiskMapReturn {
	const [riskCells, setRiskCells] = useState<RiskHexCell[]>([]);
	const [loading, setLoading] = useState(false);
	const [error, setError] = useState<string | null>(null);

	useEffect(() => {
		let active = true;

		const load = async () => {
			try {
				setError(null);

				const response = await fetch('http://localhost:3001/api/risk/map');
				if (!response.ok) {
					throw new Error('Failed to load risk map data');
				}

				const payload = await response.json();
				if (!Array.isArray(payload)) {
					throw new Error('API response must be an array');
				}

				if (active) {
					setRiskCells(payload as RiskHexCell[]);
				}
			} catch (err) {
				if (active) {
					setError(err instanceof Error ? err.message : 'Failed to load risk map');
				}
			} finally {
				if (active) {
					setLoading(false);
				}
			}
		};

		setLoading(true);
		load();
		
		const intervalId = setInterval(load, 5000);

		return () => {
			active = false;
			clearInterval(intervalId);
		};
	}, []);

	const stableRiskCells = useMemo(() => riskCells, [riskCells]);

	return {
		riskCells: stableRiskCells,
		loading,
		error
	};
}

