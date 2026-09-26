import { json } from '../_lib/http';

export const onRequest: PagesFunction = async () => json({ error: 'Not found' }, { status: 404 });
