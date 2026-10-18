create index language_attempts_language_profile_idx on public.language_attempts(language_profile_id);
create index language_attempts_practice_session_idx on public.language_attempts(practice_session_id) where practice_session_id is not null;
create index language_attempts_subskill_idx on public.language_attempts(subskill_id) where subskill_id is not null;
create index language_attempts_item_idx on public.language_attempts(item_id) where item_id is not null;

create index language_item_state_language_profile_idx on public.language_item_state(language_profile_id);
create index language_item_state_item_idx on public.language_item_state(item_id);

create index language_items_subskill_idx on public.language_items(subskill_id) where subskill_id is not null;

create index language_mistakes_language_profile_idx on public.language_mistakes(language_profile_id);
create index language_mistakes_subskill_idx on public.language_mistakes(subskill_id) where subskill_id is not null;

create index skill_assessments_skill_idx on public.skill_assessments(skill_id);
create index skill_assessments_subskill_idx on public.skill_assessments(subskill_id) where subskill_id is not null;
create index skill_assessments_source_idx on public.skill_assessments(source_id) where source_id is not null;
