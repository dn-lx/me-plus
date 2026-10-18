"""Isolated PostgreSQL fixture only: force an FK commit after candidate snapshot.

Uses psql and inherited PG* settings; never supplies database credentials. The
workflow must have installed the compaction fixture and concurrency follow-up.
"""

import argparse
import json
import os
import subprocess
import time
import uuid


PSQL = ["psql", "-X", "-qAt", "-v", "ON_ERROR_STOP=1"]
RUN = uuid.uuid4().hex[:12]


def connection_env(app):
    env = os.environ.copy()
    env["PGAPPNAME"] = app
    env["PGCONNECT_TIMEOUT"] = "5"
    env["PGOPTIONS"] = (env.get("PGOPTIONS", "") +
                        " -c statement_timeout=20000 -c lock_timeout=15000").strip()
    return env


def sql(query, *, allow_error=False):
    result = subprocess.run(
        PSQL + ["-c", query], env=connection_env("compact_race_control_" + RUN),
        text=True, capture_output=True, timeout=25, check=False,
    )
    if result.returncode and not allow_error:
        raise RuntimeError("Fixture SQL failed: " + result.stderr.strip())
    return result


def wait_for(predicate, message, processes=()):
    deadline = time.monotonic() + 10
    while time.monotonic() < deadline:
        for process in processes:
            if process.poll() is not None:
                out, err = process.communicate()
                raise RuntimeError(message + ": session exited: " + out + err)
        if predicate():
            return
        time.sleep(0.1)
    raise TimeoutError(message)


def terminate_session(app, process):
    # Only backend sessions created by this randomly named isolated test run.
    try:
        sql("select pg_terminate_backend(pid) from pg_stat_activity "
            f"where application_name='{app}' and pid<>pg_backend_pid()", allow_error=True)
    except (subprocess.TimeoutExpired, OSError):
        # Continue cleanup: client closure and configured server timeouts also
        # bound failed sessions; helper restoration must still be attempted.
        if process is not None and process.poll() is None:
            process.kill()
    if process is not None:
        try:
            process.communicate(timeout=5)
        except subprocess.TimeoutExpired:
            process.kill()
            process.communicate(timeout=5)


