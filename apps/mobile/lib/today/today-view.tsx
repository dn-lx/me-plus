import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Image, Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { Link } from 'expo-router';
import { supabase } from '../supabase/client';
import { saveCaptureNote } from '../capture-note';
import { cancelHealthSync } from '../health/automatic-health-sync';
import { stopBackgroundHealthSync } from '../health/background-health-sync';
import type { ActionDecisionResult, ActionDecisionType, TodayAction, TodayState } from './types';

type Tab = 'Today' | 'Plan' | 'Capture' | 'Review' | 'More';
type Props = { state: TodayState; onRefresh: () => Promise<unknown>; onSignIn: (email: string, password: string) => Promise<{ok:boolean;message:string}>;
  onSignOut: () => Promise<{ok:boolean;message:string}>; onDecision: (id:string,decision:ActionDecisionType) => Promise<ActionDecisionResult> };
const tabs: Tab[] = ['Today','Plan','Capture','Review','More'];
const c = { ink:'#152d3a',muted:'#526875',line:'#e0e8eb',bg:'#f4f7f9',blue:'#2464d9',blueSoft:'#edf3ff',teal:'#087d69',tealSoft:'#eaf7f1' };
const time = (value: string | null) => value && Number.isFinite(Date.parse(value)) ? new Date(value).toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'}) : 'Flexible';

function Button({children,onPress,secondary=false,disabled=false}:{children:string;onPress:()=>void;secondary?:boolean;disabled?:boolean}) {
  return <Pressable accessibilityRole="button" disabled={disabled} onPress={onPress} style={[s.button,secondary&&s.secondary,disabled&&{opacity:.5}]}>
    <Text style={[s.buttonText,secondary&&{color:c.ink}]}>{children}</Text>
  </Pressable>;
}
function Card({title,children}:{title?:string;children:React.ReactNode}) { return <View style={s.card}>{title?<Text style={s.cardTitle}>{title}</Text>:null}{children}</View>; }
function Body({children}:{children:React.ReactNode}) { return <Text style={s.body}>{children}</Text>; }

