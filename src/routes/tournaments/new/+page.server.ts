import { fail, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { db } from '$lib/server/db';
import { tournament } from '$lib/server/db/schema';

export const load: PageServerLoad = (event) => {
	if (!event.locals.user) {
		return redirect(302, '/login');
	}
	return {};
};

export const actions: Actions = {
	create: async (event) => {
		const currentUser = event.locals.user;
		if (!currentUser) {
			return redirect(302, '/login');
		}

		const formData = await event.request.formData();
		const name = formData.get('name')?.toString().trim();
		const startDate = formData.get('startDate')?.toString();
		const endDate = formData.get('endDate')?.toString();
		const location = formData.get('location')?.toString().trim();
		const address = formData.get('address')?.toString().trim() || null;
		const details = formData.get('details')?.toString().trim() || null;

		if (!name || !startDate || !endDate || !location) {
			return fail(400, { message: 'Name, both dates, and location are required.' });
		}
		if (endDate < startDate) {
			return fail(400, { message: 'End date cannot be before the start date.' });
		}

		await db.insert(tournament).values({
			name,
			startDate,
			endDate,
			location,
			address,
			details,
			createdById: currentUser.id
		});

		return redirect(303, '/tournaments');
	}
};
