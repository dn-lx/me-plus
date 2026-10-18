-- Only for the disposable database, never hosted deployment.
ALTER TABLE cron.job ADD COLUMN schedule text;
INSERT INTO cron.job(jobid,jobname,active,command,schedule) VALUES(4,'meplus2-native-routines',true,'SELECT private.run_meplus_native_scheduler();','0,30 4-20 * * *');
