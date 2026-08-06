<script lang="ts" generics="T">
	import { untrack, type Snippet } from 'svelte';

	type Column<T> = {
		key: string;
		label: string;
		sortValue: (row: T) => string | number;
	};

	let {
		columns,
		rows,
		rowKey,
		rowClass,
		showRank = false,
		defaultSortKey,
		defaultSortDirection = 'desc',
		cell
	}: {
		columns: Column<T>[];
		rows: T[];
		rowKey: (row: T, index: number) => string | number;
		rowClass?: (row: T, index: number) => string;
		showRank?: boolean;
		defaultSortKey?: string;
		defaultSortDirection?: 'asc' | 'desc';
		cell: Snippet<[T, Column<T>]>;
	} = $props();

	let sortKey = $state(untrack(() => defaultSortKey ?? columns[0]?.key ?? ''));
	let sortDirection = $state<'asc' | 'desc'>(untrack(() => defaultSortDirection));

	function toggleSort(key: string) {
		if (sortKey === key) {
			sortDirection = sortDirection === 'asc' ? 'desc' : 'asc';
		} else {
			sortKey = key;
			sortDirection = 'desc';
		}
	}

	let sortedRows = $derived.by(() => {
		const col = columns.find((c) => c.key === sortKey);
		if (!col) return rows;
		const dir = sortDirection === 'asc' ? 1 : -1;
		return [...rows].sort((a, b) => {
			const av = col.sortValue(a);
			const bv = col.sortValue(b);
			if (av < bv) return -1 * dir;
			if (av > bv) return 1 * dir;
			return 0;
		});
	});
</script>

<table class="sortable-table">
	<thead>
		<tr>
			{#if showRank}
				<th>Rank</th>
			{/if}
			{#each columns as col (col.key)}
				<th>
					<button type="button" class="sort-button" onclick={() => toggleSort(col.key)}>
						{col.label}
						<span class="sort-indicator"
							>{sortKey === col.key ? (sortDirection === 'asc' ? '▲' : '▼') : ''}</span
						>
					</button>
				</th>
			{/each}
		</tr>
	</thead>
	<tbody>
		{#each sortedRows as row, i (rowKey(row, i))}
			<tr class={rowClass ? rowClass(row, i) : ''}>
				{#if showRank}
					<td>{i + 1}</td>
				{/if}
				{#each columns as col (col.key)}
					<td>{@render cell(row, col)}</td>
				{/each}
			</tr>
		{/each}
	</tbody>
</table>
