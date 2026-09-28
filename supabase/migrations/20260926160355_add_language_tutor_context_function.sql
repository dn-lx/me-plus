create or replace function public.get_language_tutor_context(p_language_code text default 'es')
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  with lp as (
    select p.*
    from public.language_profiles p
    where p.user_id = (select auth.uid())
      and p.language_code = lower(p_language_code)
      and p.active = true
    limit 1
  )
  select case when not exists (select 1 from lp) then null else jsonb_build_object(
    'profile', (
      select jsonb_build_object(
        'id', p.id,
        'language_code', p.language_code,
        'display_name', p.display_name,
        'overall_cefr', p.overall_cefr,
        'target_cefr', p.target_cefr,
        'support_language_code', p.support_language_code,
        'display_mode', p.display_mode,
        'preferred_variant', p.preferred_variant,
        'settings', p.settings
      ) from lp p
    ),
    'skill', (
      select jsonb_build_object(
        'id', s.id,
        'name', s.name,
        'current_level', s.current_level,
        'desired_outcome', s.desired_outcome,
        'metadata', s.metadata
      )
      from public.skills s join lp p on p.skill_id=s.id
      where s.user_id=(select auth.uid())
    ),
    'subskills', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', ss.id,
        'name', ss.name,
        'current_level', ss.current_level,
        'priority', ss.priority,
        'progression_criteria', ss.progression_criteria
      ) order by ss.priority, ss.name)
      from public.subskills ss join lp p on ss.skill_id=p.skill_id
      where ss.user_id=(select auth.uid())
    ), '[]'::jsonb),
    'recent_assessments', coalesce((
      select jsonb_agg(x.obj order by x.assessed_at desc)
      from (
        select a.assessed_at,
               jsonb_build_object(
                 'id', a.id,
                 'subskill_id', a.subskill_id,
                 'assessor_type', a.assessor_type,
                 'assessed_at', a.assessed_at,
                 'level_text', a.level_text,
                 'level_number', a.level_number,
                 'scale', a.scale,
                 'confidence', a.confidence,
                 'evidence', a.evidence,
                 'note', a.note
               ) as obj
        from public.skill_assessments a join lp p on a.skill_id=p.skill_id
        where a.user_id=(select auth.uid())
        order by a.assessed_at desc
        limit 20
      ) x
    ), '[]'::jsonb),
    'due_review_items', coalesce((
      select jsonb_agg(x.obj order by x.sort_time nulls first)
      from (
        select st.next_review_at as sort_time,
               jsonb_build_object(
                 'item_id', i.id,
                 'item_type', i.item_type,
                 'content', i.content,
                 'meaning', i.meaning,
                 'cefr_level', i.cefr_level,
                 'topic', i.topic,
                 'learning_stage', st.learning_stage,
                 'mastery_score', st.mastery_score,
                 'times_tested', st.times_tested,
                 'correct_count', st.correct_count,
                 'incorrect_count', st.incorrect_count,
                 'next_review_at', st.next_review_at
               ) as obj
        from public.language_item_state st
        join public.language_items i on i.id=st.item_id
        join lp p on p.id=st.language_profile_id
        where st.user_id=(select auth.uid())
          and i.user_id=(select auth.uid())
          and st.suspended=false
          and (st.next_review_at is null or st.next_review_at <= now())
        order by st.next_review_at nulls first, st.mastery_score asc
        limit 30
      ) x
    ), '[]'::jsonb),
    'active_mistakes', coalesce((
      select jsonb_agg(x.obj order by x.last_seen_at desc)
      from (
        select m.last_seen_at,
               jsonb_build_object(
                 'id', m.id,
                 'subskill_id', m.subskill_id,
                 'error_type', m.error_type,
                 'error_key', m.error_key,
                 'description', m.description,
                 'example_incorrect', m.example_incorrect,
                 'example_correct', m.example_correct,
                 'occurrence_count', m.occurrence_count,
                 'status', m.status,
                 'severity', m.severity,
                 'confidence', m.confidence,
                 'next_review_at', m.next_review_at,
                 'last_seen_at', m.last_seen_at
               ) as obj
        from public.language_mistakes m join lp p on p.id=m.language_profile_id
        where m.user_id=(select auth.uid())
          and m.status in ('active','improving','monitor')
        order by m.last_seen_at desc
        limit 20
      ) x
    ), '[]'::jsonb),
    'recent_attempts', coalesce((
      select jsonb_agg(x.obj order by x.attempted_at desc)
      from (
        select a.attempted_at,
               jsonb_build_object(
                 'id', a.id,
                 'subskill_id', a.subskill_id,
                 'item_id', a.item_id,
                 'attempt_type', a.attempt_type,
                 'response_text', a.response_text,
                 'corrected_response', a.corrected_response,
                 'is_correct', a.is_correct,
                 'score', a.score,
                 'feedback', a.feedback,
                 'attempted_at', a.attempted_at
               ) as obj
        from public.language_attempts a join lp p on p.id=a.language_profile_id
        where a.user_id=(select auth.uid())
        order by a.attempted_at desc
        limit 30
      ) x
    ), '[]'::jsonb),
    'recent_sessions', coalesce((
      select jsonb_agg(x.obj order by x.started_at desc)
      from (
        select ps.started_at,
               jsonb_build_object(
                 'id', ps.id,
                 'started_at', ps.started_at,
                 'ended_at', ps.ended_at,
                 'duration_minutes', ps.duration_minutes,
                 'perceived_difficulty', ps.perceived_difficulty,
                 'performance', ps.performance,
                 'note', ps.note
               ) as obj
        from public.practice_sessions ps join lp p on p.skill_id=ps.skill_id
        where ps.user_id=(select auth.uid())
        order by ps.started_at desc
        limit 10
      ) x
    ), '[]'::jsonb)
  ) end
  from lp
  limit 1;
$$;

revoke execute on function public.get_language_tutor_context(text) from public, anon;
grant execute on function public.get_language_tutor_context(text) to authenticated;
