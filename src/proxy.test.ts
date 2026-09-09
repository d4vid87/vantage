import {it,expect,vi} from 'vitest';
import {NextRequest,type NextFetchEvent} from 'next/server';
vi.mock('@/lib/auth',()=>({SESSION_COOKIE:'vantage-session',authEnabled:()=>true,verifySession:async(token?:string)=>token==='valid'}));
import {proxy} from './proxy';
const event={waitUntil:()=>{}} as unknown as NextFetchEvent;
it('protects dashboard settings, finance and saved weather data without breaking public weather',async()=>{for(const path of ['/api/dashboard/settings','/api/finance','/api/weather/details','/api/weather/radar/123/1/0/0']){expect((await proxy(new NextRequest('http://localhost'+path),event)).status).toBe(401);expect((await proxy(new NextRequest('http://localhost'+path,{headers:{cookie:'vantage-session=valid'}}),event)).status).toBe(200);}expect((await proxy(new NextRequest('http://localhost/api/weather'),event)).status).toBe(200);});
