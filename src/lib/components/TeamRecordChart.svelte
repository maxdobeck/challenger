<script lang="ts">
	import { scaleOrdinal } from 'd3-scale';
	import { LineChart, Points, Spline } from 'layerchart';

	type ChartPoint = {
		playedAt: Date;
		result: 'win' | 'loss' | 'draw';
		cumulativeNet: number;
	};

	let { data }: { data: ChartPoint[] } = $props();

	// Ordinal color scale so each match's marker is colored by its own
	// result rather than the trend line's single accent color.
	const resultColor = scaleOrdinal<string, string>()
		.domain(['win', 'loss', 'draw'])
		.range(['var(--color-win)', 'var(--color-loss)', 'var(--color-draw)']);
</script>

<div class="team-record-chart">
	<LineChart
		{data}
		x="playedAt"
		y="cumulativeNet"
		c="result"
		cScale={resultColor}
		height={220}
		yBaseline={0}
	>
		{#snippet marks()}
			<Spline stroke="var(--color-accent)" strokeWidth={2} />
			<Points r={5} stroke="var(--color-bg)" strokeWidth={1.5} />
		{/snippet}
	</LineChart>

	<div class="chart-legend">
		<span class="chart-legend-item"><i style="background: var(--color-win)"></i>Win</span>
		<span class="chart-legend-item"><i style="background: var(--color-loss)"></i>Loss</span>
		<span class="chart-legend-item"><i style="background: var(--color-draw)"></i>Draw</span>
	</div>
</div>
