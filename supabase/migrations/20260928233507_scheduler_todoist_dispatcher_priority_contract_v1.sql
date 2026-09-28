comment on function public.get_todoist_dispatch_actions(uuid) is
'Returns only canonical planned/in-progress actions explicitly referenced by a scheduler dispatch; unsurfaced actions are never recreated and linked actions are updated/removed rather than duplicated.';
