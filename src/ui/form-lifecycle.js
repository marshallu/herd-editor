/** Bounded lifecycle for expensive, server-rendered ACF forms. */

export const WARM_FORM_LIMIT = 8;

function isBusyForm( bridge ) {
	const form = bridge?.form;
	if ( ! form ) return false;
	return !!form.querySelector( ':focus, .acf-is-active, .media-modal, .acf-error, .acf-field.-error' ) ||
		!!globalThis.window?.wp?.media?.frame?.is?.( 'open' );
}

/**
 * Keeps opened forms warm, evicting least-recently-used safe inactive forms.
 * The UI owns whether a retained id is rendered; this class owns the policy.
 */
export class FormLifecycle {
	constructor( { limit = WARM_FORM_LIMIT, diagnostic = () => {} } = {} ) {
		this.limit = limit;
		this.diagnostic = diagnostic;
		this.forms = new Map();
		this.evictions = 0;
		this.reloads = 0;
	}
	register( id, bridge, { open = false, validation = false } = {} ) {
		const previous = this.forms.get( id );
		if ( previous?.bridge !== bridge ) this.reloads += previous ? 1 : 0;
		this.forms.set( id, { bridge, open, validation, touched: performance.now(), mounted: performance.now() } );
		this.report( 'mount', id );
		return this.enforce();
	}
	unregister( id, bridge ) {
		if ( this.forms.get( id )?.bridge === bridge ) this.forms.delete( id );
	}
	update( id, changes ) {
		const record = this.forms.get( id );
		if ( ! record ) return [];
		Object.assign( record, changes, { touched: performance.now() } );
		return this.enforce();
	}
	pinned( record ) { return record.open || record.validation || isBusyForm( record.bridge ); }
	enforce() {
		const inactive = [ ...this.forms.entries() ].filter( ( [ , record ] ) => !this.pinned( record ) );
		const evicted = [];
		while ( this.forms.size > this.limit && inactive.length ) {
			inactive.sort( ( a, b ) => a[ 1 ].touched - b[ 1 ].touched );
			const [ id, record ] = inactive.shift();
			record.bridge.flush();
			this.forms.delete( id );
			evicted.push( id ); this.evictions++;
			this.report( 'evict', id, record );
		}
		return evicted;
	}
	collapseInactive() {
		const ids = [];
		for ( const [ id, record ] of this.forms ) {
			if ( this.pinned( record ) ) continue;
			record.bridge.flush(); this.forms.delete( id ); ids.push( id); this.evictions++;
			this.report( 'dispose', id, record );
		}
		return ids;
	}
	report( type, id, record = null ) {
		this.diagnostic( { type, id, retainedCount: this.forms.size, evictionCount: this.evictions, reloadCount: this.reloads, mountDuration: record ? Math.round( performance.now() - record.mounted ) : 0 } );
	}
}
