/**
 * The one place a block name appears.
 *
 * Everything else in `src/ui/acf/` reads the shape of ACF's rendered markup, so
 * it works on any block the site registers. Three things cannot be inferred from
 * shape, and only those live here:
 *
 *   - the summary line's wording and ordering
 *   - which control renders as a glyph rather than its label
 *   - what a style switch keeps and what it orphans
 *
 * A block with no profile keeps the fully generic treatment.
 */

/**
 * Cards Collection's three card styles.
 *
 * `fields` lists the sub-fields each style actually reaches, taken from the
 * conditional logic in `group_64a57f86baa8d.json`. The confirm strip diffs two
 * of these lists to say what carries and what clears.
 *
 * Names follow the field group, not the prototype: the third style is Enhanced.
 */
const CARD_STYLES = {
	minimalist: {
		name: 'Minimalist',
		fields: [ 'card_image', 'card_title', 'card_subtitle', 'card_content', 'card_button' ],
	},
	icon: {
		name: 'Icon',
		fields: [ 'card_icon', 'card_color', 'card_title', 'card_content', 'card_button' ],
	},
	enhanced: {
		name: 'Enhanced',
		fields: [ 'card_image', 'card_title', 'card_subtitle', 'card_content_enhanced', 'card_link', 'read_more_text' ],
	},
};

/**
 * What an editor calls each sub-field.
 *
 * The diff runs on these labels rather than on field names, because an editor
 * thinks "the content survives", not "card_content_enhanced was orphaned and
 * card_content took over".
 */
const CARD_FIELD_LABELS = {
	card_image: 'the image',
	card_icon: 'the icon',
	card_color: 'the color',
	card_title: 'title',
	card_subtitle: 'subtitle',
	card_content: 'content',
	card_content_enhanced: 'content',
	card_button: 'link',
	card_link: 'link',
	read_more_text: 'read more text',
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

/** "a, b, and c" — the summary and confirm strip both read as prose. */
export function joinList( items ) {
	const list = items.filter( Boolean );
	if ( list.length < 2 ) return list.join( '' );
	if ( list.length === 2 ) return `${ list[ 0 ] } and ${ list[ 1 ] }`;
	return `${ list.slice( 0, -1 ).join( ', ' ) }, and ${ list[ list.length - 1 ] }`;
}

function labelsFor( style ) {
	const seen = [];
	( CARD_STYLES[ style ]?.fields || [] ).forEach( ( name ) => {
		const label = CARD_FIELD_LABELS[ name ];
		if ( label && ! seen.includes( label ) ) seen.push( label );
	} );
	return seen;
}

/**
 * What switching card style costs, in the editor's own words.
 *
 * ACF's conditional logic hides orphaned fields rather than clearing them, so a
 * switch that is never explained leaves invisible rows in postmeta permanently.
 *
 * @param {string} from  Current style value.
 * @param {string} to    Style being switched to.
 * @param {number} count How many cards the change touches.
 * @return {string} A sentence, or '' when nothing is lost.
 */
export function cardStyleImpact( from, to, count ) {
	const current = labelsFor( from );
	const next = labelsFor( to );
	if ( ! current.length || ! next.length ) return '';

	const keeps = current.filter( ( label ) => next.includes( label ) );
	const clears = current.filter( ( label ) => ! next.includes( label ) );
	if ( ! clears.length ) return '';

	const cards = count === 1 ? '1 card' : `${ count } cards`;
	const kept = keeps.length ? `Keeps ${ joinList( keeps ) }. ` : '';
	return `${ kept }Clears ${ joinList( clears ) } on ${ cards }.`;
}

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
		/*
		 * Card style stays ACF's select. Switching it is destructive, so the select
		 * is guarded rather than replaced.
		 */
		styleSwitch: { field: 'card_style', styles: CARD_STYLES, rows: 'cards', impact: cardStyleImpact },
		budgets: { card_content: 220, card_content_enhanced: 220 },
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
