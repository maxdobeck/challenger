<script lang="ts" generics="T extends { id: string | number; name: string }">
	import Fuse from 'fuse.js';

	let {
		items,
		name,
		placeholder = 'Search…',
		required = false
	}: { items: T[]; name: string; placeholder?: string; required?: boolean } = $props();

	let query = $state('');
	let selectedId = $state<T['id'] | null>(null);
	let open = $state(false);
	let activeIndex = $state(0);

	const fuse = $derived(new Fuse(items, { keys: ['name'], threshold: 0.4 }));
	const results = $derived(query.trim() ? fuse.search(query).map((r) => r.item) : items);

	function select(item: T) {
		selectedId = item.id;
		query = item.name;
		open = false;
	}

	function onInput() {
		// Typing invalidates any prior selection until they pick again.
		selectedId = null;
		open = true;
		activeIndex = 0;
	}

	function onKeydown(event: KeyboardEvent) {
		if (!open && (event.key === 'ArrowDown' || event.key === 'ArrowUp')) {
			open = true;
			return;
		}
		if (event.key === 'ArrowDown') {
			event.preventDefault();
			activeIndex = Math.min(activeIndex + 1, results.length - 1);
		} else if (event.key === 'ArrowUp') {
			event.preventDefault();
			activeIndex = Math.max(activeIndex - 1, 0);
		} else if (event.key === 'Enter' && open && results[activeIndex]) {
			event.preventDefault();
			select(results[activeIndex]);
		} else if (event.key === 'Escape') {
			open = false;
		}
	}

	// Close the dropdown when a click lands outside this component.
	function closeOnOutsideClick(node: HTMLElement) {
		function onDocClick(event: MouseEvent) {
			if (!node.contains(event.target as Node)) {
				open = false;
			}
		}
		document.addEventListener('click', onDocClick);
		return () => document.removeEventListener('click', onDocClick);
	}
</script>

<div class="combobox" {@attach closeOnOutsideClick}>
	<input type="hidden" {name} value={selectedId ?? ''} {required} />
	<input
		type="text"
		class="combobox-input"
		role="combobox"
		aria-expanded={open}
		aria-controls="{name}-listbox"
		autocomplete="off"
		{placeholder}
		bind:value={query}
		oninput={onInput}
		onfocus={() => (open = true)}
		onkeydown={onKeydown}
	/>
	{#if open && results.length > 0}
		<ul class="combobox-list" id="{name}-listbox" role="listbox">
			{#each results as item, i (item.id)}
				<li role="option" aria-selected={selectedId === item.id}>
					<button
						type="button"
						class="combobox-option {i === activeIndex ? 'active' : ''}"
						onclick={() => select(item)}
						onmouseenter={() => (activeIndex = i)}
					>
						{item.name}
					</button>
				</li>
			{/each}
		</ul>
	{:else if open && query.trim()}
		<ul class="combobox-list" id="{name}-listbox" role="listbox">
			<li class="combobox-empty muted">No matches</li>
		</ul>
	{/if}
</div>
