/**
 * The one place a block name appears.
 *
 * Everything else in `src/ui/acf/` reads the shape of ACF's rendered markup, so
 * it works on any block the site registers. Four things cannot be inferred from
 * shape, and only those live here:
 *
 *   - the summary line's wording and ordering
 *   - which control renders as a glyph rather than its label
 *   - which choice carries a rule the field group does not record
 *
 * A block with no profile keeps the fully generic treatment.
 */

/**
 * Cards Collection's three card styles.
 *
 * Names follow the field group, not the prototype: the third style is Enhanced.
 */
const CARD_STYLES = {
	minimalist: {
		name: 'Minimalist',
	},
	icon: {
		name: 'Icon',
	},
	enhanced: {
		name: 'Enhanced',
	},
};

const BILLBOARD_PLACEMENT = { left: 'Left', right: 'Right', center: 'Centered' };
const BILLBOARD_CTA = { buttons: 'Buttons', links: 'Links' };
const BILLBOARD_LAYOUTS = [ 'grid', 'split', 'modern' ];

/**
 * Which of Billboard's three layouts a block is set to.
 *
 * A single `layout` field replaced the `background_image_layout` + `modern` pair.
 * Both shapes are in the document until the data migration runs, and revisions
 * keep the old one for good, so this reads whichever is present. The theme's
 * `herdpress_billboard_layout()` resolves the same mapping at render time and the
 * two must agree — including on the pair the old form could not reach, where
 * `background_image_layout` off wins and the block renders as the grid.
 *
 * @param {Object} data Raw block `data` attributes.
 * @return {string} `grid`, `split` or `modern`.
 */
export function billboardLayout( data = {} ) {
	if ( BILLBOARD_LAYOUTS.includes( data.layout ) ) return data.layout;
	if ( data.background_image_layout !== '1' ) return 'grid';
	return data.modern === '1' ? 'modern' : 'split';
}


/**
 * A choice the field group offers everywhere that only one site may use.
 *
 * Profiles' `background` offers White and Black on every site, but Black belongs
 * to Cyber. Nothing in `group_65fc55754b1a6.json` says so, so the rule lived
 * only in whoever remembered it. This says it at the moment it is broken.
 *
 * The notice warns and nothing more. Herd is not told which site it is running
 * on, and a guardrail that guessed wrong would take Black away from the one site
 * entitled to it.
 */
const PROFILES_BACKGROUND = {
	field: 'background',
	value: 'black',
	title: 'Black is for the Cyber site',
	body: 'A black background on Profiles is only allowed on the Cyber site. Everywhere else, use White.',
};

export const PROFILES = {
	'acf/cards-collection': {
		/**
		 * "Meet the Marshall family · Minimalist · 4 cards, 3 per row"
		 *
		 * The most identifying field, then the configuration that changes how it
		 * looks. "Cards collection" twice tells an editor nothing.
		 */
		summary: ( data ) => {
			const count = Number( data.cards ) || 0;
			return [
				data.heading,
				CARD_STYLES[ data.card_style ]?.name,
				count && `${ count } ${ count === 1 ? 'card' : 'cards' }, ${ data.cards_per_row } per row`,
			];
		},
		budgets: { card_content: 220, card_content_enhanced: 220 },
	},

	'acf/profiles': {
		choiceNotices: [ PROFILES_BACKGROUND ],
	},

	'acf/billboard': {
		summary: ( data ) => [
			data.heading,
			billboardLayout( data ) === 'modern' ? 'Modern' : BILLBOARD_PLACEMENT[ data.content_place ],
			BILLBOARD_CTA[ data.type_of_cta ],
		],
	},
};

export function profileFor( blockName ) {
	return PROFILES[ blockName ] || null;
}
