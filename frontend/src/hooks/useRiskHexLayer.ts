import { useMemo } from 'react';
import { H3HexagonLayer } from '@deck.gl/geo-layers';
import type { RiskHexCell } from '../types/RiskMap.types';

function hexToRgb(hexColor: string): [number, number, number] {
	const cleaned = hexColor.replace('#', '');
	if (!/^[0-9a-fA-F]{6}$/.test(cleaned)) {
		return [255, 59, 48];
	}

	return [
		Number.parseInt(cleaned.slice(0, 2), 16),
		Number.parseInt(cleaned.slice(2, 4), 16),
		Number.parseInt(cleaned.slice(4, 6), 16)
	];
}

interface UseRiskHexLayerProps {
	riskCells: RiskHexCell[];
	visible?: boolean;
}

export function useRiskHexLayer({ riskCells, visible = true }: UseRiskHexLayerProps) {
	return useMemo(() => {
		if (!visible || riskCells.length === 0) {
			return null;
		}

		return new H3HexagonLayer<RiskHexCell>({
			id: 'risk-h3-layer',
			data: riskCells,
			pickable: true,
			filled: true,
			extruded: true,
			wireframe: false,
			opacity: 0.7,
			coverage: 0.9,
			getHexagon: (d: RiskHexCell) => d.hex,
			getFillColor: (d: RiskHexCell) => [...hexToRgb(d.color), 210],
			getElevation: (d: RiskHexCell) => Math.pow(d.risk, 1.8) * 2200,
			elevationScale: 1,
			material: {
				ambient: 0.3,
				diffuse: 0.7,
				shininess: 8,
				specularColor: [30, 30, 30]
			},
			updateTriggers: {
				getFillColor: riskCells,
				getElevation: riskCells
			}
		});
	}, [riskCells, visible]);
}
