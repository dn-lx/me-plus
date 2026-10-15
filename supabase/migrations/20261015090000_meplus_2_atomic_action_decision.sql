-- Apply through the reviewed Supabase migration pipeline, not manually in production.
create or replace function public.record_meplus_action_decision(p_action_id uuid,p_decision text)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare v_user uuid:=auth.uid(); v_action public.actions%rowtype; v_now timestamptz:=clock_timestamp();
begin
 if v_user is null then raise exception 'authentication required' using errcode='28000'; end if;
 if p_decision not in ('completed','partial','skipped') then raise exception 'invalid decision' using errcode='22023'; end if;
 select * into v_action from public.actions where id=p_action_id and user_id=v_user for update;
 if not found then raise exception 'action unavailable' using errcode='P0002'; end if;
 if v_action.status not in ('available','planned','in_progress','partial') then raise exception 'action not open' using errcode='22023'; end if;
 update public.actions set status=p_decision,updated_at=v_now where id=p_action_id and user_id=v_user;
 insert into public.action_events(user_id,action_id,event_type,occurred_at,reason_code,metadata)
 values(v_user,p_action_id,p_decision,v_now,'meplus_web_ui',jsonb_build_object('source','meplus_2_today','version',1));
 return jsonb_build_object('ok',true,'action_id',p_action_id,'status',p_decision);
end $$;
revoke all on function public.record_meplus_action_decision(uuid,text) from public,anon;
grant execute on function public.record_meplus_action_decision(uuid,text) to authenticated;