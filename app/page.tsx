"use client";
import { useEffect, useState } from "react";
import { Activity, ArrowUpRight, FileCheck2, Wallet } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

type Config = { provider:string; terms:string; terms_sha256:string; status_url:string; status_sha256:string; deadline_days:number; response_hours:number; minimum_minutes:number; tier1_minutes:number; tier2_minutes:number; tier1_bps:number; tier2_bps:number; tier3_bps:number; pool_wei:string; next_claim_id:number };
type Claim = { customer:string; incident_start:number; incident_end:number; response_deadline:number; status:string; customer_count:number; provider_count:number; covered_minutes:number; credit_bps:number; payout_wei:string; reason:string };
type Evidence = { owner:string; url:string; sha256:string; label:string };
declare global { interface Window { ethereum?: {request:(arg:{method:string;params?:unknown[]})=>Promise<unknown>} } }
const DEFAULT = process.env.NEXT_PUBLIC_CONTRACT_ADDRESS || "";
const short = (s:string) => s ? s.slice(0,6)+"…"+s.slice(-4) : "—";
const gen = (s:string) => (Number(BigInt(s)*10000n/10n**18n)/10000).toLocaleString();
const seconds = (s:string) => Math.floor(new Date(s).getTime()/1000);
const date = (s:number) => new Date(s*1000).toLocaleString();
const amount = (s:string) => { if (!/^\d+(\.\d{1,6})?$/.test(s) || Number(s)<=0) throw Error("Enter a positive GEN amount with at most six decimals."); const [whole, fraction=""] = s.split("."); return BigInt(whole)*10n**18n+BigInt(fraction.padEnd(18,"0")); };

