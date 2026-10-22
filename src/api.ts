import { createWebApi } from './web-api';

export const api = window.mscw ?? createWebApi({ version: '0.4.0' });
