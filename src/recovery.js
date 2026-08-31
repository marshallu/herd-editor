/** Browser-local, encrypted recovery copies for Herd's native post form. */

const DB_NAME = 'herd-editor-recovery';
const STORE = 'records';

export const recoveryRecordId = ( userId, postId ) => `herd:${ userId }:${ postId }`;

function openDatabase( indexedDB = window.indexedDB ) {
	return new Promise( ( resolve, reject ) => {
		const request = indexedDB.open( DB_NAME, 1 );
		request.onupgradeneeded = () => request.result.createObjectStore( STORE, { keyPath: 'id' } );
		request.onsuccess = () => resolve( request.result );
		request.onerror = () => reject( request.error );
	} );
}

async function withStore( mode, callback ) {
	const db = await openDatabase();
	return new Promise( ( resolve, reject ) => {
		const transaction = db.transaction( STORE, mode );
		const result = callback( transaction.objectStore( STORE ) );
		transaction.oncomplete = () => { db.close(); resolve( result?.result ); };
		transaction.onerror = () => { db.close(); reject( transaction.error ); };
	} );
}

function bytesFromBase64Url( value ) {
	const base64 = value.replace( /-/g, '+' ).replace( /_/g, '/' ) + '==='.slice( ( value.length + 3 ) % 4 );
	return Uint8Array.from( atob( base64 ), ( character ) => character.charCodeAt( 0 ) );
}

function base64Url( bytes ) {
	return btoa( String.fromCharCode( ...new Uint8Array( bytes ) ) ).replace( /\+/g, '-' ).replace( /\//g, '_' ).replace( /=+$/, '' );
}

export async function encryptionKey( encodedKey ) {
	return crypto.subtle.importKey( 'raw', bytesFromBase64Url( encodedKey ), 'AES-GCM', false, [ 'encrypt', 'decrypt' ] );
}

export async function encryptRecovery( payload, key ) {
	const iv = crypto.getRandomValues( new Uint8Array( 12 ) );
	const encrypted = await crypto.subtle.encrypt( { name: 'AES-GCM', iv }, key, new TextEncoder().encode( JSON.stringify( payload ) ) );
	return { iv: base64Url( iv ), ciphertext: base64Url( encrypted ) };
}

export async function decryptRecovery( record, key ) {
	const plaintext = await crypto.subtle.decrypt( { name: 'AES-GCM', iv: bytesFromBase64Url( record.iv ) }, key, bytesFromBase64Url( record.ciphertext ) );
	return JSON.parse( new TextDecoder().decode( plaintext ) );
}

export async function readRecovery( id ) { return withStore( 'readonly', ( store ) => store.get( id ) ); }
export async function deleteRecovery( id ) { return withStore( 'readwrite', ( store ) => store.delete( id ) ); }
export async function writeRecovery( record ) { return withStore( 'readwrite', ( store ) => store.put( record ) ); }

export function nativeFormValues( form ) {
	const values = [];
	form?.querySelectorAll( 'input[name], select[name], textarea[name]' ).forEach( ( field ) => {
		if ( [ 'content', 'active_post_lock', '_wpnonce', '_wp_http_referer' ].includes( field.name ) || field.disabled || [ 'submit', 'button', 'file' ].includes( field.type ) ) return;
		if ( ( field.type === 'checkbox' || field.type === 'radio' ) && ! field.checked ) return;
		values.push( { name: field.name, type: field.type, value: field.value, selected: field.multiple ? Array.from( field.selectedOptions, ( option ) => option.value ) : null } );
	} );
	return values;
}

export function restoreNativeFormValues( form, values = [] ) {
	values.forEach( ( saved ) => {
		Array.from( form?.querySelectorAll( '[name]' ) || [] ).filter( ( field ) => field.name === saved.name ).forEach( ( field ) => {
			if ( field.type === 'checkbox' || field.type === 'radio' ) field.checked = field.value === saved.value;
			else if ( field.multiple && saved.selected ) Array.from( field.options ).forEach( ( option ) => { option.selected = saved.selected.includes( option.value ); } );
			else field.value = saved.value;
			field.dispatchEvent( new field.ownerDocument.defaultView.Event( 'change', { bubbles: true } ) );
		} );
	} );
}

export function downloadRecovery( payload, postId ) {
	const blob = new Blob( [ JSON.stringify( payload, null, 2 ) ], { type: 'application/json' } );
	const link = Object.assign( document.createElement( 'a' ), { href: URL.createObjectURL( blob ), download: `herd-recovery-post-${ postId }.json` } );
	link.click();
	setTimeout( () => URL.revokeObjectURL( link.href ), 0 );
}
