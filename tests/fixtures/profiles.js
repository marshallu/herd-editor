/**
 * The profiles the Marshall site supplies, as a test fixture.
 *
 * These used to be shipped inside the plugin. They are a site's content model,
 * not Herd's, so they now arrive over `herd_editor_block_profiles` — which
 * means the tests below cover the *mechanism* against a realistic payload
 * rather than asserting a table the plugin no longer owns.
 */
export const PROFILES = {
	'acf/cards-collection': {
		/* "Meet the Marshall family · Minimalist · 4 cards, 3 per row" */
		summary: [
			'heading',
			{ field: 'card_style', labels: { minimalist: 'Minimalist', icon: 'Icon', enhanced: 'Enhanced' } },
			{ template: '{cards} {cards:card|cards}, {cards_per_row} per row', requires: 'cards' },
		],
		budgets: { card_content: 220, card_content_enhanced: 220 },
	},

	'acf/profiles': {
		choiceNotices: [ {
			field: 'background',
			value: 'black',
			title: 'Black is for the Cyber site',
			body: 'A black background on Profiles is only allowed on the Cyber site. Everywhere else, use White.',
		} ],
	},

	'acf/billboard': {
		summary: [
			'heading',
			/*
			 * A single `layout` field replaced the `background_image_layout` +
			 * `modern` pair. Both shapes are in the document until the data
			 * migration runs, and revisions keep the old one for good, so the
			 * first two entries read whichever is present — including the pair
			 * the old form could not reach, where `background_image_layout` off
			 * wins and the block renders as the grid.
			 */
			{ oneOf: [
				{ when: { layout: 'modern' }, value: 'Modern' },
				{ when: { background_image_layout: '1', modern: '1' }, value: 'Modern' },
				{ field: 'content_place', labels: { left: 'Left', right: 'Right', center: 'Centered' } },
			] },
			{ field: 'type_of_cta', labels: { buttons: 'Buttons', links: 'Links' } },
		],
	},
};

/** Publish the fixture the way herd_editor_enqueue_assets() does. */
export function installProfiles( profiles = PROFILES ) {
	if ( typeof globalThis.window === 'undefined' ) globalThis.window = {};
	globalThis.window.HerdEditor = { ...( globalThis.window.HerdEditor || {} ), profiles };
}
