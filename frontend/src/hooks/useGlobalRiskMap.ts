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
				setLoading(true);
				setError(null);

				const response = await fetch('/map_data.json');
				if (!response.ok) {
					throw new Error('Failed to load risk map data');
				}

				const payload = await response.json();
				if (!Array.isArray(payload)) {
					throw new Error('map_data.json must be an array');
				}

				console.log('Loaded Data:', payload);

				if (active) {
					setRiskCells(payload as RiskHexCell[]);
				}
			} catch (err) {
				if (active) {
					setError(err instanceof Error ? err.message : 'Failed to load risk map');
					setRiskCells([]);
				}
			} finally {
				if (active) {
					setLoading(false);
				}
			}
		};

		load();

		return () => {
			active = false;
		};
	}, []);

	const stableRiskCells = useMemo(() => riskCells, [riskCells]);

	return {
		riskCells: stableRiskCells,
		loading,
		error
	};
}
