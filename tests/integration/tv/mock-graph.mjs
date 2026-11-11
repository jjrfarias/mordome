// Injected only into the local smoke process; no production source uses this adapter.
import { readFileSync, appendFileSync } from 'node:fs';
const scratch=process.env.MORDOME_TV_TEST_DIR;
if (!scratch || process.env.NODE_ENV === 'production') throw new Error('O adaptador Graph é exclusivo do teste local de TV.');
const nativeFetch=globalThis.fetch;
globalThis.fetch=async function(input,init) {
  const url=new URL(input instanceof Request?input.url:String(input));
  if(url.hostname!=='graph.facebook.com') return nativeFetch(input,init);
  const headers=new Headers(init?.headers ?? (input instanceof Request?input.headers:undefined));
  const authorization=headers.get('authorization')??'';
  let scenario={mode:'ok'};
  try { scenario=JSON.parse(readFileSync(scratch+'/graph-scenario.json','utf8')); } catch {}
  const pathname=url.pathname.replace(/^\/v\d+\.\d+\//,'');
  appendFileSync(scratch+'/graph-requests.jsonl',JSON.stringify({pathname,tokenInQuery:url.searchParams.has('access_token'),hasBearer:authorization.startsWith('Bearer '),redirect:init?.redirect})+'\n');
  const response=(data,status=200)=>new Response(JSON.stringify(data),{status,headers:{'Content-Type':'application/json'}});
  if(pathname==='oauth/access_token') {
    if(url.searchParams.get('code')==='DENIED_CODE') return response({error:{code:190,message:'DO_NOT_LEAK_AUTH_CODE_OR_APP_SECRET'}},400);
    return response({access_token:'OAUTH_MULTI_TEST_SECRET_123456789',expires_in:5184000});
  }
  if(pathname==='me') return response({id:'55555',client_business_id:'44444'});
  if(pathname==='44444/system_user_access_tokens') {
    if(scenario.mode==='renew-fail') return response({error:{code:190,message:'DO_NOT_LEAK_RENEW_TOKEN'}},401);
    const form = new URLSearchParams(init?.body);
    if(init?.method!=='POST' || !form.get('appsecret_proof') || form.get('system_user_id')!=='55555' || form.get('set_token_expires_in_60_days')!=='true') return response({error:{code:100}},400);
    return response({access_token:'OAUTH_RENEWED_TEST_SECRET_123456789'});
  }
  if(pathname==='me/assigned_instagram_accounts') {
    if(['empty-accounts','business-accounts','business-denied'].includes(scenario.mode)) return response({data:[]});
    if(authorization.includes('MULTI')) {
      return response({data:[{id:url.searchParams.has('after')?'22222':'11111',username:url.searchParams.has('after')?'second_account':'first_account'}],...(url.searchParams.has('after')?{}:{paging:{cursors:{after:'cursor-without-next'}}})});
    }
    return response({data:[{id:'11111',username:'test_store'}]});
  }
  if(pathname==='44444/instagram_accounts') {
    if(scenario.mode==='business-denied') return response({error:{code:200}},403);
    return response({data:scenario.mode==='business-accounts'?[{id:'11111',username:'test_store'}]:[]});
  }
  if(pathname==='me/accounts') return response({data:[{id:'33333',instagram_business_account:{id:'11111',username:'test_store'}}]});
  if(pathname==='11111') return response({id:'11111',username:'test_store'});
  if(pathname==='22222') return response({id:'22222',username:'second_account'});
  if(pathname.endsWith('/stories')) {
    if(scenario.mode==='fail') return response({error:{code:190,message:'DO_NOT_LEAK_TEST_TOKEN_OR_INTERNAL_ERROR'}},401);
    if(scenario.mode==='slow') await new Promise(resolve=>setTimeout(resolve,250));
    return response({data:[
      {id:'90001',media_type:'IMAGE',media_url:'https://scontent.test.cdninstagram.com/valid.jpg',timestamp:new Date(Date.now()-3600_000).toISOString()},
      {id:'90002',media_type:'VIDEO',media_url:'https://video.test.fbcdn.net/valid.mp4',thumbnail_url:'https://scontent.test.cdninstagram.com/thumb.jpg',timestamp:new Date(Date.now()-1800_000).toISOString()},
      {id:'90003',media_type:'IMAGE',media_url:'https://scontent.test.cdninstagram.com/expired.jpg',timestamp:new Date(Date.now()-25*3600_000).toISOString()},
      {id:'90004',media_type:'IMAGE',media_url:'https://attacker.invalid/image.jpg',timestamp:new Date().toISOString()},
    ]});
  }
  return response({error:{code:100,message:'Unexpected test graph request'}},400);
};
