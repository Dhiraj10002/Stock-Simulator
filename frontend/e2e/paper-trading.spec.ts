import { test, expect, type Page } from "@playwright/test";
const browserErrors = new WeakMap<Page, string[]>();
test.beforeEach(({ page }) => {
 const errors: string[] = [];
 browserErrors.set(page, errors);
 page.on("pageerror", error => errors.push(error.message));
});
test.afterEach(({ page }) => {
 expect(browserErrors.get(page), "Unhandled browser errors, including hydration failures").toEqual([]);
});
const token = `test.${Buffer.from(JSON.stringify({user_id:"browser-trader"})).toString("base64url")}.test`;
const wallet = { uuid:"wallet",cash_balance_paise:100000000,available_balance_paise:100000000,blocked_paise:0 };
const portfolio = { positions:[], invested_value_paise:0,current_value_paise:0,unrealized_pnl_paise:0,realized_pnl_paise:0,total_pnl_paise:0,valuation_status:"REALTIME",daily_pnl_paise:0 };
const instrument = (symbol:string,lot=1) => ({symbol,token: symbol+"-token",name:symbol,display_symbol:symbol,exchange:"NFO",exchange_segment:"NFO",instrument_type:"OPTIDX",lot_size:lot,active:true,is_tradable:true,expiry:"2026-12-31",tick_size:"0.05"});
const quote = (symbol:string) => ({symbol,price_paise:10000,source:"angelone_live",updated_at:new Date().toISOString(),is_quote_stale:false,day_change_available:true,previous_close_paise:9900,change_paise:100,change_percent:1.01});
const contract = (symbol:string,type:string,strike:number,lot=65) => ({symbol,option_type:type,strike_price_paise:strike,lot_size:lot,ltp_paise:10000,open_interest:100,open_interest_available:true,is_available:true,is_quote_stale:false,quote_status:"AVAILABLE",quote_source:"angelone_live",updated_at:new Date().toISOString(),iv:20,delta:0.5,gamma:0.01,theta:-1,vega:1});
function chain(lot=65) { return {underlying_symbol:"NIFTY",spot_price_paise:2500000,expiry_date:"2026-12-31",lot_size:lot,total_call_oi:200,total_put_oi:200,put_call_ratio:1,feed_mode:"LIVE",strikes:[0,1].map(i=>({strike_price_paise:2500000+i*5000,is_atm:i===0,call:contract(`CALL${i}`,"CE",2500000+i*5000,lot),put:contract(`PUT${i}`,"PE",2500000+i*5000,lot)}))}; }
async function mocks(page:Page, overrides: { unavailable?:boolean; closed?:boolean; lot?:number; partial?:boolean; pending?:boolean }={}) {
 const posts: Record<string,unknown>[] = [];
 await page.route("**/api/v1/**",async route=>{
  const req=route.request(),url=new URL(req.url()),path=url.pathname.replace("/api/v1","");
  const headers = { "access-control-allow-origin":"http://127.0.0.1:3100", "access-control-allow-methods":"GET,POST,DELETE,OPTIONS", "access-control-allow-headers":"authorization,content-type,idempotency-key,x-request-id" };
  if(req.method()==="OPTIONS") { await route.fulfill({status:204,headers}); return; }
  let data:unknown;
  if(path==="/auth/login") data={access_token:token,refresh_token:"browser-refresh"};
  else if(path==="/auth/logout") data={};
  else if(path==="/auth/me") data={uuid:"browser-trader",name:"Trader",email:"trader@example.com"};
  else if(path==="/wallet") data=wallet;
  else if(path==="/portfolio" && !overrides.unavailable) data=portfolio;
  else if(path==="/orders/preview") data={required_funds_paise:10000,available_balance_paise:100000000,estimated_price_paise:10000,sufficient_funds:true};
  else if(path==="/orders" && req.method()==="POST") { const body=req.postDataJSON(); posts.push(body); data={...body,uuid:`leg-${posts.length}`,status:overrides.pending?"PENDING":overrides.partial && posts.length===2?"REJECTED":"EXECUTED",created_at:new Date().toISOString()}; }
  else if(path.startsWith("/orders/")) data={uuid:path.split("/").at(-1),symbol:"CALL0",status:"EXECUTED"};
  else if(["/orders","/trades","/news","/watchlist"].includes(path)) data=[];
  else if(path==="/instruments/derivative-underlyings") data=["NIFTY","DYNAMICSTOCK"];
  else if(path==="/instruments/derivative-stocks") data=[];
  else if(path==="/instruments") data=[];
  else if(path.startsWith("/instruments/")) data=instrument(path.split("/").at(-1)!,65);
  else if(path==="/fno/option-chain") data=chain(overrides.lot);
  else if(path.endsWith("/history") && !overrides.unavailable) data=[0,1,2].map(i=>({timestamp:Math.floor(Date.now()/60000)*60-180+i*60,open_paise:10000,high_paise:10100,low_paise:9900,close_paise:10000,volume:20,source:"angelone_live",feed_mode:"LIVE"}));
  else if(path.startsWith("/market/quotes/") && !overrides.unavailable) data=quote(path.split("/").at(-1)!);
  else if(path==="/market/status") data={status:overrides.closed?"CLOSED":"OPEN",is_open:!overrides.closed,server_time:new Date().toISOString(),feed_provider:"angel_one",feed_state:"LIVE",is_synthetic:false,last_tick:overrides.closed?"":new Date().toISOString()};
  else if(path==="/market/feed-status") data={feed_provider:"angel_one",feed_state:"LIVE",is_synthetic:false,last_tick:new Date().toISOString()};
  else { await route.fulfill({status:503,headers,json:{success:false,message:"Provider unavailable",code:"MARKET_DATA_UNAVAILABLE"}}); return; }
  await route.fulfill({headers,json:{success:true,data}});
 });
 return posts;
}
async function signIn(page:Page) {
 await page.goto("/login");await page.getByPlaceholder("trader@example.com").fill("trader@example.com");await page.getByPlaceholder("••••••••").fill("Paper-test-password");await page.getByRole("button",{name:"Sign In & Continue"}).click();await expect(page.getByRole("heading",{name:/Welcome back/})).toBeVisible();
}
test("login, authenticated dashboard, portfolio/orders and logout",async({page})=>{
 await mocks(page);await signIn(page);
 await page.goto("/portfolio");await expect(page.getByRole("heading",{name:"Institutional Portfolio Desk"})).toBeVisible();
 await page.goto("/orders");await expect(page.getByRole("heading",{name:"Order Book & Execution Desk"})).toBeVisible();
 await page.getByTitle("Trader Profile & Account Settings").click();await page.getByRole("button",{name:"Sign Out"}).click();await expect(page).toHaveURL(/\/login$/);
 expect(await page.evaluate(()=>localStorage.getItem("auth_token"))).toBeNull();
});
test("chart timeframe controls request native archives",async({page})=>{
 await mocks(page);await signIn(page);await page.goto("/stocks/RELIANCE");await expect(page.getByRole("heading",{name:"RELIANCE",exact:true})).toBeVisible();
 for(const [label,interval] of [["1H","ONE_HOUR"],["1D","ONE_DAY"]]) {const request=page.waitForRequest(req=>req.url().includes("/history")&&req.url().includes(`interval=${interval}`));await page.getByRole("button",{name:label,exact:true}).click();await request;}
 await expect(page.locator("canvas").first()).toBeVisible();
});
test("unavailable quote, chart and portfolio stay explicit",async({page})=>{
 await mocks(page,{unavailable:true});await signIn(page);await page.goto("/stocks/RELIANCE");await expect(page.getByText("Chart archive request failed.")).toBeVisible();await expect(page.getByText("Day movement unavailable")).toBeVisible();
 await page.goto("/portfolio");await expect(page.getByText("Valuation stale / unavailable")).toBeVisible();
});
test("option selector uses canonical universe and missing lot blocks orders",async({page})=>{
 const posts=await mocks(page,{lot:0});await signIn(page);await page.goto("/options");await page.getByRole("button",{name:"Option Chain",exact:true}).click();
 await expect(page.getByRole("button",{name:"DYNAMICSTOCK",exact:true})).toBeVisible();await page.getByTitle("Buy Call",{exact:true}).first().click();
 await expect(page.getByText("A fresh quote and canonical lot size are required.")).toBeVisible();expect(posts).toHaveLength(0);
});
test("partial strategy persists recovery and never reports complete execution",async({page})=>{
 const posts=await mocks(page,{partial:true});await signIn(page);await page.goto("/options");await page.getByRole("button",{name:"Option Chain",exact:true}).click();await page.getByRole("button",{name:"Bull Call Spread",exact:true}).click();await page.getByRole("button",{name:/Execute Strategy/}).click();
 const recovery=page.getByRole("region",{name:"Strategy order recovery"});await expect(recovery.getByText("EXECUTED",{exact:true})).toBeVisible();await expect(recovery.getByText("REJECTED",{exact:true})).toBeVisible();expect(posts).toHaveLength(2);expect(posts[0].quantity).toBe(65);
 await page.reload();await page.getByRole("button",{name:"Option Chain",exact:true}).click();await expect(recovery.getByText("REJECTED",{exact:true})).toBeVisible();await expect(recovery.getByRole("link",{name:"Review / close positions"})).toBeVisible();expect(posts).toHaveLength(2);
 const otherToken=`test.${Buffer.from(JSON.stringify({user_id:"another-trader"})).toString("base64url")}.test`;
 await page.evaluate(value=>{localStorage.setItem("auth_token",value);window.dispatchEvent(new Event("auth-changed"));},otherToken);await expect(recovery).not.toBeVisible();
 await page.evaluate(value=>{localStorage.setItem("auth_token",value);window.dispatchEvent(new Event("auth-changed"));},token);await expect(recovery.getByText("REJECTED",{exact:true})).toBeVisible();expect(posts).toHaveLength(2);
});
test("single option order uses canonical quantity and preserves pending status",async({page})=>{
 const posts=await mocks(page,{pending:true});await signIn(page);await page.goto("/options");await page.getByRole("button",{name:"Option Chain",exact:true}).click();await page.getByTitle("Buy Call",{exact:true}).first().click();
 const submit=page.getByRole("button",{name:"BUY 65 CALL0 (1 LOT)",exact:true});await expect(submit).toBeEnabled();await submit.click();
 await expect(page.getByText("Order leg-1: PENDING. Execution is not confirmed. Review Orders for its current status.")).toBeVisible();await expect(submit).toBeDisabled();expect(posts).toHaveLength(1);expect(posts[0].quantity).toBe(65);
});

test("closed empty dashboard reports honest data and valuation states", async ({page}) => {
 await mocks(page, {closed:true}); await signIn(page);
 await expect(page.getByText("Angel One · session closed", {exact:true}).first()).toBeVisible();
 await expect(page.getByText("Breadth unavailable", {exact:true})).toBeVisible();
 await expect(page.getByText("Session closed · unavailable", {exact:true})).toHaveCount(3);
 await expect(page.getByText("No open positions", {exact:true})).toBeVisible();
 await expect(page.getByText("+Unavailable", {exact:true})).toHaveCount(0);
 await expect(page.getByText("0 Advancing (50%)", {exact:true})).toHaveCount(0);
 await expect(page.getByText("Connecting...", {exact:true})).toHaveCount(0);
 await expect(page.getByText("Live Valuation", {exact:true})).toHaveCount(0);
});