def reference_race(kind, barrier, expect_unsafe):
    observation = kind == "observation"
    guard = ("health_observation_has_references" if observation
             else "health_raw_has_other_references")
    original = "test_original_" + guard
    label = "concurrent-reference-" + kind + "-" + RUN
    child = "compact_race_" + kind + "_child"
    app_a, app_b = f"compact_race_a_{kind}_{RUN}", f"compact_race_b_{kind}_{RUN}"
    compactor = holder = None
    renamed = False
    try:
        target = json.loads(sql(f"""
            do $$begin perform public.compact_test_ingest('{label}',77);end $$;
            select json_build_object('observation',o.id,'raw',r.id,'source',r.data_source_id,'owner',r.user_id)
            from public.observations o join public.raw_events r on r.id=o.raw_event_id
            where r.external_record_id='{label}';
        """).stdout.strip())
        observation_id = str(uuid.UUID(target["observation"]))
        raw_id = str(uuid.UUID(target["raw"]))
        source_id = str(uuid.UUID(target["source"]))
        owner_id = str(uuid.UUID(target["owner"]))
        target_id = observation_id if observation else raw_id
        parent = "observations" if observation else "raw_events"
        sql(f"create table public.{child}(parent_id uuid references public.{parent}(id) on delete cascade)")
        sql(f"alter function private.{guard}(uuid) rename to {original}")
        renamed = True
        # Cache the original false result BEFORE waiting: even if PostgreSQL
        # reevaluates functions later, this first invocation must return false.
        sql(f"""
            create function private.{guard}(p_id uuid) returns boolean
            language plpgsql stable security invoker set search_path='' as $$
            declare cached boolean;
            begin
              cached:=private.{original}(p_id);
              if p_id='{target_id}'::uuid then
                perform pg_catalog.pg_advisory_xact_lock({barrier}::bigint);
              end if;
              return cached;
            end $$;
        """)
        holder = subprocess.Popen(PSQL, env=connection_env(app_b), text=True,
                                  stdin=subprocess.PIPE, stdout=subprocess.PIPE,
                                  stderr=subprocess.PIPE)
        holder.stdin.write(f"select pg_advisory_lock({barrier}::bigint);\n")
        holder.stdin.flush()
        wait_for(lambda: sql(f"""
            select exists(select 1 from pg_stat_activity a join pg_locks l on l.pid=a.pid
              where a.application_name='{app_b}' and l.locktype='advisory' and l.granted);
        """).stdout.strip() == "t", "Barrier holder did not acquire lock", (holder,))
        compactor = subprocess.Popen(
            PSQL + ["-c", "select private.compact_health_seven_days();"],
            env=connection_env(app_a), text=True, stdout=subprocess.PIPE, stderr=subprocess.PIPE,
        )
        wait_for(lambda: sql(f"""
            select exists(select 1 from pg_stat_activity a join pg_stat_activity b
              on b.pid=any(pg_blocking_pids(a.pid))
              where a.application_name='{app_a}' and b.application_name='{app_b}'
                and a.wait_event_type='Lock' and lower(a.wait_event)='advisory');
        """).stdout.strip() == "t", "Candidate guard did not reach barrier", (compactor, holder))
        # A is paused inside the original candidate SELECT, before parent row
        # locking. This separate connection commits an otherwise cascading FK.
        sql(f"insert into public.{child}(parent_id) values('{target_id}'::uuid)")
        holder.stdin.write(f"select pg_advisory_unlock({barrier}::bigint);\n\\q\n")
        holder.stdin.flush()
        holder_out, holder_err = holder.communicate(timeout=5)
        if holder.returncode:
            raise RuntimeError("Barrier release failed: " + holder_out + holder_err)
        out, err = compactor.communicate(timeout=25)
        if compactor.returncode:
            raise RuntimeError("Compactor failed: " + out + err)
        result = json.loads(out.strip())
        if result.get("failed_sources") != 0:
            raise AssertionError("Compaction source failed instead of preserving references")
        survived = json.loads(sql(f"""
            select json_build_object(
              'raw',exists(select 1 from public.raw_events where id='{raw_id}'::uuid),
              'observation',exists(select 1 from public.observations where id='{observation_id}'::uuid),
              'child',exists(select 1 from public.{child} where parent_id='{target_id}'::uuid),
              'packed',exists(select 1 from private.health_compaction_receipts receipt
                where receipt.user_id='{owner_id}'::uuid and receipt.data_source_id='{source_id}'::uuid
                  and receipt.entries ? encode(sha256(convert_to(
                    '{source_id}:{label}','UTF8')),'hex')));
        """).stdout.strip())
        expected = {"raw": not expect_unsafe, "observation": not expect_unsafe,
                    "child": not expect_unsafe, "packed": expect_unsafe}
        if survived != expected:
            raise AssertionError(f"Unexpected {kind} race state: {survived}; expected {expected}")
        outcome = "baseline cascade loss reproduced" if expect_unsafe else "reference preserved"
        print(f"PASS: concurrent {kind} {outcome}", flush=True)
    finally:
        # End both sessions before restoring functions, including timeout paths.
        terminate_session(app_b, holder)
        terminate_session(app_a, compactor)
        if renamed:
            sql(f"drop function if exists private.{guard}(uuid); "
                f"alter function private.{original}(uuid) rename to {guard}")
        # Keep protected target facts but remove the test-only FK surface.
        sql(f"drop table if exists public.{child}")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--expect-unsafe", action="store_true",
                        help="Require the original migration's exact cascade-loss failure")
    args = parser.parse_args()
    if os.environ.get("PGHOST") != "127.0.0.1" or os.environ.get("PGDATABASE") != "health_compact_test":
        raise RuntimeError("This race fixture requires the isolated CI PostgreSQL database")
    if not args.expect_unsafe:
        isolation = sql("begin isolation level repeatable read; "
                        "select private.compact_health_seven_days(); rollback;", allow_error=True)
        if isolation.returncode == 0 or "unsupported_compaction_isolation" not in isolation.stderr:
            raise AssertionError("REPEATABLE READ compaction must fail unsupported_compaction_isolation")
        print("PASS: unsupported transaction isolation rejected", flush=True)
    reference_race("observation", 73492845101, args.expect_unsafe)
    reference_race("raw", 73492845102, args.expect_unsafe)


if __name__ == "__main__":
    main()