export default function Home(){
  const [address,setAddress]=useState(DEFAULT),[wallet,setWallet]=useState(""),[config,setConfig]=useState<Config|null>(null);
  const [claimId,setClaimId]=useState(""),[claim,setClaim]=useState<Claim|null>(null),[evidence,setEvidence]=useState<Evidence[]>([]);
  const [message,setMessage]=useState(""),[tx,setTx]=useState(""),[busy,setBusy]=useState(false);
  useEffect(()=>{if(!DEFAULT) setAddress(localStorage.getItem("uptimecredit-address")||"");},[]);
  async function sdk(write=false){
    const {createClient}=await import("genlayer-js");
    const {studionet}=await import("genlayer-js/chains");
    if(write){
      if(!window.ethereum) throw Error("Install an EIP-1193 wallet to sign Studionet transactions.");
      const accounts=await window.ethereum.request({method:"eth_requestAccounts"}) as string[];
      const c=createClient({chain:studionet,account:accounts[0] as `0x${string}`,provider:window.ethereum as never});
      await c.connect("studionet"); setWallet(accounts[0]); return c;
    }
    return createClient({chain:studionet});
  }
  async function read(fn:string,args:unknown[]=[]){
    if(!/^0x[a-fA-F0-9]{40}$/.test(address)) throw Error("Enter a deployed contract address.");
    const c=await sdk(); const {TransactionHashVariant}=await import("genlayer-js/types");
    return c.readContract({address:address as `0x${string}`,functionName:fn,args:args as never[],transactionHashVariant:TransactionHashVariant.LATEST_FINAL});
  }
  async function load(){
    try{localStorage.setItem("uptimecredit-address",address);setConfig(await read("get_config") as Config);setMessage("");}
    catch(e){setConfig(null);setMessage((e as Error).message);}
  }
  async function lookup(id=claimId){
    try{const c=await read("get_claim",[Number(id)]) as Claim;setClaim(c);setClaimId(id);
      const rows:Evidence[]=[]; for(const side of ["customer","provider"]){const n=side==="customer"?c.customer_count:c.provider_count;for(let i=0;i<n;i++)rows.push(await read("get_evidence",[Number(id),side,i]) as Evidence);}
      setEvidence(rows);setMessage("");
    }catch(e){setClaim(null);setEvidence([]);setMessage((e as Error).message);}
  }
  useEffect(()=>{
    const context=(document as unknown as {modelContext?:{registerTool:(tool:unknown,options:{signal:AbortSignal})=>void|Promise<void>}}).modelContext;
    if(!context?.registerTool)return;
    const lifecycle=new AbortController();
    void Promise.resolve(context.registerTool({
      name:"read_uptimecredit_claim",title:"Read UptimeCredit claim",
      description:"Load a finalized claim by ID in the visible case file.",
      inputSchema:{type:"object",properties:{claimId:{type:"integer",minimum:1}},required:["claimId"],additionalProperties:false},
      annotations:{readOnlyHint:true,untrustedContentHint:true},
      execute:async(input:unknown)=>{
        const id=(input as {claimId?:unknown})?.claimId;
        if(!Number.isInteger(id)||Number(id)<1)throw Error("Invalid claim ID");
        await lookup(String(id));
        return await read("get_claim",[Number(id)]);
      }
    },{signal:lifecycle.signal})).catch(()=>{});
    return ()=>lifecycle.abort();
  // Registration follows the active address; the tool is unavailable until a valid address is loaded.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  },[address]);
  async function write(fn:string,args:unknown[],value?:bigint){
    setBusy(true);setTx("");setMessage("Preparing "+fn+"…");
    try{
      if(!config) throw Error("Load the contract first.");
      const c=await sdk(true);
      const hash=await c.writeContract({address:address as `0x${string}`,functionName:fn,args:args as never[],value:value||0n});
      setTx(hash);setMessage("Submitted. Waiting for finalization…");
      const {TransactionStatus}=await import("genlayer-js/types");
      const receipt=await c.waitForTransactionReceipt({hash,status:TransactionStatus.FINALIZED});
      if(receipt.statusName!==TransactionStatus.FINALIZED || receipt.resultName!=="SUCCESS") throw Error("Transaction status: "+receipt.statusName+" / "+receipt.txExecutionResultName+". Inspect it before retrying.");
      await load();if(claimId) await lookup();setMessage(fn+" finalized.");
    }catch(e){setMessage((e as Error).message);}finally{setBusy(false);}
  }
  function onForm(fn:string,names:string[],convert:(s:string[])=>unknown[]=(s)=>s){
    return (e:React.FormEvent<HTMLFormElement>)=>{e.preventDefault();try{const data=new FormData(e.currentTarget);void write(fn,convert(names.map(n=>String(data.get(n)||"").trim())));}catch(err){setMessage((err as Error).message);}};
  }
  async function hashFile(file?:File){if(!file)return;const digest=await crypto.subtle.digest("SHA-256",await file.arrayBuffer());setMessage("File SHA-256: "+Array.from(new Uint8Array(digest)).map(x=>x.toString(16).padStart(2,"0")).join("")+". The URL must serve these exact bytes.");}
  return <main className="shell">
    <header className="topbar"><div className="brand"><span className="mark"><Activity size={21}/></span>UPTIME<span>CREDIT</span></div><div className="network"><i/> GENLAYER STUDIONET <small>61999</small></div><Button variant="outline" onClick={()=>void sdk(true).catch(e=>setMessage(e.message))}><Wallet size={16}/>{wallet?short(wallet):"Connect wallet"}</Button></header>
    <div className="workspace"><aside className="rail"><div className="eyebrow">SERVICE ASSURANCE</div><div className="rail-active"><Activity size={17}/> Claims workspace</div><a href="https://studio.genlayer.com" target="_blank" rel="noreferrer"><ArrowUpRight size={17}/> GenLayer Studio</a><div className="rail-end">FINALIZED STATE<br/><small>Evidence stays on record</small></div></aside>
    <section className="maincol"><div className="heading"><div><div className="eyebrow">SERVICE CREDIT PROTOCOL / 01</div><h1>Outages, resolved<br/><em>on the record.</em></h1><p>Submit an incident, attach verifiable public evidence, and track a credit through review and payout.</p></div><div className="hero-icon"><Activity size={55} strokeWidth={1}/></div></div>
      <div className="connect"><div><div className="eyebrow">CONTRACT ON STUDIONET</div><p>{config?"Connected to "+short(address):"Enter a deployed UptimeCredit contract address."}</p></div><div className="address"><Input aria-label="Contract address" placeholder="0x… contract address" value={address} onChange={e=>setAddress(e.target.value.trim())}/><Button onClick={()=>void load()}>Load</Button></div></div>
      {message&&<div className="notice" role="status">{message}{tx&&<a href={`https://explorer-studio.genlayer.com/tx/${tx}`} target="_blank" rel="noreferrer"> View transaction ↗</a>}</div>}
      <div className="section-head"><h2>Claims workspace</h2><span>On-chain evidence and credits</span></div>
      <Tabs defaultValue="customer"><TabsList><TabsTrigger value="customer">Customer</TabsTrigger><TabsTrigger value="provider">Provider</TabsTrigger><TabsTrigger value="review">Review & payout</TabsTrigger></TabsList>
        <TabsContent value="customer"><div className="two-col"><div className="panel"><span className="step">01 / FILE INCIDENT</span><h3>Claim an outage</h3><p>Your wallet must be enrolled by the provider. Enter the actual incident interval.</p><form onSubmit={onForm("claim",["start","end"],a=>a.map(seconds))}><label>Outage began (local time)<Input name="start" type="datetime-local" required/></label><label>Service restored (local time)<Input name="end" type="datetime-local" required/></label><Button disabled={busy||!config}>Submit claim <ArrowUpRight size={16}/></Button></form></div><div className="panel"><span className="step">02 / SUBMIT PROOF</span><h3>Attach public evidence</h3><p>Provide an immutable HTTPS source and the SHA-256 of its exact response bytes. Each party has two slots.</p><form onSubmit={onForm("submit_evidence",["id","url","sha256","label"],a=>[Number(a[0]),...a.slice(1)])}><label>Claim ID<Input name="id" type="number" min="1" required/></label><label>Public HTTPS URL<Input name="url" type="url" placeholder="https://…" required/></label><label>SHA-256 digest<Input name="sha256" pattern="[0-9a-f]{64}" placeholder="64 lowercase hex characters" required/></label><label>Evidence label<Input name="label" maxLength={100} placeholder="Monitoring timeline" required/></label><label>Calculate digest from a file<Input type="file" onChange={e=>void hashFile(e.target.files?.[0])}/></label><Button disabled={busy||!config}>Commit evidence</Button></form></div></div></TabsContent>
        <TabsContent value="provider"><div className="two-col"><div className="panel"><span className="step">PROVIDER / ENROLL</span><h3>Enroll a customer</h3><p>The monthly credit base is immutable for this address. Credit tiers are percentages of this base.</p><form onSubmit={onForm("enroll",["customer","base"],a=>[a[0],amount(a[1])])}><label>Customer wallet<Input name="customer" pattern="0x[a-fA-F0-9]{40}" required placeholder="0x…"/></label><label>Monthly credit base (GEN)<Input name="base" type="number" min="0.000001" step="0.000001" required/></label><Button disabled={busy||!config}>Enroll customer</Button></form></div><div className="panel"><span className="step">PROVIDER / FUND</span><h3>Fund the credit pool</h3><p>Only the provider can fund the pool. Approved claims reserve their credits before withdrawal.</p><form onSubmit={e=>{e.preventDefault();try{void write("fund",[],amount(String(new FormData(e.currentTarget).get("amount"))));}catch(err){setMessage((err as Error).message);}}}><label>Deposit (GEN)<Input name="amount" type="number" min="0.000001" step="0.000001" required/></label><Button disabled={busy||!config}>Fund pool</Button></form><div className="pool"><span>Available pool</span><strong>{config?gen(config.pool_wei):"—"} <small>GEN</small></strong></div></div></div></TabsContent>
        <TabsContent value="review"><div className="two-col"><div className="panel"><span className="step">CASE FILE / LOOKUP</span><h3>Inspect a claim</h3><form onSubmit={e=>{e.preventDefault();void lookup();}}><label>Claim ID<Input value={claimId} onChange={e=>setClaimId(e.target.value)} type="number" min="1" required/></label><Button disabled={!config}>Load finalized claim</Button></form>{claim&&<div className="case"><span className="status">{claim.status.replaceAll("_"," ")}</span><dl><div><dt>Customer</dt><dd>{short(claim.customer)}</dd></div><div><dt>Incident</dt><dd>{date(claim.incident_start)} – {date(claim.incident_end)}</dd></div><div><dt>Response closes</dt><dd>{date(claim.response_deadline)}</dd></div><div><dt>Covered duration</dt><dd>{claim.covered_minutes} min</dd></div><div><dt>Credit</dt><dd>{gen(claim.payout_wei)} GEN ({claim.credit_bps/100}%)</dd></div><div><dt>Reason</dt><dd>{claim.reason||"Awaiting review"}</dd></div></dl>{evidence.map((x,i)=><div className="evidence" key={i}><FileCheck2 size={16}/><div>{x.label}<small><a href={x.url} target="_blank" rel="noreferrer">{x.url} ↗</a><br/>SHA-256 {x.sha256.slice(0,16)}… · {short(x.owner)}</small></div></div>)}</div>}</div><div className="panel"><span className="step">CASE FILE / ACTIONS</span><h3>Resolve and withdraw</h3><p>Both parties get the full response window. Changed, missing, or conflicting sources block approval.</p><div className="actions"><Button variant="outline" disabled={busy||!claim||!["OPEN","BLOCKED"].includes(claim.status)||Date.now()/1000<=claim.response_deadline} onClick={()=>void write("resolve",[Number(claimId)])}>Run evidence review</Button><Button disabled={busy||!claim||claim.status!=="APPROVED"} onClick={()=>void write("withdraw",[Number(claimId)])}>Withdraw approved credit</Button></div><div className="caution">Withdrawal queues a finalization message. Verify delivery in the transaction record; “payment queued” is not a confirmed transfer.</div></div></div></TabsContent>
      </Tabs>
    </section><aside className="info"><div className="eyebrow">LIVE AGREEMENT</div><h3>Committed terms</h3>{config?<><div className="agreement"><div><span>Claim window</span><b>{config.deadline_days} days</b></div><div><span>Evidence response</span><b>{config.response_hours} hours</b></div><div><span>Minimum outage</span><b>{config.minimum_minutes} min</b></div><div><span>Credit tiers</span><b>{config.tier1_bps/100}% · {config.tier2_bps/100}% · {config.tier3_bps/100}%</b></div><div><span>Tier boundaries</span><b>{config.tier1_minutes} / {config.tier2_minutes} min</b></div></div><div className="terms"><div className="eyebrow">SLA TEXT</div><p>{config.terms}</p></div><div className="hash">SLA SHA-256<code>{config.terms_sha256}</code></div><div className="hash">STATUS SOURCE<a href={config.status_url} target="_blank" rel="noreferrer">{config.status_url}</a><code>{config.status_sha256}</code></div><small>Provider {short(config.provider)} · {config.next_claim_id-1} claim(s)</small></>:<div className="empty"><FileCheck2 size={27}/><p>Agreement details appear when a contract is loaded.</p></div>}<div className="info-end">Every source must be reachable and byte-for-byte unchanged at resolution. <a href="https://docs.genlayer.com/developers/intelligent-contracts/features/web-access" target="_blank" rel="noreferrer">Verification details ↗</a></div></aside></div>
    <footer>UPTIME<span>CREDIT</span><small>Consensus checks the facts. Code controls the credit.</small><a href="https://github.com/haris4587/UptimeCredit" target="_blank" rel="noreferrer">Source code ↗</a></footer>
  </main>;
}
