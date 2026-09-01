import { cloneBlock } from './document.js';

export function duplicationProfile( profiles = {}, block ) {
	const profile = profiles[ block?.name ] || {};
	return { policy: [ 'safe', 'review', 'blocked' ].includes( profile.policy ) ? profile.policy : 'safe', clear: Array.isArray( profile.clear ) ? profile.clear : [], warn: Array.isArray( profile.warn ) ? profile.warn : [], message: profile.message || '' };
}

export function duplicateWithProfile( block, profiles = {}, clear = [] ) {
	const profile = duplicationProfile( profiles, block );
	if ( profile.policy === 'blocked' ) return null;
	const copy = cloneBlock( block );
	const fields = new Set( [ ...profile.clear, ...clear ] );
	if ( fields.size && copy.attributes?.data ) {
		const data = { ...copy.attributes.data };
		for ( const field of fields ) {
			delete data[ field ];
			delete data[ `_${ field }` ];
		}
		copy.attributes = { ...copy.attributes, data };
		copy.changed = true;
		copy.attributesChanged = true;
	}
	return copy;
}

export function duplicationReviewValues( block, profiles = {} ) {
	const profile = duplicationProfile( profiles, block );
	return profile.warn.filter( ( field ) => { const value = block?.attributes?.data?.[ field ]; return value !== '' && value !== null && value !== undefined; } );
}
