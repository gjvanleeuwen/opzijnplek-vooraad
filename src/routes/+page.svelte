<script lang="ts">
	import type { PageData } from './$types';
	import type { SyncRunRecord, SkuResult, SyncWarning } from '$lib/types';
	import type { PreviewResult } from '$lib/server/sync';

	let { data }: { data: PageData } = $props();

	let runs = $state(data.runs);
	let warnings = $state(data.warnings);
	let syncing = $state(false);
	let previewing = $state(false);
	let preview = $state<PreviewResult | null>(null);
	let previewSku = $state('');
	let expandedRunId = $state<number | null>(null);
	let error = $state('');

	async function triggerSync() {
		syncing = true;
		error = '';
		try {
			const res = await fetch('/api/sync', { method: 'POST' });
			if (!res.ok) {
				const body = await res.json();
				error = body.error || `Sync failed (${res.status})`;
			}
			await Promise.all([refreshRuns(), refreshWarnings()]);
		} catch (e) {
			error = e instanceof Error ? e.message : String(e);
		} finally {
			syncing = false;
		}
	}

	async function loadPreview() {
		previewing = true;
		error = '';
		try {
			const params = previewSku ? `?sku=${encodeURIComponent(previewSku)}` : '';
			const res = await fetch(`/api/sync/preview${params}`);
			if (!res.ok) {
				const body = await res.json();
				error = body.error || `Preview failed (${res.status})`;
				return;
			}
			preview = await res.json();
		} catch (e) {
			error = e instanceof Error ? e.message : String(e);
		} finally {
			previewing = false;
		}
	}

	async function refreshRuns() {
		const res = await fetch('/api/sync/runs');
		if (res.ok) runs = await res.json();
	}

	async function refreshWarnings() {
		const res = await fetch('/api/sync/warnings');
		if (res.ok) warnings = await res.json();
	}

	async function acknowledgeWarning(id: number) {
		await fetch(`/api/sync/warnings/${id}`, { method: 'POST' });
		await refreshWarnings();
	}

	function toggleRun(id: number) {
		expandedRunId = expandedRunId === id ? null : id;
	}

	function statusColor(status: string): string {
		switch (status) {
			case 'success': return 'bg-green-100 text-green-800';
			case 'partial': return 'bg-yellow-100 text-yellow-800';
			case 'failed': return 'bg-red-100 text-red-800';
			case 'running': return 'bg-blue-100 text-blue-800';
			default: return 'bg-gray-100 text-gray-800';
		}
	}

	function skuStatusColor(status: string): string {
		switch (status) {
			case 'updated': return 'text-green-700';
			case 'skipped': return 'text-yellow-700';
			case 'failed': return 'text-red-700';
			default: return 'text-gray-700';
		}
	}

	function warningTypeColor(type: string): string {
		switch (type) {
			case 'stock_mismatch': return 'bg-red-100 text-red-800';
			case 'negative_stock': return 'bg-orange-100 text-orange-800';
			case 'zero_stock': return 'bg-yellow-100 text-yellow-800';
			case 'verification_failed': return 'bg-red-100 text-red-800';
			default: return 'bg-gray-100 text-gray-800';
		}
	}

	function formatTime(iso: string | null): string {
		if (!iso) return '—';
		return new Date(iso).toLocaleString('nl-NL', {
			day: '2-digit', month: '2-digit', year: 'numeric',
			hour: '2-digit', minute: '2-digit', second: '2-digit'
		});
	}

	function duration(start: string, end: string | null): string {
		if (!end) return '...';
		const ms = new Date(end).getTime() - new Date(start).getTime();
		if (ms < 1000) return `${ms}ms`;
		return `${(ms / 1000).toFixed(1)}s`;
	}
</script>

