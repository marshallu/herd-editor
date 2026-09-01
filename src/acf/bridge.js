import { buildFetchBlockPayload, dataAttributesFromForm, mergeAcfBlockData } from './helpers.js';

/**
 * Compatibility boundary for ACF internals. No UI component should use acf.ajax,
 * acf.serialize, or lifecycle actions directly.
 */
export class AcfBlockFormBridge {
	constructor( { block, postId, context, onAttributes, getData, prepare, enhance } ) {
		this.block = block;
		this.postId = postId;
		this.context = context || {};
		this.onAttributes = onAttributes;
		// A panel can stay mounted while another edit changes this block.  Do not
		// merge against the snapshot that fetched the form in that case.
		this.getData = getData;
		this.prepare = prepare;
		this.enhance = enhance;
		this.teardown = null;
		this.host = null;
		this.form = null;
		this.changeHandler = this.handleChange.bind( this );
		this.inputHandler = this.handleInput.bind( this );
		this.jqueryChangeHandler = this.handleJqueryChange.bind( this );
		this.$form = null;
		this.lastSerialized = null;
		this.request = null;
		this.disposed = false;
		this.inputTimer = null;
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
		this.form.addEventListener( 'input', this.inputHandler );
		this.$form = window.jQuery( this.form );
		this.$form?.on?.( 'change', this.jqueryChangeHandler );
		return { status: 'mounted' };
	}

	flush() {
		if ( this.inputTimer !== null ) {
			globalThis.clearTimeout( this.inputTimer );
			this.inputTimer = null;
		}
		if ( ! this.form ) return;
		const submitted = dataAttributesFromForm( this.form, this.block.clientId, window.acf );
		const data = mergeAcfBlockData( this.getData?.() ?? this.block.attributes?.data, submitted );
		const serialized = JSON.stringify( data );
		if ( serialized === this.lastSerialized ) return;
		this.lastSerialized = serialized;
		this.onAttributes( { data } );
	}

	handleChange() {
		this.flush();
	}

	/* Text controls can emit an input event for every keystroke. ACF form
	 * serialization walks the complete mounted form, so coalesce that work while
	 * keeping discrete changes and every explicit flush synchronous. */
	handleInput() {
		if ( this.inputTimer !== null ) globalThis.clearTimeout( this.inputTimer );
		this.inputTimer = globalThis.setTimeout( () => {
			this.inputTimer = null;
			this.flush();
		}, 250 );
	}

	/**
	 * Put a value ACF set itself back on the DOM's own channel.
	 *
	 * Choosing an image, a file or a link never reaches a native listener. ACF
	 * writes the value with acf.val(), which announces it with jQuery's
	 * .trigger( 'change' ) -- and that walks jQuery's own handler list rather
	 * than dispatching a DOM event, so nothing bound with addEventListener hears
	 * it. The block's data therefore kept whatever it was opened with: an image
	 * added to a block was still missing when the pre-publish sweep read the
	 * document, which reported the field required with the picture on screen.
	 *
	 * Re-dispatching here rather than flushing here is deliberate. This bridge is
	 * not the only listener that was deaf to those values -- the media row's own
	 * repaint and every summary in the rail listen for `change` too -- and one
	 * real event feeds all of them.
	 *
	 * @param {Object} event jQuery's event object.
	 */
	handleJqueryChange( event ) {
		// A native event jQuery merely relayed is already on that channel; only a
		// .trigger() call arrives with no original event behind it.
		if ( ! event || event.originalEvent ) return;
		const target = event.target;
		if ( ! target || ! this.form?.contains?.( target ) ) return;
		const view = target.ownerDocument?.defaultView;
		if ( ! view ) return;
		target.dispatchEvent( new view.Event( 'change', { bubbles: true } ) );
	}

	dispose() {
		this.disposed = true;
		if ( this.request && typeof this.request.abort === 'function' ) this.request.abort();
		this.request = null;
		if ( this.teardown ) this.teardown();
		this.teardown = null;
		if ( this.form ) {
			this.form.removeEventListener( 'change', this.changeHandler );
			this.form.removeEventListener( 'input', this.inputHandler );
			this.$form?.off?.( 'change', this.jqueryChangeHandler );
			window.acf.doAction( 'remove', window.jQuery( this.form ) );
		}
		if ( this.inputTimer !== null ) globalThis.clearTimeout( this.inputTimer );
		this.inputTimer = null;
		if ( this.host ) this.host.replaceChildren();
		this.form = null;
		this.host = null;
	}
}
