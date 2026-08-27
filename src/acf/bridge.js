import { buildFetchBlockPayload, dataAttributesFromForm, mergeAcfBlockData } from './helpers.js';

/**
 * Compatibility boundary for ACF internals. No UI component should use acf.ajax,
 * acf.serialize, or lifecycle actions directly.
 */
export class AcfBlockFormBridge {
	constructor( { block, postId, context, onAttributes, prepare, enhance } ) {
		this.block = block;
		this.postId = postId;
		this.context = context || {};
		this.onAttributes = onAttributes;
		this.prepare = prepare;
		this.enhance = enhance;
		this.teardown = null;
		this.host = null;
		this.form = null;
		this.changeHandler = this.handleChange.bind( this );
		this.lastSerialized = null;
		this.request = null;
		this.disposed = false;
	}

	async fetchForm() {
		const { acf } = window;
		if ( ! acf || ! acf.ajax || ! acf.prepareForAjax ) {
			throw new Error( 'ACF input APIs are not available.' );
		}
		const response = await new Promise( ( resolve, reject ) => {
			this.request = window.jQuery.ajax( {
				url: acf.get( 'ajaxurl' ) || window.ajaxurl, dataType: 'json', type: 'post', cache: false, timeout: 20000,
				data: acf.prepareForAjax( buildFetchBlockPayload( this.block, this.postId, this.context ) ),
			} ).done( resolve ).fail( ( request, status, error ) => {
				const reason = new Error( error || ( status === 'abort' ? 'Request aborted.' : 'ACF form request failed.' ) );
				if ( status === 'abort' ) reason.name = 'AbortError';
				reject( reason );
			} );
		} );
		this.request = null;
		if ( ! response || ! response.success || ! response.data || ! Object.prototype.hasOwnProperty.call( response.data, 'form' ) ) {
			throw new Error( 'ACF did not return a block form.' );
		}
		return typeof response.data.form === 'string' ? response.data.form : '';
	}

	async mount( host ) {
		this.host = host;
		const html = await this.fetchForm();
		if ( this.disposed ) { const error = new Error( 'Request aborted.' ); error.name = 'AbortError'; throw error; }
		if ( ! html.trim() ) return { status: 'empty' };
		host.innerHTML = html;
		this.form = host.querySelector( '.acf-block-fields' ) || host;
		// Any DOM rearranging has to happen while the form is still inert.
		if ( this.prepare ) this.prepare( this.form );
		window.acf.doAction( 'append', window.jQuery( this.form ) );
		// Repeater rows, media previews and link chips only exist once ACF has run,
		// so decoration that reads rendered values belongs here rather than in
		// `prepare`. Anything it needs to unwind comes back as a disposer.
		if ( this.enhance ) this.teardown = this.enhance( this.form ) || null;
		this.form.addEventListener( 'change', this.changeHandler );
		this.form.addEventListener( 'input', this.changeHandler );
		return { status: 'mounted' };
	}

	handleChange() {
		if ( ! this.form ) return;
		const submitted = dataAttributesFromForm( this.form, this.block.clientId, window.acf );
		const data = mergeAcfBlockData( this.block.attributes?.data, submitted );
		const serialized = JSON.stringify( data );
		if ( serialized === this.lastSerialized ) return;
		this.lastSerialized = serialized;
		this.onAttributes( { data } );
	}

	dispose() {
		this.disposed = true;
		if ( this.request && typeof this.request.abort === 'function' ) this.request.abort();
		this.request = null;
		if ( this.teardown ) this.teardown();
		this.teardown = null;
		if ( this.form ) {
			this.form.removeEventListener( 'change', this.changeHandler );
			this.form.removeEventListener( 'input', this.changeHandler );
			window.acf.doAction( 'remove', window.jQuery( this.form ) );
		}
		if ( this.host ) this.host.replaceChildren();
		this.form = null;
		this.host = null;
	}
}