export function TodayView({state,onRefresh,onSignIn,onSignOut,onDecision}:Props) {
  const [tab,setTab]=useState<Tab>('Today'); const [selected,setSelected]=useState<TodayAction|null>(null);
  const [email,setEmail]=useState('');const [password,setPassword]=useState('');const [message,setMessage]=useState('');const [busy,setBusy]=useState(false);
  const ownerRef=useRef(state.userId);ownerRef.current=state.userId;
  useEffect(()=>{setSelected(null);setMessage('');setPassword('');},[state.userId]);
  const connected=Boolean(state.userId);const ready=state.status==='ready'&&!state.isStale;const action=state.nowAction;
  const greeting=tab==='Today'?'A little progress. More room to live.':tab==='Plan'?'A day with breathing room':tab==='Capture'?'Make room for a thought':tab==='Review'?'See what actually happened':'Your space, your controls';
  async function login() {setBusy(true);const result=await onSignIn(email.trim(),password);setMessage(result.message);if(result.ok)setPassword('');setBusy(false);}
  async function disconnect() {setBusy(true);try{cancelHealthSync();await stopBackgroundHealthSync();const result=await onSignOut();setMessage(result.message);}catch{setMessage('Could not disconnect. Please retry.');}finally{setBusy(false);}}
  async function decide(decision:ActionDecisionType) {if(!selected)return;setMessage('Saving — waiting for confirmation…');const owner=state.userId;const result=await onDecision(selected.id,decision);if(ownerRef.current!==owner)return;setMessage(result.message);if(result.ok)setSelected(null);}
  function row(a:TodayAction) {return <Pressable key={a.id} accessibilityRole="button" accessibilityLabel={`View action: ${a.title}`} onPress={()=>{setMessage('');setSelected(a);}} style={s.actionRow}>
    <View style={s.actionIcon}><Text style={{fontSize:21,color:c.blue}}>›</Text></View><View style={{flex:1}}><Text style={s.actionTitle}>{a.title}</Text><Text style={s.small}>{a.instructions?.slice(0,110)||'Open for details'} · {a.estimated_minutes??'—'} min</Text></View><Text style={s.tag}>{time(a.due_at)}</Text>
  </Pressable>;}
  return <View style={s.screen}>
    <ScrollView contentContainerStyle={s.page} keyboardShouldPersistTaps="handled">
      <View style={s.header}><View style={s.brandRow}><Image source={require('../../../../brand/companion/android/launcher-1024.png')} style={s.brandIcon}/><Text style={s.brand}>Me <Text style={{color:c.blue}}>+</Text></Text></View>
        <Pressable accessibilityRole="button" accessibilityLabel="Refresh current data" disabled={busy||state.status==='loading'} onPress={()=>{void onRefresh();}} style={s.iconButton}><Text style={{fontSize:22,color:c.ink}}>↻</Text></Pressable></View>
      <Text style={s.eyebrow}>{new Date().toLocaleDateString([], {weekday:'long',day:'numeric',month:'long'})} · {new Date().toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'})}</Text>
      <Text style={s.title}>{greeting}</Text><Body>{tab==='Today'?'Choose one useful next action. Leave some space in your day.':tab==='Plan'?'Keep commitments visible and flexible work genuinely flexible.':tab==='Capture'?'A note stays a note. It does not silently become a task.':tab==='Review'?'Recorded decisions, grounded in your own history.':'Manage your account, health sources and privacy.'}</Body>
      {!connected?<Card title="Welcome to Me+"><Body>Connect your account to load your plan and keep your devices together.</Body>
        <TextInput accessibilityLabel="Me+ email" autoCapitalize="none" autoComplete="email" keyboardType="email-address" placeholder="Email" placeholderTextColor={c.muted} value={email} onChangeText={setEmail} style={s.input}/>
        <TextInput accessibilityLabel="Me+ password" autoCapitalize="none" autoComplete="password" placeholder="Password" placeholderTextColor={c.muted} secureTextEntry value={password} onChangeText={setPassword} style={s.input}/>
        <Button disabled={busy||!email.trim()||!password} onPress={()=>{void login();}}>Sign in</Button>
      </Card>:null}
      {state.status==='loading'?<Card><ActivityIndicator color={c.blue}/><Body>Loading current state…</Body></Card>:null}
      {state.errorMessage?<Card title="Your data needs attention"><Body>{state.errorMessage}</Body><Button secondary onPress={()=>{void onRefresh();}}>Try again</Button></Card>:null}
      {state.isStale?<Card title="Showing an earlier snapshot"><Body>Refresh before changing an action. Cached information is not a new server confirmation.</Body></Card>:null}
      {message?<Text accessibilityRole="alert" accessibilityLiveRegion="polite" style={s.notice}>{message}</Text>:null}
      {connected&&tab==='Today'?<>
        <View style={s.nextCard}><Text style={[s.eyebrow,{color:'#21748b'}]}>NEXT USEFUL ACTION{action?` · ${action.priority.toUpperCase()}`:''}</Text>
          <Text style={s.nextTitle}>{action?.title??(state.calendarUnavailable?'Check your calendar first':'Leave some room in your day')}</Text>
          <Body>{action?.instructions??(state.calendarUnavailable?'Calendar information is unavailable, so Me+ cannot confidently suggest a free window.':'No eligible action fits the current window. Free time is not a backlog to fill.')}</Body>
          {action?<View style={s.buttonRow}><Button disabled={!ready} onPress={()=>setSelected(action)}>View action</Button><Text style={s.small}>{action.estimated_minutes??'—'} minutes</Text></View>:null}
        </View>
        <Card title="Today, kept small"><Text style={s.metric}>{state.actions.length}<Text style={s.small}> open actions in this snapshot</Text></Text>
          {(['must','should','bonus']as const).map(priority=><View key={priority}><Text style={s.group}>{priority==='must'?'MUST · ESSENTIALS':priority==='should'?'SHOULD · MEANINGFUL PROGRESS':'BONUS · ENTIRELY OPTIONAL'}</Text>{state.actions.filter(a=>a.priority===priority).map(row)}{!state.actions.some(a=>a.priority===priority)?<Text style={s.small}>Nothing open in this group.</Text>:null}</View>)}
        </Card>
        <Card title="Room in your day"><Text style={s.metric}>{state.minutesAvailable===null?'—':state.minutesAvailable}<Text style={s.small}> minutes in the current window</Text></Text><Body>{state.busyNow?'You are in a calendar commitment.':state.calendarUnavailable?'Calendar availability is not confirmed.':'Leave a little space. A free window is permission to rest.'}</Body><Button secondary onPress={()=>setTab('Plan')}>Open plan</Button></Card>
        {state.guidance.length?<Card title="A little context">{state.guidance.map(g=><View key={g.id} style={s.guidance}><Text style={s.actionTitle}>{g.title}</Text><Body>{g.rationale??'No rationale supplied.'}</Body><Text style={s.small}>Generated {time(g.generated_at)} · source guidance</Text></View>)}</Card>:null}
        <Card title="How are you feeling?"><Body>Capture a thought or a check-in. Share only what would help today.</Body><Button secondary onPress={()=>setTab('Capture')}>Add a note</Button></Card>
      </>:null}
      {connected&&tab==='Plan'?<><Card title="Your current actions">{state.actions.length?state.actions.slice().sort((a,b)=>(a.due_at??'9999').localeCompare(b.due_at??'9999')).map(row):<Body>No open actions in the current snapshot.</Body>}</Card><Card title="Capacity, not a quota"><Body>{state.calendarUnavailable?'Calendar data could not be verified. No free-time estimate is shown.':state.busyNow?'A calendar commitment is in progress.':'The next suggestion respects the current calendar window.'}</Body><Body>Task dates describe a plan. They are not evidence that work happened.</Body></Card></>:null}
      {connected&&tab==='Capture'?<Capture key={state.userId} owner={state.userId!}/>:null}
      {connected&&tab==='Review'?<Review owner={state.userId!}/>:null}
      {tab==='More'?<><Card title="Health & sources"><Body>Connect this phone, inspect source provenance, and enable three-hour sync with a rolling-day recovery window.</Body><Link href="/health-connect" asChild><Pressable accessibilityRole="link" style={s.button}><Text style={s.buttonText}>Health & automatic sync</Text></Pressable></Link></Card><Card title="Your account"><Body>{state.userEmail??'Not connected'}</Body>{connected?<Button disabled={busy} secondary onPress={()=>{void disconnect();}}>Disconnect this phone</Button>:null}<Text style={s.small}>Me+ 0.4.1 · development build</Text></Card><Card title="About your records"><Body>Supabase keeps canonical state. Repeated health uploads retain source identity and provider revisions; duplicate readings do not become extra observations.</Body></Card></>:null}
      <Text style={s.footer}>{state.refreshedAt?`Last loaded ${new Date(state.refreshedAt).toLocaleString()}`:'No current personal snapshot loaded.'} · Health measurements and task results remain separate.</Text>
    </ScrollView>
    <View style={s.nav}>{tabs.map((name,i)=><Pressable key={name} accessibilityRole="tab" accessibilityLabel={name} accessibilityState={{selected:tab===name}} onPress={()=>{setMessage('');setTab(name);}} style={[s.navItem,tab===name&&s.navSelected]}><Text style={[s.navIcon,tab===name&&{color:c.blue}]}>{['⌂','▤','＋','▥','•••'][i]}</Text><Text style={[s.navLabel,tab===name&&{color:c.blue}]}>{name}</Text></Pressable>)}</View>
    <Modal visible={selected!==null} onRequestClose={()=>setSelected(null)} animationType="slide" presentationStyle="pageSheet"><ScrollView contentContainerStyle={s.detail}>
      <Button secondary disabled={state.submittingActionId!==null} onPress={()=>setSelected(null)}>Back to Today</Button><Text style={s.eyebrow}>YOUR ACTION · {selected?.priority.toUpperCase()}</Text><Text style={s.title}>{selected?.title}</Text><Text style={s.tag}>{selected?.estimated_minutes??'—'} minutes · {time(selected?.due_at??null)}</Text><Card title="What to do"><Body>{selected?.instructions??'No additional instructions supplied.'}</Body></Card>
      <Card title="Record what actually happened"><Body>Only confirm work you did. A timer or a scheduled task is not completion evidence.</Body><Button disabled={!ready||state.submittingActionId!==null} onPress={()=>{void decide('completed');}}>I completed this action</Button><Button secondary disabled={!ready||state.submittingActionId!==null} onPress={()=>{void decide('partial');}}>Record partial work</Button><Button secondary disabled={!ready||state.submittingActionId!==null} onPress={()=>{void decide('skipped');}}>Skip intentionally</Button></Card>
      {state.submittingActionId?<ActivityIndicator color={c.blue}/>:null}{message?<Text accessibilityLiveRegion="polite" style={s.notice}>{message}</Text>:null}
    </ScrollView></Modal>
  </View>;
}

function Capture({owner}:{owner:string}) {
  const [text,setText]=useState('');const [status,setStatus]=useState('');const [busy,setBusy]=useState(false);
  const pending=useRef<{id:string;text:string}|null>(null);const ownerRef=useRef(owner);const operation=useRef(0);const saving=useRef(false);if(ownerRef.current!==owner){operation.current+=1;saving.current=false;}ownerRef.current=owner;
  useEffect(()=>{ownerRef.current=owner;setText('');setStatus('');setBusy(false);pending.current=null;return()=>{ownerRef.current='';operation.current+=1;saving.current=false;};},[owner]);
  async function save(){if(saving.current)return;saving.current=true;const ticket=++operation.current;setBusy(true);setStatus('Saving — waiting for confirmation…');const current=owner;
    if(!pending.current||pending.current.text!==text)pending.current={id:globalThis.crypto?.randomUUID?.()??'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g,ch=>{const n=Math.random()*16|0;return(ch==='x'?n:(n&3|8)).toString(16);}),text};
    try{await saveCaptureNote(supabase,owner,pending.current.id,text);if(ownerRef.current!==current||operation.current!==ticket)return;setText('');pending.current=null;setStatus('Note saved and confirmed.');}catch(e){if(ownerRef.current===current&&operation.current===ticket)setStatus(e instanceof Error?e.message:'Not confirmed. Keep your draft.');}finally{if(ownerRef.current===current&&operation.current===ticket){saving.current=false;setBusy(false);}}}
  return <Card title="Capture a note"><Body>Write something you want to remember. Nothing is marked complete or turned into a task.</Body><TextInput accessibilityLabel="Your note" multiline maxLength={8000} value={text} onChangeText={setText} editable={!busy} placeholder="What is on your mind?" placeholderTextColor={c.muted} style={[s.input,{minHeight:150,textAlignVertical:'top'}]}/><Button disabled={busy||!text.trim()} onPress={()=>{void save();}}>Save note</Button><Text accessibilityLiveRegion="polite" style={s.small}>{status}</Text></Card>;
}
function Review({owner}:{owner:string}) {
  const [loaded,setLoaded]=useState(false);const [events,setEvents]=useState<Array<{id:string;event_type:string;occurred_at:string}>>([]);const [status,setStatus]=useState('Loading recorded history…');
  useEffect(()=>{let active=true;setLoaded(false);setEvents([]);setStatus('Loading recorded history…');void(async()=>{try{const auth=await supabase.auth.getUser();if(auth.error||auth.data.user?.id!==owner)throw Error();const r=await supabase.from('action_events').select('id,event_type,occurred_at').eq('user_id',owner).gte('occurred_at',new Date(Date.now()-7*86_400_000).toISOString()).order('occurred_at',{ascending:false}).limit(200);if(r.error)throw Error();if(active){setLoaded(true);setEvents((r.data??[]).filter(e=>['completed','partial','skipped'].includes(e.event_type)));setStatus('Last seven days · latest 200 events.');}}catch{if(active)setStatus('Review unavailable. No records were changed.');}})();return()=>{active=false;};},[owner]);
  return <><Card title="Recorded decisions"><Body>{status}</Body><View style={s.buttonRow}>{['completed','partial','skipped'].map(kind=><View key={kind} style={s.stat}><Text style={s.metric}>{loaded?events.filter(e=>e.event_type===kind).length:'—'}</Text><Text style={s.small}>{kind}</Text></View>)}</View><Body>These are recorded events, not a completion percentage. Full/minimum distinctions are shown only when the server records them.</Body></Card><Card title="Recent history">{events.length?events.slice(0,20).map(e=><View key={e.id} style={s.actionRow}><Text style={[s.actionTitle,{flex:1}]}>{e.event_type}</Text><Text style={s.small}>{new Date(e.occurred_at).toLocaleString()}</Text></View>):<Body>{loaded?'No verified execution events in this window.':'History has not been loaded.'}</Body>}</Card></>;
}
const s=StyleSheet.create({
  screen:{flex:1,backgroundColor:c.bg},page:{padding:18,paddingTop:54,paddingBottom:30,gap:18,maxWidth:900,width:'100%',alignSelf:'center'},header:{flexDirection:'row',alignItems:'center',justifyContent:'space-between',marginBottom:10},brandRow:{flexDirection:'row',alignItems:'center',gap:10},brandIcon:{width:32,height:32,borderRadius:10},brand:{fontSize:25,fontWeight:'800',color:c.ink},iconButton:{minWidth:44,minHeight:44,alignItems:'center',justifyContent:'center',borderWidth:1,borderColor:c.line,borderRadius:13,backgroundColor:'#fff'},
  eyebrow:{fontSize:11,fontWeight:'700',letterSpacing:1.2,textTransform:'uppercase',color:c.muted},title:{fontSize:28,lineHeight:33,fontWeight:'700',letterSpacing:-.8,color:c.ink},body:{fontSize:14,lineHeight:22,color:c.muted},small:{fontSize:12,lineHeight:19,color:c.muted},card:{backgroundColor:'#fff',borderRadius:20,borderWidth:1,borderColor:c.line,padding:20,gap:16},cardTitle:{fontSize:18,fontWeight:'700',color:c.ink},nextCard:{backgroundColor:'#edf4ff',borderRadius:20,borderWidth:1,borderColor:'#d5e2ff',padding:22,gap:18},nextTitle:{fontSize:24,lineHeight:30,fontWeight:'700',color:c.ink},buttonRow:{flexDirection:'row',flexWrap:'wrap',alignItems:'center',gap:12},button:{minHeight:46,backgroundColor:c.blue,borderRadius:12,paddingHorizontal:18,paddingVertical:13,alignItems:'center',justifyContent:'center'},secondary:{backgroundColor:'#fff',borderWidth:1,borderColor:'#cfdde5'},buttonText:{color:'#fff',fontSize:14,fontWeight:'700'},input:{borderWidth:1,borderColor:'#cfdde5',borderRadius:12,padding:14,minHeight:48,color:c.ink,backgroundColor:'#fff',fontSize:15},metric:{fontSize:30,fontWeight:'700',color:c.ink},group:{fontSize:11,fontWeight:'700',letterSpacing:.8,color:c.muted,marginTop:16,marginBottom:9},actionRow:{flexDirection:'row',alignItems:'center',gap:12,paddingVertical:16,borderBottomWidth:1,borderBottomColor:'#edf0f3'},actionIcon:{width:38,height:38,borderRadius:12,backgroundColor:c.blueSoft,alignItems:'center',justifyContent:'center'},actionTitle:{fontSize:14,lineHeight:21,fontWeight:'700',color:c.ink},tag:{color:c.muted,fontSize:11,fontWeight:'600',backgroundColor:'#f0f4f6',paddingHorizontal:8,paddingVertical:4,borderRadius:6,maxWidth:95},guidance:{gap:8},notice:{backgroundColor:c.tealSoft,color:c.ink,borderRadius:12,padding:14,fontSize:14,lineHeight:22},footer:{fontSize:11,lineHeight:18,color:c.muted},nav:{flexDirection:'row',justifyContent:'space-around',paddingTop:8,paddingBottom:18,paddingHorizontal:6,borderTopWidth:1,borderTopColor:c.line,backgroundColor:'#fff'},navItem:{minHeight:52,minWidth:54,padding:7,borderRadius:14,alignItems:'center',justifyContent:'center',gap:3},navSelected:{backgroundColor:c.blueSoft},navIcon:{fontSize:23,color:c.muted},navLabel:{fontSize:10,color:c.muted},detail:{padding:24,paddingTop:64,paddingBottom:60,gap:22,backgroundColor:c.bg,flexGrow:1},stat:{flex:1,minWidth:75},
});