<div class="min-h-screen bg-gray-50 p-6">
	<div class="mx-auto max-w-5xl">
		<!-- Header -->
		<div class="mb-8 flex items-center justify-between">
			<div>
				<h1 class="text-2xl font-bold text-gray-900">OpZijnPlek</h1>
				<p class="text-sm text-gray-500">Lightspeed R-Series → eCom inventory sync</p>
			</div>
			{#if runs.length > 0}
				{@const last = runs[0]}
				<div class="text-right text-sm">
					<span class="inline-block rounded px-2 py-0.5 text-xs font-medium {statusColor(last.status)}">
						{last.status}
					</span>
					{#if last.verification}
						<span class="ml-1 inline-block rounded px-2 py-0.5 text-xs font-medium {last.verification.mismatches > 0 ? 'bg-red-100 text-red-800' : 'bg-green-100 text-green-800'}">
							{last.verification.mismatches > 0 ? `${last.verification.mismatches} mismatches` : 'verified'}
						</span>
					{/if}
					<div class="mt-1 text-gray-500">{formatTime(last.finishedAt)}</div>
				</div>
			{/if}
		</div>

		<!-- Error banner -->
		{#if error}
			<div class="mb-4 rounded border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
				{error}
			</div>
		{/if}

		<!-- Warnings banner -->
		{#if warnings.length > 0}
			<div class="mb-6 rounded-lg border border-orange-200 bg-orange-50 p-4">
				<div class="mb-2 flex items-center justify-between">
					<h2 class="font-semibold text-orange-900">Warnings ({warnings.length})</h2>
				</div>
				<div class="space-y-2">
					{#each warnings as warning}
						<div class="flex items-start justify-between rounded border border-orange-100 bg-white p-2 text-sm">
							<div>
								<span class="rounded px-1.5 py-0.5 text-xs font-medium {warningTypeColor(warning.type)}">
									{warning.type.replace('_', ' ')}
								</span>
								<span class="ml-2 font-mono text-xs">{warning.sku}</span>
								<span class="ml-2 text-gray-600">{warning.message}</span>
								{#if warning.expected !== null && warning.actual !== null}
									<span class="ml-2 text-xs text-gray-400">
										(expected: {warning.expected}, actual: {warning.actual})
									</span>
								{/if}
							</div>
							<button
								onclick={() => acknowledgeWarning(warning.id)}
								class="ml-2 shrink-0 text-xs text-orange-600 hover:underline"
							>
								dismiss
							</button>
						</div>
					{/each}
				</div>
			</div>
		{/if}

		<!-- Actions -->
		<div class="mb-6 flex flex-wrap items-end gap-4">
			<button
				onclick={triggerSync}
				disabled={syncing}
				class="rounded bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
			>
				{syncing ? 'Syncing...' : 'Run sync now'}
			</button>

			<div class="flex items-end gap-2">
				<div>
					<label for="previewSku" class="block text-xs text-gray-500">Filter SKU (optional)</label>
					<input
						id="previewSku"
						type="text"
						bind:value={previewSku}
						placeholder="e.g. ABC-123"
						class="mt-1 rounded border border-gray-300 px-3 py-2 text-sm"
					/>
				</div>
				<button
					onclick={loadPreview}
					disabled={previewing}
					class="rounded border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
				>
					{previewing ? 'Loading...' : 'Preview changes'}
				</button>
			</div>
		</div>

		<!-- Preview panel -->
		{#if preview}
			<div class="mb-6 rounded-lg border border-blue-200 bg-blue-50 p-4">
				<div class="mb-3 flex items-center justify-between">
					<h2 class="font-semibold text-blue-900">Preview (dry run)</h2>
					<button onclick={() => preview = null} class="text-sm text-blue-600 hover:underline">Close</button>
				</div>
				<div class="mb-3 flex gap-4 text-sm text-blue-800">
					<span>Logs found: {preview.logsFound}</span>
					<span>Sale logs: {preview.saleLogsFound}</span>
					<span>Changes: {preview.changes.length}</span>
					<span>Watermark: {preview.watermarkBefore} → {preview.wouldAdvanceTo}</span>
				</div>

				{#if preview.changes.length > 0}
					<table class="w-full text-sm">
						<thead>
							<tr class="text-left text-xs text-blue-700">
								<th class="pb-1">SKU</th>
								<th class="pb-1">Variant ID</th>
								<th class="pb-1">Current</th>
								<th class="pb-1">Delta</th>
								<th class="pb-1">New</th>
								<th class="pb-1">Status</th>
							</tr>
						</thead>
						<tbody>
							{#each preview.changes as change}
								<tr class="border-t border-blue-100">
									<td class="py-1 font-mono text-xs">{change.sku}</td>
									<td class="py-1">{change.ecomVariantId ?? '—'}</td>
									<td class="py-1">{change.stockBefore ?? '—'}</td>
									<td class="py-1 {change.delta > 0 ? 'text-green-700' : 'text-red-700'}">
										{change.delta > 0 ? '+' : ''}{change.delta}
									</td>
									<td class="py-1">{change.stockAfter ?? '—'}</td>
									<td class="py-1 {skuStatusColor(change.status)}">{change.status}</td>
								</tr>
							{/each}
						</tbody>
					</table>
				{:else}
					<p class="text-sm text-blue-700">No pending changes.</p>
				{/if}
			</div>
		{/if}

		<!-- Runs table -->
		<div class="rounded-lg border border-gray-200 bg-white">
			<div class="border-b border-gray-200 px-4 py-3">
				<h2 class="font-semibold text-gray-900">Sync history</h2>
			</div>

			{#if runs.length === 0}
				<div class="px-4 py-8 text-center text-sm text-gray-500">No sync runs yet.</div>
			{:else}
				<table class="w-full text-sm">
					<thead>
						<tr class="border-b border-gray-100 text-left text-xs text-gray-500">
							<th class="px-4 py-2">Status</th>
							<th class="px-4 py-2">Verified</th>
							<th class="px-4 py-2">Trigger</th>
							<th class="px-4 py-2">Updated</th>
							<th class="px-4 py-2">Skipped</th>
							<th class="px-4 py-2">Failed</th>
							<th class="px-4 py-2">Duration</th>
							<th class="px-4 py-2">Time</th>
						</tr>
					</thead>
					<tbody>
						{#each runs as run}
							<tr
								class="cursor-pointer border-b border-gray-50 hover:bg-gray-50"
								onclick={() => toggleRun(run.id)}
							>
								<td class="px-4 py-2">
									<span class="rounded px-2 py-0.5 text-xs font-medium {statusColor(run.status)}">
										{run.status}
									</span>
								</td>
								<td class="px-4 py-2">
									{#if run.verification}
										{#if run.verification.mismatches > 0}
											<span class="rounded px-2 py-0.5 text-xs font-medium bg-red-100 text-red-800">
												{run.verification.mismatches} mismatches
											</span>
										{:else}
											<span class="rounded px-2 py-0.5 text-xs font-medium bg-green-100 text-green-800">
												{run.verification.verified} ok
											</span>
										{/if}
									{:else}
										<span class="text-xs text-gray-400">—</span>
									{/if}
								</td>
								<td class="px-4 py-2">{run.triggeredBy}</td>
								<td class="px-4 py-2 text-green-700">{run.skusUpdated}</td>
								<td class="px-4 py-2 text-yellow-700">{run.skusSkipped}</td>
								<td class="px-4 py-2 text-red-700">{run.skusFailed}</td>
								<td class="px-4 py-2">{duration(run.startedAt, run.finishedAt)}</td>
								<td class="px-4 py-2 text-gray-500">{formatTime(run.finishedAt)}</td>
							</tr>

							<!-- Expanded detail -->
							{#if expandedRunId === run.id}
								<tr>
									<td colspan="8" class="bg-gray-50 px-4 py-3">
										{#if run.error}
											<div class="mb-2 text-sm text-red-700">Error: {run.error}</div>
										{/if}

										<!-- Verification summary -->
										{#if run.verification && run.verification.warnings.length > 0}
											<div class="mb-3 rounded border border-orange-200 bg-orange-50 p-2">
												<p class="mb-1 text-xs font-semibold text-orange-800">Verification warnings:</p>
												{#each run.verification.warnings as w}
													<div class="text-xs text-orange-700">
														<span class="font-mono">{w.sku}</span> — {w.message}
													</div>
												{/each}
											</div>
										{/if}

										{#if run.log.length > 0}
											<table class="w-full text-xs">
												<thead>
													<tr class="text-left text-gray-500">
														<th class="pb-1">SKU</th>
														<th class="pb-1">Variant</th>
														<th class="pb-1">Before</th>
														<th class="pb-1">Delta</th>
														<th class="pb-1">After</th>
														<th class="pb-1">Status</th>
														<th class="pb-1">Error</th>
													</tr>
												</thead>
												<tbody>
													{#each run.log as result}
														<tr class="border-t border-gray-100">
															<td class="py-1 font-mono">{result.sku}</td>
															<td class="py-1">{result.ecomVariantId ?? '—'}</td>
															<td class="py-1">{result.stockBefore ?? '—'}</td>
															<td class="py-1 {result.delta > 0 ? 'text-green-700' : 'text-red-700'}">
																{result.delta > 0 ? '+' : ''}{result.delta}
															</td>
															<td class="py-1">{result.stockAfter ?? '—'}</td>
															<td class="py-1 {skuStatusColor(result.status)}">{result.status}</td>
															<td class="py-1 text-gray-500">{result.error ?? ''}</td>
														</tr>
													{/each}
												</tbody>
											</table>
										{:else}
											<p class="text-gray-500">No SKU details for this run.</p>
										{/if}
									</td>
								</tr>
							{/if}
						{/each}
					</tbody>
				</table>
			{/if}
		</div>
	</div>
</div>
